import { labels } from "./i18n.ts";
import type { DiscussionState, TopicsResult } from "./state.ts";
import type { Closure, Topic } from "./topics.ts";

export interface ReopenItem {
  tema: string;
  nota: string;
}

export function reopenTopics(
  state: DiscussionState,
  items: readonly ReopenItem[],
  now: string,
): TopicsResult {
  if (state.fase === "aprovada") {
    return { ok: false, error: "A discussão já foi aprovada; não há o que reabrir." };
  }
  if (items.length === 0) return { ok: false, error: "Nenhum tema para reabrir." };
  const ids = new Set<string>();
  for (const it of items) {
    const t = state.temas.find((x) => x.id === it.tema);
    if (!t) return { ok: false, error: `O tema "${it.tema}" não existe.` };
    if (t.status === "aberto") return { ok: false, error: `O tema ${t.id} já está aberto.` };
    ids.add(t.id);
  }
  const topics = state.temas.map((t): Topic => {
    if (!ids.has(t.id)) return t;
    const previous: Closure = {
      status: t.status,
      ...(t.texto !== undefined ? { texto: t.texto } : {}),
      ...(t.motivo !== undefined ? { motivo: t.motivo } : {}),
      ...(t.quando !== undefined ? { quando: t.quando } : {}),
      ...(t.origem ? { origem: t.origem } : {}),
    };
    const { texto: _t, motivo: _m, quando: _q, origem: _o, ...rest } = t;
    const note = items.find((i) => i.tema === t.id)?.nota.trim() ?? "";
    return {
      ...rest,
      status: "aberto",
      historico: [...t.historico, previous],
      reabertura: { nota: note, em: now },
    };
  });
  const { documento: _d, ...withoutDocument } = state;
  return {
    ok: true,
    state: { ...withoutDocument, temas: topics, fase: "descoberta", pausado: false },
  };
}

const topicLabel = (t: Topic, checked: boolean): string =>
  `${checked ? "✓ " : ""}${t.id} — ${t.titulo}`;

export function selectionOptions(state: DiscussionState, selectedIds: readonly string[]): string[] {
  const closedTopics = state.temas.filter((t) => t.status !== "aberto");
  return [
    ...closedTopics.map((t) => topicLabel(t, selectedIds.includes(t.id))),
    labels(state.idioma).done,
  ];
}

export type SelectionStep =
  | { kind: "selection"; selectedIds: string[] }
  | { kind: "done"; selectedIds: string[] }
  | { kind: "back" };

export function interpretSelection(
  state: DiscussionState,
  selectedIds: readonly string[],
  choice: string | undefined,
): SelectionStep {
  if (choice === undefined) return { kind: "back" };
  if (choice === labels(state.idioma).done) {
    return selectedIds.length ? { kind: "done", selectedIds: [...selectedIds] } : { kind: "back" };
  }
  const closedTopics = state.temas.filter((t) => t.status !== "aberto");
  const target = closedTopics.find((t) => topicLabel(t, selectedIds.includes(t.id)) === choice);
  if (!target) return { kind: "back" };
  const newSelection = selectedIds.includes(target.id)
    ? selectedIds.filter((id) => id !== target.id)
    : [...selectedIds, target.id];
  return { kind: "selection", selectedIds: newSelection };
}

export function reopenedMessage(items: readonly ReopenItem[]): string {
  const lines = items.map(
    (i) => `- ${i.tema}${i.nota.trim() ? `: ${i.nota.trim()}` : " (sem nota)"}`,
  );
  return `O usuário reabriu estes temas na revisão do documento:\n${lines.join("\n")}\n\nPergunte só sobre eles, com ryker_perguntar (só o usuário os fecha; fonte, supor e adiar são recusados). Quando todos estiverem fechados, chame ryker_documento de novo com as sínteses atualizadas; não haverá nova revisão.`;
}
