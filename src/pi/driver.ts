import { parseAgentStatus } from "../core/agentStatus.ts";
import {
  buildManifest,
  diffManifests,
  evaluateControlChange,
  type Manifest,
} from "../core/controlFiles.ts";
import { planHeadings } from "../core/coverage.ts";
import { advance, type CycleEvent } from "../core/cycle.ts";
import type { CycleConfig } from "../core/cycleConfig.ts";
import {
  agentChangeNote,
  leaseLostNote,
  leftoverProcessesNote,
  outsideChangeNote,
  stageSummary,
} from "../core/cycleMessages.ts";
import {
  type AgentRole,
  executionDir,
  planPath,
  progressPath,
  reviewPath,
  templatePath,
} from "../core/cyclePaths.ts";
import type { CycleRecord } from "../core/cycleRecord.ts";
import { missingCoverage, parseReview } from "../core/findings.ts";
import { validatePlan } from "../core/plan.ts";
import {
  buildPlannerPrompt,
  buildReviewerPrompt,
  PLAN_TEMPLATE,
  REVIEW_TEMPLATE,
  STAGE_CHECKS,
} from "../core/prompts.ts";
import { addUsage } from "../core/tokens.ts";
import type { AgentRunResult } from "./agent.ts";
import type { Lease } from "./lease.ts";

export type ControlSnapshot = Record<string, string>;

export interface DriverPorts {
  cycleDir: string;
  config: CycleConfig;
  inputFiles: string[];
  files: {
    read(path: string): string | undefined;
    write(path: string, text: string): void;
    ensureDir(path: string): void;
  };
  control: {
    snapshot(extraPaths: readonly string[]): ControlSnapshot;
    restore(before: ControlSnapshot, after: ControlSnapshot): void;
  };
  runAgent(
    role: AgentRole,
    prompt: string,
    dir: string,
    progress: string,
    signal: AbortSignal,
  ): Promise<AgentRunResult>;
  modelLabel(role: AgentRole): string;
  lease: Lease;
  saveRecord(record: CycleRecord): void;
  showView(record: CycleRecord): void;
  notify(message: string, level: "info" | "warning" | "error"): void;
  announce(summary: string): void;
  onClosed(record: CycleRecord): void;
}

export interface StageDriver {
  record(): CycleRecord;
  isExecuting(): boolean;
  run(): Promise<void>;
  stop(): void;
  requestPause(): void;
  resume(): Promise<{ ok: true } | { ok: false; reason: string }>;
  leaseLost(): void;
}

type StepOutcome = "continue" | "interrupted" | "halted";

