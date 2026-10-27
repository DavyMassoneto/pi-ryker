import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { type CycleConfig, type ModelChoice, parseCycleConfig } from "../core/cycleConfig.ts";
import { cancelQuestion, takeoverQuestion } from "../core/cycleMessages.ts";
import {
  configPath,
  cycleHistoryDir,
  cycleRecordPath,
  openCyclesIndexPath,
  planPath,
  projectHistoryDir,
  projectRykerDir,
  reviewPath,
  stageDirOfExecution,
} from "../core/cyclePaths.ts";
import {
  type CycleRecord,
  newCycleRecord,
  parseCycleRecord,
  serializeCycleRecord,
} from "../core/cycleRecord.ts";
import { ownerStatus, ownerWidget } from "../core/cycleView.ts";
import { createCycleId } from "../core/gitRefs.ts";
import { findGitRoot } from "../core/gitRoot.ts";
import { lockPath } from "../core/lock.ts";
import { cyclesTouching } from "../core/openCycles.ts";
import { createSessionRegistry } from "../core/sessionRegistry.ts";
import { agentShellEnv, type ShellContext } from "../core/shielding.ts";
import { stageEnvironmentDir } from "../core/stageEnvironment.ts";
import type { DiscussionState } from "../core/state.ts";
import {
  type AgentRunRequest,
  type AgentRunResult,
  runChildAgent,
  type TokenUsage,
} from "./agent.ts";
import { childGuardFactory } from "./childGuard.ts";
import {
  type CancelReason,
  createStageDriver,
  type DriverPorts,
  type StageDriver,
} from "./driver.ts";
import {
  addOpenCycle,
  controlFs,
  ensureExcluded,
  fileLockStore,
  readGitAliases,
  readOpenCycles,
  readText,
  removeFile,
  removeOpenCycle,
  writeAtomic,
} from "./fsAdapters.ts";
import { acquireLease, HEARTBEAT_MS, type Lease, type LeaseResult } from "./lease.ts";
import { registerLiveness } from "./liveness.ts";
import { DISCUSSION_FILE, moveVisionToCycle, VISION_FILE } from "./persistence.ts";
import { gitRepository, type RepositoryPort } from "./repository.ts";
import type { StageEnvironment } from "./stageEnvironment.ts";

export interface HostContext {
  cwd: string;
  hasUI: boolean;
  model: Model<Api> | undefined;
  ui: {
    setStatus(key: string, text: string | undefined): void;
    setWidget(key: string, content: string[] | undefined): void;
    notify(message: string, level?: "info" | "warning" | "error"): void;
    select?(title: string, options: string[]): Promise<string | undefined>;
    confirm?(title: string, message: string): Promise<boolean>;
    onTerminalInput?(
      handler: (data: string) => { consume?: boolean; data?: string } | undefined,
    ): () => void;
  };
  sessionManager: { getSessionId(): string; getSessionFile(): string | undefined };
  modelRegistry: { find(provider: string, id: string): Model<Api> | undefined };
}

export interface HostMessenger {
  sendMessage(
    message: { customType: string; content: string; display: boolean },
    options?: { triggerTurn?: boolean },
  ): void;
}

export interface HostDeps {
  agentDir: string;
  now(): number;
  heartbeatMs: number;
  runAgent(request: AgentRunRequest): Promise<AgentRunResult>;
  repository(gitRoot: string): RepositoryPort;
}

export const defaultHostDeps = (): HostDeps => ({
  agentDir: getAgentDir(),
  now: () => Date.now(),
  heartbeatMs: HEARTBEAT_MS,
  runAgent: (request) => runChildAgent(request),
  repository: gitRepository,
});

export interface CycleHandle {
  sessionId: string;
  directory: string;
  driver: StageDriver;
  running: Promise<void>;
  shutdown(): Promise<void>;
}

export const cycleHandles = createSessionRegistry<CycleHandle>();

export type StartResult = { ok: true; cycleId: string } | { ok: false; message: string };
export type TakeoverResult = { ok: true; handle: CycleHandle } | { ok: false; message: string };

interface CycleEnv {
  directory: string;
  gitRoot: string;
  cycleDir: string;
  config: CycleConfig;
  lease: Lease;
  repository: RepositoryPort;
}

const NO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const failure = (message: string): { ok: false; message: string } => ({ ok: false, message });

const gitRootOf = (directory: string): string | undefined =>
  findGitRoot(directory, (dir) => existsSync(join(dir, ".git")));

