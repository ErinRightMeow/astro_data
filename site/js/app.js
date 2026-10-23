import { benjaminiHochberg, MIN_COUNT, percent, SMALL_SAMPLE, testCell, verdict } from "./stats.js";

const PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const $ = (id) => document.getElementById(id);

let datasets = [];
let data = null;
let datasetFile = null;
let meanings = null;
const sessionTests = new Map(); // "file|category|feature" -> p

const fmtP = (p) => (p < 0.001 ? "< 0.001" : p.toFixed(3));
const pIs = (p) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
const fmtN = (n) => Math.round(n).toLocaleString("en-US");
const fmtR = (r) => r.toFixed(2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

function cell(split, c, f) {
  const s = data.splits[split];
  return testCell(s.observed[c][f], s.expected[c][f], s.variance[c][f]);
}

function groupIndex() {
  return Object.fromEntries(data.groups.map((g, i) => [g.id, i]));
}

// Groups with any data in this dataset (date-only data has no houses).
function availableGroups() {
  const known = data.splits.explore.known;
  return new Set(data.groups.filter((g, gi) => known.some((row) => row[gi] > 0)).map((g) => g.id));
}

function fillSelect(el, options) {
  el.innerHTML = options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
}

function renderDatasetInfo() {
  const m = data.meta;
  $("demo-banner").hidden = !m.demo;
  $("dataset-info").textContent =
    `${m.description} ${fmtN(data.people)} people, ${data.categories.length} groups. Built ${m.built}.`;
  $("source-line").textContent = m.source ? `Data: ${m.source}.` : "";
}

function renderSelectors() {
  const cats = data.categories.map((c, i) => ({ value: i, label: c.label }));
  fillSelect($("category"), cats);
  fillSelect($("scan-category"), cats);

  const avail = availableGroups();
  const byGroup = new Map();
  data.features.forEach((f, i) => {
    if (!avail.has(f.group)) return;
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group).push(`<option value="${esc(f.id)}">${esc(f.label)}</option>`);
  });
  $("feature").innerHTML = data.groups
    .filter((g) => byGroup.has(g.id))
    .map((g) => `<optgroup label="${esc(g.label)}">${byGroup.get(g.id).join("")}</optgroup>`)
    .join("");

  const kinds = new Set(data.groups.filter((g) => avail.has(g.id)).map((g) => g.kind));
  for (const opt of $("scan-kind").options) opt.disabled = !kinds.has(opt.value);
  fillSelect($("scan-planet"), [{ value: "", label: "all planets" }, ...PLANETS.map((p) => ({ value: p, label: p }))]);
  renderClaims();
}

function renderMeaning() {
  const f = data.features.find((x) => x.id === $("feature").value);
  if (!f || !meanings) return;
  const parts = f.id.split(":");
  const bits = [];
  if (parts[0] === "sign" || parts[0] === "house") bits.push(`${parts[1]}: ${meanings.planets[parts[1]]}`);
  if (parts[0] === "sign" || parts[0] === "asc") {
    const sign = parts.at(-1);
    bits.push(`${sign}: ${meanings.signs[sign]}`);
  }
  if (parts[0] === "aspect") {
    const [a, b] = parts[1].split("-");
    bits.push(`${a}: ${meanings.planets[a]}`, `${b}: ${meanings.planets[b]}`, `${parts[2]}: ${meanings.aspects[parts[2]]}`);
  }
  $("meaning").textContent = `Traditional meaning. ${bits.join(". ")}.`;
}

function rangeBar(r) {
  const lo = Math.min(0.5, r.low), hi = Math.max(1.5, r.high);
  const pos = (x) => `${((x - lo) / (hi - lo)) * 100}%`;
  return `
    <div class="range" role="img" aria-label="Ratio ${fmtR(r.ratio)}, plausible range ${fmtR(r.low)} to ${fmtR(r.high)}">
      <div class="axis"></div>
      <div class="one" style="left:${pos(1)}"></div>
      <div class="ci" style="left:${pos(r.low)};width:calc(${pos(r.high)} - ${pos(r.low)})"></div>
      <div class="dot" style="left:${pos(r.ratio)}"></div>
    </div>
    <div class="range-labels"><span>${fmtR(lo)}×</span><span>1.00× = chance</span><span>${fmtR(hi)}×</span></div>`;
}

