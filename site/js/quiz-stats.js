// Scoring for the chart-guessing game.
//
// Chance is not a flat 1 in 12: at European latitudes some signs rise far
// more often than others, so always guessing Virgo rising beats 1 in 12.
// Each guess's chance of being right is the share of the deck with that
// answer, and the score is compared with the sum of those chances.

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
  "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export const ELEMENTS = ["Fire", "Earth", "Air", "Water"];

export const elementOf = (sign) => ELEMENTS[SIGNS.indexOf(sign) % 4];

// Share of cards with each answer, e.g. {Virgo: 0.11, ...}.
export function baseRates(answers) {
  const counts = {};
  for (const a of answers) counts[a] = (counts[a] || 0) + 1;
  for (const k in counts) counts[k] /= answers.length;
  return counts;
}

// P(at least `hits` right) when guess i is right with probability ps[i]
// (Poisson-binomial distribution, computed exactly).
export function chanceOfAtLeast(hits, ps) {
  let dist = [1];
  for (const p of ps) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p);
      next[k + 1] += dist[k] * p;
    }
    dist = next;
  }
  let tail = 0;
  for (let k = hits; k < dist.length; k++) tail += dist[k];
  return Math.min(1, tail);
}

// Summary of a list of guesses [{p, hit}].
export function score(history) {
  const ps = history.map((g) => g.p);
  const hits = history.filter((g) => g.hit).length;
  const expected = ps.reduce((a, b) => a + b, 0);
  return {
    n: history.length,
    hits,
    expected,
    p: history.length ? chanceOfAtLeast(hits, ps) : 1,
  };
}

export function verdict(s) {
  if (s.n < 30) return { level: "early", text: "Too early to tell. Scores start to mean something after about 100 guesses." };
  if (s.p < 0.01) return { level: "strong", text: "Better than luck so far. Before trusting it, reset and see if a fresh run of 100 guesses does it again." };
  if (s.p < 0.05) return { level: "weak", text: "A little better than luck, but about 1 player in 20 gets this far by pure guessing." };
  return { level: "none", text: "Within what pure guessing produces." };
}
