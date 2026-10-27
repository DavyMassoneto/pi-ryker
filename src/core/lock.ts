import { join } from "node:path";

export interface LockRecord {
  ownerSession: string;
  cycleId: string;
  epoch: number;
  heartbeatAt: number;
}

export interface LockStore {
  read(path: string): string | undefined;
  createExclusive(path: string, text: string): boolean;
  replaceIfUnchanged(path: string, expected: string, text: string): boolean;
}

export type LockStatus =
  | { kind: "free" }
  | { kind: "mine"; record: LockRecord }
  | { kind: "otherAlive"; record: LockRecord }
  | { kind: "expired"; record: LockRecord };

export type AcquireResult =
  | { ok: true; record: LockRecord }
  | { ok: false; reason: "otherAlive" | "otherCycle" | "lostRace"; holder?: LockRecord };

export interface AcquireParams {
  store: LockStore;
  path: string;
  sessionId: string;
  cycleId: string;
  now: number;
  expiryMs: number;
  confirmTakeover?: boolean;
}

export function lockPath(gitRoot: string): string {
  return join(gitRoot, ".pi", "ryker", "trava.json");
}

function parseLock(text: string | undefined): LockRecord | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as LockRecord;
  } catch {
    return undefined;
  }
}

export function lockStatus(
  record: LockRecord | undefined,
  sessionId: string,
  now: number,
  expiryMs: number,
): LockStatus {
  if (!record) return { kind: "free" };
  if (record.ownerSession === sessionId) return { kind: "mine", record };
  if (now - record.heartbeatAt > expiryMs) return { kind: "expired", record };
  return { kind: "otherAlive", record };
}

export function epochStillMine(
  text: string | undefined,
  sessionId: string,
  epoch: number,
): boolean {
  const record = parseLock(text);
  return record?.ownerSession === sessionId && record.epoch === epoch;
}

function replace(p: AcquireParams, currentText: string, record: LockRecord): AcquireResult {
  const swapped = p.store.replaceIfUnchanged(p.path, currentText, JSON.stringify(record));
  return swapped ? { ok: true, record } : { ok: false, reason: "lostRace" };
}

export function acquireLock(p: AcquireParams): AcquireResult {
  const currentText = p.store.read(p.path);
  const status = lockStatus(parseLock(currentText), p.sessionId, p.now, p.expiryMs);
  const fresh = (epoch: number): LockRecord => ({
    ownerSession: p.sessionId,
    cycleId: p.cycleId,
    epoch,
    heartbeatAt: p.now,
  });
  if (status.kind === "free") {
    const record = fresh(1);
    if (currentText === undefined) {
      const created = p.store.createExclusive(p.path, JSON.stringify(record));
      return created ? { ok: true, record } : { ok: false, reason: "lostRace" };
    }
    return replace(p, currentText, record);
  }
  const text = currentText as string;
  if (status.kind === "mine") return replace(p, text, { ...status.record, heartbeatAt: p.now });
  if (status.kind === "expired") return replace(p, text, fresh(status.record.epoch + 1));
  if (status.record.cycleId !== p.cycleId) {
    return { ok: false, reason: "otherCycle", holder: status.record };
  }
  if (!p.confirmTakeover) return { ok: false, reason: "otherAlive", holder: status.record };
  return replace(p, text, fresh(status.record.epoch + 1));
}
