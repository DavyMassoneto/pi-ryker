import type { ModelRef } from "./state.ts";

export type OpusChoice =
  | { kind: "none" }
  | { kind: "one"; model: ModelRef }
  | { kind: "many"; models: ModelRef[] };

export function chooseOpus(available: readonly ModelRef[]): OpusChoice {
  const opus = available
    .filter((m) => m.id.toLowerCase().includes("opus"))
    .map((m) => ({ provider: m.provider, id: m.id }));
  if (opus.length === 0) return { kind: "none" };
  if (opus.length === 1) return { kind: "one", model: opus[0] };
  return { kind: "many", models: opus };
}

export const modelLabel = (m: ModelRef): string => `${m.provider}/${m.id}`;
