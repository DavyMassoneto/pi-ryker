import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ChildGuardDeps, childGuardFactory, readRunningPiWebs } from "./childGuard.ts";

type Handler = (event: unknown, ctx?: unknown) => Promise<unknown>;

function install(deps: ChildGuardDeps): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const pi = { on: (name: string, handler: Handler) => handlers.set(name, handler) };
  void childGuardFactory(deps)(pi as unknown as ExtensionAPI);
  return handlers;
}

const root = resolve("/proj");
const SETTINGS = { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 };
const deps = (overrides: Partial<ChildGuardDeps> = {}): ChildGuardDeps => ({
  policy: { role: "reviewer", allowed: [resolve(root, "revisao.md")] },
  shell: () => ({
    projectRoot: root,
    allowedRoots: [],
    homeDir: resolve("/home/u"),
    piWeb: undefined,
    gitAliases: {},
  }),
  epochStillMine: () => true,
  progressPath: resolve(root, "progresso.md"),
  readFile: () => "## Coverage\n- Tasks",
  fixedText: "FIXED TEXT",
  continuation: { requestNewSession: () => {} },
  ...overrides,
});

test("child guard adapter: blocks a refused write with a reason", async () => {
  const handlers = install(deps());
  const result = (await handlers.get("tool_call")?.({
    toolName: "write",
    input: { path: "src/a.ts" },
  })) as { block: boolean; reason: string };
  assert.equal(result.block, true);
  assert.match(result.reason, /reviewer/);
});

test("child guard adapter: lets an allowed call through", async () => {
  const handlers = install(deps());
  const result = await handlers.get("tool_call")?.({
    toolName: "write",
    input: { path: resolve(root, "revisao.md") },
  });
  assert.equal(result, undefined);
});

test("child guard adapter: a throwing dependency fails closed (R2-N7)", async () => {
  const handlers = install(
    deps({
      epochStillMine: () => {
        throw new Error("boom");
      },
    }),
  );
  const result = (await handlers.get("tool_call")?.({ toolName: "read", input: {} })) as {
    block: boolean;
  };
  assert.equal(result.block, true);
});

test("child guard adapter: compaction summary is the whole progress file", async () => {
  const handlers = install(deps());
  const result = (await handlers.get("session_before_compact")?.(
    {
      preparation: { firstKeptEntryId: "e9", tokensBefore: 1234, settings: SETTINGS },
    },
    { model: { contextWindow: 200_000 } },
  )) as { compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number } };
  assert.deepEqual(result.compaction, {
    summary: "## Coverage\n- Tasks",
    firstKeptEntryId: "e9",
    tokensBefore: 1234,
  });
});

test("child guard adapter: an empty progress file leaves default compaction", async () => {
  const handlers = install(deps({ readFile: () => undefined }));
  const result = await handlers.get("session_before_compact")?.(
    {
      preparation: { firstKeptEntryId: "e9", tokensBefore: 1, settings: SETTINGS },
    },
    { model: undefined },
  );
  assert.equal(result, undefined);
});

test("child guard adapter: progress that does not fit cancels compaction and asks for a new session (Q Continuacao em sessao nova)", async () => {
  let requested = 0;
  const handlers = install(
    deps({
      readFile: () => "x".repeat(400_000),
      continuation: {
        requestNewSession: () => {
          requested += 1;
        },
      },
    }),
  );
  const result = await handlers.get("session_before_compact")?.(
    { preparation: { firstKeptEntryId: "e9", tokensBefore: 1, settings: SETTINGS } },
    { model: { contextWindow: 128_000 } },
  );
  assert.deepEqual(result, { cancel: true });
  assert.equal(requested, 1);
});

test("child guard adapter: refuses pi-web found in the running registry with no config (P4, 18.3)", async () => {
  const handlers = install(deps({ piWebRuns: () => [{ hosts: ["100.91.99.83"], port: 3041 }] }));
  const result = (await handlers.get("tool_call")?.({
    toolName: "bash",
    input: { command: "curl http://100.91.99.83:3041/" },
  })) as { block: boolean; reason: string };
  assert.equal(result.block, true);
  assert.match(result.reason, /P4/);
});

test("child guard adapter: a registry lookup that throws fails closed", async () => {
  const handlers = install(
    deps({
      piWebRuns: () => {
        throw new Error("boom");
      },
    }),
  );
  const result = (await handlers.get("tool_call")?.({
    toolName: "bash",
    input: { command: "echo hi" },
  })) as { block: boolean };
  assert.equal(result.block, true);
});

test("default pi-web registry reader reads <dir>/<pid>.json and adds the machine names", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-run-"));
  writeFileSync(join(dir, "1.json"), '{"port":3041,"hostname":"100.1.2.3"}');
  writeFileSync(join(dir, "2.json"), "garbage");
  const runs = readRunningPiWebs(dir);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.port, 3041);
  assert.ok(runs[0]?.hosts.includes("100.1.2.3"));
  assert.ok(runs[0]?.hosts.includes(hostname()));
  assert.deepEqual(readRunningPiWebs(join(dir, "missing")), []);
});
