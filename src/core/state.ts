import { createBaseTopics, findTopic, type Topic } from "./topics.ts";

export type Phase = "descoberta" | "documento" | "aprovacao" | "aprovada";
export type Language = string;

export interface ModelRef {
  provider: string;
  id: string;
}

export interface Question {
  id: string;
  tema: string;
  pergunta: string;
  opcoes: string[];
  recomendada: number;
  resposta?: string;
  livre: boolean;
  em: string;
  cancelada?: boolean;
}

export interface FindingResolution {
  tipo: "tema" | "sintese" | "suposicao";
  tema?: string;
  como: string;
}

export interface Finding {
  id: string;
  bloqueante: boolean;
  texto: string;
  tema?: string;
  exigeDecisaoMacro: boolean;
  resolucao?: FindingResolution;
}

export interface Review {
  em: string;
  achados: Finding[];
}

export interface Previous {
  modelo?: ModelRef;
  ferramentas: string[];
}

export interface DiscussionState {
  versao: 1;
  fase: Phase;
  pedido: string;
  idioma?: Language;
  criadoEm: string;
  temas: Topic[];
  perguntas: Question[];
  anterior: Previous;
  modeloEtapa?: ModelRef;
  pausado: boolean;
  revisao?: Review;
  documento?: { caminho: string; geradoEm: string };
  aprovadoEm?: string;
}

export const STATE_VERSION = 1;

export interface CreateParams {
  request: string;
  language?: Language;
  now: string;
  previous: Previous;
  stageModel?: ModelRef;
}

export function createState(p: CreateParams): DiscussionState {
  return {
    versao: STATE_VERSION,
    fase: "descoberta",
    pedido: p.request,
    ...(p.language ? { idioma: p.language } : {}),
    criadoEm: p.now,
    temas: createBaseTopics(),
    perguntas: [],
    anterior: { ...p.previous, ferramentas: [...p.previous.ferramentas] },
    ...(p.stageModel ? { modeloEtapa: p.stageModel } : {}),
    pausado: false,
  };
}

export function isStageActive(state: DiscussionState | undefined): state is DiscussionState {
  return state !== undefined && state.fase !== "aprovada";
}

export interface TopicItem {
  acao: "fonte" | "supor" | "adiar" | "criar";
  tema?: string;
  titulo?: string;
  secao?: number;
  texto?: string;
  origem?: string;
  motivo?: string;
  quando?: string;
  revisa?: string;
}

export type TopicsResult = { ok: true; state: DiscussionState } | { ok: false; error: string };

const empty = (v: string | undefined): boolean => v === undefined || v.trim() === "";

export function slug(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "tema";
}

function rewriteAssumption(
  state: DiscussionState,
  topic: Topic,
  it: TopicItem,
  now: string,
): DiscussionState {
  if (empty(it.texto)) throw new Error(`"supor" exige texto (${topic.id}).`);
  if (empty(it.motivo))
    throw new Error(`"supor" exige motivo: por que não perguntou (${topic.id}).`);
  const added: Topic = {
    ...topic,
    texto: (it.texto as string).trim(),
    motivo: it.motivo,
    quando: now,
    revistoEm: now,
    historico: [
      ...topic.historico,
      {
        status: topic.status,
        ...(topic.texto !== undefined ? { texto: topic.texto } : {}),
        ...(topic.motivo !== undefined ? { motivo: topic.motivo } : {}),
        ...(topic.quando !== undefined ? { quando: topic.quando } : {}),
        ...(topic.origem ? { origem: topic.origem } : {}),
      },
    ],
  };
  return { ...state, temas: state.temas.map((t) => (t.id === topic.id ? added : t)) };
}

