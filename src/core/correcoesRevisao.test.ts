import assert from "node:assert/strict";
import { test } from "node:test";
import { renderizar, validarSinteses } from "./documento.ts";
import { aplicarTemas, criarEstado, type Estado } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";
import { validarResolucoes } from "./revisao.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const T1 = "2026-10-23T11:00:00.000Z";
const T2 = "2026-10-23T12:00:00.000Z";

const base = (): Estado =>
  criarEstado({
    pedido: "Quero uma CLI de lembretes",
    idioma: "pt",
    agora: T0,
    anterior: { ferramentas: [] },
  });
const ok = (r: ReturnType<typeof aplicarTemas>): Estado => {
  assert.ok(r.ok, r.ok ? "" : r.erro);
  return r.ok ? r.estado : base();
};
const tema = (e: Estado, id: string) => e.temas.find((t) => t.id === id);
const resp = (e: Estado, t: string, r: string, quando = T0) =>
  registrarResposta(
    e,
    { tema: t, pergunta: `Pergunta de ${t}?`, opcoes: ["a", "b"], recomendada: 0 },
    r,
    false,
    quando,
  );
const achado = (id: string, bloqueante: boolean, exige: boolean) => ({
  id,
  bloqueante,
  texto: `texto ${id}`,
  exigeDecisaoMacro: exige,
});

// ---- B2
test("B2: tipo 'tema' só vale para achado com exigeDecisaoMacro", () => {
  let e = base();
  e = { ...e, revisao: { em: T1, achados: [achado("a1", true, false)] } };
  e = ok(aplicarTemas(e, [{ acao: "criar", titulo: "Novo", secao: 1 }], T2));
  e = resp(e, "novo", "x", T2);
  const r = validarResolucoes(e, [{ achado: "a1", tipo: "tema", tema: "novo", como: "perguntei" }]);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.erro, /exigeDecisaoMacro|decisão macro/);
  assert.match(r.ok ? "" : r.erro, /síntese|suposição/);
});

// ---- B3a
test("B3a: supor num tema suposto substitui texto e motivo e guarda o anterior", () => {
  let e = ok(
    aplicarTemas(base(), [{ acao: "supor", tema: "riscos", texto: "A", motivo: "m1" }], T0),
  );
  e = ok(aplicarTemas(e, [{ acao: "supor", tema: "riscos", texto: "B", motivo: "m2" }], T2));
  const t = tema(e, "riscos");
  assert.equal(t?.status, "suposto");
  assert.equal(t?.texto, "B");
  assert.equal(t?.motivo, "m2");
  assert.equal(t?.revistoEm, T2);
  assert.equal(t?.historico.length, 1);
  assert.equal(t?.historico[0].texto, "A");
});

test("B3a: tema decidido pelo usuário continua intocável pelo agente", () => {
  const e = resp(base(), "riscos", "x");
  const r = aplicarTemas(e, [{ acao: "supor", tema: "riscos", texto: "B", motivo: "m" }], T2);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.erro, /tema fechado/);
});

test("B3a: resolução 'suposicao' exige tema suposto re-suposto depois da revisão", () => {
  let e = ok(
    aplicarTemas(base(), [{ acao: "supor", tema: "riscos", texto: "A", motivo: "m1" }], T0),
  );
  e = { ...e, revisao: { em: T1, achados: [achado("a1", true, false)] } };
  const res = [{ achado: "a1", tipo: "suposicao" as const, tema: "riscos", como: "reescrevi" }];
  const antes = validarResolucoes(e, res);
  assert.match(antes.ok ? "" : antes.erro, /depois da revisão/);
  e = ok(aplicarTemas(e, [{ acao: "supor", tema: "riscos", texto: "B", motivo: "m2" }], T2));
  assert.equal(validarResolucoes(e, res).ok, true);
  const semTema = validarResolucoes(e, [{ achado: "a1", tipo: "suposicao", como: "x" }]);
  assert.equal(semTema.ok, false);
  const naoSuposto = validarResolucoes(e, [
    { achado: "a1", tipo: "suposicao", tema: "apetite", como: "x" },
  ]);
  assert.equal(naoSuposto.ok, false);
});

