// Hand-built responsive SVG charts (no external libraries): workout scatter plot + vitals time series.
import { esc, parseDate } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const DAY = 86400000;

function niceMax(v) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}
function ticks(lo, hi, count = 5) {
  const span = hi - lo || 1;
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function dateTicks(t0, t1, maxTicks) {
  const days = Math.max(1, Math.round((t1 - t0) / DAY));
  const stepDays = [1, 2, 3, 7, 14, 30, 61, 91, 182, 365].find((s) => days / s <= maxTicks) || 365;
  const out = [];
  const start = new Date(t0); start.setHours(0, 0, 0, 0);
  if (stepDays >= 30) { start.setDate(1); }
  for (let d = new Date(start); d.getTime() <= t1; ) {
    if (d.getTime() >= t0 - 1) out.push(d.getTime());
    if (stepDays >= 30) d.setMonth(d.getMonth() + Math.round(stepDays / 30));
    else d.setDate(d.getDate() + stepDays);
  }
  return { ticks: out, monthly: stepDays >= 30, multiYear: new Date(t0).getFullYear() !== new Date(t1).getFullYear() };
}
function fmtTick(t, monthly, multiYear) {
  const d = new Date(t);
  if (monthly) return d.toLocaleDateString(undefined, multiYear ? { month: "short", year: "2-digit" } : { month: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent && parent.appendChild(n);
  return n;
}

function makeFrame(container, { height, ariaLabel }) {
  container.classList.add("chart-wrap");
  container.innerHTML = "";
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.setAttribute("role", "tooltip");
  container.appendChild(tip);
  const width = Math.max(280, container.clientWidth || 320);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, height, role: "img", "aria-label": ariaLabel });
  container.appendChild(svg);
  return { svg, tip, width };
}

function placeTip(container, tip, x, y) {
  const w = tip.offsetWidth || 180, h = tip.offsetHeight || 80;
  const cw = container.clientWidth;
  let left = x + 14, top = y - h - 12;
  if (left + w > cw) left = x - w - 14;
  if (left < 0) left = Math.max(0, Math.min(cw - w, x - w / 2));
  if (top < -10) top = y + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function observe(container, draw) {
  let lastW = container.clientWidth;
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    if (Math.abs(w - lastW) > 4) { lastW = w; draw(); }
  });
  ro.observe(container);
  return () => ro.disconnect();
}

/**
 * Workout activity scatter plot.
 * points: [{date:'YYYY-MM-DD', minutes:number, status:'completed'|'partial', workout, plan, ...}]
 * opts: { from:'YYYY-MM-DD'|null, to:'YYYY-MM-DD', onSelect(point), tooltip(point)->html }
 */
