import { resolve } from "node:path";

export interface WritePolicy {
  role: "planner" | "reviewer";
  allowed: readonly string[];
}

export type WriteDecision = { ok: true } | { ok: false; reason: string };

const normalize = (path: string): string => {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

export function canWrite(policy: WritePolicy, path: string): WriteDecision {
  const target = normalize(path);
  if (policy.allowed.some((allowed) => normalize(allowed) === target)) return { ok: true };
  return {
    ok: false,
    reason: `the ${policy.role} writes only its own file and its progress file; ${path} is not allowed`,
  };
}
