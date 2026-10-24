// Rising, Moon and Sun signs in the browser, matching pipeline/astro.py.
// Needs js/vendor/astronomy.browser.min.js loaded first (window.Astronomy).
import { SIGNS } from "./quiz-stats.js";

const RAD = Math.PI / 180;
const A = () => window.Astronomy;
const signOf = (lon) => SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];

// Ecliptic longitude of the Ascendant, degrees, for a UTC Date.
export function ascendant(date, lat, lon) {
  const t = A().MakeTime(date);
  const ramc = ((A().SiderealTime(t) * 15 + lon) % 360) * RAD;
  const centuries = (date - Date.UTC(2000, 0, 1)) / 86400000 / 36525;
  const eps = (23.4392911 - 0.0130042 * centuries) * RAD;
  return ascFromRamc(ramc, eps, lat * RAD);
}

function ascFromRamc(ramc, eps, phi) {
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)));
  return ((asc / RAD) % 360 + 360) % 360;
}

export function chartAt(date, lat, lon) {
  const t = A().MakeTime(date);
  return {
    asc: signOf(ascendant(date, lat, lon)),
    moon: signOf(A().EclipticGeoMoon(t).lon),
    sun: signOf(A().SunPosition(t).elon),
  };
}

// Minutes east of UTC that a time zone used at a given instant.
function zoneOffset(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(ms));
  const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
  return (Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - Math.floor(ms / 1000) * 1000) / 60000;
}

// Local wall-clock birth time ("1990-05-17", "14:30") to a UTC Date.
// `zone` is an IANA time zone name (historical rules included) or a fixed
// offset in hours east of UTC.
export function localToUtc(day, time, zone) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  if (typeof zone === "number") return new Date(wall - zone * 3600000);
  let utc = wall - zoneOffset(wall, zone) * 60000;
  utc = wall - zoneOffset(utc, zone) * 60000; // settle on the offset in force at that moment
  return new Date(utc);
}

// Share of the day each sign rises at a latitude: the chance of a rising
// sign for someone born at a random time there. The sky turns evenly, so
// this steps the sidereal angle evenly around the circle.
const riseCache = new Map();
export function risingRates(lat) {
  const key = Math.round(lat);
  if (riseCache.has(key)) return riseCache.get(key);
  const counts = Object.fromEntries(SIGNS.map((s) => [s, 0]));
  const steps = 3600, eps = 23.4393 * RAD;
  for (let i = 0; i < steps; i++) {
    counts[signOf(ascFromRamc(((i + 0.5) / steps) * 360 * RAD, eps, key * RAD))] += 1;
  }
  for (const s of SIGNS) counts[s] /= steps;
  riseCache.set(key, counts);
  return counts;
}
