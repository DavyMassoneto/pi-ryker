import assert from "node:assert/strict";
import { test } from "node:test";
import { type ControlSnapshotPorts, createControlSnapshot } from "./controlSnapshot.ts";

function memory(initial: Record<string, string>, stored?: Record<string, string>) {
  const live = new Map(Object.entries(initial));
  let copy = stored ? { ...stored } : undefined;
  const ports: ControlSnapshotPorts = {
    listPaths: () => [...live.keys()],
    read: (path) => live.get(path),
    write: (path, text) => void live.set(path, text),
    remove: (path) => void live.delete(path),
    loadCopy: () => copy,
    saveCopy: (snapshot) => {
      copy = { ...snapshot };
    },
  };
  return { live, ports, copy: () => copy };
}

test("controlSnapshot: seed stores the live files as the on-disk copy (SUP-36)", () => {
  const env = memory({ a: "1", b: "2" });
  createControlSnapshot(env.ports).seed();
  assert.deepEqual(env.copy(), { a: "1", b: "2" });
});

test("controlSnapshot: a change made outside Ryker is reported, not absorbed (M2b)", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("a", "changed");
  snapshot.recordWrite(["b"]);
  assert.deepEqual(snapshot.outsideChanges([]), ["a"]);
});

test("controlSnapshot: Ryker's own write refreshes only the written path", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("a", "ryker");
  snapshot.recordWrite(["a"]);
  assert.deepEqual(snapshot.outsideChanges([]), []);
  assert.equal(env.copy()?.a, "ryker");
});

test("controlSnapshot: added and removed files count as outside changes", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.delete("b");
  env.live.set("c", "3");
  assert.deepEqual(snapshot.outsideChanges([]).sort(), ["b", "c"]);
});

test("controlSnapshot: exempt paths are ignored by the check", () => {
  const env = memory({ a: "1" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("role.md", "agent output");
  env.live.set("a", "2");
  assert.deepEqual(snapshot.outsideChanges(["role.md"]), ["a"]);
});

test("controlSnapshot: recordWrite of a removed file drops it from the copy", () => {
  const env = memory({ a: "1" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.delete("a");
  snapshot.recordWrite(["a"]);
  assert.deepEqual(env.copy(), {});
  assert.deepEqual(snapshot.outsideChanges([]), []);
});

test("controlSnapshot: restore rewrites changed, recreates removed and deletes added files", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("a", "x");
  env.live.delete("b");
  env.live.set("c", "3");
  snapshot.restore(snapshot.outsideChanges([]));
  assert.deepEqual([...env.live.entries()].sort(), [
    ["a", "1"],
    ["b", "2"],
  ]);
  assert.deepEqual(snapshot.outsideChanges([]), []);
});

test("controlSnapshot: after a restart the on-disk copy is the reference (SUP-36)", () => {
  const env = memory({ a: "edited while pi was closed" }, { a: "original" });
  const resumed = createControlSnapshot(env.ports);
  resumed.load();
  assert.deepEqual(resumed.outsideChanges([]), ["a"]);
  resumed.restore(["a"]);
  assert.equal(env.live.get("a"), "original");
});

test("controlSnapshot: load without a stored copy reports nothing and seeds on demand", () => {
  const env = memory({ a: "1" });
  const snapshot = createControlSnapshot(env.ports);
  assert.equal(snapshot.load(), false);
  assert.deepEqual(snapshot.outsideChanges([]), []);
});
