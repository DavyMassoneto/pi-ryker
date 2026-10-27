import assert from "node:assert/strict";
import { test } from "node:test";
import { contextFilesFor, isEnvironmentPath, skillFoldersFor } from "./stageEnvironment.ts";

test("stage environment: skills, agent definitions and context files are environment paths (S7)", () => {
  assert.equal(isEnvironmentPath("AGENTS.md"), true);
  assert.equal(isEnvironmentPath("pkg/CLAUDE.md"), true);
  assert.equal(isEnvironmentPath(".pi/skills/tdd/SKILL.md"), true);
  assert.equal(isEnvironmentPath("pkg/.agents/skills/x/SKILL.md"), true);
  assert.equal(isEnvironmentPath(".pi/agents/planner.md"), true);
  assert.equal(isEnvironmentPath("src/agents.ts"), false);
  assert.equal(isEnvironmentPath(".pi/ryker/config.json"), false);
});

test("stage environment: one context file per folder from the root to the cwd, in pi's order (S7)", () => {
  const files = [
    "AGENTS.md",
    "CLAUDE.md",
    "pkg/CLAUDE.md",
    "pkg/deep/AGENTS.md",
    "other/AGENTS.md",
  ];
  assert.deepEqual(contextFilesFor("pkg", files), ["AGENTS.md", "pkg/CLAUDE.md"]);
  assert.deepEqual(contextFilesFor("", files), ["AGENTS.md"]);
});

test("stage environment: project skill folders follow pi's discovery (S7)", () => {
  assert.deepEqual(skillFoldersFor("pkg"), [
    "pkg/.pi/skills",
    "pkg/.agents/skills",
    ".agents/skills",
  ]);
});
