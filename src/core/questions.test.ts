import assert from "node:assert/strict";
import { test } from "node:test";
import {
  interpretChoice,
  OTHER_ANSWER,
  pause,
  type QuestionInput,
  recordAnswer,
  selectOptions,
  validateQuestions,
} from "./questions.ts";
import { createState, type DiscussionState } from "./state.ts";

const NOW = "2026-10-23T10:00:00.000Z";
const added = (): DiscussionState =>
  createState({ request: "p", language: "pt", now: NOW, previous: { ferramentas: [] } });
const q = (topic = "para-quem", extra: Partial<QuestionInput> = {}): QuestionInput => ({
  tema: topic,
  pergunta: "Quem usa?",
  opcoes: ["Devs", "Designers", "Todos"],
  recomendada: 0,
  ...extra,
});
const error = (e: DiscussionState, l: QuestionInput[]) => {
  const r = validateQuestions(e, l);
  assert.equal(r.ok, false);
  return r.ok ? "" : r.error;
};

test("validateQuestions accepts valid batches of 1 and 4", () => {
  assert.deepEqual(validateQuestions(added(), [q()]), { ok: true });
  const batch = ["para-quem", "resultado", "apetite", "entra"].map((t) => q(t));
  assert.deepEqual(validateQuestions(added(), batch), { ok: true });
});

test("validateQuestions rejects 0 or 5 questions", () => {
  assert.match(error(added(), []), /1 a 4/);
  const fiveQuestions = ["para-quem", "resultado", "apetite", "entra", "fora"].map((t) => q(t));
  assert.match(error(added(), fiveQuestions), /1 a 4/);
});

test("validateQuestions rejects nonexistent topic", () => {
  assert.match(error(added(), [q("nao-existe")]), /nao-existe/);
});

test("validateQuestions rejects decided, assumed or deferred topic (closed topic)", () => {
  for (const status of ["decidido", "suposto", "adiado"] as const) {
    const e = added();
    e.temas[1].status = status;
    assert.match(error(e, [q(e.temas[1].id)]), /tema fechado/);
  }
});

test("validateQuestions rejects two items of the same topic", () => {
  assert.match(error(added(), [q("resultado"), q("resultado")]), /mesmo tema/);
});

test("validateQuestions rejects fewer than 2 or more than 5 options", () => {
  assert.match(error(added(), [q("resultado", { opcoes: ["a"] })]), /2 a 5/);
  assert.match(
    error(added(), [q("resultado", { opcoes: ["a", "b", "c", "d", "e", "f"] })]),
    /2 a 5/,
  );
});

test("validateQuestions rejects empty or duplicated option", () => {
  assert.match(error(added(), [q("resultado", { opcoes: ["a", "  "] })]), /vazia/);
  assert.match(error(added(), [q("resultado", { opcoes: ["a", "a"] })]), /duplicada/);
});

test("validateQuestions rejects recommended out of range", () => {
  assert.match(error(added(), [q("resultado", { recomendada: 3 })]), /recomendada/);
  assert.match(error(added(), [q("resultado", { recomendada: -1 })]), /recomendada/);
  assert.match(error(added(), [q("resultado", { recomendada: 0.5 })]), /recomendada/);
});

test("validateQuestions rejects the 'Outra resposta…' option", () => {
  assert.match(error(added(), [q("resultado", { opcoes: ["a", OTHER_ANSWER] })]), /Outra resposta/);
});

test("validateQuestions rejects phase other than discovery", () => {
  const e = added();
  e.fase = "documento";
  assert.match(error(e, [q()]), /fase/);
});

test("selectOptions: recommended first with suffix, 'Outra resposta…' last", () => {
  const options = selectOptions(q("resultado", { recomendada: 2 }));
  assert.deepEqual(options, ["Todos (recomendada)", "Devs", "Designers", OTHER_ANSWER]);
});

test("interpretChoice: recommended → original text; other → free; unknown → cancelled", () => {
  const p = q("resultado", { recomendada: 1 });
  assert.deepEqual(interpretChoice(p, "Designers (recomendada)"), {
    kind: "option",
    text: "Designers",
  });
  assert.deepEqual(interpretChoice(p, "Devs"), { kind: "option", text: "Devs" });
  assert.deepEqual(interpretChoice(p, OTHER_ANSWER), { kind: "free" });
  assert.deepEqual(interpretChoice(p, "algo estranho"), { kind: "cancelled" });
  assert.deepEqual(interpretChoice(p, undefined), { kind: "cancelled" });
});

test("recordAnswer: topic decided, user origin + questionId, text = question + answer", () => {
  const e = recordAnswer(added(), q("resultado"), "Devs", false, NOW);
  const t = e.temas.find((x) => x.id === "resultado");
  assert.equal(t?.status, "decidido");
  assert.equal(t?.quando, NOW);
  assert.deepEqual(t?.origem, { tipo: "usuario", perguntaId: e.perguntas[0].id });
  assert.match(t?.texto ?? "", /Quem usa\?/);
  assert.match(t?.texto ?? "", /Devs/);
  assert.equal(e.perguntas[0].resposta, "Devs");
  assert.equal(e.perguntas[0].livre, false);
});

test("recordAnswer marks free answer and does not mutate the original state", () => {
  const before = added();
  const e = recordAnswer(before, q("resultado"), "resposta-livre", true, NOW);
  assert.equal(e.perguntas[0].livre, true);
  assert.equal(before.perguntas.length, 0);
  assert.equal(before.temas.find((x) => x.id === "resultado")?.status, "aberto");
});

test("recordAnswer rejects already closed topic", () => {
  const e = recordAnswer(added(), q("resultado"), "Devs", false, NOW);
  assert.throws(() => recordAnswer(e, q("resultado"), "Outro", false, NOW), /tema fechado/);
});

test("cancellation in the middle of the batch: answered stay, remaining open, paused = true", () => {
  let e = recordAnswer(added(), q("resultado"), "Devs", false, NOW);
  e = pause(e);
  assert.equal(e.pausado, true);
  assert.equal(e.temas.find((x) => x.id === "resultado")?.status, "decidido");
  assert.equal(e.temas.find((x) => x.id === "apetite")?.status, "aberto");
  assert.equal(e.perguntas.length, 1);
});