export const projectHistory = (cwd: string, agentDir: string = getAgentDir()): string =>
  projectHistoryDir(agentDir, gitRootOf(cwd) ?? cwd);

const asModel = (ctx: HostContext, choice: ModelChoice | undefined): Model<Api> | undefined =>
  (choice ? ctx.modelRegistry.find(choice.provider, choice.id) : undefined) ?? ctx.model;

const modelName = (model: Model<Api> | undefined): string =>
  model ? `${model.provider}/${model.id}` : "default";

export const cycleInputFiles = (directory: string, cycleDir: string): string[] => [
  join(cycleDir, VISION_FILE),
  join(cycleDir, DISCUSSION_FILE),
  configPath(directory),
];

function readConfig(
  directory: string,
): { ok: true; config: CycleConfig } | { ok: false; message: string } {
  const text = readText(configPath(directory));
  if (text === undefined) {
    return failure(
      `${configPath(directory)} not found. Until the Discussion writes it (F1b), create it by hand with: owners (list of owner names), and optionally language, vaultPath, allowedRoots, piWeb {hosts, port}, planner and reviewer {provider, id, thinking}`,
    );
  }
  const parsed = parseCycleConfig(text);
  return parsed.ok
    ? parsed
    : failure(`${configPath(directory)} is invalid: ${parsed.problems.join("; ")}`);
}

async function askCancelReason(
  ctx: HostContext,
  language: string | undefined,
): Promise<CancelReason | undefined> {
  if (!ctx.hasUI || !ctx.ui.select) return undefined;
  const question = cancelQuestion(language);
  try {
    const answer = await ctx.ui.select(question.title, [question.stuck, question.other]);
    if (answer === question.stuck) return "stuck";
    if (answer === question.other) return "other";
  } catch {}
  return undefined;
}

function readStageEnvironment(
  env: CycleEnv,
  record: CycleRecord,
  executionDir: string,
): StageEnvironment | undefined {
  if (!record.finalBranch) return undefined;
  return env.repository.stageEnvironment({
    branch: record.finalBranch,
    cwd: env.directory,
    targetDir: stageEnvironmentDir(stageDirOfExecution(executionDir)),
  });
}

function buildPorts(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps,
  env: CycleEnv,
  initial: CycleRecord,
  onClosed: (closed: CycleRecord) => void,
): DriverPorts {
  const { directory, gitRoot, cycleDir, config, lease, repository } = env;
  const shell = (): ShellContext => ({
    projectRoot: directory,
    allowedRoots: [
      cycleDir,
      tmpdir(),
      ...(config.vaultPath ? [config.vaultPath] : []),
      ...config.allowedRoots,
    ],
    homeDir: homedir(),
    piWeb: config.piWeb,
    gitAliases: readGitAliases(directory),
  });
  const modelFor = (role: "planner" | "reviewer") =>
    asModel(ctx, role === "planner" ? config.planner : config.reviewer);
  return {
    cycleDir,
    config,
    inputFiles: cycleInputFiles(directory, cycleDir),
    files: {
      read: readText,
      write: writeAtomic,
      ensureDir: (path) => void mkdirSync(path, { recursive: true }),
    },
    control: controlFs(directory, gitRoot),
    workspace: repository.workspace(initial.cycleId),
    askCancelReason: () => askCancelReason(ctx, initial.language),
    runAgent: async (role, prompt, dir, progress, signal) => {
      const allowed =
        role === "planner" ? [planPath(cycleDir), progress] : [reviewPath(dir), progress];
      const choice = role === "planner" ? config.planner : config.reviewer;
      let environment: StageEnvironment | undefined;
      try {
        environment = readStageEnvironment(env, initial, dir);
      } catch (e) {
        return {
          text: "",
          aborted: false,
          error: `S7: the final branch environment could not be read: ${(e as Error).message}`,
          leftoverCommands: 0,
          usage: NO_USAGE,
        };
      }
      return deps.runAgent({
        cwd: directory,
        prompt,
        executionDir: dir,
        model: modelFor(role),
        thinking: choice?.thinking,
        guard: (continuation) =>
          childGuardFactory({
            policy: { role, allowed },
            shell,
            epochStillMine: lease.epochStillMine,
            progressPath: progress,
            readFile: readText,
            fixedText: prompt,
            continuation,
          }),
        ...(environment ? { environment } : {}),
        shellEnv: agentShellEnv(dir),
        signal,
      });
    },
    modelLabel: (role) => modelName(modelFor(role)),
    lease,
    saveRecord: (saved) => writeAtomic(cycleRecordPath(directory), serializeCycleRecord(saved)),
    showView: (shown) => {
      if (!ctx.hasUI) return;
      try {
        ctx.ui.setStatus("ryker", ownerStatus(shown));
        ctx.ui.setWidget("ryker", ownerWidget(shown));
      } catch {}
    },
    notify: (message, level) => {
      try {
        ctx.ui.notify(message, level);
      } catch {}
    },
    announce: (summary) => {
      try {
        messenger.sendMessage({ customType: "ryker-ciclo", content: summary, display: true });
      } catch {}
    },
    onClosed,
  };
}

