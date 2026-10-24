import type { Achado, Estado, ResolucaoAchado } from "./estado.ts";
import { achaTema } from "./temas.ts";

export type { Achado, ResolucaoAchado } from "./estado.ts";

export interface Resolucao extends ResolucaoAchado {
  achado: string;
}

export type ValidaResolucoes = { ok: true } | { ok: false; erro: string };

export const PROMPT_SISTEMA_REVISOR = `Você é o revisor da etapa Discussão Global do método Ryker. Você recebe o documento de visão gerado, o registro completo dos temas e das perguntas, e o pedido original. Sua tarefa é apontar defeitos do documento contra as decisões aprovadas: contradições, decisões que o documento omite ou distorce, suposições que na verdade mudam escopo, usuário, objetivo, restrição ou uma escolha cara de reverter, e lacunas que impedem o próximo passo. Você não faz perguntas ao usuário e não propõe o como. Responda no idioma do documento.`;

/** Registro completo: cada tema com status/origem e cada pergunta com a resposta. */
export function textoRegistro(estado: Estado): string {
  const temas = estado.temas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    secao: t.secao,
    status: t.status,
    texto: t.texto,
    motivo: t.motivo,
    quando: t.quando,
    origem: t.origem,
    revisa: t.revisa,
  }));
  const perguntas = estado.perguntas.map((p) => ({
    id: p.id,
    tema: p.tema,
    pergunta: p.pergunta,
    opcoes: p.opcoes,
    recomendada: p.recomendada,
    resposta: p.resposta,
    livre: p.livre,
  }));
  return JSON.stringify({ temas, perguntas }, null, 2);
}

const FORMATO = `Responda SOMENTE com um objeto JSON, sem texto antes ou depois, neste formato:
{"achados":[{"bloqueante":true,"texto":"o defeito, citando o trecho ou o tema","tema":"id do tema relacionado (opcional)","exigeDecisaoMacro":false}]}
- "bloqueante": true se o documento não deve ser mostrado ao usuário sem corrigir este ponto (contradiz uma decisão, omite uma decisão, esconde decisão macro numa suposição). false para observações menores.
- "exigeDecisaoMacro": true somente se corrigir exige uma decisão macro nova ou alterada do usuário (e não apenas redação).
- Lista vazia se não houver defeitos.`;

export function montarPedidoRevisor(estado: Estado, documentoTexto: string): string {
  return `## Pedido original
${estado.pedido}

## Documento de visão (texto)
${documentoTexto}

## Registro completo (temas e perguntas)
${textoRegistro(estado)}

## O que fazer
Revise o documento contra o registro e o pedido. Aponte cada defeito como um achado.

${FORMATO}`;
}

export const PEDIDO_SO_JSON =
  "\n\nSua resposta anterior não pôde ser lida como JSON. Responda SOMENTE com o objeto JSON pedido, sem cercas de código nem comentários.";

function extrairJson(texto: string): unknown {
  const candidatos: string[] = [texto.trim()];
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) candidatos.push(cerca[1].trim());
  const i = texto.indexOf("{");
  const f = texto.lastIndexOf("}");
  if (i >= 0 && f > i) candidatos.push(texto.slice(i, f + 1));
  for (const c of candidatos) {
    try {
      return JSON.parse(c);
    } catch {
      // tenta o próximo candidato
    }
  }
  throw new Error("A resposta do revisor não contém JSON válido.");
}

export function parseAchados(texto: string): Achado[] {
  const bruto = extrairJson(texto) as { achados?: unknown };
  if (!bruto || typeof bruto !== "object" || !Array.isArray(bruto.achados)) {
    throw new Error('JSON do revisor sem o campo "achados" (lista).');
  }
  return bruto.achados.map((a: Record<string, unknown>, i: number) => {
    const ref = `achado ${i + 1}`;
    if (typeof a?.texto !== "string" || !a.texto.trim()) throw new Error(`${ref}: falta texto.`);
    if (typeof a.bloqueante !== "boolean") throw new Error(`${ref}: falta bloqueante (boolean).`);
    if (typeof a.exigeDecisaoMacro !== "boolean") {
      throw new Error(`${ref}: falta exigeDecisaoMacro (boolean).`);
    }
    return {
      id: `a${i + 1}`,
      bloqueante: a.bloqueante,
      texto: a.texto.trim(),
      exigeDecisaoMacro: a.exigeDecisaoMacro,
      ...(typeof a.tema === "string" && a.tema ? { tema: a.tema } : {}),
    };
  });
}

/** Rodada única: só revisa se ainda não houve revisão. */
export function precisaRevisar(estado: Estado): boolean {
  return estado.revisao === undefined;
}

export function pendentes(estado: Estado): Achado[] {
  return (estado.revisao?.achados ?? []).filter((a) => a.bloqueante && !a.resolucao);
}

export function resumoRevisao(achados: readonly Achado[]): string {
  const b = achados.filter((a) => a.bloqueante).length;
  return `Revisor: ${achados.length} achados (${b} bloqueantes)`;
}

export function validarResolucoes(
  estado: Estado,
  resolucoes: readonly Resolucao[],
): ValidaResolucoes {
  const achados = estado.revisao?.achados ?? [];
  const falha = (erro: string): ValidaResolucoes => ({ ok: false, erro });
  for (const r of resolucoes) {
    if (!achados.some((a) => a.id === r.achado)) {
      return falha(`Resolução para achado desconhecido: ${r.achado}.`);
    }
    if (!r.como?.trim()) return falha(`Resolução de ${r.achado}: descreva como (campo como).`);
    if (r.tipo === "tema") {
      const t = r.tema ? achaTema(estado.temas, r.tema) : undefined;
      if (!t) return falha(`Resolução de ${r.achado}: tipo "tema" exige um tema existente.`);
      if (!t.criadoEm || t.criadoEm <= (estado.revisao?.em ?? "")) {
        return falha(`Resolução de ${r.achado}: o tema ${t.id} não foi criado depois da revisão.`);
      }
      if (t.status !== "decidido" || t.origem?.tipo !== "usuario") {
        return falha(
          `Resolução de ${r.achado}: o tema ${t.id} ainda não foi fechado por pergunta ao usuário.`,
        );
      }
    } else if (r.tipo !== "sintese") {
      return falha(`Resolução de ${r.achado}: tipo deve ser "tema" ou "sintese".`);
    }
  }
  const resolvidos = new Set(resolucoes.map((r) => r.achado));
  const faltam = achados
    .filter((a) => a.bloqueante && !a.resolucao && !resolvidos.has(a.id))
    .map((a) => a.id);
  if (faltam.length)
    return falha(`Faltam resoluções para os achados bloqueantes: ${faltam.join(", ")}.`);
  return { ok: true };
}

export function aplicarResolucoes(estado: Estado, resolucoes: readonly Resolucao[]): Estado {
  if (!estado.revisao) return estado;
  return {
    ...estado,
    revisao: {
      ...estado.revisao,
      achados: estado.revisao.achados.map((a) => {
        const r = resolucoes.find((x) => x.achado === a.id);
        return r
          ? { ...a, resolucao: { tipo: r.tipo, ...(r.tema ? { tema: r.tema } : {}), como: r.como } }
          : a;
      }),
    },
  };
}
