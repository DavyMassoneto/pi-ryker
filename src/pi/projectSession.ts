import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseCycleConfig } from "../core/cycleConfig.ts";
import { configPath, cycleRecordPath, openCyclesIndexPath } from "../core/cyclePaths.ts";
import { type CycleRecord, parseCycleRecord } from "../core/cycleRecord.ts";
import { ownerStatus, readerStatus } from "../core/cycleView.ts";
import { withoutNeutralizedSkills } from "../core/neutralization.ts";
import { cyclesTouching } from "../core/openCycles.ts";
import { decideProjectSessionCall } from "../core/ownerRules.ts";
import { buildOwnerNotice } from "../core/prompts.ts";
import type { SessionRole } from "../core/session.ts";
import { createSessionRegistry } from "../core/sessionRegistry.ts";
import type { ShellContext } from "../core/shielding.ts";
import { readRunningPiWebs } from "./childGuard.ts";
import {
  attachExistingCycle,
  cycleHandles,
  defaultHostDeps,
  type HostDeps,
  projectHistory,
} from "./cycleHost.ts";
import { readGitAliases, readOpenCycles, readText } from "./fsAdapters.ts";
import { migrateLegacyFolder } from "./persistence.ts";

export const CYCLE_PROMPT_SECTION = "ryker_ciclo";
export const READER_STATUS_KEY = "ryker-leitor";
export const READER_REFRESH_MS = 15_000;
const SHUTDOWN_WAIT_MS = 4000;

export interface ProjectSessionView {
  role: SessionRole;
  record?: CycleRecord;
}

export function projectSessionView(
  cwd: string,
  sessionId: string,
  agentDir: string,
): ProjectSessionView {
  const handle = cycleHandles.get(sessionId);
  if (handle) return { role: "owner", record: handle.driver.record() };
  const touching = cyclesTouching(readOpenCycles(openCyclesIndexPath(agentDir)), cwd).filter(
    (entry) => entry.ownerSession !== sessionId,
  );
  const foreign = touching[0];
  if (!foreign) {
    const own = readText(cycleRecordPath(cwd));
    const ownRecord = own === undefined ? undefined : parseCycleRecord(own);
    return { role: "none", ...(ownRecord ? { record: ownRecord } : {}) };
  }
  const text = readText(cycleRecordPath(foreign.directories[0] ?? cwd));
  const record = text === undefined ? undefined : parseCycleRecord(text);
  return { role: "reader", ...(record ? { record } : {}) };
}

function shellContext(cwd: string): ShellContext {
  const config = readText(configPath(cwd));
  const parsed = config === undefined ? undefined : parseCycleConfig(config);
  return {
    projectRoot: cwd,
    allowedRoots: [],
    homeDir: homedir(),
    piWeb: parsed?.ok ? parsed.config.piWeb : undefined,
    piWebRuns: readRunningPiWebs(),
    gitAliases: readGitAliases(cwd),
  };
}

export function registerProjectSession(pi: ExtensionAPI, deps: HostDeps = defaultHostDeps()): void {
  const readerTimers = createSessionRegistry<NodeJS.Timeout>();

  const refreshReader = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    const view = projectSessionView(ctx.cwd, ctx.sessionManager.getSessionId(), deps.agentDir);
    const shown =
      view.role === "reader" && view.record
        ? readerStatus(view.record)
        : view.role === "none" && view.record
          ? ownerStatus(view.record)
          : undefined;
    ctx.ui.setStatus(READER_STATUS_KEY, shown);
  };

  pi.on("session_start", async (_event, ctx) => {
    try {
      migrateLegacyFolder(ctx.cwd, projectHistory(ctx.cwd, deps.agentDir));
    } catch {}
    attachExistingCycle(pi, ctx, deps);
    refreshReader(ctx);
    const sessionId = ctx.sessionManager.getSessionId();
    if (!ctx.hasUI || readerTimers.has(sessionId)) return;
    const timer = setInterval(() => {
      try {
        refreshReader(ctx);
      } catch {}
    }, READER_REFRESH_MS);
    timer.unref();
    readerTimers.set(sessionId, timer);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const timer = readerTimers.get(sessionId);
    if (timer) clearInterval(timer);
    readerTimers.delete(sessionId);
    const handle = cycleHandles.get(sessionId);
    if (!handle) return;
    await Promise.race([
      handle.shutdown(),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS)),
    ]);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const view = projectSessionView(ctx.cwd, ctx.sessionManager.getSessionId(), deps.agentDir);
    if (view.role === "owner" && view.record?.runState === "running") {
      event.systemPromptOptions.sections[CYCLE_PROMPT_SECTION] = buildOwnerNotice();
      event.systemPromptOptions.skills = withoutNeutralizedSkills(event.systemPromptOptions.skills);
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    const view = projectSessionView(ctx.cwd, ctx.sessionManager.getSessionId(), deps.agentDir);
    if (view.role === "none") return;
    const decision = decideProjectSessionCall(
      { toolName: event.toolName, input: event.input as Record<string, unknown> },
      {
        runState: view.record?.runState ?? "running",
        role: view.role,
        shell: shellContext(ctx.cwd),
      },
    );
    if (decision.block) return { block: true, reason: decision.reason };
  });
}
