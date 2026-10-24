import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicarTemas, criarEstado, type Estado } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";
import { interpretarSelecao, opcoesSelecao, reabrirTemas, textoReabertos } from "./reabertura.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const T1 = "2026-10-23T11:00:00.000Z";

function aprovacao(): Estado {
  let e = criarEstado({ pedido: "p", idioma: "pt", agora: T0, anterior: { ferramentas: [] } });
  e = registrarResposta(
    e,
    { tema: "resultado", pergunta: "Qual resultado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    T0,
  );
  const r = aplicarTemas(
    e,
    [{ acao: "supor", tema: "apetite", texto: "2 semanas", motivo: "padrão" }],
    T0,
  );
  assert.ok(r.ok);
  const estado = r.ok ? r.estado : e;
  return {
    ...estado,
    fase: "aprovacao",
    documento: { caminho: ".ryker/visao.html", geradoEm: T0 },
    revisao: { em: T0, achados: [] },
  };
}
const tema = (e: Estado, id: string) => e.temas.find((t) => t.id === id);

test("reabrirTemas: reabre fechado, guarda histórico e nota, volta à descoberta", () => {
  const r = reabrirTemas(aprovacao(), [{ tema: "resultado", nota: "mudou o foco" }], T1);
  assert.ok(r.ok);
  if (!r.ok) return;
  const t = tema(r.estado, "resultado");
  assert.equal(t?.status, "aberto");
  assert.deepEqual(t?.reabertura, { nota: "mudou o foco", em: T1 });
  assert.equal(t?.historico.length, 1);
  assert.equal(t?.historico[0].status, "decidido");
  assert.match(t?.historico[0].texto ?? "", /CLI pronta/);
  assert.equal(t?.texto, undefined);
  assert.equal(r.estado.fase, "descoberta");
  assert.equal(r.estado.pausado, false);
});

test("reabrirTemas: invalida o documento mas não a revisão (1 rodada)", () => {
  const r = reabrirTemas(aprovacao(), [{ tema: "apetite", nota: "" }], T1);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.estado.documento, undefined);
  assert.ok(r.estado.revisao);
});

test("reabrirTemas: só temas fechados, existentes e fase ativa; não muta", () => {
  const e = aprovacao();
  const aberto = reabrirTemas(e, [{ tema: "riscos", nota: "" }], T1);
  assert.match(aberto.ok ? "" : aberto.erro, /aberto/);
  const nada = reabrirTemas(e, [{ tema: "xx", nota: "" }], T1);
  assert.match(nada.ok ? "" : nada.erro, /xx/);
  const vazio = reabrirTemas(e, [], T1);
  assert.equal(vazio.ok, false);
  const aprovada = reabrirTemas({ ...e, fase: "aprovada" }, [{ tema: "resultado", nota: "" }], T1);
  assert.equal(aprovada.ok, false);
  assert.equal(tema(e, "resultado")?.status, "decidido");
});

test("reabrirTemas: tema reaberto recusa fonte, supor e adiar e só fecha por pergunta", () => {
  const r = reabrirTemas(aprovacao(), [{ tema: "resultado", nota: "" }], T1);
  assert.ok(r.ok);
  if (!r.ok) return;
  for (const item of [
    { acao: "fonte" as const, tema: "resultado", texto: "x", origem: "README.md" },
    { acao: "supor" as const, tema: "resultado", texto: "x", motivo: "y" },
    { acao: "adiar" as const, tema: "resultado", texto: "x", quando: "z" },
  ]) {
    const a = aplicarTemas(r.estado, [item], T1);
    assert.match(a.ok ? "" : a.erro, /reaberto/);
  }
  const resp = registrarResposta(
    r.estado,
    { tema: "resultado", pergunta: "Qual?", opcoes: ["a", "b"], recomendada: 0 },
    "nova",
    false,
    T1,
  );
  assert.equal(tema(resp, "resultado")?.status, "decidido");
  assert.equal(tema(resp, "resultado")?.reabertura, undefined);
  assert.equal(tema(resp, "resultado")?.historico.length, 1);
});

test("laço de seleção: lista só fechados, alterna, conclui; vazio volta à aprovação", () => {
  const e = aprovacao();
  const o0 = opcoesSelecao(e, []);
  assert.equal(o0.length, 3); // resultado, apetite, Concluir
  assert.ok(o0[0].includes("resultado"));
  assert.equal(o0[o0.length - 1], "Concluir");
  const s1 = interpretarSelecao(e, [], o0[0]);
  assert.deepEqual(s1, { tipo: "selecao", selecionados: ["resultado"] });
  const o1 = opcoesSelecao(e, ["resultado"]);
  assert.ok(o1[0].startsWith("✓"));
  assert.deepEqual(interpretarSelecao(e, ["resultado"], o1[0]), {
    tipo: "selecao",
    selecionados: [],
  });
  assert.deepEqual(interpretarSelecao(e, ["resultado"], "Concluir"), {
    tipo: "concluir",
    selecionados: ["resultado"],
  });
  assert.deepEqual(interpretarSelecao(e, [], "Concluir"), { tipo: "voltar" });
  assert.deepEqual(interpretarSelecao(e, [], undefined), { tipo: "voltar" });
  assert.deepEqual(interpretarSelecao(e, [], "desconhecido"), { tipo: "voltar" });
});

test("textoReabertos lista temas e notas para o modelo", () => {
  const t = textoReabertos([
    { tema: "resultado", nota: "mudou o foco" },
    { tema: "apetite", nota: "" },
  ]);
  assert.match(t, /resultado.*mudou o foco/);
  assert.match(t, /apetite/);
  assert.match(t, /ryker_perguntar/);
});