// ---- B3b
test("B3b: revisa aceita tema suposto; recusa tema aberto", () => {
  const e = ok(
    aplicarTemas(base(), [{ acao: "supor", tema: "riscos", texto: "A", motivo: "m" }], T0),
  );
  assert.ok(aplicarTemas(e, [{ acao: "criar", titulo: "Y", secao: 8, revisa: "riscos" }], T1).ok);
  const r = aplicarTemas(e, [{ acao: "criar", titulo: "Y", secao: 8, revisa: "apetite" }], T1);
  assert.equal(r.ok, false);
});

function comRevisa(): Estado {
  let e = resp(base(), "resultado", "CLI pronta");
  e = ok(
    aplicarTemas(
      e,
      [{ acao: "criar", titulo: "Resultado revisto", secao: 2, revisa: "resultado" }],
      T1,
    ),
  );
  return resp(e, "resultado-revisto", "CLI e daemon", T2);
}

test("B3b: tema que revisa substitui o revisado quando o usuário o decide", () => {
  const e = comRevisa();
  assert.equal(tema(e, "resultado")?.substituidoPor, "resultado-revisto");
  assert.equal(tema(e, "resultado-revisto")?.status, "decidido");
});

test("B3b: o texto antigo sai das seções 1-10 e fica só no registro", () => {
  const e = comRevisa();
  const { html } = renderizar(e, "T", [{ secao: 2, texto: "síntese" }]);
  assert.equal(html.split('data-tema="resultado"').length - 1, 0);
  assert.equal(html.split('data-tema="resultado-revisto"').length - 1, 1);
  const reg = html.slice(html.indexOf('id="s11"'));
  assert.match(reg, /data-registro="resultado"/);
  assert.match(reg, /substituído por/);
  const sec2 = html.slice(html.indexOf('id="s2"'), html.indexOf('id="s3"'));
  assert.doesNotMatch(sec2, /CLI pronta/);
});

test("B3b: validarSinteses não exige seção que só tem tema substituído", () => {
  let e = resp(base(), "apetite", "1 semana");
  e = ok(
    aplicarTemas(e, [{ acao: "criar", titulo: "Apetite novo", secao: 4, revisa: "apetite" }], T1),
  );
  e = resp(e, "apetite-novo", "2 semanas", T2);
  assert.equal(validarSinteses(e, [{ secao: 4, texto: "x" }]).ok, true);
});

// ---- B1
test("B1: o texto do revisor tem a estrutura e os rótulos do HTML", () => {
  let e = resp(base(), "resultado", "CLI pronta");
  e = ok(
    aplicarTemas(
      e,
      [
        { acao: "supor", tema: "riscos", texto: "Risco assumido", motivo: "padrão do time" },
        { acao: "adiar", tema: "apetite", texto: "Prazo em aberto", quando: "antes do plano" },
      ],
      T0,
    ),
  );
  const { texto } = renderizar(e, "Visão X", [{ secao: 2, texto: "síntese do resultado" }]);
  for (const n of [1, 2, 8, 9, 10, 11]) assert.match(texto, new RegExp(`^## ${n}\\. `, "m"));
  assert.match(texto, /^## 9\. Suposições/m);
  assert.match(texto, /Suposição do agente, não decidida pelo usuário/);
  assert.match(texto, /Por que não perguntei: padrão do time/);
  assert.match(texto, /Decidir quando: antes do plano/);
  assert.match(texto, /Resposta: CLI pronta/);
  assert.match(texto, /Origem: usuário/);
  // sem repetição: o texto da decisão aparece uma vez na seção 2
  const s2 = texto.slice(texto.indexOf("## 2."), texto.indexOf("## 3."));
  assert.equal(s2.split("CLI pronta").length - 1, 1);
  // o pedido está rotulado, não solto no fim
  assert.match(texto, /Pedido original: Quero uma CLI de lembretes/);
  assert.ok(
    !texto.trimEnd().endsWith("Quero uma CLI de lembretes\n") || /Pedido original/.test(texto),
  );
  assert.doesNotMatch(texto.trimEnd().split("\n").pop() ?? "", /^Quero uma CLI/);
});
