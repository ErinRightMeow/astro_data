import { PLANETS, GLYPHS, ASPECTS, longitudes, noon, separation, chord, vec, aspectStrength, fmtLon, wheel } from "./sky.js";
import { svg, text, showTip, hideTip, scale, lineChart } from "./viz.js";

const $ = (id) => document.getElementById(id);
const f2 = (v) => v.toFixed(2);
const FAST = ["Sun", "Mercury", "Venus", "Mars"];
const SLOW = ["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

// Step 1: one angle three ways.
function drawCircle() {
  const a = +$("c-a").value, b = +$("c-b").value;
  wheel($("c-wheel"), [
    { lon: a, label: "A", cls: "fill-a", tip: `A: ${fmtLon(a)}` },
    { lon: b, label: "B", cls: "fill-b", tip: `B: ${fmtLon(b)}` },
  ], { chordBetween: [a, b] });
  const [ca, sa] = vec(a), [cb, sb] = vec(b);
  const sameSign = Math.floor(a / 30) === Math.floor(b / 30);
  const rows = [
    ["A", `${fmtLon(a)} → (${f2(ca)}, ${f2(sa)})`],
    ["B", `${fmtLon(b)} → (${f2(cb)}, ${f2(sb)})`],
    ["Sign only (one-hot)", sameSign ? "same sign: distance 0" : "different signs: distance 1.41"],
    ["Raw degrees", `|${a} − ${b}| = ${Math.abs(a - b)}°`],
    ["On the circle", `chord ${f2(chord(a, b))} (true gap ${separation(a, b)}°)`],
  ];
  $("c-readout").innerHTML = rows.map(([k, v]) => `<div class="stat"><span class="label">${k}</span><span class="value">${v}</span></div>`).join("");
}
for (const id of ["c-a", "c-b"]) $(id).addEventListener("input", drawCircle);
for (const btn of document.querySelectorAll("[data-a]")) {
  btn.addEventListener("click", () => {
    $("c-a").value = btn.dataset.a;
    $("c-b").value = btn.dataset.b;
    drawCircle();
  });
}

// Step 2: the chart's 20 numbers.
function drawChart() {
  const iso = $("v-date").value;
  if (!iso) return;
  const lons = longitudes(noon(iso));
  wheel($("v-wheel"), PLANETS.map((p) => ({ lon: lons[p], label: GLYPHS[p], cls: "fill-a", tip: `${p}: ${fmtLon(lons[p])}` })));
  const cellHtml = (p, i) => {
    const v = vec(lons[p])[i];
    const color = v >= 0 ? "--series-a" : "--series-b";
    const pct = Math.round(Math.abs(v) * 70);
    return `<div class="cell" style="background: color-mix(in srgb, var(${color}) ${pct}%, var(--bg))" data-tip="${p} ${i ? "sin" : "cos"} λ = ${f2(v)}<br>${fmtLon(lons[p])}">${f2(v)}</div>`;
  };
  $("v-strip").innerHTML =
    `<div class="strip">${PLANETS.map((p) => `<div class="cell" style="aspect-ratio:auto">${GLYPHS[p]}</div>`).join("")}</div>` +
    `<div class="strip">${PLANETS.map((p) => cellHtml(p, 0)).join("")}</div>` +
    `<div class="strip">${PLANETS.map((p) => cellHtml(p, 1)).join("")}</div>`;
  for (const el of $("v-strip").querySelectorAll("[data-tip]")) {
    el.addEventListener("pointermove", (e) => showTip(e, el.dataset.tip));
    el.addEventListener("pointerleave", hideTip);
  }
}
$("v-date").addEventListener("input", drawChart);

// Step 3: distance between two charts, planet by planet.
function drawDistance() {
  const ia = $("d-a").value, ib = $("d-b").value;
  if (!ia || !ib) return;
  const la = longitudes(noon(ia)), lb = longitudes(noon(ib));
  const d = PLANETS.map((p) => chord(la[p], lb[p]));
  const D = Math.sqrt(d.reduce((s, x) => s + x * x, 0));
  const Dmax = Math.sqrt(PLANETS.length * 4);
  $("d-total").textContent = `Distance ${f2(D)} · similarity ${Math.round((1 - D / Dmax) * 100)}%`;

  const host = $("d-bars");
  host.innerHTML = "";
  const W = Math.max(300, host.clientWidth || 640), rowH = 26, m = { l: 90, r: 50, t: 4, b: 26 };
  const H = m.t + m.b + rowH * PLANETS.length;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Distance per planet" }, host);
  const X = scale(0, 2, m.l, W - m.r);
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    svg("line", { x1: X(t), x2: X(t), y1: m.t, y2: H - m.b, class: "svg-grid" }, root);
    text(root, X(t), H - 8, t, { "text-anchor": "middle" });
  }
  PLANETS.forEach((p, i) => {
    const y = m.t + i * rowH;
    text(root, m.l - 8, y + rowH / 2 + 4, `${GLYPHS[p]} ${p}`, { "text-anchor": "end", class: "svg-label" });
    const w = Math.max(0, X(d[i]) - X(0));
    if (w > 0) svg("rect", { x: X(0), y: y + 5, width: w, height: rowH - 10, rx: Math.min(4, w / 2), class: "fill-a" }, root);
    text(root, X(0) + w + 6, y + rowH / 2 + 4, f2(d[i]));
    const hit = svg("rect", { x: 0, y, width: W, height: rowH, fill: "transparent" }, root);
    hit.addEventListener("pointermove", (e) => showTip(e, `<strong>${p}</strong><br>A: ${fmtLon(la[p])}<br>B: ${fmtLon(lb[p])}<br>gap ${separation(la[p], lb[p]).toFixed(1)}° → chord ${f2(d[i])}`));
    hit.addEventListener("pointerleave", hideTip);
  });
  drawConfound();
}
for (const id of ["d-a", "d-b"]) $(id).addEventListener("input", drawDistance);
for (const btn of document.querySelectorAll("[data-days]")) {
  btn.addEventListener("click", () => {
    const a = noon($("d-a").value || "1990-06-15");
    const b = new Date(a.getTime() + +btn.dataset.days * 86400000);
    $("d-b").value = b.toISOString().slice(0, 10);
    drawDistance();
  });
}

