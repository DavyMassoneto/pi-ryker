import assert from "node:assert/strict";
import { test } from "node:test";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import {
  type AgentDeps,
  type AgentRunRequest,
  type ChildSession,
  type ContinuationHooks,
  environmentOverrides,
  runChildAgent,
} from "./agent.ts";
import type { StageEnvironment } from "./stageEnvironment.ts";

const request = (signal: AbortSignal): AgentRunRequest => ({
  cwd: "/p",
  prompt: "FIXED TEXT",
  executionDir: "/p/run",
  model: undefined,
  thinking: undefined,
  guard: () => () => {},
  shellEnv: {},
  signal,
});

const noShell: BashOperations = { exec: async () => ({ exitCode: 0 }) };

function fakeDeps(session: Partial<ChildSession>): AgentDeps {
  const full: ChildSession = {
    prompt: async () => {},
    abort: async () => {},
    dispose: () => {},
    getSessionStats: () => ({ tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } }),
    getLastAssistantText: () => "done\nSTATUS: DONE",
    ...session,
  };
  return { createSession: async () => full, baseOperations: () => noShell };
}

test("agent: sends exactly the fixed prompt and returns text and usage (U7, P13)", async () => {
  let sent = "";
  const deps = fakeDeps({
    prompt: async (text) => {
      sent = text;
    },
  });
  const result = await runChildAgent(request(new AbortController().signal), deps);
  assert.equal(sent, "FIXED TEXT");
  assert.equal(result.text, "done\nSTATUS: DONE");
  assert.deepEqual(result.usage, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 });
  assert.equal(result.aborted, false);
});

test("agent: stop aborts the session and reports aborted (P36)", async () => {
  const controller = new AbortController();
  let aborted = false;
  const deps = fakeDeps({
    abort: async () => {
      aborted = true;
    },
    prompt: () =>
      new Promise((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  const pending = runChildAgent(request(controller.signal), deps);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  const result = await pending;
  assert.equal(result.aborted, true);
  assert.equal(aborted, true);
});

test("agent: a session failure becomes an error result and the session is disposed", async () => {
  let disposed = false;
  const deps = fakeDeps({
    prompt: async () => {
      throw new Error("model unavailable");
    },
    dispose: () => {
      disposed = true;
    },
  });
  const result = await runChildAgent(request(new AbortController().signal), deps);
  assert.equal(result.error, "model unavailable");
  assert.equal(disposed, true);
});

test("agent: a creation failure is reported without a session", async () => {
  const deps: AgentDeps = {
    createSession: async () => {
      throw new Error("no auth");
    },
    baseOperations: () => noShell,
  };
  const result = await runChildAgent(request(new AbortController().signal), deps);
  assert.equal(result.error, "no auth");
  assert.equal(result.text, "");
});

test("agent: commands still running when the agent ends are counted and ended (C1b, P40)", async () => {
  const hanging: BashOperations = {
    exec: (_command, _cwd, options) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  };
  let started: Promise<unknown> = Promise.resolve();
  const deps: AgentDeps = {
    baseOperations: () => hanging,
    createSession: async (sessionRequest) => ({
      prompt: async () => {
        started = sessionRequest.shellOperations.exec("server", "/p", { onData: () => {} });
        started.catch(() => {});
      },
      abort: async () => {},
      dispose: () => {},
      getSessionStats: () => ({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }),
      getLastAssistantText: () => "STATUS: DONE",
    }),
  };
  const result = await runChildAgent(request(new AbortController().signal), deps);
  assert.equal(result.leftoverCommands, 1);
  await assert.rejects(started, /aborted/);
});

test("agent: progress that no longer fits continues in a new session with the same fixed text (Q Continuacao em sessao nova, U21)", async () => {
  const prompts: string[] = [];
  let created = 0;
  let aborted = 0;
  const deps: AgentDeps = {
    baseOperations: () => noShell,
    createSession: async () => {
      created += 1;
      const first = created === 1;
      return {
        prompt: async (text) => {
          prompts.push(text);
          if (first) {
            continuation?.requestNewSession();
            throw new Error("aborted for continuation");
          }
        },
        abort: async () => {
          aborted += 1;
        },
        dispose: () => {},
        getSessionStats: () => ({ tokens: { input: 10, output: 1, cacheRead: 0, cacheWrite: 0 } }),
        getLastAssistantText: () => (first ? "partial" : "STATUS: DONE"),
      };
    },
  };
  let continuation: ContinuationHooks | undefined;
  const result = await runChildAgent(
    {
      ...request(new AbortController().signal),
      guard: (hooks) => {
        continuation = hooks;
        return () => {};
      },
    },
    deps,
  );
  assert.equal(created, 2);
  assert.deepEqual(prompts, ["FIXED TEXT", "FIXED TEXT"]);
  assert.equal(aborted, 1);
  assert.equal(result.error, undefined);
  assert.equal(result.text, "STATUS: DONE");
  assert.deepEqual(result.usage, { input: 20, output: 2, cacheRead: 0, cacheWrite: 0 });
});

test("child resource overrides keep only final-branch skills and context files, never user or global ones", () => {
  const environment: StageEnvironment = {
    branch: "main",
    gitRoot: "/repo",
    contextFiles: [{ path: "/repo/AGENTS.md", content: "final branch" }],
    skillFolders: [],
    agentDefinitions: [],
  };
  const base = {
    skills: [{ name: "superpowers", sourceInfo: { scope: "user" } }] as never,
    diagnostics: [],
  };
  const baseAgents = {
    agentsFiles: [
      { path: "/home/u/.pi/agent/AGENTS.md", content: "global" },
      { path: "/repo/AGENTS.md", content: "working tree" },
    ],
  };
  for (const env of [environment, undefined]) {
    const overrides = environmentOverrides(env);
    assert.deepEqual(overrides.skillsOverride?.(base).skills, []);
    assert.deepEqual(
      overrides.agentsFilesOverride?.(baseAgents).agentsFiles,
      env ? environment.contextFiles : [],
    );
  }
});
