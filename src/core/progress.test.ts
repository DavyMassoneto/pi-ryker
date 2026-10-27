import assert from "node:assert/strict";
import { test } from "node:test";
import { continuationDecision, estimateTokens, progressSummary } from "./progress.ts";

test("compaction summary is the whole progress file (Q Compactacao do Ryker)", () => {
  const text = "# progress\n- did a\n- did b\n";
  assert.equal(progressSummary(text), text);
});

test("an empty progress file is not a usable summary (Q Compactacao do Ryker)", () => {
  assert.equal(progressSummary("  \n"), undefined);
});

test("progress that fits keeps the session (Q Continuacao em sessao nova)", () => {
  const decision = continuationDecision({
    progressTokens: 1000,
    fixedTextTokens: 500,
    windowTokens: 10_000,
    reservedTokens: 2000,
  });
  assert.equal(decision, "keepSession");
});

test("progress that does not fit opens a new session (Q Continuacao em sessao nova)", () => {
  const decision = continuationDecision({
    progressTokens: 8000,
    fixedTextTokens: 500,
    windowTokens: 10_000,
    reservedTokens: 2000,
  });
  assert.equal(decision, "newSession");
});

test("exact fit keeps the session", () => {
  const decision = continuationDecision({
    progressTokens: 7500,
    fixedTextTokens: 500,
    windowTokens: 10_000,
    reservedTokens: 2000,
  });
  assert.equal(decision, "keepSession");
});

test("token estimate rounds characters / 4 up", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens(""), 0);
});
