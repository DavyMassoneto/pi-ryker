import { execFileSync } from "node:child_process";
import { gitArgs } from "../core/gitRefs.ts";

export interface GitRunner {
  cwd: string;
  run(args: readonly string[], env?: Record<string, string>): string;
  tryRun(args: readonly string[], env?: Record<string, string>): string | undefined;
  bytes(args: readonly string[]): Buffer;
}

const MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;

export function gitRunner(cwd: string): GitRunner {
  const execute = (args: readonly string[], env?: Record<string, string>): Buffer =>
    execFileSync("git", gitArgs(args, { unsigned: true }), {
      cwd,
      env: { ...process.env, ...env },
      maxBuffer: MAX_OUTPUT_BYTES,
      stdio: ["ignore", "pipe", "pipe"],
    });
  return {
    cwd,
    run: (args, env) => execute(args, env).toString("utf8"),
    tryRun: (args, env) => {
      try {
        return execute(args, env).toString("utf8");
      } catch {
        return undefined;
      }
    },
    bytes: (args) => execute(args),
  };
}
