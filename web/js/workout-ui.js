// Shared rendering for exercises/day cards (used by Create Workout preview and My Workout).
import { esc, fmtRest, icon, label } from "./ui.js";

export function exerciseRow(it, idx, { extra = "" } = {}) {
  return `
    <div class="ex">
      <div class="ex-idx">${idx}</div>
      <div class="ex-body">
        <div class="ex-name">${esc(it.name)}</div>
        <div class="ex-meta">
          <span class="tag">${esc(label(it.muscle))}</span>
          <span class="tag">${esc(label(it.equipment))}</span>
          <span class="tag">${esc(label(it.workout_type))}</span>
          <span class="tag">${esc(label(it.level))}</span>
        </div>
        <div class="ex-rx">
          <div><small>Sets</small><b>${it.sets}</b></div>
          <div><small>Reps</small><b>${esc(it.reps)}</b></div>
          <div><small>Rest</small><b>${fmtRest(it.rest)}</b></div>
        </div>
        ${it.fallback_note ? `<div class="fallback">${icon("info")}<span>${esc(it.fallback_note)}</span></div>` : ""}
        <details><summary>How to do it ${icon("chevronRight")}</summary><p>${esc(it.instructions)}</p></details>
        ${extra}
      </div>
    </div>`;
}

export function dayCard(day, { headRight = "", footer = "" } = {}) {
  return `
    <div class="card day-card">
      <div class="day-head">
        <div><div class="day-num">Day ${day.day_number}</div><h3>${esc(day.title)}</h3></div>
        <div class="row">${headRight || `<span class="badge plain">${day.items.length} exercises</span>`}</div>
      </div>
      ${day.items.length ? day.items.map((it, i) => exerciseRow(it, i + 1)).join("")
        : `<div class="ex"><p class="muted">No compatible exercises were available for this day.</p></div>`}
      ${footer}
    </div>`;
}

export function notesNotice(notes) {
  if (!notes || !notes.length) return "";
  return `<div class="notice warn">${icon("info")}<div><b>Fallbacks used (${notes.length})</b> — exact matches weren't available for every slot with your equipment, so compatible alternatives were chosen. Equipment you don't have is never used.
    <details style="margin-top:6px"><summary style="cursor:pointer;color:var(--partial);font-weight:600">Show details</summary>
    <ul style="margin:8px 0 0;padding-left:18px">${notes.map((n) => `<li style="margin-bottom:4px">${esc(n)}</li>`).join("")}</ul></details></div></div>`;
}
