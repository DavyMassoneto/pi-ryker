import assert from "node:assert/strict";
import { test } from "node:test";
import { findGitRoot } from "./gitRoot.ts";

test("git root is the nearest ancestor with a .git entry (SUP-33)", () => {
  const roots = new Set(["/work/repo"]);
  const hasGit = (dir: string) => roots.has(dir);
  assert.equal(findGitRoot("/work/repo/packages/app", hasGit), "/work/repo");
  assert.equal(findGitRoot("/work/repo", hasGit), "/work/repo");
  assert.equal(findGitRoot("/work/elsewhere", hasGit), undefined);
});