function runTest() {
  const c = Number($("category").value);
  const fId = $("feature").value;
  const f = data.features.findIndex((x) => x.id === fId);
  const feature = data.features[f];
  const cat = data.categories[c].label;
  const r = cell("explore", c, f);
  const out = $("result");
  location.hash = new URLSearchParams({ d: datasetFile, c, f: fId }).toString();

  if (!r) {
    out.innerHTML = `<div class="result"><p class="verdict">No data for this combination.</p></div>`;
    return;
  }
  if (r.observed < MIN_COUNT) {
    out.innerHTML = `<div class="result"><p class="verdict">Too few people to show.</p>
      <p class="muted">Fewer than ${MIN_COUNT} ${esc(cat)} have ${esc(feature.label)}, so this result is hidden.</p></div>`;
    return;
  }

  const key = `${datasetFile}|${c}|${fId}`;
  sessionTests.set(key, r.p);
  const keys = [...sessionTests.keys()];
  const qs = benjaminiHochberg([...sessionTests.values()]);
  const q = qs[keys.indexOf(key)];
  const v = verdict(r, q);
  const g = groupIndex()[feature.group];
  const known = data.splits.explore.known[c][g];

  const headline = v === "none"
    ? `No reliable difference.`
    : `Yes, in this data: ${esc(cat)} have ${esc(feature.label)} ${percent(r.ratio)} often than expected.`;
  const detail = v === "none"
    ? `${esc(cat)} have ${esc(feature.label)} ${percent(r.ratio)} ${r.ratio === 1 ? "" : "often "}than expected, which is within what chance produces.
       With this many people, a difference of about ${Math.round(r.detectable * 100)}% or more would usually have been detected.`
    : `That holds after correcting for the ${sessionTests.size} test${sessionTests.size === 1 ? "" : "s"} you've run this session.
       Check it on the held-back data below before trusting it, and remember who is in this dataset.`;

  out.innerHTML = `
    <div class="result">
      <p class="verdict ${v === "none" ? "" : "yes"}">${headline}</p>
      <p>${detail}</p>
      ${known < SMALL_SAMPLE ? `<p class="banner small">Small sample: only ${fmtN(known)} ${esc(cat)} have this factor known. Treat the result with caution.</p>` : ""}
      <div class="stats">
        <div class="stat"><div class="label">${esc(cat)} with ${esc(feature.label)}</div><div class="value">${fmtN(r.observed)}</div></div>
        <div class="stat"><div class="label">Expected by chance</div><div class="value">${fmtN(r.expected)}</div></div>
        <div class="stat"><div class="label">Ratio (95% range)</div><div class="value">${fmtR(r.ratio)}× <span class="muted small">${fmtR(r.low)}–${fmtR(r.high)}</span></div></div>
        <div class="stat"><div class="label">p / corrected for ${sessionTests.size} test${sessionTests.size === 1 ? "" : "s"}</div><div class="value">${fmtP(r.p)} <span class="muted small">/ ${fmtP(q)}</span></div></div>
      </div>
      ${rangeBar(r)}
      <p class="muted small">Out of ${fmtN(known)} ${esc(cat)} whose ${esc(data.groups[g].label.replace(/ (sign|aspect|house)$/, (m) => m.toLowerCase()))} is known.
        Among everyone in the dataset, ${(data.splits.explore.baseShare[f] * 100).toFixed(1)}% have ${esc(feature.label)}.</p>
      <div class="actions">
        <button id="confirm-btn">Check on held-back data</button>
        <button id="share-btn">Copy link</button>
      </div>
      <div id="confirm-out"></div>
    </div>`;
  $("confirm-btn").onclick = () => runConfirm(c, f, r, v !== "none");
  $("share-btn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $("share-btn").textContent = "Link copied";
    } catch {
      $("share-btn").textContent = "Copy the address bar";
    }
  };
}

function runConfirm(c, f, explored, wasFinding) {
  const r = cell("confirm", c, f);
  const out = $("confirm-out");
  if (!r || r.observed < MIN_COUNT) {
    out.innerHTML = `<div class="confirm">Too few people in the held-back data to check this.</div>`;
    return;
  }
  const sameWay = (r.ratio > 1) === (explored.ratio > 1);
  const ok = sameWay && r.p < 0.05;
  if (!wasFinding) {
    out.innerHTML = `<div class="confirm">
      <strong>${r.p < 0.05 ? "The held-back data shows a difference." : "The held-back data agrees: no reliable difference."}</strong>
      In the held-back 30%, the ratio is ${fmtR(r.ratio)}× (${fmtR(r.low)}–${fmtR(r.high)}), ${pIs(r.p)}.
      ${r.p < 0.05 ? "Since the explored data showed nothing, this is most likely chance." : ""}
    </div>`;
    return;
  }
  out.innerHTML = `<div class="confirm">
    <strong>${ok ? "Confirmed on fresh data." : "Not confirmed on fresh data."}</strong>
    In the held-back 30%, the ratio is ${fmtR(r.ratio)}× (${fmtR(r.low)}–${fmtR(r.high)}), ${pIs(r.p)}.
    ${ok ? "Same direction and unlikely to be chance." : sameWay ? "Same direction, but it could be chance." : "It points the other way, so the first result was probably luck."}
  </div>`;
}

