import assert from "node:assert/strict";
import { test } from "node:test";
import { newCycleRecord, parseCycleRecord, serializeCycleRecord } from "./cycleRecord.ts";

const record = newCycleRecord({
  cycleId: "2026-10-27-1000-demo",
  ownerSession: "s1",
  epoch: 1,
  directories: ["/p"],
  language: "en",
});

test("record: starts running at stage 2 round 1", () => {
  assert.equal(record.runState, "running");
  assert.deepEqual(record.cycle, { stage: 2, round: 1, phase: "planning" });
});

test("record: round-trips through serialization", () => {
  assert.deepEqual(parseCycleRecord(serializeCycleRecord(record)), record);
});

test("record: refuses broken or foreign files", () => {
  assert.equal(parseCycleRecord("{"), undefined);
  assert.equal(parseCycleRecord('{"version":2}'), undefined);
});
