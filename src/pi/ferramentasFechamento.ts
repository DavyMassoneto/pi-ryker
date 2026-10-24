import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  comandoAbrir,
  deveAbrir,
  podeGerarDocumento,
  renderizar,
  validarSinteses,
} from "../core/documento.ts";
import { aplicarTemas, etapaAtiva, type ItemTema } from "../core/estado.ts";
import { textoReabertos } from "../core/reabertura.ts";
import {
  aplicarResolucoes,
  pendentes,
  precisaRevisar,
  type Resolucao,
  resumoRevisao,
  validarResolucoes,
} from "../core/revisao.ts";
import { textoStatus } from "../core/status.ts";
import { temasAbertos } from "../core/temas.ts";
import { dialogoAprovacao } from "./aprovacao.ts";
import { gravarDocumento, lerEstado, salvarEstado } from "./persistencia.ts";
import { executarRevisor } from "./revisor.ts";

const agora = (): string => new Date().toISOString();
const Idioma = Type.Optional(Type.Union([Type.Literal("pt"), Type.Literal("en")]));

const esquemaTemas = Type.Object({
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
  idioma: Idioma,
});

const esquemaDocumento = Type.Object({
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
  idioma: Idioma,
});

const texto = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export function registrarFerramentasFechamento(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ryker_temas",
    label: "Ryker: temas",
    description:
      "Fecha temas sem perguntar ao usuário (fonte, supor, adiar) ou cria tema macro novo (criar). O lote é tudo-ou-nada. Devolve os temas ainda abertos.",
    promptSnippet: "ryker_temas: fecha temas por fonte/suposição/adiamento ou cria tema novo",
    parameters: esquemaTemas,
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const leitura = lerEstado(ctx.cwd);
      if (leitura.tipo !== "ok" || !etapaAtiva(leitura.estado)) {
        throw new Error("Não há Discussão Global ativa; o usuário inicia com /ryker <pedido>.");
      }
      let estado = leitura.estado;
      if (params.idioma && params.idioma !== estado.idioma) {
        estado = { ...estado, idioma: params.idioma };
      }
      const r = aplicarTemas(estado, params.itens as ItemTema[], agora());
      if (!r.ok) throw new Error(r.erro);
      salvarEstado(pi, ctx.cwd, r.estado);
      ctx.ui.setStatus("ryker", textoStatus(r.estado));
      const abertos = temasAbertos(r.estado.temas).map((t) => t.id);
      return {
        ...texto(
          `${params.itens.length} item(ns) aplicado(s). Temas ainda abertos: ${abertos.length ? abertos.join(", ") : "nenhum (chame ryker_documento)"}.`,
        ),
        details: { abertos },
      };
    },
  });

  pi.registerTool({
    name: "ryker_documento",
    label: "Ryker: documento",
    description:
      "Gera o documento de visão (HTML) a partir dos temas fechados e das suas sínteses curtas por seção, abre-o e pede a aprovação do usuário. Só com todos os temas fechados.",
    promptSnippet: "ryker_documento: gera o documento de visão e pede aprovação",
    parameters: esquemaDocumento,
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      const leitura = lerEstado(ctx.cwd);
      if (leitura.tipo !== "ok" || !etapaAtiva(leitura.estado)) {
        throw new Error("Não há Discussão Global ativa; o usuário inicia com /ryker <pedido>.");
      }
      if (!ctx.hasUI) throw new Error("ryker_documento precisa de interface interativa.");
      let estado = leitura.estado;
      if (estado.fase !== "descoberta" && estado.fase !== "aprovacao") {
        throw new Error(`Fase "${estado.fase}": não é possível gerar o documento agora.`);
      }
      if (params.idioma && params.idioma !== estado.idioma) {
        estado = { ...estado, idioma: params.idioma };
      }
      const pode = podeGerarDocumento(estado);
      if (!pode.ok) {
        throw new Error(
          `Ainda há temas abertos: ${pode.abertos.join(", ")}. Feche-os (ryker_perguntar ou ryker_temas) antes.`,
        );
      }
      const v = validarSinteses(estado, params.sinteses);
      if (!v.ok) throw new Error(v.erro);
      const doc = renderizar(estado, params.titulo, params.sinteses);

      // Revisor: 1 rodada só, antes de o usuário ver o documento (decisão 12).
      const resolucoes = (params.resolucoes ?? []) as Resolucao[];
      if (precisaRevisar(estado)) {
        const achados = await executarRevisor(ctx, estado, doc.texto, signal);
        estado = { ...estado, revisao: { em: agora(), achados } };
        salvarEstado(pi, ctx.cwd, estado);
        ctx.ui.notify(resumoRevisao(achados), "info");
      } else if (resolucoes.length || pendentes(estado).length) {
        const vr = validarResolucoes(estado, resolucoes);
        if (!vr.ok) throw new Error(vr.erro);
        estado = aplicarResolucoes(estado, resolucoes);
        salvarEstado(pi, ctx.cwd, estado);
      }
      const bloqueantes = pendentes(estado);
      if (bloqueantes.length) {
        const linhas = bloqueantes.map(
          (a) =>
            `- ${a.id}${a.tema ? ` [tema ${a.tema}]` : ""}${a.exigeDecisaoMacro ? " [exige decisão macro]" : ""}: ${a.texto}`,
        );
        return {
          ...texto(
            `O revisor apontou ${bloqueantes.length} achado(s) bloqueante(s). Nada foi aberto para o usuário.\n${linhas.join("\n")}\n\nResolva cada um. Só os achados marcados [exige decisão macro] viram pergunta: crie um tema (ryker_temas, ação criar, com revisa se altera algo já fechado) e pergunte (ryker_perguntar), tipo "tema". Os demais NÃO vão ao usuário: se é redação, ajuste a síntese (tipo "sintese"); se o problema está numa suposição sua, reescreva-a com ryker_temas (ação supor no tema suposto) e use tipo "suposicao". Depois chame ryker_documento de novo com "resolucoes" (achado, tipo, tema, como). Não haverá segunda revisão.`,
          ),
          details: { bloqueantes: bloqueantes.map((a) => a.id) },
        };
      }
      const docFinal = renderizar(estado, params.titulo, params.sinteses);

      const caminho = gravarDocumento(ctx.cwd, docFinal.html);
      estado = {
        ...estado,
        fase: "aprovacao",
        documento: { caminho: ".ryker/visao.html", geradoEm: agora() },
      };
      salvarEstado(pi, ctx.cwd, estado);
      let avisoCaminho = "";
      if (deveAbrir(process.env)) {
        const abrir = comandoAbrir(process.platform, caminho);
        try {
          // O código de saída não é erro (o explorer devolve 1 ao abrir com sucesso).
          await pi.exec(abrir.comando, abrir.args, { timeout: 15000 });
        } catch {
          ctx.ui.notify(`Não consegui abrir o navegador. Abra manualmente: ${caminho}`, "warning");
        }
      } else {
        // RYKER_ABRIR=0: não abre janela; só registra o caminho.
        ctx.ui.notify(`Documento: ${caminho}`, "info");
        avisoCaminho = ` Documento: ${caminho}`;
      }

      const aviso = `${docFinal.aviso ? ` ${docFinal.aviso}` : ""}${avisoCaminho}`;
      const r = await dialogoAprovacao(pi, ctx, estado);
      if (r.resultado === "aprovada") {
        return {
          ...texto(
            `Documento aprovado pelo usuário (${join(".ryker", "visao.html")}). A Discussão Global terminou; não escreva mais nada.${aviso}`,
          ),
          details: { aprovado: true },
          terminate: true,
        };
      }
      if (r.resultado === "reaberta") {
        return {
          ...texto(textoReabertos(r.itens)),
          details: { aprovado: false, reabertos: r.itens },
        };
      }
      return {
        ...texto(
          `O usuário não decidiu (Esc). Não insista; aguarde a próxima mensagem dele.${aviso}`,
        ),
        details: { aprovado: false },
      };
    },
  });
}
