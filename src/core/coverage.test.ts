import assert from "node:assert/strict";
import { test } from "node:test";
import { planHeadings } from "./coverage.ts";

test("coverage: lists the level 2 headings of the plan", () => {
  const text = "## Tasks\n### T1\n- x\n## Production order\n## Defect tasks   (only on a return)";
  assert.deepEqual(planHeadings(text), ["Tasks", "Production order", "Defect tasks"]);
});
