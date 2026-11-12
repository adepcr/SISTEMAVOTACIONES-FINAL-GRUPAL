// Service worker de la PWA: permite instalar la página como app.
// Primero intenta la red (para tener siempre la versión nueva) y si no hay internet usa la copia guardada.
// Solo guarda los archivos de esta página; los votos siguen yendo directo a la base de datos (Supabase).
const CACHE = "adep-vota-v4";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
    self.clients.claim();
});

self.addEventListener("fetch", e => {
    const url = new URL(e.request.url);
    if (e.request.method !== "GET" || url.origin !== location.origin) return;
    e.respondWith(
        fetch(e.request).then(r => {
            if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
            return r;
        }).catch(() => caches.match(e.request))
    );
});
