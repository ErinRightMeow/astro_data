// Statistics for one hypothesis: "people in category C more often have
// chart feature F". The pipeline supplies observed and expected counts and
// the variance of observed minus expected under "no link".

// Two-sided p-value for a z score (Abramowitz-Stegun 7.1.26 erfc).
export function pTwoSided(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 +
    t * (-1.453152027 + t * 1.061405429))));
  return Math.min(1, poly * Math.exp(-x * x));
}

export const MIN_COUNT = 10; // results with fewer people are hidden
export const SMALL_SAMPLE = 100; // below this, warn

export function testCell(observed, expected, variance) {
  if (!(expected > 0) || !(variance > 0)) return null;
  const sd = Math.sqrt(variance);
  const z = (observed - expected) / sd;
  return {
    observed,
    expected,
    ratio: observed / expected,
    low: Math.max(0, (observed - 1.96 * sd) / expected),
    high: (observed + 1.96 * sd) / expected,
    z,
    p: pTwoSided(z),
    // Smallest true ratio change this sample detects 80% of the time.
    detectable: (2.8 * sd) / expected,
  };
}

// Benjamini-Hochberg adjusted p-values (q-values), in input order.
export function benjaminiHochberg(ps) {
  const n = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(n);
  let running = 1;
  for (let k = n - 1; k >= 0; k--) {
    const [p, i] = order[k];
    running = Math.min(running, (p * n) / (k + 1));
    q[i] = running;
  }
  return q;
}

export function verdict(result, q) {
  if (result.observed < MIN_COUNT) return "hidden";
  if (q < 0.05) return result.ratio > 1 ? "more" : "fewer";
  return "none";
}

export function percent(ratio) {
  const d = Math.round((ratio - 1) * 100);
  return d === 0 ? "the same as" : `${Math.abs(d)}% ${d > 0 ? "more" : "fewer"}`;
}
