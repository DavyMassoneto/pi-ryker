const CHARACTERS_PER_TOKEN = 4;

export interface ContinuationInput {
  progressTokens: number;
  fixedTextTokens: number;
  windowTokens: number;
  reservedTokens: number;
}

export type Continuation = "keepSession" | "newSession";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}

export function progressSummary(progressText: string): string | undefined {
  return progressText.trim() === "" ? undefined : progressText;
}

export function continuationDecision(input: ContinuationInput): Continuation {
  const needed = input.progressTokens + input.fixedTextTokens + input.reservedTokens;
  return needed <= input.windowTokens ? "keepSession" : "newSession";
}
