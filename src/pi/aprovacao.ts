import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { aprovar, type Estado } from "../core/estado.ts";
import {
  type ItemReabertura,
  interpretarSelecao,
  opcoesSelecao,
  reabrirTemas,
} from "../core/reabertura.ts";
import { textoStatus } from "../core/status.ts";
import { salvarEstado } from "./persistencia.ts";

const agora = (): string => new Date().toISOString();

export type ResultadoAprovacao =
  | { resultado: "aprovada"; estado: Estado }
  | { resultado: "reaberta"; estado: Estado; itens: ItemReabertura[] }
  | { resultado: "pendente"; estado: Estado };

/**
 * Laço "Corrigir pontos": ui.select repetido com os temas fechados + Concluir (a API não tem
 * multiseleção). Cada tema escolhido pede uma nota opcional. Devolve undefined se nada foi
 * escolhido (o chamador volta à aprovação).
 */
export async function lacoCorrecao(
  ctx: ExtensionContext,
  estado: Estado,
): Promise<ItemReabertura[] | undefined> {
  const en = estado.idioma === "en";
  let selecionados: string[] = [];
  for (;;) {
    const escolha = await ctx.ui.select(
      en ? "Which points to fix? (pick one at a time)" : "Quais pontos corrigir? (um por vez)",
      opcoesSelecao(estado, selecionados),
    );
    const passo = interpretarSelecao(estado, selecionados, escolha);
    if (passo.tipo === "voltar") return undefined;
    selecionados = passo.selecionados;
    if (passo.tipo === "concluir") break;
  }
  const itens: ItemReabertura[] = [];
  for (const tema of selecionados) {
    const nota = await ctx.ui.input(
      en ? `Note on ${tema} (optional)` : `Nota sobre ${tema} (opcional)`,
      en ? "what should change?" : "o que deve mudar?",
    );
    itens.push({ tema, nota: nota ?? "" });
  }
  return itens;
}

/** Reabre os temas escolhidos, grava e atualiza o status. */
export function reabrirEGravar(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  estado: Estado,
  itens: ItemReabertura[],
): Estado | undefined {
  const r = reabrirTemas(estado, itens, agora());
  if (!r.ok) {
    ctx.ui.notify(r.erro, "error");
    return undefined;
  }
  salvarEstado(pi, ctx.cwd, r.estado);
  ctx.ui.setStatus("ryker", textoStatus(r.estado));
  return r.estado;
}

/** Fecha a etapa: grava a aprovação e devolve ferramentas e modelo de antes. */
export async function aprovarEtapa(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  estado: Estado,
): Promise<Estado> {
  const ap = aprovar(estado, agora());
  salvarEstado(pi, ctx.cwd, ap.estado);
  // Restauração direta. Plano B, se o setModel dentro do execute der problema:
  // guardar a intenção e restaurar o modelo em um handler de "agent_settled".
  pi.setActiveTools(ap.ferramentas);
  if (ap.modelo) {
    const m = ctx.modelRegistry
      .getAvailable()
      .find((x) => x.provider === ap.modelo?.provider && x.id === ap.modelo?.id);
    if (m) await pi.setModel(m);
  }
  ctx.ui.setStatus("ryker", undefined);
  ctx.ui.notify(
    estado.idioma === "en"
      ? "Vision approved. Model and tools restored."
      : "Visão aprovada. Modelo e ferramentas restaurados.",
    "info",
  );
  return ap.estado;
}

/** Diálogo Aprovar / Corrigir pontos. Corrigir sem seleção volta ao diálogo. */
export async function dialogoAprovacao(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  estado: Estado,
): Promise<ResultadoAprovacao> {
  const en = estado.idioma === "en";
  const APROVAR = en ? "Approve" : "Aprovar";
  const CORRIGIR = en ? "Fix points" : "Corrigir pontos";
  for (;;) {
    const escolha = await ctx.ui.select(
      en ? "Vision document ready. Approve?" : "Documento de visão pronto. Aprovar?",
      [APROVAR, CORRIGIR],
    );
    if (escolha === APROVAR) {
      return { resultado: "aprovada", estado: await aprovarEtapa(pi, ctx, estado) };
    }
    if (escolha !== CORRIGIR) return { resultado: "pendente", estado };
    const itens = await lacoCorrecao(ctx, estado);
    if (!itens) continue;
    const novo = reabrirEGravar(pi, ctx, estado, itens);
    if (novo) return { resultado: "reaberta", estado: novo, itens };
  }
}
