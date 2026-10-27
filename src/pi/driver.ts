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
  workspaceChangeNote,
} from "../core/cycleMessages.ts";
import {
  type AgentRole,
  codeCheckFeedbackPath,
  executionDir,
  executionLabel,
  planPath,
  progressPath,
  reviewPath,
  templatePath,
} from "../core/cyclePaths.ts";
import type { CycleRecord } from "../core/cycleRecord.ts";
import { missingCoverage, parseReview } from "../core/findings.ts";
import type { RestorePoint } from "../core/gitRefs.ts";
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
export type CancelReason = "stuck" | "other";
export type WorkspaceCheck = { ok: true } | { ok: false; reason: string };

export interface WorkspacePort {
  capture(label: string): RestorePoint;
  verify(point: RestorePoint): WorkspaceCheck;
  restore(point: RestorePoint): void;
}

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
  workspace: WorkspacePort;
  askCancelReason(): Promise<CancelReason | undefined>;
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
  suspend(): void;
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
  let askAfterCancel = false;
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

  const withoutExecution = (from: CycleRecord): CycleRecord => {
    const { execution: _execution, ...rest } = from;
    return rest;
  };

  const enterPause = (extra: Partial<CycleRecord> = {}): void => {
    const phase = record.cycle.phase === "reviewing" ? "planning" : record.cycle.phase;
    commit({
      ...withoutExecution(record),
      runState: "paused",
      cycle: { ...record.cycle, phase },
      ...extra,
    });
    if (extra.note) ports.notify(extra.note, "warning");
  };

  const answerCancelQuestion = async (): Promise<boolean> => {
    const answer = await ports.askCancelReason();
    if (answer === undefined || lost) return false;
    const { cancelQuestion: _asked, ...answered } = record;
    if (answer === "other") return commit(answered);
    record = answered;
    applyEvent({ type: "codeCheckFailed" });
    return true;
  };

  const summary = (): string => stageSummary(record, planPath(ports.cycleDir));

  const closeCycle = (closed: "stageNotBuilt" | "backToDiscussion"): void => {
    if (!commit({ ...record, runState: "paused", closed })) return;
    ports.announce(summary());
    ports.onClosed(record);
  };

  const enterNextStage = (): void => closeCycle("stageNotBuilt");

  const stopCycle = (): void => {
    if (!commit({ ...record, runState: "paused" })) return;
    ports.announce(summary());
    ports.notify(summary(), "warning");
  };

  const applyEvent = (event: CycleEvent): void => {
    const cycle = advance(record.cycle, event);
    if (!commit({ ...record, cycle })) return;
    if (cycle.phase === "approved") enterNextStage();
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
  ): Promise<
    { result: AgentRunResult; dir: string; failedByCheck: boolean; notes: string[] } | "outside"
  > => {
    const notes: string[] = [];
    const warn = (message: string, level: "warning" | "error"): void => {
      notes.push(message);
      ports.notify(message, level);
    };
    const dir = executionDir(ports.cycleDir, {
      attempt: record.attempt,
      stage: record.cycle.stage,
      round: record.cycle.round,
      role,
    });
    ports.files.ensureDir(dir);
    ports.files.write(templatePath(dir, "plan"), PLAN_TEMPLATE);
    ports.files.write(templatePath(dir, "review"), REVIEW_TEMPLATE);
    const outside = lastManifest
      ? diffManifests(lastManifest, buildManifest(ports.control.snapshot([])))
      : undefined;
    const outsideDecision = outside ? evaluateControlChange(outside, "outside") : undefined;
    if (outsideDecision?.action === "stop") {
      enterPause({ note: outsideChangeNote(outsideDecision.paths, noticeLanguage) });
      return "outside";
    }
    const restorePoint = ports.workspace.capture(
      executionLabel({
        attempt: record.attempt,
        stage: record.cycle.stage,
        round: record.cycle.round,
        role,
      }),
    );
    if (!commit({ ...record, execution: { restorePoint } })) return "outside";
    const controlBefore = ports.control.snapshot(extraControl);
    controller = new AbortController();
    executing = true;
    let result: AgentRunResult;
    try {
      result = await ports.runAgent(role, prompt(dir), dir, progressPath(dir), controller.signal);
    } finally {
      executing = false;
    }
    if (lost || !ports.lease.epochStillMine()) {
      return { result: { ...result, aborted: true }, dir, failedByCheck: false, notes };
    }
    const after = ports.control.snapshot(extraControl);
    if (result.aborted) {
      ports.control.restore(controlBefore, after);
      ports.workspace.restore(restorePoint);
      record = withoutExecution(record);
      return { result, dir, failedByCheck: false, notes };
    }
    const decision = evaluateControlChange(
      diffManifests(buildManifest(controlBefore), buildManifest(after)),
      "agent",
    );
    let failedByCheck = false;
    const workspace = ports.workspace.verify(restorePoint);
    if (!workspace.ok) {
      ports.workspace.restore(restorePoint);
      warn(workspaceChangeNote(workspace.reason, noticeLanguage), "warning");
      failedByCheck = true;
    }
    if (decision.action === "restoreAndFail") {
      ports.control.restore(controlBefore, after);
      warn(agentChangeNote(decision.paths, noticeLanguage), "warning");
      failedByCheck = true;
    }
    if (result.leftoverCommands > 0) {
      warn(leftoverProcessesNote(result.leftoverCommands, noticeLanguage), "warning");
      failedByCheck = true;
    }
    if (result.error && !result.aborted) {
      warn(result.error, "error");
      failedByCheck = true;
    }
    record = withoutExecution(record);
    recordUsage(role, result);
    return { result, dir, failedByCheck, notes };
  };

  const recordFeedback = (lines: readonly string[]): void => {
    ports.files.write(
      codeCheckFeedbackPath(ports.cycleDir),
      lines.length === 0 ? "" : `# Code check findings\n${lines.map((l) => `- ${l}`).join("\n")}\n`,
    );
  };

  const plannerFiles = (): string[] => {
    const feedback = codeCheckFeedbackPath(ports.cycleDir);
    const hasFeedback = (ports.files.read(feedback) ?? "").trim() !== "";
    return hasFeedback ? [...ports.inputFiles, feedback] : ports.inputFiles;
  };

  const commonValues = (dir: string) => ({
    language: language ?? "en",
    files: plannerFiles().join(", "),
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
      recordFeedback(run.notes);
      applyEvent({ type: "codeCheckFailed" });
      return "continue";
    }
    const planText = ports.files.read(planFile);
    const checked =
      planText === undefined ? undefined : validatePlan(planText, { owners: ports.config.owners });
    const planValid = checked?.ok === true;
    recordFeedback(
      checked === undefined
        ? ["the plan file was not written"]
        : checked.ok
          ? []
          : checked.problems,
    );
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

  const isStopped = (): boolean => record.cycle.phase === "stopped";

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
          if (lost) return;
          const ask = askAfterCancel;
          askAfterCancel = false;
          enterPause(ask ? { cancelQuestion: true } : {});
          if (ask) await answerCancelQuestion();
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
    stop: () => {
      if (!executing) return;
      askAfterCancel = true;
      controller?.abort();
    },
    suspend: () => {
      askAfterCancel = false;
      controller?.abort();
    },
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
      if (isStopped()) {
        return { ok: false, reason: "the cycle stopped; only the user can decide what comes next" };
      }
      if (record.cancelQuestion && !(await answerCancelQuestion())) {
        return { ok: false, reason: "answer whether the cancelled execution was stuck first" };
      }
      if (isStopped()) return { ok: true };
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
