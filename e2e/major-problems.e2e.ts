import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cancelQuestion } from "../src/core/cycleMessages.ts";
import { codeCheckFeedbackPath, planPath } from "../src/core/cyclePaths.ts";
import { type CycleRecord, parseCycleRecord } from "../src/core/cycleRecord.ts";
import ryker from "../src/index.ts";
import { runCycleCommand } from "../src/pi/cycleCommands.ts";
import { type CycleHandle, cycleHandles, startStageTwo } from "../src/pi/cycleHost.ts";
import {
  abortable,
  approvedDiscussion,
  approvingChild,
  type ChildScript,
  createWorld,
  cycleDirOfRequest,
  type FakePi,
  type FakeSession,
  fakePi,
  fakeRuntime,
  fakeSession,
  probeChildGuard,
  until,
  VALID_PLAN,
  type World,
} from "./harness.ts";

interface Scenario {
  world: World;
  pi: FakePi;
}

function scenario(): Scenario {
  const world = createWorld();
  process.env.PI_CODING_AGENT_DIR = world.agentDir;
  const pi = fakePi();
  ryker(pi.api);
  return { world, pi };
}

const readRecord = (world: World): CycleRecord => {
  const record = parseCycleRecord(
    readFileSync(join(world.project, ".pi", "ryker", "ciclo.json"), "utf8"),
  );
  assert.ok(record);
  return record;
};

async function start(
  s: Scenario,
  session: FakeSession,
  sessionId: string,
  script: ChildScript,
  heartbeatMs?: number,
): Promise<{ handle: CycleHandle; requests: ReturnType<typeof fakeRuntime>["requests"] }> {
  const runtime = fakeRuntime(s.world, script, heartbeatMs);
  const started = await startStageTwo(s.pi.api, session.ctx, approvedDiscussion(), runtime.deps);
  assert.equal(started.ok, true);
  const handle = cycleHandles.get(sessionId);
  assert.ok(handle);
  return { handle, requests: runtime.requests };
}

const command = (s: Scenario, args: string, session: FakeSession): Promise<void> => {
  const handler = s.pi.commands.get("ryker");
  assert.ok(handler);
  return handler(args, session.ctx);
};

const shutdown = (s: Scenario, session: FakeSession): Promise<unknown> | undefined =>
  s.pi.handlers.get("session_shutdown")?.({}, session.ctx);

test("major problem: a second session in the same project is read-only", async () => {
  const s = scenario();
  const owner = fakeSession(s.world, "session-owner");
  const reader = fakeSession(s.world, "session-reader");
  try {
    await start(s, owner, "session-owner", (request) => abortable(request));
    await s.pi.handlers.get("session_start")?.({}, reader.ctx);
    assert.match(reader.screen.status.get("ryker-leitor") ?? "", /read only/);

    await command(s, "parar", reader);
    await command(s, "pausar", reader);
    assert.equal(
      reader.screen.notices.filter((notice) => /belongs to another session/.test(notice)).length,
      2,
    );
    assert.equal(readRecord(s.world).runState, "running");

    const write = await s.pi.handlers.get("tool_call")?.(
      { toolName: "write", input: { path: join(s.world.project, "calc.js"), content: "x" } },
      reader.ctx,
    );
    assert.equal((write as { block?: boolean } | undefined)?.block, true);

    const second = await startStageTwo(
      s.pi.api,
      reader.ctx,
      approvedDiscussion(),
      fakeRuntime(s.world, (request) => abortable(request)).deps,
    );
    assert.equal(second.ok, false);
    assert.equal(readRecord(s.world).ownerSession, "session-owner");
  } finally {
    await shutdown(s, owner);
    s.world.cleanup();
  }
});

