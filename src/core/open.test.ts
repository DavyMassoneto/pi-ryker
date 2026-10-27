import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldOpen } from "./document.ts";

test("shouldOpen: opens by default; RYKER_ABRIR=0 turns it off", () => {
  assert.equal(shouldOpen({}), true);
  assert.equal(shouldOpen({ RYKER_ABRIR: undefined }), true);
  assert.equal(shouldOpen({ RYKER_ABRIR: "1" }), true);
  assert.equal(shouldOpen({ RYKER_ABRIR: "0" }), false);
  assert.equal(shouldOpen({ RYKER_ABRIR: " 0 " }), false);
  assert.equal(shouldOpen({ RYKER_ABRIR: "false" }), false);
});
