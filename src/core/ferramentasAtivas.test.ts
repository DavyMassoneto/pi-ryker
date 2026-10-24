import assert from "node:assert/strict";
import { test } from "node:test";
import { conjuntoDaEtapa, FERRAMENTAS_RYKER, restaurarConjunto } from "./ferramentasAtivas.ts";

test("conjuntoDaEtapa: read/grep/find/ls + Ryker, sem ask_user_question nem edição", () => {
  const c = conjuntoDaEtapa();
  for (const t of ["read", "grep", "find", "ls", ...FERRAMENTAS_RYKER]) assert.ok(c.includes(t), t);
  assert.ok(!c.includes("ask_user_question"));
  assert.ok(!c.includes("bash") && !c.includes("edit") && !c.includes("write"));
  assert.ok(FERRAMENTAS_RYKER.includes("ryker_perguntar"));
});

test("restaurarConjunto devolve a lista salva (cópia)", () => {
  const salva = ["read", "bash", "ask_user_question"];
  const r = restaurarConjunto(salva);
  assert.deepEqual(r, salva);
  assert.notEqual(r, salva);
});
