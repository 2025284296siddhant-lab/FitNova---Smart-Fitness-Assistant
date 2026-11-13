// My Workout: saved plans list, plan detail (schedule + program), and the session completion flow.
import { del, get, localToday, notifyChange, patch, post, put } from "../api.js";
import {
  clearErrors, confirmDialog, emptyState, errorCard, esc, fmtDate, icon, label, openSheet, parseDate, plural,
  setBusy, showErrors, toast,
} from "../ui.js";
import { dayCard, exerciseRow, notesNotice } from "../workout-ui.js";

const STATUS_COLORS = { completed: "var(--completed)", partial: "var(--partial)", skipped: "var(--skipped)" };

function displayStatus(s, today) {
  if (s.status !== "upcoming") return s.status;
  return s.scheduled_date < today ? "overdue" : "upcoming";
}

function progressBar(c) {
  const seg = (n, color) => (n ? `<span style="width:${(n / c.total) * 100}%;background:${color}"></span>` : "");
  return `<div class="progress-bar" role="img" aria-label="${c.completed} completed, ${c.partial} partial, ${c.skipped} skipped of ${c.total} sessions">
    ${seg(c.completed, STATUS_COLORS.completed)}${seg(c.partial, STATUS_COLORS.partial)}${seg(c.skipped, STATUS_COLORS.skipped)}</div>`;
}

function countsLine(c) {
  return `<div class="row" style="gap:12px;font-size:12.5px;margin-top:8px">
    <span style="color:var(--completed)">● ${c.completed} completed</span>
    <span style="color:var(--partial)">◆ ${c.partial} partial</span>
    <span style="color:var(--skipped)">● ${c.skipped} skipped</span>
    <span class="faint">${c.upcoming} not yet logged</span></div>`;
}

