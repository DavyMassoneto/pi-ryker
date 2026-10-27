import assert from "node:assert/strict";
import { test } from "node:test";
import { type ControlSnapshotPorts, createControlSnapshot } from "./controlSnapshot.ts";

function memory(initial: Record<string, string>, stored?: Record<string, string>) {
  const live = new Map(Object.entries(initial));
  const aside = new Map<string, string>();
  let copy = stored ? { ...stored } : undefined;
  const ports: ControlSnapshotPorts = {
    listPaths: () => [...live.keys()],
    read: (path) => live.get(path),
    write: (path, text) => void live.set(path, text),
    setAside: (path) => {
      aside.set(path, live.get(path) ?? "");
      live.delete(path);
    },
    loadCopy: () => copy,
    saveCopy: (snapshot) => {
      copy = { ...snapshot };
    },
  };
  return { live, aside, ports, copy: () => copy };
}

const paths = (snapshot: ReturnType<typeof createControlSnapshot>): string[] =>
  snapshot
    .changes()
    .map((change) => change.path)
    .sort();

test("controlSnapshot: seed stores the live files as the on-disk copy (SUP-36)", () => {
  const env = memory({ a: "1", b: "2" });
  createControlSnapshot(env.ports).seed();
  assert.deepEqual(env.copy(), { a: "1", b: "2" });
});

test("controlSnapshot: a change made outside Ryker is reported with both sides, not absorbed (M2b)", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("a", "changed");
  snapshot.recordWrite(["b"]);
  assert.deepEqual(snapshot.changes(), [{ path: "a", before: "1", after: "changed" }]);
});

test("controlSnapshot: Ryker's own write refreshes only the written path", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("a", "ryker");
  snapshot.recordWrite(["a"]);
  assert.deepEqual(snapshot.changes(), []);
  assert.equal(env.copy()?.a, "ryker");
});

test("controlSnapshot: added and removed files are changes", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.delete("b");
  env.live.set("c", "3");
  assert.deepEqual(paths(snapshot), ["b", "c"]);
});

test("controlSnapshot: recordWrite of a removed file drops it from the copy", () => {
  const env = memory({ a: "1" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.delete("a");
  snapshot.recordWrite(["a"]);
  assert.deepEqual(env.copy(), {});
  assert.deepEqual(snapshot.changes(), []);
});

test("controlSnapshot: seed accepts the current state and never touches the live files (M2b)", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("a", "x");
  env.live.delete("b");
  env.live.set("c", "3");
  assert.equal(snapshot.changes().length, 3);
  snapshot.seed();
  assert.deepEqual(snapshot.changes(), []);
  assert.deepEqual([...env.live.entries()].sort(), [
    ["a", "x"],
    ["c", "3"],
  ]);
});

test("controlSnapshot: after a restart the on-disk copy is the reference (SUP-36)", () => {
  const env = memory({ a: "edited while pi was closed" }, { a: "original" });
  const resumed = createControlSnapshot(env.ports);
  resumed.load();
  assert.deepEqual(paths(resumed), ["a"]);
  assert.equal(env.live.get("a"), "edited while pi was closed");
});

test("controlSnapshot: load without a stored copy reports nothing", () => {
  const env = memory({ a: "1" });
  const snapshot = createControlSnapshot(env.ports);
  assert.equal(snapshot.load(), false);
  assert.deepEqual(snapshot.changes(), []);
});

test("controlSnapshot: restore rewrites changed and removed files and sets added ones aside without deleting them", () => {
  const env = memory({ a: "1", b: "2" });
  const snapshot = createControlSnapshot(env.ports);
  snapshot.seed();
  env.live.set("a", "x");
  env.live.delete("b");
  env.live.set("c", "3");
  snapshot.restore(paths(snapshot));
  assert.deepEqual([...env.live.entries()].sort(), [
    ["a", "1"],
    ["b", "2"],
  ]);
  assert.equal(env.aside.get("c"), "3");
});