test("major problem: takeover bumps the epoch and the old session clears its view", async () => {
  const s = scenario();
  const oldSession = fakeSession(s.world, "session-old");
  const newSession = fakeSession(s.world, "session-new");
  try {
    const first = await start(s, oldSession, "session-old", (request) => abortable(request), 25);
    assert.equal(readRecord(s.world).epoch, 1);
    assert.match(oldSession.screen.status.get("ryker") ?? "", /Ryker · 2\/6 Planning/);
    assert.ok(oldSession.screen.widget.get("ryker"));

    const runtimeNew = fakeRuntime(s.world, approvingChild);
    const reply = await runCycleCommand("retomar", newSession.ctx, s.pi.api, runtimeNew.deps);
    assert.match(reply, /took the cycle over/);
    assert.equal(readRecord(s.world).ownerSession, "session-new");
    assert.equal(readRecord(s.world).epoch, 2);

    await until(() => oldSession.screen.status.get("ryker") === undefined, "old status cleared");
    assert.equal(oldSession.screen.widget.get("ryker"), undefined);
    assert.ok(
      oldSession.screen.notices.some((notice) => /another session took over|lost/i.test(notice)),
    );
    await first.handle.running;
    assert.equal(cycleHandles.has("session-old"), false);

    await until(() => !cycleHandles.has("session-new"), "new session to finish the cycle");
    const final = readRecord(s.world);
    assert.equal(final.ownerSession, "session-new");
    assert.equal(final.epoch, 2);
    assert.equal(final.closed, "stageNotBuilt");
  } finally {
    await shutdown(s, oldSession);
    await shutdown(s, newSession);
    s.world.cleanup();
  }
});

test("major problem: /ryker parar pauses and /ryker retomar continues", async () => {
  const s = scenario();
  const session = fakeSession(s.world, "session-main");
  session.answers.select = cancelQuestion("en").other;
  let blocked = true;
  try {
    const { handle } = await start(s, session, "session-main", (request, role) => {
      if (blocked) {
        blocked = false;
        return abortable(request);
      }
      return approvingChild(request, role);
    });
    await until(() => handle.driver.isExecuting(), "the planner to be executing");

    await command(s, "parar", session);
    assert.ok(
      session.screen.notices.some((notice) => /Cancelling the running execution/.test(notice)),
    );
    await until(
      () => readRecord(s.world).runState === "paused" && !readRecord(s.world).cancelQuestion,
      "the cycle to pause",
    );
    const paused = readRecord(s.world);
    assert.equal(paused.cycle.round, 1);
    assert.equal(paused.cycle.phase, "planning");
    assert.equal(paused.closed, undefined);

    await command(s, "retomar", session);
    assert.ok(session.screen.notices.some((notice) => /Cycle resumed/.test(notice)));
    await until(() => !cycleHandles.has("session-main"), "the resumed cycle to finish");
    const final = readRecord(s.world);
    assert.equal(final.closed, "stageNotBuilt");
    assert.equal(final.cycle.round, 1);
  } finally {
    await shutdown(s, session);
    s.world.cleanup();
  }
});

test("major problem: tampered control files are restored and the round fails", async () => {
  const s = scenario();
  const session = fakeSession(s.world, "session-main");
  const gitDir = join(s.world.project, ".git");
  const exclude = join(gitDir, "info", "exclude");
  const config = join(gitDir, "config");
  const hook = join(gitDir, "hooks", "pre-commit");
  mkdirSync(join(gitDir, "info"), { recursive: true });
  const before = { config: readFileSync(config, "utf8") };
  try {
    const { handle } = await start(s, session, "session-main", (request) => {
      writeFileSync(join(s.world.project, ".pi", "ryker", "ciclo.json"), "{}");
      appendFileSync(exclude, "evil-pattern\n");
      appendFileSync(config, '[remote "origin"]\n\turl = https://example.invalid/x.git\n');
      mkdirSync(join(gitDir, "hooks"), { recursive: true });
      writeFileSync(hook, "#!/bin/sh\nexit 0\n");
      writeFileSync(planPath(cycleDirOfRequest(request)), VALID_PLAN);
      return {};
    });
    await handle.running;

    const record = readRecord(s.world);
    assert.equal(record.cycle.phase, "stopped");
    assert.doesNotMatch(readFileSync(exclude, "utf8"), /evil-pattern/);
    assert.equal(record.cycle.round, 2);
    assert.match(readFileSync(exclude, "utf8"), /\.pi\/ryker/);
    assert.equal(readFileSync(config, "utf8"), before.config);
    assert.equal(existsSync(hook), false);
    assert.equal(
      session.screen.notices.filter((notice) => /restored, round failed/.test(notice)).length >= 2,
      true,
    );
  } finally {
    await shutdown(s, session);
    s.world.cleanup();
  }
});