// ------------------------------------------------------------------ list view
async function renderList(root, ctx) {
  root.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Your programs</div><h1>My Workout</h1><p>Saved plans and their scheduled sessions. Log each session as completed, partially completed or skipped.</p></div>
      <a class="btn btn-primary" href="#/create">${icon("plus")} New plan</a>
    </div>
    <div id="plans" class="grid grid-2"><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div></div>`;
  const box = root.querySelector("#plans");
  const load = async () => {
    try {
      const { plans } = await get("/api/plans");
      if (!plans.length) {
        box.className = "";
        box.innerHTML = `<div class="card">${emptyState({ iconName: "workout", title: "No saved plans yet", text: "Generate a personalised weekly plan and save it — it will appear here with its scheduled sessions.", action: `<a class="btn btn-primary" href="#/create">${icon("sparkle")} Create My Workout</a>` })}</div>`;
        return;
      }
      box.className = "grid grid-2";
      box.innerHTML = plans.map((p) => `
        <article class="card interactive" data-open="${p.plan_id}" tabindex="0" aria-label="Open ${esc(p.name)}">
          <div class="spread" style="align-items:flex-start">
            <div style="min-width:0"><h3 style="font-size:18px">${esc(p.name)}</h3>
              <p class="card-sub">${label(p.goal)} · ${label(p.level)} · ${p.days_per_week} days/week · ${p.weeks} weeks</p></div>
            <button class="icon-btn" data-del="${p.plan_id}" aria-label="Delete ${esc(p.name)}">${icon("trash")}</button>
          </div>
          <div class="row" style="margin:12px 0">${p.equipment.map((e) => `<span class="tag">${label(e)}</span>`).join("")}</div>
          ${progressBar(p.counts)}${countsLine(p.counts)}
          <hr class="divider" style="margin:14px 0 12px">
          <div class="spread">
            <div style="min-width:0">${p.next_session
              ? `<div class="hint">Next session</div><b>${esc(p.next_session.title)}</b> <span class="muted" style="font-size:13px">· ${fmtDate(p.next_session.scheduled_date, { weekday: "short", month: "short", day: "numeric" })}</span>`
              : `<div class="hint">All sessions logged</div><b>Plan finished</b>`}</div>
            <span class="btn btn-sm btn-outline">Open ${icon("chevronRight")}</span>
          </div>
        </article>`).join("");
      box.querySelectorAll("[data-open]").forEach((c) => {
        const go = () => ctx.navigate(`/workouts/${c.dataset.open}`);
        c.addEventListener("click", (e) => { if (!e.target.closest("[data-del]")) go(); });
        c.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === c) go(); });
      });
      box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const p = plans.find((x) => x.plan_id === Number(b.dataset.del));
        if (await deletePlan(p)) load();
      }));
    } catch (err) {
      box.className = "";
      box.innerHTML = errorCard(err);
      box.querySelector("#retry").addEventListener("click", load);
    }
  };
  await load();
}

async function deletePlan(p) {
  const logged = p.counts.completed + p.counts.partial + p.counts.skipped;
  const ok = await confirmDialog({
    title: `Delete “${esc(p.name)}”?`,
    message: `This removes the plan and its ${plural(p.counts.total, "scheduled session")}.` +
      (logged ? ` <b style="color:var(--text)">${plural(logged, "logged session")} from this plan will also be removed from your progress history.</b>` : "") +
      " This cannot be undone.",
    confirmText: "Delete plan", danger: true,
  });
  if (!ok) return false;
  try {
    await del(`/api/plans/${p.plan_id}`);
    notifyChange("plans");
    toast("Plan deleted");
    return true;
  } catch (err) { toast(err.message, "error"); return false; }
}

// ------------------------------------------------------------------ completion sheet
function openCompletionSheet(plan, session, onSaved) {
  const today = localToday();
  const day = plan.days.find((d) => d.day_number === session.day_number) || { items: [] };
  const c = session.completion;
  const editing = !!c;
  const defaultDate = c ? c.session_date : (session.scheduled_date <= today ? session.scheduled_date : today);
  const status = c ? c.status : "completed";
  const statusChip = (v, ic, text, sub) => `<label class="chip"><input type="radio" name="status" value="${v}" ${status === v ? "checked" : ""}>${icon(ic)}<span class="chip-text"><b>${text}</b><small>${sub}</small></span></label>`;
  const s = openSheet({
    title: editing ? "Edit workout log" : "Mark workout complete",
    subtitle: `${esc(session.title)} · Week ${session.week_number} · scheduled ${fmtDate(session.scheduled_date, { weekday: "short", month: "short", day: "numeric" })}`,
    body: `
      <form id="c-form" class="stack" novalidate>
        <div class="field" data-field="status">
          <span class="label">How did it go?</span>
          <div class="chips" role="radiogroup" aria-label="Session status" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
            ${statusChip("completed", "checkCircle", "Completed", "Did the session")}
            ${statusChip("partial", "half", "Partially", "Did some exercises")}
            ${statusChip("skipped", "skip", "Skipped", "Didn't train")}
          </div>
          <div class="field-error"></div>
        </div>
        <div class="grid grid-2" style="gap:12px">
          <div class="field" data-field="session_date"><label for="c-date" class="when-label">Workout date</label>
            <input class="input" type="date" id="c-date" name="session_date" value="${defaultDate}" max="${today}" required><div class="field-error"></div></div>
          <div class="field st-active" data-field="duration_minutes"><div class="label-row"><label for="c-dur">Duration</label><span class="hint">Optional</span></div>
            <div class="input-suffix"><input class="input" type="number" id="c-dur" name="duration_minutes" inputmode="numeric" min="1" max="600" step="1" placeholder="e.g. 45" value="${c?.duration_minutes ?? ""}"><span>min</span></div>
            <div class="field-error"></div></div>
        </div>
        <div class="field st-partial" data-field="completed_item_ids">
          <div class="label-row"><span class="label">Exercises you completed</span><button type="button" class="btn btn-sm btn-ghost" id="c-all">Select all</button></div>
          <div class="checklist">${day.items.map((it) => `
            <label class="check"><input type="checkbox" name="item" value="${it.item_id}" ${c?.completed_item_ids?.includes(it.item_id) ? "checked" : ""}>
              <span><b style="font-weight:600">${esc(it.name)}</b><br><span class="hint">${it.sets} × ${esc(it.reps)}</span></span></label>`).join("")}</div>
          <div class="field-error"></div>
        </div>
        <div class="field st-skipped" data-field="skip_reason"><div class="label-row"><label for="c-reason">Reason</label><span class="hint">Optional</span></div>
          <input class="input" id="c-reason" name="skip_reason" maxlength="200" placeholder="e.g. Travelling, felt unwell, busy day" value="${esc(c?.skip_reason || "")}"><div class="field-error"></div></div>
        <div class="field st-active" data-field="notes"><div class="label-row"><label for="c-notes">Note</label><span class="hint">Optional · 280 characters</span></div>
          <textarea class="textarea" id="c-notes" name="notes" maxlength="280" placeholder="How did it feel? Any weights or PRs to remember?">${esc(c?.notes || "")}</textarea><div class="field-error"></div></div>
        <p class="hint st-active">Leave duration empty if you didn't time it — FitNova never estimates it, and the session still counts.</p>
      </form>`,
    foot: `${editing ? `<button class="btn btn-danger" id="c-remove">${icon("trash")} Remove log</button>` : ""}
           <button class="btn btn-ghost" data-close>Cancel</button>
           <button class="btn btn-primary" id="c-save">${icon("check")} ${editing ? "Save changes" : "Confirm"}</button>`,
  });
  const form = s.el.querySelector("#c-form");
  const sync = () => {
    const st = form.querySelector("[name=status]:checked").value;
    form.querySelectorAll(".st-active").forEach((n) => (n.style.display = st === "skipped" ? "none" : ""));
    form.querySelectorAll(".st-partial").forEach((n) => (n.style.display = st === "partial" ? "" : "none"));
    form.querySelectorAll(".st-skipped").forEach((n) => (n.style.display = st === "skipped" ? "" : "none"));
    form.querySelector(".when-label").textContent = st === "skipped" ? "Date skipped" : "Workout date";
  };
  form.addEventListener("change", () => { sync(); clearErrors(form); });
  sync();
  form.querySelector("#c-all").addEventListener("click", () => form.querySelectorAll("[name=item]").forEach((x) => (x.checked = true)));

  const save = async (btn) => {
    const fd = new FormData(form);
    const st = fd.get("status");
    const body = { status: st, session_date: fd.get("session_date") };
    const errs = {};
    if (!body.session_date) errs.session_date = "Choose the date.";
    else if (body.session_date > today) errs.session_date = "The date can't be in the future.";
    if (st !== "skipped") {
      const dur = (fd.get("duration_minutes") || "").trim();
      if (dur) {
        const n = Number(dur);
        if (!Number.isInteger(n) || n < 1 || n > 600) errs.duration_minutes = "Enter whole minutes between 1 and 600, or leave it empty.";
        else body.duration_minutes = n;
      }
      const notes = (fd.get("notes") || "").trim();
      if (notes) body.notes = notes;
    } else {
      const r = (fd.get("skip_reason") || "").trim();
      if (r) body.skip_reason = r;
    }
    if (st === "partial") {
      body.completed_item_ids = fd.getAll("item").map(Number);
      if (!body.completed_item_ids.length) errs.completed_item_ids = "Select at least one exercise you completed.";
    }
    if (Object.keys(errs).length) return showErrors(form, errs);
    setBusy(btn, true, "Saving…");
    try {
      if (editing) await put(`/api/completions/${c.completion_id}`, body);
      else await post(`/api/sessions/${session.session_id}/completion`, body);
      notifyChange("completions");
      toast(st === "skipped" ? "Session marked as skipped" : editing ? "Workout log updated — progress refreshed" : "Workout logged — progress updated");
      s.close();
      onSaved();
    } catch (err) {
      setBusy(btn, false);
      if (err.code === "duplicate") {
        toast("This session was already logged — opening the existing record.", "error");
        s.close();
        onSaved(session.session_id);
        return;
      }
      showErrors(form, err.fields || {}, err.message);
    }
  };
  s.el.querySelector("#c-save").addEventListener("click", (e) => save(e.currentTarget));
  s.el.querySelector("#c-remove")?.addEventListener("click", async () => {
    s.close();
    const ok = await confirmDialog({ title: "Remove this log?", message: "The session will return to “not yet logged” and will no longer count in your progress.", confirmText: "Remove log", danger: true });
    if (!ok) return;
    try {
      await del(`/api/completions/${c.completion_id}`);
      notifyChange("completions");
      toast("Log removed");
      onSaved();
    } catch (err) { toast(err.message, "error"); }
  });
}

function openSessionSheet(plan, session, reload) {
  const today = localToday();
  const ds = displayStatus(session, today);
  const day = plan.days.find((d) => d.day_number === session.day_number) || { items: [] };
  const c = session.completion;
  const done = new Set(c?.completed_item_ids || []);
  const s = openSheet({
    title: session.title,
    subtitle: `Week ${session.week_number} · Day ${session.day_number} · ${fmtDate(session.scheduled_date, { weekday: "long", month: "short", day: "numeric" })}`,
    body: `
      <div class="row" style="margin-bottom:12px"><span class="badge ${ds}">${label(ds)}</span>
        ${c ? `<span class="hint">Logged for ${fmtDate(c.session_date)}${c.duration_minutes ? ` · ${c.duration_minutes} min` : c.status !== "skipped" ? " · duration not recorded" : ""}</span>` : ""}</div>
      ${c?.notes ? `<div class="notice" style="margin-bottom:12px">${icon("edit")}<span>${esc(c.notes)}</span></div>` : ""}
      ${c?.skip_reason ? `<div class="notice warn" style="margin-bottom:12px">${icon("skip")}<span>Reason: ${esc(c.skip_reason)}</span></div>` : ""}
      <div class="card solid" style="padding:0;overflow:hidden">${day.items.map((it, i) => exerciseRow(it, i + 1, {
        extra: c?.status === "partial" ? `<div style="margin-top:8px">${done.has(it.item_id) ? `<span class="badge completed">Done</span>` : `<span class="badge upcoming">Not done</span>`}</div>` : "",
      })).join("")}</div>`,
    foot: c
      ? `<button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary" id="s-act">${icon("edit")} Edit log</button>`
      : `<button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary" id="s-act">${icon("checkCircle")} Mark Workout Complete</button>`,
  });
  s.el.querySelector("#s-act").addEventListener("click", () => { s.close(); openCompletionSheet(plan, session, reload); });
}

