// Shared UI primitives: escaping, icons, labels, formatting, toasts, sheets, confirm dialogs, form errors.

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------------ icons (24px stroke icons)
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  create: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  workout: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  progress: '<path d="M3 3v18h18"/><circle cx="8" cy="14" r="1.4"/><circle cx="12" cy="9" r="1.4"/><circle cx="16" cy="12" r="1.4"/><circle cx="19.5" cy="6.5" r="1.4"/>',
  vitals: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.5 9.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  library: '<path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2Z"/><path d="M8 7h6M8 11h6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  builder: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 13h3M8 17h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 13 4-4"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 2 1.5 3 2.5 3-1-3 .5-6 .5-8.5Z"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  band: '<path d="M4 18c3-8 13-8 16 0"/><path d="M4 18h2M18 18h2"/>',
  barbell: '<path d="M2 12h20M5 8v8M8 6v12M16 6v12M19 8v8"/>',
  gym: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5h8v2M3 12h18"/>',
  body: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7M7 9l5 1 5-1M9 21l3-7 3 7"/>',
  skip: '<path d="M6 5v14l9-7-9-7ZM18 5v14"/>',
  half: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" stroke="none"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21l-4-4Z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z"/>',
};
export function icon(name, cls = "") {
  if (name === "logo") {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#2EE6FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${cls}"><path d="M7 17V7l10 10V7"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${cls}">${P[name] || P.info}</svg>`;
}

// ------------------------------------------------------------------ labels
export const LABELS = {
  muscle_gain: "Muscle Gain", strength: "Strength", general_fitness: "General Fitness", endurance: "Endurance",
  weight_management: "Weight Management", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
  none: "No Equipment", dumbbells: "Dumbbells", barbell: "Barbell", bands: "Resistance Bands", full_gym: "Full Gym",
  kettlebell: "Kettlebell", machine: "Machine", cable: "Cable", pullup_bar: "Pull-up Bar",
  chest: "Chest", back: "Back", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps", quads: "Quads",
  hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves", core: "Core", full_body: "Full Body",
  compound: "Compound", isolation: "Isolation", cardio: "Cardio", plyometric: "Plyometric", mobility: "Mobility",
  completed: "Completed", partial: "Partially completed", skipped: "Skipped", upcoming: "Upcoming", overdue: "Not logged",
  female: "Female", male: "Male", non_binary: "Non-binary", prefer_not_to_say: "Prefer not to say",
  adult: "18 or older", under_18: "Under 18",
};
export const label = (k) => LABELS[k] ?? k;

// ------------------------------------------------------------------ formatting
export function parseDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function fmtDate(ymd, opts = { day: "numeric", month: "short", year: "numeric" }) {
  return ymd ? parseDate(ymd).toLocaleDateString(undefined, opts) : "—";
}
export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
export function fmtRest(sec) {
  if (sec >= 60) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m}m ${s}s` : `${m} min`; }
  return `${sec}s`;
}
export function plural(n, word, pl) { return `${n} ${n === 1 ? word : (pl || word + "s")}`; }
export function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}
/** Local datetime-local value from an ISO timestamp (or now). */
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** datetime-local value -> ISO string with the device's timezone offset. */
export function localInputToIso(v) {
  const d = new Date(v);
  if (isNaN(d)) return null;
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-", a = Math.abs(off);
  const p = (n) => String(n).padStart(2, "0");
  return `${v.length === 16 ? v + ":00" : v}${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

// ------------------------------------------------------------------ toasts
export function toast(message, type = "success") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === "error" ? "alert" : "checkCircle")}<span>${esc(message)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

// ------------------------------------------------------------------ sheets / dialogs
/**
 * Open a modal sheet (bottom sheet on phones, dialog on larger screens).
 * Returns { el, close }. `onClose` fires once when closed by any means.
 */
export function openSheet({ title, subtitle = "", body = "", foot = "", onClose, labelId } = {}) {
  const prevFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const id = labelId || `sheet-${Math.random().toString(36).slice(2, 8)}`;
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <div><h2 id="${id}">${esc(title)}</h2>${subtitle ? `<p class="muted" style="margin-top:4px;font-size:14px">${subtitle}</p>` : ""}</div>
        <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="sheet-body">${body}</div>
      ${foot ? `<div class="sheet-foot">${foot}</div>` : ""}
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("hashchange", close);
    prevFocus && prevFocus.focus && prevFocus.focus();
    onClose && onClose();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const f = [...overlay.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", close);
  const first = overlay.querySelector(".sheet-body input, .sheet-body select, .sheet-body textarea, .sheet-foot .btn");
  setTimeout(() => (first || overlay.querySelector("[data-close]")).focus(), 30);
  return { el: overlay.querySelector(".sheet"), close };
}

export function confirmDialog({ title, message, confirmText = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const s = openSheet({
      title,
      body: `<p class="muted" style="font-size:14.5px">${message}</p>`,
      foot: `<button class="btn btn-ghost" data-close>Cancel</button>
             <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${esc(confirmText)}</button>`,
      onClose: () => resolve(result),
    });
    s.el.querySelector("[data-ok]").addEventListener("click", () => { result = true; s.close(); });
  });
}

// ------------------------------------------------------------------ forms
export function clearErrors(form) {
  form.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
  form.querySelectorAll(".form-error").forEach((e) => e.remove());
}
/** Show server/client field errors. `fields` = {name: message}. Unknown fields go to a form-level banner. */
export function showErrors(form, fields = {}, fallback = "") {
  clearErrors(form);
  const extra = [];
  for (const [name, msg] of Object.entries(fields)) {
    const field = form.querySelector(`[data-field="${name}"]`);
    if (field) {
      field.classList.add("invalid");
      let el = field.querySelector(".field-error");
      if (!el) { el = document.createElement("div"); el.className = "field-error"; field.appendChild(el); }
      el.textContent = msg;
    } else extra.push(msg);
  }
  if (extra.length || (fallback && !Object.keys(fields).length)) {
    const b = document.createElement("div");
    b.className = "form-error";
    b.setAttribute("role", "alert");
    b.textContent = extra.join(" ") || fallback;
    form.prepend(b);
  }
  const firstBad = form.querySelector(".field.invalid input, .field.invalid select, .field.invalid textarea, .form-error");
  firstBad && firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${text ? esc(text) : ""}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function emptyState({ iconName = "sparkle", title, text, action = "" }) {
  return `<div class="empty"><div class="empty-icon">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;
}

export function errorCard(err, retryId = "retry") {
  return `<div class="card error-state">${emptyState({ iconName: "alert", title: "Couldn't load this", text: esc(err.message), action: `<button class="btn btn-outline" id="${retryId}">${icon("refresh")} Try again</button>` })}</div>`;
}
