import { relative, resolve, sep } from "node:path";

export interface OpenCycleEntry {
  cycleId: string;
  ownerSession: string;
  directories: string[];
}

function contains(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel));
}

export function cyclesTouching(
  index: readonly OpenCycleEntry[],
  directory: string,
): OpenCycleEntry[] {
  return index.filter((entry) =>
    entry.directories.some((dir) => contains(dir, directory) || contains(directory, dir)),
  );
}
