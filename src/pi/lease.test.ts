import assert from "node:assert/strict";
import { test } from "node:test";
import type { LockStore } from "../core/lock.ts";
import { acquireLease, LOCK_EXPIRY_MS } from "./lease.ts";

function memoryStore(): LockStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: (path) => files.get(path),
    createExclusive: (path, text) => {
      if (files.has(path)) return false;
      files.set(path, text);
      return true;
    },
    replaceIfUnchanged: (path, expected, text) => {
      if (files.get(path) !== expected) return false;
      files.set(path, text);
      return true;
    },
  };
}

const params = (store: ReturnType<typeof memoryStore>, sessionId: string, now: () => number) => ({
  store,
  path: "lock",
  sessionId,
  cycleId: "c1",
  now,
  remove: (path: string) => {
    store.files.delete(path);
  },
});

test("lease: first session acquires epoch 1 and keeps it through heartbeats (P35)", () => {
  const store = memoryStore();
  const result = acquireLease(params(store, "a", () => 1000));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lease.epoch, 1);
  assert.equal(result.lease.heartbeat(), true);
  assert.equal(result.lease.epochStillMine(), true);
});

test("lease: a live holder blocks another session without confirmation", () => {
  const store = memoryStore();
  acquireLease(params(store, "a", () => 1000));
  const other = acquireLease(params(store, "b", () => 2000));
  assert.deepEqual(other, { ok: false, reason: "otherAlive" });
});

test("lease: takeover with confirmation bumps the epoch and the old driver loses it (r2-N7)", () => {
  const store = memoryStore();
  const first = acquireLease(params(store, "a", () => 1000));
  const second = acquireLease({ ...params(store, "b", () => 2000), confirmTakeover: true });
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(second.lease.epoch, 2);
  assert.equal(first.lease.epochStillMine(), false);
  assert.equal(first.lease.heartbeat(), false);
});

test("lease: an expired lock is taken over without confirmation", () => {
  const store = memoryStore();
  acquireLease(params(store, "a", () => 1000));
  const late = acquireLease(params(store, "b", () => 1000 + LOCK_EXPIRY_MS + 1));
  assert.equal(late.ok && late.lease.epoch, 2);
});

test("lease: release removes the lock only when still mine", () => {
  const store = memoryStore();
  const first = acquireLease(params(store, "a", () => 1000));
  const second = acquireLease({ ...params(store, "b", () => 2000), confirmTakeover: true });
  if (!first.ok || !second.ok) return assert.fail("both should acquire");
  first.lease.release();
  assert.equal(store.files.has("lock"), true);
  second.lease.release();
  assert.equal(store.files.has("lock"), false);
});
