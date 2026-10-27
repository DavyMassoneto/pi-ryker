import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

interface Step {
  bash?: string;
  sleep?: number;
  writePlan?: boolean;
  writeReview?: string;
  writeProgress?: boolean;
  text?: string;
}

const VISION = [
  "<html><body><h1>Vision: add multiply to calc.js</h1>",
  "<h2>Goal</h2><p>calc.js exports add. Add and export multiply(a, b) returning a * b.</p>",
  "<h2>Scope</h2><p>Only calc.js and calc.test.js, in this repository. One task.</p>",
  "<h2>Acceptance</h2><p>calc.test.js covers multiply(2, 3) = 6 and npm test passes.</p>",
  "<h2>Decisions</h2><p>CommonJS exports, node:test, no new dependencies. The scope is final.</p>",
  "</body></html>",
].join("\n");

const flagsDir = process.env.E2E_FLAGS_DIR as string;
const installedRoot = process.env.E2E_RYKER_ROOT as string;

const flag = (name: string): string | undefined => {
  const path = join(flagsDir, name);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
};

const log = (line: string): void =>
  appendFileSync(join(flagsDir, "fixture.log"), `${new Date().toISOString()} ${line}\n`);

const load = <T>(relative: string): Promise<T> =>
  import(pathToFileURL(join(installedRoot, relative)).href);

type CycleHost = typeof import("../../src/pi/cycleHost.ts");
type HostDeps = import("../../src/pi/cycleHost.ts").HostDeps;
type AgentRunRequest = import("../../src/pi/agent.ts").AgentRunRequest;

export default async function fixture(pi: ExtensionAPI): Promise<void> {
  const ryker = (await load<typeof import("../../src/index.ts")>("src/index.ts")).default;
  const host = await load<CycleHost>("src/pi/cycleHost.ts");
  const paths = await load<typeof import("../../src/core/cyclePaths.ts")>("src/core/cyclePaths.ts");
  const coverage = await load<typeof import("../../src/core/coverage.ts")>("src/core/coverage.ts");
  const stateModule = await load<typeof import("../../src/core/state.ts")>("src/core/state.ts");
  ryker(pi);

  const scriptedModel = (steps: Step[], request: AgentRunRequest): AgentRunRequest["model"] => {
    const registration = registerFauxProvider({
      provider: "omni-claude",
      models: [{ id: "scripted", contextWindow: 1_000_000, maxTokens: 8000 }],
      tokensPerSecond: 5000,
    });
    const cycleDir = dirname(dirname(paths.stageDirOfExecution(request.executionDir)));
    const plan = flag("plan.md") ?? "";
    const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) =>
      fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
    registration.setResponses(
      steps.map((step) => {
        if (step.bash) return call("bash", { command: step.bash });
        if (step.sleep) {
          return call("bash", {
            command: `node -e "setTimeout(()=>{},${step.sleep * 1000})"`,
          });
        }
        if (step.writePlan) return call("write", { path: paths.planPath(cycleDir), content: plan });
        if (step.writeReview) {
          return call("write", {
            path: paths.reviewPath(request.executionDir),
            content: step.writeReview,
          });
        }
        if (step.writeProgress) {
          return call("write", {
            path: paths.progressPath(request.executionDir),
            content: `## Coverage\n${coverage.planHeadings(plan).join("\n")}`,
          });
        }
        return fauxAssistantMessage([fauxText(step.text ?? "done")]);
      }),
    );
    return registration.getModel();
  };

  const hostDeps = (): HostDeps => {
    const deps = host.defaultHostDeps();
    const inner = deps.runAgent;
    deps.runAgent = (request: AgentRunRequest) => {
      const role = request.prompt.includes("Ryker reviewer") ? "reviewer" : "planner";
      const hint = flag(`hint-${role}`);
      const script = flag(`faux-${role}`);
      let next = request;
      if (hint) next = { ...next, prompt: `${next.prompt}\n\n${hint}` };
      if (script) next = { ...next, model: scriptedModel(JSON.parse(script), request) };
      log(`run ${role} scripted=${Boolean(script)}`);
      return inner(next);
    };
    return deps;
  };

  pi.registerCommand("e2e-start", {
    description: "e2e fixture: start stage 2 on a pre-approved discussion",
    async handler(_args: string, ctx: ExtensionCommandContext) {
      mkdirSync(join(ctx.cwd, ".pi", "ryker"), { recursive: true });
      writeFileSync(join(ctx.cwd, ".pi", "ryker", "visao.html"), VISION);
      const created = stateModule.createState({
        request: "add a multiply function to calc.js",
        now: new Date().toISOString(),
        previous: { ferramentas: [] },
      });
      const approved = stateModule.approve({ ...created, idioma: "en" }, new Date().toISOString());
      writeFileSync(
        join(ctx.cwd, ".pi", "ryker", "discussao.json"),
        JSON.stringify(approved.state),
      );
      const started = await host.startStageTwo(pi, ctx, approved.state, hostDeps());
      log(`start ${JSON.stringify(started)}`);
      ctx.ui.notify(`e2e-start: ${JSON.stringify(started)}`, "info");
    },
  });
}
