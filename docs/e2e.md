# End-to-end tests

The e2e suite drives a real `pi --mode rpc` and a real pi-web against Ryker installed from the packed tarball. It needs a model provider and credentials, so it is not part of `npm test`, `npm run check` or CI, and `package.json` `files` keeps it out of the published package.

The in-process suites (fake `ctx`, scripted agent, no pi, no model) are integration tests in `test/integration/`, run by `npm run test:integration`, and they stay in `npm run check`.

## Run

```
npm run e2e
```

`RYKER_E2E_SOURCE` is the directory to pack (default: the current directory). Point it at a clean export to avoid testing a tree that is being edited:

```
git archive HEAD | tar -x -C <dir>
cd <dir> && npm ci
RYKER_E2E_SOURCE=<dir> npm run e2e
```

Requirements: the managed pi under `~/.pi/agent/install`, pi-web under `~/AppData/Local/pi-node/current/node_modules/@agegr/pi-web`, and an `omni-claude` entry in `~/.pi/agent/models.json` and `auth.json`. Each full run spends tokens on `omni-claude/cc/claude-haiku-5-5`.

## What the harness does (`e2e/harness.ts`)

- Packs the source directory with `npm pack` and installs the tarball with `npm install --omit=peer` into `<sandbox>/agent/ryker-install`.
- Creates a sandbox under the OS temp folder. `PI_CODING_AGENT_DIR`, `PI_HOME`, `HOME`, `USERPROFILE`, `TEMP`, `TMP`, `APPDATA` and `LOCALAPPDATA` all point into it. The real agent dir is only read, never written.
- Copies only the `omni-claude` entry of `models.json` and `auth.json` into the sandbox agent dir (contents are never printed) and writes a fresh `settings.json`.
- Starts `pi --mode rpc` processes (answering each `extension_ui_request`: the "Approve" option, `true` for confirmations) and one pi-web on a free port bound to `127.0.0.1`. pi-web is never started on the port of the real instance.
- Creates toy git projects, with a local `--bare` remote when a scenario needs one. Each project gets a cycle config that pins the planner and reviewer to the cheap model.
- Kills every process it started and removes the sandbox in `after`.

`e2e/fixture/` is a pi package installed only in the sandbox. It wraps the installed Ryker extension and adds `/e2e-start`, which writes an approved discussion and starts stage 2 (the Discussion stage is not built yet). Flag files in the sandbox let a scenario replace the planner or reviewer by a scripted model (`faux-planner`, `faux-reviewer`); the scripted agent still runs through the real child session, tool guard and shell.

## Scenarios (`e2e/scenarios/`)

- `happy-path.e2e.ts`: the discussion is approved and stage 2 reaches approval with the real cheap model, in the CLI (status and widget history from the RPC stream) and in pi-web (status and widget from `GET /api/agent/<id>`). Checks state, tokens recorded, restore-point refs and lock release; never the model text.
- `major-problems.e2e.ts`: lock and read-only readers (CLI and pi-web), other project without status, takeover with confirmation, `/ryker parar`; tampered control files restored and the round failed; `git push` refused (the bare remote is unchanged).

## Limits

A real model may not finish the toy task (a plan or review in the wrong format). That outcome fails the happy path and the failure message names the phase reached; it is a model risk, not a driver result.
