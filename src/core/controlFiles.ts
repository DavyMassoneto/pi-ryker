import { createHash } from "node:crypto";

export type Manifest = Record<string, string>;

export interface ManifestDiff {
  changed: string[];
  added: string[];
  removed: string[];
}

export type ControlDecision =
  | { action: "none" }
  | { action: "restoreAndFail"; paths: string[] }
  | { action: "stop"; paths: string[] };

export type ChangeOrigin = "agent" | "outside";

export function hashContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function buildManifest(files: Readonly<Record<string, string | Uint8Array>>): Manifest {
  return Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, hashContent(content)]),
  );
}

export function diffManifests(before: Manifest, after: Manifest): ManifestDiff {
  return {
    changed: Object.keys(before).filter((p) => p in after && before[p] !== after[p]),
    added: Object.keys(after).filter((p) => !(p in before)),
    removed: Object.keys(before).filter((p) => !(p in after)),
  };
}

export function evaluateControlChange(diff: ManifestDiff, origin: ChangeOrigin): ControlDecision {
  const paths = [...diff.changed, ...diff.added, ...diff.removed];
  if (paths.length === 0) return { action: "none" };
  return origin === "agent" ? { action: "restoreAndFail", paths } : { action: "stop", paths };
}

export function isControlPath(path: string): boolean {
  return /(^|\/)\.git\/(config|hooks\/[^/]+|info\/[^/]+)$/.test(path.replaceAll("\\", "/"));
}