test("major problem: a child git push and edits of .git or auth paths are refused", async () => {
  const s = scenario();
  const session = fakeSession(s.world, "session-main");
  const decisions: Record<string, { block?: boolean; reason?: string } | undefined> = {};
  try {
    const { handle } = await start(s, session, "session-main", async (request) => {
      const guard = probeChildGuard(request);
      const project = s.world.project;
      decisions.push = await guard.call("bash", { command: "git push origin main" });
      decisions.gitConfig = await guard.call("bash", {
        command: "git config remote.origin.url https://example.invalid/x.git",
      });
      decisions.gitEdit = await guard.call("edit", {
        path: join(project, ".git", "config"),
        edits: [{ oldText: "a", newText: "b" }],
      });
      decisions.hookWrite = await guard.call("write", {
        path: join(project, ".git", "hooks", "pre-commit"),
        content: "x",
      });
      decisions.authRead = await guard.call("bash", {
        command: `cat ${join(homedir(), ".pi", "agent", "auth.json")}`,
      });
      decisions.authWrite = await guard.call("write", {
        path: join(homedir(), ".pi", "agent", "auth.json"),
        content: "{}",
      });
      decisions.ownFile = await guard.call("write", {
        path: planPath(cycleDirOfRequest(request)),
        content: VALID_PLAN,
      });
      return {};
    });
    await handle.running;

    for (const name of ["push", "gitConfig", "gitEdit", "hookWrite", "authRead", "authWrite"]) {
      assert.equal(decisions[name]?.block, true, `${name} must be refused`);
    }
    assert.match(decisions.push?.reason ?? "", /git push is not allowed/);
    assert.equal(decisions.ownFile?.block, undefined);
  } finally {
    await shutdown(s, session);
    s.world.cleanup();
  }
});

test("major problem: a failed plan check feeds verificacao-codigo.md into the next round", async () => {
  const s = scenario();
  const session = fakeSession(s.world, "session-main");
  let plannerRuns = 0;
  let feedbackSeenByRoundTwo = "";
  try {
    const { handle, requests } = await start(s, session, "session-main", (request, role) => {
      if (role === "reviewer") return approvingChild(request, role);
      plannerRuns += 1;
      const cycleDir = cycleDirOfRequest(request);
      mkdirSync(cycleDir, { recursive: true });
      if (plannerRuns === 1) {
        writeFileSync(planPath(cycleDir), "## Tasks\n### T1 (stage 3)\n");
        return {};
      }
      feedbackSeenByRoundTwo = readFileSync(codeCheckFeedbackPath(cycleDir), "utf8");
      writeFileSync(planPath(cycleDir), VALID_PLAN);
      return {};
    });
    await handle.running;

    const feedbackPath = codeCheckFeedbackPath(cycleDirOfRequest(requests[0] as never));
    assert.equal(requests[0]?.prompt.includes(feedbackPath), false);
    assert.equal(requests[1]?.prompt.includes(feedbackPath), true);
    assert.match(feedbackSeenByRoundTwo, /Tasks has no task/);
    assert.match(feedbackSeenByRoundTwo, /missing section: Production order/);
    assert.equal(readFileSync(feedbackPath, "utf8"), "");
    const final = readRecord(s.world);
    assert.equal(final.cycle.round, 2);
    assert.equal(final.closed, "stageNotBuilt");
  } finally {
    await shutdown(s, session);
    s.world.cleanup();
  }
});

test("major problem: a stale ctx after a session switch does not crash the driver", async () => {
  const s = scenario();
  const session = fakeSession(s.world, "session-main");
  try {
    const { handle } = await start(s, session, "session-main", (request) => abortable(request));
    await until(() => handle.driver.isExecuting(), "the planner to be executing");

    session.invalidate();
    handle.driver.stop();
    await handle.running;

    const record = readRecord(s.world);
    assert.equal(record.runState, "paused");
    assert.equal(record.cancelQuestion, true);
    assert.equal(record.closed, undefined);
    await handle.shutdown();
    assert.equal(cycleHandles.has("session-main"), false);
  } finally {
    s.world.cleanup();
  }
});
