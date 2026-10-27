import { labels } from "./i18n.ts";
import type { DiscussionState, Language } from "./state.ts";
import { findTopic, type Topic } from "./topics.ts";

export const OTHER_ANSWER = labels("pt").otherAnswer;

export interface QuestionInput {
  tema: string;
  pergunta: string;
  opcoes: string[];
  recomendada: number;
}

export type Validation = { ok: true } | { ok: false; error: string };

const failure = (error: string): Validation => ({ ok: false, error });

export function validateQuestions(
  state: DiscussionState,
  batch: readonly QuestionInput[],
): Validation {
  if (state.fase !== "descoberta") {
    return failure(`A fase atual é "${state.fase}"; só se pergunta na fase descoberta.`);
  }
  if (batch.length < 1 || batch.length > 4) {
    return failure(`Envie de 1 a 4 perguntas por chamada (recebi ${batch.length}).`);
  }
  const seen = new Set<string>();
  for (const [i, p] of batch.entries()) {
    const ref = `Pergunta ${i + 1} (${p.tema})`;
    const topic = findTopic(state.temas, p.tema);
    if (!topic) return failure(`${ref}: o tema "${p.tema}" não existe.`);
    if (topic.status !== "aberto") {
      return failure(`${ref}: tema fechado (${topic.status}); não pergunte de novo.`);
    }
    if (seen.has(p.tema)) return failure(`${ref}: dois itens do mesmo tema na chamada.`);
    seen.add(p.tema);
    if (!p.pergunta.trim()) return failure(`${ref}: pergunta vazia.`);
    if (p.opcoes.length < 2 || p.opcoes.length > 5) {
      return failure(`${ref}: use de 2 a 5 opções (recebi ${p.opcoes.length}).`);
    }
    const normalize = p.opcoes.map((o) => o.trim());
    if (normalize.some((o) => o === "")) return failure(`${ref}: há opção vazia.`);
    if (new Set(normalize).size !== normalize.length) return failure(`${ref}: há opção duplicada.`);
    if (normalize.some((o) => o === labels("pt").otherAnswer || o === labels("en").otherAnswer)) {
      return failure(`${ref}: não inclua "Outra resposta…"; a interface já a acrescenta.`);
    }
    if (!Number.isInteger(p.recomendada) || p.recomendada < 0 || p.recomendada >= p.opcoes.length) {
      return failure(
        `${ref}: recomendada deve ser um índice inteiro de 0 a ${p.opcoes.length - 1}.`,
      );
    }
  }
  return { ok: true };
}

export function selectOptions(p: QuestionInput, language?: Language): string[] {
  const r = labels(language);
  const rec = `${p.opcoes[p.recomendada]} (${r.recommended})`;
  const others = p.opcoes.filter((_, i) => i !== p.recomendada);
  return [rec, ...others, r.otherAnswer];
}

export type Choice = { kind: "option"; text: string } | { kind: "free" } | { kind: "cancelled" };

export function interpretChoice(
  p: QuestionInput,
  choice: string | undefined,
  language?: Language,
): Choice {
  if (choice === undefined) return { kind: "cancelled" };
  const r = labels(language);
  if (choice === r.otherAnswer) return { kind: "free" };
  const rec = `${p.opcoes[p.recomendada]} (${r.recommended})`;
  if (choice === rec) return { kind: "option", text: p.opcoes[p.recomendada] };
  const i = p.opcoes.findIndex((o, k) => k !== p.recomendada && o === choice);
  return i >= 0 ? { kind: "option", text: p.opcoes[i] } : { kind: "cancelled" };
}

function withoutReopening(t: Topic): Topic {
  const { reabertura: _r, ...rest } = t;
  return rest;
}

export function recordAnswer(
  state: DiscussionState,
  p: QuestionInput,
  answer: string,
  free: boolean,
  now: string,
): DiscussionState {
  const topic = findTopic(state.temas, p.tema);
  if (!topic) throw new Error(`o tema "${p.tema}" não existe.`);
  if (topic.status !== "aberto") throw new Error(`tema fechado (${topic.status}): ${p.tema}.`);
  const id = `p${state.perguntas.length + 1}`;
  return {
    ...state,
    perguntas: [
      ...state.perguntas,
      {
        id,
        tema: p.tema,
        pergunta: p.pergunta,
        opcoes: [...p.opcoes],
        recomendada: p.recomendada,
        resposta: answer,
        livre: free,
        em: now,
      },
    ],
    temas: state.temas.map((t) =>
      t.id === topic.revisa && t.id !== p.tema
        ? { ...t, substituidoPor: p.tema }
        : t.id === p.tema
          ? {
              ...withoutReopening(t),
              status: "decidido" as const,
              texto: `${p.pergunta} → ${answer}`,
              quando: now,
              origem: { tipo: "usuario" as const, perguntaId: id },
            }
          : t,
    ),
  };
}

export function pause(state: DiscussionState): DiscussionState {
  return { ...state, pausado: true };
}
