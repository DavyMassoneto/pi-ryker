import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveLanguage } from "../core/i18n.ts";
import { type QuestionInput, validateQuestions } from "../core/questions.ts";
import { isStageActive } from "../core/state.ts";
import { statusText } from "../core/status.ts";
import { openTopics } from "../core/topics.ts";
import { ownershipRefusal, readState, saveState } from "./persistence.ts";
import { askBatch } from "./ui.ts";

const now = (): string => new Date().toISOString();

const askQuestionSchema = Type.Object({
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

export function registerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ryker_perguntar",
    label: "Ryker: perguntar",
    description:
      "Faz ao usuário perguntas MACRO da Discussão Global (o quê e o porquê), uma por vez, com opções e uma recomendada. Única forma permitida de perguntar nesta etapa.",
    promptSnippet: "ryker_perguntar: pergunta decisões macro ao usuário (Discussão Global)",
    parameters: askQuestionSchema,
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      const stateRead = readState(ctx.cwd);
      if (stateRead.kind !== "ok" || !isStageActive(stateRead.state)) {
        throw new Error("Não há Discussão Global ativa; o usuário inicia com /ryker <pedido>.");
      }
      const refusal = ownershipRefusal(stateRead.state, ctx.sessionManager.getSessionId());
      if (refusal) throw new Error(refusal);
      if (!ctx.hasUI) throw new Error("ryker_perguntar precisa de interface interativa.");
      const languageResult = resolveLanguage(stateRead.state, params.idioma);
      if (!languageResult.ok) throw new Error(languageResult.error);
      const state = languageResult.state;
      const batch: QuestionInput[] = params.perguntas;
      const v = validateQuestions(state, batch);
      if (!v.ok) throw new Error(v.error);

      const r = await askBatch(
        ctx,
        { ...state, pausado: false },
        batch,
        (e) => {
          saveState(pi, ctx.cwd, e);
          ctx.ui.setStatus("ryker", statusText(e));
        },
        now,
        signal,
      );
      const open = openTopics(r.state.temas).map((t) => t.id);
      const lines = r.answeredQuestions.map(
        (x) => `- ${x.topic}: ${x.answer}${x.free ? " (resposta livre do usuário)" : ""}`,
      );
      const parts = [
        r.answeredQuestions.length
          ? `Respostas registradas:\n${lines.join("\n")}`
          : "Nenhuma resposta registrada.",
      ];
      if (r.paused) {
        parts.push(
          "O usuário pausou a discussão (Esc). Não faça novas perguntas agora: resuma em uma frase o que falta e aguarde a próxima mensagem dele.",
        );
      } else {
        parts.push(`Temas ainda abertos: ${open.length ? open.join(", ") : "nenhum"}.`);
      }
      return {
        content: [{ type: "text", text: parts.join("\n\n") }],
        details: {
          respondidas: r.answeredQuestions.map(({ topic, answer, free }) => ({
            tema: topic,
            resposta: answer,
            livre: free,
          })),
          pausou: r.paused,
          abertos: open,
        },
      };
    },
  });
}
