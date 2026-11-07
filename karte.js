'use strict';
/* Karte der Baustellen: zeigt die Projekte an der Objektanschrift (nicht an der Rechnungsanschrift des Kunden).
 * Karte von OpenStreetMap (Leaflet, liegt in vendor/leaflet), Anschriften werden über Photon in Koordinaten
 * umgerechnet und auf dem Gerät gemerkt, damit das nur einmal je Anschrift passiert.
 * Baut auf app.js auf ($, esc, icon, Kunden, Projekt). */
window.Karte = (() => {
  const LS = 'dom:geo';
  let geo = {};
  try { geo = JSON.parse(localStorage.getItem(LS)) || {}; } catch {}
  const merken = () => { try { localStorage.setItem(LS, JSON.stringify(geo)); } catch {} };

  let laden;
  function leaflet() {
    if (window.L) return Promise.resolve();
    return (laden ||= new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js';
      s.onload = () => res(); s.onerror = () => { laden = null; rej(new Error('Karte konnte nicht geladen werden')); };
      document.head.appendChild(s);
    }));
  }

  /** Objektanschrift eines Projekts als eine Zeile. */
  function anschrift(x) {
    const k = Kunden.byId(x.kundeId), o = k && Kunden.objekt(k, x.objektId);
    return ((o && Kunden.einzeilig(o.adresse)) || x.address || '').trim();
  }

  async function koordinaten(a) {
    const key = a.toLowerCase().replace(/\s+/g, ' ');
    if (key in geo && (geo[key] || Date.now() - (geo['?' + key] || 0) < 864e5)) return geo[key];
    try {
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(a)}&lang=de&limit=1&lat=48.78&lon=9.18&bbox=5.8,47.2,15.1,55.1`);
      if (!r.ok) throw new Error();
      const f = (await r.json()).features?.[0];
      geo[key] = f ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : null;
      if (!f) geo['?' + key] = Date.now(); // nicht gefunden: morgen noch einmal versuchen
      merken();
      return geo[key];
    } catch { return undefined; } // offline: nicht merken
  }

  let karte = null;
  async function zeigen(el, projekte, info, oeffnen) {
    const setInfo = (t) => { if (info) info.textContent = t; };
    try { await leaflet(); } catch (e) { setInfo(e.message + '. Bitte Internetverbindung prüfen.'); return; }
    if (!el.isConnected) return;
    if (karte) { try { karte.remove(); } catch {} karte = null; }
    karte = L.map(el, { zoomControl: true, attributionControl: true }).setView([48.78, 9.18], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(karte);
    const farbe = (st) => Projekt.farbe(st);
    // Projekte am selben Objekt teilen sich einen Pin
    const orte = new Map(), ohne = [];
    for (const x of projekte) {
      const a = anschrift(x);
      if (!a) { ohne.push(x); continue; }
      if (!orte.has(a)) orte.set(a, []);
      orte.get(a).push(x);
    }
    setInfo(orte.size ? 'Anschriften werden gesucht …' : 'Bei diesen Projekten ist noch keine Objektanschrift eingetragen.');
    const punkte = [], nichtGefunden = [];
    for (const [a, liste] of orte) {
      const c = await koordinaten(a);
      if (!el.isConnected || !karte) return;
      if (!c) { nichtGefunden.push(...liste); continue; }
      const k = Kunden.byId(liste[0].kundeId);
      const icon = L.divIcon({ className: 'mpin-wrap', html: `<div class="mpin" style="--c:${farbe(liste[0].status)}"></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
      const html = `<div class="mpop">${liste.map((x) => `<b>${esc(x.titel || x.room || 'Projekt')}</b>`).join('')}
        <span>${esc([k ? Kunden.name(k) : liste[0].customer, liste[0].nr].filter(Boolean).join(' · '))}</span><span>${esc(a)}</span>
        ${liste.map((x) => `<button data-mo="${x.id}">${liste.length > 1 ? esc(x.titel || x.room || 'Projekt') + ' öffnen' : 'Projekt öffnen'}</button>`).join('')}</div>`;
      L.marker(c, { icon }).addTo(karte).bindPopup(html);
      punkte.push(c);
    }
    karte.on('popupopen', (e) => e.popup.getElement().querySelectorAll('[data-mo]').forEach((b) => (b.onclick = () => oeffnen(b.dataset.mo))));
    if (punkte.length === 1) karte.setView(punkte[0], 14);
    else if (punkte.length) karte.fitBounds(punkte, { padding: [36, 36], maxZoom: 14 });
    const fehlt = [...ohne, ...nichtGefunden];
    const n = projekte.length - fehlt.length;
    setInfo(`${n} ${n === 1 ? 'Projekt' : 'Projekte'} auf der Karte. Pin antippen, dann „Projekt öffnen“.` +
      (fehlt.length ? ` Nicht auf der Karte: ${fehlt.map((x) => x.titel || x.customer || 'Projekt').join(', ')} (${ohne.length && !nichtGefunden.length ? 'keine Objektanschrift' : 'Anschrift nicht gefunden'}).` : ''));
  }

  // ---------- Eigene Seite (Menü › Karte) ----------
  let bereich = 'auftraege';
  const BEREICHE = [['angebote', 'Angebote', (x) => Projekt.phase(x) === 'angebot' && Projekt.norm(x.status) !== 'abgesagt'], ['auftraege', 'Aufträge', (x) => ['einplanen', 'eingeplant', 'laufend'].includes(Projekt.phase(x))], ['alle', 'Alle', () => true]];
  async function view() {
    header('Karte', 'Baustellen an der Objektanschrift');
    const idx = await projectIndex();
    const passt = (BEREICHE.find((b) => b[0] === bereich) || BEREICHE[1])[2];
    const shown = idx.filter(passt);
    main().innerHTML = `<div class="phasen drei">${BEREICHE.map(([id, n, f]) => `<button data-kb="${id}" class="${bereich === id ? 'on' : ''}"><b>${idx.filter(f).length}</b><span>${n}</span></button>`).join('')}</div>
      <div class="pmap" id="pmap"></div><p class="hint pmap-info" id="pmapInfo">Karte wird geladen …</p>`;
    $$('[data-kb]').forEach((b) => (b.onclick = () => { bereich = b.dataset.kb; view(); }));
    zeigen($('#pmap'), shown, $('#pmapInfo'), (id) => { switchTab('projekt', { wohnung: null }); Projekt.oeffnen(id); });
  }

  return { zeigen, anschrift, view };
})();
