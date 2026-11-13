// Profile: onboarding (create) and edit. Captures name, gender, height, weight (+ optional age group) for BMI.
import { del, post, put, setToken } from "../api.js";
import { clearErrors, confirmDialog, esc, icon, label, setBusy, showErrors, toast } from "../ui.js";

const CM_PER_IN = 2.54, KG_PER_LB = 0.45359237;

export function bmiCard(bmi, { compact = false } = {}) {
  if (!bmi) {
    return `<div class="card"><div class="eyebrow">Body Mass Index</div><p class="muted" style="margin-top:8px">Add your height and weight in your profile to see your BMI.</p></div>`;
  }
  const pos = Math.max(2, Math.min(98, ((bmi.value - 14) / (40 - 14)) * 100));
  return `<div class="card card-accent">
    <div class="spread"><div class="eyebrow">Body Mass Index</div>${bmi.category ? `<span class="badge accent plain">${esc(bmi.category)}</span>` : ""}</div>
    <div class="bmi-ring" style="margin-top:10px"><div class="bmi-value num">${bmi.value}</div>
      <div class="muted" style="font-size:13px">kg/m²${bmi.range ? `<br>WHO adult range ${esc(bmi.range)}` : ""}</div></div>
    ${bmi.category ? `<div class="bmi-scale" aria-hidden="true"><i style="left:${pos}%"></i></div>
      <div class="bmi-ticks" aria-hidden="true"><span>14</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div>` : ""}
    ${compact ? "" : `<p class="hint" style="margin-top:12px">${esc(bmi.note)}</p>`}
  </div>`;
}

function formHtml(u, onboarding) {
  const unit = u?.unit_system || "metric";
  const h = u?.height_cm, w = u?.weight_kg;
  const ft = h ? Math.floor(h / CM_PER_IN / 12) : "", inch = h ? Math.round((h / CM_PER_IN) % 12) : "";
  const gender = (val, text) => `<label class="chip"><input type="radio" name="gender" value="${val}" ${u?.gender === val ? "checked" : ""}><span class="chip-text"><b>${text}</b></span></label>`;
  const band = (val, text) => `<label><input type="radio" name="age_band" value="${val}" ${u?.age_band === val ? "checked" : ""}>${text}</label>`;
  return `
  <form class="card pad-lg form-card" id="profile-form" novalidate>
    <div class="field" data-field="name">
      <label for="p-name">Your name</label>
      <input class="input" id="p-name" name="name" maxlength="60" autocomplete="given-name" placeholder="e.g. Alex" value="${esc(u?.name || "")}" required>
      <div class="field-error"></div>
    </div>
    <div class="field" data-field="gender">
      <span class="label" id="g-label">Gender</span>
      <div class="chips" role="radiogroup" aria-labelledby="g-label" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
        ${gender("female", "Female")}${gender("male", "Male")}${gender("non_binary", "Non-binary")}${gender("prefer_not_to_say", "Prefer not to say")}
      </div>
      <div class="field-error"></div>
    </div>
    <div class="field">
      <div class="label-row"><span class="label">Units</span></div>
      <div class="seg" role="radiogroup" aria-label="Units">
        <label><input type="radio" name="unit_system" value="metric" ${unit === "metric" ? "checked" : ""}>Metric (cm, kg)</label>
        <label><input type="radio" name="unit_system" value="imperial" ${unit === "imperial" ? "checked" : ""}>Imperial (ft, lb)</label>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="field" data-field="height_cm">
        <label for="p-h-cm">Height</label>
        <div class="metric-only input-suffix"><input class="input" id="p-h-cm" name="height_cm" type="number" inputmode="decimal" min="50" max="272" step="0.1" placeholder="175" value="${h ?? ""}"><span>cm</span></div>
        <div class="imperial-only row" style="flex-wrap:nowrap">
          <div class="input-suffix" style="flex:1"><input class="input" name="height_ft" type="number" inputmode="numeric" min="1" max="8" placeholder="5" value="${ft}" aria-label="Height feet"><span>ft</span></div>
          <div class="input-suffix" style="flex:1"><input class="input" name="height_in" type="number" inputmode="numeric" min="0" max="11" placeholder="9" value="${inch}" aria-label="Height inches"><span>in</span></div>
        </div>
        <div class="field-error"></div>
      </div>
      <div class="field" data-field="weight_kg">
        <label for="p-w">Weight</label>
        <div class="input-suffix"><input class="input" id="p-w" name="weight" type="number" inputmode="decimal" step="0.1" placeholder="${unit === "metric" ? "70" : "155"}" value="${w ? (unit === "metric" ? w : Math.round((w / KG_PER_LB) * 10) / 10) : ""}"><span class="w-unit">${unit === "metric" ? "kg" : "lb"}</span></div>
        <div class="field-error"></div>
      </div>
    </div>
    <div class="field" data-field="age_band">
      <div class="label-row"><span class="label">Age group</span><span class="hint">Optional</span></div>
      <div class="seg" role="radiogroup" aria-label="Age group">${band("adult", "18 or older")}${band("under_18", "Under 18")}${band("prefer_not_to_say", "Prefer not to say")}</div>
      <p class="hint">Only used so adult BMI categories are never applied to under-18s. We don't ask for your birth date.</p>
      <div class="field-error"></div>
    </div>
    <div class="field" data-field="temp_unit">
      <span class="label">Temperature unit for Vitals</span>
      <div class="seg" role="radiogroup" aria-label="Temperature unit">
        <label><input type="radio" name="temp_unit" value="C" ${(u?.temp_unit || "C") === "C" ? "checked" : ""}>°C</label>
        <label><input type="radio" name="temp_unit" value="F" ${u?.temp_unit === "F" ? "checked" : ""}>°F</label>
      </div>
    </div>
    <div id="bmi-preview"></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit" id="p-save">${onboarding ? `Create my profile ${icon("arrowRight")}` : `${icon("check")} Save changes`}</button>
  </form>`;
}

