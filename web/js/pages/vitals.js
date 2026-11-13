// Vitals: manual log of heart rate, blood pressure, SpO2 and temperature. Informational only — no interpretation.
import { del, get, notifyChange, post, put } from "../api.js";
import { clearErrors, confirmDialog, emptyState, errorCard, esc, fmtDateTime, icon, localInputToIso, openSheet, setBusy, showErrors, toast, toLocalInput } from "../ui.js";
import { timeSeries } from "../charts.js";

const TYPES = ["heart_rate", "blood_pressure", "spo2", "temperature"];
const META = {
  heart_rate: { name: "Resting heart rate", short: "Heart rate", icon: "heart", unit: "bpm", lo: 25, hi: 250 },
  blood_pressure: { name: "Blood pressure", short: "Blood pressure", icon: "gauge", unit: "mmHg", lo: 60, hi: 260 },
  spo2: { name: "SpO₂", short: "SpO₂", icon: "drop", unit: "%", lo: 50, hi: 100 },
  temperature: { name: "Temperature", short: "Temperature", icon: "thermo", unit: "C", lo: 30, hi: 45 },
};
const TEMP_BOUNDS = { C: [30, 45], F: [86, 113] };
const DIA_BOUNDS = [30, 160];
const RANGES = [["7", "7d", 7], ["30", "30d", 30], ["90", "90d", 90], ["365", "1y", 365], ["all", "All", null]];
const PRO_LINE = "FitNova doesn't interpret readings or give treatment or medication advice. Discuss any concerning readings with a qualified healthcare professional.";

// ------------------------------------------------------------------ helpers
const round1 = (n) => Math.round(n * 10) / 10;
function convertTemp(v, from, to) {
  if (from === to) return v;
  return round1(from === "C" ? (v * 9) / 5 + 32 : ((v - 32) * 5) / 9);
}
function valueText(r) {
  if (r.measurement_type === "blood_pressure") return `${r.value}/${r.secondary_value} mmHg`;
  if (r.measurement_type === "spo2") return `${r.value}%`;
  if (r.measurement_type === "temperature") return `${r.value} °${r.unit}`;
  return `${r.value} bpm`;
}
function kpiValue(r) {
  if (r.measurement_type === "blood_pressure") return `${r.value}/${r.secondary_value}<small>mmHg</small>`;
  if (r.measurement_type === "spo2") return `${r.value}<small>%</small>`;
  if (r.measurement_type === "temperature") return `${r.value}<small>°${r.unit}</small>`;
  return `${r.value}<small>bpm</small>`;
}
function fromIso(days) {
  if (!days) return null;
  return localInputToIso(toLocalInput(new Date(Date.now() - days * 86400000).toISOString()));
}
function truncate(s, n = 70) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
const rangeDays = (key) => RANGES.find((r) => r[0] === key)[2];
const rangeLabel = (key) => ({ 7: "the last 7 days", 30: "the last 30 days", 90: "the last 90 days", 365: "the last year", all: "all time" }[key]);

