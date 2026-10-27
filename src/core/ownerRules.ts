import { abilities, type RunState } from "./cycleStates.ts";
import type { SessionRole } from "./session.ts";
import { checkOwnerSessionShell, checkOwnerSessionTool, type ShellContext } from "./shielding.ts";
import { isShellTool, isWriteTool, stringInput, type ToolCallView } from "./toolCalls.ts";

export interface OwnerRulesContext {
  runState: RunState;
  role: SessionRole;
  shell: ShellContext;
}

export type OwnerDecision = { block: false } | { block: true; reason: string };

const pass: OwnerDecision = { block: false };

export function decideProjectSessionCall(
  call: ToolCallView,
  ctx: OwnerRulesContext,
): OwnerDecision {
  if (ctx.role === "none") return pass;
  const tool = checkOwnerSessionTool(call.toolName);
  if (!tool.ok) return { block: true, reason: `${tool.rule}: ${tool.reason}` };
  if (isShellTool(call.toolName)) {
    const shell = checkOwnerSessionShell(stringInput(call, "command") ?? "", ctx.shell);
    if (!shell.ok) return { block: true, reason: `${shell.rule}: ${shell.reason}` };
  }
  if (isWriteTool(call.toolName) && !abilities(ctx.runState, ctx.role).editAllowed) {
    return {
      block: true,
      reason: "U18.16: editing is refused while a Ryker cycle is running; /ryker parar first",
    };
  }
  return pass;
}
