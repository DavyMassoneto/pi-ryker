import { type Estado, etapaAtiva } from "./estado.ts";
import { temasAbertos } from "./temas.ts";

export type TipoCorrecao = "A" | "B";

export interface Contadores {
  livre: number;
  progresso: number;
}

export const CONTADORES_ZERO: Contadores = { livre: 0, progresso: 0 };
export const MAX_CORRECOES_LIVRE = 2;
export const MAX_CORRECOES_PROGRESSO = 1;
export const TIPO_CORRECAO = "ryker-correcao";

const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Remove o que não é fala do modelo: blocos de código, código inline, URLs e citações. */
function limpar(texto: string): string {
  return texto
    .replace(/```[\s\S]*?(```|$)/g, "\n")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
}

const RESUMO = /→|->|^(pergunta|p|question|q)\s*:/i;

/**
 * Uma das 3 últimas linhas não vazias (fora de código/citação) termina em "?", não é
 * linha de resumo e não é uma pergunta já registrada.
 */
export function detectaPerguntaLivre(texto: string, registradas: readonly string[]): boolean {
  const linhas = limpar(texto)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .slice(-3);
  const jaFeitas = registradas.map(norm).filter((r) => r !== "");
  for (const bruta of linhas) {
    const l = bruta.replace(/^([-*+]|\d+[.)])\s+/, "").replace(/^[*_\s]+/, "");
    const fim = l.replace(/[*_"'”’)\]\s]+$/, "");
    if (!fim.endsWith("?")) continue;
    if (RESUMO.test(l)) continue;
    const n = norm(fim);
    if (n === "" || jaFeitas.some((r) => n.includes(r) || r.includes(n))) continue;
    return true;
  }
  return false;
}

export interface EntradaGuarda {
  estado: Estado | undefined;
  /** Texto da última mensagem do assistente. */
  texto: string;
  /** A última mensagem do assistente chamou `ryker_perguntar` (suprime só a correção A). */
  perguntouNaUltima: boolean;
  outcome: "completed" | "aborted" | "error";
  contadores: Contadores;
}

export interface Correcao {
  tipo: TipoCorrecao;
  texto: string;
}

export interface DecisaoGuarda {
  correcao?: Correcao;
  contadores: Contadores;
}

const TEXTO_A =
  "CORREÇÃO DO SISTEMA: você fez uma pergunta em texto livre. Na Discussão Global toda pergunta ao usuário vai pela ferramenta `ryker_perguntar`. Refaça a pergunta com ela, sem perguntar em texto.";
const TEXTO_B =
  "CORREÇÃO DO SISTEMA: a Discussão Global ainda tem temas abertos e você parou sem perguntar. Continue: feche o que as fontes já respondem com `ryker_temas` (fonte, supor ou adiar) e faça a próxima pergunta com `ryker_perguntar`.";

export function decidirContinuacao(e: EntradaGuarda): DecisaoGuarda {
  const nada: DecisaoGuarda = { contadores: e.contadores };
  const { estado } = e;
  if (!etapaAtiva(estado) || estado.pausado) return nada;
  if (e.outcome !== "completed") return nada;
  if (estado.fase === "aprovacao") return nada;
  if (
    !e.perguntouNaUltima &&
    e.contadores.livre < MAX_CORRECOES_LIVRE &&
    detectaPerguntaLivre(
      e.texto,
      estado.perguntas.map((p) => p.pergunta),
    )
  ) {
    return {
      correcao: { tipo: "A", texto: TEXTO_A },
      contadores: { ...e.contadores, livre: e.contadores.livre + 1 },
    };
  }
  if (
    estado.fase === "descoberta" &&
    e.contadores.progresso < MAX_CORRECOES_PROGRESSO &&
    temasAbertos(estado.temas).length > 0
  ) {
    return {
      correcao: { tipo: "B", texto: TEXTO_B },
      contadores: { ...e.contadores, progresso: e.contadores.progresso + 1 },
    };
  }
  return nada;
}