export function scatterPlot(container, points, opts = {}) {
  const draw = () => {
    const height = container.clientWidth < 500 ? 260 : 320;
    const { svg, tip, width } = makeFrame(container, {
      height, ariaLabel: `Scatter plot of ${points.length} recorded workout sessions: date versus duration in minutes.`,
    });
    const m = { l: 46, r: 16, t: 14, b: 46 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const times = points.map((p) => parseDate(p.date).getTime());
    const to = parseDate(opts.to).getTime();
    let from = opts.from ? parseDate(opts.from).getTime() : Math.min(...times, to - 6 * DAY);
    if (!opts.from) from -= Math.max(DAY, (to - from) * 0.03);
    const t0 = from - DAY * 0.5, t1 = to + DAY * 0.5;
    const yMax = niceMax(Math.max(30, ...points.map((p) => p.minutes)) * 1.1);
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => m.t + ih - (v / yMax) * ih;

    const g = el("g", { class: "axis" }, svg);
    for (const v of ticks(0, yMax, ih < 200 ? 4 : 5)) {
      el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: v === 0 ? "base-line" : "grid-line" }, g);
      const t = el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, g); t.textContent = v;
    }
    const dt = dateTicks(t0, t1, Math.max(4, Math.floor(iw / 64)));
    for (const tv of dt.ticks) {
      el("line", { x1: x(tv), x2: x(tv), y1: m.t, y2: m.t + ih, class: "grid-line" }, g);
      const t = el("text", { x: x(tv), y: m.t + ih + 18, "text-anchor": "middle" }, g);
      t.textContent = fmtTick(tv, dt.monthly, dt.multiYear);
    }
    const xt = el("text", { x: m.l + iw / 2, y: height - 6, "text-anchor": "middle", class: "axis-title" }, g);
    xt.textContent = "Workout date";
    const yt = el("text", { x: -(m.t + ih / 2), y: 12, transform: "rotate(-90)", "text-anchor": "middle", class: "axis-title" }, g);
    yt.textContent = "Duration (minutes)";

    // Offset same-day sessions slightly so each stays inspectable.
    const sameDay = {};
    const layer = el("g", {}, svg);
    let selected = null;
    const nodes = points.map((p, i) => {
      const k = p.date; sameDay[k] = (sameDay[k] || 0) + 1;
      const cx = x(times[i]) + (sameDay[k] - 1) * 7, cy = y(p.minutes);
      const color = p.status === "partial" ? "var(--partial)" : "var(--completed)";
      const grp = el("g", {
        class: "pt", tabindex: 0, role: "button",
        "aria-label": `${p.workout}, ${p.date}, ${p.status === "partial" ? "partially completed" : "completed"}, ${p.minutes} minutes`,
      }, layer);
      el("circle", { cx, cy, r: 14, fill: "transparent" }, grp); // larger touch target
      const halo = el("circle", { cx, cy, r: 11, fill: color, opacity: 0 }, grp);
      let mark;
      if (p.status === "partial") {
        const s = 6.5;
        mark = el("path", { d: `M${cx} ${cy - s} L${cx + s} ${cy} L${cx} ${cy + s} L${cx - s} ${cy} Z`, fill: color, stroke: "#0B0D10", "stroke-width": 1.5 }, grp);
      } else {
        mark = el("circle", { cx, cy, r: 6, fill: color, stroke: "#0B0D10", "stroke-width": 1.5 }, grp);
      }
      const node = { grp, halo, tipFor: () => {
        tip.innerHTML = opts.tooltip ? opts.tooltip(p) : `<b>${esc(p.workout)}</b>${esc(p.date)} · ${p.minutes} min`;
        tip.classList.add("show");
        placeTip(container, tip, cx * (container.clientWidth / width), cy);
      } };
      const show = (sticky) => {
        node.tipFor();
        halo.setAttribute("opacity", 0.22);
        if (sticky && selected !== node) {
          if (selected) selected.halo.setAttribute("opacity", 0);
          selected = node;
          opts.onSelect && opts.onSelect(p);
        }
      };
      grp.addEventListener("mouseenter", () => show(false));
      grp.addEventListener("mouseleave", () => {
        if (selected === node) return;
        halo.setAttribute("opacity", 0);
        if (selected) selected.tipFor(); else tip.classList.remove("show");
      });
      grp.addEventListener("focus", () => show(true));
      grp.addEventListener("click", (e) => { e.stopPropagation(); show(true); });
      grp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(true); } });
      return grp;
    });
    svg.addEventListener("click", () => {
      if (selected) { selected.halo.setAttribute("opacity", 0); selected = null; }
      tip.classList.remove("show");
      opts.onSelect && opts.onSelect(null);
    });
    return nodes;
  };
  draw();
  return observe(container, draw);
}

/**
 * Time-series chart for vitals.
 * series: [{ name, color, points:[{t:Date|ms, v:number, raw:any}] }]
 * opts: { unit, yLabel, tooltip(series, point)->html, onSelect(raw), dashed?:bool[] }
 */
