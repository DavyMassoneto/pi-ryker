export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type Thinking = (typeof THINKING_LEVELS)[number];

export interface ModelChoice {
  provider: string;
  id: string;
  thinking?: Thinking;
}

export interface PiWebAddress {
  hosts: string[];
  port: number;
}

export interface CycleConfig {
  language?: string;
  vaultPath?: string;
  allowedRoots: string[];
  owners: string[];
  piWeb?: PiWebAddress;
  planner?: ModelChoice;
  reviewer?: ModelChoice;
}

export type ConfigResult = { ok: true; config: CycleConfig } | { ok: false; problems: string[] };

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function parseModel(value: unknown, field: string, problems: string[]): ModelChoice | undefined {
  if (value === undefined) return undefined;
  const raw = value as Partial<ModelChoice>;
  if (typeof raw?.provider !== "string" || typeof raw.id !== "string") {
    problems.push(`${field} needs provider and id`);
    return undefined;
  }
  if (raw.thinking !== undefined && !THINKING_LEVELS.includes(raw.thinking)) {
    problems.push(`${field}.thinking is not a known level`);
    return undefined;
  }
  return {
    provider: raw.provider,
    id: raw.id,
    ...(raw.thinking ? { thinking: raw.thinking } : {}),
  };
}

function parsePiWeb(value: unknown, problems: string[]): PiWebAddress | undefined {
  if (value === undefined) return undefined;
  const raw = value as Partial<PiWebAddress>;
  if (!isStringList(raw?.hosts) || typeof raw.port !== "number") {
    problems.push("piWeb needs hosts (list of strings) and port (number)");
    return undefined;
  }
  return { hosts: raw.hosts, port: raw.port };
}

export function parseCycleConfig(text: string): ConfigResult {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, problems: [`config.json is not valid JSON: ${(e as Error).message}`] };
  }
  const problems: string[] = [];
  const allowedRoots = raw.allowedRoots ?? [];
  const owners = raw.owners ?? [];
  if (!isStringList(allowedRoots)) problems.push("allowedRoots must be a list of strings");
  if (!isStringList(owners)) problems.push("owners must be a list of strings");
  if (raw.vaultPath !== undefined && typeof raw.vaultPath !== "string") {
    problems.push("vaultPath must be a string");
  }
  if (raw.language !== undefined && typeof raw.language !== "string") {
    problems.push("language must be a string");
  }
  const planner = parseModel(raw.planner, "planner", problems);
  const reviewer = parseModel(raw.reviewer, "reviewer", problems);
  const piWeb = parsePiWeb(raw.piWeb, problems);
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: {
      ...(typeof raw.language === "string" ? { language: raw.language } : {}),
      ...(typeof raw.vaultPath === "string" ? { vaultPath: raw.vaultPath } : {}),
      allowedRoots: allowedRoots as string[],
      owners: owners as string[],
      ...(piWeb ? { piWeb } : {}),
      ...(planner ? { planner } : {}),
      ...(reviewer ? { reviewer } : {}),
    },
  };
}
