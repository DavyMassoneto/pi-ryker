import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  clearFlags,
  createProject,
  createSandbox,
  git,
  type Project,
  RpcSession,
  readCycle,
  type Sandbox,
  setFlag,
  sourceDir,
  startPiWeb,
  treeContains,
  waitFor,
} from "../harness.ts";

const WAIT_MS = 120_000;
let sandbox: Sandbox;

before(async () => {
  sandbox = await createSandbox(sourceDir);
});

after(() => sandbox?.dispose());

const READ_ONLY = /read only|another session/i;

test("lock, read-only readers, takeover and /ryker parar", async () => {
  const project = createProject(sandbox, "locked");
  const other = createProject(sandbox, "other");
  setFlag(sandbox, "faux-planner", JSON.stringify([{ sleep: 300 }]));
  const owner = new RpcSession(sandbox, project.dir);
  const reader = new RpcSession(sandbox, project.dir);
  const elsewhere = new RpcSession(sandbox, other.dir);
  try {
    const ownerId = await owner.sessionId();
    await owner.command("/e2e-start");
    await waitFor(() => readCycle(project)?.ownerSession === ownerId, "owner lease", WAIT_MS);
    assert.ok(existsSync(join(project.dir, ".pi", "ryker", "trava.json")));
    assert.match(owner.statuses.get("ryker") ?? "", /Ryker/);

    const readerId = await reader.sessionId();
    await reader.command("/ryker");
    await waitFor(
      () => READ_ONLY.test(`${reader.statuses.get("ryker") ?? ""} ${reader.notices.join(" ")}`),
      "reader status",
      WAIT_MS,
    );

    await elsewhere.command("/ryker");
    assert.equal(elsewhere.statuses.get("ryker"), undefined);
    assert.equal(readCycle(other), undefined);

    const web = await startPiWeb(sandbox);
    const created = await web.post("/api/agent/new", {
      cwd: project.dir,
      type: "prompt",
      message: "/ryker",
    });
    await waitFor(
      async () => READ_ONLY.test((await web.statusText(created.sessionId)) ?? ""),
      "pi-web reader status",
      WAIT_MS,
    );
    const foreign = await web.post("/api/agent/new", {
      cwd: other.dir,
      type: "prompt",
      message: "/ryker",
    });
    assert.equal(await web.statusText(foreign.sessionId), undefined);

    const epochBefore = readCycle(project)?.epoch ?? 0;
    await reader.command("/ryker retomar");
    await waitFor(
      () => readCycle(project)?.ownerSession === readerId,
      "takeover to change the owner",
      WAIT_MS,
    );
    assert.ok((readCycle(project)?.epoch ?? 0) > epochBefore);
    assert.ok(reader.dialogs.length > 0);
    await waitFor(
      () => owner.notices.some((text) => /took over/.test(text)),
      "the old owner to learn about the takeover",
      WAIT_MS,
    );

    await reader.command("/ryker parar");
    await waitFor(() => readCycle(project)?.runState === "paused", "the cycle to pause", WAIT_MS);
    assert.equal(readCycle(project)?.ownerSession, readerId);
  } finally {
    owner.stop();
    reader.stop();
    elsewhere.stop();
    clearFlags(sandbox);
  }
});

test("tampered control files are restored and a git push is refused", async () => {
  const project: Project = createProject(sandbox, "attacked", true);
  const before = git(project.dir, "rev-parse", "HEAD").trim();
  const attack = [
    { bash: "echo '{}' > .pi/ryker/ciclo.json" },
    { bash: "echo evil-pattern >> .git/info/exclude" },
    { bash: "git push origin main" },
    { writePlan: true },
  ];
  setFlag(sandbox, "faux-planner", JSON.stringify(attack));
  const rpc = new RpcSession(sandbox, project.dir);
  try {
    await rpc.command("/e2e-start");
    await waitFor(
      () => rpc.notices.some((text) => /restored, round failed/.test(text)),
      "the control-file restoration notice",
      WAIT_MS,
    );
    await waitFor(
      () => rpc.notices.some((text) => /both rounds were used|stopped/i.test(text)),
      "the cycle to stop after the failed rounds",
      WAIT_MS,
    );
    assert.ok(readCycle(project), "ciclo.json was restored and parses");
    assert.doesNotMatch(
      readFileSync(join(project.dir, ".git", "info", "exclude"), "utf8"),
      /evil-pattern/,
    );
    assert.equal(git(project.remote as string, "rev-parse", "main").trim(), before);
    assert.ok(treeContains(join(sandbox.agentDir, "ryker"), "git push is not allowed"));
  } finally {
    rpc.stop();
    clearFlags(sandbox);
  }
});
