import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, before, test } from "node:test";
import {
  closedProbe,
  createProject,
  createSandbox,
  git,
  type Project,
  RpcSession,
  readCycle,
  type Sandbox,
  sourceDir,
  startPiWeb,
  useHint,
  waitFor,
} from "../harness.ts";

const CYCLE_TIMEOUT_MS = 15 * 60_000;
let sandbox: Sandbox;

before(async () => {
  sandbox = await createSandbox(sourceDir);
  useHint(sandbox);
});

afterEach((context) => {
  if (!(context as { passed?: boolean }).passed) sandbox?.markFailed();
});

after(() => sandbox?.dispose());

function assertCycleMarks(project: Project): void {
  const record = readCycle(project);
  assert.ok(record);
  assert.equal(record.cycle.phase, "approved");
  assert.equal(record.closed, "stageNotBuilt");
  assert.ok(record.tokens.length > 0);
  assert.equal(existsSync(join(project.dir, ".pi", "ryker", "trava.json")), false);
  const refs = git(project.dir, "for-each-ref", "refs/ryker", "--format=%(refname)");
  assert.match(refs, /planner/);
  assert.match(refs, /reviewer/);
}

test("happy path in the CLI: the discussion is approved and stage 2 runs to approval", async () => {
  const project = createProject(sandbox, "cli-happy");
  const rpc = new RpcSession(sandbox, project.dir);
  try {
    await rpc.command("/e2e-start");
    await waitFor(
      closedProbe(project, "cli", () => rpc.notices),
      "stage 2 to close in the CLI",
      CYCLE_TIMEOUT_MS,
      2000,
    );
    assertCycleMarks(project);
    assert.ok(rpc.statusHistory.some((text) => /2\/6 Planning/.test(text)));
    assert.ok(rpc.statusHistory.some((text) => /round 1\/2/.test(text)));
    assert.ok(rpc.widgetHistory.some((text) => /Planning/.test(text)));
    assert.ok(rpc.widgetHistory.some((text) => /round \d approved/.test(text)));
  } finally {
    rpc.stop();
  }
});

test("happy path in pi-web: status and widget reach the session snapshot", async () => {
  const project = createProject(sandbox, "web-happy");
  const web = await startPiWeb(sandbox);
  const statuses: string[] = [];
  const widgets: string[] = [];
  const sessionId = await web.newSession(project.dir, "/e2e-start");
  const closedNow = closedProbe(project, "web");
  await waitFor(
    async () => {
      const status = await web.statusText(sessionId);
      if (status) statuses.push(status);
      widgets.push(await web.widgetText(sessionId));
      return closedNow();
    },
    "stage 2 to close in pi-web",
    CYCLE_TIMEOUT_MS,
    2000,
  );
  assertCycleMarks(project);
  assert.ok(statuses.some((text) => /2\/6 Planning/.test(text)));
  assert.ok(widgets.some((text) => /Planning/.test(text)));
});
