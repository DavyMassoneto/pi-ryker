import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { decideProjectSessionCall, type OwnerRulesContext } from "./ownerRules.ts";

const context = (overrides: Partial<OwnerRulesContext> = {}): OwnerRulesContext => ({
  runState: "running",
  role: "owner",
  shell: {
    projectRoot: resolve("/proj"),
    allowedRoots: [],
    homeDir: resolve("/home/u"),
    piWeb: { hosts: ["localhost"], port: 3041 },
    gitAliases: {},
  },
  ...overrides,
});
const blocked = (
  toolName: string,
  input: Record<string, unknown>,
  overrides: Partial<OwnerRulesContext> = {},
): boolean => decideProjectSessionCall({ toolName, input }, context(overrides)).block;

test("owner rules: subagent is refused in every state, for owner and reader (SUP-45)", () => {
  for (const runState of ["running", "paused", "awaitingApproval"] as const) {
    for (const role of ["owner", "reader"] as const) {
      assert.equal(blocked("subagent", {}, { runState, role }), true);
    }
  }
});

test("owner rules: remote git is refused, local git passes (C14.4)", () => {
  assert.equal(blocked("bash", { command: "git push" }), true);
  assert.equal(blocked("bash", { command: "git fetch" }, { runState: "paused" }), true);
  assert.equal(blocked("bash", { command: "git status" }), false);
});

test("owner rules: edits are refused only while running (U18.16, C5a)", () => {
  assert.equal(blocked("edit", { path: "a.ts" }), true);
  assert.equal(blocked("edit", { path: "a.ts" }, { role: "reader" }), true);
  assert.equal(blocked("edit", { path: "a.ts" }, { runState: "paused" }), false);
});

test("owner rules: sessions without a cycle are untouched", () => {
  assert.equal(blocked("subagent", {}, { role: "none" }), false);
});

test("owner rules: pi-web address is refused in the shell (P4)", () => {
  assert.equal(blocked("bash", { command: "curl localhost:3041" }), true);
});
