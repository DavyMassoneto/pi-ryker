import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstado } from "./estado.ts";
import { desserializar, serializar } from "./serializacao.ts";

const e = criarEstado({
  pedido: "p",
  idioma: "pt",
  agora: "2026-10-23T10:00:00.000Z",
  anterior: { ferramentas: ["read"] },
});

test("ida e volta devolve estado igual", () => {
  assert.deepEqual(desserializar(serializar(e)), e);
});

test("JSON inválido → erro explícito", () => {
  assert.throws(() => desserializar("{nao json"), /JSON inválido/);
});

test("versão desconhecida → erro explícito", () => {
  assert.throws(() => desserializar(JSON.stringify({ ...e, versao: 99 })), /versão/);
  assert.throws(() => desserializar("[]"), /objeto/);
});
