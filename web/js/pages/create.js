// Create Workout: validated form -> generated preview (regenerate) -> save plan.
import { get, localToday, notifyChange, post } from "../api.js";
import { clearErrors, esc, icon, label, openSheet, setBusy, showErrors, toast } from "../ui.js";
import { dayCard, notesNotice } from "../workout-ui.js";

const GOALS = [
  { v: "muscle_gain", icon: "dumbbell", d: "Build size" },
  { v: "strength", icon: "barbell", d: "Lift heavier" },
  { v: "general_fitness", icon: "body", d: "Feel fitter" },
  { v: "endurance", icon: "vitals", d: "Go longer" },
  { v: "weight_management", icon: "flame", d: "Burn & move" },
];
const LEVELS = [
  { v: "beginner", d: "New or returning" },
  { v: "intermediate", d: "6+ months training" },
  { v: "advanced", d: "2+ years, solid form" },
];
const EQUIP = [
  { v: "none", icon: "body", d: "Bodyweight only" },
  { v: "dumbbells", icon: "dumbbell", d: "A pair or set" },
  { v: "barbell", icon: "barbell", d: "Bar + plates" },
  { v: "bands", icon: "band", d: "Loop or tube bands" },
  { v: "full_gym", icon: "gym", d: "Machines, cables & more" },
];

const state = { inputs: null, preview: null };

function chip(type, name, o, checked) {
  return `<label class="chip"><input type="${type}" name="${name}" value="${o.v}" ${checked ? "checked" : ""}>
    ${o.icon ? icon(o.icon) : ""}<span class="chip-text"><b>${label(o.v)}</b><small>${o.d}</small></span></label>`;
}

