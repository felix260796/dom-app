'use strict';
/* DOM – Angebote am Vorgang (seit Version 110, Umbau nach Runde 13).
 *
 * Datenmodell: Kunde → Objekt → Vorgang ('wohnung:<id>') → Angebote ('angebot:<id>', eigener Eintrag) → Fassungen.
 * Bereiche (heute die Räume 'project:<id>') gehören zum Vorgang und werden von allen Angeboten geteilt:
 * Maße, Fotos und Wünsche liegen im Bereich, die Positionen im Angebot.
 *
 *   Angebot { id, vorgangId, n (laufend im Vorgang, 1, 2 …), art: 'haupt' | 'alternative' | 'nachtrag', zuId,
 *             buchstabe ('A', nach Versand und Änderung 'B' …), status: 'entwurf' | 'versendet' | 'zugesagt' | 'abgesagt' | 'nichtGewaehlt',
 *             versendetAm, fassungen: [{ buchstabe, nr, t, gesendetAm, name, brutto }],
 *             inhalt: { bereiche: { [bereichId]: { paket, positionen, mitBild, kalk, anrede, anspr, titel, start } } }, created, updated }
 *   Vorgang  { angebote: [ids], angebotAktiv: id, angebotZaehler }
 *
 * Nummern: Kunde 1001 → Vorgang 1001-01 → Angebot 1001-01-01A. Die Nummer steht ab dem Anlegen fest; bis zum Versand trägt
 * das PDF das Wasserzeichen „Entwurf“. Der Buchstabe wechselt erst, wenn ein verschicktes Angebot geändert wird (neue Fassung).
 *
 * Damit die vorhandenen Angebots-Seiten unverändert weiterlaufen, bekommt jeder geladene Bereich r.angebot als Verweis auf
 * seinen Teil im aktiven Angebot (nicht aufzählbar: wird nie im Raum gespeichert). Wird der Raum gespeichert (kvSet),
 * speichert core.js über merken() auch das Angebot. */
