import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  canGenerateDocument,
  openCommand,
  render,
  shouldOpen,
  validateSyntheses,
} from "../core/document.ts";
import { isPortuguese, resolveLanguage } from "../core/i18n.ts";
import { reopenedMessage } from "../core/reopening.ts";
import {
  applyResolutions,
  needsReview,
  pendingFindings,
  type Resolution,
  reviewSummary,
  validateResolutions,
} from "../core/review.ts";
import { applyTopics, isStageActive, type TopicItem } from "../core/state.ts";
import { statusText } from "../core/status.ts";
import { openTopics } from "../core/topics.ts";
import { approvalDialog } from "./approval.ts";
import { startStageTwo } from "./cycleHost.ts";
import { ownershipRefusal, readState, saveState, writeDocument } from "./persistence.ts";
import { runReviewer } from "./reviewer.ts";

const now = (): string => new Date().toISOString();
const Language = Type.Optional(
  Type.String({
    description:
      'Tag do idioma em que o usuário escreve (ex.: "pt-BR", "en", "es"). Obrigatório na primeira chamada.',
  }),
);

const topicsSchema = Type.Object({
  itens: Type.Array(
    Type.Object({
      acao: Type.Union(
        [
          Type.Literal("fonte"),
          Type.Literal("supor"),
          Type.Literal("adiar"),
          Type.Literal("criar"),
        ],
        { description: "fonte | supor | adiar | criar" },
      ),
      tema: Type.Optional(Type.String({ description: "Id do tema aberto (fonte, supor, adiar)." })),
      titulo: Type.Optional(Type.String({ description: "Título do tema novo (criar)." })),
      secao: Type.Optional(Type.Integer({ description: "Seção 1..8 do tema novo (criar)." })),
      texto: Type.Optional(
        Type.String({
          description: "Decisão (fonte), padrão assumido (supor) ou o que fica pendente (adiar).",
        }),
      ),
      origem: Type.Optional(
        Type.String({ description: "fonte: caminho do arquivo ou trecho citado." }),
      ),
      motivo: Type.Optional(Type.String({ description: "supor: por que não perguntou." })),
      quando: Type.Optional(Type.String({ description: "adiar: quando/como será decidido." })),
      revisa: Type.Optional(
        Type.String({
          description: "criar: id de tema decidido que este novo tema obriga a rever.",
        }),
      ),
    }),
    { minItems: 1, maxItems: 20 },
  ),
  idioma: Language,
});

const documentSchema = Type.Object({
  titulo: Type.String({ description: "Título curto do documento de visão." }),
  sinteses: Type.Array(
    Type.Object({
      secao: Type.Integer({ description: "Seção 1..8." }),
      texto: Type.String({
        description: "Síntese curta (2 a 5 linhas) do que foi decidido na seção.",
      }),
    }),
    { description: "Uma síntese por seção que tenha tema decidido." },
  ),
  resolucoes: Type.Optional(
    Type.Array(
      Type.Object({
        achado: Type.String({ description: "Id do achado bloqueante (ex.: a1)." }),
        tipo: Type.Union([
          Type.Literal("tema"),
          Type.Literal("sintese"),
          Type.Literal("suposicao"),
        ]),
        tema: Type.Optional(
          Type.String({
            description: 'tipo "tema": id do tema criado depois da revisão e fechado por pergunta.',
          }),
        ),
        como: Type.String({ description: "Como o achado foi resolvido." }),
      }),
      { description: "Resolução de cada achado bloqueante, ao chamar de novo após a revisão." },
    ),
  ),
  idioma: Language,
});

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

