import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Estado } from "../core/estado.ts";
import { caminhoArquivamento } from "../core/restauracao.ts";
import { desserializar, serializar } from "../core/serializacao.ts";

export const TIPO_ENTRADA = "ryker-discussao";

export type Leitura =
  | { tipo: "ausente" }
  | { tipo: "ok"; estado: Estado }
  | { tipo: "corrompido"; erro: string };

export const pastaRyker = (cwd: string): string => join(cwd, ".ryker");
export const caminhoDiscussao = (cwd: string): string => join(pastaRyker(cwd), "discussao.json");

export function lerEstado(cwd: string): Leitura {
  let texto: string;
  try {
    texto = readFileSync(caminhoDiscussao(cwd), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { tipo: "ausente" };
    return { tipo: "corrompido", erro: (e as Error).message };
  }
  try {
    return { tipo: "ok", estado: desserializar(texto) };
  } catch (e) {
    return { tipo: "corrompido", erro: (e as Error).message };
  }
}

/** Grava em arquivo temporário e renomeia, para nunca deixar o json pela metade. */
export function gravarEstado(cwd: string, estado: Estado): void {
  mkdirSync(pastaRyker(cwd), { recursive: true });
  const destino = caminhoDiscussao(cwd);
  const tmp = `${destino}.tmp`;
  writeFileSync(tmp, serializar(estado), "utf8");
  renameSync(tmp, destino);
}

/** Grava `.ryker/visao.html` (tmp + rename) e devolve o caminho absoluto. */
export function gravarDocumento(cwd: string, html: string): string {
  mkdirSync(pastaRyker(cwd), { recursive: true });
  const destino = join(pastaRyker(cwd), "visao.html");
  const tmp = `${destino}.tmp`;
  writeFileSync(tmp, html, "utf8");
  renameSync(tmp, destino);
  return destino;
}

/** O arquivo é a fonte de verdade; a sessão guarda um snapshot a cada mutação. */
export function salvarEstado(pi: ExtensionAPI, cwd: string, estado: Estado): void {
  gravarEstado(cwd, estado);
  pi.appendEntry(TIPO_ENTRADA, estado);
}

/** Estado da etapa ativa (fase diferente de "aprovada"), se houver e for legível. */
export function estadoAtivo(cwd: string): Estado | undefined {
  const l = lerEstado(cwd);
  return l.tipo === "ok" && l.estado.fase !== "aprovada" ? l.estado : undefined;
}

/** Estado da discussão já aprovada (fase "aprovada"), se houver e for legível. */
export function estadoAprovado(cwd: string): Estado | undefined {
  const l = lerEstado(cwd);
  return l.tipo === "ok" && l.estado.fase === "aprovada" ? l.estado : undefined;
}

/** Move discussao.json (e visao.html) da discussão aprovada para `.ryker/arquivo/<data>-<slug>/`. */
export function arquivarAprovada(cwd: string, estado: Estado): string {
  const rel = caminhoArquivamento(estado);
  let pasta = join(cwd, rel);
  for (let n = 2; existsSync(pasta); n++) pasta = join(cwd, `${rel}-${n}`);
  mkdirSync(pasta, { recursive: true });
  renameSync(caminhoDiscussao(cwd), join(pasta, "discussao.json"));
  const visao = join(pastaRyker(cwd), "visao.html");
  if (existsSync(visao)) renameSync(visao, join(pasta, "visao.html"));
  return pasta;
}