function applyOne(state: DiscussionState, it: TopicItem, now: string): DiscussionState {
  if (it.acao === "criar") {
    if (empty(it.titulo)) throw new Error('"criar" exige titulo.');
    if (!Number.isInteger(it.secao) || (it.secao as number) < 1 || (it.secao as number) > 8) {
      throw new Error('"criar" exige secao inteira de 1 a 8.');
    }
    if (it.revisa !== undefined) {
      const target = findTopic(state.temas, it.revisa);
      if (target?.status !== "decidido" && target?.status !== "suposto") {
        throw new Error(`revisa: "${it.revisa}" precisa ser um tema decidido ou suposto.`);
      }
    }
    const base = slug(it.titulo as string);
    let id = base;
    for (let n = 2; findTopic(state.temas, id); n++) id = `${base}-${n}`;
    const added: Topic = {
      id,
      titulo: (it.titulo as string).trim(),
      secao: it.secao as number,
      criadoPor: "modelo",
      status: "aberto",
      historico: [],
      criadoEm: now,
      ...(it.revisa ? { revisa: it.revisa } : {}),
    };
    return { ...state, temas: [...state.temas, added] };
  }
  if (empty(it.tema)) throw new Error(`"${it.acao}" exige tema.`);
  const topic = findTopic(state.temas, it.tema as string);
  if (!topic) throw new Error(`o tema "${it.tema}" não existe.`);
  if (it.acao === "supor" && topic.status === "suposto")
    return rewriteAssumption(state, topic, it, now);
  if (topic.status !== "aberto") throw new Error(`tema fechado (${topic.status}): ${topic.id}.`);
  if (topic.reabertura) {
    throw new Error(`o tema ${topic.id} foi reaberto pelo usuário e só fecha por ryker_perguntar.`);
  }
  if (empty(it.texto)) throw new Error(`"${it.acao}" exige texto (${topic.id}).`);
  let closing: Partial<Topic>;
  if (it.acao === "fonte") {
    if (empty(it.origem))
      throw new Error(`"fonte" exige origem: caminho ou trecho citado (${topic.id}).`);
    closing = { status: "decidido", origem: { tipo: "fonte", ref: (it.origem as string).trim() } };
  } else if (it.acao === "supor") {
    if (empty(it.motivo))
      throw new Error(`"supor" exige motivo: por que não perguntou (${topic.id}).`);
    closing = { status: "suposto", motivo: it.motivo, origem: { tipo: "agente" } };
  } else {
    if (empty(it.quando)) throw new Error(`"adiar" exige quando decidir (${topic.id}).`);
    closing = {
      status: "adiado",
      motivo: it.motivo,
      quando: it.quando,
      origem: { tipo: "agente" },
    };
  }
  const closedState: Topic = { ...topic, ...closing, texto: (it.texto as string).trim() };
  if (it.acao !== "adiar") closedState.quando = now;
  return { ...state, temas: state.temas.map((t) => (t.id === topic.id ? closedState : t)) };
}

export function applyTopics(
  state: DiscussionState,
  items: readonly TopicItem[],
  now: string,
): TopicsResult {
  if (state.fase !== "descoberta") {
    return {
      ok: false,
      error: `A fase atual é "${state.fase}"; só se fecham temas na descoberta.`,
    };
  }
  if (items.length < 1 || items.length > 20) {
    return { ok: false, error: "Envie de 1 a 20 itens por chamada." };
  }
  let current = state;
  for (const [i, it] of items.entries()) {
    try {
      current = applyOne(current, it, now);
    } catch (e) {
      return { ok: false, error: `Item ${i + 1}: ${(e as Error).message} Nada foi aplicado.` };
    }
  }
  return { ok: true, state: current };
}

export function approve(
  state: DiscussionState,
  now: string,
): { state: DiscussionState; tools: string[]; model?: ModelRef } {
  return {
    state: { ...state, fase: "aprovada", aprovadoEm: now, pausado: false },
    tools: [...state.anterior.ferramentas],
    ...(state.anterior.modelo ? { model: state.anterior.modelo } : {}),
  };
}
