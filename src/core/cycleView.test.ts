import assert from "node:assert/strict";
import { test } from "node:test";
import { newCycleRecord } from "./cycleRecord.ts";
import { cycleReport, ownerStatus, ownerWidget, readerStatus, stageName } from "./cycleView.ts";

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

const approvedEnded = {
  ...base,
  runState: "paused" as const,
  cycle: { ...base.cycle, round: 2, phase: "approved" as const },
  closed: "stageNotBuilt" as const,
};

test("view: report of a closed cycle lists stages, plan path and the way to a new Discussion", () => {
  const text = cycleReport(approvedEnded, "none", "/h/plano.md");
  assert.match(text, /stage 3 not available/);
  assert.match(text, /\[x\] 2 Planning/);
  assert.match(text, /Plan: \/h\/plano\.md/);
  assert.match(text, /\/ryker <request>/);
});

test("view: report uses the cycle language", () => {
  const text = cycleReport({ ...approvedEnded, language: "pt-BR" }, "none", "/h/plano.md");
  assert.match(text, /Plano: \/h\/plano\.md/);
  assert.match(text, /\/ryker <pedido>/);
});

test("view: report of a paused open cycle offers the exits, not a new Discussion", () => {
  const paused = { ...base, runState: "paused" as const };
  const owner = cycleReport(paused, "owner");
  assert.match(owner, /\/ryker retomar/);
  assert.doesNotMatch(owner, /<request>/);
  const reader = cycleReport(paused, "reader");
  assert.match(reader, /read only/);
});
