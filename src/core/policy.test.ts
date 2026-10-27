import assert from "node:assert/strict";
import { test } from "node:test";
import { canWrite, type WritePolicy } from "./policy.ts";

const base = "/hist/cycle/tentativa-001/etapa-2/rodada-001";
const planner: WritePolicy = {
  role: "planner",
  allowed: ["/hist/cycle/plano.md", `${base}/planejador-01/progresso.md`],
};
const reviewer: WritePolicy = {
  role: "reviewer",
  allowed: [`${base}/revisor-01/revisao.md`, `${base}/revisor-01/progresso.md`],
};

test("planner writes only plan.md and its progress file (Q Nada e gravado, P5)", () => {
  assert.equal(canWrite(planner, "/hist/cycle/plano.md").ok, true);
  assert.equal(canWrite(planner, `${base}/planejador-01/progresso.md`).ok, true);
  assert.equal(canWrite(planner, "/project/src/a.ts").ok, false);
  assert.equal(canWrite(planner, `${base}/revisor-01/revisao.md`).ok, false);
});

test("reviewer writes only its review and its progress file (Q Desfaz e reprova)", () => {
  assert.equal(canWrite(reviewer, `${base}/revisor-01/revisao.md`).ok, true);
  assert.equal(canWrite(reviewer, `${base}/revisor-01/progresso.md`).ok, true);
  assert.equal(canWrite(reviewer, "/hist/cycle/plano.md").ok, false);
  assert.equal(canWrite(reviewer, "/project/src/a.ts").ok, false);
});

test("control files are never writable, even with traversal (P5)", () => {
  assert.equal(canWrite(planner, "/project/.pi/ryker/ciclo.json").ok, false);
  assert.equal(canWrite(planner, "/hist/cycle/../cycle/plano.md").ok, true);
  assert.equal(canWrite(planner, "/hist/cycle/x/../../other/plano.md").ok, false);
});

test("refusal carries a reason", () => {
  const result = canWrite(planner, "/project/src/a.ts");
  assert.equal(result.ok === false && result.reason.length > 0, true);
});
