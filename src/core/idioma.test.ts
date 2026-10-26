import assert from "node:assert/strict";
import { test } from "node:test";
import { renderizar } from "./documento.ts";
import { criarEstado } from "./estado.ts";
import { ERRO_SEM_IDIOMA, ehPt, resolverIdioma, rotulos } from "./i18n.ts";
import { rotulosDoc } from "./i18nDocumento.ts";
import { desserializar, serializar } from "./serializacao.ts";

const base = { pedido: "p", agora: "2026-10-23T10:00:00.000Z", anterior: { ferramentas: [] } };

test("criarEstado sem idioma: nasce sem idioma", () => {
  const e = criarEstado(base);
  assert.equal(e.idioma, undefined);
  assert.equal("idioma" in e, false);
});

test("serialização: estado sem idioma e estados antigos pt/en carregam", () => {
  const sem = criarEstado(base);
  assert.deepEqual(desserializar(serializar(sem)), sem);
  for (const tag of ["pt", "en", "pt-BR"]) {
    const e = criarEstado({ ...base, idioma: tag });
    assert.equal(desserializar(serializar(e)).idioma, tag);
  }
});

test("resolverIdioma: sem idioma e sem parâmetro é recusado", () => {
  const r = resolverIdioma(criarEstado(base), undefined);
  assert.deepEqual(r, { ok: false, erro: ERRO_SEM_IDIOMA });
  assert.match(ERRO_SEM_IDIOMA, /idioma/);
  assert.equal(resolverIdioma(criarEstado(base), "  ").ok, false);
});

test("resolverIdioma: define, mantém e atualiza", () => {
  const r = resolverIdioma(criarEstado(base), "es");
  assert.ok(r.ok && r.estado.idioma === "es");
  const mantem = resolverIdioma(r.ok ? r.estado : criarEstado(base), undefined);
  assert.ok(mantem.ok && mantem.estado.idioma === "es");
  const novo = resolverIdioma(r.ok ? r.estado : criarEstado(base), "en");
  assert.ok(novo.ok && novo.estado.idioma === "en");
});

test("rótulos: pt-BR e pt escolhem português; outros, inglês; sem idioma, português", () => {
  assert.equal(ehPt("pt-BR"), true);
  assert.equal(ehPt("pt"), true);
  assert.equal(ehPt("PT-br"), true);
  assert.equal(ehPt(undefined), true);
  assert.equal(ehPt("en"), false);
  assert.equal(ehPt("es"), false);
  assert.equal(ehPt("ptolemaic"), false);
  assert.equal(rotulos("pt-BR").concluir, rotulos("pt").concluir);
  assert.notEqual(rotulos("es").concluir, rotulos("pt-BR").concluir);
  assert.deepEqual(rotulosDoc("pt-BR"), rotulosDoc("pt"));
  assert.notDeepEqual(rotulosDoc("fr"), rotulosDoc("pt"));
});

test("documento: <html lang> usa a tag", () => {
  const e = criarEstado({ ...base, idioma: "pt-BR" });
  assert.match(renderizar(e, "T", []).html, /<html lang="pt-BR">/);
});
