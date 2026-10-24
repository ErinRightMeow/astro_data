import { chartAt, localToUtc, risingRates } from "./chart.js";
import { baseRates, elementOf, ELEMENTS, score, SIGNS, verdict } from "./quiz-stats.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SEX = { M: "Man", F: "Woman" };
const fmtP = (p) => (p < 0.001 ? "under 0.1%" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);
const country = (() => {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return (cy) => (cy ? names.of(cy) || cy : "Unknown country");
  } catch {
    return (cy) => cy || "Unknown country";
  }
})();

// mode -> which answer it asks for
const MODES = {
  "asc-element": { label: "rising element", answer: (c) => elementOf(c.asc), options: ELEMENTS },
  "asc-sign": { label: "rising sign", answer: (c) => c.asc, options: SIGNS },
  "moon-element": { label: "Moon element", answer: (c) => elementOf(c.moon), options: ELEMENTS },
  "moon-sign": { label: "Moon sign", answer: (c) => c.moon, options: SIGNS },
  pick: { label: "real chart", answer: null, options: null },
};

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: lasts this visit */ }
  },
};

let gqDeck = [];
let gqRates = {}; // mode -> base rates over the Gauquelin deck
let mine = store.get("guess-my-people", []);
let current = null; // {card, options?}
let answered = false;
let gqStatus = "Loading people…";

