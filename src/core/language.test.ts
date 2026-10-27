import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "./document.ts";
import { documentLabels } from "./documentI18n.ts";
import { isPortuguese, labels, MISSING_LANGUAGE_ERROR, resolveLanguage } from "./i18n.ts";
import { deserialize, serialize } from "./serialization.ts";
import { createState } from "./state.ts";

const base = { request: "p", now: "2026-10-23T10:00:00.000Z", previous: { ferramentas: [] } };

test("createState without language: starts without language", () => {
  const e = createState(base);
  assert.equal(e.idioma, undefined);
  assert.equal("idioma" in e, false);
});

test("serialization: state without language and old pt/en states load", () => {
  const without = createState(base);
  assert.deepEqual(deserialize(serialize(without)), without);
  for (const tag of ["pt", "en", "pt-BR"]) {
    const e = createState({ ...base, language: tag });
    assert.equal(deserialize(serialize(e)).idioma, tag);
  }
});

test("resolveLanguage: no language and no parameter is refused", () => {
  const r = resolveLanguage(createState(base), undefined);
  assert.deepEqual(r, { ok: false, error: MISSING_LANGUAGE_ERROR });
  assert.match(MISSING_LANGUAGE_ERROR, /idioma/);
  assert.equal(resolveLanguage(createState(base), "  ").ok, false);
});

test("resolveLanguage: sets, keeps and updates", () => {
  const r = resolveLanguage(createState(base), "es");
  assert.ok(r.ok && r.state.idioma === "es");
  const keeps = resolveLanguage(r.ok ? r.state : createState(base), undefined);
  assert.ok(keeps.ok && keeps.state.idioma === "es");
  const added = resolveLanguage(r.ok ? r.state : createState(base), "en");
  assert.ok(added.ok && added.state.idioma === "en");
});

test("labels: pt-BR and pt pick Portuguese; others, English; no language, Portuguese", () => {
  assert.equal(isPortuguese("pt-BR"), true);
  assert.equal(isPortuguese("pt"), true);
  assert.equal(isPortuguese("PT-br"), true);
  assert.equal(isPortuguese(undefined), true);
  assert.equal(isPortuguese("en"), false);
  assert.equal(isPortuguese("es"), false);
  assert.equal(isPortuguese("ptolemaic"), false);
  assert.equal(labels("pt-BR").done, labels("pt").done);
  assert.notEqual(labels("es").done, labels("pt-BR").done);
  assert.deepEqual(documentLabels("pt-BR"), documentLabels("pt"));
  assert.notDeepEqual(documentLabels("fr"), documentLabels("pt"));
});

test("document: <html lang> uses the tag", () => {
  const e = createState({ ...base, language: "pt-BR" });
  assert.match(render(e, "T", []).html, /<html lang="pt-BR">/);
});
