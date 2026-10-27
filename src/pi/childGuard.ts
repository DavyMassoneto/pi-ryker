import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { type ChildGuardContext, decideChildCall } from "../core/childGuardRules.ts";
import type { WritePolicy } from "../core/policy.ts";
import { continuationDecision, estimateTokens, progressSummary } from "../core/progress.ts";
import type { ShellContext } from "../core/shielding.ts";
import type { ContinuationHooks } from "./agent.ts";

export interface ChildGuardDeps {
  policy: WritePolicy;
  shell: () => ShellContext;
  epochStillMine: () => boolean;
  progressPath: string;
  readFile: (path: string) => string | undefined;
  fixedText: string;
  continuation: ContinuationHooks;
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

    pi.on("session_before_compact", async (event, ctx) => {
      const summary = progressSummary(deps.readFile(deps.progressPath) ?? "");
      if (summary === undefined) return undefined;
      const windowTokens = ctx.model?.contextWindow;
      const settings = event.preparation.settings;
      const decision =
        windowTokens === undefined
          ? "keepSession"
          : continuationDecision({
              progressTokens: estimateTokens(summary),
              fixedTextTokens: estimateTokens(deps.fixedText),
              windowTokens,
              reservedTokens: settings.reserveTokens + settings.keepRecentTokens,
            });
      if (decision === "newSession") {
        deps.continuation.requestNewSession();
        return { cancel: true };
      }
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
