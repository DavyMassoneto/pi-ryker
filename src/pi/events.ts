import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BLOCKED_TOOL, stageToolSet, withoutNativeQuestionTool } from "../core/activeTools.ts";
import { CORRECTION_ENTRY_TYPE, decideContinuation, ZERO_COUNTERS } from "../core/guard.ts";
import { POST_APPROVAL_RULE, postApprovalPromptSection, promptSection } from "../core/prompt.ts";
import { decideRestoration } from "../core/restoration.ts";
import type { DiscussionState } from "../core/state.ts";
import { statusText } from "../core/status.ts";
import {
  activeState,
  approvedState,
  readState,
  SNAPSHOT_ENTRY_TYPE,
  saveState,
  writeState,
} from "./persistence.ts";

export const PROMPT_SECTION = "ryker_discussao";

function textFrom(msg: unknown): string {
  const c = (msg as { content?: unknown } | undefined)?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .filter((b): b is { type: "text"; text: string } => b?.type === "text")
    .map((b) => b.text)
    .join("");
}

function calledAskQuestion(msg: unknown): boolean {
  const c = (msg as { content?: unknown } | undefined)?.content;
  return Array.isArray(c) && c.some((b) => b?.type === "toolCall" && b.name === "ryker_perguntar");
}

export function registerEvents(pi: ExtensionAPI): void {
  let counters = ZERO_COUNTERS;

  pi.on("agent_start", async () => {
    counters = ZERO_COUNTERS;
  });

  pi.on("agent_before_settle", async (event, ctx) => {
    const last = [...event.context.contextMessages].reverse().find((m) => m.role === "assistant");
    const guardDecision = decideContinuation({
      state: activeState(ctx.cwd) ?? approvedState(ctx.cwd),
      text: textFrom(last),
      askedInLastMessage: calledAskQuestion(last),
      outcome: event.outcome,
      counters: counters,
    });
    counters = guardDecision.counters;
    if (!guardDecision.correction) return;
    return {
      continue: true,
      entries: [
        {
          type: "custom_message",
          customType: CORRECTION_ENTRY_TYPE,
          content: guardDecision.correction.text,
          display: true,
        },
      ],
    };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    let state = activeState(ctx.cwd);
    if (!state) {
      if (!approvedState(ctx.cwd)) return;
      event.systemPromptOptions.sections[PROMPT_SECTION] = postApprovalPromptSection();
      const active = pi.getActiveTools();
      const cleaned = withoutNativeQuestionTool(active);
      if (cleaned.length !== active.length) pi.setActiveTools(cleaned);
      return;
    }
    if (event.messageType === "user" && state.pausado) {
      state = { ...state, pausado: false };
      saveState(pi, ctx.cwd, state);
      ctx.ui.setStatus("ryker", statusText(state));
    }
    event.systemPromptOptions.sections[PROMPT_SECTION] = promptSection(state);
    const active = pi.getActiveTools();
    const cleaned = withoutNativeQuestionTool(active);
    if (cleaned.length !== active.length) pi.setActiveTools(cleaned);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== BLOCKED_TOOL) return;
    if (activeState(ctx.cwd)) {
      return { block: true, reason: "Durante a Discussão Global use ryker_perguntar." };
    }
    if (approvedState(ctx.cwd)) return { block: true, reason: POST_APPROVAL_RULE };
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries: DiscussionState[] = [];
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "custom" && e.customType === SNAPSHOT_ENTRY_TYPE && e.data) {
        entries.push(e.data as DiscussionState);
      }
    }
    const guardDecision = decideRestoration(readState(ctx.cwd), entries);
    switch (guardDecision.action) {
      case "corrupted":
        ctx.ui.notify(`.pi/ryker/discussao.json ilegível: ${guardDecision.error}`, "warning");
        return;
      case "recreate":
        writeState(ctx.cwd, guardDecision.state);
        ctx.ui.notify("Recriei .pi/ryker/discussao.json pelo último snapshot da sessão.", "info");
        return;
      case "warn":
        ctx.ui.notify(
          `Discussão Global ativa (${statusText(guardDecision.state)}). /ryker para retomar.`,
          "info",
        );
        return;
      case "reapply": {
        pi.setActiveTools(stageToolSet());
        const ref = guardDecision.state.modeloEtapa;
        if (ref && !(ctx.model?.provider === ref.provider && ctx.model?.id === ref.id)) {
          const m = ctx.modelRegistry.find(ref.provider, ref.id);
          if (m) await pi.setModel(m);
        }
        ctx.ui.setStatus("ryker", statusText(guardDecision.state));
        return;
      }
      default:
        return;
    }
  });
}