window.AngebotDaten = (() => {
  const cache = new Map(); // id → Angebot (dasselbe Objekt für alle Ansichten)
  const REF = Symbol('angebot');
  const key = (id) => 'angebot:' + id;
  const pad2 = (n) => String(n).padStart(2, '0');
  const BUCHST = (b) => String.fromCharCode((b || 'A').charCodeAt(0) + 1);

  async function laden(id) {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    const a = await kvGet(key(id));
    if (!a) return null;
    normal(a);
    cache.set(id, a);
    return a;
  }
  function normal(a) {
    a.inhalt ??= {}; a.inhalt.bereiche ??= {};
    a.fassungen ??= []; a.buchstabe ||= 'A'; a.status ||= 'entwurf'; a.art ||= 'haupt'; a.n ||= 1;
    return a;
  }
  async function speichern(a) {
    if (!a?.id) return;
    a.updated = Date.now();
    await kvSet(key(a.id), a);
  }
  // Mehrere Räume hintereinander gespeichert: das Angebot nur einmal schreiben
  const offen = new Map();
  function merken(raum) {
    const a = raum?.[REF];
    if (!a) return;
    clearTimeout(offen.get(a.id));
    offen.set(a.id, setTimeout(() => { offen.delete(a.id); speichern(a).catch((e) => console.warn('Angebot nicht gespeichert', e)); }, 150));
  }
  /** Ausstehendes Speichern sofort erledigen (vor PDF, Versand, Seitenwechsel). */
  async function sichern() {
    const ids = [...offen.keys()];
    for (const id of ids) { clearTimeout(offen.get(id)); offen.delete(id); await speichern(cache.get(id)); }
  }
  /** Nach dem Cloud-Abgleich: geändertes Angebot neu lesen. Das Objekt bleibt dasselbe, damit angehängte Bereiche weiter darauf zeigen. */
  async function neuGelesen(id) {
    const alt = cache.get(id);
    if (!alt) return;
    if (offen.has(id)) return; // hier ungespeicherte Änderung: die gewinnt, der Abgleich führt beim nächsten Mal zusammen
    const neu = await kvGet(key(id));
    if (!neu) { cache.delete(id); return; }
    for (const k of Object.keys(alt)) if (!(k in neu)) delete alt[k];
    Object.assign(alt, normal(neu));
  }
  function vergessen(id) { cache.delete(id); }
  /** Vor dem Speichern eines Vorgangs: Angebote, die hier angelegt wurden, nie aus der Liste verlieren
   *  (eine ältere Kopie des Vorgangs im Speicher kennt sie vielleicht noch nicht). */
  function ergaenzen(w) {
    if (!w?.id) return;
    const ids = [...cache.values()].filter((a) => a.vorgangId === w.id).sort((x, y) => x.n - y.n);
    if (!ids.length) return;
    const fehlt = ids.filter((a) => !(w.angebote || []).includes(a.id));
    if (fehlt.length) w.angebote = [...(w.angebote || []), ...fehlt.map((a) => a.id)];
    w.angebotZaehler = Math.max(+w.angebotZaehler || 0, ...ids.map((a) => a.n || 0));
    if (w.nr) for (const a of ids) if (a.vorgangNr !== w.nr) { a.vorgangNr = w.nr; merkenAng(a); }
  }

  // ---------- Nummer ----------
  /** Vollständige Nummer eines Angebots, z. B. 1001-01-01A (leer, solange der Vorgang keine Nummer hat). */
  function nr(a, w) {
    const v = w?.nr || a?.vorgangNr || '';
    if (!a || !v || !/^\d/.test(v)) return a?.nrAlt || '';
    return `${v}-${pad2(a.n)}${a.buchstabe}`;
  }
  /** Nummer ohne Buchstaben (für „Ersetzt Angebot …“, Dateinamen früherer Fassungen). */
  const nrOhne = (a, w) => nr(a, w).replace(/[A-Z]$/, '');

  /** Erstes Angebot eines älteren Vorgangs: Stand aus dem Vorgang übernehmen (verschickt, zugesagt, abgesagt). */
  function standAus(a, w) {
    const P = window.Projekt, st = P?.norm ? P.norm(w.status) : w.status || '';
    const pdf = w.angebotPdf && !w.angebotPdf.extern;
    if (P?.zugesagt?.(w.status)) a.status = 'zugesagt';
    else if (st === 'abgesagt') a.status = 'abgesagt';
    else if (w.angebotGesperrt || (pdf && st === 'angebot' && !w.angebotFrei)) a.status = 'versendet';
    if (a.status !== 'entwurf' && (pdf || w.versendetAm)) a.fassungen.push({ buchstabe: 'A', nr: '', t: w.angebotPdf?.t || Date.now(), gesendetAm: w.versendetAm || '', name: w.angebotPdf?.name || '' });
    a.versendetAm = w.versendetAm || '';
  }

  // ---------- Angebote eines Vorgangs ----------
  async function liste(w) {
    ergaenzen(w);
    const out = [];
    for (const id of w?.angebote || []) { const a = await laden(id); if (a) out.push(a); }
    return out.sort((x, y) => x.n - y.n);
  }
  /** Synchron aus dem Speicher (nur, was schon geladen ist). */
  function listeSync(w) { return (w?.angebote || []).map((id) => cache.get(id)).filter(Boolean).sort((x, y) => x.n - y.n); }
  /** Neues Angebot im Vorgang anlegen (bekommt die nächste laufende Nummer, nie eine schon vergebene). */
  async function neu(w, { art = 'haupt', zuId = '', von = null } = {}) {
    const vorh = await liste(w);
    const n = Math.max(+w.angebotZaehler || 0, ...vorh.map((a) => a.n || 0)) + 1;
    const a = normal({ id: uid(), vorgangId: w.id, n, art, zuId, buchstabe: 'A', status: 'entwurf', created: Date.now(),
      inhalt: { bereiche: von ? JSON.parse(JSON.stringify(von.inhalt?.bereiche || {})) : {} } });
    if (!vorh.length && !von) standAus(a, w);
    a.vorgangNr = w.nr || '';
    cache.set(a.id, a);
    await speichern(a);
    w.angebotZaehler = n;
    w.angebote = [...(w.angebote || []), a.id];
    w.angebotAktiv = a.id;
    const s = state.wohnung;
    if (s && s !== w && s.id === w.id) Object.assign(s, { angebote: w.angebote, angebotZaehler: n, angebotAktiv: a.id });
    if (!w.isNew) await kvSet('wohnung:' + w.id, w);
    return a;
  }
  /** Das Angebot, an dem gerade gearbeitet wird: gewählt, sonst das zugesagte, sonst das Hauptangebot. Legt eins an, wenn es keins gibt. */
  async function aktiv(w, { anlegen = true } = {}) {
    if (!w) return null;
    const l = await liste(w);
    let a = l.find((x) => x.id === w.angebotAktiv)
      || l.find((x) => x.status === 'zugesagt')
      || l.find((x) => x.art === 'haupt' && x.status !== 'nichtGewaehlt') || l[0];
    if (!a && anlegen) a = await neu(w);
    if (a && w.angebotAktiv !== a.id) w.angebotAktiv = a.id;
    if (a && w.nr && a.vorgangNr !== w.nr) { a.vorgangNr = w.nr; merkenAng(a); }
    return a || null;
  }
  function aktivSync(w) {
    const l = listeSync(w);
    return l.find((x) => x.id === w?.angebotAktiv) || l.find((x) => x.status === 'zugesagt') || l.find((x) => x.art === 'haupt') || l[0] || null;
  }
  const merkenAng = (a) => merken({ [REF]: a });

  // ---------- Bereiche anhängen ----------
  /** r.angebot zeigt auf den Teil des aktiven Angebots für diesen Bereich (nicht aufzählbar, wird nicht im Raum gespeichert).
   *  Alte Räume mit eigenem Angebot werden dabei einmalig umgestellt. */
  async function anhaengen(r, w, a) {
    if (!r) return r;
    w ??= r.wohnungId ? (state.wohnung?.id === r.wohnungId ? state.wohnung : await kvGet('wohnung:' + r.wohnungId)) : null;
    if (!w) return r;
    a ??= await aktiv(w);
    if (!a) return r;
    const d = Object.getOwnPropertyDescriptor(r, 'angebot');
    if (r[REF] === a && d && !d.enumerable) return r;
    let alt = null;
    if (d && d.enumerable) { alt = r.angebot; delete r.angebot; }
    if (alt && !a.inhalt.bereiche[r.id]) {
      const { nr, versionen, ...rest } = alt;
      if (nr && !a.nrAlt) a.nrAlt = nr;
      a.inhalt.bereiche[r.id] = rest;
      merkenAng(a);
    }
    Object.defineProperty(r, REF, { value: a, configurable: true, writable: true, enumerable: false });
    Object.defineProperty(r, 'angebot', {
      configurable: true, enumerable: false,
      get() { const b = r[REF].inhalt.bereiche[r.id]; if (b) nrAn(b, r[REF]); return b; },
      set(v) { r[REF].inhalt.bereiche[r.id] = v; },
    });
    if (alt) await kvSet('project:' + r.id, r); // ohne das alte Angebot im Raum
    return r;
  }
  /** r.angebot.nr liefert die Nummer des Angebots (1001-01-01A). Die alten Stellen, die selbst eine Nummer vergeben wollen,
   *  ändern sie damit nicht mehr; nur ohne Vorgangsnummer (kein Kunde) wird die alte Jahresnummer gemerkt. */
  function nrAn(b, a) {
    if (Object.getOwnPropertyDescriptor(b, 'nr')?.get) return;
    delete b.nr;
    Object.defineProperty(b, 'nr', { configurable: true, enumerable: false,
      get: () => nr(a, { nr: a.vorgangNr }),
      set: (v) => { if (!nr(a, { nr: a.vorgangNr })) { a.nrAlt = v; merkenAng(a); } } });
  }
  async function anhaengenAlle(w, list) {
    const a = await aktiv(w);
    for (const r of list) if (r[REF] !== a || Object.getOwnPropertyDescriptor(r, 'angebot')?.enumerable) await anhaengen(r, w, a);
    return a;
  }
  /** Bereich laden und anhängen (für Stellen, die einen Raum direkt aus dem Speicher holen). */
  async function raum(id, w) {
    const r = normalizeProject(await kvGet('project:' + id));
    if (r && r.wohnungId) await anhaengen(r, w);
    return r;
  }
  /** Alle Bereiche eines Angebots mit Positionen: [{ r, A }] (A = Teil des Angebots für den Bereich). */
  async function teile(w, a) {
    a ??= await aktiv(w, { anlegen: false });
    if (!a) return [];
    const out = [];
    for (const id of w.rooms || []) {
      const A = a.inhalt.bereiche[id];
      if (!A?.positionen?.length) continue;
      const r = normalizeProject(await kvGet('project:' + id));
      if (r) out.push({ r, A });
    }
    return out;
  }

  // ---------- Versand, Fassungen, Zusage ----------
  const offenBearb = (a) => !!a && a.status === 'entwurf';
  /** Angebot ist verschickt: Fassung festhalten, ab jetzt gesperrt. */
  async function versendet(w, { datum = '', name = '', brutto = 0 } = {}) {
    const a = await aktiv(w);
    if (!a) return null;
    const n = nr(a, w);
    const f = a.fassungen.find((x) => x.buchstabe === a.buchstabe);
    if (f) Object.assign(f, { gesendetAm: datum || f.gesendetAm, name: name || f.name, brutto: brutto || f.brutto });
    else a.fassungen.push({ buchstabe: a.buchstabe, nr: n, t: Date.now(), gesendetAm: datum, name, brutto });
    if (a.status === 'entwurf') a.status = 'versendet';
    a.versendetAm = datum || a.versendetAm;
    await speichern(a);
    return a;
  }
  /** Verschicktes Angebot ändern: neue Fassung mit dem nächsten Buchstaben (01A → 01B), wieder bearbeitbar. */
  async function neueFassung(w) {
    const a = await aktiv(w);
    if (!a) return null;
    const alt = nr(a, w);
    a.ersetzt = { nr: alt, t: a.fassungen.find((x) => x.buchstabe === a.buchstabe)?.t || Date.now() };
    a.buchstabe = BUCHST(a.buchstabe);
    a.status = 'entwurf';
    await speichern(a);
    return a;
  }
  /** Alternative zu einem Angebot: Kopie mit eigener Nummer (01A → 02A). */
  async function alternative(w, von) {
    von ??= await aktiv(w);
    const a = await neu(w, { art: 'alternative', zuId: von?.id || '', von });
    return a;
  }
  /** Kunde hat zugesagt: dieses Angebot gilt, alle anderen offenen werden „nicht gewählt“. */
  async function zusagen(w, a) {
    a ??= await aktiv(w);
    if (!a) return;
    for (const x of await liste(w)) {
      if (x.id === a.id) x.status = 'zugesagt';
      else if (['entwurf', 'versendet'].includes(x.status)) x.status = 'nichtGewaehlt';
      else continue;
      await speichern(x);
    }
    w.angebotAktiv = a.id;
  }
  async function absagen(w) {
    for (const x of await liste(w)) if (['entwurf', 'versendet'].includes(x.status)) { x.status = 'abgesagt'; await speichern(x); }
  }
  /** Status des Vorgangs wurde von Hand gesetzt: Stand des aktiven Angebots nachziehen. */
  async function standVomVorgang(w) {
    const P = window.Projekt, st = P.norm(w.status);
    if (P.zugesagt(w.status)) return zusagen(w);
    if (st === 'abgesagt') return absagen(w);
    const a = await aktiv(w);
    if (!a) return;
    const vorher = a.status;
    if (st === 'angebot' && a.status === 'entwurf') return versendet(w, { datum: w.versendetAm });
    if (['besichtigung', 'entwurf', 'angebot'].includes(st) && ['zugesagt', 'abgesagt', 'nichtGewaehlt'].includes(a.status)) {
      a.status = a.fassungen.some((f) => f.buchstabe === a.buchstabe) ? 'versendet' : 'entwurf';
      for (const x of await liste(w)) if (x !== a && x.status === 'nichtGewaehlt') { x.status = x.fassungen.length ? 'versendet' : 'entwurf'; await speichern(x); }
    }
    if (a.status !== vorher) await speichern(a);
  }
  /** Aktives Angebot wechseln: Bereiche neu anhängen. */
  async function waehlen(w, id, list = []) {
    const a = await laden(id);
    if (!a) return null;
    w.angebotAktiv = id;
    for (const r of list) await anhaengen(r, w, a);
    return a;
  }

  const STAND = { entwurf: 'Entwurf', versendet: 'Versendet', zugesagt: 'Zugesagt', abgesagt: 'Abgesagt', nichtGewaehlt: 'Nicht gewählt' };
  return { REF, laden, speichern, merken, sichern, neuGelesen, vergessen, ergaenzen, nr, nrOhne, liste, listeSync, neu, aktiv, aktivSync, anhaengen, anhaengenAlle, raum, teile,
    versendet, neueFassung, alternative, zusagen, absagen, standVomVorgang, waehlen, offenBearb, STAND };
})();