export function timeSeries(container, series, opts = {}) {
  const draw = () => {
    const height = container.clientWidth < 500 ? 230 : 280;
    const all = series.flatMap((s) => s.points);
    const { svg, tip, width } = makeFrame(container, {
      height, ariaLabel: `${opts.yLabel || "Measurement"} over time, ${all.length} readings.`,
    });
    const m = { l: 46, r: 16, t: 14, b: 40 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const ts = all.map((p) => +p.t), vs = all.map((p) => p.v);
    let t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (t1 - t0 < DAY) { t0 -= DAY / 2; t1 += DAY / 2; }
    const pad = (t1 - t0) * 0.04; t0 -= pad; t1 += pad;
    let lo = Math.min(...vs), hi = Math.max(...vs);
    const spread = Math.max(hi - lo, (opts.minSpan || 4));
    lo = lo - spread * 0.25; hi = hi + spread * 0.25;
    const tk = ticks(lo, hi, ih < 180 ? 4 : 5);
    lo = Math.min(lo, tk[0]); hi = Math.max(hi, tk[tk.length - 1]);
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;

    const g = el("g", { class: "axis" }, svg);
    for (const v of tk) {
      el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: "grid-line" }, g);
      const t = el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, g); t.textContent = +v.toFixed(1);
    }
    const dt = dateTicks(t0, t1, Math.max(4, Math.floor(iw / 64)));
    for (const tv of dt.ticks) {
      const t = el("text", { x: x(tv), y: m.t + ih + 18, "text-anchor": "middle" }, g);
      t.textContent = fmtTick(tv, dt.monthly, dt.multiYear);
    }
    el("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih, class: "base-line" }, g);
    const yt = el("text", { x: -(m.t + ih / 2), y: 12, transform: "rotate(-90)", "text-anchor": "middle", class: "axis-title" }, g);
    yt.textContent = opts.yLabel || "";

    const defs = el("defs", {}, svg);
    series.forEach((s, si) => {
      const pts = [...s.points].sort((a, b) => a.t - b.t);
      if (!pts.length) return;
      const gid = `grad-${Math.random().toString(36).slice(2, 7)}`;
      const grad = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": si === 0 ? 0.18 : 0.08 }, grad);
      el("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": 0 }, grad);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${x(+p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
      if (pts.length > 1) {
        el("path", { d: `${d} L${x(+pts[pts.length - 1].t)} ${m.t + ih} L${x(+pts[0].t)} ${m.t + ih} Z`, fill: `url(#${gid})` }, svg);
        el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      }
      for (const p of pts) {
        const cx = x(+p.t), cy = y(p.v);
        const grp = el("g", { class: "pt", tabindex: 0, role: "button", "aria-label": `${s.name} ${p.v} ${opts.unit || ""} on ${new Date(p.t).toLocaleString()}` }, svg);
        el("circle", { cx, cy, r: 12, fill: "transparent" }, grp);
        const dot = el("circle", { cx, cy, r: pts.length > 40 ? 3 : 4.5, fill: s.color, stroke: "#0B0D10", "stroke-width": 1.5 }, grp);
        const show = () => {
          tip.innerHTML = opts.tooltip ? opts.tooltip(s, p) : `<b>${p.v} ${esc(opts.unit || "")}</b>${new Date(p.t).toLocaleString()}`;
          tip.classList.add("show");
          placeTip(container, tip, cx * (container.clientWidth / width), cy);
          dot.setAttribute("r", 6.5);
        };
        const hide = () => { tip.classList.remove("show"); dot.setAttribute("r", pts.length > 40 ? 3 : 4.5); };
        grp.addEventListener("mouseenter", show);
        grp.addEventListener("mouseleave", hide);
        grp.addEventListener("focus", show);
        grp.addEventListener("blur", hide);
        grp.addEventListener("click", (e) => { e.stopPropagation(); show(); opts.onSelect && opts.onSelect(p.raw); });
        grp.addEventListener("keydown", (e) => { if (e.key === "Enter") { show(); opts.onSelect && opts.onSelect(p.raw); } });
      }
    });
    svg.addEventListener("click", () => tip.classList.remove("show"));
  };
  draw();
  return observe(container, draw);
}
