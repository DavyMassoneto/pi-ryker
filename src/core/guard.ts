import { type DiscussionState, isStageActive } from "./state.ts";
import { openTopics } from "./topics.ts";

export type CorrectionKind = "A" | "B";

export interface Counters {
  free: number;
  progress: number;
}

export const ZERO_COUNTERS: Counters = { free: 0, progress: 0 };
export const MAX_FREE_CORRECTIONS = 2;
export const MAX_PROGRESS_CORRECTIONS = 1;
export const CORRECTION_ENTRY_TYPE = "ryker-correcao";

const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function stripNonSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, "\n")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
}

const SUMMARY_LINE = /→|->|^(pergunta|p|question|q)\s*:/i;

export function detectFreeTextQuestion(text: string, registered: readonly string[]): boolean {
  const lines = stripNonSpeech(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .slice(-3);
  const alreadyAsked = registered.map(normalize).filter((r) => r !== "");
  for (const rawLine of lines) {
    const l = rawLine.replace(/^([-*+]|\d+[.)])\s+/, "").replace(/^[*_\s]+/, "");
    const end = l.replace(/[*_"'”’)\]\s]+$/, "");
    if (!end.endsWith("?")) continue;
    if (SUMMARY_LINE.test(l)) continue;
    const n = normalize(end);
    if (n === "" || alreadyAsked.some((r) => n.includes(r) || r.includes(n))) continue;
    return true;
  }
  return false;
}

export interface GuardInput {
  state: DiscussionState | undefined;
  text: string;
  askedInLastMessage: boolean;
  outcome: "completed" | "aborted" | "error";
  counters: Counters;
}

export interface Correction {
  kind: CorrectionKind;
  text: string;
}

export interface GuardDecision {
  correction?: Correction;
  counters: Counters;
}

const FREE_QUESTION_CORRECTION_TEXT =
  "CORREÇÃO DO SISTEMA: você fez uma pergunta em texto livre. Na Discussão Global toda pergunta ao usuário vai pela ferramenta `ryker_perguntar`. Refaça a pergunta com ela, sem perguntar em texto.";
const PROGRESS_CORRECTION_TEXT =
  "CORREÇÃO DO SISTEMA: a Discussão Global ainda tem temas abertos e você parou sem perguntar. Continue: feche o que as fontes já respondem com `ryker_temas` (fonte, supor ou adiar) e faça a próxima pergunta com `ryker_perguntar`.";

export const POST_APPROVAL_CORRECTION_TEXT =
  "CORREÇÃO DO SISTEMA: depois da aprovação da visão o usuário não é perguntado. Decida você e registre como suposição; continue o trabalho.";

export function decideContinuation(e: GuardInput): GuardDecision {
  const unchanged: GuardDecision = { counters: e.counters };
  const { state } = e;
  if (state?.fase === "aprovada") {
    if (
      e.outcome === "completed" &&
      e.counters.free < MAX_FREE_CORRECTIONS &&
      detectFreeTextQuestion(
        e.text,
        state.perguntas.map((p) => p.pergunta),
      )
    ) {
      return {
        correction: { kind: "A", text: POST_APPROVAL_CORRECTION_TEXT },
        counters: { ...e.counters, free: e.counters.free + 1 },
      };
    }
    return unchanged;
  }
  if (!isStageActive(state) || state.pausado) return unchanged;
  if (e.outcome !== "completed") return unchanged;
  if (state.fase === "aprovacao") return unchanged;
  if (
    !e.askedInLastMessage &&
    e.counters.free < MAX_FREE_CORRECTIONS &&
    detectFreeTextQuestion(
      e.text,
      state.perguntas.map((p) => p.pergunta),
    )
  ) {
    return {
      correction: { kind: "A", text: FREE_QUESTION_CORRECTION_TEXT },
      counters: { ...e.counters, free: e.counters.free + 1 },
    };
  }
  if (
    state.fase === "descoberta" &&
    e.counters.progress < MAX_PROGRESS_CORRECTIONS &&
    openTopics(state.temas).length > 0
  ) {
    return {
      correction: { kind: "B", text: PROGRESS_CORRECTION_TEXT },
      counters: { ...e.counters, progress: e.counters.progress + 1 },
    };
  }
  return unchanged;
}
