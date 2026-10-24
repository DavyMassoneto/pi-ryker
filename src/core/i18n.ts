import type { Idioma } from "./estado.ts";

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

/** Rótulos do código em pt e en; outros idiomas caem em en. */
export function rotulos(idioma: Idioma | string): Rotulos {
  return idioma === "pt" ? PT : EN;
}

export function plural(n: number, par: [string, string]): string {
  return `${n} ${n === 1 ? par[0] : par[1]}`;
}
