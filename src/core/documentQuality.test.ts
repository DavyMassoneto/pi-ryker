import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "./document.ts";
import { recordAnswer } from "./questions.ts";
import { applyTopics, createState } from "./state.ts";

const T0 = "2026-10-23T10:00:00.000Z";

function state() {
  let e = createState({ request: "p", language: "pt", now: T0, previous: { ferramentas: [] } });
  e = recordAnswer(
    e,
    { tema: "resultado", pergunta: "Qual resultado esperado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    T0,
  );
  const r = applyTopics(
    e,
    [{ acao: "supor", tema: "apetite", texto: "2 semanas", motivo: "padrão do time" }],
    T0,
  );
  return r.ok ? r.state : e;
}
const section = (html: string, n: number) =>
  html.slice(html.indexOf(`id="s${n}"`), html.indexOf(`id="s${n + 1}"`));

test("sections 1-8 show the decision, not the raw question → answer pair", () => {
  const { html } = render(state(), "T", [{ secao: 2, texto: "síntese" }]);
  const s2 = section(html, 2);
  assert.match(s2, /CLI pronta/);
  assert.doesNotMatch(s2, /Qual resultado esperado/);
  assert.doesNotMatch(s2, /→/);
  assert.match(html.slice(html.indexOf('id="s11"')), /Qual resultado esperado/);
});

test("assumptions only in section 9, labeled as not decided by the user", () => {
  const { html } = render(state(), "T", [{ secao: 2, texto: "síntese" }]);
  assert.equal(html.split('data-tema="apetite"').length - 1, 1);
  const s9 = section(html, 9);
  assert.match(s9, /data-tema="apetite"/);
  assert.match(s9, /Suposição[^<]*não decidida pelo usuário/);
  assert.doesNotMatch(section(html, 3), /2 semanas/);
});

test("reviewer finding is escaped exactly once", () => {
  const e = {
    ...state(),
    revisao: {
      em: T0,
      achados: [{ id: "a1", bloqueante: false, texto: "o 'x' < y", exigeDecisaoMacro: false }],
    },
  };
  const { html } = render(e, "T", [{ secao: 2, texto: "síntese" }]);
  assert.equal(html.split("o &#39;x&#39; &lt; y").length - 1, 1);
  assert.doesNotMatch(html, /&amp;(#39|lt|gt|quot);/);
});

test("section with synthesis: prose + compact 'Decisões registradas' list, no repeated h3", () => {
  const { html } = render(state(), "T", [{ secao: 2, texto: "síntese do resultado" }]);
  const s2 = section(html, 2);
  assert.match(s2, /síntese do resultado/);
  assert.match(s2, /Decisões registradas/);
  assert.match(s2, /<li data-tema="resultado"><strong>[^<]+:<\/strong> CLI pronta<\/li>/);
  assert.doesNotMatch(s2, /<h3>/);
  assert.equal(html.split('data-tema="resultado"').length - 1, 1);
});

test("section without synthesis: one block per topic, as before", () => {
  const s2 = section(render(state(), "T", []).html, 2);
  assert.match(s2, /<article data-tema="resultado"><h3>/);
  assert.doesNotMatch(s2, /Decisões registradas/);
});
