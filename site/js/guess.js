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

let deck = [];
let rates = {}; // mode -> base rates
let current = null; // {card, options?}
let answered = false;

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: scores last this visit */ }
  },
};
const memory = {};
const historyKey = (mode) => `guess-history:${mode}`;
const getHistory = (mode) => memory[mode] ?? (memory[mode] = store.get(historyKey(mode), []));
function addGuess(mode, entry) {
  getHistory(mode).push(entry);
  store.set(historyKey(mode), getHistory(mode));
}

const mode = () => $("mode").value;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function chartLine(c) {
  return `${c.asc} rising, Moon in ${c.moon}, Sun in ${c.sun}`;
}

function nextPerson() {
  answered = false;
  const card = pick(deck);
  current = { card };
  if (mode() === "pick") {
    // Two decoys from other people, with a different chart from the real one.
    const options = [card];
    while (options.length < 3) {
      const d = pick(deck);
      if (!options.some((o) => chartLine(o) === chartLine(d))) options.push(d);
    }
    current.options = options.sort(() => Math.random() - 0.5);
  }
  render();
}

function render() {
  const { card } = current;
  const showName = $("show-name").checked && card.name;
  const lat = card.lat >= 0 ? `${card.lat}°N` : `${-card.lat}°S`;
  $("loading").hidden = true;
  $("clues").hidden = false;
  $("clues").innerHTML = `
    ${showName ? `<div><dt>Name</dt><dd>${esc(card.name)}</dd></div>` : ""}
    <div><dt>Occupation</dt><dd>${esc(card.occ)}</dd></div>
    <div><dt>Born in</dt><dd>${esc(country(card.cy))}, ${card.year} <span class="muted">(about ${lat})</span></dd></div>
    ${SEX[card.sex] ? `<div><dt>Sex</dt><dd>${SEX[card.sex]}</dd></div>` : ""}`;

  const m = MODES[mode()];
  const labels = m.options ?? current.options.map(chartLine);
  $("choices").className = `choices${mode() === "pick" ? " wide" : ""}`;
  $("choices").innerHTML = labels
    .map((label, i) => `<button data-i="${i}">${esc(label)}</button>`)
    .join("");
  $("feedback").innerHTML = "";
}

function guess(i) {
  if (answered) return;
  answered = true;
  const md = mode();
  const m = MODES[md];
  const { card } = current;
  let hit, p, picked;
  if (md === "pick") {
    picked = current.options[i];
    hit = picked === card;
    p = 1 / 3;
  } else {
    picked = m.options[i];
    hit = picked === m.answer(card);
    p = rates[md][picked] || 0;
  }
  addGuess(md, { p, hit });

  const buttons = [...$("choices").querySelectorAll("button")];
  buttons.forEach((b, j) => {
    b.disabled = true;
    const isRight = md === "pick" ? current.options[j] === card : m.options[j] === m.answer(card);
    if (isRight) b.classList.add("right");
    else if (j === i) b.classList.add("wrong");
  });

  const who = card.name ? esc(card.name) : "This person";
  const link = card.id ? ` <a href="https://opengauquelin.org/person/${encodeURIComponent(card.id)}" target="_blank" rel="noopener">Their record</a>` : "";
  const luck = md === "pick" ? "" : ` By luck alone that guess is right ${Math.round(p * 100)}% of the time.`;
  $("feedback").innerHTML = `
    <div class="result">
      <p class="verdict ${hit ? "yes" : ""}">${hit ? "Right!" : "Not this time."}</p>
      <p>${who}: ${esc(chartLine(card))}.${link}</p>
      <p class="muted small">${luck}</p>
      <button id="next" class="primary">Next person</button>
    </div>`;
  $("next").focus();
  renderScore();
}

function renderScore() {
  const md = mode();
  const s = score(getHistory(md));
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
  $("score-note").textContent = `Scores are kept separately for each kind of guess. This is your ${MODES[md].label} score.`;
}

async function load() {
  try {
    const res = await fetch("data/quiz.json");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    deck = data.cards.map((row) => Object.fromEntries(data.keys.map((k, i) => [k, row[i]])));
    $("built").textContent = `${deck.length.toLocaleString("en-US")} people, built ${data.meta.built}.`;
  } catch {
    $("loading").textContent = "The people for this game haven't been downloaded yet. Check back soon.";
    return;
  }
  for (const [key, m] of Object.entries(MODES)) {
    if (m.answer) rates[key] = baseRates(deck.map(m.answer));
  }
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
  if (deck.length) nextPerson();
});
$("show-name").addEventListener("change", () => {
  store.set("guess-show-name", $("show-name").checked);
  if (current && !answered) render();
});
$("reset").addEventListener("click", () => {
  memory[mode()] = [];
  store.set(historyKey(mode()), []);
  renderScore();
});

$("mode").value = store.get("guess-mode", "asc-element");
if (!MODES[$("mode").value]) $("mode").value = "asc-element";
$("show-name").checked = store.get("guess-show-name", false);
renderScore();
load();
