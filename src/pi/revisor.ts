import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Estado } from "../core/estado.ts";
import {
  type Achado,
  montarPedidoRevisor,
  PEDIDO_SO_JSON,
  PROMPT_SISTEMA_REVISOR,
  parseAchados,
} from "../core/revisao.ts";

function textoDa(resposta: { content: { type: string; text?: string }[] }): string {
  return resposta.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

/**
 * Roda a rodada única do revisor no mesmo processo, com o modelo da etapa (Opus) e a
 * autenticação do pi. Parse falho: 1 nova tentativa pedindo só JSON; falhou de novo: lança
 * (quem chama não grava a revisão, então a rodada não é gasta).
 */
export async function executarRevisor(
  ctx: ExtensionContext,
  estado: Estado,
  documentoTexto: string,
  signal?: AbortSignal,
): Promise<Achado[]> {
  const ref = estado.modeloEtapa;
  const modelo = (ref ? ctx.modelRegistry.find(ref.provider, ref.id) : undefined) ?? ctx.model;
  if (!modelo) throw new Error("Revisor: nenhum modelo disponível.");
  if (!ctx.modelRegistry.hasConfiguredAuth(modelo)) {
    throw new Error(`Revisor: sem autenticação para ${modelo.provider}/${modelo.id}.`);
  }
  const base = montarPedidoRevisor(estado, documentoTexto);
  let ultimoErro = "";
  for (const sufixo of ["", PEDIDO_SO_JSON]) {
    const resposta = await ctx.modelRegistry.complete(
      modelo,
      {
        systemPrompt: PROMPT_SISTEMA_REVISOR,
        messages: [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: base + sufixo }],
            timestamp: Date.now(),
          },
        ],
      },
      { signal },
    );
    const falha = (resposta as { errorMessage?: string }).errorMessage;
    if (resposta.stopReason === "error" || resposta.stopReason === "aborted") {
      throw new Error(`Revisor falhou: ${falha ?? resposta.stopReason}`);
    }
    try {
      return parseAchados(textoDa(resposta));
    } catch (e) {
      ultimoErro = (e as Error).message;
    }
  }
  throw new Error(
    `Revisor: resposta ilegível após 2 tentativas (${ultimoErro}). A rodada não foi gasta; chame ryker_documento de novo.`,
  );
}