const stageTwoNotice = {
  started: {
    en: "Document approved by the user. Vision approved. The Ryker code now runs stage 2 (planner agent, then reviewer agent) on its own, outside this conversation; its status is in the status bar. Do not plan or carry out anything yourself and do not ask the user about it. Tell the user in one sentence that the cycle started and that /ryker parar, /ryker pausar and /ryker retomar control it.",
    pt: "Documento aprovado pelo usuário. Visão aprovada. O código do Ryker agora conduz a etapa 2 (agente planejador e depois agente revisor) por conta própria, fora desta conversa; o status aparece na barra de status. Não planeje nem execute nada você mesmo e não pergunte nada ao usuário sobre isso. Diga ao usuário em uma frase que o ciclo começou e que /ryker parar, /ryker pausar e /ryker retomar o controlam.",
  },
  refused: {
    en: "Document approved by the user. Vision approved, but the Ryker cycle could not start:",
    pt: "Documento aprovado pelo usuário. Visão aprovada, mas o ciclo do Ryker não pôde começar:",
  },
  refusedTail: {
    en: "Report this reason to the user in one sentence. Do not plan or carry out the vision yourself.",
    pt: "Informe esse motivo ao usuário em uma frase. Não planeje nem execute a visão você mesmo.",
  },
} as const;

function approvalHandoffText(
  language: string | undefined,
  started: Awaited<ReturnType<typeof startStageTwo>>,
  warning: string,
): string {
  const key = isPortuguese(language) ? "pt" : "en";
  if (started.ok) return `${stageTwoNotice.started[key]}${warning}`;
  return `${stageTwoNotice.refused[key]} ${started.message}. ${stageTwoNotice.refusedTail[key]}${warning}`;
}

