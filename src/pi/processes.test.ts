import assert from "node:assert/strict";
import { test } from "node:test";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { trackShell } from "./processes.ts";

function hangingOperations(): BashOperations {
  return {
    exec: (_command, _cwd, options) =>
      new Promise((resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
        if (options.signal?.aborted) reject(new Error("aborted"));
        setImmediate(() => options.onData(Buffer.from("x")));
        void resolve;
      }),
  };
}

test("processes: counts commands that are still running (C1a)", async () => {
  const tracker = trackShell(hangingOperations());
  const pending = tracker.operations.exec("sleep 99", ".", { onData: () => {} });
  pending.catch(() => {});
  assert.equal(tracker.running(), 1);
  tracker.abortAll();
  await assert.rejects(pending, /aborted/);
  assert.equal(tracker.running(), 0);
});

test("processes: finished commands leave the count (C1b)", async () => {
  const tracker = trackShell({ exec: async () => ({ exitCode: 0 }) });
  await tracker.operations.exec("true", ".", { onData: () => {} });
  assert.equal(tracker.running(), 0);
});

test("processes: the caller's abort reaches the underlying command", async () => {
  const tracker = trackShell(hangingOperations());
  const caller = new AbortController();
  const pending = tracker.operations.exec("sleep 99", ".", {
    onData: () => {},
    signal: caller.signal,
  });
  caller.abort();
  await assert.rejects(pending, /aborted/);
});
