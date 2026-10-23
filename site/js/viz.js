// Small SVG and tooltip helpers shared by the explainer pages.

const NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

export function text(parent, x, y, str, attrs = {}) {
  const el = svg("text", { x, y, class: "svg-text", ...attrs }, parent);
  el.textContent = str;
  return el;
}

let tipEl = null;

export function showTip(evt, html) {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tip";
    document.body.appendChild(tipEl);
  }
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const pad = 14;
  const w = tipEl.offsetWidth;
  const x = evt.clientX + pad + w > window.innerWidth ? evt.clientX - pad - w : evt.clientX + pad;
  tipEl.style.left = `${Math.max(4, x)}px`;
  tipEl.style.top = `${evt.clientY + pad}px`;
}

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

// Map a value range to a pixel range.
export function scale(d0, d1, r0, r1) {
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

export function niceTicks(min, max, count = 5) {
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// Line chart with a hover crosshair. series: [{label, cls, points: [[x, y]]}].
export function lineChart(host, { series, xLabel, yLabel, xFmt = String, yFmt = (v) => v.toFixed(2), xTicks, yMin = 0, yMax, markers = [] }) {
  host.innerHTML = "";
  // Size to the container so text stays readable on phones.
  const W = Math.max(300, host.clientWidth || 640), H = 260, m = { l: 44, r: 16, t: 12, b: 36 };
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${yLabel} by ${xLabel}` }, host);
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y1 = yMax ?? Math.max(...series.flatMap((s) => s.points.map((p) => p[1]))) * 1.05;
  const X = scale(x0, x1, m.l, W - m.r), Y = scale(yMin, y1, H - m.b, m.t);

  for (const t of niceTicks(yMin, y1, 4)) {
    svg("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: "svg-grid" }, root);
    text(root, m.l - 6, Y(t) + 4, yFmt(t), { "text-anchor": "end" });
  }
  for (const t of xTicks ?? niceTicks(x0, x1, 6)) {
    text(root, X(t), H - m.b + 16, xFmt(t), { "text-anchor": "middle" });
  }
  svg("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "svg-axis" }, root);
  text(root, (m.l + W - m.r) / 2, H - 4, xLabel, { "text-anchor": "middle" });

  for (const mk of markers) {
    svg("line", { x1: X(mk.x), x2: X(mk.x), y1: m.t, y2: H - m.b, class: "svg-axis", "stroke-dasharray": "3 3" }, root);
    if (mk.label) text(root, X(mk.x) + 4, m.t + 10, mk.label);
  }

  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    const path = svg("path", { d, fill: "none", class: s.cls, "stroke-width": 2, "stroke-linejoin": "round" }, root);
    if (s.dash) path.setAttribute("stroke-dasharray", "5 4");
  }

  const cross = svg("line", { y1: m.t, y2: H - m.b, class: "svg-axis", visibility: "hidden" }, root);
  const dots = series.map((s) => svg("circle", { r: 4, class: `${s.cls.replace("stroke", "fill")} dot-ring`, visibility: "hidden" }, root));
  const hit = svg("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, root);
  hit.addEventListener("pointermove", (e) => {
    const box = root.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const xv = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
    const pts = series.map((s) => s.points.reduce((a, b) => (Math.abs(b[0] - xv) < Math.abs(a[0] - xv) ? b : a)));
    cross.setAttribute("x1", X(pts[0][0]));
    cross.setAttribute("x2", X(pts[0][0]));
    cross.setAttribute("visibility", "visible");
    pts.forEach((p, i) => {
      dots[i].setAttribute("cx", X(p[0]));
      dots[i].setAttribute("cy", Y(p[1]));
      dots[i].setAttribute("visibility", "visible");
    });
    showTip(e, `<strong>${xFmt(pts[0][0])}</strong><br>` + series.map((s, i) => `${s.label}: ${yFmt(pts[i][1])}`).join("<br>"));
  });
  hit.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    dots.forEach((d) => d.setAttribute("visibility", "hidden"));
    hideTip();
  });
  return { root, X };
}
