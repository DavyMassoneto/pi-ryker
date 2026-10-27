import { MAX_ROUNDS } from "./cycle.ts";
import { commandReply, exitsText, newDiscussionHint, planLine, stopHint } from "./cycleMessages.ts";
import type { CycleRecord } from "./cycleRecord.ts";
import {
  formatTokens,
  readerStatusLine,
  type StageRow,
  statusLine,
  TOTAL_STAGES,
  widgetLines,
} from "./cycleStatus.ts";
import { isPortuguese } from "./i18n.ts";
import { grandTotal, totalsByStage } from "./tokens.ts";

const STAGE_NAMES = {
  pt: ["Discussão", "Planejamento", "Testes RED", "Implementação", "Revisão + E2E", "Entrega"],
  en: ["Discussion", "Planning", "RED tests", "Implementation", "Review + E2E", "Delivery"],
} as const;

export const stageName = (stage: number, language?: string): string =>
  STAGE_NAMES[isPortuguese(language) ? "pt" : "en"][stage - 1] ?? "";

function stageTwoRow(record: CycleRecord): StageRow {
  const pt = isPortuguese(record.language);
  const tokens = totalsByStage(record.tokens).get(2)?.total ?? 0;
  const spent = tokens > 0 ? ` · ${formatTokens(tokens, record.language)}` : "";
  const round = `${pt ? "rodada" : "round"} ${record.cycle.round}`;
  if (record.cycle.phase === "approved") {
    return { status: "done", detail: `${round} ${pt ? "aprovada" : "approved"}${spent}` };
  }
  if (record.cycle.phase === "stopped") {
    return { status: "current", detail: `${pt ? "parada" : "stopped"}${spent}` };
  }
  if (record.cycle.phase === "backToDiscussion") {
    return { status: "current", detail: pt ? "volta à Discussão" : "back to Discussion" };
  }
  return { status: "current", detail: `${round}${spent}` };
}

const CLOSURE_LABELS = {
  stageNotBuilt: { pt: "etapa 3 indisponível", en: "stage 3 not available" },
  backToDiscussion: { pt: "voltou à Discussão", en: "back to Discussion" },
  ended: { pt: "encerrado", en: "ended" },
} as const;

const closureLabel = (record: CycleRecord): string | undefined =>
  record.closed
    ? CLOSURE_LABELS[record.closed][isPortuguese(record.language) ? "pt" : "en"]
    : undefined;

export function ownerStatus(record: CycleRecord): string {
  const outcome = closureLabel(record);
  return statusLine({
    stage: record.cycle.stage,
    stageName: stageName(record.cycle.stage, record.language),
    round: record.cycle.round,
    maxRounds: MAX_ROUNDS,
    tokens: grandTotal(record.tokens),
    ...(outcome ? { outcome } : {}),
    ...(record.language ? { language: record.language } : {}),
  });
}

export function readerStatus(record: CycleRecord): string {
  return readerStatusLine({
    stage: record.cycle.stage,
    stageName: stageName(record.cycle.stage, record.language),
    ...(record.language ? { language: record.language } : {}),
  });
}

export function ownerWidget(record: CycleRecord): string[] {
  const pt = isPortuguese(record.language);
  const rows: StageRow[] = Array.from({ length: TOTAL_STAGES }, (_, index) => {
    if (index === 0) return { status: "done", detail: pt ? "aprovada" : "approved" };
    if (index === 1) return stageTwoRow(record);
    return { status: "pending" };
  });
  const stateLabel = closureLabel(record);
  const lines = widgetLines({
    cycleId: record.cycleId,
    repositories: record.directories.length,
    state: record.runState,
    ...(stateLabel ? { stateLabel } : {}),
    stages: rows,
    ...(record.language ? { language: record.language } : {}),
  });
  return record.runState === "running" ? [...lines, stopHint(record.language)] : lines;
}

export function cycleReport(
  record: CycleRecord,
  role: "owner" | "reader" | "none",
  planFile?: string,
): string {
  const lines = ownerWidget(record);
  if (planFile && record.cycle.phase === "approved")
    lines.push(planLine(planFile, record.language));
  if (role === "reader") {
    lines.push(readerStatus(record), commandReply("readerOnly", record.language));
  } else if (record.closed) {
    lines.push(newDiscussionHint(record.language));
  } else if (record.runState !== "running") {
    lines.push(exitsText(record.language));
  }
  return lines.join("\n");
}
