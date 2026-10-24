import assert from "node:assert/strict";
import { test } from "node:test";
import { deveAbrir } from "./documento.ts";

test("deveAbrir: abre por padrão; RYKER_ABRIR=0 desliga", () => {
  assert.equal(deveAbrir({}), true);
  assert.equal(deveAbrir({ RYKER_ABRIR: undefined }), true);
  assert.equal(deveAbrir({ RYKER_ABRIR: "1" }), true);
  assert.equal(deveAbrir({ RYKER_ABRIR: "0" }), false);
  assert.equal(deveAbrir({ RYKER_ABRIR: " 0 " }), false);
  assert.equal(deveAbrir({ RYKER_ABRIR: "false" }), false);
});
