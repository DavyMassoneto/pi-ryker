import assert from "node:assert/strict";
import { test } from "node:test";
import { recordAnswer } from "./questions.ts";
import {
  applyTopics,
  approve,
  createState,
  type DiscussionState,
  type TopicItem,
} from "./state.ts";

const NOW = "2026-10-23T10:00:00.000Z";
const added = (): DiscussionState =>
  createState({
    request: "p",
    language: "pt",
    now: NOW,
    previous: { modelo: { provider: "omni", id: "sonnet" }, ferramentas: ["read", "bash"] },
  });
const topic = (e: DiscussionState, id: string) => e.temas.find((t) => t.id === id);
const error = (e: DiscussionState, items: TopicItem[]) => {
  const r = applyTopics(e, items, NOW);
  assert.equal(r.ok, false);
  return r.ok ? "" : r.error;
};

test("source: requires open topic, text and origin; becomes decided with source origin", () => {
  const r = applyTopics(
    added(),
    [{ acao: "fonte", tema: "para-quem", texto: "Devs", origem: "README.md" }],
    NOW,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const t = topic(r.state, "para-quem");
  assert.equal(t?.status, "decidido");
  assert.deepEqual(t?.origem, { tipo: "fonte", ref: "README.md" });
  assert.match(error(added(), [{ acao: "fonte", tema: "para-quem", texto: "x" }]), /origem/);
  assert.match(error(added(), [{ acao: "fonte", tema: "para-quem", origem: "r" }]), /texto/);
  assert.match(error(added(), [{ acao: "fonte", origem: "r", texto: "x" }]), /tema/);
});

test("assume requires text and reason; defer requires text and when", () => {
  const r = applyTopics(
    added(),
    [
      { acao: "supor", tema: "apetite", texto: "2 semanas", motivo: "padrão do time" },
      { acao: "adiar", tema: "riscos", texto: "ver depois", quando: "antes do plano" },
    ],
    NOW,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(topic(r.state, "apetite")?.status, "suposto");
  assert.equal(topic(r.state, "apetite")?.motivo, "padrão do time");
  assert.equal(topic(r.state, "riscos")?.status, "adiado");
  assert.equal(topic(r.state, "riscos")?.quando, "antes do plano");
  assert.match(error(added(), [{ acao: "supor", tema: "apetite", texto: "x" }]), /motivo/);
  assert.match(error(added(), [{ acao: "adiar", tema: "riscos", texto: "x" }]), /quando/);
});

test("batch is all-or-nothing", () => {
  const e = added();
  const m = error(e, [
    { acao: "supor", tema: "apetite", texto: "x", motivo: "y" },
    { acao: "supor", tema: "nao-existe", texto: "x", motivo: "y" },
  ]);
  assert.match(m, /nao-existe/);
  assert.equal(topic(e, "apetite")?.status, "aberto");
});

test("closed topic is rejected", () => {
  const e = recordAnswer(
    added(),
    { tema: "resultado", pergunta: "?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    NOW,
  );
  assert.match(
    error(e, [{ acao: "supor", tema: "resultado", texto: "x", motivo: "y" }]),
    /tema fechado/,
  );
});

test("reopened topic only closes through a question", () => {
  const e = added();
  e.temas[0].reabertura = { nota: "rever", em: NOW };
  assert.match(
    error(e, [{ acao: "supor", tema: e.temas[0].id, texto: "x", motivo: "y" }]),
    /reaberto/,
  );
});

test("create: generates unique id, requires title and section 1..8, revises only a decided topic", () => {
  const r = applyTopics(
    added(),
    [
      { acao: "criar", titulo: "Público-alvo!", secao: 1 },
      { acao: "criar", titulo: "Público-alvo!", secao: 1 },
    ],
    NOW,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const newSelection = r.state.temas.filter((t) => t.criadoPor === "modelo");
  assert.equal(newSelection.length, 2);
  assert.notEqual(newSelection[0].id, newSelection[1].id);
  assert.equal(newSelection[0].status, "aberto");
  assert.match(error(added(), [{ acao: "criar", secao: 1 }]), /titulo/);
  assert.match(error(added(), [{ acao: "criar", titulo: "x", secao: 9 }]), /secao/);
  assert.match(
    error(added(), [{ acao: "criar", titulo: "x", secao: 1, revisa: "resultado" }]),
    /revisa/,
  );
  const decision = recordAnswer(
    added(),
    { tema: "resultado", pergunta: "?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    NOW,
  );
  const ok = applyTopics(
    decision,
    [{ acao: "criar", titulo: "x", secao: 2, revisa: "resultado" }],
    NOW,
  );
  assert.equal(ok.ok, true);
});

test("approve: approved phase, approval time, and returns previous tools and model", () => {
  const r = approve(added(), NOW);
  assert.equal(r.state.fase, "aprovada");
  assert.equal(r.state.aprovadoEm, NOW);
  assert.deepEqual(r.tools, ["read", "bash"]);
  assert.deepEqual(r.model, { provider: "omni", id: "sonnet" });
});
