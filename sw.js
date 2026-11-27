// Service worker de La Cantera: guarda el diseño y el código para que la app
// arranque rápido aunque haya poca cobertura. Los datos (Supabase) nunca se guardan:
// siempre se piden frescos.
const VERSION = "cantera-v2";
const SHELL = [
  "/", "/index.html", "/css/styles.css", "/favicon.svg", "/manifest.webmanifest",
  "/js/app.js", "/js/config.js", "/js/store.js", "/js/utils.js", "/js/share.js", "/js/lineup.js", "/js/live.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Red primero (para ver siempre la última versión) y, si tarda o no hay red, lo guardado
function networkFirst(req, timeout = 3500) {
  return new Promise((resolve) => {
    let done = false;
    const fromCache = () => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((r) => r || caches.match("/index.html"));
    const timer = setTimeout(() => { if (!done) fromCache().then((r) => { if (r && !done) { done = true; resolve(r); } }); }, timeout);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); if (!done) fromCache().then((r) => { done = true; resolve(r || Response.error()); }); });
  });
}

// Guardado primero y se actualiza en segundo plano (librerías y fuentes con versión fija)
function staleWhileRevalidate(req) {
  return caches.open(VERSION).then((c) => c.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/_vercel") || url.pathname.startsWith("/api/")) return;
    e.respondWith(networkFirst(req));
    return;
  }
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("@supabase"))) {
    e.respondWith(staleWhileRevalidate(req));
  }
  // Todo lo demás (Supabase: datos, fotos, tiempo real) va directo a la red
});
