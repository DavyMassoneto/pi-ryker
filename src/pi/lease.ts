import { type AcquireResult, acquireLock, epochStillMine, type LockStore } from "../core/lock.ts";

export const HEARTBEAT_MS = 10_000;
export const LOCK_EXPIRY_MS = 60_000;

export interface Lease {
  epoch: number;
  epochStillMine(): boolean;
  heartbeat(): boolean;
  release(): void;
}

export interface LeaseParams {
  store: LockStore;
  path: string;
  sessionId: string;
  cycleId: string;
  now: () => number;
  confirmTakeover?: boolean;
  remove: (path: string) => void;
  onWrite?: (path: string) => void;
}

export type LeaseResult =
  | { ok: true; lease: Lease }
  | { ok: false; reason: Extract<AcquireResult, { ok: false }>["reason"] };

export function acquireLease(p: LeaseParams): LeaseResult {
  const acquired = acquireLock({
    store: p.store,
    path: p.path,
    sessionId: p.sessionId,
    cycleId: p.cycleId,
    now: p.now(),
    expiryMs: LOCK_EXPIRY_MS,
    ...(p.confirmTakeover ? { confirmTakeover: true } : {}),
  });
  if (!acquired.ok) return { ok: false, reason: acquired.reason };
  p.onWrite?.(p.path);
  const epoch = acquired.record.epoch;
  const stillMine = (): boolean => epochStillMine(p.store.read(p.path), p.sessionId, epoch);
  return {
    ok: true,
    lease: {
      epoch,
      epochStillMine: stillMine,
      heartbeat: () => {
        if (!stillMine()) return false;
        const beat = acquireLock({
          store: p.store,
          path: p.path,
          sessionId: p.sessionId,
          cycleId: p.cycleId,
          now: p.now(),
          expiryMs: LOCK_EXPIRY_MS,
        });
        if (beat.ok) p.onWrite?.(p.path);
        return beat.ok && beat.record.epoch === epoch;
      },
      release: () => {
        if (stillMine()) p.remove(p.path);
      },
    },
  };
}
