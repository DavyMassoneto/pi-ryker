import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCycleConfig } from "./cycleConfig.ts";

test("config: defaults to empty lists", () => {
  const result = parseCycleConfig("{}");
  assert.deepEqual(result, { ok: true, config: { allowedRoots: [], owners: [] } });
});

test("config: reads models, vault and pi-web address", () => {
  const result = parseCycleConfig(
    JSON.stringify({
      vaultPath: "/vault",
      language: "en",
      allowedRoots: ["/other"],
      owners: ["core"],
      piWeb: { hosts: ["localhost"], port: 3041 },
      planner: { provider: "a", id: "b", thinking: "high" },
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.planner?.thinking, "high");
    assert.equal(result.config.piWeb?.port, 3041);
    assert.equal(result.config.vaultPath, "/vault");
  }
});

test("config: rejects broken JSON and wrong shapes", () => {
  assert.equal(parseCycleConfig("{").ok, false);
  const result = parseCycleConfig(
    JSON.stringify({ allowedRoots: "x", planner: { provider: "a" }, piWeb: { port: 1 } }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.problems.length, 3);
});

test("config: rejects an unknown thinking level", () => {
  const result = parseCycleConfig(
    JSON.stringify({ reviewer: { provider: "a", id: "b", thinking: "turbo" } }),
  );
  assert.equal(result.ok, false);
});
