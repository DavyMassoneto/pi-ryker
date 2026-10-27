import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildManifest,
  diffManifests,
  evaluateControlChange,
  isControlPath,
} from "./controlFiles.ts";

const before = buildManifest({
  ".pi/ryker/ciclo.json": "a",
  "plano.md": "b",
  ".git/config": "[remote]",
  ".git/info/exclude": ".pi/ryker/",
  ".git/hooks/pre-commit": "#!/bin/sh",
});

test("manifest stores SHA-256 hex of each file (P5)", () => {
  assert.equal(
    before["plano.md"],
    "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d",
  );
});

test("identical contents give an empty diff", () => {
  const same = buildManifest({
    ".pi/ryker/ciclo.json": "a",
    "plano.md": "b",
    ".git/config": "[remote]",
    ".git/info/exclude": ".pi/ryker/",
    ".git/hooks/pre-commit": "#!/bin/sh",
  });
  assert.deepEqual(diffManifests(before, same), { changed: [], added: [], removed: [] });
});

test("changed, added and removed files are reported (P5, SUP-44)", () => {
  const after = buildManifest({
    ".pi/ryker/ciclo.json": "rewritten",
    "plano.md": "b",
    ".git/config": "[remote]",
    ".git/info/exclude": ".pi/ryker/",
    ".git/hooks/post-commit": "evil",
  });
  const diff = diffManifests(before, after);
  assert.deepEqual(diff.changed, [".pi/ryker/ciclo.json"]);
  assert.deepEqual(diff.added, [".git/hooks/post-commit"]);
  assert.deepEqual(diff.removed, [".git/hooks/pre-commit"]);
});

test("agent change is restored and the round fails (P5, SUP-44)", () => {
  const decision = evaluateControlChange(
    { changed: [".git/config"], added: [], removed: [] },
    "agent",
  );
  assert.deepEqual(decision, { action: "restoreAndFail", paths: [".git/config"] });
});

test("change from outside an execution stops the cycle (M2b)", () => {
  const decision = evaluateControlChange(
    { changed: [], added: [], removed: [".pi/ryker/ciclo.json"] },
    "outside",
  );
  assert.deepEqual(decision, { action: "stop", paths: [".pi/ryker/ciclo.json"] });
});

test("no change means no action", () => {
  assert.deepEqual(evaluateControlChange({ changed: [], added: [], removed: [] }, "agent"), {
    action: "none",
  });
});

test(".git/config, .git/hooks/* and .git/info/* are control files (SUP-44)", () => {
  assert.equal(isControlPath(".git/config"), true);
  assert.equal(isControlPath(".git/hooks/pre-commit"), true);
  assert.equal(isControlPath(".git/info/exclude"), true);
  assert.equal(isControlPath(".git/HEAD"), false);
  assert.equal(isControlPath("src/.git/config.ts"), false);
  assert.equal(isControlPath("packages/a/.git/config"), true);
});
