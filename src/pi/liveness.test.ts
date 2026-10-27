import assert from "node:assert/strict";
import { test } from "node:test";
import { registerLiveness } from "./liveness.ts";

const KEY = Symbol.for("@agegr/pi-web/session-liveness/v1");
const registry = globalThis as Record<symbol, unknown>;

test("liveness: without the pi-web registry the release is a no-op (CLI)", () => {
  delete registry[KEY];
  assert.doesNotThrow(() => registerLiveness("s1", undefined, () => true)());
});

test("liveness: registers the session with its activity probe and returns the release (C19.1)", () => {
  const seen: { name: string; sessionId: string; sessionFile?: string; active: boolean }[] = [];
  let released = 0;
  registry[KEY] = {
    version: 1,
    register: (lease: {
      name: string;
      sessionId: string;
      sessionFile?: string;
      isActive: () => boolean;
    }) => {
      seen.push({
        name: lease.name,
        sessionId: lease.sessionId,
        ...(lease.sessionFile ? { sessionFile: lease.sessionFile } : {}),
        active: lease.isActive(),
      });
      return () => {
        released += 1;
      };
    },
  };
  const release = registerLiveness("s1", "/f.jsonl", () => true);
  release();
  assert.deepEqual(seen, [
    { name: "pi-ryker", sessionId: "s1", sessionFile: "/f.jsonl", active: true },
  ]);
  assert.equal(released, 1);
  delete registry[KEY];
});

test("liveness: an unknown registry version is ignored", () => {
  registry[KEY] = { version: 2, register: () => assert.fail("must not register") };
  registerLiveness("s1", undefined, () => true)();
  delete registry[KEY];
});
