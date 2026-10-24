import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicarTemas, aprovar, criarEstado, type Estado, type ItemTema } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";

const AGORA = "2026-10-23T10:00:00.000Z";
const novo = (): Estado =>
  criarEstado({
    pedido: "p",
    idioma: "pt",
    agora: AGORA,
    anterior: { modelo: { provider: "omni", id: "sonnet" }, ferramentas: ["read", "bash"] },
  });
const tema = (e: Estado, id: string) => e.temas.find((t) => t.id === id);
const erro = (e: Estado, itens: ItemTema[]) => {
  const r = aplicarTemas(e, itens, AGORA);
  assert.equal(r.ok, false);
  return r.ok ? "" : r.erro;
};

test("fonte: exige tema aberto, texto e origem; vira decidido com origem fonte", () => {
  const r = aplicarTemas(
    novo(),
    [{ acao: "fonte", tema: "para-quem", texto: "Devs", origem: "README.md" }],
    AGORA,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const t = tema(r.estado, "para-quem");
  assert.equal(t?.status, "decidido");
  assert.deepEqual(t?.origem, { tipo: "fonte", ref: "README.md" });
  assert.match(erro(novo(), [{ acao: "fonte", tema: "para-quem", texto: "x" }]), /origem/);
  assert.match(erro(novo(), [{ acao: "fonte", tema: "para-quem", origem: "r" }]), /texto/);
  assert.match(erro(novo(), [{ acao: "fonte", origem: "r", texto: "x" }]), /tema/);
});

test("supor exige texto e motivo; adiar exige texto e quando", () => {
  const r = aplicarTemas(
    novo(),
    [
      { acao: "supor", tema: "apetite", texto: "2 semanas", motivo: "padrão do time" },
      { acao: "adiar", tema: "riscos", texto: "ver depois", quando: "antes do plano" },
    ],
    AGORA,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(tema(r.estado, "apetite")?.status, "suposto");
  assert.equal(tema(r.estado, "apetite")?.motivo, "padrão do time");
  assert.equal(tema(r.estado, "riscos")?.status, "adiado");
  assert.equal(tema(r.estado, "riscos")?.quando, "antes do plano");
  assert.match(erro(novo(), [{ acao: "supor", tema: "apetite", texto: "x" }]), /motivo/);
  assert.match(erro(novo(), [{ acao: "adiar", tema: "riscos", texto: "x" }]), /quando/);
});

test("lote é tudo-ou-nada", () => {
  const e = novo();
  const m = erro(e, [
    { acao: "supor", tema: "apetite", texto: "x", motivo: "y" },
    { acao: "supor", tema: "nao-existe", texto: "x", motivo: "y" },
  ]);
  assert.match(m, /nao-existe/);
  assert.equal(tema(e, "apetite")?.status, "aberto");
});

test("tema fechado é rejeitado", () => {
  const e = registrarResposta(
    novo(),
    { tema: "resultado", pergunta: "?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    AGORA,
  );
  assert.match(
    erro(e, [{ acao: "supor", tema: "resultado", texto: "x", motivo: "y" }]),
    /tema fechado/,
  );
});

test("tema reaberto só fecha por pergunta", () => {
  const e = novo();
  e.temas[0].reabertura = { nota: "rever", em: AGORA };
  assert.match(
    erro(e, [{ acao: "supor", tema: e.temas[0].id, texto: "x", motivo: "y" }]),
    /reaberto/,
  );
});

test("criar: gera id único, exige titulo e secao 1..8, revisa só de tema decidido", () => {
  const r = aplicarTemas(
    novo(),
    [
      { acao: "criar", titulo: "Público-alvo!", secao: 1 },
      { acao: "criar", titulo: "Público-alvo!", secao: 1 },
    ],
    AGORA,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const novos = r.estado.temas.filter((t) => t.criadoPor === "modelo");
  assert.equal(novos.length, 2);
  assert.notEqual(novos[0].id, novos[1].id);
  assert.equal(novos[0].status, "aberto");
  assert.match(erro(novo(), [{ acao: "criar", secao: 1 }]), /titulo/);
  assert.match(erro(novo(), [{ acao: "criar", titulo: "x", secao: 9 }]), /secao/);
  assert.match(
    erro(novo(), [{ acao: "criar", titulo: "x", secao: 1, revisa: "resultado" }]),
    /revisa/,
  );
  const dec = registrarResposta(
    novo(),
    { tema: "resultado", pergunta: "?", opcoes: ["a", "b"], recomendada: 0 },
    "a",
    false,
    AGORA,
  );
  const ok = aplicarTemas(
    dec,
    [{ acao: "criar", titulo: "x", secao: 2, revisa: "resultado" }],
    AGORA,
  );
  assert.equal(ok.ok, true);
});

test("aprovar: fase aprovada, aprovadoEm e devolve ferramentas e modelo anteriores", () => {
  const r = aprovar(novo(), AGORA);
  assert.equal(r.estado.fase, "aprovada");
  assert.equal(r.estado.aprovadoEm, AGORA);
  assert.deepEqual(r.ferramentas, ["read", "bash"]);
  assert.deepEqual(r.modelo, { provider: "omni", id: "sonnet" });
});
