import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  addOpenCycle,
  controlFs,
  ensureExcluded,
  fileLockStore,
  readOpenCycles,
  removeOpenCycle,
} from "./fsAdapters.ts";

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "ryker-fs-"));
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  mkdirSync(join(root, ".git", "info"), { recursive: true });
  mkdirSync(join(root, ".pi", "ryker"), { recursive: true });
  writeFileSync(join(root, ".git", "config"), "[core]\n");
  writeFileSync(join(root, ".git", "hooks", "pre-commit"), "#!/bin/sh\n");
  writeFileSync(join(root, ".git", "info", "exclude"), ".pi/ryker\n");
  writeFileSync(join(root, ".pi", "ryker", "ciclo.json"), "{}");
  return root;
}

test("fs: lock store creates exclusively and replaces only the expected text (SUP-33)", () => {
  const root = repository();
  const path = join(root, ".pi", "ryker", "trava.json");
  assert.equal(fileLockStore.createExclusive(path, "a"), true);
  assert.equal(fileLockStore.createExclusive(path, "b"), false);
  assert.equal(fileLockStore.replaceIfUnchanged(path, "x", "c"), false);
  assert.equal(fileLockStore.replaceIfUnchanged(path, "a", "c"), true);
  assert.equal(fileLockStore.read(path), "c");
  rmSync(root, { recursive: true });
});

test("fs: control snapshot covers ciclo.json, .git/config, hooks and info (SUP-44)", () => {
  const root = repository();
  const names = Object.keys(controlFs(root, root).snapshot([])).map((path) =>
    path.slice(root.length + 1).replaceAll("\\", "/"),
  );
  assert.deepEqual(names.sort(), [
    ".git/config",
    ".git/hooks/pre-commit",
    ".git/info/exclude",
    ".pi/ryker/ciclo.json",
  ]);
  rmSync(root, { recursive: true });
});

test("fs: restore undoes edits, removals and additions of control files (P5)", () => {
  const root = repository();
  const control = controlFs(root, root);
  const before = control.snapshot([]);
  writeFileSync(join(root, ".git", "config"), "[remote]\nurl=evil\n");
  rmSync(join(root, ".git", "hooks", "pre-commit"));
  writeFileSync(join(root, ".git", "hooks", "post-commit"), "x");
  const after = control.snapshot([]);
  control.restore(before, after);
  assert.deepEqual(control.snapshot([]), before);
  assert.equal(readFileSync(join(root, ".git", "config"), "utf8"), "[core]\n");
  rmSync(root, { recursive: true });
});

test("fs: open cycles index adds, replaces and removes entries (SUP-51)", () => {
  const root = repository();
  const index = join(root, "ciclos-abertos.json");
  addOpenCycle(index, { cycleId: "c1", ownerSession: "s1", directories: [root] });
  addOpenCycle(index, { cycleId: "c1", ownerSession: "s2", directories: [root] });
  assert.equal(readOpenCycles(index).length, 1);
  assert.equal(readOpenCycles(index)[0]?.ownerSession, "s2");
  removeOpenCycle(index, "c1");
  assert.deepEqual(readOpenCycles(index), []);
  rmSync(root, { recursive: true });
});

test("fs: excluding .pi/ryker is idempotent (SUP-7)", () => {
  const root = repository();
  writeFileSync(join(root, ".git", "info", "exclude"), "node_modules");
  ensureExcluded(root, ".pi/ryker");
  ensureExcluded(root, ".pi/ryker");
  assert.equal(
    readFileSync(join(root, ".git", "info", "exclude"), "utf8"),
    "node_modules\n.pi/ryker\n",
  );
  rmSync(root, { recursive: true });
});
