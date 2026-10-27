import assert from "node:assert/strict";
import { test } from "node:test";
import { cyclesTouching, type OpenCycleEntry } from "./openCycles.ts";

const index: OpenCycleEntry[] = [
  { cycleId: "c1", ownerSession: "s1", directories: ["/work/repo", "/work/other"] },
  { cycleId: "c2", ownerSession: "s9", directories: ["/work/second"] },
];

const ids = (dir: string): string[] => cyclesTouching(index, dir).map((c) => c.cycleId);

test("session in a subfolder of a cycle repository is found (SUP-51)", () => {
  assert.deepEqual(ids("/work/repo/packages/app"), ["c1"]);
});

test("session in a folder that contains a cycle repository is found (SUP-51)", () => {
  assert.deepEqual(ids("/work"), ["c1", "c2"]);
});

test("another project finds nothing (D-USR-ETAPAS-2-6-MACRO)", () => {
  assert.deepEqual(ids("/work/unrelated"), []);
  assert.deepEqual(ids("/work/repo-extra"), []);
});
