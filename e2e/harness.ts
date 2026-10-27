import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { planHeadings } from "../src/core/coverage.ts";
import {
  cycleHistoryDir,
  planPath,
  progressPath,
  reviewPath,
  stageDirOfExecution,
} from "../src/core/cyclePaths.ts";
import { approve, createState, type DiscussionState } from "../src/core/state.ts";
import type { AgentRunRequest, AgentRunResult, ContinuationHooks } from "../src/pi/agent.ts";
import type { HostContext, HostDeps } from "../src/pi/cycleHost.ts";
import { gitRepository } from "../src/pi/repository.ts";

export const VALID_PLAN = `## Tasks
### T1
- repository: .
- owner: core
- paths: src
- tests: src/a.test.ts | npm test
- stubs: none
## Production order
- 3 | core | T1
## Test dependencies
- none
## Test scripts and config
- none
## Shared files
- none
## Characterization tests
- none
## Obsolete tests
- none
## Separate test commands
- none
## Old tests to alter
- none
## Stage 4 may be empty
- no
## Assumptions
- chose X | because Y
`;

export const reviewText = (status: string): string =>
  [
    "```json",
    '{"findings":[]}',
    "```",
    "text",
    "CITED: none",
    "MECHANICAL_ONLY: none",
    "RENAMED: none",
    "INTEGRATION_DEFECT: no",
    `STATUS: ${status}`,
  ].join("\n");

