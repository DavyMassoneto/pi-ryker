import { isAbsolute, join, relative } from "node:path";

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

export interface ScopedSkill {
  sourceInfo: { scope: string };
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

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function replaceProjectContextFiles(
  base: readonly ContextFile[],
  projectRoot: string,
  fromFinalBranch: readonly ContextFile[],
): ContextFile[] {
  return [...base.filter((file) => !isInside(projectRoot, file.path)), ...fromFinalBranch];
}

export function replaceProjectSkills<T extends ScopedSkill>(
  base: readonly T[],
  fromFinalBranch: readonly T[],
): T[] {
  return [...base.filter((skill) => skill.sourceInfo.scope !== "project"), ...fromFinalBranch];
}

export const stageEnvironmentDir = (stageDir: string): string => join(stageDir, "ambiente");
