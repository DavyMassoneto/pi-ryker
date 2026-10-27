import assert from "node:assert/strict";
import { test } from "node:test";
import { missingCoverage, parseReview } from "./findings.ts";

const finding = (blocks: boolean, id = "F1") => ({
  id,
  where: "a.ts:1",
  evidence: "e",
  violates: "Q8",
  blocks,
  kind: "defect",
  needsUserDecision: false,
});

const review = (opts: { json?: string; lines?: string[]; status?: string } = {}) =>
  [
    opts.json ?? `\`\`\`json\n${JSON.stringify({ findings: [finding(false)] })}\n\`\`\``,
    "review text",
    ...(opts.lines ?? [
      "CITED: none",
      "MECHANICAL_ONLY: none",
      "RENAMED: none",
      "INTEGRATION_DEFECT: no",
    ]),
    ...(opts.status === undefined ? [] : [`STATUS: ${opts.status}`]),
  ].join("\n");

const ctx = { producers: ["nucleo", "web"], coverageMissing: [] as string[] };

test("approved review without blocking findings parses (Mec5)", () => {
  const parsed = parseReview(review({ status: "APPROVED" }), ctx);
  assert.equal(parsed.status, "APPROVED");
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.blocking, false);
});

test("broken JSON makes the review invalid: no STATUS (Mec5)", () => {
  const parsed = parseReview(review({ json: "```json\n{broken\n```", status: "APPROVED" }), ctx);
  assert.equal(parsed.status, undefined);
  assert.match(parsed.problems.join("\n"), /JSON/);
});

test("STATUS APPROVED with a blocking finding diverges: no STATUS (Mec5)", () => {
  const json = `\`\`\`json\n${JSON.stringify({ findings: [finding(true)] })}\n\`\`\``;
  const parsed = parseReview(review({ json, status: "APPROVED" }), ctx);
  assert.equal(parsed.status, undefined);
  assert.match(parsed.problems.join("\n"), /diverg/);
});

test("STATUS REJECTED without a blocking finding diverges: no STATUS (Mec5)", () => {
  assert.equal(parseReview(review({ status: "REJECTED" }), ctx).status, undefined);
});

test("REJECTED with a blocking finding is kept (D-USR-METODO.2)", () => {
  const json = `\`\`\`json\n${JSON.stringify({ findings: [finding(true)] })}\n\`\`\``;
  const parsed = parseReview(review({ json, status: "REJECTED" }), ctx);
  assert.equal(parsed.status, "REJECTED");
  assert.equal(parsed.blocking, true);
});

test("BACK_TO_DISCUSSION is accepted regardless of findings (Q: C1)", () => {
  assert.equal(
    parseReview(review({ status: "BACK_TO_DISCUSSION" }), ctx).status,
    "BACK_TO_DISCUSSION",
  );
});

test("missing STATUS line means no STATUS (Mec5)", () => {
  assert.equal(parseReview(review({}), ctx).status, undefined);
});

test("STATUS must be the last line (Mec5)", () => {
  const text = `${review({ status: "APPROVED" })}\ntrailing`;
  assert.equal(parseReview(text, ctx).status, undefined);
});

test("missing coverage means no STATUS (COB-2, R2-U2)", () => {
  const parsed = parseReview(review({ status: "APPROVED" }), {
    ...ctx,
    coverageMissing: ["plan section Tasks"],
  });
  assert.equal(parsed.status, undefined);
  assert.match(parsed.problems.join("\n"), /coverage/);
});

test("missing fixed lines mean none (R2-U3)", () => {
  const parsed = parseReview(review({ lines: [], status: "APPROVED" }), ctx);
  assert.deepEqual(parsed.cited, []);
  assert.deepEqual(parsed.mechanicalOnly, []);
  assert.deepEqual(parsed.renamed, []);
  assert.equal(parsed.integrationDefect, false);
});

test("CITED keeps known producers and ignores unknown names (R2-U3)", () => {
  const parsed = parseReview(
    review({ lines: ["CITED: nucleo | ghost | web"], status: "REJECTED" }),
    ctx,
  );
  assert.deepEqual(parsed.cited, ["nucleo", "web"]);
});

test("MECHANICAL_ONLY and RENAMED lines are parsed (C7.1, P-24)", () => {
  const parsed = parseReview(
    review({
      lines: [
        "MECHANICAL_ONLY: case a | old a -> new a",
        "RENAMED: old b -> new b",
        "INTEGRATION_DEFECT: yes",
      ],
      status: "APPROVED",
    }),
    ctx,
  );
  assert.deepEqual(parsed.mechanicalOnly, ["case a", "old a -> new a"]);
  assert.deepEqual(parsed.renamed, [{ from: "old b", to: "new b" }]);
  assert.equal(parsed.integrationDefect, true);
});

test("coverage lists the items the review covered (COB-2)", () => {
  const progress =
    "# progress\n## Coverage\n- plan section Tasks\n- plan section Assumptions\n## Other\n- x";
  assert.deepEqual(missingCoverage(progress, ["plan section Tasks", "plan section Shared files"]), [
    "plan section Shared files",
  ]);
  assert.deepEqual(missingCoverage("no coverage here", ["a"]), ["a"]);
});
