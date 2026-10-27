import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serialize } from "../core/serialization.ts";
import { createState } from "../core/state.ts";
import {
  archiveApproved,
  discussionPath,
  legacyDiscussionPath,
  ownershipRefusal,
  readState,
  writeState,
} from "./persistence.ts";

const state = () =>
  createState({ request: "demo", now: "2026-10-27T10:00:00Z", previous: { ferramentas: [] } });

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "ryker-persist-"));
  mkdirSync(join(root, ".git", "info"), { recursive: true });
  return root;
}

test("state migration: the legacy .ryker/discussao.json is still read (P45)", () => {
  const root = project();
  mkdirSync(join(root, ".ryker"));
  writeFileSync(legacyDiscussionPath(root), serialize(state()), "utf8");
  const read = readState(root);
  assert.equal(read.kind, "ok");
  rmSync(root, { recursive: true });
});

test("state migration: writes go to .pi/ryker and win over the legacy file", () => {
  const root = project();
  mkdirSync(join(root, ".ryker"));
  writeFileSync(legacyDiscussionPath(root), serialize(state()), "utf8");
  writeState(root, { ...state(), pedido: "new" });
  assert.equal(existsSync(discussionPath(root)), true);
  const read = readState(root);
  assert.equal(read.kind === "ok" && read.state.pedido, "new");
  assert.match(readFileSync(join(root, ".git", "info", "exclude"), "utf8"), /\.pi\/ryker/);
  rmSync(root, { recursive: true });
});

test("state migration: a corrupted new file is reported, not hidden by the legacy one", () => {
  const root = project();
  mkdirSync(join(root, ".ryker"));
  mkdirSync(join(root, ".pi", "ryker"), { recursive: true });
  writeFileSync(legacyDiscussionPath(root), serialize(state()), "utf8");
  writeFileSync(discussionPath(root), "{broken", "utf8");
  assert.equal(readState(root).kind, "corrupted");
  rmSync(root, { recursive: true });
});

test("state migration: archiving moves whichever file exists", () => {
  const root = project();
  mkdirSync(join(root, ".ryker"));
  writeFileSync(legacyDiscussionPath(root), serialize(state()), "utf8");
  const folder = archiveApproved(root, state());
  assert.equal(existsSync(join(folder, "discussao.json")), true);
  assert.equal(existsSync(legacyDiscussionPath(root)), false);
  rmSync(root, { recursive: true });
});

test("ownership: a session that is not the owner is refused, legacy and owner pass (P35)", () => {
  assert.equal(ownershipRefusal({ ...state(), donoSessao: "a" }, "b") !== undefined, true);
  assert.equal(ownershipRefusal({ ...state(), donoSessao: "a" }, "a"), undefined);
  assert.equal(ownershipRefusal(state(), "b"), undefined);
});
