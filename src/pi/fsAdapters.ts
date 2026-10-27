import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { ControlSnapshotPorts } from "../core/controlSnapshot.ts";
import { configPath, cycleRecordPath, gitControlPaths } from "../core/cyclePaths.ts";
import { type LockStore, lockPath } from "../core/lock.ts";
import type { OpenCycleEntry } from "../core/openCycles.ts";

export function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

export const fileLockStore: LockStore = {
  read: readText,
  createExclusive: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    try {
      writeFileSync(path, text, { encoding: "utf8", flag: "wx" });
      return true;
    } catch {
      return false;
    }
  },
  replaceIfUnchanged: (path, expected, text) => {
    if (readText(path) !== expected) return false;
    writeAtomic(path, text);
    return true;
  },
};

export const removeFile = (path: string): void => rmSync(path, { force: true });

export function filesIn(folder: string): string[] {
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(folder, entry.name));
  } catch {
    return [];
  }
}

export function controlPaths(directory: string, gitRoot: string): string[] {
  const gitFiles = [
    ...filesIn(join(gitRoot, ".git", "hooks")),
    ...filesIn(join(gitRoot, ".git", "info")),
  ];
  return [configPath(directory), cycleRecordPath(directory), ...gitControlPaths(gitRoot, gitFiles)];
}

const COPY_FOLDER = "controle";
const COPY_FILE = "controle.json";
const ASIDE_FOLDER = "separados";

export function setAsideFile(cycleDir: string): (path: string) => void {
  return (path) => {
    if (!existsSync(path)) return;
    const inside = relative(cycleDir, path);
    const name =
      inside.startsWith("..") || isAbsolute(inside) ? path.replace(/[:\\/]+/g, "_") : inside;
    const target = join(cycleDir, COPY_FOLDER, ASIDE_FOLDER, String(Date.now()), name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(path, target);
    rmSync(path, { force: true });
  };
}

function filesUnder(folder: string, skipFolder: string): string[] {
  try {
    return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return path === skipFolder ? [] : filesUnder(path, skipFolder);
      return entry.isFile() ? [path] : [];
    });
  } catch {
    return [];
  }
}

export function controlSnapshotPorts(
  directory: string,
  gitRoot: string,
  cycleDir: string,
): ControlSnapshotPorts {
  const copyFolder = join(cycleDir, COPY_FOLDER);
  const copyFile = join(copyFolder, COPY_FILE);
  return {
    listPaths: () => [
      ...controlPaths(directory, gitRoot),
      lockPath(gitRoot),
      ...filesUnder(cycleDir, copyFolder),
    ],
    read: readText,
    write: writeAtomic,
    setAside: setAsideFile(cycleDir),
    loadCopy() {
      try {
        const parsed: unknown = JSON.parse(readText(copyFile) ?? "");
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, string>)
          : undefined;
      } catch {
        return undefined;
      }
    },
    saveCopy: (copy) => writeAtomic(copyFile, JSON.stringify(copy, null, 2)),
  };
}

export function readOpenCycles(indexPath: string): OpenCycleEntry[] {
  try {
    const parsed = JSON.parse(readText(indexPath) ?? "[]");
    return Array.isArray(parsed) ? (parsed as OpenCycleEntry[]) : [];
  } catch {
    return [];
  }
}

export function addOpenCycle(indexPath: string, entry: OpenCycleEntry): void {
  const rest = readOpenCycles(indexPath).filter((item) => item.cycleId !== entry.cycleId);
  writeAtomic(indexPath, JSON.stringify([...rest, entry], null, 2));
}

export function removeOpenCycle(indexPath: string, cycleId: string): void {
  const rest = readOpenCycles(indexPath).filter((item) => item.cycleId !== cycleId);
  writeAtomic(indexPath, JSON.stringify(rest, null, 2));
}

export function readGitAliases(directory: string): Record<string, string> {
  try {
    const output = execFileSync("git", ["config", "--get-regexp", "^alias\\."], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const aliases: Record<string, string> = {};
    for (const line of output.split(/\r?\n/)) {
      const match = /^alias\.(\S+)\s+(.*)$/.exec(line);
      if (match?.[1] && match[2] !== undefined) aliases[match[1]] = match[2];
    }
    return aliases;
  } catch {
    return {};
  }
}

export function ensureExcluded(gitRoot: string, pattern: string): void {
  const exclude = join(gitRoot, ".git", "info", "exclude");
  if (!existsSync(join(gitRoot, ".git"))) return;
  const current = readText(exclude) ?? "";
  if (current.split(/\r?\n/).includes(pattern)) return;
  mkdirSync(dirname(exclude), { recursive: true });
  appendFileSync(exclude, `${current === "" || current.endsWith("\n") ? "" : "\n"}${pattern}\n`);
}