function listenForEscape(ctx: HostContext, driver: () => StageDriver | undefined): () => void {
  if (!ctx.hasUI || !ctx.ui.onTerminalInput) return () => {};
  try {
    return ctx.ui.onTerminalInput((data) => {
      const current = driver();
      if (current?.isExecuting() && matchesKey(data, "escape")) current.stop();
      return undefined;
    });
  } catch {
    return () => {};
  }
}

function buildHandle(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps,
  initial: CycleRecord,
  env: CycleEnv,
): CycleHandle {
  const sessionId = ctx.sessionManager.getSessionId();
  const index = openCyclesIndexPath(deps.agentDir);
  let driver: StageDriver | undefined;
  let handle: CycleHandle | undefined;
  let timer: NodeJS.Timeout | undefined;
  const releaseLiveness = registerLiveness(sessionId, ctx.sessionManager.getSessionFile(), () =>
    cycleHandles.has(sessionId),
  );
  const stopListening = listenForEscape(ctx, () => driver);
  const dispose = (): void => {
    clearInterval(timer);
    releaseLiveness();
    stopListening();
    if (cycleHandles.get(sessionId) === handle) cycleHandles.delete(sessionId);
  };
  timer = setInterval(() => {
    if (env.lease.heartbeat()) return;
    driver?.leaseLost();
    dispose();
  }, deps.heartbeatMs);
  timer.unref();
  const ports = buildPorts(messenger, ctx, deps, env, initial, (closed) => {
    removeOpenCycle(index, closed.cycleId);
    env.lease.release();
    dispose();
  });
  const created = createStageDriver(initial, ports);
  driver = created;
  const built: CycleHandle = {
    sessionId,
    directory: env.directory,
    driver: created,
    running: Promise.resolve(),
    shutdown: async () => {
      created.suspend();
      created.requestPause();
      await built.running;
      dispose();
    },
  };
  handle = built;
  cycleHandles.set(sessionId, built);
  return built;
}

export async function startStageTwo(
  messenger: HostMessenger,
  ctx: HostContext,
  state: DiscussionState,
  deps: HostDeps = defaultHostDeps(),
): Promise<StartResult> {
  const sessionId = ctx.sessionManager.getSessionId();
  const directory = ctx.cwd;
  const gitRoot = gitRootOf(directory);
  if (!gitRoot) return failure(`${directory} is not inside a git repository`);
  const config = readConfig(directory);
  if (!config.ok) return config;
  const repository = deps.repository(gitRoot);
  const finalBranch = repository.currentBranch();
  if (!finalBranch) {
    return failure(`${gitRoot} is on a detached HEAD or has no commit; check out the final branch`);
  }
  const index = openCyclesIndexPath(deps.agentDir);
  const open = cyclesTouching(readOpenCycles(index), directory);
  if (open.length > 0) return failure(`repositório em outro ciclo: ${open[0]?.cycleId}`);
  const cycleId = createCycleId(new Date(deps.now()), state.pedido);
  const leased = acquireLease({
    store: fileLockStore,
    path: lockPath(gitRoot),
    sessionId,
    cycleId,
    now: deps.now,
    remove: removeFile,
  });
  if (!leased.ok) return failure(`the repository lock is not free (${leased.reason})`);
  ensureExcluded(gitRoot, ".pi/ryker");
  const language = config.config.language ?? state.idioma;
  const record = newCycleRecord({
    cycleId,
    ownerSession: sessionId,
    epoch: leased.lease.epoch,
    directories: [directory],
    finalBranch,
    ...(language ? { language } : {}),
  });
  const cycleDir = cycleHistoryDir(deps.agentDir, gitRoot, cycleId);
  moveVisionToCycle(directory, cycleDir);
  mkdirSync(projectRykerDir(directory), { recursive: true });
  writeAtomic(cycleRecordPath(directory), serializeCycleRecord(record));
  addOpenCycle(index, { cycleId, ownerSession: sessionId, directories: [directory] });
  const handle = buildHandle(messenger, ctx, deps, record, {
    directory,
    gitRoot,
    cycleDir,
    config: config.config,
    lease: leased.lease,
    repository,
  });
  handle.running = handle.driver.run();
  return { ok: true, cycleId };
}

