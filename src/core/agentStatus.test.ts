import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAgentStatus } from "./agentStatus.ts";

test("last line STATUS is read (Mec5)", () => {
  assert.equal(parseAgentStatus("work\nSTATUS: DONE\n"), "DONE");
  assert.equal(parseAgentStatus("STATUS: BLOCKED"), "BLOCKED");
  assert.equal(parseAgentStatus("STATUS: BACK_TO_DISCUSSION"), "BACK_TO_DISCUSSION");
});

test("missing, misplaced or unknown STATUS is undefined (Mec5)", () => {
  assert.equal(parseAgentStatus("no status"), undefined);
  assert.equal(parseAgentStatus("STATUS: DONE\nmore"), undefined);
  assert.equal(parseAgentStatus("STATUS: MAYBE"), undefined);
});

test("E2E verdicts are accepted when allowed (modelo C)", () => {
  assert.equal(parseAgentStatus("STATUS: APPROVED", ["APPROVED", "REJECTED"]), "APPROVED");
  assert.equal(parseAgentStatus("STATUS: DONE", ["APPROVED", "REJECTED"]), undefined);
});
