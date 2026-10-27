import assert from "node:assert/strict";
import { test } from "node:test";
import { recordAnswer } from "./questions.ts";
import { createState, type DiscussionState } from "./state.ts";
import { statusText } from "./status.ts";

const NOW = "2026-10-23T10:00:00.000Z";
const added = (): DiscussionState =>
  createState({ request: "p", language: "pt", now: NOW, previous: { ferramentas: [] } });
const answer = (e: DiscussionState, topic: string): DiscussionState =>
  recordAnswer(
    e,
    { tema: topic, pergunta: "P?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    NOW,
  );

test("status: question and open topic counter", () => {
  let e = added();
  assert.equal(statusText(e), "Discussão: 0 perguntas · 10 temas abertos");
  e = answer(answer(e, "resultado"), "apetite");
  assert.equal(statusText(e), "Discussão: 2 perguntas · 8 temas abertos");
});

test("status: singular and paused", () => {
  let e = added();
  for (const t of e.temas.slice(1).map((x) => x.id)) e = answer(e, t);
  assert.equal(statusText(e), "Discussão: 9 perguntas · 1 tema aberto");
  e.pausado = true;
  assert.match(statusText(e), /pausada$/);
});

test("status in English", () => {
  const e = added();
  e.idioma = "en";
  assert.equal(statusText(e), "Discussion: 0 questions · 10 open topics");
});
