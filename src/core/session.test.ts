import assert from "node:assert/strict";
import { test } from "node:test";
import { claimOwner, sessionRole } from "./session.ts";

test("role is owner for the session recorded as owner (P35)", () => {
  assert.equal(sessionRole({ donoSessao: "s1" }, "s1"), "owner");
});

test("role is reader for another session of the same project (C3a, C3b)", () => {
  assert.equal(sessionRole({ donoSessao: "s1" }, "s2"), "reader");
});

test("role is none without state and for a legacy state without owner (section 3)", () => {
  assert.equal(sessionRole(undefined, "s1"), "none");
  assert.equal(sessionRole({}, "s1"), "none");
});

test("claimOwner records the owner only on a legacy state without owner", () => {
  assert.deepEqual(claimOwner({ donoSessao: undefined, a: 1 }, "s1"), { a: 1, donoSessao: "s1" });
  assert.deepEqual(claimOwner({ donoSessao: "s0" }, "s1"), { donoSessao: "s0" });
});