export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export async function until(
  condition: () => boolean,
  what: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export interface World {
  root: string;
  project: string;
  agentDir: string;
  cycleDirOf(cycleId: string): string;
  cleanup(): void;
}

export function createWorld(): World {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ryker-e2e-")));
  const project = join(root, "project");
  const agentDir = join(root, "agent");
  mkdirSync(project, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "user.name", "Ryker E2E");
  git(project, "config", "user.email", "e2e@example.invalid");
  git(project, "config", "commit.gpgsign", "false");
  writeFileSync(join(project, "calc.js"), "export const add = (a, b) => a + b;\n");
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "initial");
  mkdirSync(join(project, ".pi", "ryker"), { recursive: true });
  writeFileSync(
    join(project, ".pi", "ryker", "config.json"),
    JSON.stringify({ language: "en", owners: ["core"] }),
  );
  writeFileSync(join(project, ".pi", "ryker", "visao.html"), "<html>vision</html>");
  return {
    root,
    project,
    agentDir,
    cycleDirOf: (cycleId) => cycleHistoryDir(agentDir, project, cycleId),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export const approvedDiscussion = (): DiscussionState => {
  const created = createState({
    request: "add a subtract function",
    now: "2026-10-27T10:00:00Z",
    previous: { ferramentas: [] },
  });
  return approve({ ...created, idioma: "en" }, "2026-10-27T10:05:00Z").state;
};

export interface Screen {
  status: Map<string, string | undefined>;
  statusHistory: string[];
  widget: Map<string, string[] | undefined>;
  widgetHistory: string[][];
  notices: string[];
}

export interface FakeSession {
  ctx: HostContext & ExtensionContext;
  screen: Screen;
  invalidate(): void;
  answers: { confirm: boolean; select: string | undefined };
}

export function fakeSession(world: World, sessionId: string): FakeSession {
  const screen: Screen = {
    status: new Map(),
    statusHistory: [],
    widget: new Map(),
    widgetHistory: [],
    notices: [],
  };
  const answers = { confirm: true, select: undefined as string | undefined };
  let stale = false;
  const guard = (): void => {
    if (stale) throw new Error("This extension ctx is stale after session replacement or reload");
  };
  const ui = {
    setStatus: (key: string, text: string | undefined) => {
      guard();
      screen.status.set(key, text);
      if (text !== undefined) screen.statusHistory.push(text);
    },
    setWidget: (key: string, content: string[] | undefined) => {
      guard();
      screen.widget.set(key, content);
      if (content !== undefined) screen.widgetHistory.push(content);
    },
    notify: (message: string) => {
      guard();
      screen.notices.push(message);
    },
    confirm: async () => answers.confirm,
    select: async () => answers.select,
  };
  const ctx = {
    cwd: world.project,
    model: undefined,
    sessionManager: { getSessionId: () => sessionId, getSessionFile: () => undefined },
    modelRegistry: { find: () => undefined, getAvailable: () => [] },
    get hasUI() {
      guard();
      return true;
    },
    get ui() {
      guard();
      return ui;
    },
  } as unknown as HostContext & ExtensionContext;
  return {
    ctx,
    screen,
    invalidate: () => {
      stale = true;
    },
    answers,
  };
}

export type ChildRole = "planner" | "reviewer";
export type ChildScript = (
  request: AgentRunRequest,
  role: ChildRole,
) => Promise<Partial<AgentRunResult>> | Partial<AgentRunResult>;

export interface FakeRuntime {
  deps: HostDeps;
  requests: AgentRunRequest[];
}

export function fakeRuntime(
  world: World,
  script: ChildScript,
  heartbeatMs = 3_600_000,
): FakeRuntime {
  const requests: AgentRunRequest[] = [];
  const deps: HostDeps = {
    agentDir: world.agentDir,
    now: () => Date.now(),
    heartbeatMs,
    repository: gitRepository,
    runAgent: async (request) => {
      requests.push(request);
      const role = request.prompt.includes("Ryker reviewer") ? "reviewer" : "planner";
      const outcome = await script(request, role);
      return {
        text: "STATUS: DONE",
        aborted: false,
        leftoverCommands: 0,
        usage: { input: 60_000, output: 5_000, cacheRead: 0, cacheWrite: 0 },
        ...outcome,
      };
    },
  };
  return { deps, requests };
}

export const cycleDirOfRequest = (request: AgentRunRequest): string =>
  dirname(dirname(stageDirOfExecution(request.executionDir)));

export const approvingChild: ChildScript = (request, role) => {
  const cycleDir = cycleDirOfRequest(request);
  if (role === "planner") {
    mkdirSync(cycleDir, { recursive: true });
    writeFileSync(planPath(cycleDir), VALID_PLAN);
    return {};
  }
  writeFileSync(reviewPath(request.executionDir), reviewText("APPROVED"));
  writeFileSync(
    progressPath(request.executionDir),
    `## Coverage\n${planHeadings(VALID_PLAN).join("\n")}`,
  );
  return {};
};

export const abortable = (request: AgentRunRequest): Promise<Partial<AgentRunResult>> =>
  new Promise((done) => {
    if (request.signal.aborted) return done({ aborted: true });
    request.signal.addEventListener("abort", () => done({ aborted: true }), { once: true });
  });

export interface GuardDecision {
  block?: boolean;
  reason?: string;
}

export function probeChildGuard(request: AgentRunRequest): {
  call(toolName: string, input: Record<string, unknown>): Promise<GuardDecision | undefined>;
} {
  type Handler = (event: unknown) => Promise<GuardDecision | undefined>;
  const handlers = new Map<string, Handler>();
  const continuation: ContinuationHooks = { requestNewSession: () => {} };
  void request.guard(continuation)({
    on: (name: string, handler: Handler) => void handlers.set(name, handler),
  } as unknown as ExtensionAPI);
  return {
    call: async (toolName, input) => {
      const handler = handlers.get("tool_call");
      if (!handler) throw new Error("the child guard registered no tool_call handler");
      return handler({ toolName, input });
    },
  };
}

type PiHandler = (event: unknown, ctx: unknown) => Promise<unknown>;

export interface FakePi {
  api: ExtensionAPI;
  handlers: Map<string, PiHandler>;
  commands: Map<string, (args: string, ctx: unknown) => Promise<void>>;
  messages: string[];
}

export function fakePi(): FakePi {
  const messages: string[] = [];
  const handlers = new Map<string, PiHandler>();
  const commands = new Map<string, (args: string, ctx: unknown) => Promise<void>>();
  const api = {
    on: (name: string, handler: PiHandler) => void handlers.set(name, handler),
    registerCommand: (
      name: string,
      options: { handler: (args: string, ctx: unknown) => Promise<void> },
    ) => void commands.set(name, options.handler),
    registerTool: () => {},
    sendMessage: (message: { content: string }) => void messages.push(message.content),
    sendUserMessage: () => {},
    setActiveTools: () => {},
    getActiveTools: () => [],
    appendEntry: () => {},
  } as unknown as ExtensionAPI;
  return { api, handlers, commands, messages };
}
