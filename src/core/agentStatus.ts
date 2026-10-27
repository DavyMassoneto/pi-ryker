export type AgentStatus = "DONE" | "BACK_TO_DISCUSSION" | "BLOCKED" | "APPROVED" | "REJECTED";

const DEFAULT_ALLOWED: AgentStatus[] = ["DONE", "BACK_TO_DISCUSSION", "BLOCKED"];

export function parseAgentStatus(
  text: string,
  allowed: readonly AgentStatus[] = DEFAULT_ALLOWED,
): AgentStatus | undefined {
  const lines = text.trimEnd().split(/\r?\n/);
  const match = /^STATUS: ([A-Z_]+)$/.exec(lines[lines.length - 1] ?? "");
  const value = match?.[1] as AgentStatus | undefined;
  return value !== undefined && allowed.includes(value) ? value : undefined;
}
