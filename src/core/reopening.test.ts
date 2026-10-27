import assert from "node:assert/strict";
import { test } from "node:test";
import { recordAnswer } from "./questions.ts";
import {
  interpretSelection,
  reopenedMessage,
  reopenTopics,
  selectionOptions,
} from "./reopening.ts";
import { applyTopics, createState, type DiscussionState } from "./state.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const T1 = "2026-10-23T11:00:00.000Z";

function approval(): DiscussionState {
  let e = createState({ request: "p", language: "pt", now: T0, previous: { ferramentas: [] } });
  e = recordAnswer(
    e,
    { tema: "resultado", pergunta: "Qual resultado?", opcoes: ["a", "b"], recomendada: 0 },
    "CLI pronta",
    false,
    T0,
  );
  const r = applyTopics(
    e,
    [{ acao: "supor", tema: "apetite", texto: "2 semanas", motivo: "padrão" }],
    T0,
  );
  assert.ok(r.ok);
  const state = r.ok ? r.state : e;
  return {
    ...state,
    fase: "aprovacao",
    documento: { caminho: ".ryker/visao.html", geradoEm: T0 },
    revisao: { em: T0, achados: [] },
  };
}
const topic = (e: DiscussionState, id: string) => e.temas.find((t) => t.id === id);

test("reopenTopics: reopens closed, keeps history and note, returns to discovery", () => {
  const r = reopenTopics(approval(), [{ tema: "resultado", nota: "mudou o foco" }], T1);
  assert.ok(r.ok);
  if (!r.ok) return;
  const t = topic(r.state, "resultado");
  assert.equal(t?.status, "aberto");
  assert.deepEqual(t?.reabertura, { nota: "mudou o foco", em: T1 });
  assert.equal(t?.historico.length, 1);
  assert.equal(t?.historico[0].status, "decidido");
  assert.match(t?.historico[0].texto ?? "", /CLI pronta/);
  assert.equal(t?.texto, undefined);
  assert.equal(r.state.fase, "descoberta");
  assert.equal(r.state.pausado, false);
});

test("reopenTopics: invalidates the document but not the review (1 round)", () => {
  const r = reopenTopics(approval(), [{ tema: "apetite", nota: "" }], T1);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.documento, undefined);
  assert.ok(r.state.revisao);
});

test("reopenTopics: only closed, existing topics and active phase; does not mutate", () => {
  const e = approval();
  const aberto = reopenTopics(e, [{ tema: "riscos", nota: "" }], T1);
  assert.match(aberto.ok ? "" : aberto.error, /aberto/);
  const unchanged = reopenTopics(e, [{ tema: "xx", nota: "" }], T1);
  assert.match(unchanged.ok ? "" : unchanged.error, /xx/);
  const empty = reopenTopics(e, [], T1);
  assert.equal(empty.ok, false);
  const approvedState = reopenTopics(
    { ...e, fase: "aprovada" },
    [{ tema: "resultado", nota: "" }],
    T1,
  );
  assert.equal(approvedState.ok, false);
  assert.equal(topic(e, "resultado")?.status, "decidido");
});

test("reopenTopics: reopened topic refuses source, assume and defer and only closes through a question", () => {
  const r = reopenTopics(approval(), [{ tema: "resultado", nota: "" }], T1);
  assert.ok(r.ok);
  if (!r.ok) return;
  for (const buildItem of [
    { acao: "fonte" as const, tema: "resultado", texto: "x", origem: "README.md" },
    { acao: "supor" as const, tema: "resultado", texto: "x", motivo: "y" },
    { acao: "adiar" as const, tema: "resultado", texto: "x", quando: "z" },
  ]) {
    const a = applyTopics(r.state, [buildItem], T1);
    assert.match(a.ok ? "" : a.error, /reaberto/);
  }
  const answer = recordAnswer(
    r.state,
    { tema: "resultado", pergunta: "Qual?", opcoes: ["a", "b"], recomendada: 0 },
    "nova",
    false,
    T1,
  );
  assert.equal(topic(answer, "resultado")?.status, "decidido");
  assert.equal(topic(answer, "resultado")?.reabertura, undefined);
  assert.equal(topic(answer, "resultado")?.historico.length, 1);
});

test("selection loop: lists only closed, toggles, finishes; empty returns to approval", () => {
  const e = approval();
  const o0 = selectionOptions(e, []);
  assert.equal(o0.length, 3);
  assert.ok(o0[0].includes("resultado"));
  assert.equal(o0[o0.length - 1], "Concluir");
  const s1 = interpretSelection(e, [], o0[0]);
  assert.deepEqual(s1, { kind: "selection", selectedIds: ["resultado"] });
  const o1 = selectionOptions(e, ["resultado"]);
  assert.ok(o1[0].startsWith("✓"));
  assert.deepEqual(interpretSelection(e, ["resultado"], o1[0]), {
    kind: "selection",
    selectedIds: [],
  });
  assert.deepEqual(interpretSelection(e, ["resultado"], "Concluir"), {
    kind: "done",
    selectedIds: ["resultado"],
  });
  assert.deepEqual(interpretSelection(e, [], "Concluir"), { kind: "back" });
  assert.deepEqual(interpretSelection(e, [], undefined), { kind: "back" });
  assert.deepEqual(interpretSelection(e, [], "desconhecido"), { kind: "back" });
});

test("reopenedMessage lists topics and notes for the model", () => {
  const t = reopenedMessage([
    { tema: "resultado", nota: "mudou o foco" },
    { tema: "apetite", nota: "" },
  ]);
  assert.match(t, /resultado.*mudou o foco/);
  assert.match(t, /apetite/);
  assert.match(t, /ryker_perguntar/);
});
