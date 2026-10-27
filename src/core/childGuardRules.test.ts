import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { type ChildGuardContext, decideChildCall } from "./childGuardRules.ts";

const root = resolve("/proj");
const plan = resolve(root, "cycle", "plano.md");
const context = (overrides: Partial<ChildGuardContext> = {}): ChildGuardContext => ({
  epochStillMine: true,
  policy: { role: "planner", allowed: [plan, resolve(root, "cycle", "progresso.md")] },
  shell: {
    projectRoot: root,
    allowedRoots: [resolve("/vault")],
    homeDir: resolve("/home/u"),
    piWeb: { hosts: ["localhost"], port: 3041 },
    gitAliases: {},
  },
  ...overrides,
});
const call = (toolName: string, input: Record<string, unknown>) => ({ toolName, input });
const allowed = (toolName: string, input: Record<string, unknown>) =>
  decideChildCall(call(toolName, input), context()).allow;

test("child guard: lost epoch refuses every tool (r2-N7)", () => {
  const lost = context({ epochStillMine: false });
  assert.equal(decideChildCall(call("read", { path: "a.ts" }), lost).allow, false);
});

test("child guard: planner writes its plan and progress only (P5)", () => {
  assert.equal(allowed("write", { path: plan }), true);
  assert.equal(allowed("edit", { path: "src/a.ts" }), false);
  assert.equal(allowed("write", { path: resolve(root, ".pi", "ryker", "ciclo.json") }), false);
});

test("child guard: git push and pi-web port are refused in the shell (D-R4-GIT, P4)", () => {
  assert.equal(allowed("bash", { command: "git push origin main" }), false);
  assert.equal(allowed("bash", { command: "curl localhost:3041/api" }), false);
  assert.equal(allowed("bash", { command: "git diff" }), true);
});

test("child guard: shell paths outside the project are refused, the vault passes (SUP-46)", () => {
  assert.equal(allowed("bash", { command: "cat /etc/passwd" }), false);
  assert.equal(allowed("bash", { command: `cat ${resolve("/vault", "note.md")}` }), true);
});

test("child guard: reads outside the project are refused", () => {
  assert.equal(allowed("read", { path: "../secret.txt" }), false);
  assert.equal(allowed("read", { path: "src/a.ts" }), true);
});

test("child guard: fails closed on unknown tools and malformed input", () => {
  assert.equal(allowed("subagent", {}), false);
  assert.equal(allowed("bash", {}), false);
  assert.equal(allowed("write", {}), false);
});
