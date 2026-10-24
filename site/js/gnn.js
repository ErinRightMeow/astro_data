import { PLANETS, GLYPHS, SIGN_GLYPHS, ASPECTS, longitudes, noon, separation, aspectStrength, fmtLon } from "./sky.js";
import { svg, text, showTip, hideTip } from "./viz.js";

const $ = (id) => document.getElementById(id);
const RAD = Math.PI / 180;
const CLS = { conjunction: "c", sextile: "a", trine: "a", square: "b", opposition: "b" };

let lons = null, edges = [];

function compute() {
  lons = longitudes(noon($("g-date").value || "1990-06-15"));
  edges = [];
  for (let i = 0; i < PLANETS.length; i++) {
    for (let j = i + 1; j < PLANETS.length; j++) {
      const a = PLANETS[i], b = PLANETS[j];
      const sep = separation(lons[a], lons[b]);
      for (const [name, angle, orb] of ASPECTS) {
        const s = aspectStrength(sep, angle, orb);
        if (s > 0) edges.push({ a, b, name, s, sep });
      }
    }
  }
}

// reach: planet -> hops from the focus, or null to show everything plainly.
// An edge carries a message within k rounds when one end was reached before round k.
function drawGraph(host, reach = null, k = 0) {
  host.innerHTML = "";
  const S = 280, c = S / 2, R = 118, r0 = 100, rn = 84;
  const root = svg("svg", { viewBox: `0 0 ${S} ${S}`, role: "img", "aria-label": "Chart drawn as a graph of planets and aspects" }, host);
  const at = (lon, r) => [c - r * Math.cos(lon * RAD), c + r * Math.sin(lon * RAD)];
  svg("circle", { cx: c, cy: c, r: R, class: "svg-ring" }, root);
  svg("circle", { cx: c, cy: c, r: r0, class: "svg-ring" }, root);
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = at(i * 30, r0), [x2, y2] = at(i * 30, R);
    svg("line", { x1, y1, x2, y2, class: "svg-axis" }, root);
    const [tx, ty] = at(i * 30 + 15, (R + r0) / 2);
    text(root, tx, ty + 4, SIGN_GLYPHS[i], { "text-anchor": "middle", "font-size": 11 });
  }
  // Nudge planets that sit on top of each other apart along the circle.
  const pos = {};
  const sorted = [...PLANETS].sort((p, q) => lons[p] - lons[q]);
  let prevShown = -99;
  for (const p of sorted) {
    let shown = lons[p];
    if (shown - prevShown < 11) shown = prevShown + 11;
    prevShown = shown;
    pos[p] = at(shown, rn);
  }
  const live = (e) => !reach || (reach[e.a] != null && reach[e.b] != null && Math.min(reach[e.a], reach[e.b]) < k);
  for (const e of edges) {
    const [x1, y1] = pos[e.a], [x2, y2] = pos[e.b];
    const on = live(e);
    const line = svg("line", { x1, y1, x2, y2, class: `stroke-${CLS[e.name]}`, "stroke-width": 1 + 3 * e.s, "stroke-linecap": "round", opacity: on ? 0.9 : 0.12 }, root);
    if (e.name === "conjunction") line.setAttribute("stroke-dasharray", "2 3");
    const hit = svg("line", { x1, y1, x2, y2, stroke: "transparent", "stroke-width": 12 }, root);
    hit.addEventListener("pointermove", (ev) => showTip(ev, `<strong>${e.a} ${e.name} ${e.b}</strong><br>${e.sep.toFixed(1)}° apart · strength ${e.s.toFixed(2)}`));
    hit.addEventListener("pointerleave", hideTip);
  }
  for (const p of PLANETS) {
    const [x, y] = pos[p];
    const hop = reach ? reach[p] : 0;
    const g = svg("g", { tabindex: 0, style: "cursor:pointer" }, root);
    svg("circle", { cx: x, cy: y, r: hop === 0 && reach ? 13 : 11, class: `${hop == null ? "fill-c" : "fill-a"} dot-ring`, opacity: hop == null ? 0.35 : 1 }, g);
    text(g, x, y + 4, GLYPHS[p], { "text-anchor": "middle", fill: "var(--surface)", "font-size": 12, class: "" });
    g.addEventListener("pointermove", (ev) => showTip(ev, `<strong>${p}</strong> · ${fmtLon(lons[p])}${reach && hop != null ? `<br>reached in round ${hop}` : ""}`));
    g.addEventListener("pointerleave", hideTip);
    g.addEventListener("click", () => {
      $("g-focus").value = p;
      drawReach();
    });
  }
}

function neighbours(p) {
  return [...new Set(edges.flatMap((e) => (e.a === p ? [e.b] : e.b === p ? [e.a] : [])))];
}

function drawReach() {
  const k = +$("g-k").value, focus = $("g-focus").value;
  $("g-k-v").textContent = k;
  const reach = Object.fromEntries(PLANETS.map((p) => [p, null]));
  reach[focus] = 0;
  let frontier = [focus];
  for (let hop = 1; hop <= k; hop++) {
    const next = [];
    for (const p of frontier) for (const q of neighbours(p)) if (reach[q] == null) { reach[q] = hop; next.push(q); }
    frontier = next;
  }
  drawGraph($("g-reach"), reach, k);
  const reached = PLANETS.filter((p) => reach[p] != null);
  const rows = [
    ["Rounds", k],
    [`Planets feeding ${focus} (with itself)`, `${reached.length} of ${PLANETS.length}`],
    ...[1, 2, 3].filter((h) => h <= k).map((h) => [`Added in round ${h}`, PLANETS.filter((p) => reach[p] === h).join(", ") || "none"]),
  ];
  $("g-reach-text").innerHTML = rows.map(([a, b]) => `<div class="stat"><span class="label">${a}</span><span class="value">${b}</span></div>`).join("") +
    `<p class="muted small">${k === 0 ? "Before any rounds, each planet only knows its own position." : reached.length === PLANETS.length ? "Every planet's information now reaches " + focus + ". More rounds add nothing new and make training harder, which is why 2 or 3 rounds is typical." : "Faded planets don't affect " + focus + "'s description yet."}</p>`;
}

function drawAll() {
  compute();
  drawGraph($("g-graph"));
  const counts = {};
  for (const e of edges) counts[e.name] = (counts[e.name] || 0) + 1;
  $("g-count").textContent = `${edges.length} aspects: ` + ASPECTS.map(([n]) => `${counts[n] || 0} ${n}`).join(", ") + ".";
  drawReach();
}

$("g-focus").innerHTML = PLANETS.map((p) => `<option value="${p}">${GLYPHS[p]} ${p}</option>`).join("");
$("g-focus").value = "Mars";
$("g-date").addEventListener("input", drawAll);
$("g-k").addEventListener("input", drawReach);
$("g-focus").addEventListener("change", drawReach);
drawAll();