function formHtml(prev) {
  const p = prev || { goal: null, level: null, equipment: [], days_per_week: null };
  return `
  <form class="card pad-lg form-card" id="gen-form" novalidate>
    <div class="field" data-field="goal">
      <span class="label step-label"><span class="n">1</span>Fitness goal</span>
      <div class="chips" role="radiogroup" aria-label="Fitness goal">${GOALS.map((o) => chip("radio", "goal", o, p.goal === o.v)).join("")}</div>
      <div class="field-error"></div>
    </div>
    <div class="field" data-field="level">
      <span class="label step-label"><span class="n">2</span>Experience level</span>
      <div class="chips" role="radiogroup" aria-label="Experience level">${LEVELS.map((o) => chip("radio", "level", o, p.level === o.v)).join("")}</div>
      <div class="field-error"></div>
    </div>
    <div class="field" data-field="equipment">
      <div class="label-row"><span class="label step-label"><span class="n">3</span>Available equipment</span><span class="hint">Select all you have</span></div>
      <div class="chips" role="group" aria-label="Available equipment">${EQUIP.map((o) => chip("checkbox", "equipment", o, p.equipment.includes(o.v))).join("")}</div>
      <p class="hint">Bodyweight moves are always included. You will never get an exercise that needs equipment you didn't select.</p>
      <div class="field-error"></div>
    </div>
    <div class="field" data-field="days_per_week">
      <div class="label-row"><span class="label step-label"><span class="n">4</span>Training days per week</span><span class="hint" id="days-hint"></span></div>
      <div class="days" role="radiogroup" aria-label="Training days per week">
        ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<label><input type="radio" name="days_per_week" value="${n}" ${p.days_per_week === n ? "checked" : ""} aria-label="${n} day${n > 1 ? "s" : ""}">${n}</label>`).join("")}
      </div>
      <div class="field-error"></div>
    </div>
    <button class="btn btn-primary btn-lg btn-block" type="submit" id="gen-btn">${icon("sparkle")} Generate my plan</button>
  </form>`;
}

function readForm(form) {
  const fd = new FormData(form);
  return {
    goal: fd.get("goal"), level: fd.get("level"), equipment: fd.getAll("equipment"),
    days_per_week: fd.get("days_per_week") ? Number(fd.get("days_per_week")) : null,
  };
}

function validate(d) {
  const e = {};
  if (!d.goal) e.goal = "Choose a fitness goal.";
  if (!d.level) e.level = "Choose your experience level.";
  if (!d.equipment.length) e.equipment = "Select at least one equipment option (choose “No Equipment” for bodyweight).";
  if (!d.days_per_week) e.days_per_week = "Choose how many days per week you can train (1–7).";
  return e;
}

function previewHtml(pv) {
  const start = localToday();
  return `
    <div class="stack" id="preview">
      <div class="card pad-lg card-accent">
        <div class="eyebrow">Generated plan · preview</div>
        <h2 style="font-size:24px;margin-top:8px">${esc(pv.suggested_name)}</h2>
        <div class="row" style="margin-top:10px">
          <span class="badge accent plain">${label(pv.goal)}</span><span class="badge plain">${label(pv.level)}</span>
          <span class="badge plain">${pv.days_per_week} day${pv.days_per_week > 1 ? "s" : ""}/week</span>
          ${pv.equipment.map((e) => `<span class="badge plain">${label(e)}</span>`).join("")}
        </div>
        <p class="hint" style="margin-top:10px">Not saved yet. Generated plans are never counted as completed workouts — only sessions you log are.</p>
        <form id="save-form" class="grid grid-3" style="margin-top:16px" novalidate>
          <div class="field" data-field="name"><label for="s-name">Plan name</label><input class="input" id="s-name" name="name" maxlength="80" value="${esc(pv.suggested_name)}"><div class="field-error"></div></div>
          <div class="field" data-field="start_date"><label for="s-start">Start date</label><input class="input" id="s-start" name="start_date" type="date" value="${start}" required><div class="field-error"></div></div>
          <div class="field" data-field="weeks"><label for="s-weeks">Program length</label>
            <select class="select" id="s-weeks" name="weeks">${[1, 2, 3, 4, 6, 8].map((w) => `<option value="${w}" ${w === 4 ? "selected" : ""}>${w} week${w > 1 ? "s" : ""} · ${w * pv.days_per_week} sessions</option>`).join("")}</select>
            <div class="field-error"></div></div>
        </form>
      </div>
      ${notesNotice(pv.notes)}
      ${pv.days.map((d) => dayCard(d)).join("")}
      <div class="sticky-actions">
        <button class="btn" id="regen-btn">${icon("refresh")} Regenerate</button>
        <button class="btn btn-primary" id="save-btn">${icon("check")} Save plan</button>
      </div>
    </div>`;
}

async function generate(root, inputs, btn) {
  setBusy(btn, true, "Generating…");
  try {
    const res = await post("/api/plans/generate", inputs);
    state.inputs = inputs;
    state.preview = res.preview;
    const box = root.querySelector("#preview-box");
    box.innerHTML = previewHtml(res.preview);
    wirePreview(root);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showErrors(root.querySelector("#gen-form"), err.fields || {}, err.message);
  } finally {
    setBusy(btn, false);
  }
}

function wirePreview(root) {
  root.querySelector("#regen-btn").addEventListener("click", (e) => {
    const { seed, ...rest } = state.inputs; // new random seed
    generate(root, rest, e.currentTarget);
  });
  root.querySelector("#save-btn").addEventListener("click", async (e) => {
    const form = root.querySelector("#save-form");
    const fd = new FormData(form);
    const body = {
      ...state.inputs, seed: state.preview.seed, name: (fd.get("name") || "").trim() || null,
      start_date: fd.get("start_date"), weeks: Number(fd.get("weeks")),
    };
    if (!body.start_date) return showErrors(form, { start_date: "Choose a start date." });
    clearErrors(form);
    const btn = e.currentTarget;
    setBusy(btn, true, "Saving…");
    try {
      const res = await post("/api/plans", body);
      notifyChange("plans");
      toast("Plan saved to My Workout");
      state.preview = null;
      location.hash = `#/workouts/${res.plan.plan_id}`;
    } catch (err) {
      setBusy(btn, false);
      showErrors(form, err.fields || {}, err.message);
    }
  });
}

