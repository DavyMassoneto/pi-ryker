import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import {
  type ContextFile,
  contextFilesFor,
  isEnvironmentPath,
  skillFoldersFor,
} from "../core/stageEnvironment.ts";
import { readText, writeAtomic } from "./fsAdapters.ts";
import type { GitRunner } from "./gitExec.ts";

export interface StageEnvironment {
  branch: string;
  gitRoot: string;
  contextFiles: ContextFile[];
  skillFolders: string[];
  agentDefinitions: string[];
}

export interface StageEnvironmentRequest {
  branch: string;
  gitRoot: string;
  cwd: string;
  targetDir: string;
}

const INDEX_FILE = "ambiente.json";
const AGENT_DEFINITIONS = "/.pi/agents/";

const toPosix = (path: string): string => path.split(sep).join("/");

function readIndex(targetDir: string): StageEnvironment | undefined {
  const text = readText(join(targetDir, INDEX_FILE));
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as StageEnvironment;
  } catch {
    return undefined;
  }
}

export function prepareStageEnvironment(
  git: GitRunner,
  request: StageEnvironmentRequest,
): StageEnvironment {
  const existing = readIndex(request.targetDir);
  if (existing) return existing;
  const tracked = git
    .run(["ls-tree", "-r", "-z", "--name-only", request.branch])
    .split("\0")
    .filter((path) => path !== "" && isEnvironmentPath(path));
  for (const path of tracked) {
    const destination = join(request.targetDir, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, git.bytes(["show", `${request.branch}:${path}`]));
  }
  const cwdRelative = toPosix(relative(request.gitRoot, request.cwd));
  const environment: StageEnvironment = {
    branch: request.branch,
    gitRoot: request.gitRoot,
    contextFiles: contextFilesFor(cwdRelative, tracked).map((path) => ({
      path: join(request.gitRoot, path),
      content: readText(join(request.targetDir, path)) ?? "",
    })),
    skillFolders: skillFoldersFor(cwdRelative).map((folder) => join(request.targetDir, folder)),
    agentDefinitions: tracked
      .filter((path) => `/${path}`.includes(AGENT_DEFINITIONS))
      .map((path) => join(request.targetDir, path)),
  };
  writeAtomic(join(request.targetDir, INDEX_FILE), JSON.stringify(environment, null, 2));
  return environment;
}