// ------------------------------------------------------------------ add / edit sheet
function openVitalSheet({ record = null, type = null, tempUnit = "C", onSaved }) {
  const editing = !!record;
  let mtype = record ? record.measurement_type : type || "heart_rate";
  let tUnit = record && record.measurement_type === "temperature" ? record.unit : tempUnit;
  const nowLocal = toLocalInput();

  const typeChips = TYPES.map((t) => `
    <label class="chip"><input type="radio" name="mtype" value="${t}" ${t === mtype ? "checked" : ""}>
      ${icon(META[t].icon)}<span class="chip-text"><b>${esc(META[t].short)}</b></span></label>`).join("");

  const body = `
    <form id="vital-form" novalidate>
      <div class="stack" style="gap:16px">
        <div class="field" data-field="measurement_type">
          <span class="label" id="vt-label">Measurement</span>
          <div class="chips" role="radiogroup" aria-labelledby="vt-label" style="grid-template-columns:repeat(2,minmax(0,1fr))">${typeChips}</div>
          <div class="field-error"></div>
        </div>
        <div class="field" data-field="recorded_at">
          <label for="v-when">Date and time</label>
          <input class="input" id="v-when" name="recorded_at" type="datetime-local" max="${nowLocal}" value="${record ? toLocalInput(record.recorded_at) : nowLocal}" required>
          <div class="field-error"></div>
        </div>
        <div id="v-fields" class="stack" style="gap:16px"></div>
        <div class="field" data-field="notes">
          <div class="label-row"><label for="v-notes">Note</label><span class="hint">Optional</span></div>
          <textarea class="textarea" id="v-notes" name="notes" rows="2" maxlength="280" placeholder="e.g. after a walk, resting on the sofa">${esc(record?.notes || "")}</textarea>
          <div class="field-error"></div>
        </div>
        <div>
          <p class="hint">All fields are optional to record — only add what you have measured.</p>
          <p class="hint" style="font-size:12px;margin-top:4px">${PRO_LINE}</p>
        </div>
      </div>
    </form>`;
  const sheet = openSheet({
    title: editing ? "Edit measurement" : "Add measurement",
    subtitle: "Manual entry — type in what your own device or clinician gave you.",
    body,
    foot: `<button class="btn btn-ghost" type="button" data-close>Cancel</button>
           <button class="btn btn-primary" type="button" id="v-save">${icon("check")} ${editing ? "Save changes" : "Save measurement"}</button>`,
  });
  const form = sheet.el.querySelector("#vital-form");
  const fieldsBox = form.querySelector("#v-fields");

  const numInput = (id, name, ph, val, step = "1", suffix) =>
    `<div class="input-suffix"><input class="input" id="${id}" name="${name}" type="number" inputmode="decimal" step="${step}" placeholder="${ph}" value="${val ?? ""}"><span>${suffix}</span></div>`;

  function renderFields(prefill) {
    const r = prefill;
    let html = "";
    if (mtype === "heart_rate") {
      html = `<div class="field" data-field="value"><label for="v-val">Resting heart rate (bpm)</label>${numInput("v-val", "value", "e.g. 62", r?.value, "1", "bpm")}<div class="field-error"></div></div>`;
    } else if (mtype === "blood_pressure") {
      html = `<div class="grid grid-2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="field" data-field="value"><label for="v-val">Systolic (mmHg)</label>${numInput("v-val", "value", "e.g. 120", r?.value, "1", "mmHg")}<div class="field-error"></div></div>
        <div class="field" data-field="secondary_value"><label for="v-dia">Diastolic (mmHg)</label>${numInput("v-dia", "secondary_value", "e.g. 80", r?.secondary_value, "1", "mmHg")}<div class="field-error"></div></div>
      </div>`;
    } else if (mtype === "spo2") {
      html = `<div class="field" data-field="value"><label for="v-val">SpO₂ (%)</label>${numInput("v-val", "value", "e.g. 97", r?.value, "1", "%")}<div class="field-error"></div></div>`;
    } else {
      html = `<div class="field" data-field="value"><label for="v-val">Temperature (°${tUnit})</label>${numInput("v-val", "value", tUnit === "C" ? "e.g. 36.8" : "e.g. 98.2", r?.value, "0.1", "°" + tUnit)}<div class="field-error"></div></div>
        <div class="field" data-field="unit"><span class="label">Unit</span>
          <div class="seg" role="radiogroup" aria-label="Temperature unit">
            <label><input type="radio" name="tunit" value="C" ${tUnit === "C" ? "checked" : ""}>°C</label>
            <label><input type="radio" name="tunit" value="F" ${tUnit === "F" ? "checked" : ""}>°F</label>
          </div><div class="field-error"></div></div>`;
    }
    fieldsBox.innerHTML = html;
  }
  renderFields(record && record.measurement_type === mtype ? record : null);

  form.addEventListener("change", (e) => {
    if (e.target.name === "mtype") { mtype = e.target.value; clearErrors(form); renderFields(record && record.measurement_type === mtype ? record : null); }
    else if (e.target.name === "tunit") {
      const inp = form.querySelector("#v-val");
      const next = e.target.value;
      if (inp && inp.value !== "" && !isNaN(Number(inp.value)) && next !== tUnit) inp.value = convertTemp(Number(inp.value), tUnit, next);
      tUnit = next;
      const lab = form.querySelector('label[for="v-val"]');
      lab.textContent = `Temperature (°${tUnit})`;
      inp.placeholder = tUnit === "C" ? "e.g. 36.8" : "e.g. 98.2";
      inp.nextElementSibling.textContent = "°" + tUnit;
    }
  });

  const plaus = (lo, hi, unit) => `That looks outside the plausible range for a typo check (${lo}–${hi} ${unit}). Please double-check the reading.`;
  function collect() {
    const errs = {};
    const when = form.querySelector("#v-when").value;
    const iso = when ? localInputToIso(when) : null;
    if (!iso) errs.recorded_at = "Please choose the date and time of the reading.";
    else if (new Date(when) > new Date(Date.now() + 60000)) errs.recorded_at = "The reading can't be dated in the future.";
    const valRaw = (form.querySelector("#v-val").value || "").trim();
    let value = null, secondary = null, unit = META[mtype].unit;
    const label = { heart_rate: "resting heart rate", blood_pressure: "systolic value", spo2: "SpO₂", temperature: "temperature" }[mtype];
    if (valRaw === "" || isNaN(Number(valRaw))) errs.value = `Please enter the ${label} as a number.`;
    else {
      value = Number(valRaw);
      if (mtype === "temperature") unit = tUnit;
      const [lo, hi] = mtype === "temperature" ? TEMP_BOUNDS[tUnit] : [META[mtype].lo, META[mtype].hi];
      if (value < lo || value > hi) errs.value = plaus(lo, hi, mtype === "temperature" ? "°" + tUnit : unit);
    }
    if (mtype === "blood_pressure") {
      const dRaw = (form.querySelector("#v-dia").value || "").trim();
      if (dRaw === "" || isNaN(Number(dRaw))) errs.secondary_value = "Please enter the diastolic value as a number.";
      else {
        secondary = Number(dRaw);
        if (secondary < DIA_BOUNDS[0] || secondary > DIA_BOUNDS[1]) errs.secondary_value = plaus(DIA_BOUNDS[0], DIA_BOUNDS[1], "mmHg");
        else if (value !== null && !errs.value && secondary >= value) errs.secondary_value = "Diastolic must be lower than systolic — please check the reading.";
      }
    }
    const notes = form.querySelector("#v-notes").value.trim();
    if (notes.length > 280) errs.notes = "Notes can be up to 280 characters.";
    const payload = { measurement_type: mtype, value, unit, recorded_at: iso, notes };
    if (mtype === "blood_pressure") payload.secondary_value = secondary;
    return { errs, payload };
  }

  const btn = sheet.el.querySelector("#v-save");
  async function submit() {
    const { errs, payload } = collect();
    if (Object.keys(errs).length) return showErrors(form, errs);
    clearErrors(form);
    setBusy(btn, true, "Saving…");
    try {
      if (editing) await put(`/api/vitals/${record.vital_id}`, payload);
      else await post("/api/vitals", payload);
      notifyChange("vitals");
      toast(editing ? "Measurement updated" : "Measurement saved");
      sheet.close();
      onSaved && onSaved(mtype);
    } catch (err) {
      setBusy(btn, false);
      showErrors(form, err.fields || {}, err.message);
    }
  }
  btn.addEventListener("click", submit);
  form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
}

