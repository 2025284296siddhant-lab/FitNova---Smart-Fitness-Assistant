// FitNova app shell: hash router, navigation, profile session.
import { get, getToken, setToken } from "./api.js";
import { esc, icon, initials } from "./ui.js";
import { initBoost, setBoostPage } from "./boost.js";

const NAV = [
  { path: "/", label: "Home", short: "Home", icon: "home" },
  { path: "/create", label: "Create Workout", short: "Create", icon: "create" },
  { path: "/workouts", label: "My Workout", short: "Workouts", icon: "workout" },
  { path: "/progress", label: "Progress", short: "Progress", icon: "progress" },
  { path: "/vitals", label: "Vitals", short: "Vitals", icon: "vitals" },
  { path: "/about", label: "About", short: "About", icon: "about" },
];

const ROUTES = [
  { re: /^\/$/, mod: () => import("./pages/home.js"), title: "Home" },
  { re: /^\/create$/, mod: () => import("./pages/create.js"), title: "Create Workout" },
  { re: /^\/workouts$/, mod: () => import("./pages/workouts.js"), title: "My Workout" },
  { re: /^\/workouts\/(\d+)$/, mod: () => import("./pages/workouts.js"), title: "Workout Plan", detail: true },
  { re: /^\/progress$/, mod: () => import("./pages/progress.js"), title: "Progress" },
  { re: /^\/vitals$/, mod: () => import("./pages/vitals.js"), title: "Vitals" },
  { re: /^\/about$/, mod: () => import("./pages/about.js"), title: "About", public: true },
  { re: /^\/profile$/, mod: () => import("./pages/profile.js"), title: "Profile" },
  { re: /^\/welcome$/, mod: () => import("./pages/profile.js"), title: "Welcome", public: true, onboarding: true },
];

const ctx = {
  user: null,
  navigate: (path) => { location.hash = `#${path}`; },
  async refreshUser() {
    if (!getToken()) { ctx.user = null; renderProfileSlots(); return null; }
    try { ctx.user = (await get("/api/me")).user; } catch { ctx.user = null; }
    renderProfileSlots();
    return ctx.user;
  },
  setUser(user, token) {
    if (token !== undefined) setToken(token);
    ctx.user = user;
    renderProfileSlots();
  },
};

let cleanup = null;
let renderSeq = 0;

function currentPath() {
  const h = location.hash.replace(/^#/, "") || "/";
  return h.split("?")[0];
}

function renderNav(path) {
  const top = "/" + (path.split("/")[1] || "");
  const isActive = (p) => (p === "/" ? path === "/" : top === p);
  document.getElementById("side-nav").innerHTML = NAV.map((n) =>
    `<a href="#${n.path}" class="${isActive(n.path) ? "active" : ""}" ${isActive(n.path) ? 'aria-current="page"' : ""}>${icon(n.icon)}<span>${n.label}</span></a>`).join("");
  document.getElementById("tab-nav").innerHTML = NAV.map((n) =>
    `<a href="#${n.path}" class="tab ${isActive(n.path) ? "active" : ""}" ${isActive(n.path) ? 'aria-current="page"' : ""} aria-label="${n.label}">${icon(n.icon)}<span>${n.short}</span></a>`).join("");
  const onProfile = path === "/profile";
  document.getElementById("appbar-avatar").classList.toggle("active", onProfile);
  const chip = document.querySelector(".profile-chip");
  chip && chip.classList.toggle("active", onProfile);
}

function renderProfileSlots() {
  const u = ctx.user;
  const av = document.getElementById("appbar-avatar");
  av.textContent = u ? initials(u.name) : "";
  av.innerHTML = u ? esc(initials(u.name)) : icon("user");
  av.setAttribute("href", u ? "#/profile" : "#/welcome");
  document.getElementById("side-profile").innerHTML = u
    ? `<a class="profile-chip ${currentPath() === "/profile" ? "active" : ""}" href="#/profile">
         <span class="avatar-btn">${esc(initials(u.name))}</span>
         <span style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.name)}</b>
         <small>${u.bmi ? `BMI ${u.bmi.value}` : "View profile"}</small></span></a>`
    : `<a class="btn btn-outline btn-block" href="#/welcome">${icon("user")} Create profile</a>`;
}

async function router() {
  const seq = ++renderSeq;
  const path = currentPath();
  const route = ROUTES.find((r) => r.re.test(path));
  if (!route) { ctx.navigate("/"); return; }
  if (!route.public && !getToken()) { ctx.navigate("/welcome"); return; }
  if (route.onboarding && getToken() && ctx.user) { ctx.navigate("/"); return; }
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  renderNav(path);
  setBoostPage(path);
  const view = document.getElementById("view");
  view.innerHTML = `<div class="stack"><div class="skeleton" style="height:44px;width:60%"></div><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:120px"></div></div>`;
  document.title = `${route.title} · FitNova`;
  try {
    const mod = await route.mod();
    if (seq !== renderSeq) return;
    view.innerHTML = "";
    view.style.animation = "none"; void view.offsetWidth; view.style.animation = "";
    const params = path.match(route.re).slice(1);
    cleanup = (await mod.render(view, { ...ctx, params, route })) || null;
  } catch (err) {
    console.error(err);
    if (seq !== renderSeq) return;
    view.innerHTML = `<div class="card"><div class="empty"><div class="empty-icon">${icon("alert")}</div><h3>Something went wrong</h3><p>${esc(err.message || "This page failed to load.")}</p><button class="btn btn-outline" id="reload-page">Reload</button></div></div>`;
    view.querySelector("#reload-page").addEventListener("click", () => location.reload());
  }
  window.scrollTo({ top: 0 });
  if (document.activeElement && document.activeElement !== document.body && !view.contains(document.activeElement)) view.focus({ preventScroll: true });
}

// Mirror :checked state onto labels as .is-checked so selected chips render on web engines without
// CSS :has() (older Android System WebView versions).
let syncQueued = false;
function syncChecked() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    document.querySelectorAll("label input[type=radio], label input[type=checkbox]").forEach((i) => {
      const l = i.closest("label");
      if (l) l.classList.toggle("is-checked", i.checked);
    });
  });
}
document.addEventListener("change", syncChecked);
document.addEventListener("click", syncChecked);
new MutationObserver(syncChecked).observe(document.body, { childList: true, subtree: true });

window.addEventListener("fitnova:auth-lost", () => {
  setToken(null);
  ctx.user = null;
  renderProfileSlots();
  if (currentPath() !== "/welcome" && currentPath() !== "/about") ctx.navigate("/welcome");
});

async function boot() {
  document.getElementById("legacy-notice")?.remove();
  document.querySelectorAll("[data-icon='logo']").forEach((n) => (n.innerHTML = icon("logo")));
  initBoost();
  await ctx.refreshUser();
  if (getToken() && !ctx.user) {
    // Token no longer valid (profile deleted elsewhere) – start onboarding again.
    setToken(null);
  }
  window.addEventListener("hashchange", router);
  router();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* offline shell is optional */ });
  }
}

boot();
