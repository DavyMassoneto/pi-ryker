import assert from "node:assert/strict";
import { test } from "node:test";
import {
  comandoAbrir,
  LIMITE_AVISO,
  podeGerarDocumento,
  renderizar,
  validarSinteses,
} from "./documento.ts";
import { aplicarTemas, criarEstado, type Estado } from "./estado.ts";
import { registrarResposta } from "./perguntas.ts";

const AGORA = "2026-10-23T10:00:00.000Z";

function fechado(): Estado {
  let e = criarEstado({ pedido: "p", idioma: "pt", agora: AGORA, anterior: { ferramentas: [] } });
  e = registrarResposta(
    e,
    { tema: "resultado", pergunta: "Qual resultado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    AGORA,
  );
  const itens = e.temas
    .filter((t) => t.status === "aberto")
    .map((t, i) =>
      i % 3 === 0
        ? { acao: "fonte" as const, tema: t.id, texto: `fonte ${t.id}`, origem: "README.md" }
        : i % 3 === 1
          ? { acao: "supor" as const, tema: t.id, texto: `sup ${t.id}`, motivo: "padrão" }
          : { acao: "adiar" as const, tema: t.id, texto: `adia ${t.id}`, quando: "depois" },
    );
  const r = aplicarTemas(e, itens, AGORA);
  assert.ok(r.ok);
  return r.ok ? r.estado : e;
}
const sint = (...s: number[]) => s.map((secao) => ({ secao, texto: `síntese ${secao}` }));

test("podeGerarDocumento: falso com tema aberto, listando quais", () => {
  const e = criarEstado({ pedido: "p", idioma: "pt", agora: AGORA, anterior: { ferramentas: [] } });
  const r = podeGerarDocumento(e);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.abertos.length, 10);
  assert.deepEqual(podeGerarDocumento(fechado()), { ok: true });
});

test("validarSinteses: secao 1..8, sem duplicada, obrigatória em seção com tema decidido", () => {
  const e = fechado();
  const decididas = [
    ...new Set(e.temas.filter((t) => t.status === "decidido").map((t) => t.secao)),
  ];
  assert.equal(validarSinteses(e, sint(...decididas)).ok, true);
  const faltando = validarSinteses(e, []);
  assert.equal(faltando.ok, false);
  const dup = validarSinteses(e, [...sint(...decididas), ...sint(decididas[0])]);
  assert.match(dup.ok ? "" : dup.erro, /duplicada/);
  const fora = validarSinteses(e, sint(...decididas, 9));
  assert.match(fora.ok ? "" : fora.erro, /1 a 8/);
});

test("renderizar: 11 seções na ordem, cada tema uma vez, perguntas no registro", () => {
  const e = fechado();
  const { html } = renderizar(e, "Visão", sint(1, 2, 3, 4, 5, 6, 7, 8));
  const ids = [...html.matchAll(/<section id="s(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const t of e.temas) {
    const n = html.split(`data-tema="${t.id}"`).length - 1;
    assert.equal(n, 1, t.id);
  }
  for (const p of e.perguntas) assert.ok(html.includes(`data-pergunta="${p.id}"`));
  assert.match(html, /Integrações externas/);
  const s6 = html.slice(html.indexOf('id="s6"'), html.indexOf('id="s7"'));
  assert.ok(s6.includes('data-tema="integracoes"') || html.includes('data-tema="integracoes"'));
});

test("renderizar: escapa HTML, sem http externo, rótulos en", () => {
  const e = fechado();
  const { html } = renderizar(e, "<script>alert(1)</script>", [
    { secao: 2, texto: "<script>x</script>" },
  ]);
  assert.ok(!html.includes("<script>"));
  assert.ok(!/(src|href)="https?:/.test(html));
  assert.ok(!html.includes("http"));
  e.idioma = "en";
  const en = renderizar(e, "T", []).html;
  assert.match(en, /Hard constraints/);
});

test("renderizar: aviso acima do limite", () => {
  const e = fechado();
  assert.equal(renderizar(e, "T", []).aviso, undefined);
  const longo = renderizar(e, "T", [{ secao: 1, texto: "x".repeat(LIMITE_AVISO + 1) }]);
  assert.ok(longo.aviso);
});

test("comandoAbrir por plataforma", () => {
  assert.deepEqual(comandoAbrir("win32", "C:\\a\\v.html"), {
    comando: "cmd",
    args: ["/c", "start", "", "C:\\a\\v.html"],
  });
  assert.deepEqual(comandoAbrir("darwin", "/a/v.html"), { comando: "open", args: ["/a/v.html"] });
  assert.deepEqual(comandoAbrir("linux", "/a/v.html"), {
    comando: "xdg-open",
    args: ["/a/v.html"],
  });
});
