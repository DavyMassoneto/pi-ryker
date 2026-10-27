export const MAX_ROUNDS = 2;

export type CyclePhase = "planning" | "reviewing" | "approved" | "stopped" | "backToDiscussion";
export type StopReason = "roundsExhausted" | "blocked" | "error";

export interface CycleState {
  stage: number;
  round: number;
  phase: CyclePhase;
  stop?: StopReason;
}

export type CycleEvent =
  | {
      type: "planner";
      status: "DONE" | "BACK_TO_DISCUSSION" | "BLOCKED" | undefined;
      planValid: boolean;
    }
  | { type: "review"; status: "APPROVED" | "REJECTED" | "BACK_TO_DISCUSSION" | undefined }
  | { type: "codeCheckFailed" };

const TERMINAL: CyclePhase[] = ["approved", "stopped", "backToDiscussion"];

export function startCycle(): CycleState {
  return { stage: 2, round: 1, phase: "planning" };
}

function failRound(state: CycleState): CycleState {
  if (state.round >= MAX_ROUNDS) return { ...state, phase: "stopped", stop: "roundsExhausted" };
  return { stage: state.stage, round: state.round + 1, phase: "planning" };
}

function afterPlanner(
  state: CycleState,
  event: Extract<CycleEvent, { type: "planner" }>,
): CycleState {
  if (event.status === "BLOCKED") return { ...state, phase: "stopped", stop: "blocked" };
  if (event.status === "BACK_TO_DISCUSSION") return { ...state, phase: "backToDiscussion" };
  if (event.status !== "DONE" || !event.planValid) return failRound(state);
  return { ...state, phase: "reviewing" };
}

function afterReview(
  state: CycleState,
  event: Extract<CycleEvent, { type: "review" }>,
): CycleState {
  if (event.status === "APPROVED") return { ...state, phase: "approved" };
  if (event.status === "BACK_TO_DISCUSSION") return { ...state, phase: "backToDiscussion" };
  return failRound(state);
}

export function advance(state: CycleState, event: CycleEvent): CycleState {
  if (TERMINAL.includes(state.phase)) return state;
  if (event.type === "codeCheckFailed") return failRound(state);
  if (event.type === "planner" && state.phase === "planning") return afterPlanner(state, event);
  if (event.type === "review" && state.phase === "reviewing") return afterReview(state, event);
  return state;
}
