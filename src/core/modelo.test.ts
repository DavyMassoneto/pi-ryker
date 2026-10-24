import assert from "node:assert/strict";
import { test } from "node:test";
import { escolherOpus } from "./modelo.ts";

const m = (id: string) => ({ provider: "omni", id });

test("nenhum Opus", () => {
  assert.deepEqual(escolherOpus([m("cc/claude-haiku-5-5")]), { tipo: "nenhum" });
  assert.deepEqual(escolherOpus([]), { tipo: "nenhum" });
});

test("um Opus", () => {
  assert.deepEqual(escolherOpus([m("haiku"), m("cc/claude-opus-5")]), {
    tipo: "um",
    modelo: m("cc/claude-opus-5"),
  });
});

test("vários Opus (ignora maiúsculas)", () => {
  const r = escolherOpus([m("claude-OPUS-4"), m("claude-opus-5"), m("sonnet")]);
  assert.equal(r.tipo, "varios");
  assert.equal(r.tipo === "varios" && r.modelos.length, 2);
});
