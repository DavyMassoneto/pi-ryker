import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstado, type Estado } from "./estado.ts";
import {
  interpretarEscolha,
  OUTRA_RESPOSTA,
  opcoesDoSelect,
  type PerguntaEntrada,
  pausar,
  registrarResposta,
  validarPerguntas,
} from "./perguntas.ts";

const AGORA = "2026-10-23T10:00:00.000Z";
const novo = (): Estado =>
  criarEstado({ pedido: "p", idioma: "pt", agora: AGORA, anterior: { ferramentas: [] } });
const q = (tema = "para-quem", extra: Partial<PerguntaEntrada> = {}): PerguntaEntrada => ({
  tema,
  pergunta: "Quem usa?",
  opcoes: ["Devs", "Designers", "Todos"],
  recomendada: 0,
  ...extra,
});
const erro = (e: Estado, l: PerguntaEntrada[]) => {
  const r = validarPerguntas(e, l);
  assert.equal(r.ok, false);
  return r.ok ? "" : r.erro;
};

test("validarPerguntas aceita lotes válidos de 1 e de 4", () => {
  assert.deepEqual(validarPerguntas(novo(), [q()]), { ok: true });
  const lote = ["para-quem", "resultado", "apetite", "entra"].map((t) => q(t));
  assert.deepEqual(validarPerguntas(novo(), lote), { ok: true });
});

test("validarPerguntas rejeita 0 ou 5 perguntas", () => {
  assert.match(erro(novo(), []), /1 a 4/);
  const cinco = ["para-quem", "resultado", "apetite", "entra", "fora"].map((t) => q(t));
  assert.match(erro(novo(), cinco), /1 a 4/);
});

test("validarPerguntas rejeita tema inexistente", () => {
  assert.match(erro(novo(), [q("nao-existe")]), /nao-existe/);
});

test("validarPerguntas rejeita tema decidido, suposto ou adiado (tema fechado)", () => {
  for (const status of ["decidido", "suposto", "adiado"] as const) {
    const e = novo();
    e.temas[1].status = status;
    assert.match(erro(e, [q(e.temas[1].id)]), /tema fechado/);
  }
});

test("validarPerguntas rejeita dois itens do mesmo tema", () => {
  assert.match(erro(novo(), [q("resultado"), q("resultado")]), /mesmo tema/);
});

test("validarPerguntas rejeita menos de 2 ou mais de 5 opções", () => {
  assert.match(erro(novo(), [q("resultado", { opcoes: ["a"] })]), /2 a 5/);
  assert.match(erro(novo(), [q("resultado", { opcoes: ["a", "b", "c", "d", "e", "f"] })]), /2 a 5/);
});

test("validarPerguntas rejeita opção vazia ou duplicada", () => {
  assert.match(erro(novo(), [q("resultado", { opcoes: ["a", "  "] })]), /vazia/);
  assert.match(erro(novo(), [q("resultado", { opcoes: ["a", "a"] })]), /duplicada/);
});

test("validarPerguntas rejeita recomendada fora do intervalo", () => {
  assert.match(erro(novo(), [q("resultado", { recomendada: 3 })]), /recomendada/);
  assert.match(erro(novo(), [q("resultado", { recomendada: -1 })]), /recomendada/);
  assert.match(erro(novo(), [q("resultado", { recomendada: 0.5 })]), /recomendada/);
});

test("validarPerguntas rejeita a opção 'Outra resposta…'", () => {
  assert.match(erro(novo(), [q("resultado", { opcoes: ["a", OUTRA_RESPOSTA] })]), /Outra resposta/);
});

test("validarPerguntas rejeita fase diferente de descoberta", () => {
  const e = novo();
  e.fase = "documento";
  assert.match(erro(e, [q()]), /fase/);
});

test("opcoesDoSelect: recomendada primeiro com sufixo, 'Outra resposta…' no fim", () => {
  const ops = opcoesDoSelect(q("resultado", { recomendada: 2 }));
  assert.deepEqual(ops, ["Todos (recomendada)", "Devs", "Designers", OUTRA_RESPOSTA]);
});

test("interpretarEscolha: recomendada → texto original; outra → livre; desconhecido → cancelado", () => {
  const p = q("resultado", { recomendada: 1 });
  assert.deepEqual(interpretarEscolha(p, "Designers (recomendada)"), {
    tipo: "opcao",
    texto: "Designers",
  });
  assert.deepEqual(interpretarEscolha(p, "Devs"), { tipo: "opcao", texto: "Devs" });
  assert.deepEqual(interpretarEscolha(p, OUTRA_RESPOSTA), { tipo: "livre" });
  assert.deepEqual(interpretarEscolha(p, "algo estranho"), { tipo: "cancelado" });
  assert.deepEqual(interpretarEscolha(p, undefined), { tipo: "cancelado" });
});

test("registrarResposta: tema decidido, origem usuario + perguntaId, texto = pergunta + resposta", () => {
  const e = registrarResposta(novo(), q("resultado"), "Devs", false, AGORA);
  const t = e.temas.find((x) => x.id === "resultado");
  assert.equal(t?.status, "decidido");
  assert.equal(t?.quando, AGORA);
  assert.deepEqual(t?.origem, { tipo: "usuario", perguntaId: e.perguntas[0].id });
  assert.match(t?.texto ?? "", /Quem usa\?/);
  assert.match(t?.texto ?? "", /Devs/);
  assert.equal(e.perguntas[0].resposta, "Devs");
  assert.equal(e.perguntas[0].livre, false);
});

test("registrarResposta marca resposta livre e não muta o estado original", () => {
  const antes = novo();
  const e = registrarResposta(antes, q("resultado"), "resposta-livre", true, AGORA);
  assert.equal(e.perguntas[0].livre, true);
  assert.equal(antes.perguntas.length, 0);
  assert.equal(antes.temas.find((x) => x.id === "resultado")?.status, "aberto");
});

test("registrarResposta rejeita tema já fechado", () => {
  const e = registrarResposta(novo(), q("resultado"), "Devs", false, AGORA);
  assert.throws(() => registrarResposta(e, q("resultado"), "Outro", false, AGORA), /tema fechado/);
});

test("cancelamento no meio do lote: respondidas ficam, restantes abertas, pausado = true", () => {
  let e = registrarResposta(novo(), q("resultado"), "Devs", false, AGORA);
  e = pausar(e);
  assert.equal(e.pausado, true);
  assert.equal(e.temas.find((x) => x.id === "resultado")?.status, "decidido");
  assert.equal(e.temas.find((x) => x.id === "apetite")?.status, "aberto");
  assert.equal(e.perguntas.length, 1);
});
