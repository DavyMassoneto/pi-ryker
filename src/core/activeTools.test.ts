import assert from "node:assert/strict";
import { test } from "node:test";
import { RYKER_TOOLS, restoreToolSet, stageToolSet } from "./activeTools.ts";

test("stageToolSet: read/grep/find/ls + Ryker, without ask_user_question or editing", () => {
  const c = stageToolSet();
  for (const t of ["read", "grep", "find", "ls", ...RYKER_TOOLS]) assert.ok(c.includes(t), t);
  assert.ok(!c.includes("ask_user_question"));
  assert.ok(!c.includes("bash") && !c.includes("edit") && !c.includes("write"));
  assert.ok(RYKER_TOOLS.includes("ryker_perguntar"));
});

test("restoreToolSet returns the saved list (copy)", () => {
  const saved = ["read", "bash", "ask_user_question"];
  const r = restoreToolSet(saved);
  assert.deepEqual(r, saved);
  assert.notEqual(r, saved);
});
