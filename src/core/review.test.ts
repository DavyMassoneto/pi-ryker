import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "./document.ts";
import { recordAnswer } from "./questions.ts";
import {
  applyResolutions,
  buildReviewerRequest,
  type Finding,
  needsReview,
  parseFindings,
  pendingFindings,
  reviewSummary,
  validateResolutions,
} from "./review.ts";
import { applyTopics, createState, type DiscussionState } from "./state.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const T1 = "2026-10-23T11:00:00.000Z";
const T2 = "2026-10-23T12:00:00.000Z";

function base(): DiscussionState {
  let e = createState({
    request: "Quero uma CLI X",
    language: "pt",
    now: T0,
    previous: { ferramentas: [] },
  });
  e = recordAnswer(
    e,
    { tema: "resultado", pergunta: "Qual resultado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    T0,
  );
  return e;
}
const finding = (id: string, blocking: boolean, extra: Partial<Finding> = {}): Finding => ({
  id,
  bloqueante: blocking,
  texto: `texto ${id}`,
  exigeDecisaoMacro: false,
  ...extra,
});
const withReview = (findings: Finding[]): DiscussionState => ({
  ...base(),
  revisao: { em: T1, achados: findings },
});

test("buildReviewerRequest: document, record, request and criteria; no limit or focus", () => {
  const e = base();
  const p = buildReviewerRequest(e, "DOCUMENTO EM TEXTO");
  assert.match(p, /DOCUMENTO EM TEXTO/);
  assert.match(p, /Quero uma CLI X/);
  assert.match(p, /Qual resultado\?/);
  assert.match(p, /CLI pronta/);
  assert.match(p, /bloqueante/);
  assert.match(p, /exigeDecisaoMacro/);
  assert.doesNotMatch(p, /no máximo|limite de \d+/i);
});

test("parseFindings: plain JSON, json fence, text without JSON, missing field", () => {
  const json =
    '{"achados":[{"bloqueante":true,"texto":"x","exigeDecisaoMacro":false,"tema":"apetite"}]}';
  const a = parseFindings(json);
  assert.equal(a.length, 1);
  assert.equal(a[0].id, "a1");
  assert.equal(a[0].tema, "apetite");
  assert.equal(parseFindings("Segue:\n```json\n" + json + "\n```\nfim")[0].texto, "x");
  assert.deepEqual(parseFindings('{"achados":[]}'), []);
  assert.throws(() => parseFindings("não há json aqui"), /JSON/);
  assert.throws(
    () => parseFindings('{"achados":[{"bloqueante":true,"exigeDecisaoMacro":false}]}'),
    /texto/,
  );
  assert.throws(
    () => parseFindings('{"achados":[{"texto":"x","exigeDecisaoMacro":false}]}'),
    /bloqueante/,
  );
});

test("single round: needsReview only before the first review", () => {
  assert.equal(needsReview(base()), true);
  assert.equal(needsReview(withReview([])), false);
});

test("reviewSummary and pendingFindings", () => {
  const e = withReview([finding("a1", true), finding("a2", false), finding("a3", true)]);
  assert.equal(reviewSummary(e.revisao?.achados ?? []), "Revisor: 3 achados (2 bloqueantes)");
  assert.deepEqual(
    pendingFindings(e).map((a) => a.id),
    ["a1", "a3"],
  );
});

test("validateResolutions: every blocking finding needs a resolution", () => {
  const e = withReview([finding("a1", true), finding("a2", false)]);
  const r = validateResolutions(e, []);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /a1/);
  const ok = validateResolutions(e, [{ achado: "a1", tipo: "sintese", como: "reescrevi" }]);
  assert.equal(ok.ok, true);
});

test("validateResolutions: unknown id rejected", () => {
  const e = withReview([finding("a1", true)]);
  const r = validateResolutions(e, [
    { achado: "a1", tipo: "sintese", como: "x" },
    { achado: "zz", tipo: "sintese", como: "x" },
  ]);
  assert.match(r.ok ? "" : r.error, /zz/);
});

test("validateResolutions: topic type requires existing topic, closed by question and created after the review", () => {
  const e = withReview([finding("a1", true, { exigeDecisaoMacro: true })]);
  const res = (topic?: string) => [
    { achado: "a1", tipo: "tema" as const, tema: topic, como: "perguntei" },
  ];
  assert.equal(validateResolutions(e, res(undefined)).ok, false);
  assert.equal(validateResolutions(e, res("nao-existe")).ok, false);
  assert.match(
    (validateResolutions(e, res("resultado")) as { error: string }).error,
    /depois da revisão/,
  );
  const c = applyTopics(e, [{ acao: "criar", titulo: "Novo tema", secao: 1 }], T2);
  assert.ok(c.ok);
  const aberto = c.ok ? c.state : e;
  assert.match(
    (validateResolutions(aberto, res("novo-tema")) as { error: string }).error,
    /pergunta/,
  );
  const closedState = recordAnswer(
    aberto,
    { tema: "novo-tema", pergunta: "?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    T2,
  );
  assert.equal(validateResolutions(closedState, res("novo-tema")).ok, true);
});

test("applyResolutions writes the resolution on the finding", () => {
  const e = withReview([finding("a1", true)]);
  const n = applyResolutions(e, [{ achado: "a1", tipo: "sintese", como: "reescrevi" }]);
  assert.deepEqual(n.revisao?.achados[0].resolucao, { tipo: "sintese", como: "reescrevi" });
  assert.equal(pendingFindings(n).length, 0);
});

test("non-blocking findings appear in the document appendix", () => {
  const e = withReview([
    finding("a1", false, { texto: "ponto <b>menor</b>" }),
    finding("a2", true),
  ]);
  const { html } = render(e, "T", []);
  assert.match(html, /id="apendice"/);
  assert.match(html, /ponto &lt;b&gt;menor&lt;\/b&gt;/);
  assert.doesNotMatch(html, /texto a2/);
  assert.doesNotMatch(render(base(), "T", []).html, /id="apendice"/);
});
