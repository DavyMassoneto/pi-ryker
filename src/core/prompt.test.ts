import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstado } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";
import { secaoPrompt } from "./prompt.ts";

const AGORA = "2026-10-23T10:00:00.000Z";
const novo = () =>
  criarEstado({
    pedido: "Quero uma CLI",
    idioma: "pt",
    agora: AGORA,
    anterior: { ferramentas: [] },
  });

test("secaoPrompt: teste de macro, proibição de texto, ordem de leitura", () => {
  const s = secaoPrompt(novo());
  assert.match(s, /muda o escopo/);
  assert.match(s, /padrão razoável/);
  assert.match(s, /nunca em texto/i);
  assert.match(s, /ryker_perguntar/);
  assert.match(s, /ask_user_question/);
  assert.match(s, /idioma do usuário/);
  const ordem = ["o pedido", "docs", "decisões existentes", "código"].map((x) => s.indexOf(x));
  assert.ok(
    ordem.every((i) => i >= 0),
    `ordem: ${ordem}`,
  );
  assert.deepEqual(
    [...ordem].sort((a, b) => a - b),
    ordem,
  );
});

test("secaoPrompt: snapshot dos temas com status e o pedido", () => {
  const e = registrarResposta(
    novo(),
    { tema: "resultado", pergunta: "O que?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    AGORA,
  );
  const s = secaoPrompt(e);
  assert.match(s, /Quero uma CLI/);
  assert.match(s, /resultado.*decidido/);
  assert.match(s, /apetite.*aberto/);
  assert.match(s, /problema-job.*aberto/);
});
