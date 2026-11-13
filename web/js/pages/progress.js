// Progress: figures + scatter plot derived only from logged workout completion records.
import { get, localToday } from "../api.js";
import { scatterPlot } from "../charts.js";
import { emptyState, errorCard, esc, fmtDate, icon, label, parseDate, plural } from "../ui.js";

const RANGES = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["all", "All time"]];
let range = "30";

function kpi(name, value, color, foot, glow = false) {
  return `<div class="kpi ${glow ? "glow" : ""}"><div class="kpi-label"><i style="background:${color}"></i>${name}</div>
    <div class="kpi-value num">${value}</div><div class="kpi-foot">${foot}</div></div>`;
}

function tipHtml(p) {
  const st = p.status === "partial" ? `<span style="color:var(--partial)">◆ Partially completed</span>` : `<span style="color:var(--completed)">● Completed</span>`;
  return `<b>${esc(p.workout)}</b><span class="muted">${fmtDate(p.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span><br>
    ${st}<br><span class="num">${p.minutes} min</span>${p.status === "partial" ? ` · ${p.done_exercises}/${p.planned_exercises} exercises` : ""}`;
}

function detailHtml(p) {
  if (!p) return `<p class="hint">Tap or hover a point to inspect a session.</p>`;
  return `<div class="session is-${p.status}" style="align-items:flex-start">
    <div class="grow">
      <div class="row" style="gap:8px"><b>${esc(p.workout)}</b><span class="badge ${p.status}">${label(p.status)}</span></div>
      <div class="hint" style="margin-top:4px">${esc(p.plan)} · Week ${p.week} · ${fmtDate(p.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div class="ex-rx" style="margin-top:10px">
        <div><small>Duration</small><b>${p.minutes} min</b></div>
        <div><small>Exercises</small><b>${p.status === "partial" ? `${p.done_exercises}/${p.planned_exercises}` : `${p.planned_exercises}/${p.planned_exercises}`}</b></div>
      </div>
      ${p.notes ? `<p class="muted" style="margin-top:10px;font-size:13.5px">“${esc(p.notes)}”</p>` : ""}
    </div>
    <a class="btn btn-sm" href="#/workouts/${p.plan_id}">${icon("workout")} Plan</a></div>`;
}

