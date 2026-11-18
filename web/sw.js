// FitNova service worker: caches the app shell for fast/offline launch. API responses are never cached
// (health and progress data must always come fresh from the database).
const CACHE = "fitnova-shell-v5";
const SHELL = [
  "/", "/index.html", "/css/app.css", "/img/topo.svg", "/manifest.webmanifest",
  "/js/app.js", "/js/api.js", "/js/ui.js", "/js/boost.js", "/js/charts.js", "/js/workout-ui.js",
  "/js/pages/home.js", "/js/pages/create.js", "/js/pages/workouts.js", "/js/pages/progress.js",
  "/js/pages/vitals.js", "/js/pages/about.js", "/js/pages/profile.js",
  "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Network first so updates show immediately; fall back to cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});
