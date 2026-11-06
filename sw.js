// Offline-Cache für die App-Dateien. Bei Änderungen VERSION erhöhen.
const VERSION = 'v24';
const FILES = ['./', 'index.html', 'style.css', 'rooms.js', 'core.js', 'voice.js', 'moodboards.js', 'backup.js', 'sync.js', 'social.js', 'angebot.js', 'garten.js', 'pdf.js', 'baumappe.js', 'projekt.js', 'app.js',
  'data/preisliste.json', 'vendor/xlsx.mini.min.js', 'vendor/jspdf.umd.min.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'assets/dom_logo.png', 'assets/dom_logo_weiss.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Netzwerk zuerst (damit Updates sofort ankommen), offline aus dem Cache
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
