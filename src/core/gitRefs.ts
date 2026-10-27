import { slug } from "./state.ts";

const TITLE_LIMIT = 40;

export interface GitArgsOptions {
  hooksDir?: string;
  unsigned?: boolean;
}

export interface BranchHead {
  branch: string;
  head: string;
}

export interface RestorePoint extends BranchHead {
  ref: string;
  commit: string;
  tree: string;
  indexTree: string;
}

export type BranchHeadCheck = { ok: true } | { ok: false; reason: string };

const pad = (n: number): string => String(n).padStart(2, "0");

export function createCycleId(date: Date, title: string): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${day}-${time}-${slug(title).slice(0, TITLE_LIMIT).replace(/-+$/, "")}`;
}

export const cycleBranch = (cycleId: string): string => `ryker/${cycleId}`;
export const attemptBranch = (cycleId: string, attempt: number): string =>
  `${cycleBranch(cycleId)}-tentativa-${attempt}`;
export const stopBranch = (cycleId: string, attempt: number, stop: number): string =>
  `${attemptBranch(cycleId, attempt)}-parada-${stop}`;
export const userBranch = (cycleId: string, n: number): string =>
  `${cycleBranch(cycleId)}-usuario-${n}`;
export const squashBranch = (cycleId: string): string => `${cycleBranch(cycleId)}-squash`;

export const restorePointRef = (cycleId: string, label: string): string =>
  `refs/ryker/${cycleId}/${label}`;

export function gitArgs(args: readonly string[], options: GitArgsOptions = {}): string[] {
  const config = ["core.fsmonitor=false"];
  if (options.hooksDir !== undefined) config.push(`core.hooksPath=${options.hooksDir}`);
  if (options.unsigned) config.push("commit.gpgsign=false");
  return [...config.flatMap((entry) => ["-c", entry]), ...args];
}

export function checkBranchAndHead(expected: BranchHead, actual: BranchHead): BranchHeadCheck {
  if (expected.branch !== actual.branch) {
    return { ok: false, reason: `branch is ${actual.branch}, expected ${expected.branch}` };
  }
  if (expected.head !== actual.head) {
    return { ok: false, reason: `HEAD is ${actual.head}, expected ${expected.head}` };
  }
  return { ok: true };
}
