import assert from "node:assert/strict";
import { test } from "node:test";
import { newCycleRecord } from "./cycleRecord.ts";
import { ownerStatus, ownerWidget, readerStatus, stageName } from "./cycleView.ts";

const base = newCycleRecord({
  cycleId: "c1",
  ownerSession: "s1",
  epoch: 1,
  directories: ["/p"],
  language: "en",
});

test("view: owner status shows stage, round and tokens", () => {
  const line = ownerStatus({
    ...base,
    tokens: [{ stage: 2, model: "m", input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }],
  });
  assert.equal(line, "Ryker · 2/6 Planning · round 1/2 · 1.5k tokens");
});

test("view: reader status is read only", () => {
  assert.match(readerStatus(base), /read only/);
});

test("view: widget marks stage 2 current while running and done when approved", () => {
  assert.match(ownerWidget(base)[2] ?? "", /^\[>\] 2 Planning/);
  const approved = ownerWidget({ ...base, cycle: { ...base.cycle, phase: "approved" } });
  assert.match(approved[2] ?? "", /^\[x\] 2 Planning\s+round 1 approved/);
});

test("view: a closed cycle shows its end state in the status line and widget header", () => {
  const ended = { ...base, runState: "paused" as const, closed: "stageNotBuilt" as const };
  assert.equal(ownerStatus(ended), "Ryker · 2/6 Planning · stage 3 not available · 0 tokens");
  assert.match(ownerWidget(ended)[0] ?? "", /stage 3 not available$/);
  const pt = { ...ended, language: "pt" };
  assert.match(ownerStatus(pt), /etapa 3 indisponível/);
  assert.match(ownerWidget(pt)[0] ?? "", /etapa 3 indisponível$/);
});

test("view: stage names follow the language", () => {
  assert.equal(stageName(2, "pt-BR"), "Planejamento");
  assert.equal(stageName(2, "en"), "Planning");
});

test("the running widget names /ryker parar because the pi-web Stop button does not pause (B13)", () => {
  const record = newCycleRecord({
    cycleId: "c1",
    ownerSession: "s",
    epoch: 1,
    directories: ["/p"],
  });
  assert.match(ownerWidget(record).join("|"), /\/ryker parar/);
  assert.doesNotMatch(ownerWidget({ ...record, runState: "paused" }).join("|"), /parar/);
});
