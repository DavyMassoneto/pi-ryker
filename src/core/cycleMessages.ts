import type { CycleRecord } from "./cycleRecord.ts";
import { formatTokens } from "./cycleStatus.ts";
import { isPortuguese } from "./i18n.ts";
import { grandTotal } from "./tokens.ts";

const STOP_REASONS = {
  roundsExhausted: { pt: "as 2 rodadas foram usadas", en: "both rounds were used" },
  blocked: { pt: "o agente reportou BLOCKED", en: "the agent reported BLOCKED" },
  error: { pt: "ocorreu um erro", en: "an error occurred" },
} as const;

export function stopHint(language?: string): string {
  return isPortuguese(language)
    ? "Para interromper uma execução use /ryker parar; o botão Stop do pi-web não pausa o ciclo."
    : "To interrupt a running execution use /ryker parar; the pi-web Stop button does not pause the cycle.";
}

export function exitsText(language?: string): string {
  return isPortuguese(language)
    ? "Continue com /ryker retomar, volte para a Discussão com /ryker voltar ou encerre com /ryker encerrar."
    : "Continue with /ryker retomar, go back to the Discussion with /ryker voltar or end with /ryker encerrar.";
}

export function exitsRequiredNote(language?: string): string {
  return isPortuguese(language)
    ? "As 2 rodadas foram usadas: escolha /ryker voltar (volta para a Discussão) ou /ryker encerrar."
    : "Both rounds were used: choose /ryker voltar (back to the Discussion) or /ryker encerrar.";
}

export function errorNote(error: string, language?: string): string {
  return isPortuguese(language)
    ? `Erro no driver do ciclo: ${error}. O ciclo parou.`
    : `Cycle driver error: ${error}. The cycle stopped.`;
}

export function pauseSummary(record: CycleRecord, note?: string): string {
  const pt = isPortuguese(record.language);
  const head = pt ? "Ryker: ciclo pausado" : "Ryker: cycle paused";
  return `${head}${note ? `: ${note}` : "."} ${exitsText(record.language)} ${stopHint(record.language)}`;
}

