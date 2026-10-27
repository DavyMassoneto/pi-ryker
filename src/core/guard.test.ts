import assert from "node:assert/strict";
import { test } from "node:test";
import { decideContinuation, detectFreeTextQuestion, ZERO_COUNTERS } from "./guard.ts";
import { createState, type DiscussionState } from "./state.ts";

const base = (): DiscussionState =>
  createState({
    request: "x",
    language: "pt",
    now: "2026-01-01T00:00:00Z",
    previous: { ferramentas: [] },
  });

const closedState = (): DiscussionState => {
  const e = base();
  return { ...e, temas: e.temas.map((t) => ({ ...t, status: "decidido" as const })) };
};

const input = (o: Partial<Parameters<typeof decideContinuation>[0]> = {}) => ({
  state: base() as DiscussionState | undefined,
  text: "Vamos seguir.",
  askedInLastMessage: false,
  outcome: "completed" as const,
  counters: ZERO_COUNTERS,
  ...o,
});

test("question at the end of the text: yes", () => {
  assert.equal(detectFreeTextQuestion("Entendi o contexto.\n\nQual é o público?", []), true);
});

test("English question at the end: yes", () => {
  assert.equal(detectFreeTextQuestion("Got it.\nWho is the target audience?", []), true);
});

test("Question/Answer summary: no", () => {
  assert.equal(
    detectFreeTextQuestion("Decidido:\nPergunta: Qual o público? → Resposta: devs", []),
    false,
  );
  assert.equal(detectFreeTextQuestion("- Qual o público? → devs", []), false);
  assert.equal(detectFreeTextQuestion("P: Qual o público?", []), false);
});

test("already recorded question quoted: no", () => {
  assert.equal(
    detectFreeTextQuestion("Já respondida:\nQual é o público?", ["Qual é o público?"]),
    false,
  );
});

test("? in code block, inline code or URL: no", () => {
  assert.equal(detectFreeTextQuestion("Exemplo:\n```js\nconst a = x ?\n```", []), false);
  assert.equal(detectFreeTextQuestion("O operador é `a ?`", []), false);
  assert.equal(detectFreeTextQuestion("Veja https://exemplo.com/a?", []), false);
});

test("quote with ?: no", () => {
  assert.equal(detectFreeTextQuestion("Você disse:\n> Qual é o público?", []), false);
});

test("question in the middle of a long paragraph followed by more text: no", () => {
  const t =
    "Pensei em quem usa isso. Qual é o público? Não sei ainda, então vou olhar o repositório.\n\nVou ler os arquivos.\nDepois volto.\nMais um passo.";
  assert.equal(detectFreeTextQuestion(t, []), false);
});

test("empty text or without ?: no", () => {
  assert.equal(detectFreeTextQuestion("", []), false);
  assert.equal(detectFreeTextQuestion("Tudo certo.", []), false);
});

test("decide: inactive stage, approval, aborted, error, paused -> nothing", () => {
  const q = "Qual é o público?";
  assert.equal(decideContinuation(input({ text: q, state: undefined })).correction, undefined);
  assert.equal(
    decideContinuation(input({ text: q, state: { ...base(), fase: "aprovacao" } })).correction,
    undefined,
  );
  assert.equal(decideContinuation(input({ text: q, outcome: "aborted" })).correction, undefined);
  assert.equal(decideContinuation(input({ text: q, outcome: "error" })).correction, undefined);
  assert.equal(
    decideContinuation(input({ text: q, state: { ...base(), pausado: true } })).correction,
    undefined,
  );
});

test("decide: free question -> correction A, up to 2 per run", () => {
  let c = ZERO_COUNTERS;
  const q = "Qual é o público?";
  const r1 = decideContinuation(input({ text: q, counters: c }));
  assert.equal(r1.correction?.kind, "A");
  c = r1.counters;
  const r2 = decideContinuation(input({ text: q, counters: c }));
  assert.equal(r2.correction?.kind, "A");
  c = r2.counters;
  const r3 = decideContinuation(input({ text: q, counters: c }));
  assert.notEqual(r3.correction?.kind, "A");
});

test("decide: tool in the question's own message -> no A, but B fires", () => {
  const r = decideContinuation(input({ text: "Qual é o público?", askedInLastMessage: true }));
  assert.equal(r.correction?.kind, "B");
});

test("decide: B fires even after tool questions, without question text", () => {
  const r = decideContinuation(input({ text: "Discussão fechada.", askedInLastMessage: true }));
  assert.equal(r.correction?.kind, "B");
});

test("decide: tool called earlier and text question at the end -> A", () => {
  const r = decideContinuation(input({ text: "Qual é o público?", askedInLastMessage: false }));
  assert.equal(r.correction?.kind, "A");
});

test("decide: open topics without question -> correction B, 1 per run", () => {
  const r1 = decideContinuation(input());
  assert.equal(r1.correction?.kind, "B");
  assert.match(r1.correction?.text ?? "", /ryker_perguntar/);
  const r2 = decideContinuation(input({ counters: r1.counters }));
  assert.equal(r2.correction, undefined);
});

test("decide: no open topics -> nothing; document phase without B", () => {
  assert.equal(decideContinuation(input({ state: closedState() })).correction, undefined);
  assert.equal(
    decideContinuation(input({ state: { ...base(), fase: "documento" } })).correction,
    undefined,
  );
});

test("decide: counters reset on every run (ZERO_COUNTERS)", () => {
  const r = decideContinuation(input());
  assert.notDeepEqual(r.counters, ZERO_COUNTERS);
  assert.equal(decideContinuation(input({ counters: ZERO_COUNTERS })).correction?.kind, "B");
});

test("post-approval: free-text question generates its own correction", () => {
  const approvedState: DiscussionState = { ...closedState(), fase: "aprovada" };
  const d = decideContinuation(
    input({ state: approvedState, text: "Plano pronto.\n\nQual modelo devo usar?" }),
  );
  assert.equal(d.correction?.kind, "A");
  assert.match(d.correction?.text ?? "", /depois da aprovação/);
  assert.doesNotMatch(d.correction?.text ?? "", /ryker_perguntar/);
  assert.equal(d.counters.free, 1);
});

test("post-approval: no question or at the limit does not correct", () => {
  const approvedState: DiscussionState = { ...closedState(), fase: "aprovada" };
  assert.equal(decideContinuation(input({ state: approvedState })).correction, undefined);
  const withinLimit = decideContinuation(
    input({
      state: approvedState,
      text: "Qual modelo devo usar?",
      counters: { free: 2, progress: 0 },
    }),
  );
  assert.equal(withinLimit.correction, undefined);
});
