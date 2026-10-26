import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstado, type Estado } from "./estado.ts";
import { CONTADORES_ZERO, decidirContinuacao, detectaPerguntaLivre } from "./guarda.ts";

const base = (): Estado =>
  criarEstado({
    pedido: "x",
    idioma: "pt",
    agora: "2026-01-01T00:00:00Z",
    anterior: { ferramentas: [] },
  });

const fechado = (): Estado => {
  const e = base();
  return { ...e, temas: e.temas.map((t) => ({ ...t, status: "decidido" as const })) };
};

const entrada = (o: Partial<Parameters<typeof decidirContinuacao>[0]> = {}) => ({
  estado: base() as Estado | undefined,
  texto: "Vamos seguir.",
  perguntouNaUltima: false,
  outcome: "completed" as const,
  contadores: CONTADORES_ZERO,
  ...o,
});

test("pergunta no fim do texto: sim", () => {
  assert.equal(detectaPerguntaLivre("Entendi o contexto.\n\nQual é o público?", []), true);
});

test("pergunta em inglês no fim: sim", () => {
  assert.equal(detectaPerguntaLivre("Got it.\nWho is the target audience?", []), true);
});

test("resumo Pergunta/Resposta: não", () => {
  assert.equal(
    detectaPerguntaLivre("Decidido:\nPergunta: Qual o público? → Resposta: devs", []),
    false,
  );
  assert.equal(detectaPerguntaLivre("- Qual o público? → devs", []), false);
  assert.equal(detectaPerguntaLivre("P: Qual o público?", []), false);
});

test("pergunta já registrada citada: não", () => {
  assert.equal(
    detectaPerguntaLivre("Já respondida:\nQual é o público?", ["Qual é o público?"]),
    false,
  );
});

test("? em bloco de código, código inline ou URL: não", () => {
  assert.equal(detectaPerguntaLivre("Exemplo:\n```js\nconst a = x ?\n```", []), false);
  assert.equal(detectaPerguntaLivre("O operador é `a ?`", []), false);
  assert.equal(detectaPerguntaLivre("Veja https://exemplo.com/a?", []), false);
});

test("citação com ? : não", () => {
  assert.equal(detectaPerguntaLivre("Você disse:\n> Qual é o público?", []), false);
});

test("pergunta no meio de parágrafo longo seguida de mais texto: não", () => {
  const t =
    "Pensei em quem usa isso. Qual é o público? Não sei ainda, então vou olhar o repositório.\n\nVou ler os arquivos.\nDepois volto.\nMais um passo.";
  assert.equal(detectaPerguntaLivre(t, []), false);
});

test("texto vazio ou sem ?: não", () => {
  assert.equal(detectaPerguntaLivre("", []), false);
  assert.equal(detectaPerguntaLivre("Tudo certo.", []), false);
});

test("decidir: etapa inativa, aprovação, aborted, error, pausado -> nada", () => {
  const q = "Qual é o público?";
  assert.equal(decidirContinuacao(entrada({ texto: q, estado: undefined })).correcao, undefined);
  assert.equal(
    decidirContinuacao(entrada({ texto: q, estado: { ...base(), fase: "aprovacao" } })).correcao,
    undefined,
  );
  assert.equal(decidirContinuacao(entrada({ texto: q, outcome: "aborted" })).correcao, undefined);
  assert.equal(decidirContinuacao(entrada({ texto: q, outcome: "error" })).correcao, undefined);
  assert.equal(
    decidirContinuacao(entrada({ texto: q, estado: { ...base(), pausado: true } })).correcao,
    undefined,
  );
});

test("decidir: pergunta livre -> correção A, até 2 por execução", () => {
  let c = CONTADORES_ZERO;
  const q = "Qual é o público?";
  const r1 = decidirContinuacao(entrada({ texto: q, contadores: c }));
  assert.equal(r1.correcao?.tipo, "A");
  c = r1.contadores;
  const r2 = decidirContinuacao(entrada({ texto: q, contadores: c }));
  assert.equal(r2.correcao?.tipo, "A");
  c = r2.contadores;
  const r3 = decidirContinuacao(entrada({ texto: q, contadores: c }));
  assert.notEqual(r3.correcao?.tipo, "A");
});

test("decidir: ferramenta na própria mensagem da pergunta -> sem A, mas B dispara", () => {
  const r = decidirContinuacao(entrada({ texto: "Qual é o público?", perguntouNaUltima: true }));
  assert.equal(r.correcao?.tipo, "B");
});

test("decidir: B dispara mesmo após perguntas pela ferramenta, sem texto de pergunta", () => {
  const r = decidirContinuacao(entrada({ texto: "Discussão fechada.", perguntouNaUltima: true }));
  assert.equal(r.correcao?.tipo, "B");
});

test("decidir: ferramenta chamada antes e pergunta em texto no fim -> A", () => {
  const r = decidirContinuacao(entrada({ texto: "Qual é o público?", perguntouNaUltima: false }));
  assert.equal(r.correcao?.tipo, "A");
});

test("decidir: temas abertos sem pergunta -> correção B, 1 por execução", () => {
  const r1 = decidirContinuacao(entrada());
  assert.equal(r1.correcao?.tipo, "B");
  assert.match(r1.correcao?.texto ?? "", /ryker_perguntar/);
  const r2 = decidirContinuacao(entrada({ contadores: r1.contadores }));
  assert.equal(r2.correcao, undefined);
});

test("decidir: sem temas abertos -> nada; fase documento sem B", () => {
  assert.equal(decidirContinuacao(entrada({ estado: fechado() })).correcao, undefined);
  assert.equal(
    decidirContinuacao(entrada({ estado: { ...base(), fase: "documento" } })).correcao,
    undefined,
  );
});

test("decidir: contadores zeram a cada execução (CONTADORES_ZERO)", () => {
  const r = decidirContinuacao(entrada());
  assert.notDeepEqual(r.contadores, CONTADORES_ZERO);
  assert.equal(decidirContinuacao(entrada({ contadores: CONTADORES_ZERO })).correcao?.tipo, "B");
});

test("pós-aprovação: pergunta em texto livre gera correção própria", () => {
  const aprovada: Estado = { ...fechado(), fase: "aprovada" };
  const d = decidirContinuacao(
    entrada({ estado: aprovada, texto: "Plano pronto.\n\nQual modelo devo usar?" }),
  );
  assert.equal(d.correcao?.tipo, "A");
  assert.match(d.correcao?.texto ?? "", /depois da aprovação/);
  assert.doesNotMatch(d.correcao?.texto ?? "", /ryker_perguntar/);
  assert.equal(d.contadores.livre, 1);
});

test("pós-aprovação: sem pergunta ou no limite não corrige", () => {
  const aprovada: Estado = { ...fechado(), fase: "aprovada" };
  assert.equal(decidirContinuacao(entrada({ estado: aprovada })).correcao, undefined);
  const noLimite = decidirContinuacao(
    entrada({
      estado: aprovada,
      texto: "Qual modelo devo usar?",
      contadores: { livre: 2, progresso: 0 },
    }),
  );
  assert.equal(noLimite.correcao, undefined);
});
