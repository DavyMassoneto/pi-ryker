import { buildManifest, diffManifests } from "./controlFiles.ts";

export type ControlCopy = Record<string, string>;

export interface ControlSnapshotPorts {
  listPaths(): string[];
  read(path: string): string | undefined;
  loadCopy(): ControlCopy | undefined;
  saveCopy(copy: ControlCopy): void;
}

export interface ControlSnapshot {
  seed(): void;
  load(): boolean;
  recordWrite(paths: readonly string[]): void;
  outsideChanges(exempt: readonly string[]): string[];
}

export function createControlSnapshot(ports: ControlSnapshotPorts): ControlSnapshot {
  let reference: ControlCopy | undefined;

  const liveFiles = (): ControlCopy => {
    const files: ControlCopy = {};
    for (const path of ports.listPaths()) {
      const text = ports.read(path);
      if (text !== undefined) files[path] = text;
    }
    return files;
  };

  const store = (copy: ControlCopy): void => {
    reference = copy;
    ports.saveCopy(copy);
  };

  return {
    seed() {
      store(liveFiles());
    },
    load() {
      const copy = ports.loadCopy();
      if (copy === undefined) return false;
      reference = { ...copy };
      return true;
    },
    recordWrite(paths) {
      const next = { ...(reference ?? {}) };
      for (const path of paths) {
        const text = ports.read(path);
        if (text === undefined) delete next[path];
        else next[path] = text;
      }
      store(next);
    },
    outsideChanges(exempt) {
      if (reference === undefined) return [];
      const diff = diffManifests(buildManifest(reference), buildManifest(liveFiles()));
      const skipped = new Set(exempt);
      return [...diff.changed, ...diff.added, ...diff.removed].filter((path) => !skipped.has(path));
    },
  };
}
