import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { stageToolSet } from "../core/activeTools.ts";
import { chooseOpus, modelLabel } from "../core/model.ts";
import { reopenedMessage } from "../core/reopening.ts";
import { createState, type DiscussionState, isStageActive, type ModelRef } from "../core/state.ts";
import { statusText } from "../core/status.ts";
import { approvalDialog, correctionLoop, reopenAndWrite } from "./approval.ts";
import { archiveApproved, readState, saveState } from "./persistence.ts";

async function chooseStageModel(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<{ ok: boolean; model?: ModelRef }> {
  const available = ctx.modelRegistry.getAvailable();
  const choice = chooseOpus(available.map((m) => ({ provider: m.provider, id: m.id })));
  let target: ModelRef | undefined;
  if (choice.kind === "none") {
    const proceed = await ctx.ui.confirm(
      "Nenhum modelo Opus disponível",
      "Seguir a Discussão Global no modelo atual?",
    );
    return { ok: proceed };
  }
  if (choice.kind === "one") {
    target = choice.model;
  } else {
    const labels = choice.models.map(modelLabel);
    const selected = await ctx.ui.select("Qual Opus usar na Discussão Global?", labels);
    if (selected === undefined) return { ok: false };
    target = choice.models[labels.indexOf(selected)];
  }
  const model = available.find((m) => m.provider === target?.provider && m.id === target?.id);
  if (!model || !(await pi.setModel(model))) {
    const proceed = await ctx.ui.confirm(
      "Não consegui trocar para o Opus",
      "Seguir a Discussão Global no modelo atual?",
    );
    return { ok: proceed };
  }
  ctx.ui.notify(`Discussão Global no modelo ${modelLabel(target)}.`, "info");
  return { ok: true, model: target };
}

export function registerCommand(pi: ExtensionAPI): void {
  pi.registerCommand("ryker", {
    description: "Discussão Global do Ryker: /ryker <pedido> | /ryker reabrir | /ryker (status)",
    async handler(args, ctx) {
      const request = args.trim();
      const stateRead = readState(ctx.cwd);
      if (stateRead.kind === "corrupted") {
        ctx.ui.notify(
          `.ryker/discussao.json ilegível (${stateRead.error}). Não vou sobrescrever; corrija ou apague o arquivo.`,
          "error",
        );
        return;
      }
      const existing = stateRead.kind === "ok" ? stateRead.state : undefined;

      if (request === "reabrir") {
        if (!isStageActive(existing)) {
          ctx.ui.notify("Não há Discussão Global ativa para reabrir.", "warning");
          return;
        }
        if (!ctx.hasUI) return;
        const items = await correctionLoop(ctx, existing);
        if (!items) {
          ctx.ui.notify("Nenhum tema reaberto.", "info");
          return;
        }
        if (reopenAndWrite(pi, ctx, existing, items)) {
          pi.setActiveTools(stageToolSet());
          pi.sendUserMessage(reopenedMessage(items));
        }
        return;
      }

      if (isStageActive(existing)) {
        if (request) {
          ctx.ui.notify(
            `Já existe uma Discussão Global ativa (${statusText(existing)}). Termine-a antes de iniciar outra.`,
            "info",
          );
          return;
        }
        ctx.ui.notify(statusText(existing), "info");
        if (existing.fase === "aprovacao" && ctx.hasUI) {
          const r = await approvalDialog(pi, ctx, existing);
          if (r.result === "reopened") {
            pi.setActiveTools(stageToolSet());
            pi.sendUserMessage(reopenedMessage(r.items));
          }
        }
        return;
      }
      if (existing) {
        if (!request) {
          ctx.ui.notify("Discussão aprovada. /ryker <pedido> inicia outra.", "info");
          return;
        }
        if (!ctx.hasUI) return;
        const archive = await ctx.ui.confirm(
          "Arquivar a discussão aprovada?",
          "Ela será movida para .ryker/arquivo/ e passa a contar como decisão existente.",
        );
        if (!archive) {
          ctx.ui.notify("Discussão Global cancelada.", "info");
          return;
        }
        const folder = archiveApproved(ctx.cwd, existing);
        ctx.ui.notify(`Discussão arquivada em ${folder}.`, "info");
      }
      if (!request) {
        ctx.ui.notify("Uso: /ryker <pedido>", "warning");
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("A Discussão Global precisa de interface interativa.", "error");
        return;
      }

      const previous = {
        ferramentas: pi.getActiveTools(),
        ...(ctx.model ? { modelo: { provider: ctx.model.provider, id: ctx.model.id } } : {}),
      };
      const m = await chooseStageModel(pi, ctx);
      if (!m.ok) {
        ctx.ui.notify("Discussão Global cancelada.", "info");
        return;
      }
      const state: DiscussionState = createState({
        request: request,
        now: new Date().toISOString(),
        previous: previous,
        ...(m.model ? { stageModel: m.model } : {}),
      });
      pi.setActiveTools(stageToolSet());
      saveState(pi, ctx.cwd, state);
      ctx.ui.setStatus("ryker", statusText(state));
      pi.sendUserMessage(request);
    },
  });
}
