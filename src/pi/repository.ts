import type { WorkspacePort } from "./driver.ts";
import { gitRunner } from "./gitExec.ts";
import {
  captureRestorePoint,
  currentBranchHead,
  restoreWorkspace,
  verifyWorkspace,
} from "./restorePoints.ts";
import { prepareStageEnvironment, type StageEnvironment } from "./stageEnvironment.ts";

export interface RepositoryPort {
  currentBranch(): string | undefined;
  workspace(cycleId: string): WorkspacePort;
  stageEnvironment(request: { branch: string; cwd: string; targetDir: string }): StageEnvironment;
}

export function gitRepository(gitRoot: string): RepositoryPort {
  const git = gitRunner(gitRoot);
  return {
    currentBranch: () => currentBranchHead(git)?.branch,
    workspace: (cycleId) => ({
      capture: (label) => captureRestorePoint(git, cycleId, label),
      verify: (point) => verifyWorkspace(git, point),
      restore: (point) => restoreWorkspace(git, point),
    }),
    stageEnvironment: (request) => prepareStageEnvironment(git, { ...request, gitRoot }),
  };
}