function readForm(form) {
  const fd = new FormData(form);
  const unit = fd.get("unit_system") || "metric";
  let height = null, weight = null;
  if (unit === "metric") {
    height = fd.get("height_cm") ? Number(fd.get("height_cm")) : null;
  } else if (fd.get("height_ft") || fd.get("height_in")) {
    height = Math.round((Number(fd.get("height_ft") || 0) * 12 + Number(fd.get("height_in") || 0)) * CM_PER_IN * 10) / 10;
  }
  if (fd.get("weight")) weight = unit === "metric" ? Number(fd.get("weight")) : Math.round(Number(fd.get("weight")) * KG_PER_LB * 10) / 10;
  return {
    name: (fd.get("name") || "").trim(), gender: fd.get("gender"), height_cm: height, weight_kg: weight,
    age_band: fd.get("age_band"), unit_system: unit, temp_unit: fd.get("temp_unit") || "C",
  };
}

function validate(d) {
  const e = {};
  if (!d.name) e.name = "Please enter your name.";
  if (!d.gender) e.gender = "Please choose an option (you can pick “Prefer not to say”).";
  if (!d.height_cm) e.height_cm = "Height is needed to calculate BMI.";
  else if (isNaN(d.height_cm) || d.height_cm < 50 || d.height_cm > 272) e.height_cm = "Please enter a realistic height (50–272 cm / 1 ft 8 in – 8 ft 11 in).";
  if (!d.weight_kg) e.weight_kg = "Weight is needed to calculate BMI.";
  else if (isNaN(d.weight_kg) || d.weight_kg < 20 || d.weight_kg > 400) e.weight_kg = "Please enter a realistic weight (20–400 kg / 44–880 lb).";
  return e;
}

