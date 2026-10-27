import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canGenerateDocument,
  openCommand,
  render,
  validateSyntheses,
  WARNING_LIMIT,
} from "./document.ts";
import { recordAnswer } from "./questions.ts";
import { applyTopics, createState, type DiscussionState } from "./state.ts";

const NOW = "2026-10-23T10:00:00.000Z";

function closedState(): DiscussionState {
  let e = createState({ request: "p", language: "pt", now: NOW, previous: { ferramentas: [] } });
  e = recordAnswer(
    e,
    { tema: "resultado", pergunta: "Qual resultado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    NOW,
  );
  const items = e.temas
    .filter((t) => t.status === "aberto")
    .map((t, i) =>
      i % 3 === 0
        ? { acao: "fonte" as const, tema: t.id, texto: `fonte ${t.id}`, origem: "README.md" }
        : i % 3 === 1
          ? { acao: "supor" as const, tema: t.id, texto: `sup ${t.id}`, motivo: "padrão" }
          : { acao: "adiar" as const, tema: t.id, texto: `adia ${t.id}`, quando: "depois" },
    );
  const r = applyTopics(e, items, NOW);
  assert.ok(r.ok);
  return r.ok ? r.state : e;
}
const synthesis = (...s: number[]) =>
  s.map((section) => ({ secao: section, texto: `síntese ${section}` }));

test("canGenerateDocument: false with open topic, listing which", () => {
  const e = createState({ request: "p", language: "pt", now: NOW, previous: { ferramentas: [] } });
  const r = canGenerateDocument(e);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.open.length, 10);
  assert.deepEqual(canGenerateDocument(closedState()), { ok: true });
});

test("validateSyntheses: section 1..8, no duplicate, required in a section with a decided topic", () => {
  const e = closedState();
  const decided = [...new Set(e.temas.filter((t) => t.status === "decidido").map((t) => t.secao))];
  assert.equal(validateSyntheses(e, synthesis(...decided)).ok, true);
  const stillMissing = validateSyntheses(e, []);
  assert.equal(stillMissing.ok, false);
  const duplicated = validateSyntheses(e, [...synthesis(...decided), ...synthesis(decided[0])]);
  assert.match(duplicated.ok ? "" : duplicated.error, /duplicada/);
  const outOfScope = validateSyntheses(e, synthesis(...decided, 9));
  assert.match(outOfScope.ok ? "" : outOfScope.error, /1 a 8/);
});

test("render: 11 sections in order, each topic once, questions in the record", () => {
  const e = closedState();
  const { html } = render(e, "Visão", synthesis(1, 2, 3, 4, 5, 6, 7, 8));
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

test("render: escapes HTML, no external http, en labels", () => {
  const e = closedState();
  const { html } = render(e, "<script>alert(1)</script>", [
    { secao: 2, texto: "<script>x</script>" },
  ]);
  assert.ok(!html.includes("<script>"));
  assert.ok(!/(src|href)="https?:/.test(html));
  assert.ok(!html.includes("http"));
  e.idioma = "en";
  const en = render(e, "T", []).html;
  assert.match(en, /Hard constraints/);
});

test("render: warning above the limit", () => {
  const e = closedState();
  assert.equal(render(e, "T", []).warning, undefined);
  const long = render(e, "T", [{ secao: 1, texto: "x".repeat(WARNING_LIMIT + 1) }]);
  assert.ok(long.warning);
});

test("openCommand per platform", () => {
  assert.deepEqual(openCommand("win32", "C:\\a\\v.html"), {
    command: "cmd",
    args: ["/c", "start", "", "C:\\a\\v.html"],
  });
  assert.deepEqual(openCommand("darwin", "/a/v.html"), { command: "open", args: ["/a/v.html"] });
  assert.deepEqual(openCommand("linux", "/a/v.html"), {
    command: "xdg-open",
    args: ["/a/v.html"],
  });
});