export function stageSummary(record: CycleRecord, planFile: string): string {
  const pt = isPortuguese(record.language);
  const tokens = formatTokens(grandTotal(record.tokens), record.language);
  const stage = pt ? "Planejamento" : "Planning";
  const round = record.cycle.round;
  if (record.cycle.phase === "approved") {
    return pt
      ? `Ryker: etapa 2 (${stage}) aprovada na rodada ${round}, ${tokens} tokens. O plano está em ${planFile}. A etapa 3 não está disponível nesta versão: o ciclo terminou aqui e a trava foi liberada.`
      : `Ryker: stage 2 (${stage}) approved in round ${round}, ${tokens} tokens. The plan is at ${planFile}. Stage 3 is not available in this version: the cycle ended here and the lock was released.`;
  }
  if (record.cycle.phase === "backToDiscussion") {
    return pt
      ? `Ryker: etapa 2 (${stage}) voltou para a Discussão na rodada ${round}, ${tokens} tokens.`
      : `Ryker: stage 2 (${stage}) went back to the Discussion in round ${round}, ${tokens} tokens.`;
  }
  if (record.closed === "ended") {
    return pt
      ? `Ryker: ciclo encerrado na etapa 2 (${stage}), ${tokens} tokens. A trava foi liberada.`
      : `Ryker: cycle ended at stage 2 (${stage}), ${tokens} tokens. The lock was released.`;
  }
  const reason = record.cycle.stop ? STOP_REASONS[record.cycle.stop][pt ? "pt" : "en"] : "";
  const detail = record.note ? ` ${record.note}` : "";
  const next =
    record.cycle.stop === "roundsExhausted"
      ? exitsRequiredNote(record.language)
      : exitsText(record.language);
  return pt
    ? `Ryker: etapa 2 (${stage}) parou: ${reason}.${detail} ${tokens} tokens. ${next} ${stopHint(record.language)}`
    : `Ryker: stage 2 (${stage}) stopped: ${reason}.${detail} ${tokens} tokens. ${next} ${stopHint(record.language)}`;
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

export function cancelledAgentChangeNote(paths: readonly string[], language?: string): string {
  return isPortuguese(language)
    ? `A execução cancelada alterou arquivos de controle (${paths.join(", ")}): restaurados.`
    : `The cancelled execution changed control files (${paths.join(", ")}): restored.`;
}

export function rejectedRuntimeNote(paths: readonly string[], language?: string): string {
  return isPortuguese(language)
    ? `Arquivos de execução numa pasta que ainda não rodou foram recusados e postos de lado: ${paths.join(", ")}.`
    : `Execution files in a folder that has not run yet were rejected and set aside: ${paths.join(", ")}.`;
}

export function workspaceChangeNote(reason: string, language?: string): string {
  return isPortuguese(language)
    ? `O agente mudou o projeto, a branch ou o HEAD (${reason}): desfeito pelo ponto de restauração, rodada reprovada.`
    : `The agent changed the project, the branch or HEAD (${reason}): undone from the restore point, round failed.`;
}

export interface CancelQuestion {
  title: string;
  stuck: string;
  other: string;
}

export function cancelQuestion(language?: string): CancelQuestion {
  return isPortuguese(language)
    ? {
        title: "A execução foi cancelada. Por quê?",
        stuck: "Travou (conta como rodada reprovada)",
        other: "Cancelei por outro motivo (não conta)",
      }
    : {
        title: "The execution was cancelled. Why?",
        stuck: "It was stuck (counts as a failed round)",
        other: "Cancelled for another reason (does not count)",
      };
}

export function takeoverQuestion(language?: string): { title: string; message: string } {
  return isPortuguese(language)
    ? {
        title: "Assumir o ciclo do Ryker?",
        message:
          "Outra sessão conduz este ciclo e está viva. Assumir cancela e descarta a execução em curso, sem contar rodada.",
      }
    : {
        title: "Take over the Ryker cycle?",
        message:
          "Another live session drives this cycle. Taking over cancels and discards the running execution without counting a round.",
      };
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

export type CommandReply =
  | "stopping"
  | "pauseDeferred"
  | "resumed"
  | "noCycle"
  | "readerOnly"
  | "tookOver"
  | "backToDiscussion"
  | "ended"
  | "notAvailable";

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
    pt: "Este ciclo pertence a outra sessão; aqui só é possível ver o status ou assumir com /ryker retomar.",
    en: "This cycle belongs to another session; here you can only see its status or take it over with /ryker retomar.",
  },
  backToDiscussion: {
    pt: "O ciclo voltou para a Discussão; a trava foi liberada.",
    en: "The cycle went back to the Discussion; the lock was released.",
  },
  ended: {
    pt: "Ciclo encerrado; a trava foi liberada.",
    en: "Cycle ended; the lock was released.",
  },
  notAvailable: {
    pt: "Este subcomando não está disponível nesta versão.",
    en: "This subcommand is not available in this version.",
  },
  tookOver: {
    pt: "Ciclo assumido por esta sessão; a execução da sessão anterior foi descartada sem contar rodada.",
    en: "This session took the cycle over; the previous session's execution was discarded without counting a round.",
  },
};

export const commandReply = (kind: CommandReply, language?: string): string =>
  COMMAND_REPLIES[kind][isPortuguese(language) ? "pt" : "en"];

export function openCycleRefusal(
  runState: string | undefined,
  role: "owner" | "reader",
  language?: string,
): string {
  const pt = isPortuguese(language);
  const head = pt
    ? "Há um ciclo do Ryker aberto neste projeto: não abro outra Discussão."
    : "A Ryker cycle is open in this project: no new Discussion is started.";
  if (role === "reader") {
    return `${head} ${commandReply("readerOnly", language)}`;
  }
  if (runState === "running") {
    return pt
      ? `${head} Saídas: /ryker parar ou /ryker pausar.`
      : `${head} Exits: /ryker parar or /ryker pausar.`;
  }
  return `${head} ${exitsText(language)}`;
}

export function modelUnavailableNote(role: string, model: string, language?: string): string {
  return isPortuguese(language)
    ? `Modelo indisponível para o papel ${role}: ${model} não foi encontrado. O ciclo não começou e nenhum outro modelo foi usado no lugar.`
    : `Model unavailable for the ${role} role: ${model} was not found. The cycle did not start and no other model was used instead.`;
}

export function startedNote(language?: string): string {
  return isPortuguese(language)
    ? `Ryker: ciclo iniciado na etapa 2 (Planejamento). ${stopHint(language)}`
    : `Ryker: cycle started at stage 2 (Planning). ${stopHint(language)}`;
}

export function newDiscussionHint(language?: string): string {
  return isPortuguese(language)
    ? "/ryker <pedido> inicia uma nova Discussão."
    : "/ryker <request> starts a new Discussion.";
}

export function planLine(planFile: string, language?: string): string {
  return `${isPortuguese(language) ? "Plano" : "Plan"}: ${planFile}`;
}
