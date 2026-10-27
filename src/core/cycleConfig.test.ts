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

test("config: hand-written paths must be absolute, with the offending value named (F1a, SUP-49, SUP-46)", () => {
  const result = parseCycleConfig(
    JSON.stringify({ vaultPath: "vault", allowedRoots: ["/ok", "rel/dir"], owners: ["core"] }),
  );
  assert.equal(result.ok, false);
  const problems = result.ok ? "" : result.problems.join("\n");
  assert.match(problems, /vaultPath must be an absolute path: vault/);
  assert.match(problems, /allowedRoots must be absolute paths: rel\/dir/);
});

test("config: Windows absolute paths are accepted (F1a)", () => {
  const result = parseCycleConfig(
    JSON.stringify({ vaultPath: "C:\\vault", allowedRoots: ["D:\\data"], owners: ["core"] }),
  );
  assert.equal(result.ok, true);
});

test("config: pi-web port out of range and empty owner names are refused (P4, F1a)", () => {
  const result = parseCycleConfig(
    JSON.stringify({ owners: ["core", " "], piWeb: { hosts: ["127.0.0.1"], port: 70000 } }),
  );
  const problems = result.ok ? "" : result.problems.join("\n");
  assert.match(problems, /piWeb\.port must be an integer from 1 to 65535/);
  assert.match(problems, /owners must not contain empty names/);
});
