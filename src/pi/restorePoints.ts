import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BranchHead,
  checkBranchAndHead,
  type RestorePoint,
  restorePointRef,
} from "../core/gitRefs.ts";
import type { GitRunner } from "./gitExec.ts";

export type { RestorePoint };

export type WorkspaceCheck = { ok: true } | { ok: false; reason: string };

const RESTORE_POINT_MESSAGE = "chore: ryker restore point";

function withTemporaryIndex<T>(use: (env: Record<string, string>) => T): T {
  const file = join(tmpdir(), `ryker-index-${randomUUID()}`);
  try {
    return use({ GIT_INDEX_FILE: file });
  } finally {
    rmSync(file, { force: true });
  }
}

const lines = (text: string, separator: string): string[] =>
  text.split(separator).filter((line) => line !== "");

export function currentBranchHead(git: GitRunner): BranchHead | undefined {
  const branch = git.tryRun(["symbolic-ref", "--quiet", "--short", "HEAD"])?.trim();
  const head = git.tryRun(["rev-parse", "--verify", "HEAD"])?.trim();
  return branch && head ? { branch, head } : undefined;
}

function workingTree(git: GitRunner, head: string): string {
  return withTemporaryIndex((env) => {
    git.run(["read-tree", head], env);
    git.run(["add", "-A", "--", "."], env);
    return git.run(["write-tree"], env).trim();
  });
}

export function captureRestorePoint(git: GitRunner, cycleId: string, label: string): RestorePoint {
  const position = currentBranchHead(git);
  if (!position) throw new Error("the repository is on a detached HEAD or has no commit");
  const tree = workingTree(git, position.head);
  const indexTree = git.run(["write-tree"]).trim();
  const commit = git
    .run(["commit-tree", tree, "-p", position.head, "-m", RESTORE_POINT_MESSAGE])
    .trim();
  const ref = restorePointRef(cycleId, label);
  git.run(["update-ref", ref, commit]);
  return { ...position, ref, commit, tree, indexTree };
}

export function verifyWorkspace(git: GitRunner, point: RestorePoint): WorkspaceCheck {
  const position = currentBranchHead(git) ?? { branch: "(detached)", head: "(unknown)" };
  const check = checkBranchAndHead(point, position);
  if (!check.ok) return check;
  const tree = workingTree(git, position.head);
  if (tree === point.tree) return { ok: true };
  const changed = lines(git.run(["diff-tree", "-r", "--name-only", point.tree, tree]), "\n");
  return { ok: false, reason: `files changed in the project: ${changed.join(", ")}` };
}

export function restoreWorkspace(git: GitRunner, point: RestorePoint): void {
  git.run(["update-ref", `refs/heads/${point.branch}`, point.head]);
  git.run(["symbolic-ref", "HEAD", `refs/heads/${point.branch}`]);
  withTemporaryIndex((env) => {
    git.run(["read-tree", point.tree], env);
    git.run(["checkout-index", "-a", "-f"], env);
    const created = lines(git.run(["ls-files", "--others", "--exclude-standard", "-z"], env), "\0");
    for (const path of created) rmSync(join(git.cwd, path), { force: true });
  });
  git.run(["read-tree", point.indexTree]);
}
