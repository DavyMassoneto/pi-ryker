import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { type ControlSnapshotPorts, createControlSnapshot } from "../core/controlSnapshot.ts";
import { planHeadings } from "../core/coverage.ts";
import type { AgentRole } from "../core/cyclePaths.ts";
import { planPath, progressPath, reviewPath } from "../core/cyclePaths.ts";
import type { CycleRecord } from "../core/cycleRecord.ts";
import { discardExecution, newCycleRecord } from "../core/cycleRecord.ts";
import type { RestorePoint } from "../core/gitRefs.ts";
import type { AgentRunResult } from "./agent.ts";
import {
  type CancelReason,
  createStageDriver,
  type DriverPorts,
  type StageDriver,
  type WorkspaceCheck,
} from "./driver.ts";

const CYCLE_DIR = join("/h", "cycle");
const VISION = join(CYCLE_DIR, "visao.html");
const CONTROL = join("/p", ".pi", "ryker", "ciclo.json");

const VALID_PLAN = `## Tasks
### T1
- repository: /p
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
  folder: Map<string, string>;
  aside: Map<string, string>;
  snapshotPorts: ControlSnapshotPorts;
  lease: { mine: boolean };
  workspace: { check: WorkspaceCheck; captured: string[]; restored: string[] };
  cancel: { answer: CancelReason | undefined; asked: number };
}

function harness(script: Script): Harness {
  const disk = new Map<string, string>([
    [CONTROL, "{}"],
    [VISION, "the vision"],
  ]);
  const aside = new Map<string, string>();
  const saved: CycleRecord[] = [];
  const notices: string[] = [];
  const announced: string[] = [];
  const closed: CycleRecord[] = [];
  const prompts: string[] = [];
  const lease = { mine: true };
  const workspace = {
    check: { ok: true } as WorkspaceCheck,
    captured: [] as string[],
    restored: [] as string[],
  };
  const cancel = { answer: undefined as CancelReason | undefined, asked: 0 };
  const point = (label: string): RestorePoint => ({
    ref: `refs/ryker/c1/${label}`,
    commit: "c",
    tree: "t",
    indexTree: "i",
    branch: "main",
    head: "h",
  });
  const setAside = (path: string): void => {
    const text = disk.get(path);
    if (text === undefined) return;
    aside.set(path, text);
    disk.delete(path);
  };
  let storedCopy: Record<string, string> | undefined;
  const snapshotPorts: ControlSnapshotPorts = {
    listPaths: () => [...disk.keys()],
    read: (path) => disk.get(path),
    write: (path, text) => void disk.set(path, text),
    setAside,
    loadCopy: () => storedCopy,
    saveCopy: (copy) => {
      storedCopy = copy;
    },
  };
  const snapshot = createControlSnapshot(snapshotPorts);
  snapshot.seed();
  let round = 1;
  const ports: DriverPorts = {
    cycleDir: CYCLE_DIR,
    config: { allowedRoots: [], owners: ["core"], language: "en" },
    inputFiles: ["/p/.ryker/visao.html"],
    files: {
      read: (path) => disk.get(path),
      write: (path, text) => {
        disk.set(path, text);
        ports.snapshot.recordWrite([path]);
      },
      ensureDir: () => {},
      list: (folder) => [...disk.keys()].filter((path) => dirname(path) === folder),
      setAside: (path) => {
        setAside(path);
        ports.snapshot.recordWrite([path]);
      },
    },
    snapshot,
    workspace: {
      capture: (label) => {
        workspace.captured.push(label);
        return point(label);
      },
      verify: () => workspace.check,
      restore: (restored) => void workspace.restored.push(restored.ref),
    },
    askCancelReason: async () => {
      cancel.asked += 1;
      return cancel.answer;
    },
    runAgent: async (role, prompt, dir) => {
      prompts.push(prompt);
      const outcome = script(role, dir, disk, round);
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
  return {
    ports,
    fs: disk,
    saved,
    notices,
    announced,
    closed,
    prompts,
    control: disk,
    folder: disk,
    aside,
    snapshotPorts,
    lease,
    workspace,
    cancel,
  };
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
  assert.match(h.announced[0] ?? "", /plano\.md/);
  assert.match(h.announced[0] ?? "", /Stage 3 is not available in this version/);
  assert.equal(driver.record().runState, "paused");
  assert.equal(h.saved.at(-1)?.runState, "paused");
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

test("driver: the failed plan check reaches the next planner round as a listed findings file", async () => {
  const h = harness((role, _dir, fs) => {
    if (role === "planner") fs.set(planPath(CYCLE_DIR), "## Tasks\n### T1 (stage 3)\n");
    return {};
  });
  await createStageDriver(fresh(), h.ports).run();
  const feedbackPath = join(CYCLE_DIR, "verificacao-codigo.md");
  assert.equal(h.prompts[0]?.includes(feedbackPath), false);
  assert.equal(h.prompts[1]?.includes(feedbackPath), true);
  assert.match(h.fs.get(feedbackPath) ?? "", /Tasks has no task/);
  assert.match(h.fs.get(feedbackPath) ?? "", /missing section: Production order/);
});

test("driver: a valid plan clears the code check findings", async () => {
  let attempt = 0;
  const h = harness((role, dir, fs) => {
    if (role === "planner") {
      attempt += 1;
      fs.set(planPath(CYCLE_DIR), attempt === 1 ? "## Tasks\n" : VALID_PLAN);
      return {};
    }
    fs.set(reviewPath(dir), review("APPROVED"));
    fs.set(progressPath(dir), `## Coverage\n${planHeadings(VALID_PLAN).join("\n")}`);
    return {};
  });
  await createStageDriver(fresh(), h.ports).run();
  assert.equal(h.fs.get(join(CYCLE_DIR, "verificacao-codigo.md")), "");
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
  assert.equal(h.control.get(CONTROL), '{"edited":"by hand"}');
  assert.match(
    driver.record().note ?? "",
    new RegExp(CONTROL.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")),
  );
});

