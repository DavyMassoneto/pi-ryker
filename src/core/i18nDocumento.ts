import type { Idioma } from "./estado.ts";

const SECOES_PT = [
  "Problema e para quem",
  "Resultado esperado",
  "Apetite",
  "O que entra",
  "O que fica fora",
  "Restrições duras",
  "Escolhas caras de reverter",
  "Riscos",
  "Suposições (aprovadas em bloco)",
  "Adiados",
  "Registro",
];

const SECOES_EN = [
  "Problem and audience",
  "Expected outcome",
  "Appetite",
  "In scope",
  "Out of scope",
  "Hard constraints",
  "Costly-to-reverse choices",
  "Risks",
  "Assumptions (approved as a block)",
  "Deferred",
  "Record",
];

export interface RotulosDoc {
  secoes: string[];
  pedido: string;
  nenhum: string;
  porque: string;
  decidirQuando: string;
  origem: string;
  usuario: string;
  fonte: string;
  agente: string;
  respondeu: string;
  livre: string;
  aviso: string;
}

/** Rótulos do documento em pt e en (outros idiomas caem em en). */
export function rotulosDoc(idioma: Idioma | string): RotulosDoc {
  return idioma === "pt"
    ? {
        secoes: SECOES_PT,
        pedido: "Pedido original",
        nenhum: "Nada nesta seção.",
        porque: "Por que não perguntei",
        decidirQuando: "Decidir quando",
        origem: "Origem",
        usuario: "usuário",
        fonte: "fonte",
        agente: "agente",
        respondeu: "Resposta",
        livre: "resposta livre",
        aviso:
          "O documento passou do tamanho-alvo (1 a 3 páginas); considere sínteses mais curtas.",
      }
    : {
        secoes: SECOES_EN,
        pedido: "Original request",
        nenhum: "Nothing in this section.",
        porque: "Why I did not ask",
        decidirQuando: "Decide when",
        origem: "Origin",
        usuario: "user",
        fonte: "source",
        agente: "agent",
        respondeu: "Answer",
        livre: "free answer",
        aviso: "The document exceeded the target size (1 to 3 pages); consider shorter summaries.",
      };
}
