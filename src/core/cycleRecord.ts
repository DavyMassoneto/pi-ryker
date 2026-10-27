import type { CycleState } from "./cycle.ts";
import { startCycle } from "./cycle.ts";
import type { RunState } from "./cycleStates.ts";
import type { RestorePoint } from "./gitRefs.ts";
import type { Usage } from "./tokens.ts";

export type CycleClosure = "stageNotBuilt" | "backToDiscussion" | "ended";

export interface CycleRecord {
  version: 1;
  cycleId: string;
  ownerSession: string;
  epoch: number;
  runState: RunState;
  cycle: CycleState;
  tokens: Usage[];
  directories: string[];
  attempt: number;
  language?: string;
  note?: string;
  closed?: CycleClosure;
  finalBranch?: string;
  execution?: { restorePoint: RestorePoint };
  cancelQuestion?: boolean;
  acceptOutside?: boolean;
}

export interface NewRecordParams {
  cycleId: string;
  ownerSession: string;
  epoch: number;
  directories: string[];
  language?: string;
  finalBranch?: string;
}

export function newCycleRecord(p: NewRecordParams): CycleRecord {
  return {
    version: 1,
    cycleId: p.cycleId,
    ownerSession: p.ownerSession,
    epoch: p.epoch,
    runState: "running",
    cycle: startCycle(),
    tokens: [],
    directories: p.directories,
    attempt: 1,
    ...(p.language ? { language: p.language } : {}),
    ...(p.finalBranch ? { finalBranch: p.finalBranch } : {}),
  };
}

export function serializeCycleRecord(record: CycleRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function parseCycleRecord(text: string): CycleRecord | undefined {
  try {
    const raw = JSON.parse(text) as Partial<CycleRecord>;
    const valid =
      raw.version === 1 &&
      typeof raw.cycleId === "string" &&
      typeof raw.ownerSession === "string" &&
      typeof raw.epoch === "number" &&
      typeof raw.runState === "string" &&
      typeof raw.cycle?.stage === "number" &&
      Array.isArray(raw.tokens) &&
      Array.isArray(raw.directories);
    return valid ? (raw as CycleRecord) : undefined;
  } catch {
    return undefined;
  }
}
