import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Estado } from "../core/estado.ts";
import {
  conjuntoDaEtapa,
  FERRAMENTA_BLOQUEADA,
  semPerguntaNativa,
} from "../core/ferramentasAtivas.ts";
import { CONTADORES_ZERO, decidirContinuacao, TIPO_CORRECAO } from "../core/guarda.ts";
import { secaoPrompt } from "../core/prompt.ts";
import { decidirRestauracao } from "../core/restauracao.ts";
import { textoStatus } from "../core/status.ts";
import {
  estadoAtivo,
  gravarEstado,
  lerEstado,
  salvarEstado,
  TIPO_ENTRADA,
} from "./persistencia.ts";

export const SECAO_PROMPT = "ryker_discussao";

function textoDe(msg: unknown): string {
  const c = (msg as { content?: unknown } | undefined)?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .filter((b): b is { type: "text"; text: string } => b?.type === "text")
    .map((b) => b.text)
    .join("");
}

function chamouPerguntar(msg: unknown): boolean {
  const c = (msg as { content?: unknown } | undefined)?.content;
  return Array.isArray(c) && c.some((b) => b?.type === "toolCall" && b.name === "ryker_perguntar");
}

export function registrarEventos(pi: ExtensionAPI): void {
  // Estado por execução do agente; zera em agent_start.
  let contadores = CONTADORES_ZERO;

  pi.on("agent_start", async () => {
    contadores = CONTADORES_ZERO;
  });

  pi.on("agent_before_settle", async (event, ctx) => {
    const ultima = [...event.context.contextMessages].reverse().find((m) => m.role === "assistant");
    const decisao = decidirContinuacao({
      estado: estadoAtivo(ctx.cwd),
      texto: textoDe(ultima),
      perguntouNaUltima: chamouPerguntar(ultima),
      outcome: event.outcome,
      contadores,
    });
    contadores = decisao.contadores;
    if (!decisao.correcao) return;
    return {
      continue: true,
      entries: [
        {
          type: "custom_message",
          customType: TIPO_CORRECAO,
          content: decisao.correcao.texto,
          display: true,
        },
      ],
    };
  });

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
    const entradas: Estado[] = [];
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "custom" && e.customType === TIPO_ENTRADA && e.data) {
        entradas.push(e.data as Estado);
      }
    }
    const decisao = decidirRestauracao(lerEstado(ctx.cwd), entradas);
    switch (decisao.acao) {
      case "corrompido":
        ctx.ui.notify(`.ryker/discussao.json ilegível: ${decisao.erro}`, "warning");
        return;
      case "recriar":
        gravarEstado(ctx.cwd, decisao.estado);
        ctx.ui.notify("Recriei .ryker/discussao.json pelo último snapshot da sessão.", "info");
        return;
      case "avisar":
        ctx.ui.notify(
          `Discussão Global ativa (${textoStatus(decisao.estado)}). /ryker para retomar.`,
          "info",
        );
        return;
      case "reaplicar": {
        // Sessão que já tem entradas Ryker: reaplica ferramentas, modelo e status.
        pi.setActiveTools(conjuntoDaEtapa());
        const ref = decisao.estado.modeloEtapa;
        if (ref && !(ctx.model?.provider === ref.provider && ctx.model?.id === ref.id)) {
          const m = ctx.modelRegistry.find(ref.provider, ref.id);
          if (m) await pi.setModel(m);
        }
        ctx.ui.setStatus("ryker", textoStatus(decisao.estado));
        return;
      }
      default:
        return;
    }
  });
}
