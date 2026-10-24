import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  comandoAbrir,
  podeGerarDocumento,
  renderizar,
  validarSinteses,
} from "../core/documento.ts";
import { aplicarTemas, aprovar, etapaAtiva, type ItemTema } from "../core/estado.ts";
import { textoStatus } from "../core/status.ts";
import { temasAbertos } from "../core/temas.ts";
import { gravarDocumento, lerEstado, salvarEstado } from "./persistencia.ts";

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
    async execute(_id, params, _signal, _onUpdate, ctx) {
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

      // F3: ponto de encaixe do revisor (1 rodada, antes de abrir o documento).
      // Se houver achado bloqueante sem resolução, devolver os achados aqui sem gravar nem abrir.

      const caminho = gravarDocumento(ctx.cwd, doc.html);
      estado = {
        ...estado,
        fase: "aprovacao",
        documento: { caminho: ".ryker/visao.html", geradoEm: agora() },
      };
      salvarEstado(pi, ctx.cwd, estado);
      const abrir = comandoAbrir(process.platform, caminho);
      try {
        // O código de saída não é erro (o explorer devolve 1 ao abrir com sucesso).
        await pi.exec(abrir.comando, abrir.args, { timeout: 15000 });
      } catch {
        ctx.ui.notify(`Não consegui abrir o navegador. Abra manualmente: ${caminho}`, "warning");
      }

      const en = estado.idioma === "en";
      const APROVAR = en ? "Approve" : "Aprovar";
      const CORRIGIR = en ? "Fix points" : "Corrigir pontos";
      const escolha = await ctx.ui.select(
        en ? "Vision document ready. Approve?" : "Documento de visão pronto. Aprovar?",
        [APROVAR, CORRIGIR],
      );
      const aviso = doc.aviso ? ` ${doc.aviso}` : "";

      if (escolha === APROVAR) {
        const ap = aprovar(estado, agora());
        salvarEstado(pi, ctx.cwd, ap.estado);
        // Restauração direta. Plano B, se o setModel dentro do execute der problema:
        // guardar a intenção e restaurar o modelo em um handler de "agent_settled".
        pi.setActiveTools(ap.ferramentas);
        if (ap.modelo) {
          const m = ctx.modelRegistry
            .getAvailable()
            .find((x) => x.provider === ap.modelo?.provider && x.id === ap.modelo?.id);
          if (m) await pi.setModel(m);
        }
        ctx.ui.setStatus("ryker", undefined);
        ctx.ui.notify(
          en
            ? "Vision approved. Model and tools restored."
            : "Visão aprovada. Modelo e ferramentas restaurados.",
          "info",
        );
        return {
          ...texto(
            `Documento aprovado pelo usuário (${join(".ryker", "visao.html")}). A Discussão Global terminou; não escreva mais nada.${aviso}`,
          ),
          details: { aprovado: true },
          terminate: true,
        };
      }
      // Corrigir pontos (ou Esc): o laço de reabertura completo é F5.
      return {
        ...texto(
          escolha === CORRIGIR
            ? `O usuário pediu correções, mas a reabertura de temas ainda não está implementada. Diga isso em uma frase e aguarde a próxima mensagem dele.${aviso}`
            : `O usuário não decidiu (Esc). Não insista; aguarde a próxima mensagem dele.${aviso}`,
        ),
        details: { aprovado: false },
      };
    },
  });
}
