import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { planHeadings } from "../core/coverage.ts";
import type { AgentRole } from "../core/cyclePaths.ts";
import { planPath, progressPath, reviewPath } from "../core/cyclePaths.ts";
import type { CycleRecord } from "../core/cycleRecord.ts";
import { newCycleRecord } from "../core/cycleRecord.ts";
import type { AgentRunResult } from "./agent.ts";
import { createStageDriver, type DriverPorts } from "./driver.ts";

const CYCLE_DIR = join("/h", "cycle");
const CONTROL = join("/p", ".pi", "ryker", "ciclo.json");

const VALID_PLAN = `## Tasks
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

const review = (status: string): string =>
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

type Script = (
  role: AgentRole,
  dir: string,
  fs: Map<string, string>,
  round: number,
) => Partial<AgentRunResult>;

interface Harness {
  ports: DriverPorts;
  fs: Map<string, string>;
  saved: CycleRecord[];
  notices: string[];
  announced: string[];
  closed: CycleRecord[];
  prompts: string[];
  control: Map<string, string>;
  lease: { mine: boolean };
}

function harness(script: Script): Harness {
  const fs = new Map<string, string>();
  const control = new Map<string, string>([[CONTROL, "{}"]]);
  const saved: CycleRecord[] = [];
  const notices: string[] = [];
  const announced: string[] = [];
  const closed: CycleRecord[] = [];
  const prompts: string[] = [];
  const lease = { mine: true };
  let round = 1;
  const ports: DriverPorts = {
    cycleDir: CYCLE_DIR,
    config: { allowedRoots: [], owners: ["core"], language: "en" },
    inputFiles: ["/p/.ryker/visao.html"],
    files: {
      read: (path) => fs.get(path),
      write: (path, text) => void fs.set(path, text),
      ensureDir: () => {},
    },
    control: {
      snapshot: (extra) => {
        const snapshot = Object.fromEntries(control);
        for (const path of extra) snapshot[path] = fs.get(path) ?? "";
        return snapshot;
      },
      restore: (before) => {
        for (const [path, text] of Object.entries(before)) control.set(path, text);
      },
    },
    runAgent: async (role, prompt, dir) => {
      prompts.push(prompt);
      const outcome = script(role, dir, fs, round);
      if (role === "reviewer") round += 1;
      return {
        text: "STATUS: DONE",
        aborted: false,
        leftoverCommands: 0,
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
        ...outcome,
      };
    },
    modelLabel: (role) => `model-${role}`,
    lease: {
      epoch: 1,
      epochStillMine: () => lease.mine,
      heartbeat: () => lease.mine,
      release: () => {},
    },
    saveRecord: (record) => void saved.push(record),
    showView: () => {},
    notify: (message) => void notices.push(message),
    announce: (summary) => void announced.push(summary),
    onClosed: (record) => void closed.push(record),
  };
  return { ports, fs, saved, notices, announced, closed, prompts, control, lease };
}

const fresh = (): CycleRecord =>
  newCycleRecord({
    cycleId: "c1",
    ownerSession: "s1",
    epoch: 1,
    directories: ["/p"],
    language: "en",
  });

const writeApprovedReview: Script = (role, dir, fs) => {
  if (role === "planner") {
    fs.set(planPath(CYCLE_DIR), VALID_PLAN);
    return {};
  }
  fs.set(reviewPath(dir), review("APPROVED"));
  fs.set(progressPath(dir), `## Coverage\n${planHeadings(VALID_PLAN).join("\n")}`);
  return {};
};

test("driver: planner then reviewer approve stage 2, close the cycle and announce it (F1a)", async () => {
  const h = harness(writeApprovedReview);
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().cycle.phase, "approved");
  assert.equal(driver.record().closed, "stageNotBuilt");
  assert.equal(h.closed.length, 1);
  assert.match(h.announced[0] ?? "", /stage 2 \(Planning\) approved in round 1/);
  assert.equal(driver.record().tokens.length, 2);
  assert.equal(driver.record().tokens[0]?.model, "model-planner");
});

test("driver: sends each agent its fixed prompt with the cycle paths (U7)", async () => {
  const h = harness(writeApprovedReview);
  await createStageDriver(fresh(), h.ports).run();
  assert.match(h.prompts[0] ?? "", /You are the Ryker planner for stage 2/);
  assert.match(h.prompts[0] ?? "", /\.ryker[\\/]visao\.html/);
  assert.match(h.prompts[1] ?? "", /Ryker reviewer of stage 2, round 1/);
});

