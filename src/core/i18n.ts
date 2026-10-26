import type { Estado, Idioma } from "./estado.ts";

export interface Rotulos {
  outraResposta: string;
  recomendada: string;
  discussao: string;
  pergunta: [singular: string, plural: string];
  temaAberto: [singular: string, plural: string];
  pausada: string;
  concluir: string;
}

const PT: Rotulos = {
  outraResposta: "Outra resposta…",
  recomendada: "recomendada",
  discussao: "Discussão",
  pergunta: ["pergunta", "perguntas"],
  temaAberto: ["tema aberto", "temas abertos"],
  pausada: "pausada",
  concluir: "Concluir",
};

const EN: Rotulos = {
  outraResposta: "Other answer…",
  recomendada: "recommended",
  discussao: "Discussion",
  pergunta: ["question", "questions"],
  temaAberto: ["open topic", "open topics"],
  pausada: "paused",
  concluir: "Done",
};

/**
 * Rótulos fixos existem só em pt e en: pt quando a tag começa com "pt" (pt, pt-BR...), senão en.
 * Sem idioma ainda (a pi não expõe locale), usa pt.
 */
export function ehPt(idioma?: Idioma): boolean {
  if (!idioma) return true;
  return /^pt(?![a-z])/i.test(idioma.trim());
}

/** Mensagem de erro quando uma ferramenta Ryker é chamada sem idioma e o estado ainda não tem. */
export const ERRO_SEM_IDIOMA =
  'O idioma do usuário ainda não foi definido. Reenvie a chamada com "idioma": a tag do idioma em que o usuário escreve (ex.: "pt-BR", "en", "es").';

/** Aplica o idioma informado pela ferramenta; recusa se não há idioma nem no estado nem na chamada. */
export function resolverIdioma(
  estado: Estado,
  informado: string | undefined,
): { ok: true; estado: Estado } | { ok: false; erro: string } {
  const tag = informado?.trim();
  if (tag && tag !== estado.idioma) return { ok: true, estado: { ...estado, idioma: tag } };
  if (!tag && !estado.idioma) return { ok: false, erro: ERRO_SEM_IDIOMA };
  return { ok: true, estado };
}

/** Rótulos do código em pt e en; outros idiomas caem em en. */
export function rotulos(idioma?: Idioma): Rotulos {
  return ehPt(idioma) ? PT : EN;
}

export function plural(n: number, par: [string, string]): string {
  return `${n} ${n === 1 ? par[0] : par[1]}`;
}
