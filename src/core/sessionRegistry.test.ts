import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionRegistry } from "./sessionRegistry.ts";

test("two sessions in the same cwd keep separate state (section 3 item 6)", () => {
  const registry = createSessionRegistry<{ n: number }>();
  registry.set("session-a", { n: 1 });
  registry.set("session-b", { n: 2 });
  assert.equal(registry.get("session-a")?.n, 1);
  assert.equal(registry.get("session-b")?.n, 2);
  assert.equal(registry.get("session-c"), undefined);
});

test("delete forgets only that session", () => {
  const registry = createSessionRegistry<string>();
  registry.set("a", "x");
  registry.set("b", "y");
  registry.delete("a");
  assert.equal(registry.has("a"), false);
  assert.deepEqual(registry.ids(), ["b"]);
});
