import type { ModeloRef } from "./estado.ts";

export type EscolhaOpus =
  | { tipo: "nenhum" }
  | { tipo: "um"; modelo: ModeloRef }
  | { tipo: "varios"; modelos: ModeloRef[] };

/** Opus = modelos disponíveis cujo id contém "opus". */
export function escolherOpus(disponiveis: readonly ModeloRef[]): EscolhaOpus {
  const opus = disponiveis
    .filter((m) => m.id.toLowerCase().includes("opus"))
    .map((m) => ({ provider: m.provider, id: m.id }));
  if (opus.length === 0) return { tipo: "nenhum" };
  if (opus.length === 1) return { tipo: "um", modelo: opus[0] };
  return { tipo: "varios", modelos: opus };
}

export const rotuloModelo = (m: ModeloRef): string => `${m.provider}/${m.id}`;
