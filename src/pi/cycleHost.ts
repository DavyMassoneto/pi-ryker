import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type CycleConfig, type ModelChoice, parseCycleConfig } from "../core/cycleConfig.ts";
import {
  configPath,
  cycleHistoryDir,
  cycleRecordPath,
  openCyclesIndexPath,
  planPath,
  projectRykerDir,
  reviewPath,
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
import type { DiscussionState } from "../core/state.ts";
import { type AgentRunRequest, type AgentRunResult, runChildAgent } from "./agent.ts";
import { childGuardFactory } from "./childGuard.ts";
import { createStageDriver, type DriverPorts, type StageDriver } from "./driver.ts";
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
import { acquireLease, HEARTBEAT_MS, type Lease } from "./lease.ts";
import { registerLiveness } from "./liveness.ts";
import { discussionPath } from "./persistence.ts";

export interface HostContext {
  cwd: string;
  hasUI: boolean;
  model: Model<Api> | undefined;
  ui: {
    setStatus(key: string, text: string | undefined): void;
    setWidget(key: string, content: string[] | undefined): void;
    notify(message: string, level?: "info" | "warning" | "error"): void;
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
}

export const defaultHostDeps = (): HostDeps => ({
  agentDir: getAgentDir(),
  now: () => Date.now(),
  heartbeatMs: HEARTBEAT_MS,
  runAgent: (request) => runChildAgent(request),
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

const failure = (message: string): StartResult => ({ ok: false, message });

const asModel = (ctx: HostContext, choice: ModelChoice | undefined): Model<Api> | undefined =>
  (choice ? ctx.modelRegistry.find(choice.provider, choice.id) : undefined) ?? ctx.model;

const modelName = (model: Model<Api> | undefined): string =>
  model ? `${model.provider}/${model.id}` : "default";

export const cycleInputFiles = (directory: string): string[] => [
  join(directory, ".ryker", "visao.html"),
  discussionPath(directory),
  configPath(directory),
];

function readConfig(
  directory: string,
): { ok: true; config: CycleConfig } | { ok: false; message: string } {
  const text = readText(configPath(directory));
  if (text === undefined) {
    return {
      ok: false,
      message: `${configPath(directory)} not found; the stage 2 configuration is written by hand in this slice`,
    };
  }
  const parsed = parseCycleConfig(text);
  return parsed.ok
    ? parsed
    : { ok: false, message: `${configPath(directory)}: ${parsed.problems.join("; ")}` };
}

function buildPorts(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps,
  env: { directory: string; gitRoot: string; cycleDir: string; config: CycleConfig; lease: Lease },
  onClosed: (closed: CycleRecord) => void,
): DriverPorts {
  const { directory, gitRoot, cycleDir, config, lease } = env;
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
    inputFiles: cycleInputFiles(directory),
    files: {
      read: readText,
      write: writeAtomic,
      ensureDir: (path) => void mkdirSync(path, { recursive: true }),
    },
    control: controlFs(directory, gitRoot),
    runAgent: (role, prompt, dir, progress, signal) => {
      const allowed =
        role === "planner" ? [planPath(cycleDir), progress] : [reviewPath(dir), progress];
      const choice = role === "planner" ? config.planner : config.reviewer;
      return deps.runAgent({
        cwd: directory,
        prompt,
        executionDir: dir,
        model: modelFor(role),
        thinking: choice?.thinking,
        guard: childGuardFactory({
          policy: { role, allowed },
          shell,
          epochStillMine: lease.epochStillMine,
          progressPath: progress,
          readFile: readText,
        }),
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

function buildHandle(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps,
  initial: CycleRecord,
  env: { directory: string; gitRoot: string; cycleDir: string; config: CycleConfig; lease: Lease },
): CycleHandle {
  const sessionId = ctx.sessionManager.getSessionId();
  const index = openCyclesIndexPath(deps.agentDir);
  let driver: StageDriver | undefined;
  const timer = setInterval(() => {
    if (!env.lease.heartbeat()) driver?.leaseLost();
  }, deps.heartbeatMs);
  timer.unref();
  const releaseLiveness = registerLiveness(sessionId, ctx.sessionManager.getSessionFile(), () =>
    cycleHandles.has(sessionId),
  );
  const dispose = (): void => {
    clearInterval(timer);
    releaseLiveness();
    cycleHandles.delete(sessionId);
  };
  const ports = buildPorts(messenger, ctx, deps, env, (closed) => {
    removeOpenCycle(index, closed.cycleId);
    env.lease.release();
    dispose();
  });
  driver = createStageDriver(initial, ports);
  const handle: CycleHandle = {
    sessionId,
    directory: env.directory,
    driver,
    running: Promise.resolve(),
    shutdown: async () => {
      const current = driver as StageDriver;
      current.stop();
      current.requestPause();
      await handle.running;
      dispose();
    },
  };
  cycleHandles.set(sessionId, handle);
  return handle;
}

export async function startStageTwo(
  messenger: HostMessenger,
  ctx: HostContext,
  state: DiscussionState,
  deps: HostDeps = defaultHostDeps(),
): Promise<StartResult> {
  const sessionId = ctx.sessionManager.getSessionId();
  const directory = ctx.cwd;
  const gitRoot = findGitRoot(directory, (dir) => existsSync(join(dir, ".git")));
  if (!gitRoot) return failure(`${directory} is not inside a git repository`);
  const config = readConfig(directory);
  if (!config.ok) return failure(config.message);
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
    ...(language ? { language } : {}),
  });
  const cycleDir = cycleHistoryDir(deps.agentDir, gitRoot, cycleId);
  mkdirSync(cycleDir, { recursive: true });
  mkdirSync(projectRykerDir(directory), { recursive: true });
  writeAtomic(cycleRecordPath(directory), serializeCycleRecord(record));
  addOpenCycle(index, { cycleId, ownerSession: sessionId, directories: [directory] });
  const handle = buildHandle(messenger, ctx, deps, record, {
    directory,
    gitRoot,
    cycleDir,
    config: config.config,
    lease: leased.lease,
  });
  handle.running = handle.driver.run();
  return { ok: true, cycleId };
}

export function attachExistingCycle(
  messenger: HostMessenger,
  ctx: HostContext,
  deps: HostDeps = defaultHostDeps(),
): CycleHandle | undefined {
  const sessionId = ctx.sessionManager.getSessionId();
  const existing = cycleHandles.get(sessionId);
  if (existing) return existing;
  const directory = ctx.cwd;
  const text = readText(cycleRecordPath(directory));
  const record = text === undefined ? undefined : parseCycleRecord(text);
  if (!record || record.ownerSession !== sessionId || record.closed) return undefined;
  const gitRoot = findGitRoot(directory, (dir) => existsSync(join(dir, ".git")));
  const config = readConfig(directory);
  if (!gitRoot || !config.ok) return undefined;
  const leased = acquireLease({
    store: fileLockStore,
    path: lockPath(gitRoot),
    sessionId,
    cycleId: record.cycleId,
    now: deps.now,
    remove: removeFile,
  });
  if (!leased.ok) return undefined;
  const cycle =
    record.cycle.phase === "reviewing"
      ? { ...record.cycle, phase: "planning" as const }
      : record.cycle;
  const resumed: CycleRecord = { ...record, cycle, epoch: leased.lease.epoch, runState: "paused" };
  writeAtomic(cycleRecordPath(directory), serializeCycleRecord(resumed));
  return buildHandle(messenger, ctx, deps, resumed, {
    directory,
    gitRoot,
    cycleDir: cycleHistoryDir(deps.agentDir, gitRoot, record.cycleId),
    config: config.config,
    lease: leased.lease,
  });
}
