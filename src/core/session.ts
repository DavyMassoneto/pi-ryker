export type SessionRole = "owner" | "reader" | "none";

export interface OwnedState {
  donoSessao?: string;
}

export function sessionRole(state: OwnedState | undefined, sessionId: string): SessionRole {
  if (state?.donoSessao === undefined) return "none";
  return state.donoSessao === sessionId ? "owner" : "reader";
}

export function claimOwner<T extends OwnedState>(state: T, sessionId: string): T {
  if (state.donoSessao !== undefined) return state;
  return { ...state, donoSessao: sessionId };
}
