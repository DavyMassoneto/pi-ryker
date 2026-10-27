# F1a limits

What F1a could not do the way the design asks, why, and what the code does instead. Type references are to `node_modules/@earendil-works/pi-coding-agent/dist` (pi 1.2.0).

## Esc during a child run (Q "Esc pergunta")

- The driver runs outside any agent turn, so there is no operation signal for Esc to abort (`docs/extensions.md:126`: commands and idle session events often have no operation signal).
- The only raw key hook is `ctx.ui.onTerminalInput`, documented as "interactive mode only" (`core/extensions/types.d.ts:82`). The extension listens there and treats `matchesKey(data, "escape")` during a child run like `/ryker parar`.
- In pi-web and RPC sessions Esc does not reach the extension. `/ryker parar` is the guaranteed path in every interface. Whether the interactive editor delivers Esc to the listener while idle is part of the live proof.
- With no dialog (print mode), the "stuck / other reason" question stays pending in `ciclo.json`; `/ryker retomar` asks it again and refuses to resume until it is answered.

## Memory-write tools in the owner session (Q: C8)

- No memory-write tool is registered in the owner session on this PC (packages in `~/.pi/agent/settings.json`, checked 27/10). `pi-observational-memory` registers `record_observations` only inside its own headless observer process (`agent/index.ts`): that is the automatic capture, which the design keeps on.
- While the cycle runs, `write` and `edit` are refused in every session of the project, so a memory note written through them is refused too (test `memory writes from the running owner are refused`).
- A shell command in the owner session that writes into the vault is not blocked by text: the owner shell is only checked for remote git and the pi-web port (C14.4, P4), as the design lists.

## Neutralization (Q "Neutralizar", SUP-38)

- Only the pi-superpowers skills are removed from the running owner's system prompt, through `before_agent_start` (`event.systemPromptOptions.skills`), as the design says. Its `plan_tracker` tool stays: the design names only the skills. Nothing from nucleo-guards is installed, so nothing else is neutralized (P7, P8).

## Agent definitions from the final branch (S7)

- `DefaultResourceLoader` accepts `skillsOverride` and `agentsFilesOverride` (`core/resource-loader.d.ts:90,111`), and both are applied from the final branch. It has no option for agent definitions (`.pi/agents/`), and the children have no `subagent` tool. The definitions are read from the final branch into the stage folder (`ambiente/`) with the skills and AGENTS.md, and listed in `ambiente.json`, but no child loads them.

## New session when progress does not fit (U21, "Continuação em sessão nova")

- The decision runs in the child's `session_before_compact`: progress file + fixed text + `reserveTokens` + `keepRecentTokens` (`CompactionSettings`, `core/compaction/compaction.d.ts:28`) against `ctx.model.contextWindow`. Token counts are estimated at 4 characters per token; pi exposes no tokenizer to extensions.
- When it does not fit, the guard cancels the compaction (`{ cancel: true }`), the runner aborts that session and opens a new one in the same execution folder with the same fixed text. If the model reports no context window, the progress file is used as the summary.

## Takeover (P35, 18.11)

- The old driver learns it lost the cycle at its next heartbeat (`HEARTBEAT_MS`) or at its child's next tool call (epoch check in the guard). A tool call already executing in the old child finishes.
- The new owner restores the old execution's restore point when it adopts the cycle. A write by the old child that lands after that restore is not undone by the takeover; it shows as an outside change at the next run (M2b).

## Restore points (Mec9, C13.2) and branch/HEAD check (P6, Mec7)

- `git commit-tree` needs the user's git identity; without `user.name` and `user.email` the restore point fails and the run reports the error.
- Restoring puts back the branch ref, HEAD, every non-ignored file and the index as it was. Ignored files created during the run are left in place (Q "Registra e não apaga").
- Stage 2 starts only on a checked-out branch with at least one commit; a detached HEAD is refused.

## Vision and history (P45)

- During the Discussion the vision lives in `.pi/ryker/visao.html` (the cycle id, and so the history folder, only exists at the stage 2 entry). At the stage 2 entry it moves to the cycle folder in `~/.pi/agent/ryker/history/<name>-<hash8>/<cycle>/`.
- The Discussion state is copied there, not moved: the Discussion guard keeps reading the approved state in `.pi/ryker/discussao.json`. The design's root name `discussao.md` comes with the F1b document.
- Archived approved discussions go to the project history folder instead of `.ryker/arquivo/`; at session start the stage-1 `.ryker/` folder is migrated (state and vision to `.pi/ryker/`, archives to the history folder).

## Configuration (F1a)

- The design has the Discussion write `.pi/ryker/config.json` in F1b. F1a keeps reading the hand-written file and validates it with named problems (absolute `vaultPath` and `allowedRoots`, `piWeb.port` range, non-empty owner names, model and thinking shapes).
