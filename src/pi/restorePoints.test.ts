import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type GitRunner, gitRunner } from "./gitExec.ts";
import { captureRestorePoint, restoreWorkspace, verifyWorkspace } from "./restorePoints.ts";

function repository(): { dir: string; git: GitRunner; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), "ryker-git-"));
  const git = gitRunner(dir);
  git.run(["init", "-q", "-b", "main"]);
  git.run(["config", "user.name", "Test"]);
  git.run(["config", "user.email", "test@example.com"]);
  git.run(["config", "commit.gpgsign", "true"]);
  writeFileSync(join(dir, "a.txt"), "one\n");
  writeFileSync(join(dir, ".gitignore"), "ignored.log\n");
  git.run(["add", "-A"]);
  git.run(["-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"]);
  return { dir, git, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("restore point: an unsigned hidden ref with every non-ignored file, HEAD untouched (Mec9, C13.2)", () => {
  const repo = repository();
  try {
    writeFileSync(join(repo.dir, "untracked.txt"), "work\n");
    writeFileSync(join(repo.dir, "ignored.log"), "noise\n");
    const head = repo.git.run(["rev-parse", "HEAD"]).trim();
    const point = captureRestorePoint(repo.git, "c1", "tentativa-001-etapa-2-rodada-001-planner");
    assert.equal(point.ref, "refs/ryker/c1/tentativa-001-etapa-2-rodada-001-planner");
    assert.equal(repo.git.run(["rev-parse", point.ref]).trim(), point.commit);
    assert.equal(repo.git.run(["rev-parse", "HEAD"]).trim(), head);
    const files = repo.git.run(["ls-tree", "--name-only", point.commit]).split("\n");
    assert.ok(files.includes("untracked.txt"));
    assert.ok(!files.includes("ignored.log"));
    assert.doesNotMatch(repo.git.run(["cat-file", "-p", point.commit]), /gpgsig/);
    assert.equal(repo.git.run(["status", "--porcelain"]).trim(), "?? untracked.txt");
  } finally {
    repo.cleanup();
  }
});

test("restore point: an untouched workspace passes the branch and HEAD check (P6)", () => {
  const repo = repository();
  try {
    const point = captureRestorePoint(repo.git, "c1", "run");
    assert.deepEqual(verifyWorkspace(repo.git, point), { ok: true });
  } finally {
    repo.cleanup();
  }
});

test("restore point: a commit by the agent fails the check and is undone (P6, Mec7)", () => {
  const repo = repository();
  try {
    const point = captureRestorePoint(repo.git, "c1", "run");
    writeFileSync(join(repo.dir, "a.txt"), "agent\n");
    repo.git.run(["-c", "commit.gpgsign=false", "commit", "-q", "-am", "agent"]);
    const check = verifyWorkspace(repo.git, point);
    assert.equal(check.ok, false);
    assert.match(check.ok ? "" : check.reason, /HEAD is/);
    restoreWorkspace(repo.git, point);
    assert.equal(repo.git.run(["rev-parse", "HEAD"]).trim(), point.head);
    assert.equal(readFileSync(join(repo.dir, "a.txt"), "utf8"), "one\n");
    assert.deepEqual(verifyWorkspace(repo.git, point), { ok: true });
  } finally {
    repo.cleanup();
  }
});

test("restore point: a branch switch by the agent fails the check and is undone (P6, Mec9)", () => {
  const repo = repository();
  try {
    const point = captureRestorePoint(repo.git, "c1", "run");
    repo.git.run(["checkout", "-q", "-b", "elsewhere"]);
    const check = verifyWorkspace(repo.git, point);
    assert.match(check.ok ? "" : check.reason, /branch is elsewhere, expected main/);
    restoreWorkspace(repo.git, point);
    assert.equal(repo.git.run(["symbolic-ref", "--short", "HEAD"]).trim(), "main");
  } finally {
    repo.cleanup();
  }
});

test("restore point: file changes by the agent are reported and restored, ignored files stay (P22, Q Desfaz e reprova)", () => {
  const repo = repository();
  try {
    writeFileSync(join(repo.dir, "mine.txt"), "user work\n");
    const point = captureRestorePoint(repo.git, "c1", "run");
    writeFileSync(join(repo.dir, "a.txt"), "changed\n");
    rmSync(join(repo.dir, "mine.txt"));
    writeFileSync(join(repo.dir, "new.txt"), "agent file\n");
    writeFileSync(join(repo.dir, "ignored.log"), "build output\n");
    const check = verifyWorkspace(repo.git, point);
    assert.match(check.ok ? "" : check.reason, /a\.txt/);
    restoreWorkspace(repo.git, point);
    assert.equal(readFileSync(join(repo.dir, "a.txt"), "utf8"), "one\n");
    assert.equal(readFileSync(join(repo.dir, "mine.txt"), "utf8"), "user work\n");
    assert.equal(existsSync(join(repo.dir, "new.txt")), false);
    assert.equal(existsSync(join(repo.dir, "ignored.log")), true);
    assert.equal(repo.git.run(["status", "--porcelain"]).trim(), "?? mine.txt");
  } finally {
    repo.cleanup();
  }
});
