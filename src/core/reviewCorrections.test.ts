import assert from "node:assert/strict";
import { test } from "node:test";
import { render, validateSyntheses } from "./document.ts";
import { recordAnswer } from "./questions.ts";
import { validateResolutions } from "./review.ts";
import { applyTopics, createState, type DiscussionState } from "./state.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const T1 = "2026-10-23T11:00:00.000Z";
const T2 = "2026-10-23T12:00:00.000Z";

const base = (): DiscussionState =>
  createState({
    request: "Quero uma CLI de lembretes",
    language: "pt",
    now: T0,
    previous: { ferramentas: [] },
  });
const ok = (r: ReturnType<typeof applyTopics>): DiscussionState => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.ok ? r.state : base();
};
const topic = (e: DiscussionState, id: string) => e.temas.find((t) => t.id === id);
const answer = (e: DiscussionState, t: string, r: string, when = T0) =>
  recordAnswer(
    e,
    { tema: t, pergunta: `Pergunta de ${t}?`, opcoes: ["a", "b"], recomendada: 0 },
    r,
    false,
    when,
  );
const finding = (id: string, blocking: boolean, requiresMacro: boolean) => ({
  id,
  bloqueante: blocking,
  texto: `texto ${id}`,
  exigeDecisaoMacro: requiresMacro,
});

test("B2: type 'tema' only valid for a finding with requiresMacroDecision", () => {
  let e = base();
  e = { ...e, revisao: { em: T1, achados: [finding("a1", true, false)] } };
  e = ok(applyTopics(e, [{ acao: "criar", titulo: "Novo", secao: 1 }], T2));
  e = answer(e, "novo", "x", T2);
  const r = validateResolutions(e, [
    { achado: "a1", tipo: "tema", tema: "novo", como: "perguntei" },
  ]);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /exigeDecisaoMacro|decisão macro/);
  assert.match(r.ok ? "" : r.error, /síntese|suposição/);
});

test("B3a: assuming on an assumed topic replaces text and reason and keeps the previous one", () => {
  let e = ok(
    applyTopics(base(), [{ acao: "supor", tema: "riscos", texto: "A", motivo: "m1" }], T0),
  );
  e = ok(applyTopics(e, [{ acao: "supor", tema: "riscos", texto: "B", motivo: "m2" }], T2));
  const t = topic(e, "riscos");
  assert.equal(t?.status, "suposto");
  assert.equal(t?.texto, "B");
  assert.equal(t?.motivo, "m2");
  assert.equal(t?.revistoEm, T2);
  assert.equal(t?.historico.length, 1);
  assert.equal(t?.historico[0].texto, "A");
});

test("B3a: topic decided by the user remains untouchable by the agent", () => {
  const e = answer(base(), "riscos", "x");
  const r = applyTopics(e, [{ acao: "supor", tema: "riscos", texto: "B", motivo: "m" }], T2);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /tema fechado/);
});

test("B3a: 'suposicao' resolution requires an assumed topic re-assumed after the review", () => {
  let e = ok(
    applyTopics(base(), [{ acao: "supor", tema: "riscos", texto: "A", motivo: "m1" }], T0),
  );
  e = { ...e, revisao: { em: T1, achados: [finding("a1", true, false)] } };
  const res = [{ achado: "a1", tipo: "suposicao" as const, tema: "riscos", como: "reescrevi" }];
  const before = validateResolutions(e, res);
  assert.match(before.ok ? "" : before.error, /depois da revisão/);
  e = ok(applyTopics(e, [{ acao: "supor", tema: "riscos", texto: "B", motivo: "m2" }], T2));
  assert.equal(validateResolutions(e, res).ok, true);
  const withoutTopic = validateResolutions(e, [{ achado: "a1", tipo: "suposicao", como: "x" }]);
  assert.equal(withoutTopic.ok, false);
  const notAssumed = validateResolutions(e, [
    { achado: "a1", tipo: "suposicao", tema: "apetite", como: "x" },
  ]);
  assert.equal(notAssumed.ok, false);
});

