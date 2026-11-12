// Offline-Cache für die App-Dateien. Bei Änderungen VERSION erhöhen.
const VERSION = 'v94';
const FILES = ['./', 'index.html', 'css/basis.css', 'css/projekte.css', 'css/raum.css', 'css/angebot.css', 'css/kunden.css', 'css/bilder.css', 'css/kalender.css', 'css/finanzen.css', 'rooms.js', 'core.js', 'vorgaben.js', 'voice.js', 'moodboards.js', 'einstellungen.js', 'backup.js', 'sync.js', 'angebot.js', 'garten.js', 'pdf.js', 'baumappe.js', 'kontakt.js', 'kunden.js', 'partner.js', 'kalender.js', 'schnell.js', 'zeichnen.js', 'bilder.js', 'projekt.js', 'karte.js', 'fortschritt.js', 'baustelle.js', 'angebote.js', 'vendor/qrcode-generator.js', 'qrcode.js', 'unterschrift.js', 'rechnung.js', 'finanzen.js', 'pflege.js', 'heute.js', 'sprache.js', 'kamera.js', 'geraet.js', 'gesprpdf.js', 'bausteine.js', 'vorort.js', 'suche.js', 'push.js', 'unterlagen.js', 'hilfe.js', 'raum.js', 'raumscan.js', 'app.js', 'vendor/three/three.min.js', 'vendor/three/OrbitControls.js', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'data/preisliste.json', 'vendor/xlsx.mini.min.js', 'vendor/jspdf.umd.min.js', 'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js', 'manifest.webmanifest',
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

// ---------- Mitteilungen (Web-Push, siehe push.js und supabase/functions/push) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { text: e.data ? e.data.text() : '' }; }
  const zahl = typeof d.zahl === 'number' && self.navigator.setAppBadge ? (d.zahl ? self.navigator.setAppBadge(d.zahl) : self.navigator.clearAppBadge()).catch(() => {}) : null;
  e.waitUntil(Promise.all([self.registration.showNotification(d.titel || 'DOM', { body: d.text || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || undefined, data: { ziel: d.ziel || 'heute' } }), zahl]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ziel = e.notification.data?.ziel || 'heute';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs[0];
    if (c) { c.postMessage({ ziel }); return c.focus(); }
    return self.clients.openWindow('./?ziel=' + ziel);
  }));
});