export function createStageDriver(initial: CycleRecord, ports: DriverPorts): StageDriver {
  let record = initial;
  let executing = false;
  let looping = false;
  let pauseRequested = false;
  let lost = false;
  let controller: AbortController | undefined;
  let lastManifest: Manifest | undefined;
  let lastSnapshot: ControlSnapshot | undefined;
  const language = ports.config.language ?? record.language;
  const noticeLanguage = language;

  const refreshBaseline = (): void => {
    lastSnapshot = ports.control.snapshot([]);
    lastManifest = buildManifest(lastSnapshot);
  };

  const halt = (): void => {
    lost = true;
    ports.notify(leaseLostNote(noticeLanguage), "warning");
  };

  const commit = (next: CycleRecord): boolean => {
    if (lost || !ports.lease.epochStillMine()) {
      if (!lost) halt();
      return false;
    }
    record = next;
    ports.saveRecord(record);
    ports.showView(record);
    refreshBaseline();
    return true;
  };

  const enterPause = (note?: string): void => {
    const phase = record.cycle.phase === "reviewing" ? "planning" : record.cycle.phase;
    commit({
      ...record,
      runState: "paused",
      cycle: { ...record.cycle, phase },
      ...(note ? { note } : {}),
    });
    if (note) ports.notify(note, "warning");
  };

  const closeCycle = (closed: "stageNotBuilt" | "backToDiscussion"): void => {
    if (!commit({ ...record, closed })) return;
    ports.announce(stageSummary(record));
    ports.onClosed(record);
  };

  const stopCycle = (): void => {
    if (!commit({ ...record, runState: "paused" })) return;
    ports.announce(stageSummary(record));
    ports.notify(stageSummary(record), "warning");
  };

  const applyEvent = (event: CycleEvent): void => {
    const cycle = advance(record.cycle, event);
    if (!commit({ ...record, cycle })) return;
    if (cycle.phase === "approved") closeCycle("stageNotBuilt");
    else if (cycle.phase === "backToDiscussion") closeCycle("backToDiscussion");
    else if (cycle.phase === "stopped") stopCycle();
  };

  const recordUsage = (role: AgentRole, result: AgentRunResult): void => {
    const tokens = addUsage(record.tokens, {
      stage: record.cycle.stage,
      model: ports.modelLabel(role),
      ...result.usage,
    });
    record = { ...record, tokens };
  };

  const execute = async (
    role: AgentRole,
    prompt: (dir: string) => string,
    extraControl: readonly string[],
  ): Promise<{ result: AgentRunResult; dir: string; failedByCheck: boolean } | "outside"> => {
    const dir = executionDir(ports.cycleDir, {
      attempt: record.attempt,
      stage: record.cycle.stage,
      round: record.cycle.round,
      role,
    });
    ports.files.ensureDir(dir);
    ports.files.write(templatePath(dir, "plan"), PLAN_TEMPLATE);
    ports.files.write(templatePath(dir, "review"), REVIEW_TEMPLATE);
    const before = ports.control.snapshot(extraControl);
    const outside = lastManifest
      ? diffManifests(lastManifest, buildManifest(ports.control.snapshot([])))
      : undefined;
    const outsideDecision = outside ? evaluateControlChange(outside, "outside") : undefined;
    if (outsideDecision?.action === "stop") {
      enterPause(outsideChangeNote(outsideDecision.paths, noticeLanguage));
      return "outside";
    }
    controller = new AbortController();
    executing = true;
    let result: AgentRunResult;
    try {
      result = await ports.runAgent(role, prompt(dir), dir, progressPath(dir), controller.signal);
    } finally {
      executing = false;
    }
    const after = ports.control.snapshot(extraControl);
    const decision = evaluateControlChange(
      diffManifests(buildManifest(before), buildManifest(after)),
      "agent",
    );
    let failedByCheck = false;
    if (decision.action === "restoreAndFail") {
      ports.control.restore(before, after);
      ports.notify(agentChangeNote(decision.paths, noticeLanguage), "warning");
      failedByCheck = true;
    }
    if (result.leftoverCommands > 0) {
      ports.notify(leftoverProcessesNote(result.leftoverCommands, noticeLanguage), "warning");
      failedByCheck = true;
    }
    if (result.error && !result.aborted) {
      ports.notify(result.error, "error");
      failedByCheck = true;
    }
    recordUsage(role, result);
    return { result, dir, failedByCheck };
  };

  const commonValues = (dir: string) => ({
    language: language ?? "en",
    files: ports.inputFiles.join(", "),
    progressPath: progressPath(dir),
    ...(ports.config.vaultPath ? { vaultPath: ports.config.vaultPath } : {}),
  });

  const planningStep = async (): Promise<StepOutcome> => {
    const planFile = planPath(ports.cycleDir);
    const run = await execute(
      "planner",
      (dir) =>
        buildPlannerPrompt({
          ...commonValues(dir),
          planPath: planFile,
          templatePath: templatePath(dir, "plan"),
        }),
      [],
    );
    if (run === "outside") return "halted";
    if (run.result.aborted) return "interrupted";
    if (run.failedByCheck) {
      applyEvent({ type: "codeCheckFailed" });
      return "continue";
    }
    const planText = ports.files.read(planFile);
    const planValid =
      planText !== undefined && validatePlan(planText, { owners: ports.config.owners }).ok;
    applyEvent({ type: "planner", status: plannerStatus(run.result.text), planValid });
    return "continue";
  };

  const reviewingStep = async (): Promise<StepOutcome> => {
    const planFile = planPath(ports.cycleDir);
    const run = await execute(
      "reviewer",
      (dir) =>
        buildReviewerPrompt({
          language: language ?? "en",
          stage: record.cycle.stage,
          round: record.cycle.round,
          files: [planFile, ...ports.inputFiles].join(", "),
          stageExtras: "the plan and the cycle configuration",
          stageChecks: STAGE_CHECKS[2],
          progressPath: progressPath(dir),
          reviewPath: reviewPath(dir),
          templatePath: templatePath(dir, "review"),
          ...(ports.config.vaultPath ? { vaultPath: ports.config.vaultPath } : {}),
        }),
      [planFile],
    );
    if (run === "outside") return "halted";
    if (run.result.aborted) return "interrupted";
    if (run.failedByCheck) {
      applyEvent({ type: "codeCheckFailed" });
      return "continue";
    }
    const planText = ports.files.read(planFile) ?? "";
    const coverageMissing = missingCoverage(
      ports.files.read(progressPath(run.dir)) ?? "",
      planHeadings(planText),
    );
    const parsed = parseReview(ports.files.read(reviewPath(run.dir)) ?? "", {
      producers: [],
      coverageMissing,
    });
    applyEvent({ type: "review", status: parsed.status });
    return "continue";
  };

  const isActivePhase = (): boolean =>
    record.cycle.phase === "planning" || record.cycle.phase === "reviewing";

  const run = async (): Promise<void> => {
    if (looping || lost || record.closed) return;
    looping = true;
    try {
      if (!commit({ ...record, runState: "running" })) return;
      while (isActivePhase() && !lost) {
        if (pauseRequested) {
          pauseRequested = false;
          enterPause();
          return;
        }
        if (!ports.lease.epochStillMine()) return halt();
        const outcome =
          record.cycle.phase === "planning" ? await planningStep() : await reviewingStep();
        if (outcome === "interrupted") {
          if (!lost) enterPause();
          return;
        }
        if (outcome === "halted") return;
      }
    } finally {
      looping = false;
    }
  };

  return {
    record: () => record,
    isExecuting: () => executing,
    run,
    stop: () => controller?.abort(),
    requestPause: () => {
      pauseRequested = true;
    },
    leaseLost: () => {
      if (lost) return;
      controller?.abort();
      halt();
    },
    resume: async () => {
      if (record.closed) return { ok: false, reason: "the cycle is already closed" };
      if (record.runState !== "paused") return { ok: false, reason: "the cycle is not paused" };
      if (record.cycle.phase === "stopped") {
        return { ok: false, reason: "the cycle stopped; only the user can decide what comes next" };
      }
      void run();
      return { ok: true };
    },
  };
}

function plannerStatus(text: string): "DONE" | "BACK_TO_DISCUSSION" | "BLOCKED" | undefined {
  const status = parseAgentStatus(text);
  return status === "DONE" || status === "BACK_TO_DISCUSSION" || status === "BLOCKED"
    ? status
    : undefined;
}
