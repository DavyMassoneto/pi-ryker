export const FERRAMENTAS_LEITURA = ["read", "grep", "find", "ls"] as const;

/** Ferramentas do Ryker. As que ainda não existem na versão atual são ignoradas pelo pi. */
export const FERRAMENTAS_RYKER = ["ryker_perguntar", "ryker_temas", "ryker_documento"] as const;

export const FERRAMENTA_BLOQUEADA = "ask_user_question";

/** Conjunto ativo durante a etapa: só leitura + Ryker (a discussão não edita código). */
export function conjuntoDaEtapa(): string[] {
  return [...FERRAMENTAS_LEITURA, ...FERRAMENTAS_RYKER];
}

/** Lista a restaurar ao fim da etapa: a que estava ativa antes. */
export function restaurarConjunto(salva: readonly string[]): string[] {
  return [...salva];
}

/** Tira ask_user_question do conjunto ativo (melhor esforço; a garantia é o tool_call). */
export function semPerguntaNativa(ativas: readonly string[]): string[] {
  return ativas.filter((t) => t !== FERRAMENTA_BLOQUEADA);
}
