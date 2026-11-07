// Offline-Cache für die App-Dateien. Bei Änderungen VERSION erhöhen.
const VERSION = 'v63';
const FILES = ['./', 'index.html', 'css/basis.css', 'css/projekte.css', 'css/raum.css', 'css/angebot.css', 'css/kunden.css', 'css/bilder.css', 'css/kalender.css', 'css/finanzen.css', 'rooms.js', 'core.js', 'vorgaben.js', 'voice.js', 'moodboards.js', 'einstellungen.js', 'backup.js', 'sync.js', 'angebot.js', 'garten.js', 'pdf.js', 'baumappe.js', 'kontakt.js', 'kunden.js', 'partner.js', 'kalender.js', 'schnell.js', 'bilder.js', 'projekt.js', 'karte.js', 'fortschritt.js', 'baustelle.js', 'angebote.js', 'rechnung.js', 'finanzen.js', 'heute.js', 'sprache.js', 'suche.js', 'raum.js', 'app.js', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
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
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
