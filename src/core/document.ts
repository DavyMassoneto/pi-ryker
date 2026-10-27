import { documentLabels } from "./documentI18n.ts";
import type { DiscussionState } from "./state.ts";
import { type Origin, openTopics, type Topic } from "./topics.ts";

export const WARNING_LIMIT = 9000;

export interface Synthesis {
  secao: number;
  texto: string;
}

export type CanGenerate = { ok: true } | { ok: false; open: string[] };
export type SynthesesValidation = { ok: true } | { ok: false; error: string };

export function canGenerateDocument(state: DiscussionState): CanGenerate {
  const open = openTopics(state.temas).map((t) => t.id);
  return open.length ? { ok: false, open } : { ok: true };
}

export function validateSyntheses(
  state: DiscussionState,
  syntheses: readonly Synthesis[],
): SynthesesValidation {
  const seen = new Set<number>();
  for (const s of syntheses) {
    if (!Number.isInteger(s.secao) || s.secao < 1 || s.secao > 8) {
      return { ok: false, error: `Síntese com seção ${s.secao}: use de 1 a 8.` };
    }
    if (seen.has(s.secao))
      return { ok: false, error: `Síntese duplicada para a seção ${s.secao}.` };
    if (!s.texto.trim()) return { ok: false, error: `Síntese vazia na seção ${s.secao}.` };
    seen.add(s.secao);
  }
  const missing = [
    ...new Set(
      state.temas.filter((t) => t.status === "decidido" && !t.substituidoPor).map((t) => t.secao),
    ),
  ].filter((n) => !seen.has(n));
  if (missing.length) {
    return {
      ok: false,
      error: `Falta síntese nas seções com tema decidido: ${missing.join(", ")}.`,
    };
  }
  return { ok: true };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const paragraphs = (s: string): string =>
  s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

function originText(state: DiscussionState, o: Origin | undefined): string {
  const r = documentLabels(state.idioma);
  if (!o) return "";
  if (o.tipo === "usuario") return `${r.user} (${o.perguntaId})`;
  if (o.tipo === "fonte") return `${r.source}: ${o.ref}`;
  return r.agent;
}

function decisionText(state: DiscussionState, t: Topic): string {
  if (t.origem?.tipo === "usuario") {
    const id = t.origem.perguntaId;
    const answer = state.perguntas.find((p) => p.id === id)?.resposta;
    if (answer) return answer;
  }
  return t.texto ?? "";
}

interface VisionItem {
  id: string;
  title: string;
  text: string;
  label?: string;
  extras: string[];
}

interface VisionSection {
  id: string;
  n: number;
  title: string;
  synthesis?: string;
  compact: boolean;
  items: VisionItem[];
  empty: string;
}

interface RecordLine {
  attribute: "data-pergunta" | "data-registro";
  id: string;
  highlight: string;
  rest: string;
}

interface Vision {
  title: string;
  sections: VisionSection[];
  record: { request: string; lines: RecordLine[] };
  appendix: { id: string; text: string; topic?: string }[];
}

function buildItem(state: DiscussionState, t: Topic, withDetails: boolean): VisionItem {
  const r = documentLabels(state.idioma);
  const extras: string[] = [];
  if (withDetails && t.motivo) extras.push(`${r.why}: ${t.motivo}`);
  if (withDetails && t.status === "adiado" && t.quando) {
    extras.push(`${r.decideWhen}: ${t.quando}`);
  }
  return {
    id: t.id,
    title: t.titulo,
    text: decisionText(state, t),
    ...(t.status === "suposto" ? { label: r.assumption } : {}),
    extras,
  };
}

function buildVision(
  state: DiscussionState,
  title: string,
  syntheses: readonly Synthesis[],
): Vision {
  const r = documentLabels(state.idioma);
  const currentTopics = state.temas.filter((t) => !t.substituidoPor);
  const sections: VisionSection[] = [];
  for (let n = 1; n <= 8; n++) {
    const synthesis = syntheses.find((s) => s.secao === n);
    const ofTopic = currentTopics.filter((t) => t.secao === n);
    const others = ofTopic.some((t) => t.status === "suposto" || t.status === "adiado");
    sections.push({
      id: `s${n}`,
      n,
      title: r.sections[n - 1],
      ...(synthesis ? { synthesis: synthesis.texto } : {}),
      compact: synthesis !== undefined,
      items: ofTopic.filter((t) => t.status === "decidido").map((t) => buildItem(state, t, false)),
      empty: others ? r.onlyAssumptions : r.none,
    });
  }
  const block = (n: number, status: Topic["status"]): VisionSection => ({
    id: `s${n}`,
    n,
    title: r.sections[n - 1],
    compact: false,
    items: currentTopics.filter((t) => t.status === status).map((t) => buildItem(state, t, true)),
    empty: r.none,
  });
  sections.push(block(9, "suposto"), block(10, "adiado"));

  const lines: RecordLine[] = state.perguntas.map((p) => ({
    attribute: "data-pergunta",
    id: p.id,
    highlight: p.pergunta,
    rest: `(${p.tema}) — ${r.answered}: ${p.resposta ?? ""}${p.livre ? ` [${r.free}]` : ""}. ${r.origin}: ${r.user}`,
  }));
  for (const t of state.temas) {
    if (t.substituidoPor) {
      lines.push({
        attribute: "data-registro",
        id: t.id,
        highlight: t.titulo,
        rest: `— ${r.replaced} ${t.substituidoPor} (${r.before}: ${oneLine(decisionText(state, t))})`,
      });
    } else if (t.status !== "aberto" && t.origem && t.origem.tipo !== "usuario") {
      lines.push({
        attribute: "data-registro",
        id: t.id,
        highlight: t.titulo,
        rest: `— ${t.status}. ${r.origin}: ${originText(state, t.origem)}`,
      });
    }
  }
  const appendix = (state.revisao?.achados ?? [])
    .filter((x) => !x.bloqueante)
    .map((x) => ({ id: x.id, text: x.texto, ...(x.tema ? { topic: x.tema } : {}) }));
  return { title, sections, record: { request: state.pedido, lines }, appendix };
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sectionHtml(state: DiscussionState, s: VisionSection): string {
  const r = documentLabels(state.idioma);
  const block = (i: VisionItem): string =>
    `<article data-tema="${escapeHtml(i.id)}"><h3>${escapeHtml(i.title)}</h3>${paragraphs(i.text)}${
      i.label ? `<p class="meta"><strong>${escapeHtml(i.label)}</strong></p>` : ""
    }${i.extras.map((e) => `<p class="meta">${escapeHtml(e)}</p>`).join("")}</article>`;
  let body: string;
  if (s.compact) {
    const list = s.items
      .map(
        (i) =>
          `<li data-tema="${escapeHtml(i.id)}"><strong>${escapeHtml(i.title)}:</strong> ${escapeHtml(oneLine(i.text))}</li>`,
      )
      .join("");
    body =
      paragraphs(s.synthesis ?? "") +
      (s.items.length
        ? `<div class="registro"><p class="meta">${escapeHtml(r.decisions)}</p><ul class="compacta">${list}</ul></div>`
        : "");
  } else {
    body = s.items.map(block).join("");
  }
  return `<section id="${s.id}"><h2>${s.n}. ${escapeHtml(s.title)}</h2>${body || `<p class="vazio">${escapeHtml(s.empty)}</p>`}</section>`;
}

function visionHtml(state: DiscussionState, v: Vision): string {
  const r = documentLabels(state.idioma);
  const parts = v.sections.map((s) => sectionHtml(state, s));
  const listItems = v.record.lines
    .map(
      (l) =>
        `<li ${l.attribute}="${escapeHtml(l.id)}"><strong>${escapeHtml(l.highlight)}</strong> ${escapeHtml(l.rest)}</li>`,
    )
    .join("");
  parts.push(
    `<section id="s11"><h2>11. ${escapeHtml(r.sections[10])}</h2><p class="meta">${escapeHtml(r.request)}: ${escapeHtml(v.record.request)}</p><ul>${listItems}</ul></section>`,
  );
  if (v.appendix.length) {
    const items = v.appendix
      .map(
        (x) =>
          `<li data-achado="${escapeHtml(x.id)}">${escapeHtml(x.text)}${x.topic ? ` <span class="meta">(${escapeHtml(x.topic)})</span>` : ""}</li>`,
      )
      .join("");
    parts.push(
      `<section id="apendice"><h2>${escapeHtml(r.appendix)}</h2><p class="meta">${escapeHtml(r.appendixNote)}</p><ul>${items}</ul></section>`,
    );
  }
  return `<!doctype html><html lang="${escapeHtml(state.idioma ?? "pt")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(v.title)}</title><style>${CSS}</style></head><body><h1>${escapeHtml(v.title)}</h1>${parts.join("")}</body></html>`;
}

function visionText(state: DiscussionState, v: Vision): string {
  const r = documentLabels(state.idioma);
  const out: string[] = [`# ${v.title}`];
  for (const s of v.sections) {
    out.push("", `## ${s.n}. ${s.title}`);
    if (s.compact) {
      if (s.synthesis) out.push(s.synthesis);
      if (s.items.length) {
        out.push(`${r.decisions}:`);
        for (const i of s.items) out.push(`- ${i.title}: ${oneLine(i.text)}`);
      }
    } else {
      for (const i of s.items) {
        out.push(`- ${i.label ? `[${i.label}] ` : ""}${i.title}: ${oneLine(i.text)}`);
        for (const e of i.extras) out.push(`  ${e}`);
      }
    }
    if (!s.synthesis && s.items.length === 0) out.push(s.empty);
  }
  out.push("", `## 11. ${r.sections[10]}`, `${r.request}: ${v.record.request}`);
  for (const l of v.record.lines) out.push(`- ${l.highlight} ${l.rest}`);
  if (v.appendix.length) {
    out.push("", `## ${r.appendix}`, r.appendixNote);
    for (const x of v.appendix) out.push(`- ${x.text}${x.topic ? ` (${x.topic})` : ""}`);
  }
  return out.join("\n");
}

const CSS = `:root{color-scheme:light dark;--fg:#1d1d1f;--bg:#fff;--mut:#6b6b70;--bd:#d8d8de;--ac:#3b5bdb}
@media(prefers-color-scheme:dark){:root{--fg:#ececf0;--bg:#16161a;--mut:#9a9aa3;--bd:#33333b;--ac:#8fa6ff}}
body{font:16px/1.55 system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:46rem;margin:2rem auto;padding:0 1rem}
h1{font-size:1.7rem}h2{font-size:1.2rem;border-bottom:1px solid var(--bd);padding-bottom:.2rem;margin-top:1.8rem}
h3{font-size:1rem;margin:.9rem 0 .2rem;color:var(--ac)}p{margin:.3rem 0}.meta,.vazio{color:var(--mut);font-size:.9rem}
li{margin:.25rem 0}.compacta{font-size:.85rem;color:var(--mut);padding-left:1.2rem}.registro{margin-top:.6rem}`;

export interface Rendered {
  html: string;
  text: string;
  warning?: string;
}

export function render(
  state: DiscussionState,
  title: string,
  syntheses: readonly Synthesis[],
): Rendered {
  const v = buildVision(state, title, syntheses);
  const text = visionText(state, v);
  const warning = text.length > WARNING_LIMIT ? documentLabels(state.idioma).warning : undefined;
  return { html: visionHtml(state, v), text, ...(warning ? { warning } : {}) };
}

export interface OpenCommand {
  command: string;
  args: string[];
}

export function openCommand(platform: string, path: string): OpenCommand {
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", path] };
  if (platform === "darwin") return { command: "open", args: [path] };
  return { command: "xdg-open", args: [path] };
}

export function shouldOpen(env: Record<string, string | undefined>): boolean {
  const v = env.RYKER_ABRIR?.trim().toLowerCase();
  return v !== "0" && v !== "false";
}
