import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseCycleRecord } from "../src/core/cycleRecord.ts";
import { cycleHandles, startStageTwo } from "../src/pi/cycleHost.ts";
import {
  approvedDiscussion,
  approvingChild,
  createWorld,
  fakePi,
  fakeRuntime,
  fakeSession,
  git,
} from "./harness.ts";

test("happy path: an approved discussion runs stage 2 to approval and leaves its marks", async () => {
  const world = createWorld();
  const session = fakeSession(world, "session-main");
  const pi = fakePi();
  const runtime = fakeRuntime(world, approvingChild);
  try {
    const started = await startStageTwo(pi.api, session.ctx, approvedDiscussion(), runtime.deps);
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const { cycleId } = started;
    const handle = cycleHandles.get("session-main");
    assert.ok(handle);
    await handle.running;

    const record = parseCycleRecord(
      readFileSync(join(world.project, ".pi", "ryker", "ciclo.json"), "utf8"),
    );
    assert.ok(record);
    assert.equal(record.cycle.phase, "approved");
    assert.equal(record.closed, "stageNotBuilt");
    assert.equal(record.runState, "paused");
    assert.ok(record.tokens.length > 0);
    assert.match(session.screen.statusHistory.at(-1) ?? "", /Planning · stage 3 not available · /);
    assert.match((session.screen.widgetHistory.at(-1) ?? [])[0] ?? "", /stage 3 not available$/);
    assert.equal(pi.messages.length, 1);
    assert.match(pi.messages[0] ?? "", /stage 2 \(Planning\) approved/);
    assert.match(pi.messages[0] ?? "", /plano\.md/);
    assert.match(pi.messages[0] ?? "", /Stage 3 is not available in this version/);

    assert.match(
      readFileSync(join(world.project, ".git", "info", "exclude"), "utf8"),
      /^\.pi\/ryker$/m,
    );

    const refs = git(world.project, "for-each-ref", "refs/ryker", "--format=%(refname)");
    assert.match(refs, new RegExp(`refs/ryker/${cycleId}/`));
    assert.match(refs, /planner/);
    assert.match(refs, /reviewer/);

    assert.ok(session.screen.statusHistory.some((text) => /2\/6 Planning/.test(text)));
    assert.ok(session.screen.statusHistory.some((text) => /round 1\/2/.test(text)));
    assert.ok(session.screen.statusHistory.some((text) => /\d+(\.\d+)?k/.test(text)));
    assert.match((session.screen.widgetHistory.at(-1) ?? []).join(" "), /round 1 approved · 130k/);
    assert.ok(
      session.screen.widgetHistory.some((lines) => lines.some((line) => /Planning/.test(line))),
    );

    assert.equal(runtime.requests.length, 2);
    assert.match(runtime.requests[0]?.prompt ?? "", /Ryker planner/);
    assert.match(runtime.requests[1]?.prompt ?? "", /Ryker reviewer/);
    assert.equal(existsSync(join(world.project, ".pi", "ryker", "trava.json")), false);
    assert.equal(cycleHandles.has("session-main"), false);
  } finally {
    world.cleanup();
  }
});
