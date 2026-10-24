import { type Estado, etapaAtiva, slug } from "./estado.ts";

export type ArquivoLido =
  | { tipo: "ausente" }
  | { tipo: "ok"; estado: Estado }
  | { tipo: "corrompido"; erro: string };

export type DecisaoRestauracao =
  | { acao: "reaplicar"; estado: Estado }
  | { acao: "avisar"; estado: Estado }
  | { acao: "recriar"; estado: Estado }
  | { acao: "corrompido"; erro: string }
  | { acao: "nada" };

/**
 * O que fazer no session_start. `entradas` são os snapshots "ryker-discussao" do ramo da
 * sessão, do mais antigo ao mais recente. O arquivo é a fonte de verdade.
 */
export function decidirRestauracao(
  arquivo: ArquivoLido,
  entradas: readonly Estado[],
): DecisaoRestauracao {
  if (arquivo.tipo === "corrompido") return { acao: "corrompido", erro: arquivo.erro };
  if (arquivo.tipo === "ausente") {
    const ultimo = entradas[entradas.length - 1];
    return ultimo ? { acao: "recriar", estado: ultimo } : { acao: "nada" };
  }
  if (!etapaAtiva(arquivo.estado)) return { acao: "nada" };
  return entradas.length
    ? { acao: "reaplicar", estado: arquivo.estado }
    : { acao: "avisar", estado: arquivo.estado };
}

/** Pasta (relativa ao projeto) onde a discussão aprovada é arquivada. */
export function caminhoArquivamento(estado: Estado): string {
  const data = (estado.aprovadoEm ?? estado.criadoEm).slice(0, 10);
  const nome = slug(estado.pedido).slice(0, 40).replace(/-+$/, "") || "discussao";
  return `.ryker/arquivo/${data}-${nome}`;
}
