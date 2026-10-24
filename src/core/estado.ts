import { criarTemasBase, type Tema } from "./temas.ts";

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
