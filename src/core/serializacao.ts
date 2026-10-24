import { type Estado, VERSAO_ESTADO } from "./estado.ts";

export function serializar(estado: Estado): string {
  return `${JSON.stringify(estado, null, 2)}\n`;
}

export function desserializar(texto: string): Estado {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (e) {
    throw new Error(`JSON inválido: ${(e as Error).message}`);
  }
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    throw new Error("Estado inválido: esperava um objeto.");
  }
  const versao = (bruto as { versao?: unknown }).versao;
  if (versao !== VERSAO_ESTADO) {
    throw new Error(
      `Estado com versão desconhecida: ${String(versao)} (esperada ${VERSAO_ESTADO}).`,
    );
  }
  return bruto as Estado;
}
