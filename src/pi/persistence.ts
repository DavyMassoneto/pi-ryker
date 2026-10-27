import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { projectRykerDir } from "../core/cyclePaths.ts";
import { findGitRoot } from "../core/gitRoot.ts";
import { archiveName } from "../core/restoration.ts";
import { deserialize, serialize } from "../core/serialization.ts";
import { sessionRole } from "../core/session.ts";
import type { DiscussionState } from "../core/state.ts";
import { ensureExcluded } from "./fsAdapters.ts";

export const SNAPSHOT_ENTRY_TYPE = "ryker-discussao";

export type StateRead =
  | { kind: "absent" }
  | { kind: "ok"; state: DiscussionState }
  | { kind: "corrupted"; error: string };

export const rykerFolder = (cwd: string): string => join(cwd, ".ryker");
export const legacyDiscussionPath = (cwd: string): string =>
  join(rykerFolder(cwd), "discussao.json");
export const discussionPath = (cwd: string): string => join(projectRykerDir(cwd), "discussao.json");
export const visionPath = (cwd: string): string => join(projectRykerDir(cwd), "visao.html");
const legacyVisionPath = (cwd: string): string => join(rykerFolder(cwd), "visao.html");
const legacyArchiveFolder = (cwd: string): string => join(rykerFolder(cwd), "arquivo");
export const VISION_FILE = "visao.html";
export const DISCUSSION_FILE = "discussao.json";

function readStateFile(path: string): StateRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" };
    return { kind: "corrupted", error: (e as Error).message };
  }
  try {
    return { kind: "ok", state: deserialize(text) };
  } catch (e) {
    return { kind: "corrupted", error: (e as Error).message };
  }
}

export function readState(cwd: string): StateRead {
  const current = readStateFile(discussionPath(cwd));
  return current.kind === "absent" ? readStateFile(legacyDiscussionPath(cwd)) : current;
}

export function writeState(cwd: string, state: DiscussionState): void {
  mkdirSync(projectRykerDir(cwd), { recursive: true });
  excludeProjectFolder(cwd);
  const destination = discussionPath(cwd);
  const tmp = `${destination}.tmp`;
  writeFileSync(tmp, serialize(state), "utf8");
  renameSync(tmp, destination);
}

function excludeProjectFolder(cwd: string): void {
  try {
    const root = findGitRoot(cwd, (dir) => existsSync(join(dir, ".git")));
    if (root) ensureExcluded(root, ".pi/ryker");
  } catch {}
}

export function ownershipRefusal(state: DiscussionState, sessionId: string): string | undefined {
  return sessionRole(state, sessionId) === "reader"
    ? "Esta Discussão Global pertence a outra sessão deste projeto; aqui só é possível ver o status."
    : undefined;
}

export function writeDocument(cwd: string, html: string): string {
  mkdirSync(projectRykerDir(cwd), { recursive: true });
  excludeProjectFolder(cwd);
  const destination = visionPath(cwd);
  const tmp = `${destination}.tmp`;
  writeFileSync(tmp, html, "utf8");
  renameSync(tmp, destination);
  return destination;
}

export function saveState(pi: ExtensionAPI, cwd: string, state: DiscussionState): void {
  writeState(cwd, state);
  pi.appendEntry(SNAPSHOT_ENTRY_TYPE, state);
}

export function activeState(cwd: string): DiscussionState | undefined {
  const l = readState(cwd);
  return l.kind === "ok" && l.state.fase !== "aprovada" ? l.state : undefined;
}

export function approvedState(cwd: string): DiscussionState | undefined {
  const l = readState(cwd);
  return l.kind === "ok" && l.state.fase === "aprovada" ? l.state : undefined;
}

function freeFolder(base: string): string {
  let folder = base;
  for (let n = 2; existsSync(folder); n++) folder = `${base}-${n}`;
  return folder;
}

const currentVision = (cwd: string): string | undefined =>
  [visionPath(cwd), legacyVisionPath(cwd)].find((path) => existsSync(path));

export function archiveApproved(cwd: string, state: DiscussionState, historyRoot: string): string {
  const folder = freeFolder(join(historyRoot, archiveName(state)));
  mkdirSync(folder, { recursive: true });
  const source = existsSync(discussionPath(cwd)) ? discussionPath(cwd) : legacyDiscussionPath(cwd);
  renameSync(source, join(folder, DISCUSSION_FILE));
  const vision = currentVision(cwd);
  if (vision) renameSync(vision, join(folder, VISION_FILE));
  return folder;
}

export function moveVisionToCycle(cwd: string, cycleDir: string): void {
  mkdirSync(cycleDir, { recursive: true });
  const vision = currentVision(cwd);
  if (vision) renameSync(vision, join(cycleDir, VISION_FILE));
  const discussion = [discussionPath(cwd), legacyDiscussionPath(cwd)].find((path) =>
    existsSync(path),
  );
  if (discussion) copyFileSync(discussion, join(cycleDir, DISCUSSION_FILE));
}

function moveIfAbsent(source: string, destination: string): void {
  if (!existsSync(source) || existsSync(destination)) return;
  mkdirSync(dirname(destination), { recursive: true });
  renameSync(source, destination);
}

function removeIfEmpty(folder: string): void {
  try {
    if (readdirSync(folder).length === 0) rmdirSync(folder);
  } catch {}
}

export function migrateLegacyFolder(cwd: string, historyRoot: string): void {
  if (!existsSync(rykerFolder(cwd))) return;
  moveIfAbsent(legacyDiscussionPath(cwd), discussionPath(cwd));
  moveIfAbsent(legacyVisionPath(cwd), visionPath(cwd));
  const archive = legacyArchiveFolder(cwd);
  if (existsSync(archive)) {
    for (const entry of readdirSync(archive)) {
      const destination = freeFolder(join(historyRoot, entry));
      mkdirSync(historyRoot, { recursive: true });
      renameSync(join(archive, entry), destination);
    }
    removeIfEmpty(archive);
  }
  removeIfEmpty(rykerFolder(cwd));
}