test("driver: rejected review runs a second round, a second rejection stops the cycle (D-USR-METODO.2)", async () => {
  const h = harness((role, dir, fs) => {
    if (role === "planner") {
      fs.set(planPath(CYCLE_DIR), VALID_PLAN);
      return {};
    }
    fs.set(reviewPath(dir), review("REJECTED"));
    fs.set(progressPath(dir), `## Coverage\n${planHeadings(VALID_PLAN).join("\n")}`);
    return {};
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.equal(driver.record().cycle.round, 2);
  assert.equal(driver.record().runState, "paused");
  assert.equal(driver.record().closed, undefined);
  assert.equal(h.closed.length, 0);
  assert.match(h.announced[0] ?? "", /stopped: both rounds were used/);
});

test("driver: an invalid plan fails the round without running the reviewer", async () => {
  const h = harness((role, _dir, fs) => {
    if (role === "planner") fs.set(planPath(CYCLE_DIR), "## Tasks\n");
    return {};
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.equal(
    h.prompts.every((p) => p.includes("planner")),
    true,
  );
});

test("driver: incomplete reviewer coverage counts as no STATUS (COB-2)", async () => {
  const h = harness((role, dir, fs) => {
    if (role === "planner") {
      fs.set(planPath(CYCLE_DIR), VALID_PLAN);
      return {};
    }
    fs.set(reviewPath(dir), review("APPROVED"));
    fs.set(progressPath(dir), "## Coverage\nTasks");
    return {};
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.notEqual(driver.record().cycle.phase, "approved");
});

test("driver: planner BACK_TO_DISCUSSION closes back to the Discussion", async () => {
  const h = harness(() => ({ text: "STATUS: BACK_TO_DISCUSSION" }));
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().closed, "backToDiscussion");
});

test("driver: an agent that rewrites a control file is restored and the round fails (P5)", async () => {
  const h = harness((role, _dir, fs) => {
    if (role === "planner") fs.set(planPath(CYCLE_DIR), VALID_PLAN);
    return {};
  });
  const tamper = h.ports.runAgent;
  h.ports.runAgent = async (...args) => {
    h.control.set(CONTROL, '{"hacked":true}');
    return tamper(...args);
  };
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.control.get(CONTROL), "{}");
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.match(h.notices.join("\n"), /restored, round failed/);
});

test("driver: a control file changed outside an execution pauses the cycle (M2b)", async () => {
  const h = harness(writeApprovedReview);
  let prepared = 0;
  h.ports.files.ensureDir = () => {
    prepared += 1;
    if (prepared === 2) h.control.set(CONTROL, '{"edited":"by hand"}');
  };
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().runState, "paused");
  assert.match(h.notices.join("\n"), /changed outside an agent execution/);
  assert.equal(driver.record().closed, undefined);
  assert.equal(h.prompts.length, 1);
});

test("driver: commands left running by the agent fail the round (C1b, P40)", async () => {
  const h = harness((role, _dir, fs) => {
    if (role === "planner") fs.set(planPath(CYCLE_DIR), VALID_PLAN);
    return { leftoverCommands: 2 };
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.match(h.notices.join("\n"), /2 agent command/);
});

test("driver: stop during an execution pauses without counting a round (P36)", async () => {
  const h = harness(() => ({ aborted: true }));
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().runState, "paused");
  assert.equal(driver.record().cycle.round, 1);
  assert.equal(driver.record().cycle.phase, "planning");
});

test("driver: stop aborts the running agent through its signal", async () => {
  const h = harness(writeApprovedReview);
  let seen: AbortSignal | undefined;
  h.ports.runAgent = (_role, _prompt, _dir, _progress, signal) => {
    seen = signal;
    return new Promise((resolve) => {
      signal.addEventListener("abort", () =>
        resolve({
          text: "",
          aborted: true,
          leftoverCommands: 0,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }),
      );
    });
  };
  const driver = createStageDriver(fresh(), h.ports);
  const running = driver.run();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(driver.isExecuting(), true);
  driver.stop();
  await running;
  assert.equal(seen?.aborted, true);
  assert.equal(driver.record().runState, "paused");
});

test("driver: pause requested during an execution waits for it to finish (SUP-43)", async () => {
  const h = harness(writeApprovedReview);
  const runAgent = h.ports.runAgent;
  const driver = createStageDriver(fresh(), h.ports);
  h.ports.runAgent = async (...args) => {
    driver.requestPause();
    return runAgent(...args);
  };
  await driver.run();
  assert.equal(driver.record().runState, "paused");
  assert.equal(driver.record().cycle.phase, "planning");
  assert.equal(h.prompts.length, 1);
});

test("driver: resume after a pause restarts the interrupted round from the first producer (Q1)", async () => {
  const h = harness(writeApprovedReview);
  const runAgent = h.ports.runAgent;
  const driver = createStageDriver(fresh(), h.ports);
  let first = true;
  h.ports.runAgent = async (...args) => {
    if (first) {
      first = false;
      driver.requestPause();
    }
    return runAgent(...args);
  };
  await driver.run();
  const pausedPhase = driver.record().cycle.phase;
  const resumed = await driver.resume();
  assert.equal(resumed.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(pausedPhase, "planning");
  assert.equal(driver.record().closed, "stageNotBuilt");
});

test("driver: resume is refused when running, closed or stopped", async () => {
  const h = harness(writeApprovedReview);
  const driver = createStageDriver(fresh(), h.ports);
  assert.equal((await driver.resume()).ok, false);
  await driver.run();
  assert.equal((await driver.resume()).ok, false);
});

test("driver: a lost epoch writes nothing more and stops (r2-N7)", async () => {
  const h = harness(writeApprovedReview);
  const driver = createStageDriver(fresh(), h.ports);
  h.lease.mine = false;
  await driver.run();
  assert.equal(h.saved.length, 0);
  assert.match(h.notices.join("\n"), /Another session took over/);
});

test("driver: losing the lease mid-run aborts the agent and freezes the record", async () => {
  const h = harness(writeApprovedReview);
  const driver = createStageDriver(fresh(), h.ports);
  h.ports.runAgent = (_role, _prompt, _dir, _progress, signal) =>
    new Promise((resolve) => {
      signal.addEventListener("abort", () =>
        resolve({
          text: "",
          aborted: true,
          leftoverCommands: 0,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }),
      );
    });
  const running = driver.run();
  await new Promise((resolve) => setImmediate(resolve));
  const savesBefore = h.saved.length;
  h.lease.mine = false;
  driver.leaseLost();
  await running;
  assert.equal(h.saved.length, savesBefore);
});