function wire(form, ctx, onboarding) {
  const sync = () => {
    const unit = form.querySelector("[name=unit_system]:checked").value;
    form.querySelectorAll(".metric-only").forEach((n) => (n.style.display = unit === "metric" ? "" : "none"));
    form.querySelectorAll(".imperial-only").forEach((n) => (n.style.display = unit === "imperial" ? "" : "none"));
    form.querySelector(".w-unit").textContent = unit === "metric" ? "kg" : "lb";
    const d = readForm(form);
    const box = form.querySelector("#bmi-preview");
    if (d.height_cm >= 50 && d.weight_kg >= 20 && d.height_cm <= 272 && d.weight_kg <= 400) {
      const v = Math.round((d.weight_kg / (d.height_cm / 100) ** 2) * 10) / 10;
      box.innerHTML = `<div class="notice">${icon("ruler")}<span>Your BMI will be <b class="num">${v}</b>. BMI is a screening estimate only — it doesn't measure body composition or health.</span></div>`;
    } else box.innerHTML = "";
  };
  // Convert entered values when the unit system flips, so nothing typed is lost.
  let lastUnit = form.querySelector("[name=unit_system]:checked").value;
  form.querySelectorAll("[name=unit_system]").forEach((r) => r.addEventListener("change", () => {
    const next = form.querySelector("[name=unit_system]:checked").value;
    const wIn = form.querySelector("[name=weight]");
    if (lastUnit !== next) {
      if (lastUnit === "metric") {
        const cm = Number(form.querySelector("[name=height_cm]").value);
        if (cm) { const tin = cm / CM_PER_IN; form.querySelector("[name=height_ft]").value = Math.floor(tin / 12); form.querySelector("[name=height_in]").value = Math.round(tin % 12); }
        if (wIn.value) wIn.value = Math.round((Number(wIn.value) / KG_PER_LB) * 10) / 10;
      } else {
        const ftv = Number(form.querySelector("[name=height_ft]").value || 0), inv = Number(form.querySelector("[name=height_in]").value || 0);
        if (ftv || inv) form.querySelector("[name=height_cm]").value = Math.round((ftv * 12 + inv) * CM_PER_IN * 10) / 10;
        if (wIn.value) wIn.value = Math.round(Number(wIn.value) * KG_PER_LB * 10) / 10;
      }
    }
    lastUnit = next;
    sync();
  }));
  form.addEventListener("input", sync);
  sync();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = readForm(form);
    const errs = validate(d);
    if (Object.keys(errs).length) return showErrors(form, errs);
    clearErrors(form);
    const btn = form.querySelector("#p-save");
    setBusy(btn, true, onboarding ? "Creating…" : "Saving…");
    try {
      if (onboarding) {
        const res = await post("/api/users", d);
        ctx.setUser(res.user, res.token);
        toast(`Welcome to FitNova, ${res.user.name}!`);
        ctx.navigate("/");
      } else {
        const res = await put("/api/me", d);
        ctx.setUser(res.user);
        toast("Profile updated");
        render(document.getElementById("view"), ctx);
      }
    } catch (err) {
      setBusy(btn, false);
      showErrors(form, err.fields || {}, err.message);
    }
  });
}

export async function render(root, ctx) {
  const onboarding = !!ctx.route.onboarding;
  if (onboarding) {
    root.innerHTML = `
      <div style="max-width:620px;margin:0 auto" class="stack">
        <div style="text-align:center;padding:10px 0 4px">
          <div class="brand-mark" style="width:60px;height:60px;border-radius:18px;margin:0 auto 16px">${icon("logo")}</div>
          <div class="eyebrow">Personal Fitness Intelligence</div>
          <h1 style="font-size:clamp(28px,6vw,38px);margin-top:10px">Welcome to FitNova</h1>
          <p class="muted" style="margin-top:8px">Set up your profile to build personalised workout plans and track your progress. Your data is stored in this app's own database and is only accessible from this profile.</p>
        </div>
        ${formHtml(null, true)}
        <p class="hint" style="text-align:center">Want to look around first? <a href="#/about">Read about FitNova</a>.</p>
      </div>`;
    wire(root.querySelector("#profile-form"), ctx, true);
    return;
  }
  const u = ctx.user || (await ctx.refreshUser());
  if (!u) { ctx.navigate("/welcome"); return; }
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Account</div><h1>Your profile</h1><p>Update your details at any time. BMI recalculates automatically.</p></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));align-items:start">
      ${formHtml(u, false)}
      <div class="stack">
        ${bmiCard(u.bmi)}
        <div class="card">
          <div class="card-title">Profile summary</div>
          <div class="list" style="margin-top:6px">
            <div class="list-item"><span class="grow muted">Gender</span><b>${esc(label(u.gender))}</b></div>
            <div class="list-item"><span class="grow muted">Age group</span><b>${u.age_band ? esc(label(u.age_band)) : "Not set"}</b></div>
            <div class="list-item"><span class="grow muted">Member since</span><b>${new Date(u.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric", day: "numeric" })}</b></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Privacy & data</div>
          <p class="card-sub" style="margin-top:6px">Your workouts, completions and vitals are linked to this profile and are only returned to requests carrying this device's private profile key. Deleting your profile permanently removes all of it.</p>
          <button class="btn btn-danger btn-block" id="delete-profile" style="margin-top:14px">${icon("trash")} Delete profile and all data</button>
        </div>
      </div>
    </div>`;
  wire(root.querySelector("#profile-form"), ctx, false);
  root.querySelector("#delete-profile").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete your profile?",
      message: "This permanently deletes your profile, all workout plans, completion history and vitals records. This cannot be undone.",
      confirmText: "Delete everything", danger: true,
    });
    if (!ok) return;
    try {
      await del("/api/me");
      setToken(null);
      ctx.setUser(null, null);
      toast("Profile and data deleted");
      ctx.navigate("/welcome");
    } catch (err) { toast(err.message, "error"); }
  });
}
