import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstado } from "./estado.ts";
import { TEMAS_BASE } from "./temas.ts";

const AGORA = "2026-10-23T10:00:00.000Z";

test("criarEstado: 10 temas base abertos com ids e seções fixos", () => {
  const e = criarEstado({
    pedido: "Quero uma CLI",
    idioma: "pt",
    agora: AGORA,
    anterior: { ferramentas: ["read", "bash"] },
  });
  assert.equal(e.versao, 1);
  assert.equal(e.fase, "descoberta");
  assert.equal(e.temas.length, 10);
  assert.ok(e.temas.every((t) => t.status === "aberto" && t.criadoPor === "base"));
  const secoes = Object.fromEntries(e.temas.map((t) => [t.id, t.secao]));
  assert.deepEqual(secoes, {
    "problema-job": 1,
    "para-quem": 1,
    resultado: 2,
    apetite: 3,
    entra: 4,
    fora: 5,
    restricoes: 6,
    integracoes: 6,
    "escolhas-caras": 7,
    riscos: 8,
  });
  assert.equal(TEMAS_BASE.length, 10);
});

test("criarEstado: guarda pedido, anterior, criadoEm e começa sem pausa", () => {
  const e = criarEstado({
    pedido: "Quero uma CLI",
    idioma: "en",
    agora: AGORA,
    anterior: { modelo: { provider: "omni", id: "x" }, ferramentas: ["read"] },
  });
  assert.equal(e.pedido, "Quero uma CLI");
  assert.equal(e.idioma, "en");
  assert.equal(e.criadoEm, AGORA);
  assert.equal(e.pausado, false);
  assert.deepEqual(e.perguntas, []);
  assert.deepEqual(e.anterior, { modelo: { provider: "omni", id: "x" }, ferramentas: ["read"] });
});

test("criarEstado: não compartilha os temas base entre estados", () => {
  const a = criarEstado({ pedido: "a", idioma: "pt", agora: AGORA, anterior: { ferramentas: [] } });
  const b = criarEstado({ pedido: "b", idioma: "pt", agora: AGORA, anterior: { ferramentas: [] } });
  a.temas[0].status = "decidido";
  assert.equal(b.temas[0].status, "aberto");
});
