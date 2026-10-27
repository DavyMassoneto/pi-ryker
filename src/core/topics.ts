export type TopicStatus = "aberto" | "decidido" | "suposto" | "adiado";

export type Origin =
  | { tipo: "usuario"; perguntaId: string }
  | { tipo: "fonte"; ref: string }
  | { tipo: "agente" };

export interface Closure {
  status: TopicStatus;
  texto?: string;
  motivo?: string;
  quando?: string;
  origem?: Origin;
}

export interface Topic {
  id: string;
  titulo: string;
  secao: number;
  criadoPor: "base" | "modelo";
  status: TopicStatus;
  texto?: string;
  motivo?: string;
  quando?: string;
  origem?: Origin;
  revisa?: string;
  substituidoPor?: string;
  revistoEm?: string;
  criadoEm?: string;
  reabertura?: { nota: string; em: string };
  historico: Closure[];
}

export interface BaseTopic {
  id: string;
  title: string;
  section: number;
}

export const BASE_TOPICS: readonly BaseTopic[] = [
  { id: "problema-job", title: "Problema / trabalho a ser feito", section: 1 },
  { id: "para-quem", title: "Para quem", section: 1 },
  { id: "resultado", title: "Resultado esperado", section: 2 },
  { id: "apetite", title: "Apetite (quanto vale investir)", section: 3 },
  { id: "entra", title: "O que entra no escopo", section: 4 },
  { id: "fora", title: "O que fica fora", section: 5 },
  { id: "restricoes", title: "Restrições duras", section: 6 },
  { id: "integracoes", title: "Integrações externas", section: 6 },
  { id: "escolhas-caras", title: "Escolhas caras de reverter", section: 7 },
  { id: "riscos", title: "Riscos", section: 8 },
];

export function createBaseTopics(): Topic[] {
  return BASE_TOPICS.map((t) => ({
    id: t.id,
    titulo: t.title,
    secao: t.section,
    criadoPor: "base" as const,
    status: "aberto" as const,
    historico: [],
  }));
}

export function openTopics(topics: readonly Topic[]): Topic[] {
  return topics.filter((t) => t.status === "aberto");
}

export function findTopic(topics: readonly Topic[], id: string): Topic | undefined {
  return topics.find((t) => t.id === id);
}
