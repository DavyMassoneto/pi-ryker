import type { Estado, Idioma } from "./estado.ts";
import { rotulos } from "./i18n.ts";
import { achaTema, type Tema } from "./temas.ts";

/** Rótulo fixo em pt (o idioma padrão da UI). */
export const OUTRA_RESPOSTA = rotulos("pt").outraResposta;

export interface PerguntaEntrada {
  tema: string;
  pergunta: string;
  opcoes: string[];
  recomendada: number;
}

export type Validacao = { ok: true } | { ok: false; erro: string };

const falha = (erro: string): Validacao => ({ ok: false, erro });

export function validarPerguntas(estado: Estado, lote: readonly PerguntaEntrada[]): Validacao {
  if (estado.fase !== "descoberta") {
    return falha(`A fase atual é "${estado.fase}"; só se pergunta na fase descoberta.`);
  }
  if (lote.length < 1 || lote.length > 4) {
    return falha(`Envie de 1 a 4 perguntas por chamada (recebi ${lote.length}).`);
  }
  const vistos = new Set<string>();
  for (const [i, p] of lote.entries()) {
    const ref = `Pergunta ${i + 1} (${p.tema})`;
    const tema = achaTema(estado.temas, p.tema);
    if (!tema) return falha(`${ref}: o tema "${p.tema}" não existe.`);
    if (tema.status !== "aberto") {
      return falha(`${ref}: tema fechado (${tema.status}); não pergunte de novo.`);
    }
    if (vistos.has(p.tema)) return falha(`${ref}: dois itens do mesmo tema na chamada.`);
    vistos.add(p.tema);
    if (!p.pergunta.trim()) return falha(`${ref}: pergunta vazia.`);
    if (p.opcoes.length < 2 || p.opcoes.length > 5) {
      return falha(`${ref}: use de 2 a 5 opções (recebi ${p.opcoes.length}).`);
    }
    const norm = p.opcoes.map((o) => o.trim());
    if (norm.some((o) => o === "")) return falha(`${ref}: há opção vazia.`);
    if (new Set(norm).size !== norm.length) return falha(`${ref}: há opção duplicada.`);
    if (norm.some((o) => o === rotulos("pt").outraResposta || o === rotulos("en").outraResposta)) {
      return falha(`${ref}: não inclua "Outra resposta…"; a interface já a acrescenta.`);
    }
    if (!Number.isInteger(p.recomendada) || p.recomendada < 0 || p.recomendada >= p.opcoes.length) {
      return falha(`${ref}: recomendada deve ser um índice inteiro de 0 a ${p.opcoes.length - 1}.`);
    }
  }
  return { ok: true };
}

/** Recomendada primeiro, com sufixo; "Outra resposta…" no fim. */
export function opcoesDoSelect(p: PerguntaEntrada, idioma?: Idioma): string[] {
  const r = rotulos(idioma);
  const rec = `${p.opcoes[p.recomendada]} (${r.recomendada})`;
  const demais = p.opcoes.filter((_, i) => i !== p.recomendada);
  return [rec, ...demais, r.outraResposta];
}

export type Escolha = { tipo: "opcao"; texto: string } | { tipo: "livre" } | { tipo: "cancelado" };

export function interpretarEscolha(
  p: PerguntaEntrada,
  escolha: string | undefined,
  idioma?: Idioma,
): Escolha {
  if (escolha === undefined) return { tipo: "cancelado" };
  const r = rotulos(idioma);
  if (escolha === r.outraResposta) return { tipo: "livre" };
  const rec = `${p.opcoes[p.recomendada]} (${r.recomendada})`;
  if (escolha === rec) return { tipo: "opcao", texto: p.opcoes[p.recomendada] };
  const i = p.opcoes.findIndex((o, k) => k !== p.recomendada && o === escolha);
  return i >= 0 ? { tipo: "opcao", texto: p.opcoes[i] } : { tipo: "cancelado" };
}

/** A reabertura termina quando o tema volta a fechar por pergunta (o histórico já guarda o anterior). */
function semReabertura(t: Tema): Tema {
  const { reabertura: _r, ...resto } = t;
  return resto;
}

/** Grava a resposta e fecha o tema como decidido. Não muta o estado recebido. */
export function registrarResposta(
  estado: Estado,
  p: PerguntaEntrada,
  resposta: string,
  livre: boolean,
  agora: string,
): Estado {
  const tema = achaTema(estado.temas, p.tema);
  if (!tema) throw new Error(`o tema "${p.tema}" não existe.`);
  if (tema.status !== "aberto") throw new Error(`tema fechado (${tema.status}): ${p.tema}.`);
  const id = `p${estado.perguntas.length + 1}`;
  return {
    ...estado,
    perguntas: [
      ...estado.perguntas,
      {
        id,
        tema: p.tema,
        pergunta: p.pergunta,
        opcoes: [...p.opcoes],
        recomendada: p.recomendada,
        resposta,
        livre,
        em: agora,
      },
    ],
    temas: estado.temas.map((t) =>
      t.id === tema.revisa && t.id !== p.tema
        ? { ...t, substituidoPor: p.tema }
        : t.id === p.tema
          ? {
              ...semReabertura(t),
              status: "decidido" as const,
              texto: `${p.pergunta} → ${resposta}`,
              quando: agora,
              origem: { tipo: "usuario" as const, perguntaId: id },
            }
          : t,
    ),
  };
}

/** Esc no meio do lote: o que já foi respondido fica, o resto continua aberto. */
export function pausar(estado: Estado): Estado {
  return { ...estado, pausado: true };
}
