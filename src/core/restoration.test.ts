import assert from "node:assert/strict";
import { test } from "node:test";
import { archivePath, decideRestoration } from "./restoration.ts";
import { createState, type DiscussionState } from "./state.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const added = (request = "p"): DiscussionState =>
  createState({ request, language: "pt", now: T0, previous: { ferramentas: [] } });

test("active file + session with Ryker entries → reapply", () => {
  const e = added();
  const d = decideRestoration({ kind: "ok", state: e }, [added("antigo"), e]);
  assert.deepEqual(d, { action: "reapply", state: e });
});

test("active file + session without entries → only warn", () => {
  const e = added();
  assert.deepEqual(decideRestoration({ kind: "ok", state: e }, []), {
    action: "warn",
    state: e,
  });
});

test("absent file + entries → recreate from the last snapshot", () => {
  const a = added("a");
  const b = added("b");
  assert.deepEqual(decideRestoration({ kind: "absent" }, [a, b]), { action: "recreate", state: b });
});

test("corrupted file → does not overwrite, warns", () => {
  const d = decideRestoration({ kind: "corrupted", error: "x" }, [added()]);
  assert.deepEqual(d, { action: "corrupted", error: "x" });
});

test("nothing to do: absent without entries and approved file", () => {
  assert.deepEqual(decideRestoration({ kind: "absent" }, []), { action: "nothing" });
  const approved: DiscussionState = { ...added(), fase: "aprovada" };
  assert.deepEqual(decideRestoration({ kind: "ok", state: approved }, [approved]), {
    action: "nothing",
  });
});

test("archivePath: .ryker/arquivo/<date>-<slug>", () => {
  const e: DiscussionState = {
    ...added("Quero uma CLI de lembretes!"),
    fase: "aprovada",
    aprovadoEm: "2026-10-24T09:00:00.000Z",
  };
  assert.equal(archivePath(e), ".ryker/arquivo/2026-10-24-quero-uma-cli-de-lembretes");
  assert.match(archivePath(added("x".repeat(200))), /^\.ryker\/arquivo\/2026-10-23-x{1,40}$/);
});
