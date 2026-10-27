import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { labels } from "../core/i18n.ts";
import {
  interpretChoice,
  pause,
  type QuestionInput,
  recordAnswer,
  selectOptions,
} from "../core/questions.ts";
import type { DiscussionState } from "../core/state.ts";

export interface BatchResult {
  state: DiscussionState;
  answeredQuestions: { topic: string; answer: string; free: boolean }[];
  paused: boolean;
}

export async function askBatch(
  ctx: ExtensionContext,
  initialState: DiscussionState,
  batch: readonly QuestionInput[],
  save: (e: DiscussionState) => void,
  now: () => string,
  signal?: AbortSignal,
): Promise<BatchResult> {
  let state = initialState;
  const answeredQuestions: BatchResult["answeredQuestions"] = [];
  const r = labels(state.idioma);
  for (const [i, p] of batch.entries()) {
    const title = `[${i + 1}/${batch.length}] ${p.tema}: ${p.pergunta}`;
    const choice = interpretChoice(
      p,
      await ctx.ui.select(title, selectOptions(p, state.idioma), { signal }),
      state.idioma,
    );
    let answer: string | undefined;
    let free = false;
    if (choice.kind === "option") {
      answer = choice.text;
    } else if (choice.kind === "free") {
      const text = await ctx.ui.input(`${p.tema}: ${p.pergunta}`, r.otherAnswer, { signal });
      if (text !== undefined && text.trim() !== "") {
        answer = text.trim();
        free = true;
      }
    }
    if (answer === undefined) {
      state = pause(state);
      save(state);
      return { state, answeredQuestions, paused: true };
    }
    state = recordAnswer(state, p, answer, free, now());
    save(state);
    answeredQuestions.push({ topic: p.tema, answer, free });
  }
  return { state, answeredQuestions, paused: false };
}
