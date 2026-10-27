import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { cycleHistoryDir, executionDir, projectKey } from "./cyclePaths.ts";

test("paths: project key is the folder name plus a stable 8 char hash", () => {
  const key = projectKey(join("/work", "toy"));
  assert.match(key, /^toy-[0-9a-f]{8}$/);
  assert.equal(projectKey(join("/work", "toy")), key);
  assert.notEqual(projectKey(join("/other", "toy")), key);
});

test("paths: cycle history lives under the agent dir", () => {
  const dir = cycleHistoryDir("/agent", "/work/toy", "c1");
  assert.ok(dir.startsWith(join("/agent", "ryker", "history")));
  assert.ok(dir.endsWith("c1"));
});

test("paths: execution folder addresses attempt, stage, round and role", () => {
  const dir = executionDir("/c", { attempt: 1, stage: 2, round: 2, role: "reviewer" });
  assert.equal(dir, join("/c", "tentativa-001", "etapa-2", "rodada-002", "reviewer-01"));
});
