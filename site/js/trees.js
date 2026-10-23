import { PLANETS, longitudes, separation, fmtLon } from "./sky.js";
import { lineChart } from "./viz.js";

const $ = (id) => document.getElementById(id);
const N = 6000, BINS = 32, DEPTH = 3, ROUNDS = 80, ETA = 0.1, LAMBDA = 1, MIN_LEAF = 40;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simulated people: real skies on random dates. Computed once.
const ELEMENTS = ["fire", "earth", "air", "water"];
const PAIRS = [];
for (let i = 0; i < PLANETS.length; i++) for (let j = i + 1; j < PLANETS.length; j++) PAIRS.push([PLANETS[i], PLANETS[j]]);
const FEATURES = [
  ...PLANETS.map((p) => ({ name: `${p} longitude`, kind: "lon" })),
  ...PAIRS.map(([a, b]) => ({ name: `${a}–${b} separation`, kind: "sep" })),
  ...PLANETS.flatMap((p) => ELEMENTS.map((e, k) => ({ name: `${p} in ${e} sign`, kind: "element", planet: p, element: k }))),
  { name: "Birth month", kind: "month" },
  { name: "Birth year", kind: "year" },
];
const BASELINE = [FEATURES.length - 2, FEATURES.length - 1];
const ALL = FEATURES.map((_, i) => i);

let people = null;
function simulate() {
  const r = rng(7);
  const start = Date.UTC(1900, 0, 1), span = Date.UTC(2000, 0, 1) - start;
  const cols = FEATURES.map(() => new Float64Array(N));
  for (let n = 0; n < N; n++) {
    const d = new Date(start + Math.floor(r() * span / 86400000) * 86400000 + 43200000);
    const lon = longitudes(d);
    PLANETS.forEach((p, i) => (cols[i][n] = lon[p]));
    PAIRS.forEach(([a, b], k) => (cols[PLANETS.length + k][n] = separation(lon[a], lon[b])));
    FEATURES.forEach((f, i) => {
      if (f.kind === "element") cols[i][n] = Math.floor(lon[f.planet] / 30) % 4 === f.element ? 1 : 0;
    });
    cols[FEATURES.length - 2][n] = d.getUTCMonth() + 1;
    cols[FEATURES.length - 1][n] = d.getUTCFullYear();
  }
  return { cols, bins: cols.map(binColumn) };
}

// Quantile bins: codes per person plus each bin's upper edge.
function binColumn(col) {
  const sorted = Float64Array.from(col).sort();
  const edges = [];
  for (let b = 1; b < BINS; b++) {
    const e = sorted[Math.floor((b * sorted.length) / BINS)];
    if (!edges.length || e > edges[edges.length - 1]) edges.push(e);
  }
  edges.push(Infinity);
  const codes = new Uint8Array(col.length);
  for (let n = 0; n < col.length; n++) {
    let b = 0;
    while (col[n] >= edges[b]) b++;
    codes[n] = b;
  }
  return { codes, edges };
}

function labels(chartEffect, seasonEffect, seed) {
  const r = rng(seed);
  const { cols } = people;
  const marsFire = cols[FEATURES.findIndex((f) => f.name === "Mars in fire sign")];
  const moonWater = cols[FEATURES.findIndex((f) => f.name === "Moon in water sign")];
  const month = cols[FEATURES.length - 2];
  const y = new Uint8Array(N);
  for (let n = 0; n < N; n++) {
    const logit = -1.2 + (marsFire[n] && moonWater[n] ? chartEffect : 0) + (month[n] <= 3 ? seasonEffect : 0);
    y[n] = r() < 1 / (1 + Math.exp(-logit)) ? 1 : 0;
  }
  return y;
}

