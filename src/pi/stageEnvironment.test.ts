import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gitRunner } from "./gitExec.ts";
import { prepareStageEnvironment } from "./stageEnvironment.ts";

function repository() {
  const root = mkdtempSync(join(tmpdir(), "ryker-env-"));
  const dir = join(root, "repo");
  mkdirSync(join(dir, ".pi", "skills", "tdd"), { recursive: true });
  mkdirSync(join(dir, ".pi", "agents"), { recursive: true });
  const git = gitRunner(dir);
  git.run(["init", "-q", "-b", "main"]);
  git.run(["config", "user.name", "Test"]);
  git.run(["config", "user.email", "test@example.com"]);
  writeFileSync(join(dir, "AGENTS.md"), "final branch rules\n");
  writeFileSync(join(dir, ".pi", "skills", "tdd", "SKILL.md"), "---\nname: tdd\n---\nbody\n");
  writeFileSync(join(dir, ".pi", "agents", "planner.md"), "planner\n");
  writeFileSync(join(dir, "src.ts"), "code\n");
  git.run(["add", "-A"]);
  git.run(["commit", "-q", "-m", "init"]);
  return { root, dir, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("stage environment: AGENTS.md, skills and agent definitions come from the final branch, not the working tree (S7)", () => {
  const repo = repository();
  try {
    writeFileSync(join(repo.dir, "AGENTS.md"), "uncommitted edit\n");
    writeFileSync(join(repo.dir, ".pi", "skills", "tdd", "SKILL.md"), "edited skill\n");
    const targetDir = join(repo.root, "history", "etapa-2", "ambiente");
    const environment = prepareStageEnvironment(repo.git, {
      branch: "main",
      gitRoot: repo.dir,
      cwd: repo.dir,
      targetDir,
    });
    assert.deepEqual(environment.contextFiles, [
      { path: join(repo.dir, "AGENTS.md"), content: "final branch rules\n" },
    ]);
    assert.equal(
      readFileSync(join(targetDir, ".pi", "skills", "tdd", "SKILL.md"), "utf8"),
      "---\nname: tdd\n---\nbody\n",
    );
    assert.ok(environment.skillFolders.includes(join(targetDir, ".pi", "skills")));
    assert.deepEqual(environment.agentDefinitions, [
      join(targetDir, ".pi", "agents", "planner.md"),
    ]);
    assert.equal(existsSync(join(targetDir, "src.ts")), false);
  } finally {
    repo.cleanup();
  }
});

test("stage environment: read once at the start of the stage and reused for later runs (S7)", () => {
  const repo = repository();
  try {
    const targetDir = join(repo.root, "ambiente");
    const request = { branch: "main", gitRoot: repo.dir, cwd: repo.dir, targetDir };
    prepareStageEnvironment(repo.git, request);
    writeFileSync(join(repo.dir, "AGENTS.md"), "committed later\n");
    repo.git.run(["commit", "-q", "-am", "later"]);
    const again = prepareStageEnvironment(repo.git, request);
    assert.equal(again.contextFiles[0]?.content, "final branch rules\n");
  } finally {
    repo.cleanup();
  }
});
