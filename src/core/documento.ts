import type { Estado } from "./estado.ts";
import { rotulosDoc } from "./i18nDocumento.ts";
import { type Origem, type Tema, temasAbertos } from "./temas.ts";

/** Acima disto (caracteres de texto) o retorno traz um aviso; não bloqueia. */
export const LIMITE_AVISO = 9000;

export interface Sintese {
  secao: number;
  texto: string;
}

export type PodeGerar = { ok: true } | { ok: false; abertos: string[] };
export type ValidaSinteses = { ok: true } | { ok: false; erro: string };

export function podeGerarDocumento(estado: Estado): PodeGerar {
  const abertos = temasAbertos(estado.temas).map((t) => t.id);
  return abertos.length ? { ok: false, abertos } : { ok: true };
}

export function validarSinteses(estado: Estado, sinteses: readonly Sintese[]): ValidaSinteses {
  const vistas = new Set<number>();
  for (const s of sinteses) {
    if (!Number.isInteger(s.secao) || s.secao < 1 || s.secao > 8) {
      return { ok: false, erro: `Síntese com seção ${s.secao}: use de 1 a 8.` };
    }
    if (vistas.has(s.secao))
      return { ok: false, erro: `Síntese duplicada para a seção ${s.secao}.` };
    if (!s.texto.trim()) return { ok: false, erro: `Síntese vazia na seção ${s.secao}.` };
    vistas.add(s.secao);
  }
  const faltam = [
    ...new Set(estado.temas.filter((t) => t.status === "decidido").map((t) => t.secao)),
  ].filter((n) => !vistas.has(n));
  if (faltam.length) {
    return { ok: false, erro: `Falta síntese nas seções com tema decidido: ${faltam.join(", ")}.` };
  }
  return { ok: true };
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const paragrafos = (s: string): string =>
  s
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

function textoOrigem(estado: Estado, o: Origem | undefined): string {
  const r = rotulosDoc(estado.idioma);
  if (!o) return "";
  if (o.tipo === "usuario") return `${r.usuario} (${o.perguntaId})`;
  if (o.tipo === "fonte") return `${r.fonte}: ${o.ref}`;
  return r.agente;
}

/** Decisão a mostrar: para tema respondido pelo usuário, a resposta (o par fica no registro). */
function textoDecisao(estado: Estado, t: Tema): string {
  if (t.origem?.tipo === "usuario") {
    const id = t.origem.perguntaId;
    const resposta = estado.perguntas.find((p) => p.id === id)?.resposta;
    if (resposta) return resposta;
  }
  return t.texto ?? "";
}

function blocoTema(estado: Estado, t: Tema, detalhes: boolean): string {
  const r = rotulosDoc(estado.idioma);
  const extra: string[] = [];
  if (t.status === "suposto")
    extra.push(`<p class="meta"><strong>${esc(r.suposicao)}</strong></p>`);
  if (detalhes && t.motivo) {
    extra.push(`<p class="meta">${esc(r.porque)}: ${esc(t.motivo)}</p>`);
  }
  if (detalhes && t.status === "adiado" && t.quando) {
    extra.push(`<p class="meta">${esc(r.decidirQuando)}: ${esc(t.quando)}</p>`);
  }
  return `<article data-tema="${esc(t.id)}"><h3>${esc(t.titulo)}</h3>${paragrafos(textoDecisao(estado, t))}${extra.join("")}</article>`;
}

const CSS = `:root{color-scheme:light dark;--fg:#1d1d1f;--bg:#fff;--mut:#6b6b70;--bd:#d8d8de;--ac:#3b5bdb}
@media(prefers-color-scheme:dark){:root{--fg:#ececf0;--bg:#16161a;--mut:#9a9aa3;--bd:#33333b;--ac:#8fa6ff}}
body{font:16px/1.55 system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:46rem;margin:2rem auto;padding:0 1rem}
h1{font-size:1.7rem}h2{font-size:1.2rem;border-bottom:1px solid var(--bd);padding-bottom:.2rem;margin-top:1.8rem}
h3{font-size:1rem;margin:.9rem 0 .2rem;color:var(--ac)}p{margin:.3rem 0}.meta,.vazio{color:var(--mut);font-size:.9rem}
li{margin:.25rem 0}`;

export interface Renderizado {
  html: string;
  texto: string;
  aviso?: string;
}

/** Gera o HTML a partir do estado (completude por construção) e das sínteses do modelo. */
export function renderizar(
  estado: Estado,
  titulo: string,
  sinteses: readonly Sintese[],
): Renderizado {
  const r = rotulosDoc(estado.idioma);
  const vazio = `<p class="vazio">${esc(r.nenhum)}</p>`;
  const secoes: string[] = [];
  const texto: string[] = [titulo];

  for (let n = 1; n <= 8; n++) {
    const sint = sinteses.find((s) => s.secao === n);
    const temas = estado.temas.filter((t) => t.secao === n && t.status === "decidido");
    const corpo = [
      sint ? paragrafos(sint.texto) : "",
      ...temas.map((t) => blocoTema(estado, t, false)),
    ].join("");
    if (sint) texto.push(sint.texto);
    for (const t of temas) texto.push(`${t.titulo}: ${textoDecisao(estado, t)}`);
    secoes.push(
      `<section id="s${n}"><h2>${n}. ${esc(r.secoes[n - 1])}</h2>${corpo || vazio}</section>`,
    );
  }

  const suposicoes = estado.temas.filter((t) => t.status === "suposto");
  const adiados = estado.temas.filter((t) => t.status === "adiado");
  for (const t of [...suposicoes, ...adiados]) texto.push(`${t.titulo}: ${t.texto ?? ""}`);
  const lista = (ts: Tema[]) => ts.map((t) => blocoTema(estado, t, true)).join("") || vazio;
  secoes.push(
    `<section id="s9"><h2>9. ${esc(r.secoes[8])}</h2>${lista(suposicoes)}</section>`,
    `<section id="s10"><h2>10. ${esc(r.secoes[9])}</h2>${lista(adiados)}</section>`,
  );

  const itensPerguntas = estado.perguntas.map(
    (p) =>
      `<li data-pergunta="${esc(p.id)}"><strong>${esc(p.pergunta)}</strong> (${esc(p.tema)}) — ${esc(r.respondeu)}: ${esc(p.resposta ?? "")}${p.livre ? ` [${esc(r.livre)}]` : ""}. ${esc(r.origem)}: ${esc(r.usuario)}</li>`,
  );
  const itensTemas = estado.temas
    .filter((t) => t.status !== "aberto" && t.origem && t.origem.tipo !== "usuario")
    .map(
      (t) =>
        `<li data-registro="${esc(t.id)}">${esc(t.titulo)} — ${esc(t.status)}. ${esc(r.origem)}: ${esc(textoOrigem(estado, t.origem))}</li>`,
    );
  secoes.push(
    `<section id="s11"><h2>11. ${esc(r.secoes[10])}</h2><p class="meta">${esc(r.pedido)}: ${esc(estado.pedido)}</p><ul>${[...itensPerguntas, ...itensTemas].join("")}</ul></section>`,
  );
  const menores = (estado.revisao?.achados ?? []).filter((x) => !x.bloqueante);
  if (menores.length) {
    const itens = menores
      .map(
        (x) =>
          `<li data-achado="${esc(x.id)}">${esc(x.texto)}${x.tema ? ` <span class="meta">(${esc(x.tema)})</span>` : ""}</li>`,
      )
      .join("");
    secoes.push(
      `<section id="apendice"><h2>${esc(r.apendice)}</h2><p class="meta">${esc(r.apendiceNota)}</p><ul>${itens}</ul></section>`,
    );
    for (const x of menores) texto.push(x.texto);
  }
  texto.push(estado.pedido);

  const corpoTexto = texto.join("\n");
  const aviso = corpoTexto.length > LIMITE_AVISO ? r.aviso : undefined;
  const html = `<!doctype html><html lang="${esc(estado.idioma)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><style>${CSS}</style></head><body><h1>${esc(titulo)}</h1>${secoes.join("")}</body></html>`;
  return { html, texto: corpoTexto, ...(aviso ? { aviso } : {}) };
}

export interface ComandoAbrir {
  comando: string;
  args: string[];
}

export function comandoAbrir(plataforma: string, caminho: string): ComandoAbrir {
  if (plataforma === "win32") return { comando: "cmd", args: ["/c", "start", "", caminho] };
  if (plataforma === "darwin") return { comando: "open", args: [caminho] };
  return { comando: "xdg-open", args: [caminho] };
}

/** Abrir o documento no navegador é o padrão; RYKER_ABRIR=0 (ou false) desliga, p.ex. nos E2E. */
export function deveAbrir(env: Record<string, string | undefined>): boolean {
  const v = env.RYKER_ABRIR?.trim().toLowerCase();
  return v !== "0" && v !== "false";
}
