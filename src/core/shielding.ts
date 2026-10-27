import { isAbsolute, relative, resolve } from "node:path";

export interface ShellContext {
  projectRoot: string;
  allowedRoots: readonly string[];
  homeDir: string;
  piWeb: { hosts: readonly string[]; port: number } | undefined;
  gitAliases: Readonly<Record<string, string>>;
}

export type ShieldDecision = { ok: true } | { ok: false; rule: string; reason: string };

const AGENT_GIT_REFUSED = new Set([
  "commit",
  "merge",
  "rebase",
  "cherry-pick",
  "revert",
  "reset",
  "switch",
  "checkout",
  "branch",
  "tag",
  "stash",
  "push",
  "pull",
  "fetch",
  "remote",
  "update-ref",
  "worktree",
  "am",
  "config",
  "clean",
  "send-email",
  "svn",
  "p4",
  "daemon",
  "http-backend",
]);

const REMOTE_GIT_REFUSED = new Set(["push", "pull", "fetch", "remote"]);
const OPTIONS_WITH_ARGUMENT = new Set(["-C", "-c"]);
const HOME_MARKERS = ["$HOME", "%USERPROFILE%"];
const NULL_DEVICE = "/dev/null";
const ALIAS_DEPTH = 3;

const ok: ShieldDecision = { ok: true };
const refuse = (rule: string, reason: string): ShieldDecision => ({ ok: false, rule, reason });

function stripQuotes(token: string): string {
  return token.replace(/^["']+|["']+$/g, "");
}

function words(text: string): string[] {
  return text
    .split(/\s+/)
    .map(stripQuotes)
    .filter((t) => t !== "");
}

function gitSubcommands(command: string): string[] {
  const found: string[] = [];
  for (const segment of command.split(/&&|\|\||[;|&\n]/)) {
    const tokens = words(segment);
    const at = tokens.findIndex((t) => /(^|[\\/])git(\.exe)?$/i.test(t));
    if (at < 0) continue;
    for (let i = at + 1; i < tokens.length; i++) {
      const token = tokens[i] as string;
      if (OPTIONS_WITH_ARGUMENT.has(token)) i++;
      else if (!token.startsWith("-")) {
        found.push(token);
        break;
      }
    }
  }
  return found;
}

function expandAlias(sub: string, aliases: ShellContext["gitAliases"], depth = 0): string[] {
  const expansion = aliases[sub];
  if (expansion === undefined || depth >= ALIAS_DEPTH) return [sub];
  if (expansion.startsWith("!")) return gitSubcommands(expansion.slice(1));
  const first = words(expansion)[0];
  return first === undefined ? [sub] : expandAlias(first, aliases, depth + 1);
}

function refusedGit(command: string, ctx: ShellContext, refused: Set<string>): string | undefined {
  for (const sub of gitSubcommands(command)) {
    const hit = expandAlias(sub, ctx.gitAliases).find((s) => refused.has(s));
    if (hit) return hit;
  }
  return undefined;
}

function citesPiWeb(command: string, piWeb: ShellContext["piWeb"]): boolean {
  if (!piWeb) return false;
  const lower = command.toLowerCase();
  const hasHost = piWeb.hosts.some((host) => lower.includes(host.toLowerCase()));
  return hasHost && new RegExp(`(?<![0-9])${piWeb.port}(?![0-9])`).test(command);
}

function pathCandidates(command: string): string[] {
  return words(command)
    .flatMap((token) => token.split(/[=<>]/))
    .map(stripQuotes)
    .filter((t) => t !== "" && !t.includes("://"))
    .filter(
      (t) =>
        t.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(t) ||
        t.startsWith("~") ||
        HOME_MARKERS.some((m) => t.includes(m)) ||
        t.split(/[\\/]/).includes(".."),
    );
}

function expandHome(token: string, homeDir: string): string {
  let expanded = token.startsWith("~") ? homeDir + token.slice(1) : token;
  for (const marker of HOME_MARKERS) expanded = expanded.replace(marker, homeDir);
  return expanded;
}

function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function pathOutside(command: string, ctx: ShellContext): string | undefined {
  const roots = [ctx.projectRoot, ...ctx.allowedRoots];
  return pathCandidates(command).find((token) => {
    if (token === NULL_DEVICE) return false;
    const target = resolve(ctx.projectRoot, expandHome(token, ctx.homeDir));
    return !roots.some((root) => isInside(root, target));
  });
}

export function checkAgentShell(command: string, ctx: ShellContext): ShieldDecision {
  const git = refusedGit(command, ctx, AGENT_GIT_REFUSED);
  if (git) return refuse("D-R4-GIT", `git ${git} is not allowed for agents`);
  if (citesPiWeb(command, ctx.piWeb))
    return refuse("P4", "the pi-web address and port are off limits");
  const outside = pathOutside(command, ctx);
  if (outside)
    return refuse("SUP-46", `${outside} is outside the project and the declared folders`);
  return ok;
}

export function checkOwnerSessionShell(command: string, ctx: ShellContext): ShieldDecision {
  const git = refusedGit(command, ctx, REMOTE_GIT_REFUSED);
  if (git) return refuse("C14.4", `git ${git} is not allowed while a cycle is open`);
  if (citesPiWeb(command, ctx.piWeb))
    return refuse("P4", "the pi-web address and port are off limits");
  return ok;
}

export function checkOwnerSessionTool(toolName: string): ShieldDecision {
  if (toolName === "subagent")
    return refuse("SUP-45", "the subagent tool is refused while a cycle is open");
  return ok;
}

export function agentShellEnv(executionDir: string): Record<string, string> {
  return { PI_CODING_AGENT_DIR: executionDir, PI_HOME: executionDir };
}
