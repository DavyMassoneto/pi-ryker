import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { repositoriesText, validatePlan } from "./plan.ts";

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

test("task without a repository is reported (B12)", () => {
  const broken = TASK.replace("- repository: .\n", "");
  const result = validatePlan(plan(broken), { owners });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.problems.join("\n"), /T1.*repository/);
});

const withRepository = (value: string) =>
  plan(TASK.replace("repository: .", `repository: ${value}`));
const absolute = resolve("/work/app");

test("repository is normalised before the comparison (B12)", () => {
  const options = { owners, repositories: [absolute] };
  for (const value of [".", "./", absolute, absolute.replace(/\\/g, "/"), `${absolute}/`]) {
    assert.equal(validatePlan(withRepository(value), options).ok, true, value);
  }
  assert.equal(validatePlan(withRepository("../other"), options).ok, false);
  assert.equal(validatePlan(withRepository("sub"), options).ok, false);
});

test("repository comparison ignores case on win32 only", () => {
  const options = { owners, repositories: [absolute] };
  const result = validatePlan(withRepository(absolute.toUpperCase()), options).ok;
  assert.equal(result, process.platform === "win32");
});

test("a relative repository is not resolved when the cycle has several repositories", () => {
  const options = { owners, repositories: [absolute, resolve("/work/lib")] };
  assert.equal(validatePlan(withRepository("."), options).ok, false);
  assert.equal(validatePlan(withRepository(absolute), options).ok, true);
});

test("the repository error names the accepted repositories (B12)", () => {
  const result = validatePlan(withRepository("nowhere"), { owners, repositories: [absolute] });
  assert.equal(result.ok, false);
  const text = result.ok ? "" : result.problems.join("\n");
  assert.match(text, /T1.*repository nowhere is not a cycle repository/);
  assert.ok(text.includes(absolute));
  assert.match(text, /"\."/);
});

test("repositoriesText lists the accepted values (B12)", () => {
  const text = repositoriesText([absolute]);
  assert.ok(text.includes(absolute));
  assert.match(text, /`\.`/);
});

test("task repository must be one of the cycle repositories (B12)", () => {
  assert.equal(validatePlan(plan(), { owners, repositories: ["."] }).ok, true);
  const result = validatePlan(withRepository("elsewhere"), { owners, repositories: ["other"] });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.problems.join("\n"), /T1.*repository elsewhere is not/);
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
