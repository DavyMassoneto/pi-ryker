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
  migrateLegacyFolder,
  moveVisionToCycle,
  ownershipRefusal,
  readState,
  visionPath,
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
  const history = join(root, "history");
  const folder = archiveApproved(root, state(), history);
  assert.equal(existsSync(join(folder, "discussao.json")), true);
  assert.equal(folder.startsWith(history), true);
  assert.equal(existsSync(legacyDiscussionPath(root)), false);
  rmSync(root, { recursive: true });
});

test("state migration: the stage-1 .ryker folder moves to .pi/ryker and the history (P45)", () => {
  const root = project();
  mkdirSync(join(root, ".ryker", "arquivo", "2026-10-20-old"), { recursive: true });
  writeFileSync(legacyDiscussionPath(root), serialize(state()), "utf8");
  writeFileSync(join(root, ".ryker", "visao.html"), "<html>vision</html>", "utf8");
  writeFileSync(join(root, ".ryker", "arquivo", "2026-10-20-old", "discussao.json"), "{}", "utf8");
  const history = join(root, "history");
  migrateLegacyFolder(root, history);
  assert.equal(readState(root).kind, "ok");
  assert.equal(existsSync(discussionPath(root)), true);
  assert.equal(readFileSync(visionPath(root), "utf8"), "<html>vision</html>");
  assert.equal(existsSync(join(history, "2026-10-20-old", "discussao.json")), true);
  assert.equal(existsSync(join(root, ".ryker")), false);
  rmSync(root, { recursive: true });
});

test("state migration: an existing .pi/ryker discussion is not overwritten by the legacy one (P45)", () => {
  const root = project();
  mkdirSync(join(root, ".ryker"), { recursive: true });
  mkdirSync(join(root, ".pi", "ryker"), { recursive: true });
  writeFileSync(legacyDiscussionPath(root), "legacy", "utf8");
  writeFileSync(discussionPath(root), serialize(state()), "utf8");
  migrateLegacyFolder(root, join(root, "history"));
  assert.equal(readFileSync(legacyDiscussionPath(root), "utf8"), "legacy");
  assert.equal(readState(root).kind, "ok");
  rmSync(root, { recursive: true });
});

test("cycle history: the vision moves to the cycle folder and the discussion is copied there (P45)", () => {
  const root = project();
  mkdirSync(join(root, ".pi", "ryker"), { recursive: true });
  writeFileSync(discussionPath(root), serialize(state()), "utf8");
  writeFileSync(visionPath(root), "<html>v</html>", "utf8");
  const cycleDir = join(root, "history", "2026-10-27-1000-demo");
  moveVisionToCycle(root, cycleDir);
  assert.equal(readFileSync(join(cycleDir, "visao.html"), "utf8"), "<html>v</html>");
  assert.equal(existsSync(visionPath(root)), false);
  assert.equal(existsSync(join(cycleDir, "discussao.json")), true);
  assert.equal(readState(root).kind, "ok");
  rmSync(root, { recursive: true });
});

test("ownership: a session that is not the owner is refused, legacy and owner pass (P35)", () => {
  assert.equal(ownershipRefusal({ ...state(), donoSessao: "a" }, "b") !== undefined, true);
  assert.equal(ownershipRefusal({ ...state(), donoSessao: "a" }, "a"), undefined);
  assert.equal(ownershipRefusal(state(), "b"), undefined);
});
