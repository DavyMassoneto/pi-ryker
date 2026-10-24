import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstado, type Estado } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";
import { textoStatus } from "./status.ts";

const AGORA = "2026-10-23T10:00:00.000Z";
const novo = (): Estado =>
  criarEstado({ pedido: "p", idioma: "pt", agora: AGORA, anterior: { ferramentas: [] } });
const resp = (e: Estado, tema: string): Estado =>
  registrarResposta(
    e,
    { tema, pergunta: "P?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    AGORA,
  );

test("status: contador de perguntas e temas abertos", () => {
  let e = novo();
  assert.equal(textoStatus(e), "Discussão: 0 perguntas · 10 temas abertos");
  e = resp(resp(e, "resultado"), "apetite");
  assert.equal(textoStatus(e), "Discussão: 2 perguntas · 8 temas abertos");
});

test("status: singular e pausada", () => {
  let e = novo();
  for (const t of e.temas.slice(1).map((x) => x.id)) e = resp(e, t);
  assert.equal(textoStatus(e), "Discussão: 9 perguntas · 1 tema aberto");
  e.pausado = true;
  assert.match(textoStatus(e), /pausada$/);
});

test("status em inglês", () => {
  const e = novo();
  e.idioma = "en";
  assert.equal(textoStatus(e), "Discussion: 0 questions · 10 open topics");
});
