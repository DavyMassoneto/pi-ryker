import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  contextFilesFor,
  isEnvironmentPath,
  replaceProjectContextFiles,
  replaceProjectSkills,
  skillFoldersFor,
} from "./stageEnvironment.ts";

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

test("stage environment: project context files are replaced by the final-branch ones (S7)", () => {
  const root = resolve("/repo");
  const base = [
    { path: resolve("/agent/AGENTS.md"), content: "global" },
    { path: resolve("/repo/AGENTS.md"), content: "working tree" },
  ];
  const branch = [{ path: resolve("/repo/AGENTS.md"), content: "final branch" }];
  assert.deepEqual(replaceProjectContextFiles(base, root, branch), [
    { path: resolve("/agent/AGENTS.md"), content: "global" },
    { path: resolve("/repo/AGENTS.md"), content: "final branch" },
  ]);
});

test("stage environment: project skills are replaced, user and package skills stay (S7)", () => {
  const base = [
    { name: "mine", sourceInfo: { scope: "user" } },
    { name: "local", sourceInfo: { scope: "project" } },
  ];
  const branch = [{ name: "tracked", sourceInfo: { scope: "temporary" } }];
  assert.deepEqual(
    replaceProjectSkills(base, branch).map((skill) => skill.name),
    ["mine", "tracked"],
  );
});
