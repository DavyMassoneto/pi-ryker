import assert from "node:assert/strict";
import { test } from "node:test";
import { advance, startCycle } from "./cycle.ts";

const planDone = { type: "planner", status: "DONE", planValid: true } as const;
const rejected = { type: "review", status: "REJECTED" } as const;

test("start: stage 2, round 1, planner next (U18.1)", () => {
  assert.deepEqual(startCycle(), { stage: 2, round: 1, phase: "planning" });
});

test("approve path: planner then reviewer approved (D-USR-METODO.2)", () => {
  const reviewing = advance(startCycle(), planDone);
  assert.equal(reviewing.phase, "reviewing");
  const approved = advance(reviewing, { type: "review", status: "APPROVED" });
  assert.equal(approved.phase, "approved");
});

test("rejected review in round 1 opens round 2 with the planner (D-USR-METODO.2)", () => {
  const next = advance(advance(startCycle(), planDone), rejected);
  assert.deepEqual(next, { stage: 2, round: 2, phase: "planning" });
});

test("second round failure stops the cycle (D-USR-METODO.2)", () => {
  let state = advance(advance(startCycle(), planDone), rejected);
  state = advance(advance(state, planDone), rejected);
  assert.equal(state.phase, "stopped");
  assert.equal(state.stop, "roundsExhausted");
});

test("BACK_TO_DISCUSSION from planner or reviewer returns to the Discussion (Q: C1)", () => {
  const fromPlanner = advance(startCycle(), {
    type: "planner",
    status: "BACK_TO_DISCUSSION",
    planValid: true,
  });
  assert.equal(fromPlanner.phase, "backToDiscussion");
  const fromReviewer = advance(advance(startCycle(), planDone), {
    type: "review",
    status: "BACK_TO_DISCUSSION",
  });
  assert.equal(fromReviewer.phase, "backToDiscussion");
});

test("BLOCKED stops without counting a round (Q STATUS BLOCKED, U18.7)", () => {
  const state = advance(startCycle(), { type: "planner", status: "BLOCKED", planValid: true });
  assert.equal(state.phase, "stopped");
  assert.equal(state.stop, "blocked");
  assert.equal(state.round, 1);
});

test("invalid plan counts as a failed round (SUP-6, Q3)", () => {
  const next = advance(startCycle(), { type: "planner", status: "DONE", planValid: false });
  assert.deepEqual(next, { stage: 2, round: 2, phase: "planning" });
});

test("review without STATUS counts as a failed round (Mec5, COB-2)", () => {
  const next = advance(advance(startCycle(), planDone), { type: "review", status: undefined });
  assert.equal(next.round, 2);
  assert.equal(next.phase, "planning");
});

test("failed code check counts as a round, also in round 2 (SUP-6)", () => {
  const first = advance(startCycle(), { type: "codeCheckFailed" });
  assert.deepEqual(first, { stage: 2, round: 2, phase: "planning" });
  const second = advance(first, { type: "codeCheckFailed" });
  assert.equal(second.phase, "stopped");
});

test("terminal phases ignore further events", () => {
  const stopped = advance(advance(startCycle(), { type: "codeCheckFailed" }), {
    type: "codeCheckFailed",
  });
  assert.equal(advance(stopped, planDone), stopped);
});
