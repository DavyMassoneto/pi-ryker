import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { newCycleRecord, serializeCycleRecord } from "../core/cycleRecord.ts";
import { runCycleCommand } from "./cycleCommands.ts";
import { type CycleHandle, cycleHandles, type HostDeps } from "./cycleHost.ts";
import { CYCLE_PROMPT_SECTION, registerProjectSession } from "./projectSession.ts";

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

function installed(deps: HostDeps): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  registerProjectSession(
    { on: (name: string, h: Handler) => handlers.set(name, h) } as unknown as ExtensionAPI,
    deps,
  );
  return handlers;
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "ryker-session-"));
  const agentDir = join(root, "agent");
  const project = join(root, "project");
  mkdirSync(join(agentDir, "ryker"), { recursive: true });
  mkdirSync(join(project, ".pi", "ryker"), { recursive: true });
  const deps: HostDeps = {
    agentDir,
    now: () => 0,
    heartbeatMs: 1000,
    runAgent: async () => assert.fail("no agent runs here"),
  };
  const ctxFor = (sessionId: string) =>
    ({
      cwd: project,
      hasUI: true,
      ui: { setStatus: () => {}, notify: () => {} },
      sessionManager: { getSessionId: () => sessionId, getSessionFile: () => undefined },
    }) as unknown as ExtensionContext;
  return { root, agentDir, project, deps, ctxFor };
}

function fakeHandle(runState: "running" | "paused", calls: string[], language = "en"): CycleHandle {
  const record = {
    ...newCycleRecord({
      cycleId: "c1",
      ownerSession: "owner",
      epoch: 1,
      directories: ["/p"],
      language,
    }),
    runState,
  };
  return {
    sessionId: "owner",
    directory: "/p",
    running: Promise.resolve(),
    shutdown: async () => void calls.push("shutdown"),
    driver: {
      record: () => record,
      isExecuting: () => runState === "running",
      run: async () => {},
      stop: () => void calls.push("stop"),
      requestPause: () => void calls.push("pause"),
      resume: async () => {
        calls.push("resume");
        return { ok: true as const };
      },
      leaseLost: () => {},
    },
  };
}

test("project session: the owner's subagent and remote git are refused while a cycle is open (SUP-45, C14.4)", async () => {
  const s = setup();
  cycleHandles.set("owner", fakeHandle("running", []));
  const handlers = installed(s.deps);
  const call = (toolName: string, input: Record<string, unknown>) =>
    handlers.get("tool_call")?.({ toolName, input }, s.ctxFor("owner")) as Promise<
      { block?: boolean } | undefined
    >;
  assert.equal((await call("subagent", {}))?.block, true);
  assert.equal((await call("bash", { command: "git push" }))?.block, true);
  assert.equal((await call("edit", { path: "a.ts" }))?.block, true);
  assert.equal(await call("read", { path: "a.ts" }), undefined);
  cycleHandles.delete("owner");
  rmSync(s.root, { recursive: true });
});

test("project session: pausing lifts the edit block but not the subagent block (C5a)", async () => {
  const s = setup();
  cycleHandles.set("owner", fakeHandle("paused", []));
  const handlers = installed(s.deps);
  const call = (toolName: string) =>
    handlers.get("tool_call")?.(
      { toolName, input: { path: "a.ts" } },
      s.ctxFor("owner"),
    ) as Promise<{ block?: boolean } | undefined>;
  assert.equal(await call("edit"), undefined);
  assert.equal((await call("subagent"))?.block, true);
  cycleHandles.delete("owner");
  rmSync(s.root, { recursive: true });
});

