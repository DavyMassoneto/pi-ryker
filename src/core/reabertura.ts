import type { Estado, ResultadoTemas } from "./estado.ts";
import { rotulos } from "./i18n.ts";
import type { Fechamento, Tema } from "./temas.ts";

export interface ItemReabertura {
  tema: string;
  nota: string;
}

/**
 * Reabre temas fechados a pedido do usuário (decisão 10: só ele reabre). Guarda o fechamento
 * anterior no histórico, volta a fase para descoberta e invalida o documento. A revisão é
 * mantida: a rodada é única (decisão 12), então o documento novo não é revisado de novo.
 */
export function reabrirTemas(
  estado: Estado,
  itens: readonly ItemReabertura[],
  agora: string,
): ResultadoTemas {
  if (estado.fase === "aprovada") {
    return { ok: false, erro: "A discussão já foi aprovada; não há o que reabrir." };
  }
  if (itens.length === 0) return { ok: false, erro: "Nenhum tema para reabrir." };
  const ids = new Set<string>();
  for (const it of itens) {
    const t = estado.temas.find((x) => x.id === it.tema);
    if (!t) return { ok: false, erro: `O tema "${it.tema}" não existe.` };
    if (t.status === "aberto") return { ok: false, erro: `O tema ${t.id} já está aberto.` };
    ids.add(t.id);
  }
  const temas = estado.temas.map((t): Tema => {
    if (!ids.has(t.id)) return t;
    const anterior: Fechamento = {
      status: t.status,
      ...(t.texto !== undefined ? { texto: t.texto } : {}),
      ...(t.motivo !== undefined ? { motivo: t.motivo } : {}),
      ...(t.quando !== undefined ? { quando: t.quando } : {}),
      ...(t.origem ? { origem: t.origem } : {}),
    };
    const { texto: _t, motivo: _m, quando: _q, origem: _o, ...resto } = t;
    const nota = itens.find((i) => i.tema === t.id)?.nota.trim() ?? "";
    return {
      ...resto,
      status: "aberto",
      historico: [...t.historico, anterior],
      reabertura: { nota, em: agora },
    };
  });
  const { documento: _d, ...semDocumento } = estado;
  return { ok: true, estado: { ...semDocumento, temas, fase: "descoberta", pausado: false } };
}

const rotuloTema = (t: Tema, marcado: boolean): string =>
  `${marcado ? "✓ " : ""}${t.id} — ${t.titulo}`;

/** Opções do select do laço "Corrigir pontos": temas fechados + Concluir. */
export function opcoesSelecao(estado: Estado, selecionados: readonly string[]): string[] {
  const fechados = estado.temas.filter((t) => t.status !== "aberto");
  return [
    ...fechados.map((t) => rotuloTema(t, selecionados.includes(t.id))),
    rotulos(estado.idioma).concluir,
  ];
}

export type PassoSelecao =
  | { tipo: "selecao"; selecionados: string[] }
  | { tipo: "concluir"; selecionados: string[] }
  | { tipo: "voltar" };

/** Alterna o tema escolhido; "Concluir" sem seleção, Esc ou rótulo desconhecido voltam à aprovação. */
export function interpretarSelecao(
  estado: Estado,
  selecionados: readonly string[],
  escolha: string | undefined,
): PassoSelecao {
  if (escolha === undefined) return { tipo: "voltar" };
  if (escolha === rotulos(estado.idioma).concluir) {
    return selecionados.length
      ? { tipo: "concluir", selecionados: [...selecionados] }
      : { tipo: "voltar" };
  }
  const fechados = estado.temas.filter((t) => t.status !== "aberto");
  const alvo = fechados.find((t) => rotuloTema(t, selecionados.includes(t.id)) === escolha);
  if (!alvo) return { tipo: "voltar" };
  const novos = selecionados.includes(alvo.id)
    ? selecionados.filter((id) => id !== alvo.id)
    : [...selecionados, alvo.id];
  return { tipo: "selecao", selecionados: novos };
}

/** Mensagem ao modelo depois de o usuário reabrir temas. */
export function textoReabertos(itens: readonly ItemReabertura[]): string {
  const linhas = itens.map(
    (i) => `- ${i.tema}${i.nota.trim() ? `: ${i.nota.trim()}` : " (sem nota)"}`,
  );
  return `O usuário reabriu estes temas na revisão do documento:\n${linhas.join("\n")}\n\nPergunte só sobre eles, com ryker_perguntar (só o usuário os fecha; fonte, supor e adiar são recusados). Quando todos estiverem fechados, chame ryker_documento de novo com as sínteses atualizadas; não haverá nova revisão.`;
}
