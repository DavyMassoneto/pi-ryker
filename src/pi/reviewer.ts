import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildReviewerRequest,
  type Finding,
  JSON_ONLY_REQUEST,
  parseFindings,
  REVIEWER_SYSTEM_PROMPT,
} from "../core/review.ts";
import type { DiscussionState } from "../core/state.ts";

function textOf(answer: { content: { type: string; text?: string }[] }): string {
  return answer.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

export async function runReviewer(
  ctx: ExtensionContext,
  state: DiscussionState,
  documentText: string,
  signal?: AbortSignal,
): Promise<Finding[]> {
  const ref = state.modeloEtapa;
  const model = (ref ? ctx.modelRegistry.find(ref.provider, ref.id) : undefined) ?? ctx.model;
  if (!model) throw new Error("Revisor: nenhum modelo disponível.");
  if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
    throw new Error(`Revisor: sem autenticação para ${model.provider}/${model.id}.`);
  }
  const base = buildReviewerRequest(state, documentText);
  let lastError = "";
  for (const suffix of ["", JSON_ONLY_REQUEST]) {
    const answer = await ctx.modelRegistry.complete(
      model,
      {
        systemPrompt: REVIEWER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: base + suffix }],
            timestamp: Date.now(),
          },
        ],
      },
      { signal },
    );
    const failure = (answer as { errorMessage?: string }).errorMessage;
    if (answer.stopReason === "error" || answer.stopReason === "aborted") {
      throw new Error(`Revisor falhou: ${failure ?? answer.stopReason}`);
    }
    try {
      return parseFindings(textOf(answer));
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(
    `Revisor: resposta ilegível após 2 tentativas (${lastError}). A rodada não foi gasta; chame ryker_documento de novo.`,
  );
}
