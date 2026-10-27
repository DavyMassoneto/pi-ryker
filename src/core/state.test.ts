import assert from "node:assert/strict";
import { test } from "node:test";
import { createState } from "./state.ts";
import { BASE_TOPICS } from "./topics.ts";

const NOW = "2026-10-23T10:00:00.000Z";

test("createState: 10 open base topics with fixed ids and sections", () => {
  const e = createState({
    request: "Quero uma CLI",
    language: "pt",
    now: NOW,
    previous: { ferramentas: ["read", "bash"] },
  });
  assert.equal(e.versao, 2);
  assert.equal(e.fase, "descoberta");
  assert.equal(e.temas.length, 10);
  assert.ok(e.temas.every((t) => t.status === "aberto" && t.criadoPor === "base"));
  const sections = Object.fromEntries(e.temas.map((t) => [t.id, t.secao]));
  assert.deepEqual(sections, {
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
  assert.equal(BASE_TOPICS.length, 10);
});

test("createState: keeps request, previous, createdAt and starts unpaused", () => {
  const e = createState({
    request: "Quero uma CLI",
    language: "en",
    now: NOW,
    previous: { modelo: { provider: "omni", id: "x" }, ferramentas: ["read"] },
  });
  assert.equal(e.pedido, "Quero uma CLI");
  assert.equal(e.idioma, "en");
  assert.equal(e.criadoEm, NOW);
  assert.equal(e.pausado, false);
  assert.deepEqual(e.perguntas, []);
  assert.deepEqual(e.anterior, { modelo: { provider: "omni", id: "x" }, ferramentas: ["read"] });
});

test("createState: does not share base topics between states", () => {
  const a = createState({ request: "a", language: "pt", now: NOW, previous: { ferramentas: [] } });
  const b = createState({ request: "b", language: "pt", now: NOW, previous: { ferramentas: [] } });
  a.temas[0].status = "decidido";
  assert.equal(b.temas[0].status, "aberto");
});
