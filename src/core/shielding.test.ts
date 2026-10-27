import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentShellEnv,
  checkAgentShell,
  checkOwnerSessionShell,
  checkOwnerSessionTool,
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

test("PI_CODING_AGENT_DIR and PI_HOME are injected pointing at the execution folder (SUP-47)", () => {
  assert.deepEqual(agentShellEnv("/hist/run-01/pi"), {
    PI_CODING_AGENT_DIR: "/hist/run-01/pi",
    PI_HOME: "/hist/run-01/pi",
  });
});
