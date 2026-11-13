// Home: hero + image collage, THE PLATFORM feature cards, and a live snapshot from real records.
import { get, localToday } from "../api.js";
import { esc, fmtDate, icon, label } from "../ui.js";
import { bmiCard } from "./profile.js";

const IMAGES = [
  { src: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=70", alt: "Dumbbells racked in a dimly lit gym", label: "Strength" },
  { src: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=70", alt: "Athlete training with weights", label: "Muscle" },
  { src: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=600&q=70", alt: "Person doing a conditioning workout", label: "Endurance" },
];

const FEATURES = [
  { icon: "sliders", title: "Personalized", text: "Workouts adapted to your goal, experience level, equipment and schedule.", href: "#/create" },
  { icon: "library", title: "Exercise Library", text: "130+ exercises with target muscles, sets, reps, rest and step-by-step instructions.", href: "#/create?library=1" },
  { icon: "target", title: "Training Goals", text: "Goal-oriented planning for muscle gain, strength, fitness, endurance or weight management.", href: "#/create" },
  { icon: "builder", title: "Workout Builder", text: "Generate, save and complete weekly plans — then watch real progress build up.", href: "#/workouts" },
];

export async function render(root, ctx) {
  const u = ctx.user;
  root.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">Personalized Fitness Planning</div>
        <h1>Train smarter.<br><em>Build your plan.</em></h1>
        <p class="lead">${u ? `Hi ${esc(u.name.split(" ")[0])} — ` : ""}FitNova turns your goal, experience and available equipment into a structured weekly program — and tracks every session you actually complete.</p>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg" href="#/create">${icon("sparkle")} Create My Workout</a>
          <a class="btn btn-lg" href="#/workouts">${icon("workout")} My Workout</a>
        </div>
      </div>
      <div class="collage" aria-label="Training imagery">
        ${IMAGES.map((im) => `
          <figure class="ph" style="margin:0">
            <img src="${im.src}" alt="${esc(im.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
            <div class="ph-art" aria-hidden="true">${icon("dumbbell")}</div>
            <figcaption class="ph-label"><i></i>${im.label}</figcaption>
          </figure>`).join("")}
      </div>
    </section>

    <section style="margin-top:34px">
      <div class="spread" style="margin-bottom:14px"><div><div class="eyebrow">The Platform</div><h2 style="font-size:24px;margin-top:6px">Everything you need to train with intent</h2></div></div>
      <div class="grid grid-4 features">
        ${FEATURES.map((f, i) => `
          <a class="card feature interactive" href="${f.href}" style="color:inherit">
            <span class="f-num">0${i + 1}</span>
            <div class="f-icon">${icon(f.icon)}</div>
            <h3>${f.title}</h3>
            <p>${f.text}</p>
          </a>`).join("")}
      </div>
    </section>

    <section style="margin-top:34px">
      <div class="eyebrow" style="margin-bottom:6px">Your snapshot</div>
      <h2 style="font-size:24px;margin-bottom:14px">Where you are right now</h2>
      <div class="snapshot" id="snapshot">
        <div class="skeleton" style="height:190px"></div><div class="skeleton" style="height:190px"></div>
      </div>
    </section>`;

  // Graceful image fallback (no broken image icons).
  root.querySelectorAll(".collage img").forEach((img) => {
    const fail = () => img.closest(".ph").classList.add("fallback");
    img.addEventListener("error", fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });

  const box = root.querySelector("#snapshot");
  try {
    const [plans, prog] = await Promise.all([get("/api/plans"), get(`/api/progress?range=30&today=${localToday()}`)]);
    const next = plans.plans.map((p) => p.next_session && { ...p.next_session, plan: p }).filter(Boolean)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
    const t = prog.totals;
    box.innerHTML = `
      <div class="card pad-lg">
        <div class="spread"><div class="eyebrow">Next up</div><a class="btn btn-sm btn-ghost" href="#/progress">Progress ${icon("chevronRight")}</a></div>
        ${next ? `
          <h3 style="font-size:22px;margin-top:10px">${esc(next.title)}</h3>
          <p class="muted" style="margin-top:4px">${esc(next.plan.name)} · Week ${next.week_number} · ${fmtDate(next.scheduled_date, { weekday: "long", month: "short", day: "numeric" })}</p>
          <div class="row" style="margin-top:16px"><a class="btn btn-primary" href="#/workouts/${next.plan.plan_id}?session=${next.session_id}">${icon("checkCircle")} Open session</a></div>`
        : `<h3 style="font-size:20px;margin-top:10px">No session scheduled</h3>
           <p class="muted" style="margin-top:4px">${plans.plans.length ? "All sessions in your saved plans have been logged." : "Generate your first plan to get a weekly schedule."}</p>
           <div class="row" style="margin-top:16px"><a class="btn btn-primary" href="#/create">${icon("sparkle")} Create a workout</a></div>`}
        <hr class="divider" style="margin:18px 0 14px">
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
          <div><div class="num" style="font-size:24px;font-weight:700;color:var(--completed)">${t.completed}</div><div class="hint">Completed</div></div>
          <div><div class="num" style="font-size:24px;font-weight:700;color:var(--partial)">${t.partial}</div><div class="hint">Partial</div></div>
          <div><div class="num" style="font-size:24px;font-weight:700">${t.minutes}</div><div class="hint">Minutes</div></div>
        </div>
        <p class="hint" style="margin-top:8px">Last 30 days · from sessions you've logged${prog.last_active ? ` · last active ${fmtDate(prog.last_active, { month: "short", day: "numeric" })}` : ""}</p>
      </div>
      ${bmiCard(u?.bmi, { compact: true })}`;
  } catch (err) {
    box.innerHTML = `<div class="card"><p class="muted">${esc(err.message)}</p></div>`;
  }
}
