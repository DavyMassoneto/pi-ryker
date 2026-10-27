import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptBranch,
  checkBranchAndHead,
  createCycleId,
  cycleBranch,
  gitArgs,
  restorePointRef,
  stopBranch,
  userBranch,
} from "./gitRefs.ts";

test("cycle id is date, time and a slug of the title cut at 40 chars (Mec8, C2b)", () => {
  const id = createCycleId(new Date(2026, 9, 26, 14, 12), "Busca Semântica: Índice & Cache");
  assert.equal(id, "2026-10-26-1412-busca-semantica-indice-cache");
  const long = createCycleId(new Date(2026, 0, 2, 3, 4), "a".repeat(60));
  assert.equal(long, `2026-01-02-0304-${"a".repeat(40)}`);
});

test("branch names follow Mec8, M6a and P-13", () => {
  assert.equal(cycleBranch("c"), "ryker/c");
  assert.equal(attemptBranch("c", 2), "ryker/c-tentativa-2");
  assert.equal(stopBranch("c", 2, 3), "ryker/c-tentativa-2-parada-3");
  assert.equal(userBranch("c", 1), "ryker/c-usuario-1");
});

test("restore point lives in a hidden ref under refs/ryker/<cycle> (Mec9)", () => {
  assert.equal(restorePointRef("c", "etapa-2-rodada-1"), "refs/ryker/c/etapa-2-rodada-1");
});

test("every git command runs with core.fsmonitor=false (SUP-44)", () => {
  assert.deepEqual(gitArgs(["status"]).slice(0, 2), ["-c", "core.fsmonitor=false"]);
});

test("round commands run without hooks, with an empty hooks folder (P33)", () => {
  const args = gitArgs(["commit", "-m", "test: x"], { hooksDir: "/empty" });
  assert.ok(args.join(" ").includes("core.hooksPath=/empty"));
});

test("restore point commits are unsigned (C13.2)", () => {
  const args = gitArgs(["commit-tree", "x"], { unsigned: true });
  assert.ok(args.join(" ").includes("commit.gpgsign=false"));
});

test("branch and HEAD check: any difference fails the round (P6, Mec7)", () => {
  const expected = { branch: "ryker/c", head: "abc" };
  assert.equal(checkBranchAndHead(expected, expected).ok, true);
  assert.equal(checkBranchAndHead(expected, { branch: "main", head: "abc" }).ok, false);
  assert.equal(checkBranchAndHead(expected, { branch: "ryker/c", head: "def" }).ok, false);
});
