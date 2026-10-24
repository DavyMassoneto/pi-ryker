import assert from "node:assert/strict";
import { test } from "node:test";
import { renderizar } from "./documento.ts";
import { aplicarTemas, criarEstado } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";

const T0 = "2026-10-23T10:00:00.000Z";

function estado() {
  let e = criarEstado({ pedido: "p", idioma: "pt", agora: T0, anterior: { ferramentas: [] } });
  e = registrarResposta(
    e,
    { tema: "resultado", pergunta: "Qual resultado esperado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    T0,
  );
  const r = aplicarTemas(
    e,
    [{ acao: "supor", tema: "apetite", texto: "2 semanas", motivo: "padrão do time" }],
    T0,
  );
  return r.ok ? r.estado : e;
}
const secao = (html: string, n: number) =>
  html.slice(html.indexOf(`id="s${n}"`), html.indexOf(`id="s${n + 1}"`));

test("seções 1-8 mostram a decisão, não o par pergunta → resposta cru", () => {
  const { html } = renderizar(estado(), "T", [{ secao: 2, texto: "síntese" }]);
  const s2 = secao(html, 2);
  assert.match(s2, /CLI pronta/);
  assert.doesNotMatch(s2, /Qual resultado esperado/);
  assert.doesNotMatch(s2, /→/);
  // o par fica no registro (seção 11)
  assert.match(html.slice(html.indexOf('id="s11"')), /Qual resultado esperado/);
});

test("suposições só na seção 9, rotuladas como não decididas pelo usuário", () => {
  const { html } = renderizar(estado(), "T", [{ secao: 2, texto: "síntese" }]);
  assert.equal(html.split('data-tema="apetite"').length - 1, 1);
  const s9 = secao(html, 9);
  assert.match(s9, /data-tema="apetite"/);
  assert.match(s9, /Suposição[^<]*não decidida pelo usuário/);
  assert.doesNotMatch(secao(html, 3), /2 semanas/);
});
