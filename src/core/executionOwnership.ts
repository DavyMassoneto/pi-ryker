import { basename, dirname } from "node:path";
import type { ControlChange } from "./controlSnapshot.ts";
import { isRuntimeFile, isTranscriptFile } from "./cyclePaths.ts";
import type { OwnedFiles } from "./cycleRecord.ts";

export interface ChangeOwners {
  own: string[];
  late: string[];
  foreign: string[];
}

const isAppendOrNew = (change: ControlChange): boolean =>
  change.before === undefined || change.after?.startsWith(change.before) === true;

export function ownsChange(owned: OwnedFiles, change: ControlChange): boolean {
  if (change.path === owned.output) return true;
  const name = basename(change.path);
  if (dirname(change.path) !== owned.folder || !isRuntimeFile(name)) return false;
  return !isTranscriptFile(name) || isAppendOrNew(change);
}

export function assignChanges(
  changes: readonly ControlChange[],
  running: OwnedFiles | undefined,
  discarded: readonly OwnedFiles[],
): ChangeOwners {
  const owners: ChangeOwners = { own: [], late: [], foreign: [] };
  for (const change of changes) {
    if (running && ownsChange(running, change)) owners.own.push(change.path);
    else if (discarded.some((owned) => ownsChange(owned, change))) owners.late.push(change.path);
    else owners.foreign.push(change.path);
  }
  return owners;
}
