import type { DiscussionState, Language } from "./state.ts";

export interface Labels {
  otherAnswer: string;
  recommended: string;
  discussion: string;
  question: [singular: string, plural: string];
  openTopic: [singular: string, plural: string];
  paused: string;
  done: string;
}

const PT: Labels = {
  otherAnswer: "Outra resposta…",
  recommended: "recomendada",
  discussion: "Discussão",
  question: ["pergunta", "perguntas"],
  openTopic: ["tema aberto", "temas abertos"],
  paused: "pausada",
  done: "Concluir",
};

const EN: Labels = {
  otherAnswer: "Other answer…",
  recommended: "recommended",
  discussion: "Discussion",
  question: ["question", "questions"],
  openTopic: ["open topic", "open topics"],
  paused: "paused",
  done: "Done",
};

export function isPortuguese(language?: Language): boolean {
  if (!language) return true;
  return /^pt(?![a-z])/i.test(language.trim());
}

export const MISSING_LANGUAGE_ERROR =
  'O idioma do usuário ainda não foi definido. Reenvie a chamada com "idioma": a tag do idioma em que o usuário escreve (ex.: "pt-BR", "en", "es").';

export function resolveLanguage(
  state: DiscussionState,
  provided: string | undefined,
): { ok: true; state: DiscussionState } | { ok: false; error: string } {
  const tag = provided?.trim();
  if (tag && tag !== state.idioma) return { ok: true, state: { ...state, idioma: tag } };
  if (!tag && !state.idioma) return { ok: false, error: MISSING_LANGUAGE_ERROR };
  return { ok: true, state };
}

export function labels(language?: Language): Labels {
  return isPortuguese(language) ? PT : EN;
}

export function plural(n: number, pair: [string, string]): string {
  return `${n} ${n === 1 ? pair[0] : pair[1]}`;
}