// ------------------------------------------------------------------ detail view
async function renderDetail(root, ctx, planId) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  let autoSession = params.get("session") ? Number(params.get("session")) : null;
  let tab = params.get("tab") || "schedule";
  let weekFilter = "all";

  const load = async (openSessionId) => {
    let plan;
    try {
      plan = (await get(`/api/plans/${planId}`)).plan;
    } catch (err) {
      if (err.status === 404) {
        root.innerHTML = `<div class="card">${emptyState({ iconName: "workout", title: "Plan not found", text: "This plan doesn't exist or was deleted.", action: `<a class="btn btn-outline" href="#/workouts">Back to My Workout</a>` })}</div>`;
      } else {
        root.innerHTML = errorCard(err);
        root.querySelector("#retry").addEventListener("click", () => load());
      }
      return;
    }
    const today = localToday();
    const weeks = [...new Set(plan.sessions.map((s) => s.week_number))];
    const sessions = plan.sessions.filter((s) => weekFilter === "all" || s.week_number === weekFilter);
    root.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="#/workouts" style="margin:-6px 0 10px -8px">${icon("chevronLeft")} My Workout</a>
      <div class="card pad-lg card-accent">
        <div class="spread" style="align-items:flex-start">
          <div style="min-width:0">
            <div class="eyebrow">Saved plan</div>
            <h1 style="font-size:clamp(24px,5vw,32px);margin-top:6px;word-break:break-word">${esc(plan.name)}</h1>
            <p class="muted" style="margin-top:6px">Starts ${fmtDate(plan.start_date)} · ${plan.weeks} week${plan.weeks > 1 ? "s" : ""} · created ${new Date(plan.created_at).toLocaleDateString()}</p>
          </div>
          <div class="row" style="flex-wrap:nowrap">
            <button class="icon-btn" id="rename" aria-label="Rename plan">${icon("edit")}</button>
            <button class="icon-btn" id="delete" aria-label="Delete plan">${icon("trash")}</button>
          </div>
        </div>
        <div class="row" style="margin:14px 0">
          <span class="badge accent plain">${label(plan.goal)}</span><span class="badge plain">${label(plan.level)}</span>
          <span class="badge plain">${plan.days_per_week} days/week</span>
          ${plan.equipment.map((e) => `<span class="badge plain">${label(e)}</span>`).join("")}
        </div>
        ${progressBar(plan.counts)}${countsLine(plan.counts)}
      </div>
      <div class="seg" role="tablist" style="margin:18px 0 14px">
        <button role="tab" class="${tab === "schedule" ? "active" : ""}" data-tab="schedule" aria-selected="${tab === "schedule"}">${icon("calendar")}&nbsp;Sessions</button>
        <button role="tab" class="${tab === "program" ? "active" : ""}" data-tab="program" aria-selected="${tab === "program"}">${icon("workout")}&nbsp;Program</button>
      </div>
      <div id="tab-body"></div>`;

    const body = root.querySelector("#tab-body");
    if (tab === "schedule") {
      body.innerHTML = `
        ${weeks.length > 1 ? `<div class="tabs-inline" style="margin-bottom:12px">
          <button class="btn btn-sm ${weekFilter === "all" ? "btn-outline" : "btn-ghost"}" data-week="all">All weeks</button>
          ${weeks.map((w) => `<button class="btn btn-sm ${weekFilter === w ? "btn-outline" : "btn-ghost"}" data-week="${w}">Week ${w}</button>`).join("")}</div>` : ""}
        <div class="stack" style="gap:10px">
          ${sessions.map((s) => {
            const ds = displayStatus(s, today);
            const d = parseDate(s.scheduled_date);
            const c = s.completion;
            return `
            <div class="session is-${s.status}">
              <div class="date-box"><small>${d.toLocaleDateString(undefined, { weekday: "short" })}</small><b>${d.getDate()}</b><small>${d.toLocaleDateString(undefined, { month: "short" })}</small></div>
              <div class="grow">
                <button class="btn-ghost" data-session="${s.session_id}" style="background:none;border:0;padding:0;cursor:pointer;text-align:left;color:inherit">
                  <b>${esc(s.title)}</b></button>
                <div class="row" style="gap:8px;margin-top:4px"><span class="badge ${ds}">${label(ds)}</span>
                  <span class="hint">Week ${s.week_number}${c && c.status !== "skipped" ? ` · ${c.duration_minutes ? `${c.duration_minutes} min` : "duration not recorded"}` : ""}${c && c.session_date !== s.scheduled_date ? ` · done ${fmtDate(c.session_date, { month: "short", day: "numeric" })}` : ""}</span></div>
              </div>
              ${c ? `<button class="btn btn-sm" data-edit="${s.session_id}" aria-label="Edit log for ${esc(s.title)}, week ${s.week_number}">${icon("edit")}<span class="hide-xs">Edit</span></button>`
                  : `<button class="btn btn-sm btn-primary" data-complete="${s.session_id}" aria-label="Mark ${esc(s.title)}, week ${s.week_number} complete">${icon("check")}<span class="hide-xs">Mark complete</span></button>`}
            </div>`;
          }).join("")}
        </div>`;
      body.querySelectorAll("[data-week]").forEach((b) => b.addEventListener("click", () => { weekFilter = b.dataset.week === "all" ? "all" : Number(b.dataset.week); load(); }));
      const find = (id) => plan.sessions.find((s) => s.session_id === Number(id));
      body.querySelectorAll("[data-session]").forEach((b) => b.addEventListener("click", () => openSessionSheet(plan, find(b.dataset.session), load)));
      body.querySelectorAll("[data-complete],[data-edit]").forEach((b) => b.addEventListener("click", () =>
        openCompletionSheet(plan, find(b.dataset.complete || b.dataset.edit), load)));
    } else {
      body.innerHTML = `<div class="stack">${notesNotice(plan.generation_notes)}
        <p class="hint">This is the weekly template. It repeats each week of the program; log each dated session from the Sessions tab.</p>
        ${plan.days.map((d) => dayCard(d)).join("")}</div>`;
    }
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; load(); }));
    root.querySelector("#rename").addEventListener("click", () => renamePlan(plan, load));
    root.querySelector("#delete").addEventListener("click", async () => { if (await deletePlan(plan)) ctx.navigate("/workouts"); });

    const target = openSessionId || autoSession;
    autoSession = null;
    if (target) {
      const s = plan.sessions.find((x) => x.session_id === target);
      if (s) (s.completion ? openCompletionSheet : openSessionSheet)(plan, s, load);
    }
  };
  await load();
}

function renamePlan(plan, reload) {
  const s = openSheet({
    title: "Rename plan",
    body: `<form id="r-form" novalidate><div class="field" data-field="name"><label for="r-name">Plan name</label>
      <input class="input" id="r-name" name="name" maxlength="80" value="${esc(plan.name)}"><div class="field-error"></div></div></form>`,
    foot: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="r-save">Save</button>`,
  });
  const form = s.el.querySelector("#r-form");
  const save = async () => {
    const name = form.querySelector("#r-name").value.trim();
    if (!name) return showErrors(form, { name: "Enter a name." });
    try {
      await patch(`/api/plans/${plan.plan_id}`, { name });
      toast("Plan renamed");
      s.close();
      reload();
    } catch (err) { showErrors(form, err.fields || {}, err.message); }
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  s.el.querySelector("#r-save").addEventListener("click", save);
}

export async function render(root, ctx) {
  if (ctx.params && ctx.params[0]) return renderDetail(root, ctx, Number(ctx.params[0]));
  return renderList(root, ctx);
}