function loadCycle(
  directory: string,
):
  | { ok: true; record: CycleRecord; gitRoot: string; config: CycleConfig }
  | { ok: false; message: string } {
  const text = readText(cycleRecordPath(directory));
  const record = text === undefined ? undefined : parseCycleRecord(text);
  if (!record || record.closed) return failure("there is no open Ryker cycle here");
  const gitRoot = gitRootOf(directory);
  if (!gitRoot) return failure(`${directory} is not inside a git repository`);
  const config = readConfig(directory);
  if (!config.ok) return config;
  return { ok: true, record, gitRoot, config: config.config };
}

function adoptCycle(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps,
  loaded: { record: CycleRecord; gitRoot: string; config: CycleConfig },
  directory: string,
  lease: Lease,
): CycleHandle {
  const sessionId = ctx.sessionManager.getSessionId();
  const repository = deps.repository(loaded.gitRoot);
  const { execution, ...withoutExecution } = loaded.record;
  if (execution) repository.workspace(loaded.record.cycleId).restore(execution.restorePoint);
  const cycle =
    loaded.record.cycle.phase === "reviewing"
      ? { ...loaded.record.cycle, phase: "planning" as const }
      : loaded.record.cycle;
  const adopted: CycleRecord = {
    ...withoutExecution,
    cycle,
    ownerSession: sessionId,
    epoch: lease.epoch,
    runState: "paused",
  };
  writeAtomic(cycleRecordPath(directory), serializeCycleRecord(adopted));
  addOpenCycle(openCyclesIndexPath(deps.agentDir), {
    cycleId: adopted.cycleId,
    ownerSession: sessionId,
    directories: adopted.directories,
  });
  return buildHandle(messenger, ctx, deps, adopted, {
    directory,
    gitRoot: loaded.gitRoot,
    cycleDir: cycleHistoryDir(deps.agentDir, loaded.gitRoot, adopted.cycleId),
    config: loaded.config,
    lease,
    repository,
  });
}

const leaseFor =
  (deps: HostDeps, sessionId: string, gitRoot: string, cycleId: string) =>
  (confirmTakeover: boolean): LeaseResult =>
    acquireLease({
      store: fileLockStore,
      path: lockPath(gitRoot),
      sessionId,
      cycleId,
      now: deps.now,
      remove: removeFile,
      ...(confirmTakeover ? { confirmTakeover: true } : {}),
    });

export function attachExistingCycle(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps = defaultHostDeps(),
): CycleHandle | undefined {
  const sessionId = ctx.sessionManager.getSessionId();
  const existing = cycleHandles.get(sessionId);
  if (existing) return existing;
  const loaded = loadCycle(ctx.cwd);
  if (!loaded.ok || loaded.record.ownerSession !== sessionId) return undefined;
  const leased = leaseFor(deps, sessionId, loaded.gitRoot, loaded.record.cycleId)(false);
  if (!leased.ok) return undefined;
  return adoptCycle(messenger, ctx, deps, loaded, ctx.cwd, leased.lease);
}

export async function takeOverCycle(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps = defaultHostDeps(),
): Promise<TakeoverResult> {
  const sessionId = ctx.sessionManager.getSessionId();
  const entry = cyclesTouching(readOpenCycles(openCyclesIndexPath(deps.agentDir)), ctx.cwd).find(
    (item) => item.ownerSession !== sessionId,
  );
  if (!entry) return failure("no cycle of another session touches this project");
  const directory = entry.directories[0] ?? ctx.cwd;
  const loaded = loadCycle(directory);
  if (!loaded.ok) return loaded;
  const lease = leaseFor(deps, sessionId, loaded.gitRoot, loaded.record.cycleId);
  let leased = lease(false);
  if (!leased.ok && leased.reason === "otherAlive") {
    if (!ctx.hasUI || !ctx.ui.confirm) {
      return failure("the owner session is alive; taking over needs your confirmation in a dialog");
    }
    const question = takeoverQuestion(loaded.record.language);
    if (!(await ctx.ui.confirm(question.title, question.message))) {
      return failure("takeover cancelled");
    }
    leased = lease(true);
  }
  if (!leased.ok) return failure(`the repository lock could not be taken (${leased.reason})`);
  return { ok: true, handle: adoptCycle(messenger, ctx, deps, loaded, directory, leased.lease) };
}
