import type { CycleRecord } from "./cycleRecord.ts";
import { formatTokens } from "./cycleStatus.ts";
import { isPortuguese } from "./i18n.ts";
import { grandTotal } from "./tokens.ts";

const STOP_REASONS = {
  roundsExhausted: { pt: "as 2 rodadas foram usadas", en: "both rounds were used" },
  blocked: { pt: "o agente reportou BLOCKED", en: "the agent reported BLOCKED" },
} as const;

export function stageSummary(record: CycleRecord): string {
  const pt = isPortuguese(record.language);
  const tokens = formatTokens(grandTotal(record.tokens), record.language);
  const stage = pt ? "Planejamento" : "Planning";
  const round = record.cycle.round;
  if (record.cycle.phase === "approved") {
    return pt
      ? `Ryker: etapa 2 (${stage}) aprovada na rodada ${round}, ${tokens} tokens. A etapa 3 ainda não foi construída: o ciclo foi arquivado e a trava liberada.`
      : `Ryker: stage 2 (${stage}) approved in round ${round}, ${tokens} tokens. Stage 3 is not built yet: the cycle was archived and the lock released.`;
  }
  if (record.cycle.phase === "backToDiscussion") {
    return pt
      ? `Ryker: etapa 2 (${stage}) voltou para a Discussão na rodada ${round}, ${tokens} tokens.`
      : `Ryker: stage 2 (${stage}) went back to the Discussion in round ${round}, ${tokens} tokens.`;
  }
  const reason = record.cycle.stop ? STOP_REASONS[record.cycle.stop][pt ? "pt" : "en"] : "";
  return pt
    ? `Ryker: etapa 2 (${stage}) parou: ${reason}. ${tokens} tokens. /ryker retomar não se aplica; o ciclo espera a decisão do usuário.`
    : `Ryker: stage 2 (${stage}) stopped: ${reason}. ${tokens} tokens. /ryker retomar does not apply; the cycle waits for the user.`;
}

export function outsideChangeNote(paths: readonly string[], language?: string): string {
  return isPortuguese(language)
    ? `Arquivos de controle mudaram fora de uma execução de agente: ${paths.join(", ")}. O ciclo foi pausado.`
    : `Control files changed outside an agent execution: ${paths.join(", ")}. The cycle was paused.`;
}

export function agentChangeNote(paths: readonly string[], language?: string): string {
  return isPortuguese(language)
    ? `O agente alterou arquivos de controle (${paths.join(", ")}): restaurados, rodada reprovada.`
    : `The agent changed control files (${paths.join(", ")}): restored, round failed.`;
}

export function leftoverProcessesNote(count: number, language?: string): string {
  return isPortuguese(language)
    ? `${count} comando(s) do agente ainda rodavam ao fim da execução: encerrados, rodada reprovada.`
    : `${count} agent command(s) were still running at the end of the execution: ended, round failed.`;
}

export function leaseLostNote(language?: string): string {
  return isPortuguese(language)
    ? "Outra sessão assumiu este ciclo; este driver parou sem gravar mais nada."
    : "Another session took over this cycle; this driver stopped without writing anything else.";
}

export type CommandReply = "stopping" | "pauseDeferred" | "resumed" | "noCycle" | "readerOnly";

const COMMAND_REPLIES: Record<CommandReply, { pt: string; en: string }> = {
  stopping: {
    pt: "Cancelando a execução em curso; o ciclo ficará pausado. /ryker retomar continua.",
    en: "Cancelling the running execution; the cycle will be paused. /ryker retomar continues.",
  },
  pauseDeferred: {
    pt: "Pausa pedida: o ciclo pausa quando a execução em curso terminar, sem descartar nada.",
    en: "Pause requested: the cycle pauses when the running execution ends, discarding nothing.",
  },
  resumed: {
    pt: "Ciclo retomado: a rodada interrompida recomeça do primeiro produtor.",
    en: "Cycle resumed: the interrupted round restarts from its first producer.",
  },
  noCycle: {
    pt: "Não há ciclo do Ryker aberto neste projeto.",
    en: "There is no open Ryker cycle in this project.",
  },
  readerOnly: {
    pt: "Este ciclo pertence a outra sessão; aqui só é possível ver o status.",
    en: "This cycle belongs to another session; here you can only see its status.",
  },
};

export const commandReply = (kind: CommandReply, language?: string): string =>
  COMMAND_REPLIES[kind][isPortuguese(language) ? "pt" : "en"];
