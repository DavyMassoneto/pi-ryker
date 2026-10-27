import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { parseCycleRecord } from "../core/cycleRecord.ts";
import type { RestorePoint } from "../core/gitRefs.ts";
import { lockPath } from "../core/lock.ts";
import { createState } from "../core/state.ts";
import type { AgentRunRequest } from "./agent.ts";
import {
  attachExistingCycle,
  cycleHandles,
  type HostContext,
  type HostDeps,
  startStageTwo,
  takeOverCycle,
} from "./cycleHost.ts";
import type { RepositoryPort } from "./repository.ts";

interface Fixture {
  project: string;
  agentDir: string;
  status: Map<string, string | undefined>;
  notices: string[];
  messages: string[];
  requests: AgentRunRequest[];
  repo: { branch: string | undefined; restored: string[] };
  deps: HostDeps;
  ctx: HostContext;
  messenger: { sendMessage: (m: { content: string }) => void };
  cleanup(): void;
}

function fakeRepository(
  project: string,
  repo: { branch: string | undefined; restored: string[] },
): RepositoryPort {
  const point = (label: string): RestorePoint => ({
    ref: `refs/ryker/x/${label}`,
    commit: "c",
    tree: "t",
    indexTree: "i",
    branch: "main",
    head: "h",
  });
  return {
    currentBranch: () => repo.branch,
    workspace: () => ({
      capture: point,
      verify: () => ({ ok: true }),
      restore: (restored) => void repo.restored.push(restored.ref),
    }),
    stageEnvironment: (request) => ({
      branch: request.branch,
      gitRoot: project,
      contextFiles: [{ path: join(project, "AGENTS.md"), content: "from the final branch" }],
      skillFolders: [],
      agentDefinitions: [],
    }),
  };
}