// ------------------------------------------------------------------ page
export async function render(root, ctx) {
  const user = ctx.user || {};
  const tempUnit = user.temp_unit === "F" ? "F" : "C";
  const under18 = user.age_band === "under_18";
  const state = { trend: "heart_rate", hist: "all", range: "30" };
  const disconnects = [];
  const tokens = { latest: 0, trend: 0, hist: 0 };
  let histRecords = new Map();
  let alive = true;
  const stopCharts = () => { while (disconnects.length) { try { disconnects.pop()(); } catch { /* noop */ } } };

  root.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Health measurements</div><h1>Vitals</h1>
        <p>Keep a personal log of readings you measured yourself and watch how they change over time.</p></div>
      <button class="btn btn-primary" id="add-vital">${icon("plus")} Add measurement</button>
    </div>
    <div class="stack" style="gap:18px">
      <div class="notice" role="note">${icon("info")}<span>
        <b>For information only — not a diagnosis.</b> FitNova doesn't interpret readings, give treatment or medication advice. Discuss any concerning readings with a qualified healthcare professional, and seek urgent care in an emergency.
        <br><b>Manual entry</b> — FitNova does not connect to devices or measure anything automatically.${under18 ? "<br>Adult reference values don't apply to young people, and FitNova shows none." : ""}</span></div>
      <div class="grid grid-4" id="latest"></div>
      <div class="card">
        <div class="spread" style="align-items:flex-start;flex-wrap:wrap">
          <div><div class="card-title">Trends</div><p class="card-sub" id="trend-sub"></p></div>
        </div>
        <div class="stack" style="gap:10px;margin:12px 0">
          <div class="seg" id="trend-type" role="group" aria-label="Measurement type">${TYPES.map((t) => `<button type="button" data-type="${t}">${esc(META[t].short)}</button>`).join("")}</div>
          <div class="seg range-seg" role="group" aria-label="Date range">${RANGES.map((r) => `<button type="button" data-range="${r[0]}">${r[1]}</button>`).join("")}</div>
        </div>
        <div id="trend-body"></div>
      </div>
      <div class="card">
        <div class="card-title">History</div>
        <div class="stack" style="gap:10px;margin:12px 0 4px">
          <div class="seg" id="hist-type" role="group" aria-label="Filter history by type"><button type="button" data-htype="all">All</button>${TYPES.map((t) => `<button type="button" data-htype="${t}">${esc(META[t].short)}</button>`).join("")}</div>
          <div class="seg range-seg" role="group" aria-label="Date range for history">${RANGES.map((r) => `<button type="button" data-range="${r[0]}">${r[1]}</button>`).join("")}</div>
        </div>
        <div id="hist-body"></div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const syncControls = () => {
    root.querySelectorAll("[data-type]").forEach((b) => b.classList.toggle("active", b.dataset.type === state.trend));
    root.querySelectorAll("[data-htype]").forEach((b) => b.classList.toggle("active", b.dataset.htype === state.hist));
    root.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("active", b.dataset.range === state.range));
  };

  const openAdd = (type) => openVitalSheet({ type, tempUnit, onSaved: reloadAll });

  // ---------- latest
  async function loadLatest() {
    const tk = ++tokens.latest;
    const box = $("#latest");
    box.innerHTML = TYPES.map(() => `<div class="skeleton" style="height:118px"></div>`).join("");
    try {
      const { latest } = await get("/api/vitals/latest");
      if (!alive || tk !== tokens.latest) return;
      box.innerHTML = TYPES.map((t) => {
        const r = latest[t], m = META[t];
        if (!r) {
          return `<div class="kpi"><div class="kpi-label">${icon(m.icon)}${esc(m.name)}</div>
            <div class="kpi-value" style="font-size:18px;color:var(--text-2)">No reading yet</div>
            <button class="btn btn-sm btn-outline" style="margin-top:10px" data-add="${t}">${icon("plus")} Add</button></div>`;
        }
        return `<div class="kpi glow interactive" role="button" tabindex="0" data-pick="${t}" style="cursor:pointer" aria-label="Show ${esc(m.name)} trend">
          <div class="kpi-label">${icon(m.icon)}${esc(m.name)}</div>
          <div class="kpi-value num">${kpiValue(r)}</div>
          <div class="kpi-foot">${esc(fmtDateTime(r.recorded_at))}</div></div>`;
      }).join("");
      box.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => openAdd(b.dataset.add)));
      box.querySelectorAll("[data-pick]").forEach((c) => {
        const pick = () => { state.trend = state.hist = c.dataset.pick; syncControls(); loadTrend(); loadHist(); $("#trend-type").scrollIntoView({ behavior: "smooth", block: "center" }); };
        c.addEventListener("click", pick);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      });
    } catch (err) {
      if (!alive || tk !== tokens.latest) return;
      box.style.display = "block";
      box.innerHTML = errorCard(err, "retry-latest");
      box.querySelector("#retry-latest").addEventListener("click", () => { box.style.display = ""; loadLatest(); });
    }
  }

  // ---------- trends
  async function loadTrend() {
    const tk = ++tokens.trend;
    stopCharts();
    const body = $("#trend-body");
    const t = state.trend;
    $("#trend-sub").textContent = `${META[t].name} · ${rangeLabel(state.range)}`;
    body.innerHTML = `<div class="skeleton" style="height:240px"></div>`;
    try {
      const from = fromIso(rangeDays(state.range));
      const q = `/api/vitals?type=${t}${from ? `&from=${encodeURIComponent(from)}` : ""}`;
      const { records } = await get(q);
      if (!alive || tk !== tokens.trend) return;
      if (!records.length) {
        body.innerHTML = emptyState({ iconName: META[t].icon, title: "No readings in this range", text: "Only readings you've entered are shown — FitNova never fills in missing readings. Try a longer range or add a measurement." });
        return;
      }
      const isTemp = t === "temperature";
      const conv = (r) => (isTemp ? convertTemp(r.value, r.unit, tempUnit) : r.value);
      let series, unitLabel, yLabel;
      if (t === "blood_pressure") {
        series = [
          { name: "Systolic", color: "#2EE6FF", points: records.map((r) => ({ t: new Date(r.recorded_at), v: r.value, raw: r })) },
          { name: "Diastolic", color: "#3B8BFF", points: records.map((r) => ({ t: new Date(r.recorded_at), v: r.secondary_value, raw: r })) },
        ];
        unitLabel = "mmHg"; yLabel = "Blood pressure (mmHg)";
      } else {
        unitLabel = t === "heart_rate" ? "bpm" : t === "spo2" ? "%" : `°${tempUnit}`;
        yLabel = isTemp ? `Temperature (°${tempUnit})` : t === "heart_rate" ? "Heart rate (bpm)" : "SpO₂ (%)";
        series = [{ name: META[t].name, color: "#2EE6FF", points: records.map((r) => ({ t: new Date(r.recorded_at), v: conv(r), raw: r })) }];
      }
      const legend = t === "blood_pressure"
        ? `<div class="legend" style="margin-bottom:8px"><span><i class="line" style="background:#2EE6FF"></i>Systolic</span><span><i class="line" style="background:#3B8BFF"></i>Diastolic</span></div>` : "";
      const hint = isTemp ? `<p class="hint" style="margin-top:8px">Readings entered in °${tempUnit === "C" ? "F" : "C"} are converted for display in °${tempUnit}.</p>` : "";
      body.innerHTML = `${legend}<div id="trend-chart" style="width:100%"></div>${hint}
        <p class="hint" style="margin-top:6px">${records.length} reading${records.length === 1 ? "" : "s"}. Gaps between points mean nothing was recorded — they aren't filled in.</p>`;
      const dc = timeSeries(body.querySelector("#trend-chart"), series, {
        unit: unitLabel, yLabel, minSpan: isTemp ? 1 : 4,
        tooltip: (s, p) => {
          const r = p.raw;
          const orig = isTemp && r.unit !== tempUnit ? `<br>Entered as ${esc(r.value)} °${esc(r.unit)}` : "";
          const label = t === "blood_pressure" ? `${esc(s.name)} ` : "";
          const unitTxt = unitLabel === "%" ? "%" : ` ${esc(unitLabel)}`;
          return `<b>${label}${esc(p.v)}${unitTxt}</b>${esc(fmtDateTime(r.recorded_at))}${r.notes ? `<br>${esc(truncate(r.notes, 90))}` : ""}${orig}`;
        },
      });
      disconnects.push(dc);
    } catch (err) {
      if (!alive || tk !== tokens.trend) return;
      body.innerHTML = errorCard(err, "retry-trend");
      body.querySelector("#retry-trend").addEventListener("click", loadTrend);
    }
  }

  // ---------- history
  async function loadHist() {
    const tk = ++tokens.hist;
    const body = $("#hist-body");
    body.innerHTML = `<div class="skeleton" style="height:64px;margin:10px 0"></div><div class="skeleton" style="height:64px;margin:10px 0"></div><div class="skeleton" style="height:64px;margin:10px 0"></div>`;
    try {
      const from = fromIso(rangeDays(state.range));
      const params = [];
      if (state.hist !== "all") params.push(`type=${state.hist}`);
      if (from) params.push(`from=${encodeURIComponent(from)}`);
      const { records } = await get(`/api/vitals${params.length ? "?" + params.join("&") : ""}`);
      if (!alive || tk !== tokens.hist) return;
      if (!records.length) {
        body.innerHTML = emptyState({ iconName: "vitals", title: "No measurements here", text: `Nothing recorded for ${state.hist === "all" ? "any measurement" : esc(META[state.hist].name.toLowerCase())} in ${rangeLabel(state.range)}. Add a reading you've measured yourself.`, action: `<button class="btn btn-primary" id="empty-add">${icon("plus")} Add measurement</button>` });
        body.querySelector("#empty-add").addEventListener("click", () => openAdd(state.hist === "all" ? null : state.hist));
        return;
      }
      histRecords = new Map(records.map((r) => [String(r.vital_id), r]));
      const shown = records.slice(0, 100);
      body.innerHTML = `<div class="list">${shown.map((r) => `
        <div class="list-item">
          <span class="f-icon" style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none">${icon(META[r.measurement_type].icon)}</span>
          <div class="grow">
            <div class="row" style="gap:8px;flex-wrap:nowrap"><span class="title num" style="white-space:nowrap">${esc(valueText(r))}</span><span class="tag" style="font-size:11px;padding:1px 7px">Manual</span></div>
            <div class="sub">${esc(META[r.measurement_type].name)} · ${esc(fmtDateTime(r.recorded_at))}</div>
            ${r.notes ? `<div class="sub" style="word-break:break-word">${esc(truncate(r.notes))}</div>` : ""}
          </div>
          <button class="icon-btn" data-edit="${esc(r.vital_id)}" aria-label="Edit measurement">${icon("edit")}</button>
          <button class="icon-btn" data-del="${esc(r.vital_id)}" aria-label="Delete measurement">${icon("trash")}</button>
        </div>`).join("")}</div>
        ${records.length > shown.length ? `<p class="hint" style="margin-top:10px">Showing the latest ${shown.length} of ${records.length} readings — narrow the date range to see others.</p>` : ""}`;
      body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
        openVitalSheet({ record: histRecords.get(b.dataset.edit), tempUnit, onSaved: reloadAll });
      }));
      body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        const r = histRecords.get(b.dataset.del);
        const ok = await confirmDialog({
          title: "Delete this measurement?",
          message: `This permanently removes the ${esc(META[r.measurement_type].name.toLowerCase())} reading of ${esc(valueText(r))} from ${esc(fmtDateTime(r.recorded_at))}. This cannot be undone.`,
          confirmText: "Delete", danger: true,
        });
        if (!ok) return;
        try {
          await del(`/api/vitals/${r.vital_id}`);
          notifyChange("vitals");
          toast("Measurement deleted");
          reloadAll();
        } catch (err) { toast(err.message, "error"); }
      }));
    } catch (err) {
      if (!alive || tk !== tokens.hist) return;
      body.innerHTML = errorCard(err, "retry-hist");
      body.querySelector("#retry-hist").addEventListener("click", loadHist);
    }
  }

  function reloadAll() { loadLatest(); loadTrend(); loadHist(); }

  // ---------- wiring
  $("#add-vital").addEventListener("click", () => openAdd(null));
  $("#trend-type").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]"); if (!b || b.dataset.type === state.trend) return;
    state.trend = b.dataset.type; syncControls(); loadTrend();
  });
  $("#hist-type").addEventListener("click", (e) => {
    const b = e.target.closest("[data-htype]"); if (!b || b.dataset.htype === state.hist) return;
    state.hist = b.dataset.htype; syncControls(); loadHist();
  });
  root.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.range === state.range) return;
    state.range = b.dataset.range; syncControls(); loadTrend(); loadHist();
  }));

  syncControls();
  reloadAll();

  return () => { alive = false; stopCharts(); };
}
