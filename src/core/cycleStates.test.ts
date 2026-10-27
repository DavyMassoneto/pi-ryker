import assert from "node:assert/strict";
import { test } from "node:test";
import { abilities, commandDecision } from "./cycleStates.ts";

test("running: edit refused in every session, owner included (U18.16, C3a, Q20)", () => {
  assert.equal(abilities("running", "owner").editAllowed, false);
  assert.equal(abilities("running", "reader").editAllowed, false);
});

test("running: memory writes refused only in the owner session (Q: C8)", () => {
  assert.equal(abilities("running", "owner").memoryWriteAllowed, false);
  assert.equal(abilities("paused", "owner").memoryWriteAllowed, true);
});

test("running: skills of pi-superpowers are neutralized, paused: back to normal (Q Neutralizar)", () => {
  assert.equal(abilities("running", "owner").neutralizeSkills, true);
  assert.equal(abilities("paused", "owner").neutralizeSkills, false);
});

test("paused and awaiting approval: all tools free except remote git, pi-web, subagent (C5a, C5b, P36)", () => {
  for (const state of ["paused", "awaitingApproval"] as const) {
    const a = abilities(state, "owner");
    assert.equal(a.editAllowed, true);
    assert.equal(a.remoteGitAllowed, false);
    assert.equal(a.piWebAllowed, false);
    assert.equal(a.subagentAllowed, false);
  }
});

test("remote git, pi-web and subagent are refused in every state and role (C14.4, P4, SUP-45)", () => {
  for (const state of ["running", "paused", "awaitingApproval"] as const) {
    for (const role of ["owner", "reader"] as const) {
      const a = abilities(state, role);
      assert.equal(a.remoteGitAllowed || a.piWebAllowed || a.subagentAllowed, false);
    }
  }
});

test("reader session only has /ryker and takeover (C3b)", () => {
  assert.deepEqual(abilities("running", "reader").commands, ["status", "takeover"]);
  assert.equal(commandDecision("paused", "reader", "resume", false).ok, false);
  assert.equal(commandDecision("paused", "reader", "takeover", false).ok, true);
});

test("running: stop and pause accepted, back/end/off refused during an execution (Q Recusa durante execucao)", () => {
  assert.equal(commandDecision("running", "owner", "stop", true).ok, true);
  for (const command of ["back", "end", "off"] as const) {
    assert.equal(commandDecision("running", "owner", command, true).ok, false);
  }
});

test("pause during an execution waits for its end (P36, SUP-43)", () => {
  assert.deepEqual(commandDecision("running", "owner", "pause", true), {
    ok: true,
    deferred: true,
  });
  assert.deepEqual(commandDecision("running", "owner", "pause", false), {
    ok: true,
    deferred: false,
  });
});

test("paused: resume, back, end, off accepted (Estados)", () => {
  for (const command of ["resume", "back", "end", "off"] as const) {
    assert.equal(commandDecision("paused", "owner", command, false).ok, true);
  }
  assert.equal(commandDecision("paused", "owner", "pause", false).ok, false);
});

test("awaiting approval: pause accepted and approve command available (D-EV8-ESP)", () => {
  assert.equal(commandDecision("awaitingApproval", "owner", "pause", false).ok, true);
  assert.equal(commandDecision("awaitingApproval", "owner", "approve", false).ok, true);
  assert.equal(commandDecision("paused", "owner", "approve", false).ok, false);
});