function fixture(
  options: { git?: boolean; config?: boolean; sessionId?: string; noModels?: boolean } = {},
): Fixture {
  const root = mkdtempSync(join(tmpdir(), "ryker-host-"));
  const project = join(root, "project");
  const agentDir = join(root, "agent");
  mkdirSync(project, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  if (options.git !== false) mkdirSync(join(project, ".git", "info"), { recursive: true });
  if (options.config !== false) {
    mkdirSync(join(project, ".pi", "ryker"), { recursive: true });
    writeFileSync(
      join(project, ".pi", "ryker", "config.json"),
      JSON.stringify({ language: "en", owners: ["core"] }),
    );
  }
  const status = new Map<string, string | undefined>();
  const notices: string[] = [];
  const messages: string[] = [];
  const requests: AgentRunRequest[] = [];
  const repo: { branch: string | undefined; restored: string[] } = {
    branch: "main",
    restored: [],
  };
  const deps: HostDeps = {
    repository: () => fakeRepository(project, repo),
    agentDir,
    now: () => 1_000_000,
    heartbeatMs: 3_600_000,
    runAgent: async (request) => {
      requests.push(request);
      return {
        text: "STATUS: DONE",
        aborted: false,
        leftoverCommands: 0,
        usage: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
      };
    },
  };
  const ctx: HostContext = {
    cwd: project,
    hasUI: true,
    model: undefined,
    ui: {
      setStatus: (key, text) => void status.set(key, text),
      setWidget: () => {},
      notify: (message) => void notices.push(message),
    },
    sessionManager: {
      getSessionId: () => options.sessionId ?? "session-a",
      getSessionFile: () => undefined,
    },
    modelRegistry: {
      find: (provider, id) => (options.noModels ? undefined : ({ provider, id } as Model<Api>)),
    },
  };
  return {
    project,
    agentDir,
    status,
    notices,
    messages,
    requests,
    repo,
    deps,
    ctx,
    messenger: { sendMessage: (m) => void messages.push(m.content) },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const discussion = () =>
  createState({ request: "demo", now: "2026-10-27T10:00:00Z", previous: { ferramentas: [] } });

test("host: refuses outside a git repository", async () => {
  const f = fixture({ git: false });
  const result = await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.equal(result.ok, false);
  f.cleanup();
});

test("host: refuses without the hand-written configuration", async () => {
  const f = fixture({ config: false });
  const result = await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /config\.json/);
  f.cleanup();
});

test("host: refuses a repository that is in another open cycle (SUP-51)", async () => {
  const f = fixture();
  mkdirSync(join(f.agentDir, "ryker"), { recursive: true });
  writeFileSync(
    join(f.agentDir, "ryker", "ciclos-abertos.json"),
    JSON.stringify([{ cycleId: "other", ownerSession: "x", directories: [f.project] }]),
  );
  const result = await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /outro ciclo/);
  f.cleanup();
});

test("host: starting takes the lock, indexes the cycle, shows status and runs the driver (F1a)", async () => {
  const f = fixture();
  const result = await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.equal(result.ok, true);
  const handle = cycleHandles.get("session-a");
  assert.ok(handle);
  await handle.running;
  const lock = JSON.parse(readFileSync(join(f.project, ".pi", "ryker", "trava.json"), "utf8"));
  assert.equal(lock.ownerSession, "session-a");
  assert.equal(lock.epoch, 1);
  const index = JSON.parse(readFileSync(join(f.agentDir, "ryker", "ciclos-abertos.json"), "utf8"));
  assert.equal(index.length, 1);
  const record = parseCycleRecord(
    readFileSync(join(f.project, ".pi", "ryker", "ciclo.json"), "utf8"),
  );
  assert.equal(record?.ownerSession, "session-a");
  assert.match(f.status.get("ryker") ?? "", /^Ryker · 2\/6 Planning/);
  assert.equal(f.requests.length > 0, true);
  assert.equal(f.requests[0]?.cwd, f.project);
  assert.match(f.requests[0]?.shellEnv.PI_CODING_AGENT_DIR ?? "", /ryker[\\/]isolado/);
  assert.equal(f.requests[0]?.model?.id, "cc/claude-opus-5-5");
  assert.equal(f.requests[0]?.thinking, "high");
  assert.match(f.messages[0] ?? "", /\/ryker parar/);
  assert.match(readFileSync(join(f.project, ".git", "info", "exclude"), "utf8"), /\.pi\/ryker/);
  await handle.shutdown();
  f.cleanup();
});

test("host: shutdown pauses the cycle, stops the heartbeat and frees the session slot (session_shutdown)", async () => {
  const f = fixture();
  let release: (() => void) | undefined;
  f.deps.runAgent = (request) =>
    new Promise((resolve) => {
      release = () =>
        resolve({
          text: "",
          aborted: true,
          leftoverCommands: 0,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        });
      request.signal.addEventListener("abort", () => release?.());
    });
  await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  const handle = cycleHandles.get("session-a");
  await new Promise((resolve) => setImmediate(resolve));
  await handle?.shutdown();
  const record = parseCycleRecord(
    readFileSync(join(f.project, ".pi", "ryker", "ciclo.json"), "utf8"),
  );
  assert.equal(record?.runState, "paused");
  assert.equal(cycleHandles.has("session-a"), false);
  f.cleanup();
});

function blockingAgent(f: Fixture): void {
  f.deps.runAgent = (request) =>
    new Promise((resolve) => {
      request.signal.addEventListener("abort", () =>
        resolve({
          text: "",
          aborted: true,
          leftoverCommands: 0,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }),
      );
    });
}

test("host: after the session is replaced the driver never touches the stale context (4c)", async () => {
  const f = fixture();
  blockingAgent(f);
  let stale = false;
  const staleError = () => {
    throw new Error("This extension ctx is stale after session replacement or reload");
  };
  const ctx = {
    ...f.ctx,
    get hasUI(): boolean {
      if (stale) staleError();
      return true;
    },
    get ui(): HostContext["ui"] {
      if (stale) staleError();
      return f.ctx.ui;
    },
    get model(): HostContext["model"] {
      if (stale) staleError();
      return undefined;
    },
    get modelRegistry(): HostContext["modelRegistry"] {
      if (stale) staleError();
      return f.ctx.modelRegistry;
    },
  } as HostContext;
  await startStageTwo(f.messenger, ctx, discussion(), f.deps);
  const handle = cycleHandles.get("session-a");
  await new Promise((resolve) => setImmediate(resolve));
  stale = true;
  await handle?.shutdown();
  const record = parseCycleRecord(
    readFileSync(join(f.project, ".pi", "ryker", "ciclo.json"), "utf8"),
  );
  assert.equal(record?.runState, "paused");
  f.cleanup();
});

test("host: a session that lost ownership clears its Ryker status and widget (takeover)", async () => {
  const f = fixture();
  blockingAgent(f);
  f.deps.heartbeatMs = 5;
  await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.match(f.status.get("ryker") ?? "", /^Ryker/);
  writeFileSync(
    lockPath(f.project),
    JSON.stringify({ ownerSession: "session-b", cycleId: "x", epoch: 9, heartbeatAt: 1_000_000 }),
  );
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(f.status.get("ryker"), undefined);
  assert.equal(cycleHandles.has("session-a"), false);
  f.cleanup();
});

test("host: another session does not attach to a cycle it does not own (C3a)", async () => {
  const f = fixture();
  await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  const first = cycleHandles.get("session-a");
  await first?.running;
  await first?.shutdown();
  const other = fixture({ sessionId: "session-b" });
  assert.equal(
    attachExistingCycle(
      f.messenger,
      { ...f.ctx, sessionManager: other.ctx.sessionManager },
      f.deps,
    ),
    undefined,
  );
  assert.equal(existsSync(join(f.project, ".pi", "ryker", "ciclo.json")), true);
  f.cleanup();
  other.cleanup();
});

test("host: the owner session re-attaches a paused cycle after a restart", async () => {
  const f = fixture();
  await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  const first = cycleHandles.get("session-a");
  await first?.running;
  await first?.shutdown();
  const attached = attachExistingCycle(f.messenger, f.ctx, f.deps);
  assert.equal(attached?.driver.record().runState, "paused");
  await attached?.shutdown();
  f.cleanup();
});

test("host: refuses a detached HEAD, the final branch must be checked out (S7, Mec8)", async () => {
  const f = fixture();
  f.repo.branch = undefined;
  const result = await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.match(result.ok ? "" : result.message, /detached HEAD/);
  f.cleanup();
});

test("host: the vision moves to the cycle history folder and the agents read it there (P45)", async () => {
  const f = fixture();
  writeFileSync(join(f.project, ".pi", "ryker", "visao.html"), "<html>vision</html>");
  await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  const handle = cycleHandles.get("session-a");
  await handle?.running;
  const record = parseCycleRecord(
    readFileSync(join(f.project, ".pi", "ryker", "ciclo.json"), "utf8"),
  );
  assert.equal(existsSync(join(f.project, ".pi", "ryker", "visao.html")), false);
  assert.match(f.requests[0]?.prompt ?? "", /history.*visao\.html/);
  assert.equal(record?.finalBranch, "main");
  await handle?.shutdown();
  f.cleanup();
});

test("host: children get the final-branch environment read at the stage start (S7)", async () => {
  const f = fixture();
  await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  const handle = cycleHandles.get("session-a");
  await handle?.running;
  assert.equal(f.requests[0]?.environment?.contextFiles[0]?.content, "from the final branch");
  await handle?.shutdown();
  f.cleanup();
});

function liveForeignCycle(f: Fixture, execution?: { restorePoint: RestorePoint }): void {
  const record = {
    version: 1,
    cycleId: "c-old",
    ownerSession: "session-old",
    epoch: 3,
    runState: "running",
    cycle: { stage: 2, round: 1, phase: "reviewing" },
    tokens: [],
    directories: [f.project],
    attempt: 1,
    finalBranch: "main",
    ...(execution ? { execution } : {}),
  };
  writeFileSync(join(f.project, ".pi", "ryker", "ciclo.json"), JSON.stringify(record));
  writeFileSync(
    lockPath(f.project),
    JSON.stringify({
      ownerSession: "session-old",
      cycleId: "c-old",
      epoch: 3,
      heartbeatAt: 1_000_000,
    }),
  );
  mkdirSync(join(f.agentDir, "ryker"), { recursive: true });
  writeFileSync(
    join(f.agentDir, "ryker", "ciclos-abertos.json"),
    JSON.stringify([{ cycleId: "c-old", ownerSession: "session-old", directories: [f.project] }]),
  );
}

test("host: taking over a live owner needs confirmation, bumps the epoch and discards the running execution (P35, 18.11)", async () => {
  const f = fixture({ sessionId: "session-b" });
  const point: RestorePoint = {
    ref: "refs/ryker/c-old/run",
    commit: "c",
    tree: "t",
    indexTree: "i",
    branch: "main",
    head: "h",
  };
  liveForeignCycle(f, { restorePoint: point });
  const refused = await takeOverCycle(
    f.messenger,
    { ...f.ctx, ui: { ...f.ctx.ui, confirm: async () => false } },
    f.deps,
  );
  assert.equal(refused.ok, false);
  assert.equal(JSON.parse(readFileSync(lockPath(f.project), "utf8")).ownerSession, "session-old");
  const taken = await takeOverCycle(
    f.messenger,
    { ...f.ctx, ui: { ...f.ctx.ui, confirm: async () => true } },
    f.deps,
  );
  assert.equal(taken.ok, true);
  const lock = JSON.parse(readFileSync(lockPath(f.project), "utf8"));
  assert.equal(lock.ownerSession, "session-b");
  assert.equal(lock.epoch, 4);
  const record = parseCycleRecord(
    readFileSync(join(f.project, ".pi", "ryker", "ciclo.json"), "utf8"),
  );
  assert.equal(record?.ownerSession, "session-b");
  assert.equal(record?.runState, "paused");
  assert.equal(record?.cycle.phase, "planning");
  assert.equal(record?.execution, undefined);
  assert.deepEqual(f.repo.restored, ["refs/ryker/c-old/run"]);
  const index = JSON.parse(readFileSync(join(f.agentDir, "ryker", "ciclos-abertos.json"), "utf8"));
  assert.equal(index[0].ownerSession, "session-b");
  if (taken.ok) await taken.handle.shutdown();
  f.cleanup();
});

test("host: taking over without a dialog is refused while the owner is alive (P35)", async () => {
  const f = fixture({ sessionId: "session-b" });
  liveForeignCycle(f);
  const result = await takeOverCycle(f.messenger, { ...f.ctx, hasUI: false }, f.deps);
  assert.match(result.ok ? "" : result.message, /confirmation/);
  f.cleanup();
});

test("host: a role model that is not found stops with a visible reason and starts nothing (Q13, B1)", async () => {
  const f = fixture({ noModels: true });
  const result = await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /omni\/cc\/claude-opus-5-5/);
  assert.equal(existsSync(join(f.project, ".pi", "ryker", "trava.json")), false);
  assert.equal(f.requests.length, 0);
  f.cleanup();
});

test("host: a thrown agent error does not reject and stops the cycle with the error (B9)", async () => {
  const f = fixture();
  f.deps.runAgent = async () => {
    throw new Error("EBUSY rename");
  };
  const result = await startStageTwo(f.messenger, f.ctx, discussion(), f.deps);
  assert.equal(result.ok, true);
  const handle = cycleHandles.get("session-a");
  await handle?.running;
  assert.equal(handle?.driver.record().cycle.phase, "stopped");
  assert.match(f.messages.join("\n"), /EBUSY rename/);
  await handle?.shutdown();
  f.cleanup();
});
