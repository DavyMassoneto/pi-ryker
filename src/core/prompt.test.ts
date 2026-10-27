import assert from "node:assert/strict";
import { test } from "node:test";
import { postApprovalPromptSection, promptSection } from "./prompt.ts";
import { recordAnswer } from "./questions.ts";
import { createState } from "./state.ts";

const NOW = "2026-10-23T10:00:00.000Z";
const newWithoutLanguage = () =>
  createState({ request: "Quero uma CLI", now: NOW, previous: { ferramentas: [] } });
const added = () =>
  createState({
    request: "Quero uma CLI",
    language: "pt",
    now: NOW,
    previous: { ferramentas: [] },
  });

test("promptSection: macro test, text prohibition, reading order", () => {
  const s = promptSection(added());
  assert.match(s, /muda o escopo/);
  assert.match(s, /padrão razoável/);
  assert.match(s, /nunca em texto/i);
  assert.match(s, /ryker_perguntar/);
  assert.match(s, /ask_user_question/);
  assert.match(s, /idioma do usuário/);
  const order = ["o pedido", "docs", "decisões existentes", "código"].map((x) => s.indexOf(x));
  assert.ok(
    order.every((i) => i >= 0),
    `ordem: ${order}`,
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
});

test("promptSection: topics snapshot with status and the request", () => {
  const e = recordAnswer(
    added(),
    { tema: "resultado", pergunta: "O que?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    NOW,
  );
  const s = promptSection(e);
  assert.match(s, /Quero uma CLI/);
  assert.match(s, /resultado.*decidido/);
  assert.match(s, /apetite.*aberto/);
  assert.match(s, /problema-job.*aberto/);
});

test("promptSection: syntheses 1-8 cover only what is decided; assumptions in 9 and deferred in 10", () => {
  const s = promptSection(added());
  assert.match(s, /só o que foi decidido/);
  assert.match(s, /seção 9/);
  assert.match(s, /seção 10/);
});

test("promptSection: only a finding that requires a macro decision becomes a question; assumption can be rewritten", () => {
  const s = promptSection(added());
  assert.match(s, /NÃO exige decisão macro: nunca pergunte/);
  assert.match(s, /suposicao/);
  assert.match(s, /ação supor num tema já suposto/);
});

test("postApprovalPromptSection: user is not asked and follows the vision", () => {
  const s = postApprovalPromptSection();
  assert.match(s, /não é perguntado/);
  assert.match(s, /visão descreve/);
});

test("promptSection: without language requires 'idioma' on the first call; with language asks to keep it", () => {
  const without = promptSection(newWithoutLanguage());
  assert.match(without, /ainda não está registrado/);
  assert.match(without, /PRIMEIRA chamada/);
  const withLanguage = promptSection({ ...newWithoutLanguage(), idioma: "pt-BR" });
  assert.match(withLanguage, /"pt-BR"/);
  assert.match(withLanguage, /Continue usando esse idioma/);
});

test("promptSection: queue by impact × uncertainty", () => {
  const s = promptSection(added());
  assert.match(s, /impacto × incerteza/);
  assert.match(s, /do maior para o menor/);
  assert.match(s, /até 4 por chamada de ryker_perguntar/);
  assert.match(s, /reavalie a fila/);
  assert.match(s, /ação supor/);
  assert.match(s, /ação adiar/);
});
