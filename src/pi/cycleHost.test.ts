import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseCycleRecord } from "../core/cycleRecord.ts";
import { createState } from "../core/state.ts";
import type { AgentRunRequest } from "./agent.ts";
import {
  attachExistingCycle,
  cycleHandles,
  type HostContext,
  type HostDeps,
  startStageTwo,
} from "./cycleHost.ts";

interface Fixture {
  project: string;
  agentDir: string;
  status: Map<string, string | undefined>;
  notices: string[];
  messages: string[];
  requests: AgentRunRequest[];
  deps: HostDeps;
  ctx: HostContext;
  messenger: { sendMessage: (m: { content: string }) => void };
  cleanup(): void;
}

function fixture(options: { git?: boolean; config?: boolean; sessionId?: string } = {}): Fixture {
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
  const deps: HostDeps = {
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
    modelRegistry: { find: () => undefined },
  };
  return {
    project,
    agentDir,
    status,
    notices,
    messages,
    requests,
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
  assert.equal(f.requests[0]?.shellEnv.PI_CODING_AGENT_DIR, f.requests[0]?.executionDir);
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
