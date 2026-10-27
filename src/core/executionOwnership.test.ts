import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { assignChanges, ownsChange } from "./executionOwnership.ts";

const CYCLE = join("/h", "cycle");
const PLANNER = join(CYCLE, "tentativa-001", "etapa-2", "rodada-001", "planner-01");
const REVIEWER = join(CYCLE, "tentativa-001", "etapa-2", "rodada-001", "reviewer-01");
const planner = { folder: PLANNER, output: join(CYCLE, "plano.md") };
const reviewer = { folder: REVIEWER, output: join(REVIEWER, "revisao.md") };

const change = (path: string, before?: string, after?: string) => ({ path, before, after });

test("ownership: an execution owns its output and the progress and transcripts of its own folder (P5)", () => {
  assert.equal(ownsChange(planner, change(join(CYCLE, "plano.md"), "a", "b")), true);
  assert.equal(ownsChange(planner, change(join(PLANNER, "progresso.md"), undefined, "p")), true);
  assert.equal(ownsChange(planner, change(join(PLANNER, "s.jsonl"), undefined, "x")), true);
  assert.equal(ownsChange(reviewer, change(join(REVIEWER, "revisao.md"), undefined, "r")), true);
});

test("ownership: runtime files are never owned outside the execution's own folder (R6, d)", () => {
  assert.equal(ownsChange(planner, change(join(REVIEWER, "progresso.md"), undefined, "p")), false);
  assert.equal(ownsChange(planner, change(join(REVIEWER, "s.jsonl"), undefined, "x")), false);
  assert.equal(ownsChange(planner, change(join(CYCLE, "progresso.md"), undefined, "p")), false);
  assert.equal(ownsChange(planner, change(join(PLANNER, "plan-template.md"), "t", "x")), false);
  assert.equal(ownsChange(reviewer, change(join(CYCLE, "plano.md"), "a", "b")), false);
});

test("ownership: an existing transcript only accepts appends (N33)", () => {
  const path = join(PLANNER, "s.jsonl");
  assert.equal(ownsChange(planner, change(path, "a\n", "a\nb\n")), true);
  assert.equal(ownsChange(planner, change(path, "a\n", "forged\n")), false);
  assert.equal(ownsChange(planner, change(path, "a\n", undefined)), false);
});

test("ownership: changes split into the running execution's, late ones of discarded executions and foreign ones", () => {
  const owners = assignChanges(
    [
      change(join(CYCLE, "plano.md"), "a", "b"),
      change(join(REVIEWER, "revisao.md"), undefined, "late"),
      change(join(CYCLE, "visao.html"), "v", "x"),
    ],
    planner,
    [reviewer],
  );
  assert.deepEqual(owners, {
    own: [join(CYCLE, "plano.md")],
    late: [join(REVIEWER, "revisao.md")],
    foreign: [join(CYCLE, "visao.html")],
  });
});

test("ownership: between executions only discarded executions own anything", () => {
  const owners = assignChanges([change(join(PLANNER, "progresso.md"), "a", "b")], undefined, []);
  assert.deepEqual(owners.foreign, [join(PLANNER, "progresso.md")]);
});
