import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentShellEnv,
  checkAgentShell,
  checkOwnerSessionShell,
  checkOwnerSessionTool,
  parsePiWebRun,
  type ShellContext,
} from "./shielding.ts";

const ctx: ShellContext = {
  projectRoot: "/work/project",
  allowedRoots: ["/work/vault", "/work/declared", "/tmp/pi-output"],
  homeDir: "/home/user",
  piWeb: { hosts: ["localhost", "127.0.0.1", "box.lan"], port: 3123 },
  gitAliases: { ps: "push", st: "status", sh: "!git push origin", co: "checkout" },
};

const refused = (command: string): boolean => checkAgentShell(command, ctx).ok === false;

test("every subcommand of the D-R4-GIT list is refused for agents", () => {
  const list = [
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
  ];
  for (const sub of list) assert.equal(refused(`git ${sub} -x`), true, sub);
});

test("diff, log and status pass (D-R4-GIT)", () => {
  for (const sub of ["diff", "log --oneline", "status -s", "show HEAD", "credential fill"]) {
    assert.equal(refused(`git ${sub}`), false, sub);
  }
});

test("git with leading options and chained commands is still caught (P6)", () => {
  assert.equal(refused("git -C /work/project commit -m x"), true);
  assert.equal(refused("git -c core.x=1 push"), true);
  assert.equal(refused("npm test && git push"), true);
  assert.equal(refused("echo hi; git reset --hard"), true);
});

test("alias that leads to a banned subcommand is refused (D-R4-GIT)", () => {
  assert.equal(refused("git ps"), true);
  assert.equal(refused("git sh"), true);
  assert.equal(refused("git co main"), true);
  assert.equal(refused("git st"), false);
});

test("pi-web address plus port is refused, port alone passes (P4, D-R1-PORTA)", () => {
  assert.equal(refused("curl http://localhost:3123/api/agent"), true);
  assert.equal(refused("curl 127.0.0.1:3123"), true);
  assert.equal(refused("wget box.lan 3123"), true);
  assert.equal(refused("ssh -L 3123:db:5432 host"), false);
  assert.equal(refused("curl http://localhost:8080"), false);
});

test("owner session refuses remote git in any state (C14.4)", () => {
  for (const sub of ["push", "pull", "fetch", "remote add x y"]) {
    assert.equal(checkOwnerSessionShell(`git ${sub}`, ctx).ok, false, sub);
  }
  assert.equal(checkOwnerSessionShell("git commit -m x", ctx).ok, true);
  assert.equal(checkOwnerSessionShell("git status", ctx).ok, true);
});

test("owner session refuses the pi-web address and port too (P4)", () => {
  assert.equal(checkOwnerSessionShell("curl localhost:3123", ctx).ok, false);
});

test("subagent tool is refused in the project sessions (SUP-45)", () => {
  assert.equal(checkOwnerSessionTool("subagent").ok, false);
  assert.equal(checkOwnerSessionTool("bash").ok, true);
});

test("paths outside the project are refused in the agent shell (SUP-46)", () => {
  assert.equal(refused("cat /etc/passwd"), true);
  assert.equal(refused("type C:\\Users\\me\\.pi\\agent\\auth.json"), true);
  assert.equal(refused("cat ~/.pi/agent/auth.json"), true);
  assert.equal(refused("cat $HOME/.ssh/id_rsa"), true);
  assert.equal(refused("type %USERPROFILE%\\.pi\\agent\\auth.json"), true);
  assert.equal(refused("cat ../../secret.txt"), true);
});

test("project paths, vault, declared folders and the temp output pass (SUP-46, SUP-49)", () => {
  assert.equal(refused("cat src/a.ts"), false);
  assert.equal(refused("cat ./src/../README.md"), false);
  assert.equal(refused("cat /work/project/src/a.ts"), false);
  assert.equal(refused("grep -r x /work/vault"), false);
  assert.equal(refused("ls /work/declared/sub"), false);
  assert.equal(refused("cat /tmp/pi-output/bash-1.log"), false);
  assert.equal(refused("echo x > /dev/null"), false);
  assert.equal(refused("curl https://example.com/path"), false);
  assert.equal(refused("sed --expression=s/a/b/ file.txt"), false);
});

