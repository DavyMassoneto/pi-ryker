import { basename, dirname, join } from "node:path";
import { hashContent } from "./controlFiles.ts";

export type AgentRole = "planner" | "reviewer";

const HASH_LENGTH = 8;
const pad = (n: number, width: number): string => String(n).padStart(width, "0");

export const projectKey = (gitRoot: string): string =>
  `${basename(gitRoot)}-${hashContent(gitRoot).slice(0, HASH_LENGTH)}`;

export const projectHistoryDir = (agentDir: string, gitRoot: string): string =>
  join(agentDir, "ryker", "history", projectKey(gitRoot));

export const cycleHistoryDir = (agentDir: string, gitRoot: string, cycleId: string): string =>
  join(projectHistoryDir(agentDir, gitRoot), cycleId);

export const openCyclesIndexPath = (agentDir: string): string =>
  join(agentDir, "ryker", "ciclos-abertos.json");

export const projectRykerDir = (directory: string): string => join(directory, ".pi", "ryker");
export const configPath = (directory: string): string =>
  join(projectRykerDir(directory), "config.json");
export const cycleRecordPath = (directory: string): string =>
  join(projectRykerDir(directory), "ciclo.json");
export const planPath = (cycleDir: string): string => join(cycleDir, "plano.md");

export const codeCheckFeedbackPath = (cycleDir: string): string =>
  join(cycleDir, "verificacao-codigo.md");

export interface ExecutionAddress {
  attempt: number;
  stage: number;
  round: number;
  role: AgentRole;
}

const executionSegments = (a: ExecutionAddress): string[] => [
  `tentativa-${pad(a.attempt, 3)}`,
  `etapa-${a.stage}`,
  `rodada-${pad(a.round, 3)}`,
  `${a.role}-01`,
];

export const executionDir = (cycleDir: string, a: ExecutionAddress): string =>
  join(cycleDir, ...executionSegments(a));

export const executionLabel = (a: ExecutionAddress): string => executionSegments(a).join("/");

export const stageDir = (cycleDir: string, attempt: number, stage: number): string =>
  join(cycleDir, `tentativa-${pad(attempt, 3)}`, `etapa-${stage}`);

export const stageDirOfExecution = (dir: string): string => dirname(dirname(dir));

export const progressPath = (dir: string): string => join(dir, "progresso.md");
export const reviewPath = (dir: string): string => join(dir, "revisao.md");
export const templatePath = (dir: string, name: "plan" | "review"): string =>
  join(dir, `${name}-template.md`);

export function gitControlPaths(gitRoot: string, hookAndInfoFiles: readonly string[]): string[] {
  return [join(gitRoot, ".git", "config"), ...hookAndInfoFiles];
}
