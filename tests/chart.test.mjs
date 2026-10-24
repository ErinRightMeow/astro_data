import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

globalThis.window = { Astronomy: createRequire(import.meta.url)("../site/js/vendor/astronomy.browser.min.js") };
const { ascendant, chartAt, localToUtc, risingRates } = await import("../site/js/chart.js");

// Values from pipeline/astro.py, so the browser and the pipeline agree.
const CASES = [
  [Date.UTC(1924, 3, 24, 19, 0), 48.86, 2.34, 216.14, { asc: "Scorpio", moon: "Capricorn", sun: "Taurus" }],
  [Date.UTC(1947, 7, 22, 9, 30), 34.18, -118.45, 99.853, { asc: "Cancer", moon: "Scorpio", sun: "Leo" }],
  [Date.UTC(1990, 4, 17, 4, 10), -33.87, 151.2, 177.396, { asc: "Virgo", moon: "Aquarius", sun: "Taurus" }],
];

test("charts match the Python pipeline", () => {
  for (const [ms, lat, lon, asc, signs] of CASES) {
    const d = new Date(ms);
    assert.ok(Math.abs(ascendant(d, lat, lon) - asc) < 0.05, `${asc} vs ${ascendant(d, lat, lon)}`);
    assert.deepEqual(chartAt(d, lat, lon), signs);
  }
});

test("local birth times convert to UTC with historical time zone rules", () => {
  // New York was on daylight time (UTC-4) in July 1980 and standard (UTC-5) in January.
  assert.equal(localToUtc("1980-07-04", "12:00", "America/New_York").toISOString(), "1980-07-04T16:00:00.000Z");
  assert.equal(localToUtc("1980-01-04", "12:00", "America/New_York").toISOString(), "1980-01-04T17:00:00.000Z");
  // A fixed offset in hours.
  assert.equal(localToUtc("1990-05-17", "14:10", 10).toISOString(), "1990-05-17T04:10:00.000Z");
});

test("rising signs are uneven away from the equator", () => {
  const paris = risingRates(49);
  const total = Object.values(paris).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(paris.Virgo > 0.11 && paris.Pisces < 0.05 && Math.abs(paris.Virgo - paris.Libra) < 1e-9, JSON.stringify(paris));
  const equator = risingRates(0);
  for (const r of Object.values(equator)) assert.ok(r > 0.06 && r < 0.11);
});
