import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTokens, readerStatusLine, statusLine, widgetLines } from "./cycleStatus.ts";

test("token format: k and M, decimal comma in Portuguese (design Status)", () => {
  assert.equal(formatTokens(180_000, "pt"), "180k");
  assert.equal(formatTokens(1_200_000, "pt"), "1,2M");
  assert.equal(formatTokens(1_200_000, "en"), "1.2M");
  assert.equal(formatTokens(950, "en"), "950");
});

test("owner status line (design Status)", () => {
  const line = statusLine({
    stage: 3,
    stageName: "Testes RED",
    round: 1,
    maxRounds: 2,
    owner: "nucleo",
    tokens: 1_200_000,
    language: "pt",
  });
  assert.equal(line, "Ryker · 3/6 Testes RED · rodada 1/2 · dono: nucleo · 1,2M tokens");
});

test("status line without owner and in English", () => {
  const line = statusLine({
    stage: 2,
    stageName: "Planning",
    round: 2,
    maxRounds: 2,
    tokens: 5000,
    language: "en",
  });
  assert.equal(line, "Ryker · 2/6 Planning · round 2/2 · 5k tokens");
});

test("reader status line is read only (C3b)", () => {
  assert.equal(
    readerStatusLine({ stage: 3, stageName: "Testes RED", language: "pt" }),
    "Ryker (só leitura) · ciclo de outra sessão · 3/6 Testes RED",
  );
});

test("widget shows the six stages with their marks (design Status)", () => {
  const lines = widgetLines({
    cycleId: "2026-10-26-1412-busca",
    repositories: 2,
    state: "running",
    language: "pt",
    stages: [
      { status: "done", detail: "aprovada" },
      { status: "done", detail: "rodada 1 aprovada · 180k" },
      { status: "current", detail: "rodada 1 · nucleo (2/3) · 410k" },
      { status: "pending" },
      { status: "pending" },
      { status: "pending" },
    ],
  });
  assert.equal(lines[0], "Ryker — ciclo 2026-10-26-1412-busca (2 repositórios) · rodando");
  assert.equal(lines[1], "[x] 1 Discussão        aprovada");
  assert.equal(lines[3], "[>] 3 Testes RED       rodada 1 · nucleo (2/3) · 410k");
  assert.equal(lines[4], "[ ] 4 Implementação");
  assert.equal(lines.length, 7);
});
