import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isPortuguese } from "../core/i18n.ts";
import {
  interpretSelection,
  type ReopenItem,
  reopenTopics,
  selectionOptions,
} from "../core/reopening.ts";
import { approve, type DiscussionState } from "../core/state.ts";
import { statusText } from "../core/status.ts";
import { saveState } from "./persistence.ts";

const now = (): string => new Date().toISOString();

export type ApprovalResult =
  | { result: "approved"; state: DiscussionState }
  | { result: "reopened"; state: DiscussionState; items: ReopenItem[] }
  | { result: "pending"; state: DiscussionState };

export async function correctionLoop(
  ctx: ExtensionContext,
  state: DiscussionState,
): Promise<ReopenItem[] | undefined> {
  const en = !isPortuguese(state.idioma);
  let selectedIds: string[] = [];
  for (;;) {
    const choice = await ctx.ui.select(
      en ? "Which points to fix? (pick one at a time)" : "Quais pontos corrigir? (um por vez)",
      selectionOptions(state, selectedIds),
    );
    const step = interpretSelection(state, selectedIds, choice);
    if (step.kind === "back") return undefined;
    selectedIds = step.selectedIds;
    if (step.kind === "done") break;
  }
  const items: ReopenItem[] = [];
  for (const topic of selectedIds) {
    const note = await ctx.ui.input(
      en ? `Note on ${topic} (optional)` : `Nota sobre ${topic} (opcional)`,
      en ? "what should change?" : "o que deve mudar?",
    );
    items.push({ tema: topic, nota: note ?? "" });
  }
  return items;
}

export function reopenAndWrite(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: DiscussionState,
  items: ReopenItem[],
): DiscussionState | undefined {
  const r = reopenTopics(state, items, now());
  if (!r.ok) {
    ctx.ui.notify(r.error, "error");
    return undefined;
  }
  saveState(pi, ctx.cwd, r.state);
  ctx.ui.setStatus("ryker", statusText(r.state));
  return r.state;
}

export async function approveStage(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: DiscussionState,
): Promise<DiscussionState> {
  const approved = approve(state, now());
  saveState(pi, ctx.cwd, approved.state);
  pi.setActiveTools(approved.tools);
  if (approved.model) {
    const m = ctx.modelRegistry
      .getAvailable()
      .find((x) => x.provider === approved.model?.provider && x.id === approved.model?.id);
    if (m) await pi.setModel(m);
  }
  ctx.ui.setStatus("ryker", undefined);
  ctx.ui.notify(
    !isPortuguese(state.idioma)
      ? "Vision approved. Model and tools restored; the agent proceeds to planning."
      : "Visão aprovada. Modelo e ferramentas restaurados; o agente segue para o planejamento.",
    "info",
  );
  return approved.state;
}

export async function approvalDialog(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: DiscussionState,
): Promise<ApprovalResult> {
  const en = !isPortuguese(state.idioma);
  const APPROVE = en ? "Approve" : "Aprovar";
  const FIX = en ? "Fix points" : "Corrigir pontos";
  for (;;) {
    const choice = await ctx.ui.select(
      en ? "Vision document ready. Approve?" : "Documento de visão pronto. Aprovar?",
      [APPROVE, FIX],
    );
    if (choice === APPROVE) {
      return { result: "approved", state: await approveStage(pi, ctx, state) };
    }
    if (choice !== FIX) return { result: "pending", state };
    const items = await correctionLoop(ctx, state);
    if (!items) continue;
    const added = reopenAndWrite(pi, ctx, state, items);
    if (added) return { result: "reopened", state: added, items };
  }
}
