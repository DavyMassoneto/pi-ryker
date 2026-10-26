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
    ...new Set(
      estado.temas.filter((t) => t.status === "decidido" && !t.substituidoPor).map((t) => t.secao),
    ),
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

// ---- Representação única do documento: o HTML e o texto do revisor saem dela. ----

interface ItemVisao {
  id: string;
  titulo: string;
  texto: string;
  /** Rótulo em destaque (suposição do agente). */
  rotulo?: string;
  /** Linhas de metadados (motivo, "decidir quando"). */
  extras: string[];
}

interface SecaoVisao {
  id: string;
  n: number;
  titulo: string;
  sintese?: string;
  /** true: lista compacta "Decisões registradas" sob a síntese. false: um bloco por tema. */
  compacta: boolean;
  itens: ItemVisao[];
  vazio: string;
}

interface LinhaRegistro {
  atributo: "data-pergunta" | "data-registro";
  id: string;
  destaque: string;
  resto: string;
}

interface Visao {
  titulo: string;
  secoes: SecaoVisao[];
  registro: { pedido: string; linhas: LinhaRegistro[] };
  apendice: { id: string; texto: string; tema?: string }[];
}

function item(estado: Estado, t: Tema, detalhes: boolean): ItemVisao {
  const r = rotulosDoc(estado.idioma);
  const extras: string[] = [];
  if (detalhes && t.motivo) extras.push(`${r.porque}: ${t.motivo}`);
  if (detalhes && t.status === "adiado" && t.quando) {
    extras.push(`${r.decidirQuando}: ${t.quando}`);
  }
  return {
    id: t.id,
    titulo: t.titulo,
    texto: textoDecisao(estado, t),
    ...(t.status === "suposto" ? { rotulo: r.suposicao } : {}),
    extras,
  };
}

function montarVisao(estado: Estado, titulo: string, sinteses: readonly Sintese[]): Visao {
  const r = rotulosDoc(estado.idioma);
  // Tema substituído (revisa) sai das seções 1-10 e fica só no registro.
  const vigentes = estado.temas.filter((t) => !t.substituidoPor);
  const secoes: SecaoVisao[] = [];
  for (let n = 1; n <= 8; n++) {
    const sint = sinteses.find((s) => s.secao === n);
    const doTema = vigentes.filter((t) => t.secao === n);
    const outras = doTema.some((t) => t.status === "suposto" || t.status === "adiado");
    secoes.push({
      id: `s${n}`,
      n,
      titulo: r.secoes[n - 1],
      ...(sint ? { sintese: sint.texto } : {}),
      compacta: sint !== undefined,
      itens: doTema.filter((t) => t.status === "decidido").map((t) => item(estado, t, false)),
      vazio: outras ? r.soSuposicoes : r.nenhum,
    });
  }
  const bloco = (n: number, status: Tema["status"]): SecaoVisao => ({
    id: `s${n}`,
    n,
    titulo: r.secoes[n - 1],
    compacta: false,
    itens: vigentes.filter((t) => t.status === status).map((t) => item(estado, t, true)),
    vazio: r.nenhum,
  });
  secoes.push(bloco(9, "suposto"), bloco(10, "adiado"));

  const linhas: LinhaRegistro[] = estado.perguntas.map((p) => ({
    atributo: "data-pergunta",
    id: p.id,
    destaque: p.pergunta,
    resto: `(${p.tema}) — ${r.respondeu}: ${p.resposta ?? ""}${p.livre ? ` [${r.livre}]` : ""}. ${r.origem}: ${r.usuario}`,
  }));
  for (const t of estado.temas) {
    if (t.substituidoPor) {
      linhas.push({
        atributo: "data-registro",
        id: t.id,
        destaque: t.titulo,
        resto: `— ${r.substituido} ${t.substituidoPor} (${r.antes}: ${um(textoDecisao(estado, t))})`,
      });
    } else if (t.status !== "aberto" && t.origem && t.origem.tipo !== "usuario") {
      linhas.push({
        atributo: "data-registro",
        id: t.id,
        destaque: t.titulo,
        resto: `— ${t.status}. ${r.origem}: ${textoOrigem(estado, t.origem)}`,
      });
    }
  }
  const apendice = (estado.revisao?.achados ?? [])
    .filter((x) => !x.bloqueante)
    .map((x) => ({ id: x.id, texto: x.texto, ...(x.tema ? { tema: x.tema } : {}) }));
  return { titulo, secoes, registro: { pedido: estado.pedido, linhas }, apendice };
}

