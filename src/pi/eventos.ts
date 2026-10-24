import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FERRAMENTA_BLOQUEADA, semPerguntaNativa } from "../core/ferramentasAtivas.ts";
import { secaoPrompt } from "../core/prompt.ts";
import { textoStatus } from "../core/status.ts";
import { estadoAtivo, lerEstado, salvarEstado } from "./persistencia.ts";

export const SECAO_PROMPT = "ryker_discussao";

export function registrarEventos(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event, ctx) => {
    let estado = estadoAtivo(ctx.cwd);
    if (!estado) return;
    // Um novo turno do usuário retoma uma discussão pausada.
    if (event.messageType === "user" && estado.pausado) {
      estado = { ...estado, pausado: false };
      salvarEstado(pi, ctx.cwd, estado);
      ctx.ui.setStatus("ryker", textoStatus(estado));
    }
    event.systemPromptOptions.sections[SECAO_PROMPT] = secaoPrompt(estado);
    // Melhor esforço: o rpiv readiciona ask_user_question a cada turno; o bloqueio em tool_call é a garantia.
    const ativas = pi.getActiveTools();
    const limpas = semPerguntaNativa(ativas);
    if (limpas.length !== ativas.length) pi.setActiveTools(limpas);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== FERRAMENTA_BLOQUEADA) return;
    if (!estadoAtivo(ctx.cwd)) return;
    return { block: true, reason: "Durante a Discussão Global use ryker_perguntar." };
  });

  pi.on("session_start", async (_event, ctx) => {
    const leitura = lerEstado(ctx.cwd);
    if (leitura.tipo === "corrompido") {
      ctx.ui.notify(`.ryker/discussao.json ilegível: ${leitura.erro}`, "warning");
      return;
    }
    if (leitura.tipo === "ok" && leitura.estado.fase !== "aprovada") {
      ctx.ui.notify(
        `Discussão Global ativa (${textoStatus(leitura.estado)}). /ryker para ver o status.`,
        "info",
      );
    }
  });
}
