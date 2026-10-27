import { type DiscussionState, isStageActive, slug } from "./state.ts";

export type FileRead =
  | { kind: "absent" }
  | { kind: "ok"; state: DiscussionState }
  | { kind: "corrupted"; error: string };

export type RestorationDecision =
  | { action: "reapply"; state: DiscussionState }
  | { action: "warn"; state: DiscussionState }
  | { action: "recreate"; state: DiscussionState }
  | { action: "corrupted"; error: string }
  | { action: "nothing" };

export function decideRestoration(
  file: FileRead,
  entries: readonly DiscussionState[],
): RestorationDecision {
  if (file.kind === "corrupted") return { action: "corrupted", error: file.error };
  if (file.kind === "absent") {
    const last = entries[entries.length - 1];
    return last ? { action: "recreate", state: last } : { action: "nothing" };
  }
  if (!isStageActive(file.state)) return { action: "nothing" };
  return entries.length
    ? { action: "reapply", state: file.state }
    : { action: "warn", state: file.state };
}

export function archiveName(state: DiscussionState): string {
  const data = (state.aprovadoEm ?? state.criadoEm).slice(0, 10);
  const name = slug(state.pedido).slice(0, 40).replace(/-+$/, "") || "discussao";
  return `${data}-${name}`;
}
