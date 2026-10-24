import assert from "node:assert/strict";
import { test } from "node:test";
import { renderizar } from "./documento.ts";
import { aplicarTemas, criarEstado, type Estado } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";
import {
  type Achado,
  aplicarResolucoes,
  montarPedidoRevisor,
  parseAchados,
  pendentes,
  precisaRevisar,
  resumoRevisao,
  validarResolucoes,
} from "./revisao.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const T1 = "2026-10-23T11:00:00.000Z";
const T2 = "2026-10-23T12:00:00.000Z";

function base(): Estado {
  let e = criarEstado({
    pedido: "Quero uma CLI X",
    idioma: "pt",
    agora: T0,
    anterior: { ferramentas: [] },
  });
  e = registrarResposta(
    e,
    { tema: "resultado", pergunta: "Qual resultado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    T0,
  );
  return e;
}
const achado = (id: string, bloqueante: boolean, extra: Partial<Achado> = {}): Achado => ({
  id,
  bloqueante,
  texto: `texto ${id}`,
  exigeDecisaoMacro: false,
  ...extra,
});
const comRevisao = (achados: Achado[]): Estado => ({ ...base(), revisao: { em: T1, achados } });

test("montarPedidoRevisor: documento, registro, pedido e critérios; sem limite nem foco", () => {
  const e = base();
  const p = montarPedidoRevisor(e, "DOCUMENTO EM TEXTO");
  assert.match(p, /DOCUMENTO EM TEXTO/);
  assert.match(p, /Quero uma CLI X/);
  assert.match(p, /Qual resultado\?/);
  assert.match(p, /CLI pronta/);
  assert.match(p, /bloqueante/);
  assert.match(p, /exigeDecisaoMacro/);
  assert.doesNotMatch(p, /no máximo|limite de \d+/i);
});

test("parseAchados: JSON puro, cerca json, texto sem JSON, campo faltando", () => {
  const json =
    '{"achados":[{"bloqueante":true,"texto":"x","exigeDecisaoMacro":false,"tema":"apetite"}]}';
  const a = parseAchados(json);
  assert.equal(a.length, 1);
  assert.equal(a[0].id, "a1");
  assert.equal(a[0].tema, "apetite");
  assert.equal(parseAchados("Segue:\n```json\n" + json + "\n```\nfim")[0].texto, "x");
  assert.deepEqual(parseAchados('{"achados":[]}'), []);
  assert.throws(() => parseAchados("não há json aqui"), /JSON/);
  assert.throws(
    () => parseAchados('{"achados":[{"bloqueante":true,"exigeDecisaoMacro":false}]}'),
    /texto/,
  );
  assert.throws(
    () => parseAchados('{"achados":[{"texto":"x","exigeDecisaoMacro":false}]}'),
    /bloqueante/,
  );
});

test("rodada única: precisaRevisar só antes da primeira revisão", () => {
  assert.equal(precisaRevisar(base()), true);
  assert.equal(precisaRevisar(comRevisao([])), false);
});

test("resumoRevisao e pendentes", () => {
  const e = comRevisao([achado("a1", true), achado("a2", false), achado("a3", true)]);
  assert.equal(resumoRevisao(e.revisao?.achados ?? []), "Revisor: 3 achados (2 bloqueantes)");
  assert.deepEqual(
    pendentes(e).map((a) => a.id),
    ["a1", "a3"],
  );
});

test("validarResolucoes: todo bloqueante precisa de resolução", () => {
  const e = comRevisao([achado("a1", true), achado("a2", false)]);
  const r = validarResolucoes(e, []);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.erro, /a1/);
  const ok = validarResolucoes(e, [{ achado: "a1", tipo: "sintese", como: "reescrevi" }]);
  assert.equal(ok.ok, true);
});

test("validarResolucoes: id desconhecido rejeitado", () => {
  const e = comRevisao([achado("a1", true)]);
  const r = validarResolucoes(e, [
    { achado: "a1", tipo: "sintese", como: "x" },
    { achado: "zz", tipo: "sintese", como: "x" },
  ]);
  assert.match(r.ok ? "" : r.erro, /zz/);
});

test("validarResolucoes: tipo tema exige tema existente, fechado por pergunta e criado depois da revisão", () => {
  const e = comRevisao([achado("a1", true, { exigeDecisaoMacro: true })]);
  const res = (tema?: string) => [{ achado: "a1", tipo: "tema" as const, tema, como: "perguntei" }];
  assert.equal(validarResolucoes(e, res(undefined)).ok, false);
  assert.equal(validarResolucoes(e, res("nao-existe")).ok, false);
  // tema da base (criado antes da revisão), decidido por pergunta
  assert.match(
    (validarResolucoes(e, res("resultado")) as { erro: string }).erro,
    /depois da revisão/,
  );
  // tema novo ainda aberto
  const c = aplicarTemas(e, [{ acao: "criar", titulo: "Novo tema", secao: 1 }], T2);
  assert.ok(c.ok);
  const aberto = c.ok ? c.estado : e;
  assert.match((validarResolucoes(aberto, res("novo-tema")) as { erro: string }).erro, /pergunta/);
  // tema novo fechado por pergunta: aceito
  const fechado = registrarResposta(
    aberto,
    { tema: "novo-tema", pergunta: "?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    T2,
  );
  assert.equal(validarResolucoes(fechado, res("novo-tema")).ok, true);
});

test("aplicarResolucoes grava a resolução no achado", () => {
  const e = comRevisao([achado("a1", true)]);
  const n = aplicarResolucoes(e, [{ achado: "a1", tipo: "sintese", como: "reescrevi" }]);
  assert.deepEqual(n.revisao?.achados[0].resolucao, { tipo: "sintese", como: "reescrevi" });
  assert.equal(pendentes(n).length, 0);
});

test("não bloqueantes aparecem no apêndice do documento", () => {
  const e = comRevisao([achado("a1", false, { texto: "ponto <b>menor</b>" }), achado("a2", true)]);
  const { html } = renderizar(e, "T", []);
  assert.match(html, /id="apendice"/);
  assert.match(html, /ponto &lt;b&gt;menor&lt;\/b&gt;/);
  assert.doesNotMatch(html, /texto a2/);
  assert.doesNotMatch(renderizar(base(), "T", []).html, /id="apendice"/);
});
