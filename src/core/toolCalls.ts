export interface ToolCallView {
  toolName: string;
  input: Record<string, unknown>;
}

export const SHELL_TOOLS = ["bash", "powershell"] as const;
export const WRITE_TOOLS = ["write", "edit"] as const;
export const READ_TOOLS = ["read", "grep", "find", "ls"] as const;

const isOneOf = (list: readonly string[], name: string): boolean => list.includes(name);

export const isShellTool = (name: string): boolean => isOneOf(SHELL_TOOLS, name);
export const isWriteTool = (name: string): boolean => isOneOf(WRITE_TOOLS, name);
export const isReadTool = (name: string): boolean => isOneOf(READ_TOOLS, name);

export function stringInput(call: ToolCallView, key: string): string | undefined {
  const value = call.input[key];
  return typeof value === "string" ? value : undefined;
}
