// About: static explanation of what FitNova is, how its features work, and its limits. Works logged out.
import { icon } from "../ui.js";

const FEATURES = [
  { icon: "sliders", title: "Workout generator", text: "Builds a weekly plan from your goal, level, equipment and training days." },
  { icon: "library", title: "Exercise library", text: "130+ exercises with target muscles, sets, reps, rest and instructions." },
  { icon: "builder", title: "My Workout", text: "Save plans and get dated, scheduled sessions you can open and log." },
  { icon: "checkCircle", title: "Completion tracking", text: "Mark each session completed, partially completed or skipped." },
  { icon: "progress", title: "Progress scatter plot", text: "See real session durations over time, from your own records only." },
  { icon: "vitals", title: "Vitals log + BMI", text: "A manual log of heart rate, blood pressure, SpO₂ and temperature, plus a BMI profile." },
];

const GEN_STEPS = [
  "<b>Equipment is a hard filter.</b> Choosing Full Gym unlocks machines, cables, kettlebells and the pull-up bar. Any selection always includes bodyweight exercises, and nothing needing equipment you don't have is ever included.",
  "<b>Level is respected.</b> Exercises above your experience level are never included.",
  "<b>A weekly split is chosen</b> from your goal, level and training days — for example Push/Pull/Legs, Upper/Lower, Full Body or Conditioning.",
  "<b>Each slot is scored</b> on goal fit, level fit, movement type and variety, and the best-scoring exercise fills it.",
  "<b>Tiered fallback.</b> If nothing fits a slot, FitNova tries the same muscle, then a related muscle, then omits the slot — and shows you an explanation.",
  "<b>Sets, reps and rest are adjusted by goal</b> (for example heavier and longer rest for strength, shorter rest for endurance).",
];

function section(iconName, title, inner) {
  return `<section class="card pad-lg">
    <div class="row" style="flex-wrap:nowrap;gap:12px;margin-bottom:12px">
      <span style="width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none;background:var(--accent-soft);color:var(--accent);border:1px solid rgba(46,230,255,.2)">${icon(iconName)}</span>
      <h2 style="font-size:20px">${title}</h2>
    </div>
    <div class="stack" style="gap:10px;color:var(--text-2);font-size:14.5px;line-height:1.6">${inner}</div>
  </section>`;
}

const bullets = (items) => `<ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

export async function render(root) {
  root.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">About</div><h1>About FitNova</h1><p>PERSONAL FITNESS INTELLIGENCE</p></div>
    </div>
    <div class="stack" style="gap:18px;max-width:980px">
      ${section("info", "What FitNova is", `
        <p>FitNova is a personal fitness app that turns your goal, experience, equipment and schedule into a structured weekly workout plan, then helps you track what you actually do.</p>
        <p>It also includes a manual vitals log and a BMI profile. Everything runs from a single app with its own local database — there are no accounts with third parties and no device connections.</p>`)}

      <section>
        <div class="eyebrow" style="margin-bottom:6px">Main features</div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">
          ${FEATURES.map((f) => `
            <div class="card feature">
              <div class="f-icon">${icon(f.icon)}</div>
              <h3>${f.title}</h3>
              <p>${f.text}</p>
            </div>`).join("")}
        </div>
      </section>

      ${section("sparkle", "How personalized generation works", `
        <div class="notice">${icon("info")}<span>FitNova uses a <b>transparent, rule-based engine</b> — it is <b>not</b> machine learning or AI. The same inputs always follow the same rules, and the app explains its choices.</span></div>
        <ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px">
          ${GEN_STEPS.map((s, i) => `<li class="step-label" style="align-items:flex-start"><span class="n">${i + 1}</span><span style="flex:1;min-width:0">${s}</span></li>`).join("")}
        </ol>`)}

      ${section("checkCircle", "How completion tracking works", bullets([
        "Each saved plan creates dated sessions. <b>A saved plan is never counted as completed.</b>",
        "<b>Completed</b> — pick the date, and optionally add the minutes and a note.",
        "<b>Partially completed</b> — choose which exercises you did.",
        "<b>Skipped</b> — optionally add a reason.",
        "There is one record per session. You can edit it later, and duplicates are blocked.",
      ]))}

      ${section("progress", "How progress tracking works", bullets([
        "All figures come from completion records only — never from saved plans.",
        "The scatter plot shows date on X and minutes on Y.",
        "Completed sessions are circles; partially completed sessions are diamonds.",
        "Skipped sessions are counted but not plotted.",
        "Sessions without a recorded duration are listed but not plotted — FitNova never invents values.",
      ]))}

      ${section("vitals", "How vitals tracking works", bullets([
        "Entries are manual. FitNova doesn't connect to devices or measure anything itself.",
        "The unit you enter is stored with each reading.",
        "Temperatures are converted between °C and °F for display only, using your preferred unit.",
        "Each measurement type has its own trend chart. Gaps stay gaps — missing readings are never filled in.",
        "FitNova does <b>not</b> interpret readings: no reference ranges, no normal/high/low labels.",
      ]))}

      ${section("shield", "Privacy", `
        <p>Your data lives in this app's local SQLite database. It is scoped to your profile by a private profile key kept on your device, and requests without that key can't read your records.</p>
        <p>You can delete your profile and everything linked to it at any time from the Profile page.</p>`)}

      ${section("alert", "Limitations & educational purpose", `
        ${bullets([
          "FitNova is for educational and informational use. It is not medical advice and not a substitute for a coach or clinician.",
          "There are no device integrations.",
          "BMI is a screening estimate; it doesn't measure body composition, fitness or health.",
          "The generator is rule-based and can't assess your form, injuries or limitations.",
          "If you have a health condition, consult a qualified professional before starting a new exercise programme.",
        ])}`)}

      <div class="row" style="margin-top:4px">
        <a class="btn btn-primary btn-lg" href="#/create">${icon("sparkle")} Create My Workout</a>
        <a class="btn btn-lg" href="#/">${icon("home")} Back to Home</a>
      </div>
    </div>`;
}
