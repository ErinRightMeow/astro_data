// Planet positions in the browser, matching pipeline/astro.py, plus a zodiac wheel.
import { svg, text, showTip, hideTip } from "./viz.js";

export const PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
export const GLYPHS = { Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇" };
export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
// U+FE0E asks for the plain text glyph rather than a color emoji.
export const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => `${g}\uFE0E`);
export const ASPECTS = [["conjunction", 0, 8], ["sextile", 60, 4], ["square", 90, 7], ["trine", 120, 7], ["opposition", 180, 8]];

const Astronomy = window.Astronomy;
const RAD = Math.PI / 180;

// Geocentric true ecliptic longitude of date for each planet, degrees.
export function longitudes(date) {
  const t = Astronomy.MakeTime(date);
  const out = {};
  for (const p of PLANETS) {
    if (p === "Sun") out[p] = Astronomy.SunPosition(t).elon;
    else if (p === "Moon") out[p] = Astronomy.EclipticGeoMoon(t).lon;
    else out[p] = Astronomy.Ecliptic(Astronomy.GeoVector(p, t, true)).elon;
  }
  return out;
}

// Noon UTC on a yyyy-mm-dd string.
export function noon(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

export function separation(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

export const chord = (a, b) => 2 * Math.sin((separation(a, b) / 2) * RAD);
export const vec = (lon) => [Math.cos(lon * RAD), Math.sin(lon * RAD)];

export function aspectStrength(sep, angle, orb) {
  return Math.max(0, 1 - Math.abs(sep - angle) / orb);
}

export function fmtLon(lon) {
  const l = ((lon % 360) + 360) % 360;
  return `${Math.floor(l % 30)}° ${SIGNS[Math.floor(l / 30)]}`;
}

// Zodiac wheel. points: [{lon, label, cls, tip}]; 0° Aries at the left, signs run counter-clockwise.
export function wheel(host, points, { chordBetween = null } = {}) {
  host.innerHTML = "";
  const S = 280, c = S / 2, R = 118, r0 = 96;
  const root = svg("svg", { viewBox: `0 0 ${S} ${S}`, role: "img", "aria-label": "Zodiac wheel" }, host);
  const at = (lon, r) => [c - r * Math.cos(lon * RAD), c + r * Math.sin(lon * RAD)];
  svg("circle", { cx: c, cy: c, r: R, class: "svg-ring" }, root);
  svg("circle", { cx: c, cy: c, r: r0, class: "svg-ring" }, root);
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = at(i * 30, r0), [x2, y2] = at(i * 30, R);
    svg("line", { x1, y1, x2, y2, class: "svg-axis" }, root);
    const [tx, ty] = at(i * 30 + 15, (R + r0) / 2);
    text(root, tx, ty + 4, SIGN_GLYPHS[i], { "text-anchor": "middle", "font-size": 13 });
  }
  if (chordBetween) {
    const [a, b] = chordBetween.map((l) => at(l, r0 - 14));
    svg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "stroke-a", "stroke-width": 2, "stroke-dasharray": "4 3" }, root);
  }
  // Stagger labels of nearby points onto inner rings.
  const sorted = [...points].sort((p, q) => p.lon - q.lon);
  let prev = -99, ring = 0;
  for (const p of sorted) {
    ring = separation(p.lon, prev) < 9 ? (ring + 1) % 3 : 0;
    prev = p.lon;
    const rr = r0 - 14 - ring * 20;
    const [x, y] = at(p.lon, rr);
    const [ex, ey] = at(p.lon, r0);
    svg("line", { x1: x, y1: y, x2: ex, y2: ey, class: "svg-grid" }, root);
    const g = svg("g", { tabindex: 0 }, root);
    svg("circle", { cx: x, cy: y, r: 10, class: `${p.cls} dot-ring` }, g);
    text(g, x, y + 4, p.label, { "text-anchor": "middle", fill: "var(--surface)", "font-size": 11, class: "" });
    if (p.tip) {
      g.addEventListener("pointermove", (e) => showTip(e, p.tip));
      g.addEventListener("pointerleave", hideTip);
    }
  }
  return root;
}