function um(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function htmlSecao(estado: Estado, s: SecaoVisao): string {
  const r = rotulosDoc(estado.idioma);
  const bloco = (i: ItemVisao): string =>
    `<article data-tema="${esc(i.id)}"><h3>${esc(i.titulo)}</h3>${paragrafos(i.texto)}${
      i.rotulo ? `<p class="meta"><strong>${esc(i.rotulo)}</strong></p>` : ""
    }${i.extras.map((e) => `<p class="meta">${esc(e)}</p>`).join("")}</article>`;
  let corpo: string;
  if (s.compacta) {
    const lista = s.itens
      .map(
        (i) =>
          `<li data-tema="${esc(i.id)}"><strong>${esc(i.titulo)}:</strong> ${esc(um(i.texto))}</li>`,
      )
      .join("");
    corpo =
      paragrafos(s.sintese ?? "") +
      (s.itens.length
        ? `<div class="registro"><p class="meta">${esc(r.decisoes)}</p><ul class="compacta">${lista}</ul></div>`
        : "");
  } else {
    corpo = s.itens.map(bloco).join("");
  }
  return `<section id="${s.id}"><h2>${s.n}. ${esc(s.titulo)}</h2>${corpo || `<p class="vazio">${esc(s.vazio)}</p>`}</section>`;
}

function htmlVisao(estado: Estado, v: Visao): string {
  const r = rotulosDoc(estado.idioma);
  const partes = v.secoes.map((s) => htmlSecao(estado, s));
  const lis = v.registro.linhas
    .map(
      (l) =>
        `<li ${l.atributo}="${esc(l.id)}"><strong>${esc(l.destaque)}</strong> ${esc(l.resto)}</li>`,
    )
    .join("");
  partes.push(
    `<section id="s11"><h2>11. ${esc(r.secoes[10])}</h2><p class="meta">${esc(r.pedido)}: ${esc(v.registro.pedido)}</p><ul>${lis}</ul></section>`,
  );
  if (v.apendice.length) {
    const itens = v.apendice
      .map(
        (x) =>
          `<li data-achado="${esc(x.id)}">${esc(x.texto)}${x.tema ? ` <span class="meta">(${esc(x.tema)})</span>` : ""}</li>`,
      )
      .join("");
    partes.push(
      `<section id="apendice"><h2>${esc(r.apendice)}</h2><p class="meta">${esc(r.apendiceNota)}</p><ul>${itens}</ul></section>`,
    );
  }
  return `<!doctype html><html lang="${esc(estado.idioma ?? "pt")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.titulo)}</title><style>${CSS}</style></head><body><h1>${esc(v.titulo)}</h1>${partes.join("")}</body></html>`;
}

/** Mesmo conteúdo, mesmos títulos e rótulos do HTML, em texto puro (é o que o revisor lê). */
function textoVisao(estado: Estado, v: Visao): string {
  const r = rotulosDoc(estado.idioma);
  const out: string[] = [`# ${v.titulo}`];
  for (const s of v.secoes) {
    out.push("", `## ${s.n}. ${s.titulo}`);
    if (s.compacta) {
      if (s.sintese) out.push(s.sintese);
      if (s.itens.length) {
        out.push(`${r.decisoes}:`);
        for (const i of s.itens) out.push(`- ${i.titulo}: ${um(i.texto)}`);
      }
    } else {
      for (const i of s.itens) {
        out.push(`- ${i.rotulo ? `[${i.rotulo}] ` : ""}${i.titulo}: ${um(i.texto)}`);
        for (const e of i.extras) out.push(`  ${e}`);
      }
    }
    if (!s.sintese && s.itens.length === 0) out.push(s.vazio);
  }
  out.push("", `## 11. ${r.secoes[10]}`, `${r.pedido}: ${v.registro.pedido}`);
  for (const l of v.registro.linhas) out.push(`- ${l.destaque} ${l.resto}`);
  if (v.apendice.length) {
    out.push("", `## ${r.apendice}`, r.apendiceNota);
    for (const x of v.apendice) out.push(`- ${x.texto}${x.tema ? ` (${x.tema})` : ""}`);
  }
  return out.join("\n");
}

const CSS = `:root{color-scheme:light dark;--fg:#1d1d1f;--bg:#fff;--mut:#6b6b70;--bd:#d8d8de;--ac:#3b5bdb}
@media(prefers-color-scheme:dark){:root{--fg:#ececf0;--bg:#16161a;--mut:#9a9aa3;--bd:#33333b;--ac:#8fa6ff}}
body{font:16px/1.55 system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:46rem;margin:2rem auto;padding:0 1rem}
h1{font-size:1.7rem}h2{font-size:1.2rem;border-bottom:1px solid var(--bd);padding-bottom:.2rem;margin-top:1.8rem}
h3{font-size:1rem;margin:.9rem 0 .2rem;color:var(--ac)}p{margin:.3rem 0}.meta,.vazio{color:var(--mut);font-size:.9rem}
li{margin:.25rem 0}.compacta{font-size:.85rem;color:var(--mut);padding-left:1.2rem}.registro{margin-top:.6rem}`;

export interface Renderizado {
  html: string;
  texto: string;
  aviso?: string;
}

/** Gera o HTML e o texto do revisor da mesma estrutura (completude por construção). */
export function renderizar(
  estado: Estado,
  titulo: string,
  sinteses: readonly Sintese[],
): Renderizado {
  const v = montarVisao(estado, titulo, sinteses);
  const texto = textoVisao(estado, v);
  const aviso = texto.length > LIMITE_AVISO ? rotulosDoc(estado.idioma).aviso : undefined;
  return { html: htmlVisao(estado, v), texto, ...(aviso ? { aviso } : {}) };
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
