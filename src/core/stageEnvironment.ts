import { join } from "node:path";

export const CONTEXT_FILE_NAMES = [
  "AGENTS.override.md",
  "AGENTS.md",
  "AGENTS.MD",
  "CLAUDE.md",
  "CLAUDE.MD",
] as const;

const ENVIRONMENT_FOLDERS = [".pi/skills/", ".agents/skills/", ".pi/agents/"];

export interface ContextFile {
  path: string;
  content: string;
}

const lastSegment = (path: string): string => path.split("/").pop() ?? path;

export function isEnvironmentPath(relativePath: string): boolean {
  const name = lastSegment(relativePath);
  if ((CONTEXT_FILE_NAMES as readonly string[]).includes(name)) return true;
  const rooted = `/${relativePath}`;
  return ENVIRONMENT_FOLDERS.some((folder) => rooted.includes(`/${folder}`));
}

export function ancestorFolders(cwdRelative: string): string[] {
  const parts = cwdRelative.split("/").filter((part) => part !== "");
  return ["", ...parts.map((_part, index) => parts.slice(0, index + 1).join("/"))];
}

const inFolder = (folder: string, name: string): string =>
  folder === "" ? name : `${folder}/${name}`;

export function contextFilesFor(cwdRelative: string, branchFiles: readonly string[]): string[] {
  const present = new Set(branchFiles);
  const chosen: string[] = [];
  for (const folder of ancestorFolders(cwdRelative)) {
    const found = CONTEXT_FILE_NAMES.map((name) => inFolder(folder, name)).find((path) =>
      present.has(path),
    );
    if (found) chosen.push(found);
  }
  return chosen;
}

export function skillFoldersFor(cwdRelative: string): string[] {
  const agentsFolders = ancestorFolders(cwdRelative)
    .reverse()
    .map((folder) => inFolder(folder, ".agents/skills"));
  return [inFolder(cwdRelative, ".pi/skills"), ...agentsFolders];
}

export const stageEnvironmentDir = (stageDir: string): string => join(stageDir, "ambiente");