/* Transkript als Zeilenliste (seit v110): w.gespraech.zeilen = [{ id, aufnahmeId, sprecher, text, bereichId }],
 * w.gespraech.aufnahmen = [{ id, art, t, dabei }]. w.gespraech.transcript bleibt als Text daneben stehen (wird daraus gebaut),
 * damit alles, was das Gespräch liest (KI, PDF, Suche), unverändert weiterläuft. Später können Zeilen einem Bereich
 * zugeordnet, verschoben oder abgehakt werden (Prüfseite im Büro). */
window.Transkript = (() => {
  const KOPF = /^---\s*(.*?)\s*·\s*(\d{1,2}\.\d{1,2}\.\d{4})(?:\s*·\s*dabei:\s*(.*?))?\s*---$/;
  const SPR = /^([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß .\-]{0,29}):\s*(.*)$/;
  const datum = (s) => { const [d, m, y] = s.split('.').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
  /** Text (wie bisher: Überschrift je Aufnahme, Zeilen „Name: …“) in Aufnahmen und Zeilen zerlegen. */
  function zerlegen(text, aufnahmen = []) {
    const out = { aufnahmen: [], zeilen: [] };
    let auf = null;
    for (const roh of String(text || '').split(/\r?\n/)) {
      const z = roh.trim();
      if (!z) continue;
      const k = KOPF.exec(z);
      if (k) {
        const t = datum(k[2]);
        const alt = aufnahmen.find((a) => a.art === k[1] && new Date(a.t).toDateString() === new Date(t).toDateString() && !out.aufnahmen.includes(a));
        auf = alt || { id: uid(), art: k[1], t, dabei: k[3] ? k[3].split(/,\s*/).filter(Boolean) : [] };
        out.aufnahmen.push(auf);
        continue;
      }
      const s = SPR.exec(z);
      out.zeilen.push({ id: uid(), aufnahmeId: auf?.id || '', sprecher: s ? s[1].trim() : '', text: s ? s[2] : z, bereichId: '' });
    }
    return out;
  }
  const kopf = (a) => `--- ${a.art || 'Gespräch'} · ${new Date(a.t).toLocaleDateString('de-DE')}${a.dabei?.length ? ` · dabei: ${a.dabei.join(', ')}` : ''} ---`;
  const zeile = (z) => (z.sprecher ? `${z.sprecher}: ${z.text}` : z.text);
  /** Zeilen wieder als Text (gleiches Format wie früher). */
  function text(g) {
    const ohne = (g.zeilen || []).filter((z) => !z.aufnahmeId || !(g.aufnahmen || []).some((a) => a.id === z.aufnahmeId));
    const bl = [];
    if (ohne.length) bl.push(ohne.map(zeile).join('\n'));
    for (const a of g.aufnahmen || []) bl.push([kopf(a), ...(g.zeilen || []).filter((z) => z.aufnahmeId === a.id).map(zeile)].join('\n'));
    return bl.join('\n\n');
  }
  /** Ältere Gespräche (nur Text) einmal in Zeilen zerlegen. Der Text bleibt, wie er war. */
  function sicher(g) {
    if (!g || Array.isArray(g.zeilen)) return g;
    const { aufnahmen, zeilen } = zerlegen(g.transcript);
    g.aufnahmen = aufnahmen; g.zeilen = zeilen;
    return g;
  }
  /** Neue Aufnahme anhängen (Text der KI mit „Name: …“ je Zeile). */
  function anhaengen(g, { art, dabei, text: t }) {
    sicher(g);
    const a = { id: uid(), art: art || 'Gespräch', t: Date.now(), dabei: dabei || [] };
    g.aufnahmen.push(a);
    for (const z of zerlegen(t).zeilen) g.zeilen.push({ ...z, aufnahmeId: a.id });
    g.transcript = text(g);
    return a;
  }
  /** Ganzes Gespräch von Hand geändert: neu zerlegen, Zuordnungen gleicher Zeilen behalten. */
  function ausText(g, t) {
    sicher(g);
    const alt = new Map(g.zeilen.map((z) => [zeile(z), z]));
    const neu = zerlegen(t, g.aufnahmen);
    g.aufnahmen = neu.aufnahmen;
    g.zeilen = neu.zeilen.map((z) => { const a = alt.get(zeile(z)); return a ? { ...z, id: a.id, bereichId: a.bereichId || '' } : z; });
    g.transcript = t;
  }
  return { zerlegen, text, sicher, anhaengen, ausText };
})();
