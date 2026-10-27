import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseOpus } from "./model.ts";

const m = (id: string) => ({ provider: "omni", id });

test("no Opus", () => {
  assert.deepEqual(chooseOpus([m("cc/claude-haiku-5-5")]), { kind: "none" });
  assert.deepEqual(chooseOpus([]), { kind: "none" });
});

test("one Opus", () => {
  assert.deepEqual(chooseOpus([m("haiku"), m("cc/claude-opus-5")]), {
    kind: "one",
    model: m("cc/claude-opus-5"),
  });
});

test("several Opus (ignores case)", () => {
  const r = chooseOpus([m("claude-OPUS-4"), m("claude-opus-5"), m("sonnet")]);
  assert.equal(r.kind, "many");
  assert.equal(r.kind === "many" && r.models.length, 2);
});
