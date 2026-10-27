export type ControlCopy = Record<string, string>;

export interface ControlSnapshotPorts {
  listPaths(): string[];
  read(path: string): string | undefined;
  write(path: string, text: string): void;
  setAside(path: string): void;
  loadCopy(): ControlCopy | undefined;
  saveCopy(copy: ControlCopy): void;
}

export interface ControlChange {
  path: string;
  before: string | undefined;
  after: string | undefined;
}

export interface ControlSnapshot {
  seed(): void;
  load(): boolean;
  recordWrite(paths: readonly string[]): void;
  changes(): ControlChange[];
  restore(paths: readonly string[]): void;
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
    changes() {
      if (reference === undefined) return [];
      const known = reference;
      const live = liveFiles();
      const paths = new Set([...Object.keys(known), ...Object.keys(live)]);
      return [...paths]
        .filter((path) => known[path] !== live[path])
        .map((path) => ({ path, before: known[path], after: live[path] }));
    },
    restore(paths) {
      if (reference === undefined) return;
      for (const path of paths) {
        const text = reference[path];
        if (text === undefined) ports.setAside(path);
        else ports.write(path, text);
      }
    },
  };
}
