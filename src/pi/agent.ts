import { existsSync } from "node:fs";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import {
  type BashOperations,
  createAgentSession,
  createBashToolDefinition,
  createLocalBashOperations,
  DefaultResourceLoader,
  type ExtensionFactory,
  getAgentDir,
  loadSkillsFromDir,
  SessionManager,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { Thinking } from "../core/cycleConfig.ts";
import { trackShell } from "./processes.ts";
import type { StageEnvironment } from "./stageEnvironment.ts";

export const AGENT_TOOLS = ["read", "grep", "find", "ls", "write", "edit", "bash"];

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ChildSession {
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  getSessionStats(): { tokens: TokenUsage };
  getLastAssistantText(): string | undefined;
}

export interface ContinuationHooks {
  requestNewSession(): void;
}

export interface SessionRequest {
  cwd: string;
  sessionDir: string;
  model: Model<Api> | undefined;
  thinking: Thinking | undefined;
  guard: ExtensionFactory;
  environment: StageEnvironment | undefined;
  shellEnv: Record<string, string>;
  shellOperations: BashOperations;
}

export interface AgentRunRequest {
  cwd: string;
  prompt: string;
  executionDir: string;
  model: Model<Api> | undefined;
  thinking: Thinking | undefined;
  guard: (continuation: ContinuationHooks) => ExtensionFactory;
  environment?: StageEnvironment;
  shellEnv: Record<string, string>;
  signal: AbortSignal;
}

export interface AgentRunResult {
  text: string;
  aborted: boolean;
  error?: string;
  leftoverCommands: number;
  usage: TokenUsage;
}

export interface AgentDeps {
  createSession(request: SessionRequest): Promise<ChildSession>;
  baseOperations(): BashOperations;
}

type LoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];

const NO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const FINAL_BRANCH_SOURCE = "ryker-final-branch";

const addTokens = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

function finalBranchSkills(environment: StageEnvironment): Skill[] {
  return environment.skillFolders
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => loadSkillsFromDir({ dir, source: FINAL_BRANCH_SOURCE }).skills);
}

export function environmentOverrides(
  environment: StageEnvironment | undefined,
): Pick<LoaderOptions, "skillsOverride" | "agentsFilesOverride"> {
  return {
    skillsOverride: (base) => ({
      skills: environment ? finalBranchSkills(environment) : [],
      diagnostics: base.diagnostics,
    }),
    agentsFilesOverride: () => ({ agentsFiles: environment ? environment.contextFiles : [] }),
  };
}

async function createChildSession(request: SessionRequest): Promise<ChildSession> {
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: request.cwd,
    agentDir,
    noExtensions: true,
    extensionFactories: [request.guard],
    ...environmentOverrides(request.environment),
  });
  await resourceLoader.reload();
  const bash = createBashToolDefinition(request.cwd, {
    operations: request.shellOperations,
    spawnHook: (context) => ({ ...context, env: { ...context.env, ...request.shellEnv } }),
  });
  const { session } = await createAgentSession({
    cwd: request.cwd,
    agentDir,
    ...(request.model ? { model: request.model } : {}),
    ...(request.thinking ? { thinkingLevel: request.thinking } : {}),
    tools: AGENT_TOOLS,
    customTools: [bash as never],
    resourceLoader,
    sessionManager: SessionManager.create(request.cwd, request.sessionDir),
  });
  return session;
}

export const realAgentDeps: AgentDeps = {
  createSession: createChildSession,
  baseOperations: () => createLocalBashOperations(),
};

export async function runChildAgent(
  request: AgentRunRequest,
  deps: AgentDeps = realAgentDeps,
): Promise<AgentRunResult> {
  const tracker = trackShell(deps.baseOperations());
  let session: ChildSession | undefined;
  let usage = NO_USAGE;
  let text = "";
  const abort = (): void => {
    tracker.abortAll();
    void session?.abort();
  };
  const closeSession = (): void => {
    if (!session) return;
    usage = addTokens(usage, session.getSessionStats().tokens);
    text = session.getLastAssistantText() ?? text;
    session.dispose();
    session = undefined;
  };
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    let continueInNewSession = true;
    while (continueInNewSession && !request.signal.aborted) {
      continueInNewSession = false;
      const hooks: ContinuationHooks = {
        requestNewSession: () => {
          continueInNewSession = true;
          void session?.abort();
        },
      };
      session = await deps.createSession({
        cwd: request.cwd,
        sessionDir: request.executionDir,
        model: request.model,
        thinking: request.thinking,
        guard: request.guard(hooks),
        environment: request.environment,
        shellEnv: request.shellEnv,
        shellOperations: tracker.operations,
      });
      try {
        await session.prompt(request.prompt);
      } catch (e) {
        if (!continueInNewSession) throw e;
      }
      closeSession();
    }
    const leftoverCommands = tracker.running();
    tracker.abortAll();
    return { text, aborted: request.signal.aborted, leftoverCommands, usage };
  } catch (e) {
    const leftoverCommands = tracker.running();
    closeSession();
    return {
      text,
      aborted: request.signal.aborted,
      error: (e as Error).message,
      leftoverCommands,
      usage,
    };
  } finally {
    request.signal.removeEventListener("abort", abort);
    tracker.abortAll();
    closeSession();
  }
}
