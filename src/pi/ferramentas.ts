import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { etapaAtiva } from "../core/estado.ts";
import { resolverIdioma } from "../core/i18n.ts";
import { type PerguntaEntrada, validarPerguntas } from "../core/perguntas.ts";
import { textoStatus } from "../core/status.ts";
import { temasAbertos } from "../core/temas.ts";
import { lerEstado, salvarEstado } from "./persistencia.ts";
import { perguntarLote } from "./ui.ts";

const agora = (): string => new Date().toISOString();

const esquemaPerguntar = Type.Object({
  perguntas: Type.Array(
    Type.Object({
      tema: Type.String({
        description: "Id de um tema ainda aberto (veja a lista na seção Ryker).",
      }),
      pergunta: Type.String({ description: "A pergunta macro, direta e curta." }),
      opcoes: Type.Array(Type.String(), {
        minItems: 2,
        maxItems: 5,
        description: "De 2 a 5 opções distintas. Não inclua 'Outra resposta…'.",
      }),
      recomendada: Type.Integer({ description: "Índice (base 0) da opção que você recomenda." }),
    }),
    { minItems: 1, maxItems: 4, description: "Até 4 perguntas, de temas diferentes." },
  ),
  idioma: Type.Optional(
    Type.String({
      description:
        'Tag do idioma em que o usuário escreve (ex.: "pt-BR", "en", "es"). Obrigatório na primeira chamada.',
    }),
  ),
});

export function registrarFerramentas(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ryker_perguntar",
    label: "Ryker: perguntar",
    description:
      "Faz ao usuário perguntas MACRO da Discussão Global (o quê e o porquê), uma por vez, com opções e uma recomendada. Única forma permitida de perguntar nesta etapa.",
    promptSnippet: "ryker_perguntar: pergunta decisões macro ao usuário (Discussão Global)",
    parameters: esquemaPerguntar,
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      const leitura = lerEstado(ctx.cwd);
      if (leitura.tipo !== "ok" || !etapaAtiva(leitura.estado)) {
        throw new Error("Não há Discussão Global ativa; o usuário inicia com /ryker <pedido>.");
      }
      if (!ctx.hasUI) throw new Error("ryker_perguntar precisa de interface interativa.");
      const ri = resolverIdioma(leitura.estado, params.idioma);
      if (!ri.ok) throw new Error(ri.erro);
      const estado = ri.estado;
      const lote: PerguntaEntrada[] = params.perguntas;
      const v = validarPerguntas(estado, lote);
      if (!v.ok) throw new Error(v.erro);

      const r = await perguntarLote(
        ctx,
        { ...estado, pausado: false },
        lote,
        (e) => {
          salvarEstado(pi, ctx.cwd, e);
          ctx.ui.setStatus("ryker", textoStatus(e));
        },
        agora,
        signal,
      );
      const abertos = temasAbertos(r.estado.temas).map((t) => t.id);
      const linhas = r.respondidas.map(
        (x) => `- ${x.tema}: ${x.resposta}${x.livre ? " (resposta livre do usuário)" : ""}`,
      );
      const partes = [
        r.respondidas.length
          ? `Respostas registradas:\n${linhas.join("\n")}`
          : "Nenhuma resposta registrada.",
      ];
      if (r.pausou) {
        partes.push(
          "O usuário pausou a discussão (Esc). Não faça novas perguntas agora: resuma em uma frase o que falta e aguarde a próxima mensagem dele.",
        );
      } else {
        partes.push(`Temas ainda abertos: ${abertos.length ? abertos.join(", ") : "nenhum"}.`);
      }
      return {
        content: [{ type: "text", text: partes.join("\n\n") }],
        details: { respondidas: r.respondidas, pausou: r.pausou, abertos },
      };
    },
  });
}
