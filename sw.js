/* Кандо: офлайн-кэш. При выходе новой версии увеличьте номер. */
const VERSION = 'kando-v5';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const FONTS = 'kando-fonts';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Страница: сначала сеть (до 4 секунд) — чтобы обновления приходили сразу; без сети — из кэша.
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async c => {
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-store' }), timeout(4000)]);
        if (res.ok) { c.put('./index.html', res.clone()); return res; }
        throw new Error('bad');
      } catch (err) {
        return (await c.match('./index.html')) || new Response('Нет соединения', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    }));
    return;
  }

  // Остальные свои файлы: из кэша, в фоне обновить.
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const update = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(update); return hit; }
    return (await update) || new Response('', { status: 504 });
  }));
});
