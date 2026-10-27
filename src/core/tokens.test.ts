import assert from "node:assert/strict";
import { test } from "node:test";
import { addUsage, grandTotal, totalsByModel, totalsByStage, usageTotal } from "./tokens.ts";

const usage = (stage: number, model: string, n: number) => ({
  stage,
  model,
  input: n,
  output: n,
  cacheRead: n,
  cacheWrite: n,
});

test("total of one usage sums the four counters (D-METODO-2)", () => {
  assert.equal(usageTotal(usage(2, "opus", 5)), 20);
});

test("sums by stage and by model (D-USR-ETAPAS-2-6-MACRO)", () => {
  let ledger = addUsage([], usage(2, "opus", 1));
  ledger = addUsage(ledger, usage(2, "sonnet", 2));
  ledger = addUsage(ledger, usage(3, "sonnet", 3));
  assert.deepEqual(totalsByStage(ledger).get(2), {
    input: 3,
    output: 3,
    cacheRead: 3,
    cacheWrite: 3,
    total: 12,
  });
  assert.equal(totalsByModel(ledger).get("sonnet")?.total, 20);
  assert.equal(grandTotal(ledger), 24);
});

test("adding usage does not mutate the previous ledger", () => {
  const first = addUsage([], usage(2, "opus", 1));
  addUsage(first, usage(2, "opus", 1));
  assert.equal(first.length, 1);
});
