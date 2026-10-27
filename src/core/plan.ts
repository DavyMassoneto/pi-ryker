export interface PlanTask {
  id: string;
  repository: string;
  owner: string;
  paths: string[];
  tests: { file: string; command: string }[];
  stubs: string[];
}

export interface Plan {
  tasks: PlanTask[];
  stage4MayBeEmpty: boolean;
}

export interface PlanOptions {
  owners: readonly string[];
  returnFromStage5?: boolean;
  repositories?: readonly string[];
}

export type PlanResult = { ok: true; plan: Plan } | { ok: false; problems: string[] };

const REQUIRED_SECTIONS = [
  "Tasks",
  "Production order",
  "Test dependencies",
  "Test scripts and config",
  "Shared files",
  "Characterization tests",
  "Obsolete tests",
  "Separate test commands",
  "Old tests to alter",
  "Stage 4 may be empty",
  "Assumptions",
];

const GLOBAL_ROLE = "global";

function splitSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^## (.+?)\s*(?:\(.*\))?$/.exec(line);
    if (heading?.[1]) {
      current = [];
      sections.set(heading[1].trim(), current);
    } else if (current) {
      current.push(line);
    }
  }
  return sections;
}

function parseTasks(lines: string[]): { id: string; fields: Map<string, string[]> }[] {
  const tasks: { id: string; fields: Map<string, string[]> }[] = [];
  for (const line of lines) {
    const header = /^### (T\d+)\s*$/.exec(line);
    if (header?.[1]) {
      tasks.push({ id: header[1], fields: new Map() });
      continue;
    }
    const field = /^- ([a-z]+):\s*(.*)$/.exec(line);
    const last = tasks[tasks.length - 1];
    if (field?.[1] && last) {
      last.fields.set(field[1], [...(last.fields.get(field[1]) ?? []), (field[2] ?? "").trim()]);
    }
  }
  return tasks;
}

const splitBar = (value: string): string[] =>
  value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part !== "");

function buildTask(
  raw: { id: string; fields: Map<string, string[]> },
  options: PlanOptions,
  problems: string[],
): PlanTask {
  const value = (key: string): string => raw.fields.get(key)?.[0] ?? "";
  const repository = value("repository");
  if (repository === "") problems.push(`task ${raw.id}: missing repository`);
  else if (options.repositories && !options.repositories.includes(repository)) {
    problems.push(`task ${raw.id}: repository ${repository} is not a cycle repository`);
  }
  const owner = value("owner");
  if (owner === "") problems.push(`task ${raw.id}: missing owner`);
  else if (owner !== GLOBAL_ROLE && !options.owners.includes(owner)) {
    problems.push(`task ${raw.id}: owner ${owner} is not in the configuration`);
  }
  const paths = splitBar(value("paths"));
  if (paths.length === 0) problems.push(`task ${raw.id}: missing paths`);
  const tests = (raw.fields.get("tests") ?? []).map((entry) => {
    const [file = "", command = ""] = splitBar(entry);
    return { file, command };
  });
  if (tests.length === 0) problems.push(`task ${raw.id}: missing tests`);
  if (tests.some((t) => t.file === "" || t.command === "")) {
    problems.push(`task ${raw.id}: tests need a file and a command`);
  }
  return {
    id: raw.id,
    repository,
    owner,
    paths,
    tests,
    stubs: splitBar(value("stubs")).filter((s) => s !== "none"),
  };
}

export function validatePlan(text: string, options: PlanOptions): PlanResult {
  const sections = splitSections(text);
  const problems: string[] = [];
  const required = options.returnFromStage5
    ? [...REQUIRED_SECTIONS, "Defect tasks"]
    : REQUIRED_SECTIONS;
  for (const heading of required) {
    if (!sections.has(heading)) problems.push(`missing section: ${heading}`);
  }
  const rawTasks = parseTasks(sections.get("Tasks") ?? []);
  if (sections.has("Tasks") && rawTasks.length === 0) problems.push("Tasks has no task");
  const tasks = rawTasks.map((raw) => buildTask(raw, options, problems));
  const emptyAnswer = (sections.get("Stage 4 may be empty") ?? [])
    .map((l) => l.replace(/^- /, "").trim())
    .find((l) => l !== "");
  if (sections.has("Stage 4 may be empty") && emptyAnswer !== "yes" && emptyAnswer !== "no") {
    problems.push("Stage 4 may be empty must be yes or no");
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, plan: { tasks, stage4MayBeEmpty: emptyAnswer === "yes" } };
}
