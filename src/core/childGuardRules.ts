import { isAbsolute, relative, resolve } from "node:path";
import { canWrite, type WritePolicy } from "./policy.ts";
import { checkAgentShell, type ShellContext } from "./shielding.ts";
import {
  isReadTool,
  isShellTool,
  isWriteTool,
  stringInput,
  type ToolCallView,
} from "./toolCalls.ts";

export interface ChildGuardContext {
  epochStillMine: boolean;
  policy: WritePolicy;
  shell: ShellContext;
}

export type ChildDecision = { allow: true } | { allow: false; reason: string };

const allow: ChildDecision = { allow: true };
const refuse = (reason: string): ChildDecision => ({ allow: false, reason });

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function decideRead(call: ToolCallView, ctx: ChildGuardContext): ChildDecision {
  const path = stringInput(call, "path");
  if (path === undefined) return allow;
  const target = resolve(ctx.shell.projectRoot, path);
  const roots = [ctx.shell.projectRoot, ...ctx.shell.allowedRoots];
  if (roots.some((root) => inside(root, target))) return allow;
  return refuse(`SUP-46: ${path} is outside the project and the declared folders`);
}

function decideWrite(call: ToolCallView, ctx: ChildGuardContext): ChildDecision {
  const path = stringInput(call, "path");
  if (path === undefined) return refuse("a write without a path is refused");
  const decision = canWrite(ctx.policy, resolve(ctx.shell.projectRoot, path));
  return decision.ok ? allow : refuse(decision.reason);
}

function decideShell(call: ToolCallView, ctx: ChildGuardContext): ChildDecision {
  const command = stringInput(call, "command");
  if (command === undefined) return refuse("a shell call without a command is refused");
  const decision = checkAgentShell(command, ctx.shell);
  return decision.ok ? allow : refuse(`${decision.rule}: ${decision.reason}`);
}

export function decideChildCall(call: ToolCallView, ctx: ChildGuardContext): ChildDecision {
  if (!ctx.epochStillMine) return refuse("r2-N7: this cycle no longer belongs to this driver");
  if (isWriteTool(call.toolName)) return decideWrite(call, ctx);
  if (isShellTool(call.toolName)) return decideShell(call, ctx);
  if (isReadTool(call.toolName)) return decideRead(call, ctx);
  return refuse(`the tool ${call.toolName} is not available to Ryker agents`);
}
