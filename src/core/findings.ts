export type ReviewStatus = "APPROVED" | "REJECTED" | "BACK_TO_DISCUSSION";

export interface ReviewFinding {
  id: string;
  where: string;
  evidence: string;
  violates: string;
  blocks: boolean;
  kind: string;
  needsUserDecision: boolean;
}

export interface ReviewContext {
  producers: readonly string[];
  coverageMissing: readonly string[];
}

export interface ParsedReview {
  findings: ReviewFinding[];
  blocking: boolean;
  status: ReviewStatus | undefined;
  cited: string[];
  mechanicalOnly: string[];
  renamed: { from: string; to: string }[];
  integrationDefect: boolean;
  problems: string[];
}

const STATUSES: ReviewStatus[] = ["APPROVED", "REJECTED", "BACK_TO_DISCUSSION"];

function parseFindings(text: string, problems: string[]): ReviewFinding[] {
  const block = /```json\s*([\s\S]*?)```/.exec(text);
  if (!block?.[1]) {
    problems.push("missing JSON block");
    return [];
  }
  try {
    const raw = JSON.parse(block[1]) as { findings?: unknown };
    if (!Array.isArray(raw.findings)) throw new Error("findings must be a list");
    return raw.findings as ReviewFinding[];
  } catch (e) {
    problems.push(`invalid JSON block: ${(e as Error).message}`);
    return [];
  }
}

function fixedLine(text: string, name: string): string {
  const matches = [...text.matchAll(new RegExp(`^${name}:[ \\t]*(.*)$`, "gm"))];
  const value = (matches[matches.length - 1]?.[1] ?? "").trim();
  return value === "none" ? "" : value;
}

const splitBar = (value: string): string[] =>
  value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part !== "");

function parseRenamed(value: string): { from: string; to: string }[] {
  return splitBar(value).flatMap((entry) => {
    const [from, to] = entry.split("->").map((part) => part.trim());
    return from && to ? [{ from, to }] : [];
  });
}

function readStatus(text: string): ReviewStatus | undefined {
  const lines = text.trimEnd().split(/\r?\n/);
  const match = /^STATUS: ([A-Z_]+)$/.exec(lines[lines.length - 1] ?? "");
  return STATUSES.find((s) => s === match?.[1]);
}

function reconcileStatus(
  status: ReviewStatus | undefined,
  blocking: boolean,
  problems: string[],
): ReviewStatus | undefined {
  if (status === undefined || status === "BACK_TO_DISCUSSION") return status;
  if ((status === "APPROVED") === blocking) {
    problems.push(`STATUS ${status} diverges from the blocking findings`);
    return undefined;
  }
  return status;
}

export function parseReview(text: string, context: ReviewContext): ParsedReview {
  const problems: string[] = [];
  const findings = parseFindings(text, problems);
  const blocking = findings.some((f) => f.blocks === true);
  let status = readStatus(text);
  if (problems.length > 0) status = undefined;
  status = reconcileStatus(status, blocking, problems);
  if (context.coverageMissing.length > 0) {
    problems.push(`incomplete coverage: ${context.coverageMissing.join(", ")}`);
    status = undefined;
  }
  return {
    findings,
    blocking,
    status,
    cited: splitBar(fixedLine(text, "CITED")).filter((name) => context.producers.includes(name)),
    mechanicalOnly: splitBar(fixedLine(text, "MECHANICAL_ONLY")),
    renamed: parseRenamed(fixedLine(text, "RENAMED")),
    integrationDefect: fixedLine(text, "INTEGRATION_DEFECT") === "yes",
    problems,
  };
}

export function missingCoverage(progressText: string, expected: readonly string[]): string[] {
  const lines = progressText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Coverage");
  const section: string[] = [];
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) {
      if (line.startsWith("## ")) break;
      section.push(line);
    }
  }
  return expected.filter((item) => !section.some((line) => line.includes(item)));
}