// Step 4: distance from chart A across +/- 30 years, fast vs slow planets.
let confoundFor = null;
function drawConfound() {
  const ia = $("d-a").value;
  if (!ia || ia === confoundFor) return;
  confoundFor = ia;
  const base = noon(ia);
  const la = longitudes(base);
  const rms = (lons, group) => Math.sqrt(group.reduce((s, p) => s + chord(la[p], lons[p]) ** 2, 0) / group.length);
  const fast = [], slow = [];
  for (let days = -15 * 365.25; days <= 15 * 365.25; days += 4) {
    const lons = longitudes(new Date(base.getTime() + days * 86400000));
    const yrs = days / 365.25;
    fast.push([yrs, rms(lons, FAST)]);
    slow.push([yrs, rms(lons, SLOW)]);
  }
  lineChart($("conf-chart"), {
    series: [
      { label: "Fast planets", cls: "stroke-a", points: fast },
      { label: "Slow planets", cls: "stroke-b", points: slow },
    ],
    xLabel: "Years from Chart A's birth date",
    yLabel: "Average chord distance",
    xFmt: (v) => (Math.abs(v) < 0.01 ? "same day" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(Math.abs(v) < 2 ? 1 : 0)} yr`),
    xTicks: [-12, -6, 0, 6, 12],
    yMax: 2,
  });
}

// Step 5: aspect strength curves.
function drawAspects() {
  const sep = +$("a-sep").value;
  $("a-sep-v").textContent = `${sep}°`;
  const pts = [];
  for (let s = 0; s <= 180; s += 0.5) pts.push([s, Math.max(...ASPECTS.map(([, ang, orb]) => aspectStrength(s, ang, orb)))]);
  const { root, X } = lineChart($("a-chart"), {
    series: [{ label: "Strongest aspect", cls: "stroke-a", points: pts }],
    xLabel: "Separation between two planets (degrees)",
    yLabel: "Aspect strength",
    xFmt: (v) => `${v}°`,
    xTicks: [0, 30, 60, 90, 120, 150, 180],
    yMax: 1.05,
    markers: [{ x: sep }],
  });
  // Name each peak; on narrow screens use the first letter.
  const W = root.viewBox.baseVal.width;
  for (const [name, ang] of ASPECTS) text(root, Math.min(Math.max(X(ang), 70), W - 40), 26, W < 500 ? name.slice(0, 4) + "." : name, { "text-anchor": "middle" });
  const hits = ASPECTS.map(([name, ang, orb]) => [name, aspectStrength(sep, ang, orb)]).filter(([, s]) => s > 0);
  $("a-readout").innerHTML = hits.length
    ? `At ${sep}°: on/off says <strong>${hits[0][0]}</strong>. Strength says <strong>${hits[0][0]} ${f2(hits[0][1])}</strong>, so a model can tell a tight ${hits[0][0]} from a loose one.`
    : `At ${sep}°: no major aspect. Every aspect strength for this pair is 0.`;
}
$("a-sep").addEventListener("input", drawAspects);

drawCircle();
drawChart();
drawDistance();
drawAspects();