test("driver: an agent changing cycle folder files is restored and the round fails (P5, R3)", async () => {
  const h = harness((role, _dir, fs) => {
    if (role === "planner") {
      h.folder.set(VISION, "tampered");
      h.folder.set(join(CYCLE_DIR, "extra.md"), "new");
      fs.set(planPath(CYCLE_DIR), VALID_PLAN);
    }
    return {};
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.folder.get(VISION), "the vision");
  assert.equal(h.folder.has(join(CYCLE_DIR, "extra.md")), false);
  assert.match(h.notices.join("\n"), /visao\.html/);
  assert.doesNotMatch(h.notices.join("\n"), /outside an agent execution/);
  assert.equal(driver.record().cycle.phase, "stopped");
});

test("driver: the accept-on-resume request survives a restart (N30)", async () => {
  const h = harness(writeApprovedReview);
  let prepared = 0;
  h.ports.files.ensureDir = () => {
    prepared += 1;
    if (prepared === 2) h.control.set(CONTROL, '{"edited":"by hand"}');
  };
  const first = createStageDriver(fresh(), h.ports);
  await first.run();
  const reloaded = createStageDriver(JSON.parse(JSON.stringify(first.record())), h.ports);
  await reloaded.resume();
  while (reloaded.record().runState === "running") await new Promise((done) => setImmediate(done));
  assert.equal(reloaded.record().closed, "stageNotBuilt");
  assert.equal(reloaded.record().acceptOutside, undefined);
});

test("driver: resuming after an outside change accepts the current state and continues (M2b)", async () => {
  const h = harness(writeApprovedReview);
  let prepared = 0;
  h.ports.files.ensureDir = () => {
    prepared += 1;
    if (prepared === 2) h.control.set(CONTROL, '{"edited":"by hand"}');
  };
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().runState, "paused");
  await driver.resume();
  while (driver.record().runState === "running") await new Promise((done) => setImmediate(done));
  assert.equal(driver.record().closed, "stageNotBuilt");
  assert.equal(h.control.get(CONTROL), '{"edited":"by hand"}');
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

const abortable =
  (h: Harness): DriverPorts["runAgent"] =>
  (_role, _prompt, _dir, _progress, signal) =>
    new Promise((resolve) => {
      signal.addEventListener("abort", () =>
        resolve({
          text: "",
          aborted: true,
          leftoverCommands: 0,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }),
      );
      void h;
    });

async function stopMidRun(h: Harness) {
  h.ports.runAgent = abortable(h);
  const driver = createStageDriver(fresh(), h.ports);
  const running = driver.run();
  await new Promise((resolve) => setImmediate(resolve));
  driver.stop();
  await running;
  return driver;
}

test("driver: a restore point is taken before each agent run and recorded until it ends (Mec9, C13.2)", async () => {
  const h = harness(writeApprovedReview);
  await createStageDriver(fresh(), h.ports).run();
  assert.deepEqual(h.workspace.captured, [
    "tentativa-001/etapa-2/rodada-001/planner-01",
    "tentativa-001/etapa-2/rodada-001/reviewer-01",
  ]);
  const during = h.saved.find((record) => record.execution !== undefined);
  assert.equal(
    during?.execution?.restorePoint.ref,
    "refs/ryker/c1/tentativa-001/etapa-2/rodada-001/planner-01",
  );
  assert.equal(h.saved.at(-1)?.execution, undefined);
});

test("driver: a branch, HEAD or project change by the agent is undone and fails the round (P6, Mec7, P22)", async () => {
  const h = harness(writeApprovedReview);
  h.workspace.check = { ok: false, reason: "HEAD is x, expected h" };
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.workspace.restored.length, 2);
  assert.match(h.notices.join(" "), /HEAD is x, expected h/);
  assert.equal(driver.record().cycle.phase, "stopped");
});

test("driver: Esc or parar cancels, restores the point and asks why; stuck counts a round (Q Esc pergunta)", async () => {
  const h = harness(writeApprovedReview);
  h.cancel.answer = "stuck";
  const driver = await stopMidRun(h);
  assert.equal(h.cancel.asked, 1);
  assert.deepEqual(h.workspace.restored, [
    "refs/ryker/c1/tentativa-001/etapa-2/rodada-001/planner-01",
  ]);
  assert.equal(driver.record().runState, "paused");
  assert.equal(driver.record().cycle.round, 2);
  assert.equal(driver.record().cancelQuestion, undefined);
});

test("driver: cancelled for another reason does not count a round (Q Esc pergunta)", async () => {
  const h = harness(writeApprovedReview);
  h.cancel.answer = "other";
  const driver = await stopMidRun(h);
  assert.equal(driver.record().cycle.round, 1);
  assert.equal(driver.record().cancelQuestion, undefined);
});

test("driver: an unanswered cancel question stays pending and opens again on resume (Q Esc pergunta)", async () => {
  const h = harness(writeApprovedReview);
  const driver = await stopMidRun(h);
  assert.equal(driver.record().cancelQuestion, true);
  assert.equal((await driver.resume()).ok, false);
  assert.equal(h.cancel.asked, 2);
  h.cancel.answer = "other";
  h.ports.runAgent = async () => ({
    text: "",
    aborted: true,
    leftoverCommands: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  });
  assert.equal((await driver.resume()).ok, true);
  assert.equal(driver.record().cancelQuestion, undefined);
});

test("driver: suspend (session closing) cancels without asking (U18.18)", async () => {
  const h = harness(writeApprovedReview);
  h.ports.runAgent = abortable(h);
  const driver = createStageDriver(fresh(), h.ports);
  const running = driver.run();
  await new Promise((resolve) => setImmediate(resolve));
  driver.suspend();
  await running;
  assert.equal(h.cancel.asked, 0);
  assert.equal(driver.record().runState, "paused");
});

const rejectingReviewer: Script = (role, dir, fs) => {
  if (role === "planner") {
    fs.set(planPath(CYCLE_DIR), VALID_PLAN);
    return {};
  }
  fs.set(reviewPath(dir), review("REJECTED"));
  fs.set(progressPath(dir), `## Coverage\n${planHeadings(VALID_PLAN).join("\n")}`);
  return {};
};

test("driver: a plan task naming a repository outside the cycle fails the code check (B12)", async () => {
  const h = harness((role, _dir, fs) => {
    if (role === "planner")
      fs.set(planPath(CYCLE_DIR), VALID_PLAN.replace("repository: /p", "repository: /elsewhere"));
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

test("driver: the planner and reviewer are told the cycle repositories and a relative one is accepted (B12)", async () => {
  const h = harness((role, dir, fs, round) => {
    if (role === "planner")
      fs.set(planPath(CYCLE_DIR), VALID_PLAN.replace("repository: /p", "repository: ."));
    return writeApprovedReview(role, dir, fs, round);
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().closed, "stageNotBuilt");
  assert.match(h.prompts[0] ?? "", /repositorios\.md/);
  assert.match(h.prompts[1] ?? "", /repositorios\.md/);
  assert.match(h.fs.get(join(CYCLE_DIR, "repositorios.md")) ?? "", /\/p/);
});

test("driver: round 2 planner and reviewer receive the round 1 review (B7)", async () => {
  const h = harness((role, dir, fs, round) => {
    if (round === 2 && role === "reviewer") return writeApprovedReview(role, dir, fs, round);
    return rejectingReviewer(role, dir, fs, round);
  });
  await createStageDriver(fresh(), h.ports).run();
  assert.equal(h.prompts.length, 4);
  assert.match(h.prompts[2] ?? "", /rodada-001[\\/]reviewer-01[\\/]revisao\.md/);
  assert.match(h.prompts[3] ?? "", /rodada-001[\\/]reviewer-01[\\/]revisao\.md/);
  assert.doesNotMatch(h.prompts[0] ?? "", /revisao\.md/);
});

test("driver: a stop by the user, a pause request and an outside change are announced (B13)", async () => {
  const h = harness(() => ({ aborted: true }));
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.announced.length, 1);
  assert.match(h.announced[0] ?? "", /paused/);
  assert.match(h.announced[0] ?? "", /\/ryker retomar/);
});

test("driver: a lost lease is announced (B13)", async () => {
  const h = harness(writeApprovedReview);
  const driver = createStageDriver(fresh(), h.ports);
  h.lease.mine = false;
  await driver.run();
  assert.match(h.announced.join("\n"), /Another session took over/);
});

test("driver: a thrown error stops the cycle with the error and announces it (B9)", async () => {
  const h = harness(writeApprovedReview);
  h.ports.runAgent = async () => {
    throw new Error("git commit-tree failed");
  };
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.equal(driver.record().runState, "paused");
  assert.match(driver.record().note ?? "", /git commit-tree failed/);
  assert.match(h.announced.join("\n"), /git commit-tree failed/);
});

test("driver: a failing save while running does not reject (B9)", async () => {
  const h = harness(writeApprovedReview);
  let calls = 0;
  const original = h.ports.saveRecord;
  h.ports.saveRecord = (record) => {
    calls += 1;
    if (calls === 2) throw new Error("EPERM rename");
    original(record);
  };
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.match(h.announced.join("\n"), /EPERM rename/);
});

test("driver: a stopped cycle can be ended, which closes it and releases the lock and the index (B5)", async () => {
  const h = harness(rejectingReviewer);
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.equal((await driver.resume()).ok, false);
  assert.deepEqual(driver.end(), { ok: true });
  assert.equal(driver.record().closed, "ended");
  assert.equal(h.closed.length, 1);
  assert.match(h.announced.at(-1) ?? "", /ended/);
});

test("driver: a stopped cycle can go back to the Discussion (B5)", async () => {
  const h = harness(rejectingReviewer);
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.deepEqual(driver.back(), { ok: true });
  assert.equal(driver.record().closed, "backToDiscussion");
  assert.equal(driver.record().cycle.phase, "backToDiscussion");
  assert.equal(h.closed.length, 1);
});

test("driver: back and end are refused while the cycle runs (B5)", async () => {
  const h = harness(writeApprovedReview);
  const driver = createStageDriver(fresh(), h.ports);
  assert.equal(driver.end().ok, false);
  assert.equal(driver.back().ok, false);
});

test("driver: BLOCKED stops without counting a round and resume retries the same round (U18.7)", async () => {
  let blocked = true;
  const h = harness((role, dir, fs, round) => {
    if (role === "planner" && blocked) return { text: "STATUS: BLOCKED" };
    return writeApprovedReview(role, dir, fs, round);
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.equal(driver.record().cycle.round, 1);
  blocked = false;
  assert.equal((await driver.resume()).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(driver.record().cycle.round, 1);
  assert.equal(driver.record().closed, "stageNotBuilt");
});

const PLANNER_DIR = join(CYCLE_DIR, "tentativa-001", "etapa-2", "rodada-001", "planner-01");
const REVIEWER_DIR = join(CYCLE_DIR, "tentativa-001", "etapa-2", "rodada-001", "reviewer-01");
const NO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const BLAMED = /round failed|outside an agent execution/;
const COVERAGE = `## Coverage\n${planHeadings(VALID_PLAN).join("\n")}`;

async function settle(driver: StageDriver): Promise<void> {
  while (driver.record().runState === "running") await new Promise((done) => setImmediate(done));
}

function stopOnce(
  h: Harness,
  driver: () => StageDriver,
  role: AgentRole,
  during: (dir: string) => void,
) {
  const runAgent = h.ports.runAgent;
  h.ports.runAgent = async (current, prompt, dir, progress, signal) => {
    if (current !== role) return runAgent(current, prompt, dir, progress, signal);
    during(dir);
    driver().stop();
    h.ports.runAgent = runAgent;
    return { text: "", aborted: true, leftoverCommands: 0, usage: NO_USAGE };
  };
}

async function takeOverMidPlanning(h: Harness, lateWrites: () => void): Promise<StageDriver> {
  const runAgent = h.ports.runAgent;
  const old = createStageDriver(fresh(), h.ports);
  h.ports.runAgent = async (_role, _prompt, dir) => {
    h.fs.set(progressPath(dir), "old progress");
    h.lease.mine = false;
    old.leaseLost();
    return { text: "", aborted: true, leftoverCommands: 0, usage: NO_USAGE };
  };
  await old.run();
  const interrupted = h.saved.at(-1);
  assert.ok(interrupted?.execution);
  lateWrites();
  const snapshot = createControlSnapshot(h.snapshotPorts);
  assert.equal(snapshot.load(), true);
  h.ports.snapshot = snapshot;
  h.ports.runAgent = runAgent;
  h.lease.mine = true;
  const adopted = discardExecution(structuredClone(interrupted));
  return createStageDriver({ ...adopted, ownerSession: "s2", runState: "paused" }, h.ports);
}

test("ownership: a user edit while paused pauses with a report, is kept, and is accepted for good on resume (M2b, R1, N30)", async () => {
  const h = harness(writeApprovedReview);
  const runAgent = h.ports.runAgent;
  const driver = createStageDriver(fresh(), h.ports);
  h.ports.runAgent = async (...args) => {
    driver.requestPause();
    h.ports.runAgent = runAgent;
    return runAgent(...args);
  };
  await driver.run();
  assert.equal(driver.record().runState, "paused");
  h.folder.set(VISION, "edited by the user");
  h.control.set(CONTROL, '{"edited":"by hand"}');
  assert.equal((await driver.resume()).ok, true);
  await settle(driver);
  assert.equal(driver.record().runState, "paused");
  assert.match(driver.record().note ?? "", /changed outside an agent execution/);
  assert.match(driver.record().note ?? "", /visao\.html/);
  assert.equal(h.folder.get(VISION), "edited by the user");
  assert.equal(h.aside.size, 0);
  const persisted = h.saved.at(-1);
  assert.equal(persisted?.acceptOutside, true);
  const snapshot = createControlSnapshot(h.snapshotPorts);
  snapshot.load();
  h.ports.snapshot = snapshot;
  const restarted = createStageDriver(structuredClone(persisted), h.ports);
  assert.equal((await restarted.resume()).ok, true);
  await settle(restarted);
  assert.equal(restarted.record().closed, "stageNotBuilt");
  assert.equal(restarted.record().acceptOutside, undefined);
  assert.equal(h.folder.get(VISION), "edited by the user");
  assert.equal(h.control.get(CONTROL), '{"edited":"by hand"}');
  assert.doesNotMatch(h.notices.join("\n"), /round failed/);
});

test("ownership: a planner that edits ciclo.json has it restored from the copy and fails the round with one note (P5, P22, N32)", async () => {
  const h = harness((role, _dir, disk) => {
    if (role === "planner") {
      disk.set(CONTROL, '{"hacked":true}');
      disk.set(planPath(CYCLE_DIR), VALID_PLAN);
    }
    return {};
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.control.get(CONTROL), "{}");
  assert.equal(driver.record().cycle.phase, "stopped");
  assert.equal(h.notices.filter((note) => note.includes(CONTROL)).length, 2);
  assert.ok(!h.workspace.captured.some((label) => label.includes("reviewer")));
});

test("ownership: a planner planting the reviewer's progresso.md has it set aside and fails the round (R6, COB-2)", async () => {
  const planted = progressPath(REVIEWER_DIR);
  const h = harness((role, dir, disk) => {
    if (role === "planner") {
      disk.set(planPath(CYCLE_DIR), VALID_PLAN);
      disk.set(planted, COVERAGE);
      return {};
    }
    disk.set(reviewPath(dir), review("APPROVED"));
    return {};
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.fs.has(planted), false);
  assert.equal(h.aside.get(planted), COVERAGE);
  assert.ok(h.notices.some((note) => note.includes(planted) && /round failed/.test(note)));
  assert.ok(!h.workspace.captured.some((label) => label.includes("reviewer")));
  assert.equal(driver.record().closed, undefined);
});

test("ownership: runtime files already in a folder that has not run yet are rejected before it runs (R6, d)", async () => {
  const planted = progressPath(REVIEWER_DIR);
  const transcript = join(REVIEWER_DIR, "forged.jsonl");
  const h = harness((role, dir, disk) => {
    if (role === "planner") disk.set(planPath(CYCLE_DIR), VALID_PLAN);
    else disk.set(reviewPath(dir), review("APPROVED"));
    return {};
  });
  h.fs.set(planted, COVERAGE);
  h.fs.set(transcript, "{}\n");
  h.ports.snapshot.recordWrite([planted, transcript]);
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.aside.get(planted), COVERAGE);
  assert.equal(h.aside.get(transcript), "{}\n");
  assert.match(h.notices.join("\n"), /has not run yet were rejected/);
  assert.notEqual(driver.record().closed, "stageNotBuilt");
});

test("ownership: an agent rewriting a finished execution's transcript is restored and fails the round (N33)", async () => {
  const transcript = join(PLANNER_DIR, "session.jsonl");
  const h = harness((role, dir, disk) => {
    if (role === "planner") {
      disk.set(join(dir, "session.jsonl"), "a\n");
      disk.set(planPath(CYCLE_DIR), VALID_PLAN);
      return {};
    }
    disk.set(transcript, "forged\n");
    disk.set(reviewPath(dir), review("APPROVED"));
    disk.set(progressPath(dir), COVERAGE);
    return {};
  });
  const driver = createStageDriver(fresh(), h.ports);
  await driver.run();
  assert.equal(h.fs.get(transcript), "a\n");
  assert.ok(h.notices.some((note) => note.includes(transcript) && /round failed/.test(note)));
  assert.notEqual(driver.record().closed, "stageNotBuilt");
});

test("ownership: a reviewer stopped for another reason, then its late revisao.md, then resume keeps the round and fails nothing (R5, Q Esc pergunta)", async () => {
  const h = harness(writeApprovedReview);
  h.cancel.answer = "other";
  const driver = createStageDriver(fresh(), h.ports);
  stopOnce(
    h,
    () => driver,
    "reviewer",
    (dir) => h.fs.set(progressPath(dir), "## Coverage\npartial"),
  );
  await driver.run();
  assert.equal(driver.record().runState, "paused");
  assert.equal(driver.record().cycle.round, 1);
  assert.equal(driver.record().cancelQuestion, undefined);
  assert.deepEqual(
    driver.record().discarded?.map((dead) => dead.folder),
    [REVIEWER_DIR],
  );
  h.fs.set(reviewPath(REVIEWER_DIR), "late review by the stopped reviewer");
  assert.equal((await driver.resume()).ok, true);
  await settle(driver);
  assert.equal(driver.record().closed, "stageNotBuilt");
  assert.equal(driver.record().cycle.round, 1);
  assert.doesNotMatch(h.notices.join("\n"), BLAMED);
  assert.equal(h.aside.get(reviewPath(REVIEWER_DIR)), "late review by the stopped reviewer");
  assert.equal(h.aside.get(progressPath(REVIEWER_DIR)), "## Coverage\npartial");
  assert.equal(driver.record().discarded, undefined);
});

test("ownership: a planner stopped, then a late append to its transcript, is accepted and kept (R5, N33)", async () => {
  const transcript = join(PLANNER_DIR, "session.jsonl");
  const h = harness(writeApprovedReview);
  h.cancel.answer = "other";
  const driver = createStageDriver(fresh(), h.ports);
  stopOnce(
    h,
    () => driver,
    "planner",
    () => h.fs.set(transcript, "a\n"),
  );
  await driver.run();
  assert.equal(driver.record().cycle.round, 1);
  h.fs.set(transcript, "a\nlate\n");
  assert.equal((await driver.resume()).ok, true);
  await settle(driver);
  assert.equal(driver.record().closed, "stageNotBuilt");
  assert.equal(driver.record().cycle.round, 1);
  assert.doesNotMatch(h.notices.join("\n"), BLAMED);
  assert.equal(h.fs.get(transcript), "a\nlate\n");
});

test("ownership: after a takeover, the old child's late writes in its own folder are accepted, not blamed (P35, R5)", async () => {
  const h = harness(writeApprovedReview);
  const late = join(PLANNER_DIR, "old.jsonl");
  const adopted = await takeOverMidPlanning(h, () => {
    h.fs.set(progressPath(PLANNER_DIR), "old progress\nlate");
    h.fs.set(late, "late transcript");
  });
  assert.equal((await adopted.resume()).ok, true);
  await settle(adopted);
  assert.equal(adopted.record().closed, "stageNotBuilt");
  assert.equal(adopted.record().cycle.round, 1);
  assert.doesNotMatch(h.notices.join("\n"), BLAMED);
  assert.equal(h.fs.get(late), "late transcript");
  assert.equal(h.aside.get(progressPath(PLANNER_DIR)), "old progress\nlate");
});

test("ownership: after a takeover, the old child's late write outside its folder pauses as an outside change and is kept (M2b)", async () => {
  const h = harness(writeApprovedReview);
  const adopted = await takeOverMidPlanning(h, () => h.folder.set(VISION, "late by the old child"));
  assert.equal((await adopted.resume()).ok, true);
  await settle(adopted);
  assert.equal(adopted.record().runState, "paused");
  assert.match(adopted.record().note ?? "", /changed outside an agent execution/);
  assert.equal(h.folder.get(VISION), "late by the old child");
  assert.equal((await adopted.resume()).ok, true);
  await settle(adopted);
  assert.equal(adopted.record().closed, "stageNotBuilt");
  assert.equal(adopted.record().cycle.round, 1);
});