export function registerClosingTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ryker_temas",
    label: "Ryker: temas",
    description:
      "Fecha temas sem perguntar ao usuário (fonte, supor, adiar) ou cria tema macro novo (criar). O lote é tudo-ou-nada. Devolve os temas ainda abertos.",
    promptSnippet: "ryker_temas: fecha temas por fonte/suposição/adiamento ou cria tema novo",
    parameters: topicsSchema,
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const stateRead = readState(ctx.cwd);
      if (stateRead.kind !== "ok" || !isStageActive(stateRead.state)) {
        throw new Error("Não há Discussão Global ativa; o usuário inicia com /ryker <pedido>.");
      }
      const refusal = ownershipRefusal(stateRead.state, ctx.sessionManager.getSessionId());
      if (refusal) throw new Error(refusal);
      const languageResult = resolveLanguage(stateRead.state, params.idioma);
      if (!languageResult.ok) throw new Error(languageResult.error);
      const state = languageResult.state;
      const r = applyTopics(state, params.itens as TopicItem[], now());
      if (!r.ok) throw new Error(r.error);
      saveState(pi, ctx.cwd, r.state);
      ctx.ui.setStatus("ryker", statusText(r.state));
      const open = openTopics(r.state.temas).map((t) => t.id);
      return {
        ...text(
          `${params.itens.length} item(ns) aplicado(s). Temas ainda abertos: ${open.length ? open.join(", ") : "nenhum (chame ryker_documento)"}.`,
        ),
        details: { abertos: open },
      };
    },
  });

  pi.registerTool({
    name: "ryker_documento",
    label: "Ryker: documento",
    description:
      "Gera o documento de visão (HTML) a partir dos temas fechados e das suas sínteses curtas por seção, abre-o e pede a aprovação do usuário. Só com todos os temas fechados.",
    promptSnippet: "ryker_documento: gera o documento de visão e pede aprovação",
    parameters: documentSchema,
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      const stateRead = readState(ctx.cwd);
      if (stateRead.kind !== "ok" || !isStageActive(stateRead.state)) {
        throw new Error("Não há Discussão Global ativa; o usuário inicia com /ryker <pedido>.");
      }
      const refusal = ownershipRefusal(stateRead.state, ctx.sessionManager.getSessionId());
      if (refusal) throw new Error(refusal);
      if (!ctx.hasUI) throw new Error("ryker_documento precisa de interface interativa.");
      const languageResult = resolveLanguage(stateRead.state, params.idioma);
      if (!languageResult.ok) throw new Error(languageResult.error);
      let state = languageResult.state;
      if (state.fase !== "descoberta" && state.fase !== "aprovacao") {
        throw new Error(`Fase "${state.fase}": não é possível gerar o documento agora.`);
      }
      const canProceed = canGenerateDocument(state);
      if (!canProceed.ok) {
        throw new Error(
          `Ainda há temas abertos: ${canProceed.open.join(", ")}. Feche-os (ryker_perguntar ou ryker_temas) antes.`,
        );
      }
      const v = validateSyntheses(state, params.sinteses);
      if (!v.ok) throw new Error(v.error);
      const doc = render(state, params.titulo, params.sinteses);

      const resolutions = (params.resolucoes ?? []) as Resolution[];
      if (needsReview(state)) {
        const findings = await runReviewer(ctx, state, doc.text, signal);
        state = { ...state, revisao: { em: now(), achados: findings } };
        saveState(pi, ctx.cwd, state);
        ctx.ui.notify(reviewSummary(findings), "info");
      } else if (resolutions.length || pendingFindings(state).length) {
        const validation = validateResolutions(state, resolutions);
        if (!validation.ok) throw new Error(validation.error);
        state = applyResolutions(state, resolutions);
        saveState(pi, ctx.cwd, state);
      }
      const blockingFindings = pendingFindings(state);
      if (blockingFindings.length) {
        const lines = blockingFindings.map(
          (a) =>
            `- ${a.id}${a.tema ? ` [tema ${a.tema}]` : ""}${a.exigeDecisaoMacro ? " [exige decisão macro]" : ""}: ${a.texto}`,
        );
        return {
          ...text(
            `O revisor apontou ${blockingFindings.length} achado(s) bloqueante(s). Nada foi aberto para o usuário.\n${lines.join("\n")}\n\nResolva cada um. Só os achados marcados [exige decisão macro] viram pergunta: crie um tema (ryker_temas, ação criar, com revisa se altera algo já fechado) e pergunte (ryker_perguntar), tipo "tema". Os demais NÃO vão ao usuário: se é redação, ajuste a síntese (tipo "sintese"); se o problema está numa suposição sua, reescreva-a com ryker_temas (ação supor no tema suposto) e use tipo "suposicao". Depois chame ryker_documento de novo com "resolucoes" (achado, tipo, tema, como). Não haverá segunda revisão.`,
          ),
          details: { bloqueantes: blockingFindings.map((a) => a.id) },
        };
      }
      const finalDoc = render(state, params.titulo, params.sinteses);

      const path = writeDocument(ctx.cwd, finalDoc.html);
      state = {
        ...state,
        fase: "aprovacao",
        documento: { caminho: ".pi/ryker/visao.html", geradoEm: now() },
      };
      saveState(pi, ctx.cwd, state);
      let pathWarning = "";
      if (shouldOpen(process.env)) {
        const openCmd = openCommand(process.platform, path);
        try {
          await pi.exec(openCmd.command, openCmd.args, { timeout: 15000 });
        } catch {
          ctx.ui.notify(`Não consegui abrir o navegador. Abra manualmente: ${path}`, "warning");
        }
      } else {
        ctx.ui.notify(`Documento: ${path}`, "info");
        pathWarning = ` Documento: ${path}`;
      }

      const warning = `${finalDoc.warning ? ` ${finalDoc.warning}` : ""}${pathWarning}`;
      const r = await approvalDialog(pi, ctx, state);
      if (r.result === "approved") {
        const started = await startStageTwo(pi, ctx, state);
        return {
          ...text(approvalHandoffText(state.idioma, started, warning)),
          details: { aprovado: true },
        };
      }
      if (r.result === "reopened") {
        return {
          ...text(reopenedMessage(r.items)),
          details: { aprovado: false, reabertos: r.items },
        };
      }
      return {
        ...text(
          `O usuário não decidiu (Esc). Não insista; aguarde a próxima mensagem dele.${warning}`,
        ),
        details: { aprovado: false },
      };
    },
  });
}
