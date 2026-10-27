import { labels, plural } from "./i18n.ts";
import type { DiscussionState } from "./state.ts";
import { openTopics } from "./topics.ts";

export function statusText(state: DiscussionState): string {
  const r = labels(state.idioma);
  const parts = [
    plural(state.perguntas.length, r.question),
    plural(openTopics(state.temas).length, r.openTopic),
  ];
  if (state.pausado) parts.push(r.paused);
  return `${r.discussion}: ${parts.join(" · ")}`;
}
