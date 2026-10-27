import { isPortuguese } from "./i18n.ts";
import type { Language } from "./state.ts";

const SECTIONS_PT = [
  "Problema e para quem",
  "Resultado esperado",
  "Apetite",
  "O que entra",
  "O que fica fora",
  "Restrições duras",
  "Escolhas caras de reverter",
  "Riscos",
  "Suposições (aprovadas em bloco)",
  "Adiados",
  "Registro",
];

const SECTIONS_EN = [
  "Problem and audience",
  "Expected outcome",
  "Appetite",
  "In scope",
  "Out of scope",
  "Hard constraints",
  "Costly-to-reverse choices",
  "Risks",
  "Assumptions (approved as a block)",
  "Deferred",
  "Record",
];

export interface DocumentLabels {
  sections: string[];
  request: string;
  none: string;
  why: string;
  decideWhen: string;
  origin: string;
  user: string;
  source: string;
  agent: string;
  answered: string;
  free: string;
  warning: string;
  appendix: string;
  assumption: string;
  decisions: string;
  onlyAssumptions: string;
  replaced: string;
  before: string;
  appendixNote: string;
}

export function documentLabels(language?: Language): DocumentLabels {
  return isPortuguese(language)
    ? {
        sections: SECTIONS_PT,
        decisions: "Decisões registradas",
        onlyAssumptions:
          "Sem decisões do usuário nesta seção; veja suposições (9) ou adiados (10).",
        replaced: "substituído por",
        before: "antes",
        assumption: "Suposição do agente, não decidida pelo usuário",
        appendix: "Apêndice: observações do revisor",
        appendixNote: "Pontos não bloqueantes. Conteste o que discordar.",
        request: "Pedido original",
        none: "Nada nesta seção.",
        why: "Por que não perguntei",
        decideWhen: "Decidir quando",
        origin: "Origem",
        user: "usuário",
        source: "fonte",
        agent: "agente",
        answered: "Resposta",
        free: "resposta livre",
        warning:
          "O documento passou do tamanho-alvo (1 a 3 páginas); considere sínteses mais curtas.",
      }
    : {
        sections: SECTIONS_EN,
        decisions: "Recorded decisions",
        onlyAssumptions: "No user decisions in this section; see assumptions (9) or deferred (10).",
        replaced: "replaced by",
        before: "before",
        assumption: "Agent assumption, not decided by the user",
        appendix: "Appendix: reviewer notes",
        appendixNote: "Non-blocking points. Challenge anything you disagree with.",
        request: "Original request",
        none: "Nothing in this section.",
        why: "Why I did not ask",
        decideWhen: "Decide when",
        origin: "Origin",
        user: "user",
        source: "source",
        agent: "agent",
        answered: "Answer",
        free: "free answer",
        warning:
          "The document exceeded the target size (1 to 3 pages); consider shorter summaries.",
      };
}
