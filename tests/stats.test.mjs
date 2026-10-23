import assert from "node:assert/strict";
import test from "node:test";
import { benjaminiHochberg, pTwoSided, testCell, verdict } from "../site/js/stats.js";

test("p-values match the normal distribution", () => {
  assert.ok(Math.abs(pTwoSided(1.96) - 0.05) < 1e-3);
  assert.ok(Math.abs(pTwoSided(0) - 1) < 1e-6);
  assert.ok(Math.abs(pTwoSided(-3) - 0.0027) < 1e-4);
});

test("Benjamini-Hochberg matches a worked example", () => {
  const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
  assert.deepEqual(q.map((x) => +x.toFixed(4)), [0.04, 0.0533, 0.0533, 0.5]);
});

test("a cell with no difference is not significant", () => {
  const r = testCell(100, 100, 90);
  assert.equal(r.ratio, 1);
  assert.equal(verdict(r, r.p), "none");
});

test("a large difference is significant and small groups are hidden", () => {
  const r = testCell(200, 120, 110);
  assert.ok(r.low > 1);
  assert.equal(verdict(r, r.p), "more");
  assert.equal(verdict(testCell(5, 2, 2), 0.001), "hidden");
});
