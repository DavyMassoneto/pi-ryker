import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ChildGuardDeps, childGuardFactory } from "./childGuard.ts";

type Handler = (event: unknown) => Promise<unknown>;

function install(deps: ChildGuardDeps): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const pi = { on: (name: string, handler: Handler) => handlers.set(name, handler) };
  void childGuardFactory(deps)(pi as unknown as ExtensionAPI);
  return handlers;
}

const root = resolve("/proj");
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
  const result = (await handlers.get("session_before_compact")?.({
    preparation: { firstKeptEntryId: "e9", tokensBefore: 1234 },
  })) as { compaction: { summary: string; firstKeptEntryId: string; tokensBefore: number } };
  assert.deepEqual(result.compaction, {
    summary: "## Coverage\n- Tasks",
    firstKeptEntryId: "e9",
    tokensBefore: 1234,
  });
});

test("child guard adapter: an empty progress file leaves default compaction", async () => {
  const handlers = install(deps({ readFile: () => undefined }));
  const result = await handlers.get("session_before_compact")?.({
    preparation: { firstKeptEntryId: "e9", tokensBefore: 1 },
  });
  assert.equal(result, undefined);
});
