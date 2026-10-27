import { dirname } from "node:path";

export function findGitRoot(
  start: string,
  hasGitEntry: (dir: string) => boolean,
): string | undefined {
  let current = start;
  for (;;) {
    if (hasGitEntry(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
