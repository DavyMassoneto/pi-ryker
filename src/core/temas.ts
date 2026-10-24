export type StatusTema = "aberto" | "decidido" | "suposto" | "adiado";

export type Origem =
  | { tipo: "usuario"; perguntaId: string }
  | { tipo: "fonte"; ref: string }
  | { tipo: "agente" };

export interface Fechamento {
  status: StatusTema;
  texto?: string;
  motivo?: string;
  quando?: string;
  origem?: Origem;
}

export interface Tema {
  id: string;
  titulo: string;
  /** Seção do documento (1..8) onde o tema aparece. */
  secao: number;
  criadoPor: "base" | "modelo";
  status: StatusTema;
  texto?: string;
  motivo?: string;
  quando?: string;
  origem?: Origem;
  revisa?: string;
  reabertura?: { nota: string; em: string };
  /** Fechamentos anteriores (preenchido na reabertura, F5). */
  historico: Fechamento[];
}

export interface TemaBase {
  id: string;
  titulo: string;
  secao: number;
}

export const TEMAS_BASE: readonly TemaBase[] = [
  { id: "problema-job", titulo: "Problema / trabalho a ser feito", secao: 1 },
  { id: "para-quem", titulo: "Para quem", secao: 1 },
  { id: "resultado", titulo: "Resultado esperado", secao: 2 },
  { id: "apetite", titulo: "Apetite (quanto vale investir)", secao: 3 },
  { id: "entra", titulo: "O que entra no escopo", secao: 4 },
  { id: "fora", titulo: "O que fica fora", secao: 5 },
  { id: "restricoes", titulo: "Restrições duras", secao: 6 },
  { id: "integracoes", titulo: "Integrações externas", secao: 6 },
  { id: "escolhas-caras", titulo: "Escolhas caras de reverter", secao: 7 },
  { id: "riscos", titulo: "Riscos", secao: 8 },
];

export function criarTemasBase(): Tema[] {
  return TEMAS_BASE.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    secao: t.secao,
    criadoPor: "base" as const,
    status: "aberto" as const,
    historico: [],
  }));
}

export function temasAbertos(temas: readonly Tema[]): Tema[] {
  return temas.filter((t) => t.status === "aberto");
}

export function achaTema(temas: readonly Tema[], id: string): Tema | undefined {
  return temas.find((t) => t.id === id);
}