test("B3b: revises accepts assumed topic; refuses open topic", () => {
  const e = ok(
    applyTopics(base(), [{ acao: "supor", tema: "riscos", texto: "A", motivo: "m" }], T0),
  );
  assert.ok(applyTopics(e, [{ acao: "criar", titulo: "Y", secao: 8, revisa: "riscos" }], T1).ok);
  const r = applyTopics(e, [{ acao: "criar", titulo: "Y", secao: 8, revisa: "apetite" }], T1);
  assert.equal(r.ok, false);
});

function withRevises(): DiscussionState {
  let e = answer(base(), "resultado", "CLI pronta");
  e = ok(
    applyTopics(
      e,
      [{ acao: "criar", titulo: "Resultado revisto", secao: 2, revisa: "resultado" }],
      T1,
    ),
  );
  return answer(e, "resultado-revisto", "CLI e daemon", T2);
}

test("B3b: topic that revises replaces the revised one when the user decides it", () => {
  const e = withRevises();
  assert.equal(topic(e, "resultado")?.substituidoPor, "resultado-revisto");
  assert.equal(topic(e, "resultado-revisto")?.status, "decidido");
});

test("B3b: the old text leaves sections 1-10 and stays only in the record", () => {
  const e = withRevises();
  const { html } = render(e, "T", [{ secao: 2, texto: "síntese" }]);
  assert.equal(html.split('data-tema="resultado"').length - 1, 0);
  assert.equal(html.split('data-tema="resultado-revisto"').length - 1, 1);
  const recordSection = html.slice(html.indexOf('id="s11"'));
  assert.match(recordSection, /data-registro="resultado"/);
  assert.match(recordSection, /substituído por/);
  const section2 = html.slice(html.indexOf('id="s2"'), html.indexOf('id="s3"'));
  assert.doesNotMatch(section2, /CLI pronta/);
});

test("B3b: validateSyntheses does not require a section that only has a replaced topic", () => {
  let e = answer(base(), "apetite", "1 semana");
  e = ok(
    applyTopics(e, [{ acao: "criar", titulo: "Apetite novo", secao: 4, revisa: "apetite" }], T1),
  );
  e = answer(e, "apetite-novo", "2 semanas", T2);
  assert.equal(validateSyntheses(e, [{ secao: 4, texto: "x" }]).ok, true);
});

test("B1: the reviewer text has the structure and labels of the HTML", () => {
  let e = answer(base(), "resultado", "CLI pronta");
  e = ok(
    applyTopics(
      e,
      [
        { acao: "supor", tema: "riscos", texto: "Risco assumido", motivo: "padrão do time" },
        { acao: "adiar", tema: "apetite", texto: "Prazo em aberto", quando: "antes do plano" },
      ],
      T0,
    ),
  );
  const { text } = render(e, "Visão X", [{ secao: 2, texto: "síntese do resultado" }]);
  for (const n of [1, 2, 8, 9, 10, 11]) assert.match(text, new RegExp(`^## ${n}\\. `, "m"));
  assert.match(text, /^## 9\. Suposições/m);
  assert.match(text, /Suposição do agente, não decidida pelo usuário/);
  assert.match(text, /Por que não perguntei: padrão do time/);
  assert.match(text, /Decidir quando: antes do plano/);
  assert.match(text, /Resposta: CLI pronta/);
  assert.match(text, /Origem: usuário/);
  const s2 = text.slice(text.indexOf("## 2."), text.indexOf("## 3."));
  assert.equal(s2.split("CLI pronta").length - 1, 1);
  assert.match(text, /Pedido original: Quero uma CLI de lembretes/);
  assert.ok(
    !text.trimEnd().endsWith("Quero uma CLI de lembretes\n") || /Pedido original/.test(text),
  );
  assert.doesNotMatch(text.trimEnd().split("\n").pop() ?? "", /^Quero uma CLI/);
});
