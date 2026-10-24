import type { Estado } from "./estado.ts";
import { plural, rotulos } from "./i18n.ts";
import { temasAbertos } from "./temas.ts";

/** Texto do rodapé: "Discussão: 2 perguntas · 8 temas abertos". */
export function textoStatus(estado: Estado): string {
  const r = rotulos(estado.idioma);
  const partes = [
    plural(estado.perguntas.length, r.pergunta),
    plural(temasAbertos(estado.temas).length, r.temaAberto),
  ];
  if (estado.pausado) partes.push(r.pausada);
  return `${r.discussao}: ${partes.join(" · ")}`;
}
