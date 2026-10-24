import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { criarEstado, type Estado, etapaAtiva, type ModeloRef } from "../core/estado.ts";
import { conjuntoDaEtapa } from "../core/ferramentasAtivas.ts";
import { escolherOpus, rotuloModelo } from "../core/modelo.ts";
import { textoReabertos } from "../core/reabertura.ts";
import { textoStatus } from "../core/status.ts";
import { dialogoAprovacao, lacoCorrecao, reabrirEGravar } from "./aprovacao.ts";
import { arquivarAprovada, lerEstado, salvarEstado } from "./persistencia.ts";

/** Define o modelo da etapa: Opus se houver; devolve undefined se o usuário desistir. */
async function escolherModeloEtapa(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<{ ok: boolean; modelo?: ModeloRef }> {
  const disponiveis = ctx.modelRegistry.getAvailable();
  const escolha = escolherOpus(disponiveis.map((m) => ({ provider: m.provider, id: m.id })));
  let alvo: ModeloRef | undefined;
  if (escolha.tipo === "nenhum") {
    const seguir = await ctx.ui.confirm(
      "Nenhum modelo Opus disponível",
      "Seguir a Discussão Global no modelo atual?",
    );
    return { ok: seguir };
  }
  if (escolha.tipo === "um") {
    alvo = escolha.modelo;
  } else {
    const rotulos = escolha.modelos.map(rotuloModelo);
    const sel = await ctx.ui.select("Qual Opus usar na Discussão Global?", rotulos);
    if (sel === undefined) return { ok: false };
    alvo = escolha.modelos[rotulos.indexOf(sel)];
  }
  const modelo = disponiveis.find((m) => m.provider === alvo?.provider && m.id === alvo?.id);
  if (!modelo || !(await pi.setModel(modelo))) {
    const seguir = await ctx.ui.confirm(
      "Não consegui trocar para o Opus",
      "Seguir a Discussão Global no modelo atual?",
    );
    return { ok: seguir };
  }
  ctx.ui.notify(`Discussão Global no modelo ${rotuloModelo(alvo)}.`, "info");
  return { ok: true, modelo: alvo };
}

export function registrarComando(pi: ExtensionAPI): void {
  pi.registerCommand("ryker", {
    description: "Discussão Global do Ryker: /ryker <pedido> | /ryker reabrir | /ryker (status)",
    async handler(args, ctx) {
      const pedido = args.trim();
      const leitura = lerEstado(ctx.cwd);
      if (leitura.tipo === "corrompido") {
        ctx.ui.notify(
          `.ryker/discussao.json ilegível (${leitura.erro}). Não vou sobrescrever; corrija ou apague o arquivo.`,
          "error",
        );
        return;
      }
      const existente = leitura.tipo === "ok" ? leitura.estado : undefined;

      if (pedido === "reabrir") {
        if (!etapaAtiva(existente)) {
          ctx.ui.notify("Não há Discussão Global ativa para reabrir.", "warning");
          return;
        }
        if (!ctx.hasUI) return;
        const itens = await lacoCorrecao(ctx, existente);
        if (!itens) {
          ctx.ui.notify("Nenhum tema reaberto.", "info");
          return;
        }
        if (reabrirEGravar(pi, ctx, existente, itens)) {
          pi.setActiveTools(conjuntoDaEtapa());
          pi.sendUserMessage(textoReabertos(itens));
        }
        return;
      }

      if (etapaAtiva(existente)) {
        if (pedido) {
          ctx.ui.notify(
            `Já existe uma Discussão Global ativa (${textoStatus(existente)}). Termine-a antes de iniciar outra.`,
            "info",
          );
          return;
        }
        ctx.ui.notify(textoStatus(existente), "info");
        if (existente.fase === "aprovacao" && ctx.hasUI) {
          const r = await dialogoAprovacao(pi, ctx, existente);
          if (r.resultado === "reaberta") {
            pi.setActiveTools(conjuntoDaEtapa());
            pi.sendUserMessage(textoReabertos(r.itens));
          }
        }
        return;
      }
      if (existente) {
        if (!pedido) {
          ctx.ui.notify("Discussão aprovada. /ryker <pedido> inicia outra.", "info");
          return;
        }
        if (!ctx.hasUI) return;
        const arquivar = await ctx.ui.confirm(
          "Arquivar a discussão aprovada?",
          "Ela será movida para .ryker/arquivo/ e passa a contar como decisão existente.",
        );
        if (!arquivar) {
          ctx.ui.notify("Discussão Global cancelada.", "info");
          return;
        }
        const pasta = arquivarAprovada(ctx.cwd, existente);
        ctx.ui.notify(`Discussão arquivada em ${pasta}.`, "info");
      }
      if (!pedido) {
        ctx.ui.notify("Uso: /ryker <pedido>", "warning");
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("A Discussão Global precisa de interface interativa.", "error");
        return;
      }

      const anterior = {
        ferramentas: pi.getActiveTools(),
        ...(ctx.model ? { modelo: { provider: ctx.model.provider, id: ctx.model.id } } : {}),
      };
      const m = await escolherModeloEtapa(pi, ctx);
      if (!m.ok) {
        ctx.ui.notify("Discussão Global cancelada.", "info");
        return;
      }
      const estado: Estado = criarEstado({
        pedido,
        idioma: "pt",
        agora: new Date().toISOString(),
        anterior,
        ...(m.modelo ? { modeloEtapa: m.modelo } : {}),
      });
      pi.setActiveTools(conjuntoDaEtapa());
      salvarEstado(pi, ctx.cwd, estado);
      ctx.ui.setStatus("ryker", textoStatus(estado));
      pi.sendUserMessage(pedido);
    },
  });
}
