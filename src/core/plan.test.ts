import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePlan } from "./plan.ts";

const SECTIONS = `## Production order
- 3 | nucleo | T1
## Test dependencies
- repo | package.json | none
## Test scripts and config
- none
## Shared files
- none
## Characterization tests
- none
## Obsolete tests
- none
## Separate test commands
- none
## Old tests to alter
- none
## Stage 4 may be empty
- no
## Assumptions
- chose X | because Y
`;

const TASK = `### T1
- repository: .
- owner: nucleo
- paths: src/core | src/pi
- tests: src/core/a.test.ts | npm test
- stubs: none
`;

const plan = (tasks = TASK, rest = SECTIONS) => `## Tasks\n${tasks}${rest}`;
const owners = ["nucleo"];

test("valid plan passes and exposes its tasks (Q O plano divide)", () => {
  const result = validatePlan(plan(), { owners });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.plan.tasks[0]?.owner, "nucleo");
  assert.deepEqual(result.ok && result.plan.tasks[0]?.paths, ["src/core", "src/pi"]);
});

test("plan without an architecture field is valid (D-USR-REVISORES-ARQUITETURA)", () => {
  assert.equal(validatePlan(plan(), { owners }).ok, true);
});

test("each missing fixed section is reported (modelo A)", () => {
  for (const heading of ["Production order", "Test dependencies", "Shared files", "Assumptions"]) {
    const without = SECTIONS.replace(`## ${heading}\n`, "## Other\n");
    const result = validatePlan(plan(TASK, without), { owners });
    assert.equal(result.ok, false);
    assert.match(
      result.ok ? "" : result.problems.join("\n"),
      new RegExp(`missing section: ${heading}`),
    );
  }
});

test("task without owner, paths or tests is reported (Q O plano divide, S6)", () => {
  for (const field of ["owner", "paths", "tests"]) {
    const broken = TASK.split("\n")
      .filter((l) => !l.startsWith(`- ${field}:`))
      .join("\n");
    const result = validatePlan(plan(`${broken}\n`), { owners });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.problems.join("\n"), new RegExp(`T1.*${field}`));
  }
});

test("tests entry needs a file and a command (P28)", () => {
  const result = validatePlan(
    plan(TASK.replace("src/core/a.test.ts | npm test", "src/core/a.test.ts")),
    { owners },
  );
  assert.equal(result.ok, false);
});

test("owner outside the configuration is reported; global role is accepted (Q O plano divide)", () => {
  assert.equal(validatePlan(plan(TASK.replace("nucleo", "ghost")), { owners }).ok, false);
  assert.equal(validatePlan(plan(TASK.replace("nucleo", "global")), { owners }).ok, true);
});

test("plan without any task is invalid", () => {
  assert.equal(validatePlan(plan(""), { owners }).ok, false);
});

test("Stage 4 may be empty needs yes or no (Q Caracterizacao + etapa vazia)", () => {
  const maybe = SECTIONS.replace("may be empty\n- no", "may be empty\n- maybe");
  const result = validatePlan(plan(TASK, maybe), { owners });
  assert.equal(result.ok, false);
});

test("Defect tasks section is required only on a return from stage 5 (SUP-28)", () => {
  assert.equal(validatePlan(plan(), { owners, returnFromStage5: true }).ok, false);
  const withDefects = plan(
    TASK,
    `${SECTIONS}## Defect tasks\n- T2 | defect: x | conflict file: none\n`,
  );
  assert.equal(validatePlan(withDefects, { owners, returnFromStage5: true }).ok, true);
});
