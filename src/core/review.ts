import type { DiscussionState, Finding, FindingResolution } from "./state.ts";
import { findTopic } from "./topics.ts";

export type { Finding, FindingResolution } from "./state.ts";

export interface Resolution extends FindingResolution {
  achado: string;
}

export type ResolutionsValidation = { ok: true } | { ok: false; error: string };

export const REVIEWER_SYSTEM_PROMPT = `Você é o revisor da etapa Discussão Global do método Ryker. Você recebe o documento de visão gerado, o registro completo dos temas e das perguntas, e o pedido original. Sua tarefa é apontar defeitos do documento contra as decisões aprovadas: contradições, decisões que o documento omite ou distorce, suposições que na verdade mudam escopo, usuário, objetivo, restrição ou uma escolha cara de reverter, e lacunas que impedem o próximo passo. Você não faz perguntas ao usuário e não propõe o como. Responda no idioma do documento.`;

export function recordText(state: DiscussionState): string {
  const topics = state.temas.map((t) => ({
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
  const questions = state.perguntas.map((p) => ({
    id: p.id,
    tema: p.tema,
    pergunta: p.pergunta,
    opcoes: p.opcoes,
    recomendada: p.recomendada,
    resposta: p.resposta,
    livre: p.livre,
  }));
  return JSON.stringify({ temas: topics, perguntas: questions }, null, 2);
}

const OUTPUT_FORMAT = `Responda SOMENTE com um objeto JSON, sem texto antes ou depois, neste formato:
{"achados":[{"bloqueante":true,"texto":"o defeito, citando o trecho ou o tema","tema":"id do tema relacionado (opcional)","exigeDecisaoMacro":false}]}
- "bloqueante": true se o documento não deve ser mostrado ao usuário sem corrigir este ponto (contradiz uma decisão, omite uma decisão, esconde decisão macro numa suposição). false para observações menores.
- "exigeDecisaoMacro": true somente se corrigir exige uma decisão macro nova ou alterada do usuário (e não apenas redação).
- Lista vazia se não houver defeitos.`;

export function buildReviewerRequest(state: DiscussionState, documentText: string): string {
  return `## Pedido original
${state.pedido}

## Documento de visão (texto)
${documentText}

## Registro completo (temas e perguntas)
${recordText(state)}

## O que fazer
Revise o documento contra o registro e o pedido. Aponte cada defeito como um achado.

${OUTPUT_FORMAT}`;
}

export const JSON_ONLY_REQUEST =
  "\n\nSua resposta anterior não pôde ser lida como JSON. Responda SOMENTE com o objeto JSON pedido, sem cercas de código nem comentários.";

type ParsedJson = { parsed: true; value: unknown } | { parsed: false };

function tryParseJson(candidate: string): ParsedJson {
  try {
    return { parsed: true, value: JSON.parse(candidate) };
  } catch {
    return { parsed: false };
  }
}

function extractJson(text: string): unknown {
  const candidates: string[] = [text.trim()];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const i = text.indexOf("{");
  const f = text.lastIndexOf("}");
  if (i >= 0 && f > i) candidates.push(text.slice(i, f + 1));
  for (const candidate of candidates) {
    const result = tryParseJson(candidate);
    if (result.parsed) return result.value;
  }
  throw new Error("A resposta do revisor não contém JSON válido.");
}

export function parseFindings(text: string): Finding[] {
  const raw = extractJson(text) as { achados?: unknown };
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.achados)) {
    throw new Error('JSON do revisor sem o campo "achados" (lista).');
  }
  return raw.achados.map((a: Record<string, unknown>, i: number) => {
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

export function needsReview(state: DiscussionState): boolean {
  return state.revisao === undefined;
}

export function pendingFindings(state: DiscussionState): Finding[] {
  return (state.revisao?.achados ?? []).filter((a) => a.bloqueante && !a.resolucao);
}

export function reviewSummary(findings: readonly Finding[]): string {
  const b = findings.filter((a) => a.bloqueante).length;
  return `Revisor: ${findings.length} achados (${b} bloqueantes)`;
}

export function validateResolutions(
  state: DiscussionState,
  resolutions: readonly Resolution[],
): ResolutionsValidation {
  const findings = state.revisao?.achados ?? [];
  const failure = (error: string): ResolutionsValidation => ({ ok: false, error });
  for (const r of resolutions) {
    if (!findings.some((a) => a.id === r.achado)) {
      return failure(`Resolução para achado desconhecido: ${r.achado}.`);
    }
    if (!r.como?.trim()) return failure(`Resolução de ${r.achado}: descreva como (campo como).`);
    const currentFinding = findings.find((a) => a.id === r.achado);
    if (r.tipo === "tema") {
      if (!currentFinding?.exigeDecisaoMacro) {
        return failure(
          `Resolução de ${r.achado}: o achado tem exigeDecisaoMacro=false, então não vira pergunta ao usuário. Resolva por síntese ou reescrevendo a suposição (tipo "sintese" ou "suposicao").`,
        );
      }
      const t = r.tema ? findTopic(state.temas, r.tema) : undefined;
      if (!t) return failure(`Resolução de ${r.achado}: tipo "tema" exige um tema existente.`);
      if (!t.criadoEm || t.criadoEm <= (state.revisao?.em ?? "")) {
        return failure(
          `Resolução de ${r.achado}: o tema ${t.id} não foi criado depois da revisão.`,
        );
      }
      if (t.status !== "decidido" || t.origem?.tipo !== "usuario") {
        return failure(
          `Resolução de ${r.achado}: o tema ${t.id} ainda não foi fechado por pergunta ao usuário.`,
        );
      }
    } else if (r.tipo === "suposicao") {
      const t = r.tema ? findTopic(state.temas, r.tema) : undefined;
      if (!t) return failure(`Resolução de ${r.achado}: tipo "suposicao" exige um tema existente.`);
      if (t.status !== "suposto") {
        return failure(`Resolução de ${r.achado}: o tema ${t.id} não é uma suposição.`);
      }
      if (!t.revistoEm || t.revistoEm <= (state.revisao?.em ?? "")) {
        return failure(
          `Resolução de ${r.achado}: a suposição ${t.id} não foi reescrita depois da revisão (ryker_temas, ação supor).`,
        );
      }
    } else if (r.tipo !== "sintese") {
      return failure(`Resolução de ${r.achado}: tipo deve ser "tema", "sintese" ou "suposicao".`);
    }
  }
  const resolved = new Set(resolutions.map((r) => r.achado));
  const missing = findings
    .filter((a) => a.bloqueante && !a.resolucao && !resolved.has(a.id))
    .map((a) => a.id);
  if (missing.length)
    return failure(`Faltam resoluções para os achados bloqueantes: ${missing.join(", ")}.`);
  return { ok: true };
}

export function applyResolutions(
  state: DiscussionState,
  resolutions: readonly Resolution[],
): DiscussionState {
  if (!state.revisao) return state;
  return {
    ...state,
    revisao: {
      ...state.revisao,
      achados: state.revisao.achados.map((a) => {
        const r = resolutions.find((x) => x.achado === a.id);
        return r
          ? { ...a, resolucao: { tipo: r.tipo, ...(r.tema ? { tema: r.tema } : {}), como: r.como } }
          : a;
      }),
    },
  };
}