test("a sibling folder with the same prefix is outside (SUP-46)", () => {
  assert.equal(refused("cat /work/project-other/a.txt"), true);
});

test("git hidden behind substitution, subshell, backtick, braces and env prefixes is refused (P6)", () => {
  for (const command of [
    "$(git push)",
    "(git push)",
    "echo `git push`",
    "x=$(git commit -m a)",
    ";git push",
    "&&git push",
    "|git push",
    "FOO=1 git push",
    "FOO=1 BAR=2 git reset --hard",
    "{ git fetch; }",
    '"git" remote add x y',
    "env GIT_DIR=x git worktree add y",
  ]) {
    assert.equal(refused(command), true, command);
  }
  assert.equal(refused("echo $(git status)"), false);
});

test("home variables in every spelling are expanded before the path check (SUP-46)", () => {
  for (const command of [
    "cat $USERPROFILE/.pi/agent/auth.json",
    "cat ${HOME}/.ssh/id_rsa",
    "cat ${USERPROFILE}/x",
    "type %USERPROFILE%/x",
    "cat $env:USERPROFILE/x",
    "cat ~/x",
    "cat --file=~/x",
  ]) {
    assert.equal(refused(command), true, command);
  }
  assert.equal(refused("cat $HOME/../../work/project/a.txt"), false);
});

const homeInsideProject: ShellContext = { ...ctx, homeDir: "/work/project/home" };

test("a home variable that expands inside the project passes (SUP-46)", () => {
  assert.equal(checkAgentShell("cat $USERPROFILE/a.txt", homeInsideProject).ok, true);
});

const noConfig: ShellContext = {
  ...ctx,
  piWeb: undefined,
  piWebRuns: [{ hosts: ["100.91.99.83", "mybox"], port: 3041 }],
};

test("pi-web is refused with no hand-written config, from the running registry (P4, 18.3)", () => {
  for (const command of [
    "curl http://100.91.99.83:3041/",
    "curl http://mybox:3041",
    "curl http://localhost:3041",
    "curl http://[::1]:3041/",
    "curl http://0.0.0.0:3041",
    "curl http://127.0.0.2:3041",
    "curl http://100.100.5.5:3041",
  ]) {
    assert.equal(checkAgentShell(command, noConfig).ok, false, command);
    assert.equal(checkOwnerSessionShell(command, noConfig).ok, false, command);
  }
  assert.equal(checkAgentShell("curl http://localhost:8080", noConfig).ok, true);
  assert.equal(checkAgentShell("curl https://example.com:3041", noConfig).ok, true);
});

test("pi-web registry entries are parsed and bad ones ignored (18.3)", () => {
  assert.deepEqual(
    parsePiWebRun(
      '{"pid":1,"port":3041,"hostname":"100.91.99.83","url":"http://100.91.99.83:3041"}',
    ),
    { hosts: ["100.91.99.83"], port: 3041 },
  );
  assert.equal(parsePiWebRun("not json"), undefined);
  assert.equal(parsePiWebRun('{"port":"x"}'), undefined);
});

test("the agent folder env is isolated and refuses to sit inside protected folders (SUP-47)", () => {
  assert.deepEqual(agentShellEnv("/iso/pi"), {
    PI_CODING_AGENT_DIR: "/iso/pi",
    PI_HOME: "/iso/pi",
  });
  assert.throws(() => agentShellEnv("/cycle/run-01/pi", ["/cycle"]));
  assert.doesNotThrow(() => agentShellEnv("/iso/pi", ["/cycle", "/work/project"]));
});
