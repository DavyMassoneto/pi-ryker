import assert from "node:assert/strict";
import { test } from "node:test";
import { deserialize, serialize } from "./serialization.ts";
import { createState } from "./state.ts";

const e = createState({
  request: "p",
  language: "pt",
  now: "2026-10-23T10:00:00.000Z",
  previous: { ferramentas: ["read"] },
});

test("round trip returns equal state", () => {
  assert.deepEqual(deserialize(serialize(e)), e);
});

test("invalid JSON → explicit error", () => {
  assert.throws(() => deserialize("{nao json"), /JSON inválido/);
});

test("unknown version → explicit error", () => {
  assert.throws(() => deserialize(JSON.stringify({ ...e, versao: 99 })), /versão/);
  assert.throws(() => deserialize("[]"), /objeto/);
});

test("version 1 file migrates to version 2 without owner (section 3 item 1)", () => {
  const { versao: _ignored, ...rest } = e;
  const migrated = deserialize(JSON.stringify({ ...rest, versao: 1 }));
  assert.equal(migrated.versao, 2);
  assert.equal(migrated.donoSessao, undefined);
  assert.deepEqual(migrated, e);
});

test("version 2 round trip keeps the owner session (section 3 item 1)", () => {
  const owned = { ...e, donoSessao: "session-1" };
  assert.deepEqual(deserialize(serialize(owned)), owned);
});