function auc(score, y, idx) {
  const order = [...idx].sort((a, b) => score[a] - score[b]);
  let pos = 0, neg = 0, rankSum = 0;
  order.forEach((n, i) => {
    if (y[n]) { pos++; rankSum += i + 1; } else neg++;
  });
  return pos && neg ? (rankSum - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
}

// Second-order gradient boosting with histogram splits, as in LightGBM/XGBoost.
function boost(feats, y, train, test) {
  const base = Math.log((train.reduce((s, n) => s + y[n], 0) + 1) / (train.length - train.reduce((s, n) => s + y[n], 0) + 1));
  const F = new Float64Array(N).fill(base);
  const g = new Float64Array(N), h = new Float64Array(N);
  const gain = new Float64Array(FEATURES.length);
  const curve = [], trees = [];

  function grow(idx, depth) {
    let G = 0, H = 0;
    for (const n of idx) { G += g[n]; H += h[n]; }
    const leaf = { leaf: -G / (H + LAMBDA), n: idx.length };
    if (depth === DEPTH || idx.length < 2 * MIN_LEAF) return leaf;
    const parent = (G * G) / (H + LAMBDA);
    let best = null;
    for (const f of feats) {
      const { codes } = people.bins[f];
      const hg = new Float64Array(BINS), hh = new Float64Array(BINS), hc = new Uint32Array(BINS);
      for (const n of idx) { const b = codes[n]; hg[b] += g[n]; hh[b] += h[n]; hc[b]++; }
      let GL = 0, HL = 0, CL = 0;
      for (let b = 0; b < BINS - 1; b++) {
        GL += hg[b]; HL += hh[b]; CL += hc[b];
        if (CL < MIN_LEAF || idx.length - CL < MIN_LEAF) continue;
        const GR = G - GL, HR = H - HL;
        const s = (GL * GL) / (HL + LAMBDA) + (GR * GR) / (HR + LAMBDA) - parent;
        if (!best || s > best.gain) best = { f, bin: b, gain: s };
      }
    }
    if (!best || best.gain <= 0) return leaf;
    gain[best.f] += best.gain;
    const codes = people.bins[best.f].codes;
    const left = idx.filter((n) => codes[n] <= best.bin), right = idx.filter((n) => codes[n] > best.bin);
    return { ...best, n: idx.length, left: grow(left, depth + 1), right: grow(right, depth + 1) };
  }

  function predict(node, n) {
    while (!("leaf" in node)) node = people.bins[node.f].codes[n] <= node.bin ? node.left : node.right;
    return node.leaf;
  }

  for (let m = 0; m < ROUNDS; m++) {
    for (const n of train) {
      const p = 1 / (1 + Math.exp(-F[n]));
      g[n] = p - y[n];
      h[n] = p * (1 - p);
    }
    const tree = grow(train, 0);
    trees.push(tree);
    for (let n = 0; n < N; n++) F[n] += ETA * predict(tree, n);
    curve.push([m + 1, auc(F, y, test)]);
  }
  return { curve, trees, gain };
}

function describe(node) {
  const f = FEATURES[node.f];
  const edge = people.bins[node.f].edges[node.bin];
  if (f.kind === "lon") return `${f.name} under ${fmtLon(edge)} (${edge.toFixed(0)}°)?`;
  if (f.kind === "sep") return `${f.name} under ${edge.toFixed(0)}°?`;
  if (f.kind === "element") return `${f.name}?`;
  if (f.kind === "month") return `Birth month before ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Dec"][Math.ceil(edge)] ?? "Dec"}?`;
  return `Born before ${Math.ceil(edge)}?`;
}

function treeHtml(node, prefix = "") {
  if ("leaf" in node) {
    const w = node.leaf * ETA;
    return `<div class="node leaf">${prefix}leaf: score ${w >= 0 ? "+" : "−"}${Math.abs(w).toFixed(3)} · ${node.n.toLocaleString("en-US")} people</div>`;
  }
  // Yes/no flags split at 1, so "yes" is the right-hand branch.
  const [yes, no] = FEATURES[node.f].kind === "element" ? [node.right, node.left] : [node.left, node.right];
  return `<div class="node">${prefix}<strong>${describe(node)}</strong> · ${node.n.toLocaleString("en-US")} people</div>
    <div class="kids">${treeHtml(yes, "Yes → ")}${treeHtml(no, "No → ")}</div>`;
}

function run() {
  const btn = $("t-run");
  btn.disabled = true;
  btn.textContent = "Training…";
  setTimeout(() => {
    if (!people) people = simulate();
    const chartEffect = +$("t-chart").value, seasonEffect = +$("t-season").value;
    const y = labels(chartEffect, seasonEffect, 11);
    const r = rng(3);
    const order = [...Array(N).keys()].sort(() => r() - 0.5);
    const train = order.slice(0, Math.round(N * 0.7)), test = order.slice(Math.round(N * 0.7));
    const shuffled = Uint8Array.from(y);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }

    const full = boost(ALL, y, train, test);
    const baseline = boost(BASELINE, y, train, test);
    const shuf = boost(ALL, shuffled, train, test);

    lineChart($("t-chart-auc"), {
      series: [
        { label: "Full chart model", cls: "stroke-a", points: full.curve },
        { label: "Birth-date baseline", cls: "stroke-b", points: baseline.curve },
        { label: "Shuffled labels", cls: "stroke-c", dash: true, points: shuf.curve },
      ],
      xLabel: "Trees added",
      yLabel: "Held-out AUC",
      xFmt: (v) => `${v} trees`,
      yFmt: (v) => v.toFixed(3),
      xTicks: [1, 20, 40, 60, 80],
      yMin: 0.4,
      yMax: Math.max(0.75, ...full.curve.map((p) => p[1] + 0.03)),
    });

    const best = (c) => c[c.length - 1][1];
    const fa = best(full.curve), ba = best(baseline.curve), sa = best(shuf.curve);
    const gap = fa - ba;
    let msg;
    if (gap > 0.03) {
      msg = `<strong>The chart adds information.</strong> The full model reaches AUC ${fa.toFixed(3)} against the baseline's ${ba.toFixed(3)}, a gap of ${gap.toFixed(3)}.`;
      msg += chartEffect ? " That's the effect you planted." : " But you planted no chart effect, so this is a false positive. That's why the shuffle test and replication matter.";
    } else {
      msg = ba > 0.55
        ? `<strong>No astrology signal.</strong> The full model reaches ${fa.toFixed(3)}, but the birth-date baseline gets ${ba.toFixed(3)} without looking at the sky.`
        : `<strong>Nothing found.</strong> Every model is near 0.5, the same as guessing.`;
      if (chartEffect) msg += " You did plant a chart effect, though. With this many people it's too small to show, which is why small datasets can't settle the question either way.";
      else if (ba > 0.55) msg += " Birth season explains it all.";
    }
    $("t-verdict").innerHTML = `${msg} The shuffled-label model scored ${sa.toFixed(3)} by luck alone. Scores are after all ${ROUNDS} trees.`;

    $("first-tree").innerHTML = treeHtml(full.trees[0]);

    const top = [...full.gain].map((v, i) => [FEATURES[i].name, v]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const total = full.gain.reduce((s, v) => s + v, 0);
    $("t-importance").innerHTML = top.map(([name, v]) =>
      `<div class="row-bar"><span>${name}</span><span class="track"><span class="fillbar" style="display:block;width:${(v / top[0][1]) * 100}%"></span></span><span class="num">${Math.round((v / total) * 100)}%</span></div>`).join("");

    btn.disabled = false;
    btn.textContent = "Train";
  }, 30);
}

$("t-run").addEventListener("click", run);
run();
