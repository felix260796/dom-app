'use strict';
/* DOM – Kunden: Kundenkarte mit Kontaktdaten, Objekten (Anschriften) und Projekten.
 * Speicher: 'kunde:<id>' { id, kind:'kunde', anrede, vorname, name, telefon, email, geburtstag (JJJJ-MM-TT),
 *   privat (Privatanschrift, eine Zeile mit Kommas), objekte:[{ id, name, adresse, notiz }], notiz, nr, created, updated }
 * Ein Projekt ('wohnung:<id>') gehört zu einem Kunden (kundeId) und einem seiner Objekte (objektId).
 * Nummern: Kundennummer fortlaufend ab 1001, Projektnummer = Kundennummer-laufende Nummer (1001-01, 1001-02).
 * So sieht man an jeder Projektnummer sofort, zu welchem Kunden sie gehört.
 * w.customer und w.address bleiben als Anzeige-Kopie erhalten (Angebot, Mappen, Baumappe, Cloud-Abgleich).
 * Alle Kunden liegen beim Start im Speicher (sind klein), dadurch ist die Suche sofort da.
 * Baut auf core.js/app.js/projekt.js auf (state, kvGet/kvSet/kvDel, db, header, icon, sheet, …). */
window.Kunden = (() => {
  const alle = new Map();
  const key = (id) => 'kunde:' + id;
  const ANREDEN = [['', '–'], ['Herr', 'Herr'], ['Frau', 'Frau'], ['Familie', 'Familie'], ['Firma', 'Firma']];

  // ---------- Daten ----------
  const norm = (k) => {
    for (const f of ['anrede', 'vorname', 'name', 'telefon', 'email', 'geburtstag', 'privat', 'notiz', 'nr']) k[f] = String(k[f] ?? '');
    k.objekte = Array.isArray(k.objekte) ? k.objekte.filter(Boolean) : [];
    for (const o of k.objekte) { o.id ??= uid(); o.name = String(o.name ?? ''); o.adresse = String(o.adresse ?? ''); o.notiz = String(o.notiz ?? ''); }
    return k;
  };
  const neu = (f = {}) => norm({ id: uid(), kind: 'kunde', created: Date.now(), ...f });
  async function laden() {
    const d = await db();
    const list = await new Promise((res, rej) => {
      const q = d.transaction('kv').objectStore('kv').getAll(IDBKeyRange.bound('kunde:', 'kunde:\uffff'));
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const offen = state.kunde, tippt = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    alle.clear();
    for (const k of list) if (k?.id) alle.set(k.id, norm(k));
    // Offene Kundenkarte: während getippt wird, bleibt das bearbeitete Objekt maßgeblich
    if (offen && !offen.isNew) {
      if (!alle.has(offen.id)) state.kunde = null;
      else if (tippt) alle.set(offen.id, offen);
      else state.kunde = alle.get(offen.id);
    }
  }
  const byId = (id) => (id ? alle.get(id) : null) || null;
  const liste = () => [...alle.values()].sort((a, b) => sortName(a).localeCompare(sortName(b), 'de'));
  const sortName = (k) => `${k.name} ${k.vorname}`.trim().toLowerCase() || '~';

  /** Anzeigename: „Familie Müller“, „Herr Max Müller“, „Müller GmbH“. */
  function name(k) {
    if (!k) return '';
    const n = [k.vorname, k.name].map((s) => s.trim()).filter(Boolean).join(' ');
    if (k.anrede === 'Familie') return `Familie ${k.name.trim() || k.vorname.trim()}`.trim();
    if (k.anrede === 'Herr' || k.anrede === 'Frau') return n ? `${k.anrede} ${n}` : '';
    return n;
  }
  /** Anrede im Brief. */
  function briefAnrede(k) {
    const nn = k?.name.trim();
    if (!k || !(nn || k.vorname.trim())) return 'Sehr geehrte Damen und Herren,';
    if (k.anrede === 'Herr' && nn) return `Sehr geehrter Herr ${nn},`;
    if (k.anrede === 'Frau' && nn) return `Sehr geehrte Frau ${nn},`;
    if (k.anrede === 'Familie') return `Sehr geehrte Familie ${nn || k.vorname.trim()},`;
    if (k.anrede === 'Firma') return 'Sehr geehrte Damen und Herren,';
    return `Guten Tag ${name(k)},`;
  }
  const zeilen = (s) => String(s || '').split(/\s*,\s*|\n/).map((x) => x.trim()).filter(Boolean);
  const einzeilig = (s) => zeilen(s).join(', ');
  const objekt = (k, oid) => k?.objekte.find((o) => o.id === oid) || null;
  const objektText = (o) => (o ? [o.name.trim(), einzeilig(o.adresse)].filter(Boolean).join(' · ') : '');
  /** Kurze Ortsangabe für die Liste: erstes Objekt, sonst Privatanschrift. */
  const ort = (k) => einzeilig(k.objekte.find((o) => o.adresse.trim())?.adresse || k.privat);
  const initialen = (k) => (((k.anrede === 'Familie' || !k.vorname.trim() ? '' : k.vorname.trim()[0]) + (k.name.trim()[0] || '')) || name(k)[0] || '?').toUpperCase();

  /** Aus einem freien Namen („Familie Müller“, „Max Müller“) eine Kundenkarte machen. */
  function ausName(text) {
    let t = String(text || '').trim(), anrede = '';
    const m = t.match(/^(familie|herr|frau|firma)\s+/i);
    if (m) { anrede = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); t = t.slice(m[0].length).trim(); }
    if (/\b(gmbh|ag|kg|ug|e\.?\s?k\.?|gbr|ohg|verwaltung|hausverwaltung|weg)\b/i.test(t)) return { anrede: anrede || 'Firma', vorname: '', name: t };
    if (anrede === 'Familie' || anrede === 'Firma') return { anrede, vorname: '', name: t };
    const teile = t.split(/\s+/).filter(Boolean);
    if (teile.length < 2) return { anrede, vorname: '', name: t };
    return { anrede, vorname: teile.slice(0, -1).join(' '), name: teile[teile.length - 1] };
  }

  // ---------- Nummern ----------
  const ERSTE = 1001;
  const naechsteNr = () => String(Math.max(ERSTE - 1, ...[...alle.values()].map((k) => parseInt(k.nr, 10) || 0)) + 1);
  /** Projektnummer für ein Projekt: bleibt, solange es beim selben Kunden ist, sonst die nächste freie. */
  async function projektNr(w, idx) {
    const k = byId(w.kundeId);
    if (!k?.nr) return w.nr || '';
    if (String(w.nr || '').startsWith(k.nr + '-')) return w.nr;
    const n = Math.max(0, ...(idx || (await projectIndex())).filter((x) => x.id !== w.id && String(x.nr || '').startsWith(k.nr + '-')).map((x) => parseInt(x.nr.split('-')[1], 10) || 0)) + 1;
    return `${k.nr}-${String(n).padStart(2, '0')}`;
  }
  /** Fehlende Nummern nachtragen: Kunden in der Reihenfolge, in der sie angelegt wurden, danach ihre Projekte. */
  async function nummern() {
    for (const k of [...alle.values()].filter((k) => !k.nr).sort((a, b) => (a.created || 0) - (b.created || 0) || a.id.localeCompare(b.id))) {
      k.nr = naechsteNr(); await speichern(k, true);
    }
    const idx = await projectIndex();
    let changed = false;
    for (const x of [...idx].sort((a, b) => (a.created || 0) - (b.created || 0))) {
      if (x.kind !== 'wohnung' || !x.kundeId) continue;
      const k = byId(x.kundeId);
      if (!k?.nr || String(x.nr || '').startsWith(k.nr + '-')) continue;
      const w = await kvGet('wohnung:' + x.id);
      if (!w) continue;
      w.nr = await projektNr(w, idx);
      await kvSet('wohnung:' + w.id, w);
      x.nr = w.nr; changed = true;
    }
    if (changed) await kvSet('projectIndex', idx);
  }

  async function speichern(k, still) {
    if (!k.nr) k.nr = naechsteNr();
    if (still) { alle.set(k.id, k); return kvSet(key(k.id), k); }
    delete k.isNew;
    k.updated = Date.now();
    alle.set(k.id, k);
    await kvSet(key(k.id), k);
  }
  /** Name/Anschrift in alle Projekte des Kunden übernehmen (verzögert, während getippt wird). */
  const weitergeben = debounce(async (k) => {
    const idx = await projectIndex();
    for (const x of idx.filter((x) => x.kundeId === k.id)) await window.Projekt?.kundeUebernehmen(x.id);
  }, 700);

  /** Kommender Geburtstag: Tage bis dahin (0 = heute) oder null. */
  function bisGeburtstag(k) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k.geburtstag || '');
    if (!m) return null;
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    let g = new Date(heute.getFullYear(), +m[2] - 1, +m[3]);
    if (g < heute) g = new Date(heute.getFullYear() + 1, +m[2] - 1, +m[3]);
    return Math.round((g - heute) / 864e5);
  }
  const gebText = (n) => (n === 0 ? 'Geburtstag heute' : n === 1 ? 'Geburtstag morgen' : `Geburtstag in ${n} Tagen`);
  const alter = (k) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k.geburtstag || ''); if (!m) return null;
    const h = new Date(); let a = h.getFullYear() - +m[1];
    if (h.getMonth() + 1 < +m[2] || (h.getMonth() + 1 === +m[2] && h.getDate() < +m[3])) a--;
    return a >= 0 && a < 130 ? a : null;
  };

  // ---------- Umstellung: bestehende Projekte bekommen einen Kunden ----------
  const slug = (s) => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const gleich = (a, b) => einzeilig(a).toLowerCase() === einzeilig(b).toLowerCase();
  /** Gleicher Name = gleicher Kunde, die Projektadresse wird sein Objekt.
   * Die IDs werden aus Name und Adresse abgeleitet, damit zwei Geräte (Cloud-Abgleich) dasselbe Ergebnis erzeugen. */
  async function migrate() {
    const idx = await projectIndex();
    let changed = false;
    for (const x of idx) {
      if (x.kind !== 'wohnung') continue;
      const w = await kvGet('wohnung:' + x.id);
      if (!w) continue;
      if (w.kundeId) { if (x.kundeId !== w.kundeId || (x.objektId || '') !== (w.objektId || '')) { x.kundeId = w.kundeId; x.objektId = w.objektId || ''; changed = true; } continue; }
      const nm = String(w.customer || '').trim();
      const kid = nm ? 'k-' + slug(nm) : 'k' + w.id;
      let k = byId(kid) || (await kvGet(key(kid)));
      k = k ? norm(k) : neu({ ...ausName(nm), id: kid, created: w.created || Date.now() });
      let o = null;
      if (String(w.address || '').trim()) {
        o = k.objekte.find((y) => gleich(y.adresse, w.address));
        if (!o) { o = { id: 'o-' + slug(w.address), name: '', adresse: String(w.address).trim() }; k.objekte.push(o); }
      }
      await speichern(k);
      w.kundeId = k.id; w.objektId = o?.id || '';
      await kvSet('wohnung:' + w.id, w);
      for (const rid of w.rooms || []) {
        const r = await kvGet('project:' + rid);
        if (r && r.kundeId !== k.id) { r.kundeId = k.id; await kvSet('project:' + rid, r); }
      }
      x.kundeId = k.id; x.objektId = w.objektId; changed = true;
    }
    if (changed) await kvSet('projectIndex', idx);
  }

  // ---------- Auswahl (Kunde / Objekt) ----------
  /** Kunde wählen oder neu anlegen → Kunde | null. */
  async function waehlen(title = 'Für welchen Kunden?') {
    const items = liste().map((k) => ({ label: name(k) || 'Ohne Namen', sub: ort(k), icon: `<span class="av sm">${esc(initialen(k))}</span>`, value: k.id }));
    const v = await sheet(title, items, { text: 'Neuer Kunde, z. B. Familie Müller' });
    if (!v) return null;
    if (v.text) { const k = neu(ausName(v.text)); await speichern(k); return k; }
    return byId(v);
  }
  /** Objekt des Kunden wählen oder neue Anschrift eingeben → Objekt-ID | '' (ohne) | null (abgebrochen). */
  async function objektWaehlen(k, title = 'Für welches Objekt?') {
    const items = k.objekte.map((o) => ({ label: o.name.trim() || einzeilig(o.adresse) || 'Objekt ohne Anschrift', sub: o.name.trim() ? einzeilig(o.adresse) : '', icon: icon('home'), value: o.id }));
    if (k.privat.trim() && !k.objekte.some((o) => gleich(o.adresse, k.privat))) items.push({ label: einzeilig(k.privat), sub: 'Privatanschrift', icon: icon('user'), value: '__privat' });
    if (!items.length) {
      const v = await sheet('Anschrift des Objekts', [{ label: 'Später eintragen', value: '__ohne' }], { text: 'Straße Nr., PLZ Ort' });
      if (!v) return null;
      if (v === '__ohne') return '';
      return objektNeu(k, v.text);
    }
    const v = await sheet(title, items, { text: 'Neue Anschrift: Straße Nr., PLZ Ort' });
    if (!v) return null;
    if (v.text) return objektNeu(k, v.text);
    if (v === '__privat') return objektNeu(k, k.privat, 'Privat');
    return v;
  }
  async function objektNeu(k, adresse, nm = '') {
    const o = { id: uid(), name: nm, adresse: String(adresse || '').trim() };
    k.objekte.push(o); await speichern(k);
    return o.id;
  }
  /** Neues Projekt für einen Kunden (Objekt wird abgefragt). */
  async function projektAnlegen(k) {
    const oid = await objektWaehlen(k);
    if (oid === null) return;
    window.Projekt.neuFuer(k, oid);
  }

  // ---------- Ansicht: Kundenliste ----------
  let filter = '';
  function treffer(k, idx, q) {
    if (!q) return true;
    const proj = idx.filter((x) => x.kundeId === k.id).map((x) => `${x.address || ''} ${x.room || ''} ${x.titel || ''} ${x.nr || ''}`).join(' ');
    const hay = `${k.nr} ${name(k)} ${k.vorname} ${k.name} ${k.telefon} ${k.email} ${k.privat} ${k.notiz} ${k.objekte.map((o) => `${o.name} ${o.adresse} ${o.notiz}`).join(' ')} ${proj}`.toLowerCase();
    return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }
  async function start() {
    const o = state.kunde && objekt(state.kunde, state.objekt);
    return o ? objektView(state.kunde, o) : state.kunde ? detail(state.kunde) : listeView();
  }
  async function listeView() {
    state.kunde = null; state.objekt = null;
    header('Kunden', state.settings.company || '');
    const idx = await projectIndex();
    const all = liste();
    main().innerHTML = `
      <label class="search big">${icon('search')}<input type="search" id="kq" value="${esc(filter)}" placeholder="Name, Straße, Ort, Telefon oder Nummer" autocomplete="off"></label>
      <button class="cta" id="kNew">
        <span class="cta-ico">${icon('plus')}</span>
        <span class="cta-t"><b>Neuer Kunde</b><span>Kontaktdaten, Objekte und Projekte an einem Ort</span></span>
        ${icon('chevron', 'cta-chev')}
      </button>
      ${state.settings.apiKey ? '' : `<button class="notice" id="toSet">${icon('gear')}<span><b>KI noch nicht eingerichtet.</b> Einmalig den Google-Schlüssel in den Einstellungen eintragen.</span>${icon('chevron')}</button>`}
      <div id="backupHint"></div>
      ${all.length ? `<div class="sec-h"><h2>Deine Kunden</h2><span class="count" id="kCount">${all.length}</span></div><div class="plist" id="klist"></div>`
        : `<div class="empty-state">${icon('user')}<b>Noch keine Kunden</b><span>Tippe auf „Neuer Kunde“ und trage Name, Telefon und Anschrift ein. Danach legst du beim Kunden seine Projekte an.</span></div>`}`;
    const render = () => {
      const el = $('#klist'); if (!el) return;
      const q = filter.trim().toLowerCase();
      const shown = all.filter((k) => treffer(k, idx, q));
      $('#kCount').textContent = q ? `${shown.length} von ${all.length}` : all.length;
      el.innerHTML = shown.map((k) => {
        const n = idx.filter((x) => x.kundeId === k.id).length, g = bisGeburtstag(k);
        return `<button class="pcard kcard" data-k="${k.id}">
          <span class="av">${esc(initialen(k))}</span>
          <span class="pc-t"><b>${esc(name(k) || 'Ohne Namen')}</b>
            ${ort(k) ? `<span class="muted">${esc(ort(k))}</span>` : ''}
            <span class="pc-meta">${k.nr ? `Nr. ${esc(k.nr)} · ` : ''}${n ? `${n} ${n === 1 ? 'Projekt' : 'Projekte'}` : 'noch kein Projekt'}${g !== null && g <= 14 ? ` · <span class="geb">${gebText(g)}</span>` : ''}</span></span>
          ${icon('chevron', 'pc-chev')}
        </button>`;
      }).join('') || '<p class="empty">Kein Kunde gefunden.</p>';
      $$('[data-k]', el).forEach((b) => (b.onclick = () => { filter = ''; detail(byId(b.dataset.k)); window.scrollTo(0, 0); }));
    };
    render();
    $('#kq').oninput = (e) => { filter = e.target.value; render(); };
    $('#kNew').onclick = () => { filter = ''; detail(neu({ isNew: true })); window.scrollTo(0, 0); };
    if ($('#toSet')) $('#toSet').onclick = () => { switchTab('einstellungen'); einstellungSeite('ki'); };
    window.Backup?.hinweis($('#backupHint'));
  }

  // ---------- Adress-Vorschläge (OpenStreetMap über Photon, kostenlos, ohne Schlüssel) ----------
  // Beim Tippen von „Silberburgstraße 66“ erscheinen passende Anschriften mit PLZ und Ort.
  // Gesucht wird in Deutschland, Treffer rund um Stuttgart zuerst. Ohne Internet passiert einfach nichts.
  const cacheAdr = new Map();
  async function sucheAdresse(q) {
    if (cacheAdr.has(q)) return cacheAdr.get(q);
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=de&limit=6&lat=48.78&lon=9.18&bbox=5.8,47.2,15.1,55.1`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Adresssuche ' + r.status);
    const j = await r.json();
    const seen = new Set(), out = [];
    for (const f of j.features || []) {
      const p = f.properties || {};
      if (p.countrycode && p.countrycode !== 'DE') continue;
      const strasse = p.street || (p.type === 'street' ? p.name : '');
      if (!strasse || !p.postcode || !(p.city || p.town || p.village || p.locality)) continue;
      const ort = p.city || p.town || p.village || p.locality;
      const nr = p.housenumber || (q.match(/\b(\d+\s?[a-zA-Z]?)\b/) || [])[1] || '';
      const zeile = `${strasse}${nr ? ' ' + nr : ''}, ${p.postcode} ${ort}`;
      if (seen.has(zeile)) continue; seen.add(zeile);
      out.push({ zeile, zusatz: p.district && p.district !== ort ? p.district : '' });
    }
    cacheAdr.set(q, out);
    return out;
  }
  function adressVorschlaege(inp) {
    const box = document.createElement('div');
    box.className = 'adr-list'; box.hidden = true;
    inp.after(box);
    let nr = 0;
    const zu = () => { box.hidden = true; box.innerHTML = ''; };
    const los = debounce(async () => {
      const q = inp.value.trim();
      // erst suchen, wenn Straße und Hausnummer da sind und noch keine PLZ eingetragen ist
      if (q.length < 5 || !/\d/.test(q) || /\b\d{5}\b/.test(q)) return zu();
      const mein = ++nr;
      let list = [];
      try { list = await sucheAdresse(q); } catch { return zu(); }
      if (mein !== nr || document.activeElement !== inp) return;
      if (!list.length) return zu();
      box.innerHTML = list.map((x, i) => `<button type="button" data-a="${i}">${icon('map')}<span><b>${esc(x.zeile)}</b>${x.zusatz ? `<small>${esc(x.zusatz)}</small>` : ''}</span></button>`).join('');
      box.hidden = false;
      $$('[data-a]', box).forEach((b) => b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // Fokus bleibt, damit die Liste nicht vorher verschwindet
        inp.value = list[+b.dataset.a].zeile;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        nr++; zu();
      }));
    }, 350);
    inp.addEventListener('input', (e) => { if (e.isTrusted) los(); });
    inp.addEventListener('blur', () => setTimeout(zu, 150));
  }

  // ---------- Ansicht: Kundenkarte ----------
  const telLink = (t) => 'tel:' + String(t).replace(/[^\d+]/g, '');
  const mapLink = (a) => 'https://maps.apple.com/?q=' + encodeURIComponent(einzeilig(a));
  async function detail(k) {
    if (!k) return listeView();
    state.kunde = k; state.objekt = null; state.wohnung = null; state.project = null;
    const idx = (await projectIndex()).filter((x) => x.kundeId === k.id);
    if (state.kunde !== k) return;
    const back = () => { state.kunde = null; listeView(); window.scrollTo(0, 0); };
    header(name(k) || 'Neuer Kunde', untertitel(k) || (k.isNew ? 'Kontaktdaten eintragen' : ''), { label: 'Kunden', fn: back });
    const a = alter(k);
    const nBilder = Object.fromEntries(await Promise.all(k.objekte.map(async (o) => [o.id, await Bilder.anzahl(k.id, o.id)])));
    if (state.kunde !== k) return;
    main().innerHTML = `
      <div class="kd-actions" id="kAct"></div>
      <div class="card kform">
        <div class="row"><div style="flex:1;min-width:96px"><label>Anrede</label><select id="kAnrede">${ANREDEN.map(([v, l]) => `<option value="${v}" ${v === k.anrede ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div style="flex:2"><label>Vorname</label><input type="text" id="kVorname" value="${esc(k.vorname)}" autocomplete="off" placeholder="z. B. Max"></div></div>
        <label>Nachname bzw. Firma</label><input type="text" id="kName" value="${esc(k.name)}" autocomplete="off" placeholder="z. B. Müller">
        <div class="row"><div><label>Telefon</label><input type="tel" id="kTel" value="${esc(k.telefon)}" autocomplete="off" placeholder="0711 …"></div>
          <div><label>Geburtstag${a !== null ? ` <span class="muted" id="kAlter">(${a} Jahre)</span>` : ''}</label><input type="date" id="kGeb" value="${esc(k.geburtstag)}"></div></div>
        <label>E-Mail</label><input type="email" id="kMail" value="${esc(k.email)}" autocomplete="off" inputmode="email" placeholder="name@beispiel.de">
        <label>Privatanschrift</label><div class="adr"><input type="text" id="kPrivat" value="${esc(k.privat)}" autocomplete="off" placeholder="Straße Nr., der Ort wird ergänzt"></div>
        <label>Notiz</label><textarea id="kNotiz" placeholder="z. B. erreichbar ab 17 Uhr, Schlüssel beim Nachbarn">${esc(k.notiz)}</textarea>
      </div>

      <div class="sec-h"><h2>Objekte</h2>${k.objekte.length ? `<span class="count">${k.objekte.length}</span>` : ''}</div>
      <p class="hint" style="margin-top:-4px">Häuser und Wohnungen des Kunden, z. B. Miethaus 1, Elternhaus. Antippen zeigt Anschrift, Notiz, Bilder und die Projekte dort.</p>
      <div class="olist">${k.objekte.map((o) => { const n = idx.filter((x) => x.objektId === o.id).length; return `
        <button class="pcard ocard" data-obj="${o.id}">
          <span class="o-ico">${icon('home')}</span>
          <span class="pc-t"><b>${esc(objLabel(o))}</b>${o.name.trim() && o.adresse.trim() ? `<span class="muted">${esc(einzeilig(o.adresse))}</span>` : ''}
            <span class="pc-meta">${n ? `${n} ${n === 1 ? 'Projekt' : 'Projekte'}` : 'noch kein Projekt'}${nBilder[o.id] ? ` · ${nBilder[o.id]} ${nBilder[o.id] === 1 ? 'Bild' : 'Bilder'}` : ''}${o.notiz.trim() ? ' · Notiz' : ''}</span></span>
          ${icon('chevron', 'pc-chev')}
        </button>`; }).join('')}
        <div class="row">
          <button class="add-room" id="oAdd">${icon('plus')} Objekt hinzufügen</button>
          ${k.privat.trim() && !k.objekte.some((o) => gleich(o.adresse, k.privat)) ? `<button class="add-room" id="oPrivat">${icon('user')} Privatanschrift übernehmen</button>` : ''}
        </div>
      </div>

      <div class="sec-h"><h2>Alle Projekte</h2>${idx.length ? `<span class="count">${idx.length}</span>` : ''}</div>
      <div class="plist">${idx.map((x) => pcard(x, objLabel(objekt(k, x.objektId)) || 'Ohne Objekt')).join('')}</div>
      <button class="btn big block" id="kProj" style="margin-top:12px">${icon('plus')} Neues Projekt für ${esc(name(k) || 'diesen Kunden')}</button>
      ${idx.length || k.isNew ? '' : `<button class="link-danger" id="kDel">${icon('trash')} Kunde löschen</button>`}`;

    const actions = () => {
      const el = $('#kAct'); if (!el) return;
      const g = bisGeburtstag(k);
      const btns = [
        k.telefon.trim() && `<a class="kd-a" href="${esc(telLink(k.telefon))}">${icon('phone')}<span>Anrufen</span></a>`,
        k.email.trim() && `<a class="kd-a" href="mailto:${esc(k.email.trim())}">${icon('mail')}<span>E-Mail</span></a>`,
        k.privat.trim() && `<a class="kd-a" href="${esc(mapLink(k.privat))}" target="_blank" rel="noopener">${icon('map')}<span>Karte</span></a>`,
      ].filter(Boolean);
      el.innerHTML = (g !== null && g <= 14 ? `<div class="notice" style="margin:0 0 10px">${icon('cake')}<span><b>${gebText(g)}</b>${alter(k) !== null ? ` · wird ${alter(k) + (g === 0 ? 0 : 1)}` : ''}</span></div>` : '') + (btns.length ? `<div class="kd-row">${btns.join('')}</div>` : '');
    };
    actions();
    const persist = debounce(async () => { await speichern(k); weitergeben(k); }, 400);
    const titel = () => { $('#title').textContent = name(k) || 'Neuer Kunde'; const s = $('#subtitle'); s.textContent = untertitel(k); s.hidden = !untertitel(k); };
    const felder = { kAnrede: 'anrede', kVorname: 'vorname', kName: 'name', kTel: 'telefon', kMail: 'email', kGeb: 'geburtstag', kPrivat: 'privat', kNotiz: 'notiz' };
    for (const [id, f] of Object.entries(felder)) {
      const el = $('#' + id);
      el[el.tagName === 'SELECT' || el.type === 'date' ? 'onchange' : 'oninput'] = (e) => {
        k[f] = e.target.value; persist(); titel(); actions();
        if (f === 'name' || f === 'vorname' || f === 'anrede') $('#kProj').innerHTML = `${icon('plus')} Neues Projekt für ${esc(name(k) || 'diesen Kunden')}`;
        if (f === 'geburtstag' && $('#kAlter')) $('#kAlter').textContent = alter(k) !== null ? `(${alter(k)} Jahre)` : '';
      };
    }
    if (k.isNew) setTimeout(() => $('#kName')?.focus(), 50);
    $$('.adr input').forEach(adressVorschlaege);
    $$('[data-obj]').forEach((b) => (b.onclick = () => { objektView(k, objekt(k, b.dataset.obj)); window.scrollTo(0, 0); }));
    $('#oAdd').onclick = async () => {
      if (k.isNew) await speichern(k);
      const oid = await objektNeu(k, '', '');
      await objektView(k, objekt(k, oid), true); window.scrollTo(0, 0);
    };
    if ($('#oPrivat')) $('#oPrivat').onclick = async () => { await objektNeu(k, k.privat, 'Privat'); const y = window.scrollY; await detail(k); window.scrollTo(0, y); };
    $$('[data-open]').forEach((b) => (b.onclick = () => window.Projekt.oeffnen(b.dataset.open)));
    $('#kProj').onclick = async () => {
      if (!name(k)) { toast('Bitte zuerst den Namen eintragen.'); $('#kName').focus(); return; }
      if (k.isNew) await speichern(k);
      projektAnlegen(k);
    };
    if ($('#kDel')) $('#kDel').onclick = async () => {
      if (!confirm(`Kunde „${name(k) || 'ohne Namen'}“ löschen?`)) return;
      alle.delete(k.id); await kvDel(key(k.id)); back();
    };
  }

  const objLabel = (o) => (o ? o.name.trim() || einzeilig(o.adresse) || 'Objekt ohne Anschrift' : '');
  const untertitel = (k) => [k.nr && `Kunden-Nr. ${k.nr}`, ort(k)].filter(Boolean).join(' · ');
  /** Projektkarte; zweite Zeile z. B. „1001-02 · Miethaus 1“. */
  const pcard = (x, wo = '') => `<button class="pcard" data-open="${x.id}">
      ${x.thumb ? `<img src="${x.thumb}" alt="">` : `<span class="pc-ph">${icon('home')}</span>`}
      <span class="pc-t"><b>${esc(x.titel || x.room || 'Projekt')}</b>
        <span class="muted">${esc([x.nr, wo, x.titel && x.room].filter(Boolean).join(' · '))}</span>
        <span class="pc-meta">${x.rooms ? `${x.rooms} ${x.rooms === 1 ? 'Raum' : 'Räume'} · ` : ''}${fmtDay(x.updated || x.created)}</span></span>
      ${icon('chevron', 'pc-chev')}</button>`;

  // ---------- Ansicht: ein Objekt (Anschrift, Notiz, Bilder, Projekte dort) ----------
  async function objektView(k, o, neuAngelegt = false) {
    if (!o) return detail(k);
    state.kunde = k; state.objekt = o.id; state.wohnung = null; state.project = null;
    const idx = (await projectIndex()).filter((x) => x.kundeId === k.id && x.objektId === o.id);
    const nB = await Bilder.anzahl(k.id, o.id);
    if (state.kunde !== k || state.objekt !== o.id) return;
    const zurueck = () => { detail(k); window.scrollTo(0, 0); };
    header(objLabel(o), [name(k), k.nr && `Kunden-Nr. ${k.nr}`].filter(Boolean).join(' · '), { label: 'Kunde', fn: zurueck });
    main().innerHTML = `
      <div class="card kform">
        <label style="margin-top:0">Bezeichnung</label><input type="text" id="oName" value="${esc(o.name)}" autocomplete="off" placeholder="z. B. Miethaus 1, Elternhaus">
        <label>Anschrift</label><div class="adr"><input type="text" id="oAdr" value="${esc(o.adresse)}" autocomplete="off" placeholder="Straße Nr., der Ort wird ergänzt"></div>
        <label>Notiz</label><textarea id="oNotiz" placeholder="z. B. Hausmeister Herr Kaya, Schlüssel im Büro, Parken im Hof">${esc(o.notiz)}</textarea>
      </div>
      <div class="kd-actions" id="oAct"></div>
      <div class="docs" style="margin-top:12px"><button class="doc" id="oBilder"><span class="d-ico brass">${icon('camera')}</span>
        <span class="d-t"><b>Bilder & Dokumentation</b><span>${nB ? `${nB} ${nB === 1 ? 'Bild' : 'Bilder'}, nach Ordnern und Projekten sortiert` : 'Bestand, Baufortschritt, Abnahme, eigene Ordner'}</span></span>${icon('chevron', 'pc-chev')}</button></div>
      <div class="sec-h"><h2>Projekte in diesem Objekt</h2>${idx.length ? `<span class="count">${idx.length}</span>` : ''}</div>
      ${idx.length ? `<div class="plist">${idx.map((x) => pcard(x)).join('')}</div>` : '<p class="hint" style="margin-top:-4px">Noch kein Projekt hier.</p>'}
      <button class="btn big block" id="oProj" style="margin-top:12px">${icon('plus')} Neues Projekt in diesem Objekt</button>
      ${idx.length ? '' : `<button class="link-danger" id="oDel">${icon('trash')} Objekt entfernen</button>`}`;
    const aktionen = () => {
      $('#oAct').innerHTML = o.adresse.trim() ? `<div class="kd-row" style="margin-top:12px"><a class="kd-a" href="${esc(mapLink(o.adresse))}" target="_blank" rel="noopener">${icon('map')}<span>In Karten öffnen</span></a></div>` : '';
    };
    aktionen();
    const persist = debounce(async () => { await speichern(k); weitergeben(k); }, 400);
    for (const [id, f] of [['oName', 'name'], ['oAdr', 'adresse'], ['oNotiz', 'notiz']]) {
      $('#' + id).oninput = (e) => { o[f] = e.target.value; persist(); $('#title').textContent = objLabel(o); if (f === 'adresse') aktionen(); };
    }
    adressVorschlaege($('#oAdr'));
    if (neuAngelegt) setTimeout(() => $('#oName')?.focus(), 50);
    $('#oBilder').onclick = () => {
      Bilder.view({ kundeId: k.id, objektId: o.id, titel: [name(k), objektText(o)].filter(Boolean).join(' · '), zurueck: { label: 'Objekt', fn: () => { objektView(k, o); window.scrollTo(0, 0); } } });
      window.scrollTo(0, 0);
    };
    $$('[data-open]').forEach((b) => (b.onclick = () => window.Projekt.oeffnen(b.dataset.open)));
    $('#oProj').onclick = async () => {
      if (!name(k)) { toast('Bitte zuerst den Namen des Kunden eintragen.'); return zurueck(); }
      window.Projekt.neuFuer(k, o.id);
    };
    if ($('#oDel')) $('#oDel').onclick = async () => {
      if ((o.adresse.trim() || o.name.trim() || o.notiz.trim() || nB) && !confirm(`Objekt „${objLabel(o)}“ entfernen?${nB ? `\n\nDie ${nB} Bilder dort werden nicht mehr angezeigt.` : ''}`)) return;
      k.objekte = k.objekte.filter((x) => x !== o); await speichern(k); zurueck();
    };
  }

  /** Kundenkarte öffnen (z. B. aus einem Projekt): wechselt zum Reiter „Kunden“. */
  function oeffnen(id) {
    const k = byId(id);
    if (!k) { toast('Kunde nicht gefunden.'); return; }
    window.openTab('kunden', { kunde: k });
  }

  /** Kundendaten zu einem Raum oder Projekt (für Angebot und Mappen). */
  function zu(x) {
    const id = x?.kundeId || (state.wohnung && (state.wohnung.id === x?.wohnungId || state.wohnung === x) ? state.wohnung.kundeId : '');
    return byId(id);
  }

  return { laden, migrate, nummern, projektNr, byId, liste, name, briefAnrede, zeilen, einzeilig, objekt, objektText, ort, initialen, ausName, speichern, waehlen, objektWaehlen, projektAnlegen, start, listeView, detail, objektView, objLabel, oeffnen, zu, bisGeburtstag };
})();
