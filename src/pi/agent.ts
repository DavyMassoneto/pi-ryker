import type { Api, Model } from "@earendil-works/pi-ai/compat";
import {
  type BashOperations,
  createAgentSession,
  createBashToolDefinition,
  createLocalBashOperations,
  DefaultResourceLoader,
  type ExtensionFactory,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { Thinking } from "../core/cycleConfig.ts";
import { trackShell } from "./processes.ts";

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

export interface SessionRequest {
  cwd: string;
  sessionDir: string;
  model: Model<Api> | undefined;
  thinking: Thinking | undefined;
  guard: ExtensionFactory;
  shellEnv: Record<string, string>;
  shellOperations: BashOperations;
}

export interface AgentRunRequest {
  cwd: string;
  prompt: string;
  executionDir: string;
  model: Model<Api> | undefined;
  thinking: Thinking | undefined;
  guard: ExtensionFactory;
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

const NO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

async function createChildSession(request: SessionRequest): Promise<ChildSession> {
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: request.cwd,
    agentDir,
    noExtensions: true,
    extensionFactories: [request.guard],
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
  const abort = (): void => {
    tracker.abortAll();
    void session?.abort();
  };
  try {
    session = await deps.createSession({
      cwd: request.cwd,
      sessionDir: request.executionDir,
      model: request.model,
      thinking: request.thinking,
      guard: request.guard,
      shellEnv: request.shellEnv,
      shellOperations: tracker.operations,
    });
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    await session.prompt(request.prompt);
    const leftoverCommands = tracker.running();
    tracker.abortAll();
    return {
      text: session.getLastAssistantText() ?? "",
      aborted: request.signal.aborted,
      leftoverCommands,
      usage: session.getSessionStats().tokens,
    };
  } catch (e) {
    return {
      text: session?.getLastAssistantText() ?? "",
      aborted: request.signal.aborted,
      error: (e as Error).message,
      leftoverCommands: tracker.running(),
      usage: session?.getSessionStats().tokens ?? NO_USAGE,
    };
  } finally {
    request.signal.removeEventListener("abort", abort);
    tracker.abortAll();
    session?.dispose();
  }
}
