import { MAX_ROUNDS } from "./cycle.ts";
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

export function ownerStatus(record: CycleRecord): string {
  return statusLine({
    stage: record.cycle.stage,
    stageName: stageName(record.cycle.stage, record.language),
    round: record.cycle.round,
    maxRounds: MAX_ROUNDS,
    tokens: grandTotal(record.tokens),
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
  return widgetLines({
    cycleId: record.cycleId,
    repositories: record.directories.length,
    state: record.runState,
    stages: rows,
    ...(record.language ? { language: record.language } : {}),
  });
}