async function openLibrary() {
  const s = openSheet({
    title: "Exercise library",
    subtitle: "Every exercise the generator can choose from.",
    body: `<div class="stack">
      <div class="grid grid-2" style="gap:10px">
        <input class="input" id="lib-q" placeholder="Search exercises" aria-label="Search exercises">
        <select class="select" id="lib-eq" aria-label="Filter by equipment"><option value="">All equipment</option>
          ${["none", "dumbbells", "barbell", "bands", "kettlebell", "machine", "cable", "pullup_bar"].map((e) => `<option value="${e}">${label(e)}</option>`).join("")}</select>
      </div>
      <select class="select" id="lib-m" aria-label="Filter by muscle"><option value="">All muscles</option>
        ${["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "full_body"].map((m) => `<option value="${m}">${label(m)}</option>`).join("")}</select>
      <p class="hint" id="lib-count"></p>
      <div id="lib-list" class="list"></div></div>`,
  });
  const $ = (sel) => s.el.querySelector(sel);
  let timer;
  const load = async () => {
    const q = new URLSearchParams();
    if ($("#lib-q").value.trim()) q.set("q", $("#lib-q").value.trim());
    if ($("#lib-eq").value) q.set("equipment", $("#lib-eq").value);
    if ($("#lib-m").value) q.set("muscle", $("#lib-m").value);
    try {
      const res = await get(`/api/exercises?${q}`);
      $("#lib-count").textContent = `${res.count} exercise${res.count === 1 ? "" : "s"}`;
      $("#lib-list").innerHTML = res.exercises.map((x) => `
        <div class="list-item" style="align-items:flex-start"><div class="grow">
          <div class="title" style="white-space:normal">${esc(x.name)}</div>
          <div class="ex-meta"><span class="tag">${label(x.muscle)}</span><span class="tag">${label(x.equipment)}</span><span class="tag">${label(x.level)}</span><span class="tag">${x.sets} × ${esc(x.reps)}</span></div>
          <details style="margin-top:6px"><summary class="hint" style="cursor:pointer;color:var(--accent)">Instructions</summary><p class="muted" style="font-size:13.5px;margin-top:6px">${esc(x.instructions)}</p>
          <p class="hint" style="margin-top:4px">Goals: ${x.goals.map(label).join(", ")}</p></details>
        </div></div>`).join("") || `<p class="muted" style="padding:16px 0">No exercises match these filters.</p>`;
    } catch (err) { $("#lib-list").innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
  };
  $("#lib-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 200); });
  $("#lib-eq").addEventListener("change", load);
  $("#lib-m").addEventListener("change", load);
  load();
}

export async function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Workout builder</div><h1>Create Workout</h1>
        <p>Tell FitNova what you're training for and what you have. You'll get a weekly plan you can preview, regenerate and save.</p></div>
      <button class="btn btn-outline" id="lib-btn">${icon("library")} Exercise library</button>
    </div>
    <div class="stack">
      ${formHtml(state.inputs)}
      <div id="preview-box"></div>
    </div>`;
  const form = root.querySelector("#gen-form");
  // "No Equipment" is exclusive with the other options.
  form.querySelectorAll("[name=equipment]").forEach((cb) => cb.addEventListener("change", () => {
    if (!cb.checked) return;
    if (cb.value === "none") form.querySelectorAll("[name=equipment]").forEach((o) => { if (o !== cb) o.checked = false; });
    else form.querySelector("[name=equipment][value=none]").checked = false;
    if (cb.value === "full_gym") form.querySelectorAll("[name=equipment]").forEach((o) => { if (o !== cb) o.checked = false; });
    else form.querySelector("[name=equipment][value=full_gym]").checked = false;
  }));
  const hint = root.querySelector("#days-hint");
  const splitHint = { 1: "Full body", 2: "Upper / Lower", 3: "3-way split", 4: "Upper / Lower ×2", 5: "5-day split", 6: "Push / Pull / Legs ×2", 7: "Daily, incl. recovery" };
  form.addEventListener("change", () => {
    const d = form.querySelector("[name=days_per_week]:checked");
    hint.textContent = d ? splitHint[d.value] : "";
    clearErrors(form);
  });
  form.dispatchEvent(new Event("change"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = readForm(form);
    const errs = validate(d);
    if (Object.keys(errs).length) return showErrors(form, errs);
    generate(root, d, root.querySelector("#gen-btn"));
  });
  root.querySelector("#lib-btn").addEventListener("click", openLibrary);
  if (state.preview) { root.querySelector("#preview-box").innerHTML = previewHtml(state.preview); wirePreview(root); }
  if (/[?&]library=1/.test(location.hash)) openLibrary();
}
