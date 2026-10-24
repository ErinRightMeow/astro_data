import assert from "node:assert/strict";
import test from "node:test";
import { baseRates, chanceOfAtLeast, elementOf, score, verdict } from "../site/js/quiz-stats.js";

test("elements follow the zodiac order", () => {
  assert.equal(elementOf("Aries"), "Fire");
  assert.equal(elementOf("Taurus"), "Earth");
  assert.equal(elementOf("Aquarius"), "Air");
  assert.equal(elementOf("Pisces"), "Water");
});

test("base rates are shares of the deck", () => {
  assert.deepEqual(baseRates(["Leo", "Leo", "Virgo", "Libra"]), { Leo: 0.5, Virgo: 0.25, Libra: 0.25 });
});

test("equal chances give the binomial tail", () => {
  // P(X >= 2) for 3 coin flips = 4/8.
  assert.ok(Math.abs(chanceOfAtLeast(2, [0.5, 0.5, 0.5]) - 0.5) < 1e-12);
  assert.equal(chanceOfAtLeast(0, [0.1, 0.2]), 1);
  // At 1 in 12, 14 or more right out of 100 happens by luck under 5% of the time.
  const ps = new Array(100).fill(1 / 12);
  assert.ok(chanceOfAtLeast(13, ps) > 0.05);
  assert.ok(chanceOfAtLeast(14, ps) < 0.05);
});

test("unequal chances are summed for the expected score", () => {
  const s = score([{ p: 0.2, hit: true }, { p: 0.1, hit: false }]);
  assert.equal(s.hits, 1);
  assert.ok(Math.abs(s.expected - 0.3) < 1e-12);
  assert.ok(Math.abs(s.p - (1 - 0.8 * 0.9)) < 1e-12);
});

test("verdicts wait for enough guesses", () => {
  assert.equal(verdict({ n: 10, p: 0.001 }).level, "early");
  assert.equal(verdict({ n: 100, p: 0.001 }).level, "strong");
  assert.equal(verdict({ n: 100, p: 0.3 }).level, "none");
});
