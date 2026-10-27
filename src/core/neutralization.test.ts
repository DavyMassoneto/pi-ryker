import assert from "node:assert/strict";
import { test } from "node:test";
import { withoutNeutralizedSkills } from "./neutralization.ts";

const skill = (filePath: string, source: string) => ({ filePath, sourceInfo: { source } });

test("neutralization: pi-superpowers skills leave the owner prompt (Q Neutralizar, SUP-38)", () => {
  const kept = withoutNeutralizedSkills([
    skill(
      "C:\\agent\\npm\\node_modules\\pi-superpowers\\skills\\tdd\\SKILL.md",
      "npm:pi-superpowers",
    ),
    skill("/home/u/.pi/agent/skills/mine/SKILL.md", "user"),
    skill("/repo/.pi/skills/review/SKILL.md", "project"),
  ]);
  assert.deepEqual(
    kept.map((item) => item.filePath),
    ["/home/u/.pi/agent/skills/mine/SKILL.md", "/repo/.pi/skills/review/SKILL.md"],
  );
});

test("neutralization: a package whose name only contains pi-superpowers stays", () => {
  const kept = withoutNeutralizedSkills([
    skill("/n/node_modules/pi-superpowers-plus/skills/x/SKILL.md", "npm:pi-superpowers-plus"),
  ]);
  assert.equal(kept.length, 1);
});
