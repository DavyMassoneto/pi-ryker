import type { RunState } from "./cycleStates.ts";
import { isPortuguese, plural } from "./i18n.ts";
import type { Language } from "./state.ts";

export const TOTAL_STAGES = 6;

export interface StatusLineInput {
  stage: number;
  stageName: string;
  round: number;
  maxRounds: number;
  owner?: string;
  tokens: number;
  language?: Language;
}

export interface ReaderStatusInput {
  stage: number;
  stageName: string;
  language?: Language;
}

export interface StageRow {
  status: "done" | "current" | "pending";
  detail?: string;
}

export interface WidgetInput {
  cycleId: string;
  repositories: number;
  state: RunState;
  stages: readonly StageRow[];
  language?: Language;
}

const STAGE_NAMES: Record<"pt" | "en", string[]> = {
  pt: ["Discussão", "Planejamento", "Testes RED", "Implementação", "Revisão + E2E", "Entrega"],
  en: ["Discussion", "Planning", "RED tests", "Implementation", "Review + E2E", "Delivery"],
};

const STATE_LABELS: Record<"pt" | "en", Record<RunState, string>> = {
  pt: { running: "rodando", paused: "pausado", awaitingApproval: "esperando aprovação" },
  en: { running: "running", paused: "paused", awaitingApproval: "awaiting approval" },
};

const MARKS = { done: "[x]", current: "[>]", pending: "[ ]" } as const;
const DETAIL_COLUMN = 23;

const locale = (language?: Language): "pt" | "en" => (isPortuguese(language) ? "pt" : "en");

export function formatTokens(count: number, language?: Language): string {
  const decimal = (n: number): string => {
    const text = (Math.round(n * 10) / 10).toString();
    return locale(language) === "pt" ? text.replace(".", ",") : text;
  };
  if (count >= 1_000_000) return `${decimal(count / 1_000_000)}M`;
  if (count >= 1000) return `${decimal(count / 1000)}k`;
  return String(count);
}

export function statusLine(input: StatusLineInput): string {
  const pt = locale(input.language) === "pt";
  const parts = [
    `${input.stage}/${TOTAL_STAGES} ${input.stageName}`,
    `${pt ? "rodada" : "round"} ${input.round}/${input.maxRounds}`,
  ];
  if (input.owner) parts.push(`${pt ? "dono" : "owner"}: ${input.owner}`);
  parts.push(`${formatTokens(input.tokens, input.language)} tokens`);
  return `Ryker · ${parts.join(" · ")}`;
}

export function readerStatusLine(input: ReaderStatusInput): string {
  const pt = locale(input.language) === "pt";
  const head = pt
    ? "Ryker (só leitura) · ciclo de outra sessão"
    : "Ryker (read only) · another session's cycle";
  return `${head} · ${input.stage}/${TOTAL_STAGES} ${input.stageName}`;
}

export function widgetLines(input: WidgetInput): string[] {
  const lang = locale(input.language);
  const repos =
    lang === "pt"
      ? plural(input.repositories, ["repositório", "repositórios"])
      : plural(input.repositories, ["repository", "repositories"]);
  const cycle = lang === "pt" ? "ciclo" : "cycle";
  const lines = [
    `Ryker — ${cycle} ${input.cycleId} (${repos}) · ${STATE_LABELS[lang][input.state]}`,
  ];
  for (const [index, row] of input.stages.entries()) {
    const name = `${index + 1} ${STAGE_NAMES[lang][index]}`;
    const base = `${MARKS[row.status]} ${name}`;
    lines.push(row.detail ? `${base.padEnd(DETAIL_COLUMN)}${row.detail}`.trimEnd() : base);
  }
  return lines;
}