function runScan(kind = $("scan-kind").value, planet = $("scan-planet").value) {
  const c = Number($("scan-category").value);
  const cat = data.categories[c].label;
  const avail = availableGroups();
  const rows = [];
  data.features.forEach((f, i) => {
    const g = data.groups[groupIndex()[f.group]];
    if (g.kind !== kind || !avail.has(f.group)) return;
    if (planet && !f.group.split(/[:-]/).includes(planet)) return;
    const r = cell("explore", c, i);
    if (r && r.observed >= MIN_COUNT) rows.push({ f, r });
  });
  const out = $("scan-result");
  if (!rows.length) {
    out.innerHTML = `<p class="muted">Nothing to scan for this choice.</p>`;
    return;
  }
  const qs = benjaminiHochberg(rows.map((x) => x.r.p));
  rows.forEach((x, i) => (x.q = qs[i]));
  rows.sort((a, b) => a.r.p - b.r.p);
  const hits = rows.filter((x) => x.q < 0.05).length;
  const raw = rows.filter((x) => x.r.p < 0.05).length;
  out.innerHTML = `
    <p><strong>${hits} of ${rows.length}</strong> factors hold up after correction for ${esc(cat)}.
      ${raw} reached p &lt; 0.05 before correction; chance alone would give about ${Math.round(rows.length * 0.05)}.</p>
    <div class="table-scroll"><table>
      <thead><tr><th>Factor</th><th class="num">${esc(cat)}</th><th class="num">Expected</th><th class="num">Ratio (95% range)</th><th class="num">Corrected p</th><th></th></tr></thead>
      <tbody>${rows.slice(0, 20).map(({ f, r, q }) => `
        <tr class="${q < 0.05 ? "sig" : ""}">
          <td>${esc(f.label)}</td>
          <td class="num">${fmtN(r.observed)}</td>
          <td class="num">${fmtN(r.expected)}</td>
          <td class="num">${fmtR(r.ratio)}× <span class="muted small">${fmtR(r.low)}–${fmtR(r.high)}</span></td>
          <td class="num">${fmtP(q)}</td>
          <td>${q < 0.05 ? '<span class="tag">holds up</span>' : ""}</td>
        </tr>`).join("")}</tbody>
    </table></div>
    ${rows.length > 20 ? `<p class="muted small">Showing the 20 strongest of ${rows.length}.</p>` : ""}`;
}

function renderClaims() {
  if (!meanings) return;
  const labels = data.categories.map((c) => c.label);
  const avail = availableGroups();
  const kind = [...avail].some((g) => g.startsWith("house:")) ? "house" : "sign";
  const chips = [];
  for (const claim of meanings.claims) {
    for (const cat of claim.categories) {
      const c = labels.indexOf(cat);
      if (c >= 0) chips.push(`<button data-c="${c}" data-planet="${claim.planet}" data-kind="${kind}" title="Claim from ${esc(claim.source)}">${claim.planet} and ${esc(cat)}</button>`);
    }
  }
  $("claims").innerHTML = chips.length ? `<span class="muted small">Claims to test:</span> ${chips.join("")}` : "";
  for (const b of $("claims").querySelectorAll("button")) {
    b.onclick = () => {
      $("scan-category").value = b.dataset.c;
      $("scan-kind").value = b.dataset.kind;
      $("scan-planet").value = b.dataset.planet;
      runScan(b.dataset.kind, b.dataset.planet);
    };
  }
}

async function loadDataset(file) {
  datasetFile = file;
  data = await getJSON(`data/${file}`);
  $("dataset").value = file;
  renderDatasetInfo();
  renderSelectors();
  renderMeaning();
  $("result").innerHTML = "";
  $("scan-result").innerHTML = "";
}

async function init() {
  const list = await getJSON("data/datasets.json");
  meanings = await getJSON("data/meanings.json").catch(() => null);
  datasets = list;
  fillSelect($("dataset"), datasets.map((d) => ({ value: d.file, label: d.name })));

  const params = new URLSearchParams(location.hash.slice(1));
  const start = datasets.find((d) => d.file === params.get("d")) ? params.get("d") : datasets[0].file;
  await loadDataset(start);
  if (params.get("f") && params.get("c")) {
    $("category").value = params.get("c");
    $("feature").value = params.get("f");
    renderMeaning();
    runTest();
  }

  $("dataset").onchange = (e) => loadDataset(e.target.value);
  $("feature").onchange = renderMeaning;
  $("run").onclick = runTest;
  $("scan-run").onclick = () => runScan();
}

init().catch((err) => {
  document.querySelector("main").insertAdjacentHTML("afterbegin", `<p class="banner">${esc(err.message)}</p>`);
});
