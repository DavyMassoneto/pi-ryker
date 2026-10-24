import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Estado } from "../core/estado.ts";
import { rotulos } from "../core/i18n.ts";
import {
  interpretarEscolha,
  opcoesDoSelect,
  type PerguntaEntrada,
  pausar,
  registrarResposta,
} from "../core/perguntas.ts";

export interface ResultadoLote {
  estado: Estado;
  /** Respostas dadas nesta chamada, na ordem. */
  respondidas: { tema: string; resposta: string; livre: boolean }[];
  pausou: boolean;
}

/**
 * Mostra as perguntas uma por vez. Cada resposta é gravada na hora (via `salvar`) e fecha o tema.
 * Esc (ou rótulo desconhecido) interrompe o lote: as respondidas ficam e o estado vira pausado.
 */
export async function perguntarLote(
  ctx: ExtensionContext,
  estadoInicial: Estado,
  lote: readonly PerguntaEntrada[],
  salvar: (e: Estado) => void,
  agora: () => string,
  signal?: AbortSignal,
): Promise<ResultadoLote> {
  let estado = estadoInicial;
  const respondidas: ResultadoLote["respondidas"] = [];
  const r = rotulos(estado.idioma);
  for (const [i, p] of lote.entries()) {
    const titulo = `[${i + 1}/${lote.length}] ${p.tema}: ${p.pergunta}`;
    const escolha = interpretarEscolha(
      p,
      await ctx.ui.select(titulo, opcoesDoSelect(p, estado.idioma), { signal }),
      estado.idioma,
    );
    let resposta: string | undefined;
    let livre = false;
    if (escolha.tipo === "opcao") {
      resposta = escolha.texto;
    } else if (escolha.tipo === "livre") {
      const texto = await ctx.ui.input(`${p.tema}: ${p.pergunta}`, r.outraResposta, { signal });
      if (texto !== undefined && texto.trim() !== "") {
        resposta = texto.trim();
        livre = true;
      }
    }
    if (resposta === undefined) {
      estado = pausar(estado);
      salvar(estado);
      return { estado, respondidas, pausou: true };
    }
    estado = registrarResposta(estado, p, resposta, livre, agora());
    salvar(estado);
    respondidas.push({ tema: p.tema, resposta, livre });
  }
  return { estado, respondidas, pausou: false };
}
