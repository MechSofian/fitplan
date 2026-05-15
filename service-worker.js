/* FitPlan — Service Worker
   Stratégie : cache-first pour les assets statiques, network-first pour Supabase. */

const VERSION = 'fitplan-v31';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './style.css?v=31',
  './app.js?v=31',
  './auth.js?v=31',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(cache =>
      cache.addAll(ASSETS).catch(err => console.warn('[SW] precache partial:', err))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne jamais cacher : Supabase (API + auth), POST/PUT/DELETE
  if (url.hostname.includes('supabase') || e.request.method !== 'GET') {
    return; // laisse le navigateur faire
  }

  // Stale-while-revalidate pour tout le reste (CDN + assets locaux)
  e.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(resp => {
          // Mise à jour du cache en arrière-plan
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            cache.put(e.request, resp.clone()).catch(() => {});
          }
          return resp;
        }).catch(() => cached); // hors ligne : retombe sur le cache
        return cached || networkFetch;
      })
    )
  );
});
