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
  takeOverCycle,
} from "./cycleHost.ts";
import { projectSessionView } from "./projectSession.ts";

export const CYCLE_SUBCOMMANDS: Readonly<Record<string, CycleCommand>> = {
  parar: "stop",
  pausar: "pause",
  retomar: "resume",
  voltar: "back",
  encerrar: "end",
};

export const UNAVAILABLE_SUBCOMMANDS: readonly string[] = ["desligar", "aprovar"];

export const isCycleSubcommand = (word: string): boolean =>
  word in CYCLE_SUBCOMMANDS || UNAVAILABLE_SUBCOMMANDS.includes(word);

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
  if (command === "back" || command === "end") {
    const left = command === "back" ? driver.back() : driver.end();
    const done = command === "back" ? "backToDiscussion" : "ended";
    return left.ok ? commandReply(done, language) : left.reason;
  }
  const resumed = await driver.resume();
  return resumed.ok ? commandReply("resumed", language) : resumed.reason;
}

async function takeOver(
  ctx: ExtensionContext,
  messenger: HostMessenger,
  deps: HostDeps,
): Promise<string> {
  const taken = await takeOverCycle(messenger, ctx, deps);
  if (!taken.ok) return taken.message;
  const resumed = await taken.handle.driver.resume();
  return resumed.ok
    ? commandReply("tookOver", taken.handle.driver.record().language)
    : resumed.reason;
}

export async function runCycleCommand(
  subcommand: string,
  ctx: ExtensionContext,
  messenger: HostMessenger,
  deps: HostDeps = defaultHostDeps(),
): Promise<string> {
  const command = CYCLE_SUBCOMMANDS[subcommand];
  if (!command) return commandReply("notAvailable");
  const sessionId = ctx.sessionManager.getSessionId();
  const handle = cycleHandles.get(sessionId) ?? attachExistingCycle(messenger, ctx, deps);
  if (!handle) {
    const view = projectSessionView(ctx.cwd, sessionId, deps.agentDir);
    if (view.role === "reader" && command === "resume") return takeOver(ctx, messenger, deps);
    return commandReply(view.role === "reader" ? "readerOnly" : "noCycle", view.record?.language);
  }
  const record = handle.driver.record();
  const decision = commandDecision(record.runState, "owner", command, handle.driver.isExecuting());
  if (!decision.ok) return decision.reason;
  return apply(command, handle);
}
