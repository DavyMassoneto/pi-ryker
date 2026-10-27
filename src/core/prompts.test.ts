import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  buildOwnerNotice,
  buildPlannerPrompt,
  buildReviewerPrompt,
  FIXED_TEXTS,
  PLAN_TEMPLATE,
  REVIEW_TEMPLATE,
} from "./prompts.ts";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

const APPROVED_HASHES: Record<keyof typeof FIXED_TEXTS, string> = {
  common: "c11944091e7162de80161500716d4ffe7fb48771844c30647526730c28bcb198",
  planner: "273d1591d2b19e0fbe63f136b7759e150131fbc9e4acd03dccc8e6c59eb3329c",
  reviewer: "d8be9977f5310cd2290fb777b769e979a4f9f00e5a8bd8c6fce685065ee62f00",
  ownerNotice: "d028f8d0c66df13919bb1e44e40a6fd1495d9f8dcf14abcaeb5317ef6815062e",
  planTemplate: "cf68bc52206bcd6a6b9e1ec3f47eb537405a7fac4614658224d02d75f75b7793",
  reviewTemplate: "c335c877cf6871097bd17cc841cfa5ff51b95563aed3b48068e8e09de2fef423",
};

test("fixed texts 0, 1, 6, 7 and templates A, B match the approved hashes (U7, P13)", () => {
  for (const [name, text] of Object.entries(FIXED_TEXTS)) {
    assert.equal(sha(text), APPROVED_HASHES[name as keyof typeof FIXED_TEXTS], name);
  }
});

test("templates are exposed as the same constants", () => {
  assert.equal(PLAN_TEMPLATE, FIXED_TEXTS.planTemplate);
  assert.equal(REVIEW_TEMPLATE, FIXED_TEXTS.reviewTemplate);
});

const common = {
  language: "pt-BR",
  files: "a.md, b.md",
  progressPath: "/h/progresso.md",
  vaultPath: "/vault",
};
const planner = { ...common, planPath: "/h/plano.md", templatePath: "/h/modelo-a.md" };
const noPlaceholder = (text: string): void => assert.doesNotMatch(text, /\{[A-Za-z]+\}/);

test("planner prompt: language line first, planner text after, no placeholder left (Q22, U7)", () => {
  const prompt = buildPlannerPrompt(planner);
  assert.ok(prompt.startsWith("Language: pt-BR."));
  assert.ok(prompt.includes("You are the Ryker planner for stage 2."));
  assert.ok(prompt.includes("/h/plano.md"));
  assert.ok(prompt.includes("/h/modelo-a.md"));
  assert.ok(prompt.includes("/vault"));
  noPlaceholder(prompt);
});

test("planner has no owner sentence (texto 0, dono de area so quando dono)", () => {
  assert.doesNotMatch(buildPlannerPrompt(planner), /When you are an area owner/);
});

test("area owner prompt carries owner name and paths (Q: 2/11)", () => {
  const prompt = buildPlannerPrompt({ ...planner, owner: "nucleo", ownerPaths: "src/core" });
  assert.ok(prompt.includes("you are nucleo, owner of src/core."));
  noPlaceholder(prompt);
});

test("without vault the vault sentences and clause are omitted (SUP-49)", () => {
  const prompt = buildPlannerPrompt({ ...planner, vaultPath: undefined });
  assert.doesNotMatch(prompt, /vault/);
  noPlaceholder(prompt);
});

test("reviewer prompt fills stage, round, files, extras, checks and paths (U20, COB-2)", () => {
  const prompt = buildReviewerPrompt({
    language: "en",
    stage: 2,
    round: 1,
    files: "vision.md, plano.md",
    stageExtras: "the decision log",
    stageChecks: "the test dependency classification; the split by owner",
    vaultPath: "/vault",
    progressPath: "/h/progresso.md",
    reviewPath: "/h/revisao.md",
    templatePath: "/h/modelo-b.md",
  });
  assert.ok(prompt.startsWith("Language: en."));
  assert.ok(prompt.includes("reviewer of stage 2, round 1"));
  assert.ok(prompt.includes("/h/revisao.md"));
  assert.ok(prompt.includes("the split by owner"));
  noPlaceholder(prompt);
});

test("reviewer prompt without vault omits the vault parts (SUP-49)", () => {
  const prompt = buildReviewerPrompt({
    language: "en",
    stage: 2,
    round: 1,
    files: "f",
    stageExtras: "x",
    stageChecks: "y",
    progressPath: "p",
    reviewPath: "r",
    templatePath: "t",
  });
  assert.doesNotMatch(prompt, /memory vault|vault note/);
  noPlaceholder(prompt);
});

test("owner notice is the fixed text 7 (U18.16, Q: C8)", () => {
  assert.equal(buildOwnerNotice(), FIXED_TEXTS.ownerNotice);
  assert.ok(buildOwnerNotice().startsWith("A Ryker cycle is running in this project."));
});
