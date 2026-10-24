import { achaTema, criarTemasBase, type Tema } from "./temas.ts";

export type Fase = "descoberta" | "documento" | "aprovacao" | "aprovada";
export type Idioma = "pt" | "en";

export interface ModeloRef {
  provider: string;
  id: string;
}

export interface Pergunta {
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

export interface ResolucaoAchado {
  tipo: "tema" | "sintese";
  tema?: string;
  como: string;
}

export interface Achado {
  id: string;
  bloqueante: boolean;
  texto: string;
  tema?: string;
  exigeDecisaoMacro: boolean;
  resolucao?: ResolucaoAchado;
}

/** Resultado da rodada única do revisor (decisão 12). */
export interface Revisao {
  em: string;
  achados: Achado[];
}

export interface Anterior {
  modelo?: ModeloRef;
  ferramentas: string[];
}

export interface Estado {
  versao: 1;
  fase: Fase;
  pedido: string;
  idioma: Idioma;
  criadoEm: string;
  temas: Tema[];
  perguntas: Pergunta[];
  anterior: Anterior;
  modeloEtapa?: ModeloRef;
  pausado: boolean;
  revisao?: Revisao;
  documento?: { caminho: string; geradoEm: string };
  aprovadoEm?: string;
}

export const VERSAO_ESTADO = 1;

export interface ParamsCriar {
  pedido: string;
  idioma: Idioma;
  /** Instante ISO; entra por parâmetro para o core não depender do relógio. */
  agora: string;
  anterior: Anterior;
  modeloEtapa?: ModeloRef;
}

export function criarEstado(p: ParamsCriar): Estado {
  return {
    versao: VERSAO_ESTADO,
    fase: "descoberta",
    pedido: p.pedido,
    idioma: p.idioma,
    criadoEm: p.agora,
    temas: criarTemasBase(),
    perguntas: [],
    anterior: { ...p.anterior, ferramentas: [...p.anterior.ferramentas] },
    ...(p.modeloEtapa ? { modeloEtapa: p.modeloEtapa } : {}),
    pausado: false,
  };
}

/** Etapa ativa = existe estado e a fase não é "aprovada". */
export function etapaAtiva(estado: Estado | undefined): estado is Estado {
  return estado !== undefined && estado.fase !== "aprovada";
}

export interface ItemTema {
  acao: "fonte" | "supor" | "adiar" | "criar";
  tema?: string;
  titulo?: string;
  secao?: number;
  texto?: string;
  /** Caminho ou trecho citado (ação "fonte"). */
  origem?: string;
  motivo?: string;
  quando?: string;
  revisa?: string;
}

export type ResultadoTemas = { ok: true; estado: Estado } | { ok: false; erro: string };

const vazio = (v: string | undefined): boolean => v === undefined || v.trim() === "";

export function slug(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "tema";
}

function aplicarUm(estado: Estado, it: ItemTema, agora: string): Estado {
  if (it.acao === "criar") {
    if (vazio(it.titulo)) throw new Error('"criar" exige titulo.');
    if (!Number.isInteger(it.secao) || (it.secao as number) < 1 || (it.secao as number) > 8) {
      throw new Error('"criar" exige secao inteira de 1 a 8.');
    }
    if (it.revisa !== undefined) {
      const alvo = achaTema(estado.temas, it.revisa);
      if (alvo?.status !== "decidido") {
        throw new Error(`revisa: "${it.revisa}" precisa ser um tema decidido.`);
      }
    }
    const base = slug(it.titulo as string);
    let id = base;
    for (let n = 2; achaTema(estado.temas, id); n++) id = `${base}-${n}`;
    const novo: Tema = {
      id,
      titulo: (it.titulo as string).trim(),
      secao: it.secao as number,
      criadoPor: "modelo",
      status: "aberto",
      historico: [],
      criadoEm: agora,
      ...(it.revisa ? { revisa: it.revisa } : {}),
    };
    return { ...estado, temas: [...estado.temas, novo] };
  }
  if (vazio(it.tema)) throw new Error(`"${it.acao}" exige tema.`);
  const tema = achaTema(estado.temas, it.tema as string);
  if (!tema) throw new Error(`o tema "${it.tema}" não existe.`);
  if (tema.status !== "aberto") throw new Error(`tema fechado (${tema.status}): ${tema.id}.`);
  if (tema.reabertura) {
    throw new Error(`o tema ${tema.id} foi reaberto pelo usuário e só fecha por ryker_perguntar.`);
  }
  if (vazio(it.texto)) throw new Error(`"${it.acao}" exige texto (${tema.id}).`);
  let fecho: Partial<Tema>;
  if (it.acao === "fonte") {
    if (vazio(it.origem))
      throw new Error(`"fonte" exige origem: caminho ou trecho citado (${tema.id}).`);
    fecho = { status: "decidido", origem: { tipo: "fonte", ref: (it.origem as string).trim() } };
  } else if (it.acao === "supor") {
    if (vazio(it.motivo))
      throw new Error(`"supor" exige motivo: por que não perguntou (${tema.id}).`);
    fecho = { status: "suposto", motivo: it.motivo, origem: { tipo: "agente" } };
  } else {
    if (vazio(it.quando)) throw new Error(`"adiar" exige quando decidir (${tema.id}).`);
    fecho = { status: "adiado", motivo: it.motivo, quando: it.quando, origem: { tipo: "agente" } };
  }
  const fechado: Tema = { ...tema, ...fecho, texto: (it.texto as string).trim() };
  if (it.acao !== "adiar") fechado.quando = agora;
  return { ...estado, temas: estado.temas.map((t) => (t.id === tema.id ? fechado : t)) };
}

/** Aplica o lote em sequência; qualquer erro descarta tudo (o estado recebido não é mutado). */
export function aplicarTemas(
  estado: Estado,
  itens: readonly ItemTema[],
  agora: string,
): ResultadoTemas {
  if (estado.fase !== "descoberta") {
    return {
      ok: false,
      erro: `A fase atual é "${estado.fase}"; só se fecham temas na descoberta.`,
    };
  }
  if (itens.length < 1 || itens.length > 20) {
    return { ok: false, erro: "Envie de 1 a 20 itens por chamada." };
  }
  let atual = estado;
  for (const [i, it] of itens.entries()) {
    try {
      atual = aplicarUm(atual, it, agora);
    } catch (e) {
      return { ok: false, erro: `Item ${i + 1}: ${(e as Error).message} Nada foi aplicado.` };
    }
  }
  return { ok: true, estado: atual };
}

/** Aprovação do documento: fecha a etapa e devolve o que restaurar (ferramentas e modelo). */
export function aprovar(
  estado: Estado,
  agora: string,
): { estado: Estado; ferramentas: string[]; modelo?: ModeloRef } {
  return {
    estado: { ...estado, fase: "aprovada", aprovadoEm: agora, pausado: false },
    ferramentas: [...estado.anterior.ferramentas],
    ...(estado.anterior.modelo ? { modelo: estado.anterior.modelo } : {}),
  };
}
