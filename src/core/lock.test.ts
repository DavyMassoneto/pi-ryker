import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acquireLock,
  epochStillMine,
  type LockRecord,
  type LockStore,
  lockPath,
  lockStatus,
} from "./lock.ts";

const EXPIRY = 30_000;
const record = (over: Partial<LockRecord> = {}): LockRecord => ({
  ownerSession: "s1",
  cycleId: "c1",
  epoch: 1,
  heartbeatAt: 1000,
  ...over,
});

function memoryStore(initial?: string): LockStore & { text?: string } {
  const store: LockStore & { text?: string } = {
    text: initial,
    read: () => store.text,
    createExclusive: (_path, text) => {
      if (store.text !== undefined) return false;
      store.text = text;
      return true;
    },
    replaceIfUnchanged: (_path, expected, text) => {
      if (store.text !== expected) return false;
      store.text = text;
      return true;
    },
  };
  return store;
}

const base = { path: "p", cycleId: "c1", expiryMs: EXPIRY };

test("lock lives at the git root (SUP-33)", () => {
  assert.match(lockPath("/repo").replaceAll("\\", "/"), /\/repo\/\.pi\/ryker\/trava\.json$/);
});

test("status: free, mine, other alive, expired (P35)", () => {
  assert.equal(lockStatus(undefined, "s1", 2000, EXPIRY).kind, "free");
  assert.equal(lockStatus(record(), "s1", 2000, EXPIRY).kind, "mine");
  assert.equal(lockStatus(record(), "s2", 2000, EXPIRY).kind, "otherAlive");
  assert.equal(lockStatus(record(), "s2", 1000 + EXPIRY + 1, EXPIRY).kind, "expired");
});

test("acquire creates the lock atomically with epoch 1 (Mec1)", () => {
  const store = memoryStore();
  const result = acquireLock({ ...base, store, sessionId: "s1", now: 5 });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(store.text as string).epoch, 1);
});

test("creation race: only one of two sessions wins (Mec1)", () => {
  const store = memoryStore();
  const first = acquireLock({ ...base, store, sessionId: "s1", now: 5 });
  const second = acquireLock({ ...base, store, sessionId: "s2", now: 5 });
  assert.equal(first.ok, true);
  assert.equal(second.ok === false && second.reason, "otherAlive");
});

test("lost creation race reports lostRace (Mec1)", () => {
  const store = memoryStore();
  store.createExclusive = () => false;
  const result = acquireLock({ ...base, store, sessionId: "s1", now: 5 });
  assert.equal(result.ok === false && result.reason, "lostRace");
});

test("own lock is kept with a fresh heartbeat and the same epoch", () => {
  const store = memoryStore(JSON.stringify(record({ epoch: 4 })));
  const result = acquireLock({ ...base, store, sessionId: "s1", now: 9000 });
  assert.equal(result.ok && result.record.epoch, 4);
  assert.equal(result.ok && result.record.heartbeatAt, 9000);
});

test("expired lock is taken over with epoch + 1 without confirmation (P35)", () => {
  const store = memoryStore(JSON.stringify(record({ epoch: 4 })));
  const result = acquireLock({ ...base, store, sessionId: "s2", now: 1000 + EXPIRY + 1 });
  assert.equal(result.ok && result.record.epoch, 5);
  assert.equal(result.ok && result.record.ownerSession, "s2");
});

test("live lock of another session needs confirmation, then epoch + 1 (P35, 18.11)", () => {
  const store = memoryStore(JSON.stringify(record({ epoch: 4 })));
  const args = { ...base, store, sessionId: "s2", now: 2000 };
  const refused = acquireLock(args);
  assert.equal(refused.ok === false && refused.reason, "otherAlive");
  const confirmed = acquireLock({ ...args, confirmTakeover: true });
  assert.equal(confirmed.ok && confirmed.record.epoch, 5);
});

test("live lock of another cycle is refused even when confirmed (SUP-51)", () => {
  const store = memoryStore(JSON.stringify(record({ cycleId: "other" })));
  const result = acquireLock({ ...base, store, sessionId: "s2", now: 2000, confirmTakeover: true });
  assert.equal(result.ok === false && result.reason, "otherCycle");
});

test("lost epoch is detected when another session took over (r2-N7)", () => {
  const stored = JSON.stringify(record({ ownerSession: "s2", epoch: 5 }));
  assert.equal(epochStillMine(stored, "s1", 4), false);
  assert.equal(epochStillMine(stored, "s2", 5), true);
  assert.equal(epochStillMine(undefined, "s1", 4), false);
});
