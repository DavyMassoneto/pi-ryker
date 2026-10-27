import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { type ChildGuardContext, decideChildCall } from "../core/childGuardRules.ts";
import type { WritePolicy } from "../core/policy.ts";
import { progressSummary } from "../core/progress.ts";
import type { ShellContext } from "../core/shielding.ts";

export interface ChildGuardDeps {
  policy: WritePolicy;
  shell: () => ShellContext;
  epochStillMine: () => boolean;
  progressPath: string;
  readFile: (path: string) => string | undefined;
}

const failClosed = { block: true as const, reason: "the Ryker guard failed; the call is refused" };

export function childGuardFactory(deps: ChildGuardDeps): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", async (event) => {
      try {
        const context: ChildGuardContext = {
          epochStillMine: deps.epochStillMine(),
          policy: deps.policy,
          shell: deps.shell(),
        };
        const decision = decideChildCall(
          { toolName: event.toolName, input: event.input as Record<string, unknown> },
          context,
        );
        return decision.allow ? undefined : { block: true, reason: decision.reason };
      } catch {
        return failClosed;
      }
    });

    pi.on("session_before_compact", async (event) => {
      const summary = progressSummary(deps.readFile(deps.progressPath) ?? "");
      if (summary === undefined) return undefined;
      return {
        compaction: {
          summary,
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
        },
      };
    });
  };
}
