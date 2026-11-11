'use strict';
/* DOM – iPhone-Funktionen der App aus TestFlight: Dokumentenscanner, LiDAR-Raumscan, Face ID, Termine im iPhone-Kalender,
 * Kontakte, „An DOM teilen“ und die Gesprächsaufnahme, die im Hintergrund weiterläuft (aufnahme, für voice.js). Gegenstück: ios-resources/DomGeraet.swift (Plugin „DomGeraet“, nur in der iPhone-App).
 * Jede Funktion hat einen Schalter, der nur für DIESES Gerät gilt (localStorage, wird nicht abgeglichen):
 * Geschäftshandy mit Kalender und Kontakten, Privathandy oder iPad ohne. Kalender und Kontakte sind anfangs aus.
 * Einstellungen › iPhone-Funktionen (Seite 'iphone' in vorgaben.js, Kopf = karte()). Gemeinsame Vorgaben dort:
 * faceIdNach, kalenderErinnerung. Die Route für heute (heute.js) braucht kein Plugin und läuft überall. */
window.Geraet = (() => {
  const LS = 'dom:geraet', LSK = 'dom:geraet-kal';
  const STANDARD = { scanner: true, lidar: true, teilen: true, faceid: false, kalender: false, kontakte: false };
  const FUNKTIONEN = [
    ['scanner', 'Dokumentenscanner', 'Kamera oben: Rechnungen und Briefe scannen, das iPhone erkennt die Ränder und mehrere Seiten.'],
    ['lidar', 'Raum scannen (LiDAR)', 'Vor Ort und im Aufmaß: Raum abfahren. Daraus werden Grundriss, 3D-Modell und die Maße im Aufmaß. Nur iPhone Pro und iPad Pro.'],
    ['teilen', '„An DOM teilen“', 'PDFs und Bilder aus Mail, WhatsApp oder Dateien über „Teilen“ an DOM schicken.'],
    ['faceid', 'Face ID beim Öffnen', 'DOM ist gesperrt, bis du dich mit Face ID oder dem Gerätecode meldest.'],
    ['kalender', 'Termine im iPhone-Kalender', 'Deine DOM-Termine erscheinen im eigenen Kalender „DOM“. Ausschalten nimmt ihn wieder vom Gerät.'],
    ['kontakte', 'iPhone-Kontakte', 'Beim Kunden: aus den Kontakten übernehmen und als Kontakt speichern.'],
  ];
  const nativ = () => !!window.Capacitor?.isNativePlatform?.() && !!window.capacitorExports;
  let plugin = null;
  const P = () => (plugin ||= window.capacitorExports.registerPlugin('DomGeraet'));
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const schalter = () => ({ ...STANDARD, ...lsGet(LS, {}) });
  const an = (k) => nativ() && !!schalter()[k];
  const setzen = (k, v) => lsSet(LS, { ...lsGet(LS, {}), [k]: v });

  // Was kann dieses Gerät? (Scanner, LiDAR, Face ID) – einmal fragen, dann merken
  let faehig = null;
  async function faehigkeiten() {
    if (!nativ()) return {};
    if (!faehig) faehig = await P().faehigkeiten().catch(() => ({}));
    return faehig;
  }
  /** Funktion eingeschaltet und auf diesem Gerät möglich? (synchron, für Knöpfe beim Zeichnen) */
  const kann = (k) => an(k) && (k === 'scanner' ? faehig?.scanner !== false : k === 'lidar' ? !!faehig?.lidar : true);

  // ---------- Face ID beim Öffnen ----------
  let gesperrt = false, pruefe = false, weg = 0;
  function sperren() {
    if (gesperrt) return;
    gesperrt = true;
    const d = document.createElement('div');
    d.id = 'geraetSperre';
    d.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#14263b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px';
    d.innerHTML = '<img src="assets/dom_logo_weiss.png" alt="DOM" style="width:120px;opacity:.95"><button type="button" style="font:600 17px -apple-system,system-ui,sans-serif;color:#14263b;background:#fff;border:0;border-radius:12px;padding:13px 28px">Entsperren</button>';
    d.querySelector('button').onclick = entsperren;
    document.body.appendChild(d);
  }
  async function entsperren() {
    if (pruefe) return;
    pruefe = true;
    const r = await P().entsperren({ grund: 'DOM entsperren' }).catch(() => ({ ok: false }));
    pruefe = false;
    if (r.ok) { gesperrt = false; document.getElementById('geraetSperre')?.remove(); }
  }
  function faceIdStart() {
    if (!an('faceid')) return;
    sperren(); entsperren();
  }
  document.addEventListener('visibilitychange', () => {
    if (!nativ()) return;
    if (document.hidden) { if (!pruefe && !gesperrt) weg = Date.now(); return; }
    const nach = Math.max(0, +vorgabe('faceIdNach') || 0) * 60000;
    if (an('faceid') && !gesperrt && weg && Date.now() - weg >= nach) faceIdStart();
    setTimeout(kalenderAbgleich, 1500);
  });

  // ---------- Dokumentenscanner ----------
  /** Scannt ein Dokument. Mehrere Seiten werden untereinander zu einem Bild zusammengesetzt. Liefert eine Bild-Adresse oder ''. */
  async function scannen() {
    const r = await P().scannen();
    const seiten = r?.seiten || [];
    if (seiten.length <= 1) return seiten[0] || '';
    const bilder = await Promise.all(seiten.map(loadImg));
    const breite = Math.min(1600, Math.max(...bilder.map((b) => b.naturalWidth)));
    const hoehen = bilder.map((b) => Math.round(b.naturalHeight * (breite / b.naturalWidth)));
    const c = document.createElement('canvas');
    c.width = breite; c.height = hoehen.reduce((s, h) => s + h, 0) + 12 * (bilder.length - 1);
    const x = c.getContext('2d');
    x.fillStyle = '#ddd'; x.fillRect(0, 0, c.width, c.height);
    let y = 0;
    bilder.forEach((b, i) => { x.drawImage(b, 0, y, breite, hoehen[i]); y += hoehen[i] + 12; });
    return c.toDataURL('image/jpeg', 0.82);
  }

  // ---------- LiDAR-Raumscan ----------
  /** { laenge, breite, hoehe, flaeche, tueren:[{breite,hoehe}], fenster:[…], geo } oder null bei Abbruch. geo = ganzer Raum für raumscan.js */
  async function raumScannen() {
    const r = await P().raumScannen();
    return r?.abgebrochen ? null : r;
  }

  // ---------- Kontakte ----------
  const kontaktWaehlen = async () => { const r = await P().kontaktWaehlen(); return r && (r.name || r.vorname || r.firma) ? r : null; };
  const kontaktSpeichern = (daten) => P().kontaktSpeichern(daten);

  // ---------- Termine im iPhone-Kalender ----------
  // Merkt sich je Termin die Kennung im iPhone-Kalender und einen Fingerabdruck, damit nur Geändertes neu geschrieben wird.
  const isoTag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function eintrag(t) {
    const k = window.Kunden?.byId(t.kundeId);
    const start = new Date(`${t.datum}T${t.ganztag || !t.von ? '00:00' : t.von}`).getTime();
    let ende = t.ganztag || !t.von ? start + 864e5 - 60000 : new Date(`${t.datum}T${t.bis || t.von}`).getTime();
    if (!(ende > start)) ende = start + 3600000;
    return {
      titel: t.titel || 'Termin', ort: t.ort || '', ganztag: !!(t.ganztag || !t.von), start, ende,
      notiz: [k && `${Kunden.name(k)}${k.telefon ? ' · ' + k.telefon : ''}`, t.notiz].filter(Boolean).join('\n'),
      erinnerung: Math.max(0, +vorgabe('kalenderErinnerung') || 0),
    };
  }
  let kalLaeuft = false, kalNochmal = false;
  async function kalenderAbgleich() {
    if (!an('kalender') || !window.Kalender?.eintraege || !window.appGestartet) return;
    if (kalLaeuft) { kalNochmal = true; return; }
    kalLaeuft = true;
    try {
      const h = new Date(), v = new Date(); v.setDate(v.getDate() - 14);
      const b = new Date(); b.setDate(h.getDate() + 400);
      const von = isoTag(v), bis = isoTag(b);
      const meine = Kalender.eintraege(von, bis).filter((t) => t.typ === 'termin');
      const m = lsGet(LSK, {});
      const neu = [], zu = [];
      for (const t of meine) {
        const e = eintrag(t), fp = JSON.stringify(e);
        if (m[t.id]?.f === fp && m[t.id]?.e) continue;
        neu.push({ ...e, eventId: m[t.id]?.e || '' }); zu.push([t.id, fp, t.datum]);
      }
      if (neu.length) {
        const r = await P().kalenderSchreiben({ eintraege: neu });
        (r?.ids || []).forEach((e, i) => { if (zu[i]) m[zu[i][0]] = { e, f: zu[i][1], d: zu[i][2] }; });
      }
      // Gelöschte oder nicht mehr eigene Termine vom iPhone nehmen, alte (vor dem Zeitraum) nur vergessen
      const da = new Set(meine.map((t) => t.id)), raus = [];
      for (const [id, x] of Object.entries(m)) {
        if (da.has(id)) continue;
        if (x.d && x.d < von) { delete m[id]; continue; }
        if (x.e) raus.push(x.e);
        delete m[id];
      }
      if (raus.length) await P().kalenderLoeschen({ ids: raus });
      lsSet(LSK, m);
    } catch (e) { console.warn('Kalender', e); }
    kalLaeuft = false;
    if (kalNochmal) { kalNochmal = false; kalenderAbgleich(); }
  }

  // ---------- „An DOM teilen“ ----------
  async function geteilteHolen() {
    if (!nativ()) return;
    const r = await P().geteilteHolen().catch(() => null);
    const dateien = r?.dateien || [];
    if (!dateien.length) return;
    if (!an('teilen')) return toast('„An DOM teilen“ ist auf diesem Gerät ausgeschaltet (Einstellungen › iPhone-Funktionen).', 5000);
    for (const d of dateien) await window.Kamera?.ausDatei(d).catch((e) => toast('Datei: ' + e.message, 5000));
  }

  // ---------- Einstellungen › iPhone-Funktionen: Schalter für dieses Gerät ----------
  async function karte(el) {
    if (!nativ()) {
      el.innerHTML = `<div class="sec-h"><h2>Dieses Gerät</h2></div><div class="card"><p class="muted" style="margin:0">Diese Funktionen gibt es nur in der DOM-App aus TestFlight, nicht in der Homebildschirm-App oder im Browser.</p></div>`;
      return;
    }
    const f = await faehigkeiten(), s = schalter();
    const moeglich = (k) => (k === 'scanner' ? f.scanner !== false : k === 'lidar' ? !!f.lidar : true);
    el.innerHTML = `<div class="sec-h"><h2>Dieses Gerät</h2></div>
      <p class="hint" style="margin-top:-4px">Die Schalter gelten nur für dieses Gerät. So hast du Kalender und Kontakte auf dem Geschäftshandy und nicht auf dem privaten iPhone oder iPad.</p>
      <div class="card kform">${FUNKTIONEN.map(([k, l, h]) => `
        <label class="check" style="margin-top:10px"><input type="checkbox" data-gs="${k}" ${s[k] && moeglich(k) ? 'checked' : ''} ${moeglich(k) ? '' : 'disabled'}>${esc(k === 'faceid' && f.biometrieArt ? l.replace('Face ID', f.biometrieArt) : l)}</label>
        <p class="hint" style="margin:2px 0 0 30px">${esc(moeglich(k) ? h : 'Geht auf diesem Gerät nicht.')}</p>`).join('')}</div>`;
    $$('[data-gs]', el).forEach((cb) => (cb.onchange = async () => {
      const k = cb.dataset.gs, ein = cb.checked;
      cb.disabled = true;
      try {
        if (k === 'faceid' && ein) {
          const r = await P().entsperren({ grund: 'Face ID für DOM einschalten' });
          if (!r.ok) { cb.checked = false; return; }
        }
        if (k === 'kalender' && ein) {
          const r = await P().kalenderErlaubnis();
          if (!r.ok) { cb.checked = false; return toast('Kein Zugriff auf den Kalender. In den iPhone-Einstellungen bei DOM unter „Kalender“ erlauben.', 6000); }
        }
        if (k === 'kalender' && !ein) { await P().kalenderAus().catch(() => {}); lsSet(LSK, {}); }
        setzen(k, ein);
        if (k === 'kalender' && ein) { toast('Termine werden in den Kalender „DOM“ eingetragen'); kalenderAbgleich(); } else toast('Gespeichert');
      } finally { cb.disabled = false; }
    }));
  }

  /** Nach dem Start der App: Fähigkeiten holen, Kalender abgleichen, geteilte Dateien abholen. */
  function start() {
    if (!nativ()) return;
    faehigkeiten();
    setTimeout(kalenderAbgleich, 2500);
    geteilteHolen();
    P().addListener('geteilt', () => geteilteHolen()).catch(() => {});
  }

  // Face ID sofort beim Laden, noch bevor Daten zu sehen sind
  if (nativ()) { faehigkeiten(); faceIdStart(); }

  // ---------- Gesprächsaufnahme, die durchläuft (voice.js) ----------
  // Ohne Schalter: in der iPhone-App immer nativ, weil nur so die Aufnahme bei Sperre, Kamera und Video weiterläuft.
  const aufnahme = {
    start: () => P().aufnahmeStart(),
    pause: () => P().aufnahmePause().catch(() => {}),
    weiter: () => P().aufnahmeWeiter().catch(() => {}),
    status: () => P().aufnahmeStatus().catch(() => ({})),
    /** Beenden; liefert die fertige Aufnahme als Blob (m4a). */
    async stopp() {
      const r = await P().aufnahmeStopp();
      let blob = null;
      try { const u = window.Capacitor?.convertFileSrc?.('file://' + r.pfad); if (u) { const x = await fetch(u); if (x.ok) blob = await x.blob(); } } catch {}
      if (!blob?.size) blob = await (await fetch((await P().aufnahmeLesen({ pfad: r.pfad })).data)).blob();
      return new Blob([blob], { type: 'audio/mp4' });
    },
  };

  return { nativ, an, kann, faehigkeiten, aufnahme, scannen, raumScannen, kontaktWaehlen, kontaktSpeichern, kalenderAbgleich, karte, start };
})();