function weeklyBars(weekly) {
  const max = Math.max(1, ...weekly.map((w) => w.completed + w.partial + w.skipped));
  return `<div class="bars" role="img" aria-label="Sessions logged per week for the last 8 weeks">
    ${weekly.map((w) => {
      const h = (n) => `${(n / max) * 100}%`;
      const total = w.completed + w.partial + w.skipped;
      return `<div class="bar-col" title="Week of ${fmtDate(w.start, { month: "short", day: "numeric" })}: ${w.completed} completed, ${w.partial} partial, ${w.skipped} skipped, ${w.minutes} min">
        <span class="hint num">${total || ""}</span>
        <div class="bar-stack" style="height:${total ? (total / max) * 100 : 0}%">
          ${w.completed ? `<span style="height:${(w.completed / total) * 100}%;background:var(--completed)"></span>` : ""}
          ${w.partial ? `<span style="height:${(w.partial / total) * 100}%;background:var(--partial)"></span>` : ""}
          ${w.skipped ? `<span style="height:${(w.skipped / total) * 100}%;background:var(--skipped)"></span>` : ""}
        </div>
        <small>${parseDate(w.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div>`;
    }).join("")}</div>`;
}

function recentHtml(recent) {
  if (!recent.length) return `<p class="muted">No sessions logged yet.</p>`;
  return `<div class="list">${recent.map((r) => {
    const detail = r.status === "skipped"
      ? (r.skip_reason ? `Skipped · ${esc(r.skip_reason)}` : "Skipped · no duration")
      : r.duration_minutes ? `${r.duration_minutes} min` : `<span style="color:#C9A97A">Duration not recorded</span>`;
    return `<a class="list-item" href="#/workouts/${r.plan_id}?session=${r.session_id}" style="color:inherit">
      <span class="dot" style="background:var(--${r.status === "completed" ? "completed" : r.status})${r.status === "partial" ? ";border-radius:2px;transform:rotate(45deg);width:9px;height:9px" : ""}"></span>
      <span class="grow"><span class="title" style="display:block">${esc(r.session_title)}</span>
        <span class="sub">${esc(r.plan_name)} · ${fmtDate(r.session_date, { month: "short", day: "numeric", year: "numeric" })}</span></span>
      <span style="text-align:right;font-size:13px"><span class="badge ${r.status}">${label(r.status)}</span><br><span class="hint">${detail}</span></span></a>`;
  }).join("")}</div>`;
}

export async function render(root) {
  let disconnect = null;
  root.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Activity</div><h1>Progress</h1><p>Built only from sessions you've logged — generated or saved plans never count as completed.</p></div>
      <div class="seg" role="radiogroup" aria-label="Date range" id="range">
        ${RANGES.map(([v, t]) => `<button role="radio" data-r="${v}" class="${v === range ? "active" : ""}" aria-checked="${v === range}">${t}</button>`).join("")}
      </div>
    </div>
    <div id="content" class="stack"><div class="grid grid-4">${'<div class="skeleton" style="height:104px"></div>'.repeat(4)}</div><div class="skeleton" style="height:320px"></div></div>`;
  const content = root.querySelector("#content");

  const load = async () => {
    if (disconnect) { disconnect(); disconnect = null; }
    root.querySelectorAll("#range button").forEach((b) => { b.classList.toggle("active", b.dataset.r === range); b.setAttribute("aria-checked", b.dataset.r === range); });
    let data;
    try {
      data = await get(`/api/progress?range=${range}&today=${localToday()}`);
    } catch (err) {
      content.innerHTML = errorCard(err);
      content.querySelector("#retry").addEventListener("click", load);
      return;
    }
    const t = data.totals;
    const rangeLabel = range === "all" ? "All time" : `Last ${range} days`;
    if (data.all_time.logged === 0) {
      content.innerHTML = `<div class="card pad-lg">${emptyState({
        iconName: "progress", title: "Your progress starts with your first logged workout",
        text: "Open a saved plan in My Workout and use <b>Mark Workout Complete</b> after a session. Each completed or partially completed session with a duration becomes a point on your activity scatter plot. Nothing is shown until you log real sessions.",
        action: `<div class="row" style="justify-content:center"><a class="btn btn-primary" href="#/workouts">${icon("workout")} Go to My Workout</a><a class="btn" href="#/create">${icon("sparkle")} Create a plan</a></div>`,
      })}</div>`;
      return;
    }
    const noDur = t.sessions_without_duration;
    content.innerHTML = `
      <div class="grid grid-4">
        ${kpi("Completed", t.completed, "var(--completed)", rangeLabel, true)}
        ${kpi("Partially completed", t.partial, "var(--partial)", rangeLabel)}
        ${kpi("Skipped", t.skipped, "var(--skipped)", rangeLabel)}
        ${kpi("Training minutes", `${t.minutes}<small>min</small>`, "var(--accent-2)", noDur ? `${plural(noDur, "session")} without duration` : "From recorded durations")}
      </div>

      <div class="card pad-lg">
        <div class="spread" style="flex-wrap:wrap;margin-bottom:12px">
          <div><div class="card-title">Workout activity</div><div class="card-sub">Each point is one logged session · date × recorded duration</div></div>
          <div class="legend"><span><i style="background:var(--completed)"></i>Completed</span><span><i class="diamond" style="background:var(--partial)"></i>Partially completed</span></div>
        </div>
        <div id="scatter"></div>
        <div id="scatter-detail" style="margin-top:14px"></div>
        <div class="stack" style="gap:8px;margin-top:12px">
          ${noDur ? `<div class="notice warn">${icon("clock")}<span><b>${plural(noDur, "session")}</b> in this range ${noDur === 1 ? "has" : "have"} no recorded duration, so ${noDur === 1 ? "it isn't" : "they aren't"} plotted. ${noDur === 1 ? "It still counts" : "They still count"} in your totals and history. Edit a log to add the duration.</span></div>` : ""}
          ${t.skipped ? `<p class="hint">${plural(t.skipped, "skipped session")} in this range ${t.skipped === 1 ? "is" : "are"} counted above but not plotted — skipped sessions have no duration.</p>` : ""}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card pad-lg">
          <div class="card-title">Weekly activity</div><div class="card-sub" style="margin-bottom:16px">Sessions logged per week · last 8 weeks</div>
          ${weeklyBars(data.weekly)}
          <div class="legend" style="margin-top:12px"><span><i style="background:var(--completed)"></i>Completed</span><span><i style="background:var(--partial)"></i>Partial</span><span><i style="background:var(--skipped)"></i>Skipped</span></div>
        </div>
        <div class="card pad-lg">
          <div class="card-title">Monthly summary</div><div class="card-sub" style="margin-bottom:8px">Last 6 months</div>
          <div style="overflow-x:auto"><table class="table">
            <thead><tr><th>Month</th><th class="r">Done</th><th class="r">Partial</th><th class="r">Skipped</th><th class="r">Minutes</th></tr></thead>
            <tbody>${data.monthly.map((m) => `<tr><td>${new Date(m.month + "-01T00:00").toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</td>
              <td class="r" style="color:${m.completed ? "var(--completed)" : "inherit"}">${m.completed}</td><td class="r">${m.partial}</td><td class="r">${m.skipped}</td><td class="r">${m.minutes}</td></tr>`).join("")}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card pad-lg">
        <div class="spread"><div><div class="card-title">Recent activity</div><div class="card-sub">Latest logged sessions, including skipped</div></div></div>
        <div style="margin-top:6px">${recentHtml(data.recent)}</div>
      </div>`;

    const sc = content.querySelector("#scatter");
    const detail = content.querySelector("#scatter-detail");
    if (!data.points.length) {
      sc.innerHTML = emptyState({
        iconName: "progress", title: "No sessions to plot in this range",
        text: range !== "all" ? "Try a longer date range, or log a completed session with its duration." : "Log a completed or partially completed session with a duration to see it here.",
      });
      detail.innerHTML = "";
    } else {
      detail.innerHTML = detailHtml(null);
      disconnect = scatterPlot(sc, data.points, {
        from: data.since, to: data.today, tooltip: tipHtml,
        onSelect: (p) => { detail.innerHTML = detailHtml(p); },
      });
    }
  };

  root.querySelector("#range").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]");
    if (!b || b.dataset.r === range) return;
    range = b.dataset.r;
    load();
  });
  const onChange = () => load();
  window.addEventListener("fitnova:data-changed", onChange);
  await load();
  return () => { window.removeEventListener("fitnova:data-changed", onChange); if (disconnect) disconnect(); };
}