const memory = {};
const deckName = () => $("deck").value;
const mode = () => $("mode").value;
const historyKey = () => `guess-history:${deckName() === "mine" ? "mine:" : ""}${mode()}`;
const getHistory = () => memory[historyKey()] ?? (memory[historyKey()] = store.get(historyKey(), []));
function addGuess(entry) {
  getHistory().push(entry);
  store.set(historyKey(), getHistory());
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const deck = () => (deckName() === "mine" ? mine : gqDeck);

// Your own people's birthdays are known, which gives away the Sun.
const chartLine = (c) => (c.mine ? `${c.asc} rising, Moon in ${c.moon}` : `${c.asc} rising, Moon in ${c.moon}, Sun in ${c.sun}`);

// Chance a guess is right by luck for this card.
function luck(md, card, guessed) {
  if (md === "pick") return 1 / 3;
  if (!card.mine) return gqRates[md][guessed] || 0;
  if (md === "moon-sign") return 1 / 12;
  if (md === "moon-element") return 1 / 4;
  const rates = risingRates(card.lat);
  if (md === "asc-sign") return rates[guessed];
  return SIGNS.filter((s) => elementOf(s) === guessed).reduce((a, s) => a + rates[s], 0);
}

// Two decoy charts. Gauquelin decoys are other people; for your own
// people they are the sky over the same birthplace at random other times.
function decoy(card) {
  if (!card.mine) return pick(gqDeck);
  const ms = Date.UTC(1940, 0, 1) + Math.random() * 80 * 365.25 * 86400000;
  return { ...chartAt(new Date(ms), card.lat, card.lon), mine: true };
}

function nextPerson() {
  answered = false;
  const people = deck();
  if (!people.length) {
    current = null;
    $("clues").hidden = true;
    $("choices").innerHTML = "";
    $("feedback").innerHTML = "";
    $("loading").hidden = false;
    $("loading").textContent = deckName() === "mine" ? "Add a few people below to start." : gqStatus;
    return;
  }
  const card = pick(people);
  current = { card };
  if (mode() === "pick") {
    const options = [card];
    while (options.length < 3) {
      const d = decoy(card);
      if (!options.some((o) => chartLine(o) === chartLine(d))) options.push(d);
    }
    current.options = options.sort(() => Math.random() - 0.5);
  }
  render();
}

function render() {
  const { card } = current;
  $("loading").hidden = true;
  $("clues").hidden = false;
  if (card.mine) {
    $("clues").innerHTML = `
      <div><dt>Name</dt><dd>${esc(card.name)}</dd></div>
      ${card.place ? `<div><dt>Born in</dt><dd>${esc(card.place)}</dd></div>` : ""}
      <div class="notes-clue"><dt>What you know</dt><dd>${esc(card.notes || "No notes. Go on what you remember.")}</dd></div>`;
  } else {
    const showName = $("show-name").checked && card.name;
    const lat = card.lat >= 0 ? `${card.lat}°N` : `${-card.lat}°S`;
    $("clues").innerHTML = `
      ${showName ? `<div><dt>Name</dt><dd>${esc(card.name)}</dd></div>` : ""}
      <div><dt>Occupation</dt><dd>${esc(card.occ)}</dd></div>
      <div><dt>Born in</dt><dd>${esc(country(card.cy))}, ${card.year} <span class="muted">(about ${lat})</span></dd></div>
      ${SEX[card.sex] ? `<div><dt>Sex</dt><dd>${SEX[card.sex]}</dd></div>` : ""}`;
  }

  const m = MODES[mode()];
  const labels = m.options ?? current.options.map(chartLine);
  $("choices").className = `choices${mode() === "pick" ? " wide" : ""}`;
  $("choices").innerHTML = labels.map((label, i) => `<button data-i="${i}">${esc(label)}</button>`).join("");
  $("feedback").innerHTML = "";
}

function guess(i) {
  if (answered || !current) return;
  answered = true;
  const md = mode();
  const m = MODES[md];
  const { card } = current;
  const isRight = (j) => (md === "pick" ? current.options[j] === card : m.options[j] === m.answer(card));
  const hit = isRight(i);
  const p = luck(md, card, md === "pick" ? null : m.options[i]);
  addGuess({ p, hit });

  [...$("choices").querySelectorAll("button")].forEach((b, j) => {
    b.disabled = true;
    if (isRight(j)) b.classList.add("right");
    else if (j === i) b.classList.add("wrong");
  });

  const who = card.name ? esc(card.name) : "This person";
  const link = !card.mine && card.id ? ` <a href="https://opengauquelin.org/person/${encodeURIComponent(card.id)}" target="_blank" rel="noopener">Their record</a>` : "";
  const odds = md === "pick" ? "" : `By luck alone that guess is right ${Math.round(p * 100)}% of the time.`;
  $("feedback").innerHTML = `
    <div class="result">
      <p class="verdict ${hit ? "yes" : ""}">${hit ? "Right!" : "Not this time."}</p>
      <p>${who}: ${esc(chartLine(card))}.${link}</p>
      <p class="muted small">${odds}</p>
      <button id="next" class="primary">Next person</button>
    </div>`;
  $("next").focus();
  renderScore();
}

function renderScore() {
  const s = score(getHistory());
  const v = verdict(s);
  const tiles = [
    ["Guesses", s.n],
    ["Right", s.hits],
    ["Expected by luck", s.expected.toFixed(1)],
    ["Chance of doing this well by luck", s.n ? fmtP(s.p) : "–"],
  ];
  $("score").innerHTML = tiles
    .map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join("");
  $("verdict").textContent = s.n ? v.text : "Make a guess to start.";
  $("verdict").className = `verdict-line ${v.level}`;
  const which = deckName() === "mine" ? "your own people" : "the Gauquelin records";
  $("score-note").textContent = `Scores are kept separately for each kind of guess and each set of people. This is your ${MODES[mode()].label} score for ${which}.`;
}

// ---- My people ----

let found = []; // place search results

function renderMine() {
  $("mine-list").innerHTML = mine.length
    ? `<p class="small muted">${mine.length} ${mine.length === 1 ? "person" : "people"}. Repeat guesses on the same person don't add new evidence, so the score means more with a bigger list.</p>
       <ul class="people">${mine.map((c, i) => `
        <li><div><strong>${esc(c.name)}</strong> <span class="notes">${esc((c.notes || "").slice(0, 80))}${(c.notes || "").length > 80 ? "…" : ""}</span></div>
        <button data-del="${i}" class="small" aria-label="Remove ${esc(c.name)}">Remove</button></li>`).join("")}</ul>`
    : "";
}

function saveMine() {
  store.set("guess-my-people", mine);
  renderMine();
}

async function searchPlace() {
  const q = $("f-place").value.trim();
  if (!q) return;
  $("f-status").textContent = "Searching…";
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`);
    const data = await res.json();
    found = data.results || [];
  } catch {
    found = [];
  }
  $("f-results").innerHTML = found
    .map((r, i) => `<option value="${i}">${esc([r.name, r.admin1, r.country].filter(Boolean).join(", "))}</option>`)
    .join("");
  $("f-results-row").hidden = !found.length;
  $("f-status").textContent = found.length ? "" : "No match. Try another spelling, or enter coordinates yourself.";
  if (!found.length) $("f-manual").open = true;
}

function addPerson(e) {
  e.preventDefault();
  const day = $("f-day").value, time = $("f-time").value;
  let lat, lon, zone, place;
  const r = !$("f-results-row").hidden ? found[Number($("f-results").value)] : null;
  if ($("f-lat").value !== "" && $("f-lon").value !== "" && $("f-offset").value !== "") {
    lat = Number($("f-lat").value);
    lon = Number($("f-lon").value);
    zone = Number($("f-offset").value);
    place = $("f-place").value.trim();
  } else if (r) {
    lat = r.latitude;
    lon = r.longitude;
    zone = r.timezone;
    place = [r.name, r.country].filter(Boolean).join(", ");
  } else {
    $("f-status").textContent = "Find the birthplace, or enter its coordinates and time offset.";
    return;
  }
  if (Math.abs(lat) >= 66) {
    $("f-status").textContent = "Rising signs aren't reliable this close to the poles.";
    return;
  }
  let chart;
  try {
    chart = chartAt(localToUtc(day, time, zone), lat, lon);
  } catch {
    $("f-status").textContent = "Couldn't work out that birth time. Try entering the hours ahead of UTC yourself.";
    $("f-manual").open = true;
    return;
  }
  mine.push({ mine: true, name: $("f-name").value.trim(), notes: $("f-notes").value.trim(), place, lat, lon, ...chart });
  saveMine();
  $("add-form").reset();
  $("f-results-row").hidden = true;
  found = [];
  $("f-status").textContent = "Added. Their chart stays hidden until you guess.";
  if (!current && deckName() === "mine") nextPerson();
}

function exportMine() {
  const blob = new Blob([JSON.stringify({ people: mine }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "guess-the-chart-people.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importMine(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const people = JSON.parse(await file.text()).people;
    const ok = people.filter((p) => p && p.name && SIGNS.includes(p.asc) && SIGNS.includes(p.moon) && Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const seen = new Set(mine.map((p) => `${p.name}|${p.asc}|${p.moon}`));
    for (const p of ok) if (!seen.has(`${p.name}|${p.asc}|${p.moon}`)) mine.push({ ...p, mine: true });
    saveMine();
    $("f-status").textContent = `Loaded ${ok.length} ${ok.length === 1 ? "person" : "people"}.`;
    if (!current && deckName() === "mine") nextPerson();
  } catch {
    $("f-status").textContent = "That file isn't a Guess the Chart backup.";
  }
  e.target.value = "";
}

// ---- Startup ----

async function loadGauquelin() {
  try {
    const res = await fetch("data/quiz.json");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    gqDeck = data.cards.map((row) => Object.fromEntries(data.keys.map((k, i) => [k, row[i]])));
    $("built").textContent = `${gqDeck.length.toLocaleString("en-US")} people, built ${data.meta.built}.`;
  } catch {
    gqStatus = "The Gauquelin people haven't been downloaded yet. Check back soon, or play with your own people.";
  }
  for (const [key, m] of Object.entries(MODES)) {
    if (m.answer && gqDeck.length) gqRates[key] = baseRates(gqDeck.map(m.answer));
  }
}

function switchDeck() {
  $("mine").hidden = deckName() !== "mine";
  $("show-name-row").hidden = deckName() === "mine";
  renderScore();
  nextPerson();
}

$("choices").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) guess(Number(b.dataset.i));
});
$("feedback").addEventListener("click", (e) => {
  if (e.target.id === "next") nextPerson();
});
$("mode").addEventListener("change", () => {
  store.set("guess-mode", mode());
  renderScore();
  nextPerson();
});
$("deck").addEventListener("change", () => {
  store.set("guess-deck", deckName());
  switchDeck();
});
$("show-name").addEventListener("change", () => {
  store.set("guess-show-name", $("show-name").checked);
  if (current && !answered) render();
});
$("reset").addEventListener("click", () => {
  memory[historyKey()] = [];
  store.set(historyKey(), []);
  renderScore();
});
$("f-search").addEventListener("click", searchPlace);
$("f-place").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); searchPlace(); }
});
$("add-form").addEventListener("submit", addPerson);
$("mine-list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-del]");
  if (!b) return;
  const removed = mine.splice(Number(b.dataset.del), 1)[0];
  saveMine();
  if (current && current.card === removed) nextPerson();
});
$("export").addEventListener("click", exportMine);
$("import").addEventListener("change", importMine);

$("mode").value = store.get("guess-mode", "asc-element");
if (!MODES[$("mode").value]) $("mode").value = "asc-element";
$("deck").value = store.get("guess-deck", "gq") === "mine" ? "mine" : "gq";
$("show-name").checked = store.get("guess-show-name", false);
renderMine();
loadGauquelin().then(switchDeck);
renderScore();
