export interface Usage {
  stage: number;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Totals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export type Ledger = readonly Usage[];

export const usageTotal = (u: Usage): number => u.input + u.output + u.cacheRead + u.cacheWrite;

export function addUsage(ledger: Ledger, usage: Usage): Usage[] {
  return [...ledger, usage];
}

function groupBy<K>(ledger: Ledger, key: (u: Usage) => K): Map<K, Totals> {
  const groups = new Map<K, Totals>();
  for (const u of ledger) {
    const current = groups.get(key(u)) ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    };
    groups.set(key(u), {
      input: current.input + u.input,
      output: current.output + u.output,
      cacheRead: current.cacheRead + u.cacheRead,
      cacheWrite: current.cacheWrite + u.cacheWrite,
      total: current.total + usageTotal(u),
    });
  }
  return groups;
}

export const totalsByStage = (ledger: Ledger): Map<number, Totals> =>
  groupBy(ledger, (u) => u.stage);
export const totalsByModel = (ledger: Ledger): Map<string, Totals> =>
  groupBy(ledger, (u) => u.model);
export const grandTotal = (ledger: Ledger): number =>
  ledger.reduce((sum, u) => sum + usageTotal(u), 0);
