import type { SessionRole } from "./session.ts";

export type RunState = "running" | "paused" | "awaitingApproval";
export type CycleCommand =
  | "status"
  | "takeover"
  | "stop"
  | "pause"
  | "resume"
  | "back"
  | "end"
  | "off"
  | "approve";

export interface Abilities {
  editAllowed: boolean;
  memoryWriteAllowed: boolean;
  neutralizeSkills: boolean;
  remoteGitAllowed: boolean;
  piWebAllowed: boolean;
  subagentAllowed: boolean;
  commands: CycleCommand[];
}

export type CommandDecision = { ok: true; deferred: boolean } | { ok: false; reason: string };

const OWNER_COMMANDS: Record<RunState, CycleCommand[]> = {
  running: ["status", "stop", "pause"],
  paused: ["status", "resume", "back", "end", "off"],
  awaitingApproval: ["status", "pause", "approve"],
};

const READER_COMMANDS: CycleCommand[] = ["status", "takeover"];
const REFUSED_WHILE_EXECUTING: CycleCommand[] = ["back", "end", "off"];

export function abilities(state: RunState, role: SessionRole): Abilities {
  const running = state === "running";
  return {
    editAllowed: !running,
    memoryWriteAllowed: !(running && role === "owner"),
    neutralizeSkills: running,
    remoteGitAllowed: false,
    piWebAllowed: false,
    subagentAllowed: false,
    commands: role === "owner" ? [...OWNER_COMMANDS[state]] : [...READER_COMMANDS],
  };
}

export function commandDecision(
  state: RunState,
  role: SessionRole,
  command: CycleCommand,
  executing: boolean,
): CommandDecision {
  if (!abilities(state, role).commands.includes(command)) {
    return { ok: false, reason: `command ${command} is not accepted while ${state}` };
  }
  if (executing && REFUSED_WHILE_EXECUTING.includes(command)) {
    return {
      ok: false,
      reason: `command ${command} is refused during an execution; stop it first`,
    };
  }
  return { ok: true, deferred: command === "pause" && executing };
}
