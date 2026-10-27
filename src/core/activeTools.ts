export const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;

export const RYKER_TOOLS = ["ryker_perguntar", "ryker_temas", "ryker_documento"] as const;

export const BLOCKED_TOOL = "ask_user_question";

export function stageToolSet(): string[] {
  return [...READ_ONLY_TOOLS, ...RYKER_TOOLS];
}

export function restoreToolSet(saved: readonly string[]): string[] {
  return [...saved];
}

export function withoutNativeQuestionTool(active: readonly string[]): string[] {
  return active.filter((t) => t !== BLOCKED_TOOL);
}