test("project session: another session in the project is a reader with the same blocks (C3a)", async () => {
  const s = setup();
  const record = newCycleRecord({
    cycleId: "c1",
    ownerSession: "owner",
    epoch: 1,
    directories: [s.project],
    language: "en",
  });
  writeFileSync(join(s.project, ".pi", "ryker", "ciclo.json"), serializeCycleRecord(record));
  writeFileSync(
    join(s.agentDir, "ryker", "ciclos-abertos.json"),
    JSON.stringify([{ cycleId: "c1", ownerSession: "owner", directories: [s.project] }]),
  );
  const handlers = installed(s.deps);
  const call = (toolName: string, input: Record<string, unknown>) =>
    handlers.get("tool_call")?.({ toolName, input }, s.ctxFor("reader")) as Promise<
      { block?: boolean } | undefined
    >;
  assert.equal((await call("subagent", {}))?.block, true);
  assert.equal((await call("write", { path: "a.ts" }))?.block, true);
  rmSync(s.root, { recursive: true });
});

test("project session: a session in an unrelated project is untouched", async () => {
  const s = setup();
  const handlers = installed(s.deps);
  const result = await handlers.get("tool_call")?.(
    { toolName: "subagent", input: {} },
    s.ctxFor("free"),
  );
  assert.equal(result, undefined);
  rmSync(s.root, { recursive: true });
});

test("project session: the running owner gets the fixed precedence notice (texto 7)", async () => {
  const s = setup();
  cycleHandles.set("owner", fakeHandle("running", []));
  const handlers = installed(s.deps);
  const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
  await handlers.get("before_agent_start")?.(event, s.ctxFor("owner"));
  assert.match(
    event.systemPromptOptions.sections[CYCLE_PROMPT_SECTION] ?? "",
    /A Ryker cycle is running/,
  );
  cycleHandles.set("owner", fakeHandle("paused", []));
  const paused = { systemPromptOptions: { sections: {} as Record<string, string> } };
  await handlers.get("before_agent_start")?.(paused, s.ctxFor("owner"));
  assert.equal(paused.systemPromptOptions.sections[CYCLE_PROMPT_SECTION], undefined);
  cycleHandles.delete("owner");
  rmSync(s.root, { recursive: true });
});

test("project session: session_shutdown pauses the driver within the wait (U18.18)", async () => {
  const s = setup();
  const calls: string[] = [];
  cycleHandles.set("owner", fakeHandle("running", calls));
  const handlers = installed(s.deps);
  await handlers.get("session_shutdown")?.({}, s.ctxFor("owner"));
  assert.deepEqual(calls, ["shutdown"]);
  cycleHandles.delete("owner");
  rmSync(s.root, { recursive: true });
});

test("commands: parar cancels the execution, pausar defers, retomar resumes (P36, SUP-43)", async () => {
  const s = setup();
  const calls: string[] = [];
  cycleHandles.set("owner", fakeHandle("running", calls));
  const messenger = { sendMessage: () => {} };
  const stop = await runCycleCommand("parar", s.ctxFor("owner"), messenger, s.deps);
  const pause = await runCycleCommand("pausar", s.ctxFor("owner"), messenger, s.deps);
  assert.deepEqual(calls, ["stop", "pause"]);
  assert.match(stop, /Cancelling/);
  assert.match(pause, /Pause requested/);
  cycleHandles.set("owner", fakeHandle("paused", calls));
  const resume = await runCycleCommand("retomar", s.ctxFor("owner"), messenger, s.deps);
  assert.deepEqual(calls, ["stop", "pause", "resume"]);
  assert.match(resume, /resumed/);
  cycleHandles.delete("owner");
  rmSync(s.root, { recursive: true });
});

test("commands: refused by state and by role (Q21, C3b)", async () => {
  const s = setup();
  const messenger = { sendMessage: () => {} };
  cycleHandles.set("owner", fakeHandle("paused", []));
  assert.match(
    await runCycleCommand("parar", s.ctxFor("owner"), messenger, s.deps),
    /not accepted while paused/,
  );
  cycleHandles.delete("owner");
  assert.match(
    await runCycleCommand("parar", s.ctxFor("nobody"), messenger, s.deps),
    /Não há ciclo do Ryker/,
  );
  rmSync(s.root, { recursive: true });
});
