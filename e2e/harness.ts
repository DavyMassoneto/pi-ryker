import { type ChildProcess, execFileSync, execSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REAL_AGENT_DIR = join(homedir(), ".pi", "agent");
const PI_WEB_ENTRY = join(
  homedir(),
  "AppData",
  "Local",
  "pi-node",
  "current",
  "node_modules",
  "@agegr",
  "pi-web",
  "bin",
  "pi-web.js",
);
const PROVIDER = "omni-claude";
const CHEAP_MODEL = "cc/claude-haiku-5-5";
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixture");

export const sourceDir = resolve(process.env.RYKER_E2E_SOURCE ?? process.cwd());

export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export async function waitFor<T>(
  probe: () => T | undefined | false | Promise<T | undefined | false>,
  what: string,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    }
    await sleep(intervalMs);
  }
}

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => done(port));
    });
  });

const killTree = (child: ChildProcess): void => {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    child.kill("SIGKILL");
  }
};

export const VALID_PLAN = `## Tasks
### T1
- repository: .
- owner: main
- paths: calc.js
- tests: calc.test.js | npm test
- stubs: none
## Production order
- 3 | main | T1
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

const PLANNER_HINT = [
  "Format reminder for the plan file: every task heading is exactly '### T1' (nothing after the id).",
  "Under '## Stage 4 may be empty' write only '- yes' or '- no'. Keep every required section.",
].join(" ");

export interface Sandbox {
  root: string;
  agentDir: string;
  flagsDir: string;
  installedRoot: string;
  piWebPort: number;
  env: NodeJS.ProcessEnv;
  processes: ChildProcess[];
  failed: boolean;
  markFailed(): void;
  dispose(): void;
}

function isolatedEnv(
  root: string,
  agentDir: string,
  flagsDir: string,
  installedRoot: string,
): NodeJS.ProcessEnv {
  const home = join(root, "home");
  const temp = join(root, "tmp");
  const appData = join(home, "AppData", "Roaming");
  const localAppData = join(home, "AppData", "Local");
  for (const dir of [home, temp, appData, localAppData]) mkdirSync(dir, { recursive: true });
  const inherited = { ...process.env };
  delete inherited.NODE_TEST_CONTEXT;
  return {
    ...inherited,
    PI_CODING_AGENT_DIR: agentDir,
    PI_HOME: home,
    HOME: home,
    USERPROFILE: home,
    TEMP: temp,
    TMP: temp,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    PI_OFFLINE: "1",
    npm_config_cache: join(root, "npm-cache"),
    E2E_FLAGS_DIR: flagsDir,
    E2E_RYKER_ROOT: installedRoot,
  };
}

function copyProviderConfig(agentDir: string): void {
  for (const name of ["models.json", "auth.json"]) {
    const parsed = JSON.parse(readFileSync(join(REAL_AGENT_DIR, name), "utf8")) as Record<
      string,
      unknown
    >;
    const nested = parsed.providers as Record<string, unknown> | undefined;
    const entry = nested ? nested[PROVIDER] : parsed[PROVIDER];
    if (entry === undefined) throw new Error(`${name} has no ${PROVIDER} entry`);
    const kept = nested ? { ...parsed, providers: { [PROVIDER]: entry } } : { [PROVIDER]: entry };
    writeFileSync(join(agentDir, name), JSON.stringify(kept));
  }
}

function resolvePiCli(): string {
  const installRoot = join(REAL_AGENT_DIR, "install");
  const version = readFileSync(join(installRoot, "current-version"), "utf8").trim();
  const packageDir = join(
    installRoot,
    "releases",
    version,
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
  );
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin.pi;
  return resolve(packageDir, bin);
}

const NOTE_FILES = new Set(["revisao.md", "verificacao-codigo.md"]);

function collectNotes(directory: string, found: string[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectNotes(path, found);
    } else if (entry.name === "ciclo.json") {
      try {
        const record = JSON.parse(readFileSync(path, "utf8")) as { note?: string };
        found.push(`--- ${path}\nnote: ${record.note ?? "(none)"}`);
      } catch {
        found.push(`--- ${path}\n(unreadable)`);
      }
    } else if (NOTE_FILES.has(entry.name)) {
      found.push(`--- ${path}\n${readFileSync(path, "utf8")}`);
    }
  }
}

export function failureReport(root: string): string {
  const found: string[] = [];
  collectNotes(root, found);
  return [`e2e failed; sandbox kept at ${root}`, ...found].join("\n");
}

export async function createSandbox(sourceDir: string): Promise<Sandbox> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ryker-e2e-real-")));
  const agentDir = join(root, "agent");
  const flagsDir = join(root, "flags");
  const packDir = join(root, "pack");
  const installDir = join(agentDir, "ryker-install");
  const installedRoot = join(installDir, "node_modules", "pi-ryker");
  for (const dir of [agentDir, flagsDir, packDir, installDir]) mkdirSync(dir, { recursive: true });
  const env = isolatedEnv(root, agentDir, flagsDir, installedRoot);
  const packed = execSync(`npm pack --silent --pack-destination "${packDir}"`, {
    cwd: sourceDir,
    env,
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/)
    .at(-1) as string;
  const tarball = join(packDir, packed);
  writeFileSync(
    join(installDir, "package.json"),
    JSON.stringify({ name: "ryker-e2e", private: true }),
  );
  execSync(`npm install --omit=peer --no-audit --no-fund "${tarball}"`, {
    cwd: installDir,
    env,
    stdio: "pipe",
  });
  if (!existsSync(join(installedRoot, "src", "index.ts"))) {
    throw new Error("the packed tarball did not install src/index.ts");
  }
  copyProviderConfig(agentDir);
  const fixtureDir = join(agentDir, "e2e-fixture");
  cpSync(FIXTURE_DIR, fixtureDir, { recursive: true });
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({
      defaultProvider: PROVIDER,
      defaultModel: CHEAP_MODEL,
      packages: [fixtureDir.replaceAll("\\", "/")],
    }),
  );
  writeFileSync(join(flagsDir, "plan.md"), VALID_PLAN);
  const piWebPort = await freePort();
  const sandbox: Sandbox = {
    root,
    agentDir,
    flagsDir,
    installedRoot,
    piWebPort,
    env,
    processes: [],
    failed: false,
    markFailed: () => {
      sandbox.failed = true;
    },
    dispose: () => {
      for (const child of sandbox.processes) killTree(child);
      if (sandbox.failed) {
        console.error(failureReport(root));
        return;
      }
      if (process.env.RYKER_E2E_KEEP) return;
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    },
  };
  return sandbox;
}

export const setFlag = (sandbox: Sandbox, name: string, value: string): void =>
  writeFileSync(join(sandbox.flagsDir, name), value);

export const clearFlags = (sandbox: Sandbox): void => {
  for (const name of readdirSync(sandbox.flagsDir)) {
    if (name !== "plan.md" && name !== "fixture.log") rmSync(join(sandbox.flagsDir, name));
  }
};

export const useHint = (sandbox: Sandbox): void => setFlag(sandbox, "hint-planner", PLANNER_HINT);

export interface Project {
  dir: string;
  remote?: string;
}

export function createProject(sandbox: Sandbox, name: string, withRemote = false): Project {
  const dir = join(sandbox.root, "projects", name);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Ryker E2E");
  git(dir, "config", "user.email", "e2e@example.invalid");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "calc.js"), "exports.add = (a, b) => a + b;\n");
  writeFileSync(
    join(dir, "calc.test.js"),
    [
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const { add } = require('./calc.js');",
      "test('add', () => assert.equal(add(1, 2), 3));",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "0.0.0", scripts: { test: "node --test calc.test.js" } }),
  );
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "initial");
  mkdirSync(join(dir, ".pi", "ryker"), { recursive: true });
  writeFileSync(
    join(dir, ".pi", "ryker", "config.json"),
    JSON.stringify({
      language: "en",
      owners: ["main"],
      allowedRoots: [],
      piWeb: { hosts: ["127.0.0.1", "localhost"], port: sandbox.piWebPort },
      planner: { provider: PROVIDER, id: CHEAP_MODEL, thinking: "off" },
      reviewer: { provider: PROVIDER, id: CHEAP_MODEL, thinking: "off" },
    }),
  );
  if (!withRemote) return { dir };
  const remote = join(sandbox.root, "remotes", `${name}.git`);
  mkdirSync(remote, { recursive: true });
  git(remote, "init", "-q", "--bare", "-b", "main");
  git(dir, "remote", "add", "origin", remote);
  git(dir, "push", "-q", "origin", "main");
  return { dir, remote };
}

export interface CycleFile {
  cycle: { phase: string };
  closed?: string;
  runState: string;
  ownerSession?: string;
  epoch?: number;
  tokens: unknown[];
  [key: string]: unknown;
}

export const readCycle = (project: Project): CycleFile | undefined => {
  const path = join(project.dir, ".pi", "ryker", "ciclo.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CycleFile;
  } catch {
    return undefined;
  }
};

type Message = Record<string, any>;

export class RpcSession {
  readonly statuses = new Map<string, string | undefined>();
  readonly widgets = new Map<string, string[] | undefined>();
  readonly statusHistory: string[] = [];
  readonly widgetHistory: string[] = [];
  readonly notices: string[] = [];
  readonly dialogs: string[] = [];
  confirmAnswer = true;
  private readonly child: ChildProcess;
  private buffer = "";
  private counter = 0;
  private readonly pending = new Map<string, (response: Message) => void>();

  constructor(sandbox: Sandbox, cwd: string) {
    this.child = spawn(process.execPath, [resolvePiCli(), "--mode", "rpc"], {
      cwd,
      env: sandbox.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    sandbox.processes.push(this.child);
    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => this.read(chunk));
    this.child.stderr?.resume();
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf("\n");
      if (line) this.handle(line);
    }
  }

  private handle(line: string): void {
    let message: Message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === "response" && typeof message.id === "string") {
      this.pending.get(message.id)?.(message);
      return;
    }
    if (message.type !== "extension_ui_request") return;
    switch (message.method) {
      case "setStatus":
        this.statuses.set(message.statusKey, message.statusText);
        if (message.statusText) this.statusHistory.push(message.statusText);
        return;
      case "setWidget":
        this.widgets.set(message.widgetKey, message.widgetLines);
        if (message.widgetLines) this.widgetHistory.push(message.widgetLines.join(" | "));
        return;
      case "notify":
        this.notices.push(String(message.message));
        return;
      case "select": {
        this.dialogs.push(String(message.title));
        const options = message.options as string[];
        const pick = options.find((option) => /Aprovar|Approve/i.test(option)) ?? options[0];
        this.reply({ id: message.id, value: pick });
        return;
      }
      case "confirm":
        this.dialogs.push(String(message.title));
        this.reply({ id: message.id, confirmed: this.confirmAnswer });
        return;
      case "input":
      case "editor":
        this.dialogs.push(String(message.title));
        this.reply({ id: message.id, cancelled: true });
        return;
      default:
    }
  }

  private reply(body: Message): void {
    this.child.stdin?.write(`${JSON.stringify({ type: "extension_ui_response", ...body })}\n`);
  }

  send(command: Message, timeoutMs = 60_000): Promise<Message> {
    this.counter += 1;
    const id = `e2e-${this.counter}`;
    return new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`no response to ${command.type}`)), timeoutMs);
      this.pending.set(id, (response) => {
        clearTimeout(timer);
        this.pending.delete(id);
        done(response);
      });
      this.child.stdin?.write(`${JSON.stringify({ ...command, id })}\n`);
    });
  }

  command(text: string): Promise<Message> {
    return this.send({ type: "prompt", message: text });
  }

  async sessionId(): Promise<string> {
    const state = await this.send({ type: "get_state" });
    return String(state.data.sessionId);
  }

  stop(): void {
    killTree(this.child);
  }
}

export interface PiWeb {
  base: string;
  get(path: string): Promise<Message>;
  post(path: string, body: Message): Promise<Message>;
  newSession(cwd: string, message: string): Promise<string>;
  snapshot(sessionId: string): Promise<Message>;
  statusText(sessionId: string): Promise<string | undefined>;
  widgetText(sessionId: string): Promise<string>;
}

export async function startPiWeb(sandbox: Sandbox): Promise<PiWeb> {
  const child = spawn(
    process.execPath,
    [PI_WEB_ENTRY, "-H", "127.0.0.1", "-p", String(sandbox.piWebPort), "--no-open"],
    { env: sandbox.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  sandbox.processes.push(child);
  child.stdout?.resume();
  child.stderr?.resume();
  const base = `http://127.0.0.1:${sandbox.piWebPort}`;
  const get = async (path: string): Promise<Message> =>
    (await fetch(`${base}${path}`)).json() as Promise<Message>;
  const post = async (path: string, body: Message): Promise<Message> =>
    (
      await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json() as Promise<Message>;
  await waitFor(
    async () => {
      try {
        return (await fetch(`${base}/api/agent/running`)).ok;
      } catch {
        return false;
      }
    },
    "pi-web to answer",
    90_000,
    1000,
  );
  const snapshot = (sessionId: string): Promise<Message> => get(`/api/agent/${sessionId}`);
  return {
    base,
    get,
    post,
    snapshot,
    newSession: async (cwd, message) => {
      const created = await post("/api/agent/new", { cwd, type: "prompt", message });
      if (typeof created.sessionId !== "string") throw new Error("pi-web created no session");
      return created.sessionId;
    },
    statusText: async (sessionId) => {
      const data = (await snapshot(sessionId)).state ?? {};
      const entry = (data.extensionStatuses ?? []).find((item: { key: string }) =>
        item.key.startsWith("ryker"),
      );
      return entry?.text;
    },
    widgetText: async (sessionId) =>
      JSON.stringify((await snapshot(sessionId)).state?.extensionWidgets ?? []),
  };
}

export function treeContains(directory: string, needle: string): boolean {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (treeContains(path, needle)) return true;
    } else if (readFileSync(path, "utf8").includes(needle)) {
      return true;
    }
  }
  return false;
}

export function closedProbe(
  project: Project,
  what: string,
  notices: () => string[] = () => [],
): () => boolean {
  return () => {
    const record = readCycle(project);
    if (record?.closed === "stageNotBuilt") return true;
    if (record && record.runState === "paused") {
      throw new Error(
        `${what}: the cycle paused at phase ${record.cycle.phase}; notices: ${notices().join(" // ").slice(0, 1500)}`,
      );
    }
    return false;
  };
}
