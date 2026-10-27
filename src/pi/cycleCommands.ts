import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { commandReply } from "../core/cycleMessages.ts";
import { type CycleCommand, commandDecision } from "../core/cycleStates.ts";
import {
  attachExistingCycle,
  type CycleHandle,
  cycleHandles,
  defaultHostDeps,
  type HostDeps,
  type HostMessenger,
} from "./cycleHost.ts";
import { projectSessionView } from "./projectSession.ts";

export const CYCLE_SUBCOMMANDS: Readonly<Record<string, CycleCommand>> = {
  parar: "stop",
  pausar: "pause",
  retomar: "resume",
};

export const isCycleSubcommand = (word: string): boolean => word in CYCLE_SUBCOMMANDS;

async function apply(command: CycleCommand, handle: CycleHandle): Promise<string> {
  const driver = handle.driver;
  const language = driver.record().language;
  if (command === "stop") {
    driver.stop();
    return commandReply("stopping", language);
  }
  if (command === "pause") {
    driver.requestPause();
    return commandReply("pauseDeferred", language);
  }
  const resumed = await driver.resume();
  return resumed.ok ? commandReply("resumed", language) : resumed.reason;
}

export async function runCycleCommand(
  subcommand: string,
  ctx: ExtensionContext,
  messenger: HostMessenger,
  deps: HostDeps = defaultHostDeps(),
): Promise<string> {
  const command = CYCLE_SUBCOMMANDS[subcommand];
  const sessionId = ctx.sessionManager.getSessionId();
  const handle = cycleHandles.get(sessionId) ?? attachExistingCycle(messenger, ctx, deps);
  if (!handle || !command) {
    const view = projectSessionView(ctx.cwd, sessionId, deps.agentDir);
    return commandReply(view.role === "reader" ? "readerOnly" : "noCycle", view.record?.language);
  }
  const record = handle.driver.record();
  const decision = commandDecision(record.runState, "owner", command, handle.driver.isExecuting());
  if (!decision.ok) return decision.reason;
  return apply(command, handle);
}
