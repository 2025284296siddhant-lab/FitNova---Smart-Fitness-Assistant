# Project Goal — FitNova v1.0

**Ship a polished, fully functional, mobile-first FitNova app** that satisfies every requirement in
`docs/SPEC.md`, verified end to end, with data persisting across restarts.

## Definition of Done (all must be true and *tested*, not assumed)
- [x] App starts with `python run.py`; no runtime or console errors on any page.
- [x] Profile onboarding captures name, gender, height, weight (+ optional age band); BMI shown.
- [x] All 6 nav items work (Home, Create Workout, My Workout, Progress, Vitals, About) on mobile
      (bottom tabs) and desktop (sidebar), with clear active states.
- [x] Home: hero + "Create My Workout" CTA + 3-image collage + 4 platform cards.
- [x] Create Workout: validated form → generated plan preview → regenerate → save.
- [x] Generator: equipment hard constraint, goal/level priority, day distribution, no needless
      repeats, fallbacks with explanations.
- [x] My Workout: list, open, per-day exercises (sets/reps/rest/instructions), delete w/ confirm,
      statuses upcoming / completed / partial / skipped.
- [x] Completion: completed (date, optional duration, note), partial (exercises done), skipped
      (optional reason); edit; duplicates prevented; progress refreshes immediately.
- [x] Progress: totals from completion records only, weekly + monthly summaries, recent history,
      interactive SVG **scatter plot** (date × minutes, distinct markers, tooltips, 7/30/90/all
      filters, tap-to-inspect), missing-duration handling, empty state.
- [x] Vitals: add/edit/delete HR, BP (sys/dia), SpO₂, temperature (°C/°F); history with type +
      date filters; latest cards; time-series trend charts; safety disclaimers; manual-source label.
- [x] About page covers all required topics incl. limitations.
- [x] DB: all entities, PK/FK, unique constraints, cascades, transactions, versioned migrations
      with backup, consistent date storage, token-scoped privacy.
- [x] Automated tests pass (`python -m unittest discover -s tests`).
- [x] Browser-verified journeys: Home → Create → Generate → Save → My Workout → Complete →
      Progress scatter; Vitals → Add → Save → History → Trends; restart → data persists.
- [x] Responsive at 375px, 768px, 1280px with no overflow or broken images.
- [x] `README.md` final summary: features, DB structure, charts, tests + outcomes, limitations,
      run instructions.

# Goal v1.1 — Android app (set 2026-11-14)

**A working, tested Android APK of FitNova** that runs fully offline on the phone (bundled
Python backend via Chaquopy + WebView), verified on an Android emulator or the closest
equivalent environment available on this machine.

- [x] `android/` Gradle project compiles (`gradle assembleDebug` / `assembleRelease`) with no errors.
- [~] APK installs on an emulator; app launches, server starts, Home renders (no crash, no blank screen).
      *Real emulator blocked (no hardware acceleration on this PC; see README). Verified instead by running
      the APK's own extracted code under Python 3.11 (Chaquopy's version) + Chromium at phone size.*
- [x] On-device journey: create profile → create & save plan → mark session complete → Progress
      scatter shows the point → add a vitals reading → trends/history show it.
- [x] Data persists after force-stopping and relaunching the app.
- [~] Back button navigates within the app; external links open outside it. *(Implemented in MainActivity; needs a device/emulator to exercise.)*
- [x] Final APK copied to `dist/FitNova-1.0.apk`, README updated with install steps.
