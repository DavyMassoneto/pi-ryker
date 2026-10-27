import { type DiscussionState, STATE_VERSION } from "./state.ts";

const LEGACY_STATE_VERSION = 1;

export function serialize(state: DiscussionState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function deserialize(text: string): DiscussionState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON inválido: ${(e as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Estado inválido: esperava um objeto.");
  }
  const version = (raw as { versao?: unknown }).versao;
  if (version === LEGACY_STATE_VERSION)
    return { ...(raw as DiscussionState), versao: STATE_VERSION };
  if (version !== STATE_VERSION) {
    throw new Error(
      `Estado com versão desconhecida: ${String(version)} (esperada ${STATE_VERSION}).`,
    );
  }
  return raw as DiscussionState;
}
