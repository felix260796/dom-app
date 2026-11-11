'use strict';
/* DOM – Projekte: ein Projekt = Kunde + Adresse + ein oder mehrere Räume.
 * Speicher: 'wohnung:<id>' { id, kind:'wohnung', customer, address, rooms:[raumIds], mappe:{raumId: 'alle'|pkgId|''}, ... }
 * (der Schlüssel heißt aus Kompatibilitätsgründen weiter „wohnung“). Jeder Raum ist ein normales
 * 'project:<id>' mit wohnungId. In der Projektliste (projectIndex) steht nur das Projekt (kind:'wohnung').
 * Ältere Einzelprojekte (ein Raum ohne Projekt) werden beim Start automatisch in ein Projekt gepackt.
 * Baut auf core.js/app.js auf (state, kvGet/kvSet/kvDel, saveProject, packagesFor, header, icon, …). */
window.Projekt = (() => {
  const PKG_IDS = Object.keys(PKG_META); // basic, standard, premium
  // Ablauf eines Projekts, ein Status nach dem anderen ('' = Baustelle läuft, auch für alte Projekte ohne Status).
  // [id, Name, Farbe, kurzer Name für Listen]
  const ALLE = [
    ['besichtigung', 'In Arbeit · vor Ort', '#8a8f98', 'Vor Ort'],
    ['entwurf', 'In Arbeit · im Büro', '#c99a2e', 'Im Büro'],
    ['angebot', 'Verschickt · Nachverfolgung', '#3b6ea8', 'Verschickt'],
    ['abgesagt', 'Abgesagt', '#c0392b', 'Abgesagt'],
    ['geplant', 'Zugesagt, noch einzuplanen', '#2f8a57', 'Zugesagt'],
    ['', 'Baustelle läuft', '#17808a', 'Läuft'],
    ['fertig', 'Abgeschlossen', '#1e3550', 'Abgeschlossen'],
    ['rechnung', 'Rechnung gestellt', '#d2691e', 'Rechnung'],
    ['bezahlt', 'Bezahlt', '#1b5e3a', 'Bezahlt'],
  ];
  // Die vier Bereiche im Reiter „Projekte“ (nur zugesagte Aufträge; Offenes und Abgesagtes steht unter „Angebote“,
  // Rechnungen unter „Rechnungen“). „Einzuplanen“ = zugesagt ohne Baustart, „Eingeplant“ = mit Baustart.
  const PHASEN = [
    ['einplanen', 'Einzu\u00adplanen'],
    ['eingeplant', 'Eingeplant'],
    ['laufend', 'In Durch\u00adführung'],
    ['abgeschlossen', 'Abge\u00adschlossen'],
  ];
  // Der nächste Schritt als großer Knopf im Projekt
  const WEITER = {
    besichtigung: ['entwurf', 'Angebot erstellen'],
    entwurf: ['angebot', 'Angebot ist verschickt'],
    geplant: ['', 'Baustelle hat begonnen'],
    '': ['fertig', 'Baustelle ist fertig'],
    fertig: ['rechnung', 'Schlussrechnung schreiben'],
    rechnung: ['bezahlt', 'Zahlung ist eingegangen'],
  };
  const PFAD = ['besichtigung', 'entwurf', 'angebot', 'geplant', '', 'fertig', 'rechnung', 'bezahlt'];
  const norm = (st) => (ALLE.some((s) => s[0] === st) ? st : '');
  const info = (st) => ALLE.find((s) => s[0] === norm(st));
  const statusName = (st) => info(st)[1];
  const statusKurz = (st) => info(st)[3];
  const farbe = (st) => info(st)[2];
  /** Bereich eines Projekts (Eintrag aus projectIndex oder Projekt): 'angebot' für alles vor der Zusage und Abgesagtes. */
  const phase = (x) => {
    const st = norm(typeof x === 'object' ? x?.status : x);
    if (st === 'geplant') return typeof x === 'object' && x.baustart ? 'eingeplant' : 'einplanen';
    if (st === '') return 'laufend';
    if (['fertig', 'rechnung', 'bezahlt'].includes(st)) return 'abgeschlossen';
    return 'angebot';
  };
  const zugesagt = (st) => ['geplant', '', 'fertig', 'rechnung', 'bezahlt'].includes(norm(st));
  const pill = (st) => `<span class="st-pill" style="--c:${farbe(st)}">${esc(statusKurz(st))}</span>`;
  // Für ältere Teile der App
  const ANGEBOT = ALLE.filter((s) => ['angebot', 'abgesagt'].includes(s[0]));
  const STATUS = ALLE.filter((s) => ['geplant', '', 'fertig'].includes(s[0]));
  const rooms = new Map(); // geladene Räume (dasselbe Objekt für Ansicht und laufende KI-Aufträge)
  let running = null; // Projekt-ID, während „Alle Räume visualisieren“ läuft

  const key = (id) => 'wohnung:' + id;
  const pkgOf = (r, id) => roomPackages(r).find((x) => x.id === id);
  const done = (r, id) => !!firstResult(r, id);
  async function raum(id) {
    if (!rooms.has(id)) { const r = normalizeProject(await kvGet('project:' + id)); if (r) rooms.set(id, r); }
    return rooms.get(id);
  }
  const raeume = async (w) => (await Promise.all(w.rooms.map(raum))).filter(Boolean);
  const summary = (list) => (list.length === 1 ? list[0].room || roomType(list[0].roomType).name
    : list.length <= 3 ? list.map((r) => r.room || roomType(r.roomType).name).join(', ') : `${list.length} Räume`);

  async function save(w) {
    w.updated = Date.now();
    w.nr = await Kunden.projektNr(w);
    await kvSet(key(w.id), w);
    const list = await raeume(w);
    const idx = (await projectIndex()).filter((x) => x.id !== w.id);
    idx.unshift({ id: w.id, kind: 'wohnung', nr: w.nr || '', titel: w.titel || '', status: w.status || '', baustart: w.baustart || '', versendetAm: w.versendetAm || '', absage: w.absage?.grund || '', kundeId: w.kundeId || '', objektId: w.objektId || '', customer: w.customer, address: w.address, room: list.length ? summary(list) : 'noch kein Raum', rooms: list.length, fort: window.Fortschritt?.kurz(w) || null, created: w.created, updated: w.updated, thumb: list.find((r) => r?.thumb)?.thumb || '' });
    await kvSet('projectIndex', idx);
  }
  const neuesProjekt = () => ({ id: uid(), kind: 'wohnung', created: Date.now(), customer: '', address: '', rooms: [], mappe: {}, pdfProducts: true, pdfPrices: false, pdfEvening: true });

  // ---------- Umstellung alter Einzelprojekte ----------
  /** Jedes Einzelprojekt der Liste wird zu einem Projekt mit genau diesem einen Raum.
   * Die Projekt-ID wird aus der Raum-ID abgeleitet, damit zwei Geräte (Cloud-Abgleich) dasselbe Ergebnis erzeugen. */
  async function migrate() {
    const idx = await projectIndex();
    let changed = false;
    const out = [];
    for (const x of idx) {
      if (x.kind === 'wohnung') {
        // Einträge aus der ersten Wohnungs-Version: Raumnamen und Vorschaubild nachtragen
        if (typeof x.rooms !== 'number') {
          const w = await kvGet(key(x.id));
          if (w) {
            const list = await raeume(w);
            Object.assign(x, { address: w.address || '', room: list.length ? summary(list) : 'noch kein Raum', rooms: list.length, thumb: x.thumb || list.find((r) => r?.thumb)?.thumb || '' });
            changed = true;
          }
        }
        out.push(x); continue;
      }
      const p = normalizeProject(await kvGet('project:' + x.id));
      if (!p) { changed = true; continue; } // Eintrag ohne Daten
      if (p.wohnungId) { changed = true; continue; } // gehört schon zu einem Projekt (z. B. vom anderen Gerät umgestellt)
      const wid = 'p' + p.id;
      let w = await kvGet(key(wid));
      if (!w) {
        w = { ...neuesProjekt(), id: wid, created: p.created || Date.now(), customer: p.customer || '', address: p.address || '', rooms: [p.id], pdfProducts: p.pdfProducts ?? true, pdfPrices: !!p.pdfPrices, pdfEvening: p.pdfEvening ?? true };
        await kvSet(key(wid), w);
      }
      p.wohnungId = wid;
      await kvSet('project:' + p.id, p);
      out.push({ id: wid, kind: 'wohnung', customer: w.customer, address: w.address, room: p.room || roomType(p.roomType || roomTypeIdFromName(p.room)).name, rooms: 1, created: w.created, updated: x.updated || w.created, thumb: p.thumb || '' });
      changed = true;
    }
    if (changed) {
      const seen = new Set();
      await kvSet('projectIndex', out.filter((x) => !seen.has(x.id) && seen.add(x.id)));
    }
  }

  // ---------- Aufrufe aus app.js ----------
  /** „Neues Projekt“ im Reiter Projekte: zuerst Kunde und Objekt wählen. */
  async function neu() {
    const k = await Kunden.waehlen();
    if (k) Kunden.projektAnlegen(k);
  }
  /** „Neues Projekt“ im Reiter Projekte: Auftrag ohne Angebot in der App (z. B. mündlich zugesagt). Startet als „Einzuplanen“. */
  async function neuDirekt() {
    const k = await Kunden.waehlen('Projekt für welchen Kunden?');
    if (!k) return;
    const oid = await Kunden.objektWaehlen(k, 'Wo wird gebaut?');
    if (oid === null) return;
    const w = neuesProjekt();
    w.status = 'geplant'; w.kundeId = k.id; w.objektId = oid || ''; w.ohneAngebot = true;
    w.customer = Kunden.name(k); w.address = Kunden.einzeilig(Kunden.objekt(k, oid)?.adresse || '');
    w.verlauf = [{ st: 'geplant', t: Date.now() }];
    await save(w);
    await oeffnen(w.id);
    setTimeout(() => $('#wTitel')?.focus(), 80);
  }
  /** Neues Projekt für Kunde k am Objekt oid. Gespeichert wird es mit dem ersten Raum. */
  /** Projekt direkt speichern (z. B. aus einem Besichtigungstermin). Gibt die ID zurück. */
  async function anlegen(kundeId, oid, titel = '') {
    const k = Kunden.byId(kundeId);
    const w = neuesProjekt();
    w.status = 'besichtigung'; w.kundeId = kundeId; w.objektId = oid || ''; w.titel = titel;
    w.customer = Kunden.name(k); w.address = Kunden.einzeilig(Kunden.objekt(k, oid)?.adresse || '');
    w.verlauf = [{ st: 'besichtigung', t: Date.now() }];
    await save(w);
    return w.id;
  }
  function neuFuer(k, oid) {
    const w = neuesProjekt();
    w.isNew = true; w.status = 'besichtigung';
    w.kundeId = k.id; w.objektId = oid || '';
    w.customer = Kunden.name(k); w.address = Kunden.einzeilig(Kunden.objekt(k, oid)?.adresse || '');
    state.project = null; state.wohnung = w; view(); window.scrollTo(0, 0);
  }
  /** Name und Objektanschrift vom Kunden ins Projekt und in seine Räume übernehmen. */
  async function kundeUebernehmen(wid) {
    const w = state.wohnung?.id === wid ? state.wohnung : await kvGet(key(wid));
    const k = w && Kunden.byId(w.kundeId);
    if (!k) return;
    const customer = Kunden.name(k), o = Kunden.objekt(k, w.objektId);
    const address = o ? Kunden.einzeilig(o.adresse) : w.address || '';
    if (w.customer === customer && w.address === address) return;
    Object.assign(w, { customer, address });
    if (w.isNew) return;
    await save(w);
    for (const id of w.rooms) {
      const r = await raum(id);
      if (r) { Object.assign(r, { customer, address, kundeId: k.id }); const { status, ...data } = r; await kvSet('project:' + id, data); }
    }
  }
  async function oeffnen(id) {
    const w = await kvGet(key(id));
    if (!w) { toast('Projekt nicht gefunden.'); return; }
    w.mappe ??= {};
    state.project = null; state.wohnung = w; view(); window.scrollTo(0, 0);
  }
  /** Von saveProject aufgerufen, wenn ein Raum gespeichert wurde (Vorschaubild, Liste). */
  async function raumGespeichert(p) {
    rooms.set(p.id, p);
    const w = state.wohnung?.id === p.wohnungId ? state.wohnung : await kvGet(key(p.wohnungId));
    if (w && !w.isNew) await save(w);
  }
  async function raumEntfernt(p) {
    rooms.delete(p.id);
    const w = state.wohnung?.id === p.wohnungId ? state.wohnung : await kvGet(key(p.wohnungId));
    if (!w) return;
    w.rooms = w.rooms.filter((x) => x !== p.id);
    delete w.mappe?.[p.id];
    await save(w);
  }
  function raumOeffnen(r, w) {
    r.customer = w.customer; r.address = w.address; r.kundeId = w.kundeId; r.projektNr = w.nr || ''; // Kunde und Adresse kommen immer vom Projekt
    state.project = r; viewProjekt(); window.scrollTo(0, 0);
  }
  /** Titel für einen neuen Raum: Raumtyp, bei Dopplung durchnummeriert (Bad, Bad 2, …). */
  function titel(list, rt) {
    const base = roomType(rt).name;
    const taken = new Set(list.map((r) => (r.room || '').trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2; while (taken.has(`${base} ${n}`.toLowerCase())) n++;
    return `${base} ${n}`;
  }
  async function addRoom(w, rt, extra = {}) {
    const list = await raeume(w);
    const r = { id: uid(), created: Date.now(), wohnungId: w.id, kundeId: w.kundeId || '', customer: w.customer, address: w.address, roomType: rt, room: titel(list, rt), note: '', photos: [], thumb: '', results: {}, selected: packagesFor(rt).map((x) => x.id), pdfProducts: true, pdfPrices: false, ...extra };
    rooms.set(r.id, r);
    w.rooms.push(r.id);
    delete w.isNew;
    await kvSet('project:' + r.id, r);
    await save(w);
    raumOeffnen(normalizeProject(r), w);
  }
  async function pickRoomType(w) {
    const rt = await sheet('Welcher Raum?', ROOM_TYPES.map((r) => ({ label: r.name, icon: roomIcon(r.id), value: r.id })));
    if (rt) addRoom(w, rt);
  }

  // ---------- Ansicht: Projekt ----------
  async function view() {
    const w = state.wohnung;
    if (!w) return viewProjekt();
    const list = await raeume(w);
    if (state.wohnung !== w || state.project) return; // inzwischen woanders hin gewechselt
    const leave = () => { state.wohnung = null; viewProjekt(); window.scrollTo(0, 0); };
    const k = Kunden.byId(w.kundeId);
    const nFotos = k ? await Bilder.anzahl(w.kundeId, w.objektId, w.id) : 0;
    if (state.wohnung !== w || state.project) return;
    const zurueckLabel = state.tab === 'kunden' && state.kunde ? (state.objekt ? 'Objekt' : 'Kunde') : state.tab === 'angebote' ? 'Angebote' : state.tab === 'rechnungen' ? 'Rechnungen' : 'Projekte';
    header(w.customer || 'Neues Projekt', [w.nr && `Projekt-Nr. ${w.nr}`, w.address || (w.isNew ? 'Räume anlegen' : '')].filter(Boolean).join(' · '), { label: zurueckLabel, fn: leave });
    const anyResult = list.some(hasAnyResult);
    const withPhotos = list.filter((r) => r.photos.length);
    const nBilder = withPhotos.reduce((n, r) => n + viewCount(r) * r.selected.length, 0);
    const stand = (r) => {
      const fertig = PKG_IDS.filter((id) => done(r, id));
      if (!r.photos.length) return '<span class="st todo">Fotos fehlen</span>';
      if (!fertig.length) return `<span class="st">${r.photos.length} ${r.photos.length === 1 ? 'Foto' : 'Fotos'} · noch nicht visualisiert</span>`;
      return `<span class="dots">${fertig.map((id) => `<i style="--c:${pkgOf(r, id)?.color || PKG_META[id][1]}" title="${esc(pkgOf(r, id)?.name || '')}"></i>`).join('')}</span><span class="st">${fertig.map((id) => esc(pkgOf(r, id)?.name || PKG_META[id][0])).join(', ')}</span>`;
    };
    main().innerHTML = phase(w) === 'angebot' ? angebotSeite({ w, list, k, nFotos, anyResult, withPhotos, nBilder, stand }) : auftragSeite({ w, list, k, nFotos, stand });
    if ($('#wKosten')) window.Finanzen?.projektAbschnitt($('#wKosten'), w);
    if ($('#wRech')) window.Rechnung?.projektAbschnitt($('#wRech'), w);
    if ($('#wBau')) window.Baustelle?.abschnitt($('#wBau'), w, list, $('#wAbn') ? 'bestellungen' : '');
    if ($('#wAbn')) window.Baustelle?.abschnitt($('#wAbn'), w, list, 'abnahme');
    if ($('#wTodo')) todoFuellen(w);
    // Kacheln im zugesagten Projekt
    if ($('#kRech')) $('#kRech').onclick = () => window.Rechnung?.neu(w, () => { view(); window.scrollTo(0, 0); });
    if ($('#kNt')) $('#kNt').onclick = () => window.Rechnung?.nachtrag(w, null, () => { view(); window.scrollTo(0, 0); });
    if ($('#kBest')) $('#kBest').onclick = () => $('#bstNeu')?.click();
    if ($('#kTermin')) $('#kTermin').onclick = () => $('#wTermine [data-tneu]')?.click() ?? toast('Einen Moment, die Termine laden noch.');
    if ($('#dAb')) $('#dAb').onclick = async () => {
      const ab = w.auftragsbestaetigung, d = (w.dokumente || []).find((x) => x.key === ab?.dokId || x.id === ab?.dokId) || (w.dokumente || []).find((x) => x.art === 'auftragsbestaetigung');
      if (!d) return toast('Die Auftragsbestätigung ist auf diesem Gerät noch nicht da.', 4000);
      dateiZeigen(await kvGet(d.key), { name: d.name, typ: 'application/pdf' });
    };
    if ($('#wFort')) window.Fortschritt?.abschnitt($('#wFort'), w, list, () => save(w));
    if (k && $('#wTermine')) window.Kalender?.abschnitt($('#wTermine'), { kundeId: k.id, objektId: w.objektId, projektId: w.id, zurueck: () => view() });
    const setzen = async (v) => {
      // Absage: Grund festhalten (für später: „da war ich schon, abgesagt wegen …“)
      if (v === 'abgesagt') {
        const g = await sheet('Warum abgesagt?', vorgabe('absageGruende').map((x) => ({ label: x, value: x })));
        if (g === null) return;
        w.absage = { grund: g, t: Date.now() };
      }
      if (v === 'angebot' && norm(w.status) !== 'angebot') w.versendetAm = heuteIso();
      if (norm(v) !== norm(w.status)) (w.verlauf ??= []).push({ st: v, t: Date.now() });
      w.status = v;
      if (!w.isNew) await save(w);
      toast(statusName(v));
      const y = window.scrollY; await view(); window.scrollTo(0, y);
    };
    $$('[data-st]').forEach((b) => (b.onclick = async () => {
      const v = b.dataset.st;
      // „Angebot erstellen“ öffnet gleich das Angebot
      if (norm(w.status) === 'besichtigung' && v === 'entwurf' && list.length) { w.status = v; if (!w.isNew) await save(w); return $('#dAngebot')?.click(); }
      setzen(v);
    }));
    if ($('#wAuftrag')) $('#wAuftrag').onclick = async () => {
      if (w.auftrag) {
        const v = await sheet('Unterschriebenes Angebot', [{ label: 'Ansehen', icon: icon('file'), value: 'zeigen' }, { label: 'Andere Datei ablegen', icon: icon('upload'), value: 'neu' }, { label: 'Entfernen', icon: icon('trash'), value: 'weg' }]);
        if (v === 'zeigen') return dateiZeigen(await kvGet('auftrag:' + w.id), w.auftrag);
        if (v === 'weg') { await kvDel('auftrag:' + w.id); delete w.auftrag; await save(w); return view(); }
        if (v !== 'neu') return;
      }
      const [f] = await pickFiles({ accept: 'application/pdf,image/*' });
      if (!f) return;
      if (f.size > 8e6) return toast('Die Datei ist zu groß (höchstens 8 MB).', 4000);
      let data = await fileToDataUrl(f), typ = f.type || 'application/pdf';
      if (typ.startsWith('image/')) { data = await resize(data, 2200, 'image/jpeg', 0.85); typ = 'image/jpeg'; }
      await kvSet('auftrag:' + w.id, data);
      w.auftrag = { name: f.name || 'Angebot unterschrieben', typ, t: Date.now() };
      if (!w.isNew) await save(w);
      toast('Unterschriebenes Angebot abgelegt'); const y = window.scrollY; await view(); window.scrollTo(0, y);
    };
    if ($('#wBaustart')) $('#wBaustart').onchange = async (e) => {
      w.baustart = e.target.value;
      await baustartTermin(w);
      if (w.baustart && w.baustart <= heuteIso()) return setzen('');
      if (!w.isNew) await save(w);
      toast(w.baustart ? 'Eingeplant, der Baustart steht im Kalender' : 'Baustart entfernt');
      const y = window.scrollY; await view(); window.scrollTo(0, y);
    };
    if ($('#stRech')) $('#stRech').onclick = () => window.Rechnung?.neu(w, () => { view(); window.scrollTo(0, 0); });
    if ($('#stAlle')) $('#stAlle').onclick = async () => {
      const v = await sheet('Status ändern', ALLE.map(([id, n, c]) => ({ label: n, icon: '<i class="si-dot"></i>', color: c, value: id || '__laeuft' })));
      if (v !== null) setzen(v === '__laeuft' ? '' : v);
    };

    if ($('#wKunde')) $('#wKunde').onclick = () => Kunden.oeffnen(k.id);
    if ($('#wTitel')) $('#wTitel').oninput = debounce(async (e) => { w.titel = e.target.value.trim(); if (!w.isNew) await save(w); }, 500);
    if ($('#wBilder')) $('#wBilder').onclick = async () => {
      if (w.isNew) { delete w.isNew; await save(w); } // damit die Bilder dem Projekt zugeordnet werden können
      Bilder.view({ kundeId: k.id, objektId: w.objektId, projektId: w.id, titel: [w.titel || w.customer, w.address].filter(Boolean).join(' · '), zurueck: { label: 'Projekt', fn: () => { view(); window.scrollTo(0, 0); } } }); window.scrollTo(0, 0); };
    if ($('#wObjekt')) $('#wObjekt').onchange = async (e) => {
      let oid = e.target.value;
      if (oid === '__neu') { oid = await Kunden.objektWaehlen(k, 'Welches Objekt?'); if (oid === null) return view(); }
      w.objektId = oid; w.address = Kunden.einzeilig(Kunden.objekt(k, oid)?.adresse || w.address);
      w.customer = ''; // erzwingt die Übernahme in Projekt und Räume
      await kundeUebernehmen(w.id); view();
    };
    if ($('#wKundeWahl')) $('#wKundeWahl').onclick = async () => {
      const nk = await Kunden.waehlen('Zu welchem Kunden gehört das Projekt?'); if (!nk) return;
      const oid = await Kunden.objektWaehlen(nk); if (oid === null) return;
      w.kundeId = nk.id; w.objektId = oid; w.customer = '';
      await kundeUebernehmen(w.id); view();
    };
    window.Gespraech?.bind(w, list);
    if ($('#wVis')) $('#wVis').ontoggle = (e) => { e.target.open ? visOffen.add(w.id) : visOffen.delete(w.id); };
    // Angebotsablauf: weitere Knöpfe
    $$('[data-bilder]').forEach((b) => (b.onclick = () => $('#wBilder')?.click()));
    $$('[data-sprung]').forEach((b) => (b.onclick = () => { const z = $('#ab-' + b.dataset.sprung); if (z) window.scrollTo({ top: z.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' }); }));
    if ($('#wNeuAng')) $('#wNeuAng').onclick = () => angebotsRaum(w);
    if ($('#wRechAdr')) $('#wRechAdr').onclick = () => Kunden.oeffnen(k.id);
    if ($('#wSenden')) $('#wSenden').onclick = async () => { const b = $('#wSenden'); b.disabled = true; try { await sendenMitMappe(w, list); } catch (e) { console.error(e); toast('PDF-Fehler: ' + e.message, 6000); } b.disabled = false; };
    if ($('#wSpeichern')) $('#wSpeichern').onclick = async () => { const b = $('#wSpeichern'); b.disabled = true; try { await angebotSpeichern(w, list); } catch (e) { console.error(e); toast('PDF-Fehler: ' + e.message, 6000); } if (b.isConnected) b.disabled = false; };
    if ($('#wAnpassen')) $('#wAnpassen').onclick = () => (gesperrt(w) ? angebotKopieren(w) : $('#dAngebot')?.click());
    if ($('#wKopie')) $('#wKopie').onclick = () => angebotKopieren(w);
    if ($('#wTexte')) $('#wTexte').onclick = () => {
      if (gesperrt(w)) return gesperrtFrage(w);
      window.Angebot._intern.texteAuftrag(w, () => { view(); window.scrollTo(0, 0); });
    };
    if ($('#dAngPdf')) $('#dAngPdf').onclick = async () => dateiZeigen(await kvGet('angpdf:' + w.id), w.angebotPdf);
    if ($('#wAngAnsehen')) $('#wAngAnsehen').onclick = async () => dateiZeigen(await kvGet('angpdf:' + w.id), w.angebotPdf);
    // Gespeicherte Dokumente: Tipp = ansehen, Pfeil = senden
    $$('[data-dok]').forEach((b) => (b.onclick = async () => { const d = (w.dokumente || []).find((x) => x.key === b.dataset.dok); if (d) dateiZeigen(await kvGet(d.key), { name: d.name, typ: 'application/pdf' }); }));
    $$('[data-doksend]').forEach((b) => (b.onclick = async () => {
      const d = (w.dokumente || []).find((x) => x.key === b.dataset.doksend); const data = d && (await kvGet(d.key));
      if (!data) return toast('Die Datei ist auf diesem Gerät noch nicht da. Bitte kurz warten (Cloud-Abgleich).', 4000);
      const f = new File([await (await fetch(data)).blob()], d.name, { type: 'application/pdf' });
      try { await navigator.share({ files: [f], title: d.name, ohneDialog: true }); if (/^Angebot_/.test(d.name) && !(w.angebotArchiv || []).some((a) => a.nr && d.name.includes(a.nr))) { await angebotMerken(w.id, { output: () => data }, d.name); await angebotVersendet(w.id); } neuZeichnen(w); } catch (e) { if (e.name !== 'AbortError') toast('Senden nicht möglich: ' + e.message, 4000); }
    }));
    $$('[data-dokdel]').forEach((b) => (b.onclick = async () => {
      const d = (w.dokumente || []).find((x) => x.key === b.dataset.dokdel); if (!d || !loeschFrage(`„${d.name}“ löschen?`)) return;
      await kvDel(d.key); w.dokumente = w.dokumente.filter((x) => x !== d); await save(w); view();
    }));
    // Angebot außerhalb der App erstellt (z. B. Excel): PDF ablegen; auf Wunsch gleich als verschickt markieren (Nachfassen läuft)
    if ($('#wAngUpload')) $('#wAngUpload').onclick = async () => {
      const [f] = await pickFiles({ accept: 'application/pdf' });
      if (!f) return;
      if (f.size > 12e6) return toast('Die Datei ist zu groß (höchstens 12 MB).', 4000);
      await kvSet('angpdf:' + w.id, await fileToDataUrl(f));
      w.angebotPdf = { name: f.name || 'Angebot.pdf', typ: 'application/pdf', t: Date.now(), extern: true };
      if (w.isNew) delete w.isNew;
      await save(w);
      if (norm(w.status) !== 'angebot' && confirm('Angebot abgelegt. Ist es schon beim Kunden? Dann markiere ich es als verschickt, und das Nachfassen läuft.')) await angebotVersendet(w.id);
      else toast('Angebot-PDF abgelegt');
      const y = window.scrollY; await view(); window.scrollTo(0, y);
    };
    $$('[data-angraum]').forEach((b) => (b.onclick = () => raumAngebot(rooms.get(b.dataset.angraum), w)));
    if ($('#wZeigen')) $('#wZeigen').onclick = () => (anyResult ? mappeView(w) : toast('Zuerst einen Raum visualisieren, dann gibt es die Mappe.', 4000));
    $$('[data-room]').forEach((el) => (el.onclick = (e) => { if (e.target.closest('[data-up]')) return; raumOeffnen(rooms.get(el.dataset.room), w); }));
    $$('[data-up]').forEach((b) => (b.onclick = async () => { const i = +b.dataset.up; [w.rooms[i - 1], w.rooms[i]] = [w.rooms[i], w.rooms[i - 1]]; await save(w); view(); }));
    $$('[data-rt]').forEach((b) => (b.onclick = () => addRoom(w, b.dataset.rt)));
    $$('[data-board]').forEach((b) => (b.onclick = () => moodboardView(w, b.dataset.board)));
    if ($('#wAdd')) $('#wAdd').onclick = () => pickRoomType(w);
    if ($('#wRun')) $('#wRun').onclick = () => runAll(w);
    if ($('#dMappe')) {
      $('#dMappe').onclick = () => mappeView(w);
      $('#dBau').onclick = () => window.Baumappe?.view(w);
      $('#dAngebot').onclick = async () => {
        if (list.length === 1) return raumAngebot(list[0], w);
        const mitPos = list.filter((r) => r.angebot?.positionen?.length);
        const id = await sheet('Angebot', [
          ...(mitPos.length > 1 ? [{ label: 'Gesamtangebot senden', sub: `Alle ${mitPos.length} Räume in einem PDF${w.gesamtAngebot?.nr ? ` · Nr. ${w.gesamtAngebot.nr}` : ''}`, icon: icon('file'), value: '__gesamt' }] : []),
          ...list.map((r) => ({ label: r.room || roomType(r.roomType).name, sub: r.angebot?.nr ? `Angebot Nr. ${r.angebot.nr}` : 'Positionen bearbeiten', icon: roomIcon(r.roomType), value: r.id }))]);
        if (id === '__gesamt') return gesamtAngebot(w, mitPos).catch((e) => toast('PDF-Fehler: ' + e.message, 5000));
        if (id) raumAngebot(rooms.get(id), w);
      };
      $('#wDel').onclick = async () => {
        if (!(await loeschenFragen(w, list))) return;
        for (const id of w.rooms) { await kvDel('project:' + id); rooms.delete(id); }
        await kvDel(key(w.id));
        await kvSet('projectIndex', (await projectIndex()).filter((x) => x.id !== w.id));
        state.wohnung = null; viewProjekt(); window.scrollTo(0, 0);
      };
    }
  }
  // ---------- Zugesagtes Projekt: Projektdetails → Projektfortschritt → Abnahme → Abrechnen (Wunsch Felix) ----------
  // Gleicher Aufbau wie der Angebotsablauf: Schritte oben, Kacheln für das Häufigste, darunter je Schritt ein Abschnitt, dann die Unterlagen.
  const BAU_SCHRITTE = [['Details'], ['Fortschritt'], ['Abnahme'], ['Abrechnen']];
  function bauSchritt(w) {
    const st = norm(w.status);
    return st === 'geplant' ? 0 : st === '' ? 1 : st === 'fertig' ? (w.abnahme?.unterschriftKunde ? 3 : 2) : st === 'rechnung' ? 3 : 4;
  }
  function auftragSeite({ w, list, k, nFotos, stand }) {
    const s = bauSchritt(w);
    const cls = (i) => (i < s ? 'ok' : i === s ? 'jetzt' : '');
    const kopf = (n, t, sub = '') => `<div class="ab-h" id="ab-${n}"><span class="ab-n">${n}</span><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span></div>`;
    const ab = w.auftragsbestaetigung;
    const vorOrt = window.Gespraech?.karte(w, list) || '';
    return `
      <div class="ab-schritte">${BAU_SCHRITTE.map(([n], i) => `<button type="button" data-sprung="${i + 1}" class="${cls(i)}"><i>${i < s ? icon('check') : i + 1}</i>${n}</button>`).join('')}</div>
      <div class="card kunde">
        ${k ? `<button class="kline" id="wKunde"><span class="av sm">${esc(Kunden.initialen(k))}</span><span class="kl-t"><b>${esc(Kunden.name(k) || 'Ohne Namen')}</b><small>${esc([k.telefon, k.email].filter(Boolean).join(' · ') || 'Kundenkarte öffnen')}</small></span>${icon('chevron', 'pc-chev')}</button>
        <label class="ic-field">${icon('map')}<select id="wObjekt" aria-label="Objekt">
          ${w.objektId && Kunden.objekt(k, w.objektId) ? '' : `<option value="" selected>${esc(w.address || 'Objekt wählen …')}</option>`}
          ${k.objekte.map((o) => `<option value="${o.id}" ${o.id === w.objektId ? 'selected' : ''}>${esc(Kunden.objektText(o) || 'Objekt ohne Anschrift')}</option>`).join('')}
          <option value="__neu">Anderes Objekt …</option></select></label>
        <label class="ic-field">${icon('edit')}<input type="text" id="wTitel" value="${esc(w.titel || '')}" placeholder="Projektname, z. B. Badumbau" autocomplete="off" aria-label="Projektname"></label>`
        : `<button class="kline" id="wKundeWahl">${icon('user')}<span class="kl-t"><b>${esc(w.customer || 'Kunde zuordnen')}</b><small>Kunde auswählen oder neu anlegen</small></span>${icon('chevron', 'pc-chev')}</button>`}
      </div>
      ${statusKarte(w)}
      <div class="vo-sammel pj-kacheln">
        <button type="button" class="vo-b" id="kRech">${icon('euro')}<b>Rechnung</b><span>schreiben</span></button>
        ${k ? `<button type="button" class="vo-b" data-bilder>${icon('camera')}<b>Fotos</b><span>${nFotos ? `${nFotos} ${nFotos === 1 ? 'Bild' : 'Bilder'}` : 'Baustelle'}</span></button>` : ''}
        <button type="button" class="vo-b" id="kBest">${icon('clipboard')}<b>Bestellung</b><span>${(w.bestellungen || []).filter((b) => b.status !== 'geliefert').length || 'eintragen'}${(w.bestellungen || []).some((b) => b.status !== 'geliefert') ? ' offen' : ''}</span></button>
        <button type="button" class="vo-b" id="kNt">${icon('plus')}<b>Nachtrag</b><span>${w.nachtraege?.length ? `${w.nachtraege.length} bisher` : 'Zusatzleistung'}</span></button>
        ${k ? `<button type="button" class="vo-b" id="kTermin">${icon('calendar')}<b>Termin</b><span>anlegen</span></button>` : ''}
      </div>
      ${k ? `<button id="wBilder" hidden></button>` : ''}

      ${kopf(1, 'Projektdetails', 'Baustart, Termine, Unterlagen')}
      <div class="card pj-todo" id="wTodo"></div>
      <div id="wTermine"></div>
      <div class="sec-h"><h2>Unterlagen</h2></div>
      <div class="docs">
        <button class="doc" id="dAngPdf" ${w.angebotPdf ? '' : 'disabled'}>
          <span class="d-ico navy">${icon('file')}</span>
          <span class="d-t"><b>Angebot, wie verschickt</b><span>${w.angebotPdf ? `PDF vom ${esc(new Date(w.angebotPdf.t).toLocaleDateString('de-DE'))}, nur zum Lesen` : 'Kein verschicktes Angebot gespeichert'}</span></span>${icon('chevron', 'pc-chev')}</button>
        ${ab ? `<button class="doc" id="dAb"><span class="d-ico navy">${icon('check')}</span><span class="d-t"><b>Auftragsbestätigung</b><span>${ab.nr ? `Nr. ${esc(ab.nr)} · ` : ''}${ab.gesendetAm ? `gesendet am ${esc(datumText(ab.gesendetAm))}` : 'erstellt, noch nicht gesendet'}</span></span>${icon('chevron', 'pc-chev')}</button>` : ''}
        <button class="doc" id="wAuftrag"><span class="d-ico ${w.auftrag ? 'navy' : 'grey'}">${icon('check')}</span><span class="d-t"><b>Unterschriebenes Angebot</b><span>${w.auftrag ? `Abgelegt am ${esc(new Date(w.auftrag.t).toLocaleDateString('de-DE'))}` : 'Noch nicht abgelegt, tippen zum Ablegen'}</span></span>${icon('chevron', 'pc-chev')}</button>
        <button class="doc" id="dBau">
          <span class="d-ico brass">${icon('clipboard')}</span>
          <span class="d-t"><b>Baumappe für den Projektleiter</b><span>Was beauftragt ist, ohne Preise</span></span>${icon('chevron', 'pc-chev')}</button>
        <button class="doc" id="dMappe" hidden></button>
        <button class="doc" id="dAngebot" hidden></button>
      </div>
      ${dokListe(w)}
      ${vorOrt ? `<details class="more card" style="margin-top:12px"><summary>${icon('mic')}<span>Vor Ort<small>${[w.gespraech ? 'Gespräch' : '', 'Fotos', 'Pläne', w.vorOrt?.scans?.length ? `${w.vorOrt.scans.length} Raumscans` : ''].filter(Boolean).join(', ')}</small></span>${icon('chevron', 'more-chev')}</summary>${vorOrt}</details>` : ''}

      ${kopf(2, 'Projektfortschritt', 'Arbeitsschritte abhaken, Bestellungen')}
      <div id="wFort"></div>
      <div id="wBau"></div>

      ${kopf(3, 'Abnahme', 'Mit dem Kunden durchgehen und unterschreiben lassen')}
      <div id="wAbn"></div>

      ${kopf(4, 'Abrechnen', 'Abschläge, Schlussrechnung, Nachträge, Kosten und Marge')}
      <div id="wRech"></div><div id="wKosten"></div>

      <details class="more card" style="margin-top:12px"><summary>${icon('home')}<span>Weiteres<small>Räume, Projekt löschen</small></span>${icon('chevron', 'more-chev')}</summary>
      <div class="rlist">${list.map((r, i) => `
        <div class="rcard" data-room="${r.id}" role="button" tabindex="0">
          ${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span class="rc-ph">${roomIcon(r.roomType)}</span>`}
          <span class="rc-t"><b>${esc(r.room || roomType(r.roomType).name)}</b><span class="rc-s">${stand(r)}</span></span>
          ${i > 0 ? `<button class="icon-btn up" data-up="${i}" aria-label="Nach oben">${icon('up')}</button>` : ''}
          ${icon('chevron', 'pc-chev')}
        </div>`).join('')}
        <button class="add-room" id="wAdd">${icon('plus')} Raum hinzufügen</button>
      </div>
      <button class="link-danger" id="wDel">${icon('trash')} Projekt löschen</button></details>`;
  }
  /** „Was ist zu tun“ im Schritt Einplanen: abhaken ergibt sich aus den Daten, Tippen führt zur Stelle. */
  async function todoFuellen(w) {
    const el = $('#wTodo');
    if (!el) return;
    const punkte = [
      ['baustart', !!w.baustart, w.baustart ? `Baustart am ${datumText(w.baustart)}` : 'Baustart festlegen'],
      ...(w.auftragsbestaetigung ? [['ab', !!w.auftragsbestaetigung.gesendetAm, 'Auftragsbestätigung an den Kunden']] : []),
      ['auftrag', !!w.auftrag, 'Unterschriebenes Angebot ablegen'],
      ['bestellung', !!w.bestellungen?.length, w.bestellungen?.length ? `${w.bestellungen.length} ${w.bestellungen.length === 1 ? 'Bestellung' : 'Bestellungen'} eingetragen` : 'Material bestellen'],
      ['fortschritt', !!w.schritte?.length, w.schritte?.length ? 'Arbeitsschritte stehen' : 'Arbeitsschritte festlegen (Baufortschritt)'],
    ];
    el.innerHTML = `<b class="pj-todo-h">Vorbereiten</b>${punkte.map(([id, ok, t]) => `<button type="button" class="pj-tp ${ok ? 'ok' : ''}" data-todo="${id}"><i>${ok ? icon('check') : ''}</i><span>${esc(t)}</span>${icon('chevron', 'pc-chev')}</button>`).join('')}`;
    const springe = (sel) => { const z = $(sel); if (z) window.scrollTo({ top: z.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' }); };
    $$('[data-todo]', el).forEach((b) => (b.onclick = () => {
      const id = b.dataset.todo;
      if (id === 'baustart') { const f = $('#wBaustart'); if (f) { springe('.stk'); setTimeout(() => { try { f.showPicker(); } catch { f.focus(); } }, 350); } else springe('.stk'); }
      else if (id === 'ab') $('#dAb')?.click();
      else if (id === 'auftrag') $('#wAuftrag')?.click();
      else if (id === 'bestellung') springe('#wBau');
      else if (id === 'fortschritt') springe('#wFort');
    }));
  }
  /** Löschen: Ein Angebot (noch nicht zugesagt) nach einer Nachfrage. Ein Projekt (zugesagt) nach zwei Nachfragen,
   * und gar nicht, solange es Rechnungen hat (die müssen aufbewahrt werden). */
  async function loeschenFragen(w, list) {
    const name = w.titel || w.customer || 'ohne Namen';
    if (!zugesagt(w.status)) return confirm(`Angebot „${name}“ mit ${list.length === 1 ? 'dem Raum' : list.length ? `allen ${list.length} Räumen` : 'allem'}, Fotos und Visualisierungen löschen?`);
    await window.Rechnung?.laden();
    const re = window.Rechnung?.fuerProjekt(w.id) || [];
    if (re.length) { alert(`Das Projekt „${name}“ hat ${re.length} ${re.length === 1 ? 'Rechnung' : 'Rechnungen'}. Rechnungen müssen aufbewahrt werden, darum lässt sich das Projekt nicht löschen.`); return false; }
    if (!confirm(`Projekt „${name}“ löschen?\n\nDas Projekt ist zugesagt. Gelöscht werden Räume, Angebot, Baufortschritt, Bestellungen, Abnahme und Dokumente.`)) return false;
    const v = await sheet('Wirklich löschen?', [], { text: 'Zum Bestätigen „löschen“ eintippen' });
    if (v?.text?.trim().toLowerCase() !== 'löschen') { if (v) toast('Nicht gelöscht.'); return false; }
    return true;
  }

  // ---------- Angebotsablauf (bis zur Zusage): Vor Ort → Büro → Senden → Nachfassen ----------
  // Gleiche Daten wie das Projekt, nur geordnet nach Felix' Ablauf. Element-IDs wie in der Projektansicht, damit die Knöpfe gleich funktionieren.
  const SCHRITTE = [['vorort', 'Vor Ort'], ['buero', 'Büro'], ['senden', 'Senden'], ['nach', 'Nachfassen']];
  function schrittVon(w) {
    const st = norm(w.status);
    return st === 'besichtigung' ? 0 : st === 'entwurf' ? 1 : st === 'angebot' ? 3 : -1;
  }
  const eurRund = (x) => (+x || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
  /** Letztes Schnellangebot des Kunden (z. B. am Telefon genannt). */
  const schnellVon = (k) => (Array.isArray(k?.schnell) && k.schnell.length ? k.schnell[k.schnell.length - 1] : null);
  const visOffen = new Set(); // Visualisieren aufgeklappt (je Projekt, solange die App offen ist)
  function angebotSeite({ w, list, k, nFotos, anyResult, withPhotos, nBilder, stand }) {
    const st = norm(w.status), s = schrittVon(w), sq = schnellVon(k);
    const fertig = (i) => (s === -1 ? '' : i < s ? 'ok' : i === s ? 'jetzt' : '');
    const mitPos = list.filter((r) => r.angebot?.positionen?.length);
    const notizen = (r) => (r.otherNotes || '').split('\n').filter((l) => l.trim()).length + (r.wishes || '').split('\n').filter((l) => l.trim()).length;
    const kopf = (n, t, sub = '') => `<div class="ab-h" id="ab-${n}"><span class="ab-n">${n}</span><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span></div>`;
    return `
      <div class="ab-schritte">${SCHRITTE.map(([id, n], i) => `<button type="button" data-sprung="${i + 1}" class="${fertig(i)}"><i>${i < s && s !== -1 ? icon('check') : i + 1}</i>${n}</button>`).join('')}</div>
      ${st === 'abgesagt' ? `<p class="notice" style="margin:0 0 10px">${icon('x')}<span><b>Abgesagt</b>${w.absage?.grund ? ` · ${esc(w.absage.grund)}` : ''}</span></p>` : ''}

      <div class="card kunde">
        ${k ? `<button class="kline" id="wKunde"><span class="av sm">${esc(Kunden.initialen(k))}</span><span class="kl-t"><b>${esc(Kunden.name(k) || 'Ohne Namen')}</b><small>${esc([k.telefon, k.email].filter(Boolean).join(' · ') || 'Kundenkarte öffnen')}</small></span>${icon('chevron', 'pc-chev')}</button>
        <button class="ic-field ab-adr" id="wRechAdr">${icon('file')}<span><small>Rechnungsanschrift</small>${k.privat.trim() ? esc(Kunden.einzeilig(k.privat)) : '<span class="warn">fehlt noch, tippen zum Eintragen</span>'}</span></button>
        <label class="ic-field">${icon('map')}<span class="ab-l">Objekt</span><select id="wObjekt" aria-label="Objektanschrift">
          ${w.objektId && Kunden.objekt(k, w.objektId) ? '' : `<option value="" selected>${esc(w.address || 'Objekt wählen …')}</option>`}
          ${k.objekte.map((o) => `<option value="${o.id}" ${o.id === w.objektId ? 'selected' : ''}>${esc(Kunden.objektText(o) || 'Objekt ohne Anschrift')}</option>`).join('')}
          <option value="__neu">Andere Anschrift …</option></select></label>
        <label class="ic-field">${icon('edit')}<input type="text" id="wTitel" value="${esc(w.titel || '')}" placeholder="Projektname, z. B. Badumbau" autocomplete="off" aria-label="Projektname"></label>
        ${sq ? `<p class="ab-schnell">${icon('phone')}<span>Am Telefon genannt: <b>ca. ${eurRund(sq.von)} – ${eurRund(sq.bis)}</b> · ${esc(new Date(sq.t).toLocaleDateString('de-DE'))}${sq.text ? ` · ${esc(sq.text)}` : ''}</span></p>` : ''}`
        : `<button class="kline" id="wKundeWahl">${icon('user')}<span class="kl-t"><b>${esc(w.customer || 'Kunde zuordnen')}</b><small>Kunde auswählen oder neu anlegen</small></span>${icon('chevron', 'pc-chev')}</button>`}
      </div>

      ${kopf(1, 'Vor Ort', 'Gespräch, Fotos, Pläne und Raumscan')}
      ${window.Gespraech?.karte(w, list) || ''}
      ${k ? `<button id="wBilder" hidden></button>` : ''}
      <details class="more card vis-zusatz" id="wVis" ${visOffen.has(w.id) ? 'open' : ''}><summary>${icon('sparkle')}<span>Visualisieren<small>${anyResult ? `${list.filter(hasAnyResult).length} von ${list.length} ${list.length === 1 ? 'Raum' : 'Räumen'} visualisiert` : 'Zusatz: Fotos als neuer Raum, hat mit dem Angebot nichts zu tun'}</small></span>${icon('chevron', 'more-chev')}</summary>
      <div class="rlist" style="margin-top:10px">${list.map((r, i) => `
        <div class="rcard" data-room="${r.id}" role="button" tabindex="0">
          ${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span class="rc-ph">${roomIcon(r.roomType)}</span>`}
          <span class="rc-t"><b>${esc(r.room || roomType(r.roomType).name)}</b><span class="rc-s">${stand(r)}</span></span>
          ${i > 0 ? `<button class="icon-btn up" data-up="${i}" aria-label="Nach oben">${icon('up')}</button>` : ''}
          ${icon('chevron', 'pc-chev')}
        </div>`).join('')}
        ${list.length ? `<button class="add-room" id="wAdd">${icon('plus')} Raum hinzufügen</button>` : ''}
      </div>
      ${list.length ? '' : `
        <p class="hint">Welchen Raum willst du visualisieren? Alle anderen Fotos kommen oben unter „Fotos“.</p>
        <div class="rtgrid">${ROOM_TYPES.map((r) => `<button class="rt" data-rt="${r.id}">${roomIcon(r.id)}<span>${esc(r.name)}</span></button>`).join('')}</div>`}
      ${list.length > 1 && withPhotos.length ? `
        <button class="btn secondary block" id="wRun" ${running ? 'disabled' : ''}>${icon('sparkle')} ${running === w.id ? 'KI arbeitet …' : 'Alle Räume visualisieren'}</button>
        <p class="hint center" id="wRunInfo">${running === w.id ? '' : `${nBilder} Bilder in ${withPhotos.length} Räumen`}</p>` : ''}
      ${list.length ? `<button class="btn block" id="wZeigen" style="margin-top:12px" ${anyResult ? '' : 'disabled'}>${icon('book')} Mappe dem Kunden zeigen</button>
        ${anyResult ? '' : '<p class="hint center">Die Mappe gibt es, sobald ein Raum visualisiert ist.</p>'}` : ''}
      </details>

      ${kopf(2, 'Im Büro: Angebot ausarbeiten', list.length ? 'Wünsche aus dem Gespräch stehen schon in jedem Raum' : 'Raum fürs Angebot anlegen, Positionen eintragen')}
      <div class="docs">${list.map((r) => `<button class="doc" data-angraum="${r.id}"><span class="d-ico ${r.angebot?.positionen?.length ? 'navy' : 'grey'}">${roomIcon(r.roomType)}</span>
        <span class="d-t"><b>${esc(r.room || roomType(r.roomType).name)}</b><span>${r.angebot?.positionen?.length ? `${r.angebot.positionen.length} Positionen${r.angebot.nr ? ` · Nr. ${esc(r.angebot.nr)}` : ''}` : 'noch nicht ausgearbeitet'}${notizen(r) ? ` · ${notizen(r)} Punkte aus dem Gespräch` : ''}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}
        <button class="doc" id="wNeuAng"><span class="d-ico grey">${icon('plus')}</span><span class="d-t"><b>${list.length ? 'Weiteren Raum ins Angebot' : 'Raum fürs Angebot anlegen'}</b><span>z. B. Bad, Küche, Flur. Ohne Fotos und ohne Visualisierung</span></span>${icon('chevron', 'pc-chev')}</button>
        <button class="doc" id="wTexte"><span class="d-ico grey">${icon('edit')}</span><span class="d-t"><b>Texte im Angebot</b><span>${w.angebotTexte ? 'Für dieses Angebot angepasst' : 'Einleitung und Textfelder nach den Positionen'}</span></span>${icon('chevron', 'pc-chev')}</button>
        ${k ? `<button class="doc" data-bilder><span class="d-ico brass">${icon('camera')}</span><span class="d-t"><b>Baustellenfotos ansehen</b><span>Zum Nachschauen beim Kalkulieren</span></span>${icon('chevron', 'pc-chev')}</button>` : ''}
      </div>

      ${kopf(3, 'Speichern und senden', gesperrt(w) ? 'Verschickt, nicht mehr änderbar' : mitPos.length ? 'Erst speichern und ansehen, dann senden' : 'Zuerst das Angebot ausarbeiten')}
      ${gesperrt(w) ? `<div class="card ab-sperre"><p>${icon('check')}<span><b>Angebot${sperrInfo(w).nr ? ` Nr. ${esc(sperrInfo(w).nr)}` : ''} ist verschickt</b>${w.versendetAm ? ` am ${esc(datumText(w.versendetAm))}. ` : '. '}Es bleibt so, wie der Kunde es bekommen hat. Für Änderungen legst du eine Kopie mit neuer Nummer an.</span></p>
        <div class="row"><button class="btn secondary" id="wAngAnsehen">${icon('eye')} Ansehen</button><button class="btn" id="wKopie">${icon('edit')} Ändern (Kopie)</button></div></div>`
      : `<button class="btn secondary big block" id="wSpeichern" ${mitPos.length ? '' : 'disabled'}>${icon('download')} Angebot speichern und ansehen</button>
      <button class="btn big block" id="wSenden" style="margin-top:8px" ${mitPos.length ? '' : 'disabled'}>${icon('mail')} ${anyResult ? 'Senden mit Mappe' : 'Angebot senden'}</button>
      <p class="hint center">Speichern legt das PDF beim Kunden unter „Dokumente“ ab. Verschickt wird nur mit „Senden“. Danach ist das Angebot gesperrt.</p>
      ${w.angebotKopieVon ? `<p class="hint center">Kopie von Angebot Nr. ${esc(w.angebotKopieVon)}</p>` : ''}
      <button class="btn secondary block" id="wAngUpload" style="margin-top:8px">${icon('upload')} Angebot-PDF hochladen (z. B. aus Excel)</button>
      ${w.angebotPdf ? `<button class="link-add" id="wAngAnsehen" style="margin-top:4px">${icon('file')} ${esc(w.angebotPdf.name)} ansehen</button>` : ''}`}
      ${dokListe(w)}

      ${kopf(4, 'Nachfassen und Rückmeldung')}
      ${statusKarte(w)}
      ${st === 'angebot' ? `<button class="btn secondary block" id="wAnpassen">${icon('edit')} Angebot ändern (Kopie mit neuer Nummer)</button>` : ''}

      <details class="more card" style="margin-top:16px"><summary>${icon('clipboard')}<span>Weiteres<small>Moodboard, Baumappe, Termine, Löschen</small></span>${icon('chevron', 'more-chev')}</summary>
        <div class="docs">${[...new Set(list.map((r) => r.roomType))].map((rt) => `<button class="doc" data-board="${rt}"><span class="d-ico ${eigenes(w, rt) ? 'brass' : 'grey'}">${icon('palette')}</span>
          <span class="d-t"><b>Moodboard ${esc(roomType(rt).name)}</b><span>${eigenes(w, rt) ? 'Für diesen Kunden angepasst' : 'Standard, tippen zum Anpassen'}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}
          <button class="doc" id="dMappe" ${anyResult ? '' : 'disabled'}><span class="d-ico navy">${icon('book')}</span><span class="d-t"><b>Kundenmappe einstellen</b><span>Welche Pakete je Raum, als PDF teilen</span></span>${icon('chevron', 'pc-chev')}</button>
          <button class="doc" id="dBau" ${anyResult ? '' : 'disabled'}><span class="d-ico brass">${icon('clipboard')}</span><span class="d-t"><b>Baumappe</b><span>Für Subunternehmer, ohne Preise</span></span>${icon('chevron', 'pc-chev')}</button>
          <button class="doc" id="dAngebot"><span class="d-ico grey">${icon('euro')}</span><span class="d-t"><b>Angebot öffnen</b><span>${list.length > 1 ? 'Raum wählen oder Gesamtangebot' : 'Aufmaß, Positionen, Bauzeit'}</span></span>${icon('chevron', 'pc-chev')}</button>
        </div>
        <div id="wTermine"></div>
        <button class="link-danger" id="wDel">${icon('trash')} Angebot löschen</button>
      </details>`;
  }
  /** Raum nur fürs Angebot anlegen (ohne Fotos, ohne Visualisierung) und gleich das Angebot öffnen. */
  async function angebotsRaum(w) {
    const rt = await sheet('Welcher Raum?', ROOM_TYPES.map((r) => ({ label: r.name, icon: roomIcon(r.id), value: r.id })));
    if (!rt) return;
    const list = await raeume(w);
    const r = { id: uid(), created: Date.now(), wohnungId: w.id, kundeId: w.kundeId || '', customer: w.customer, address: w.address, roomType: rt, room: titel(list, rt), note: '', photos: [], thumb: '', results: {}, selected: packagesFor(rt).map((x) => x.id), pdfProducts: true, pdfPrices: false };
    rooms.set(r.id, r); w.rooms.push(r.id); delete w.isNew;
    await kvSet('project:' + r.id, r); await save(w);
    raumAngebot(normalizeProject(r), w);
  }
  /** Angebot (ein Raum oder Gesamtangebot) und Kundenmappe zusammen teilen. Danach Status „versendet“. */
  async function sendenMitMappe(w, list) {
    if (gesperrt(w)) return gesperrtFrage(w);
    const A = window.Angebot._intern;
    const r = await angebotDateien(w, list);
    if (!r) return;
    const { ang, files } = r;
    // „Wie verschickt“ wird erst gemerkt, wenn wirklich gesendet wird
    if (navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: ang.name, text: A.mailText(ang.syn) }); await angebotMerken(w.id, ang.doc, ang.name); await angebotVersendet(w.id); return neuZeichnen(w); }
      catch (e) { if (e.name === 'AbortError') return neuZeichnen(w); }
    }
    for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
    await angebotMerken(w.id, ang.doc, ang.name);
    await angebotVersendet(w.id); neuZeichnen(w);
  }
  /** Nach Speichern oder Senden den Auftrag neu zeichnen (neue Dokumente, Status, Sperre), Stelle beibehalten. */
  async function neuZeichnen(w) {
    if (state.wohnung?.id !== w.id || state.project) return;
    const frisch = await kvGet(key(w.id));
    if (frisch) { frisch.mappe ??= {}; state.wohnung = frisch; }
    const y = window.scrollY; await view(); window.scrollTo(0, y);
  }

  /** Alle erstellten PDFs des Auftrags (Angebot, Mappe, Rechnung, Nachtrag, Protokoll …): ansehen, senden, löschen. */
  function dokListe(w) {
    const l = (w.dokumente || []).slice().sort((a, b) => b.t - a.t);
    if (!l.length) return '';
    return `<div class="sec-h"><h2>Dokumente</h2><span class="count">${l.length}</span></div>
      <div class="docs">${l.map((d) => `<div class="drow"><button type="button" class="drow-b" data-dok="${esc(d.key)}"><span class="d-ico navy">${icon('file')}</span>
        <span class="d-t"><b>${esc(d.name.replace(/\.pdf$/i, '').replace(/_/g, ' '))}</b><span>${esc(new Date(d.t).toLocaleDateString('de-DE'))} · antippen zum Ansehen</span></span></button>
        <button type="button" class="icon-btn" data-doksend="${esc(d.key)}" aria-label="Senden">${icon('mail')}</button>
        <button type="button" class="icon-btn" data-dokdel="${esc(d.key)}" aria-label="Löschen">${icon('trash')}</button></div>`).join('')}</div>`;
  }
  /** Das verschickte Angebot als PDF im Projekt merken (Projektmappe zeigt es später nur zum Lesen). */
  async function angebotMerken(wid, doc, name) {
    if (!wid) return;
    try {
      await kvSet('angpdf:' + wid, doc.output('datauristring'));
      const w = state.wohnung?.id === wid ? state.wohnung : await kvGet(key(wid));
      if (!w) return;
      w.angebotPdf = { name, typ: 'application/pdf', t: Date.now() };
      await save(w);
    } catch (e) { console.warn('Angebot-PDF nicht gespeichert', e); }
  }
  /** Baustart als ganztägiger Baustellen-Termin im Kalender (ein Termin je Projekt, wird angepasst oder entfernt). */
  async function baustartTermin(w) {
    const id = 'bau-' + w.id;
    if (!w.baustart) { await kvDel('termin:' + id); return; }
    const alt = (await kvGet('termin:' + id)) || {};
    await kvSet('termin:' + id, { ...alt, id, kind: 'termin', art: 'baustelle', datum: w.baustart, ganztag: true, von: '', bis: '',
      titel: `Baustart ${w.titel || w.customer || 'Projekt'}`, kundeId: w.kundeId || '', objektId: w.objektId || '', projektId: w.id, ort: w.address || '',
      wer: alt.wer || [], notiz: alt.notiz || '', created: alt.created || Date.now(), updated: Date.now() });
  }

  /** Statuskarte im Projekt: wo steht es, was kommt als Nächstes (ein großer Knopf). */
  function statusKarte(w) {
    const st = norm(w.status), i = PFAD.indexOf(st), nx = WEITER[st];
    const f = window.Fortschritt?.kurz(w);
    const allesErledigt = st === '' && f && f.fertig === f.n;
    const tage = seitTagen(w.versendetAm);
    // Zugesagt: Der Status springt am Baustart von selbst auf „Baustelle läuft“. Vorher nur ein kleiner Knopf, falls früher begonnen wurde.
    // Abgeschlossen: Der nächste Schritt ist die Schlussrechnung (Status „Rechnung gestellt“ setzt die Rechnung selbst).
    const knoepfe = st === 'geplant'
      ? `<button type="button" class="link-add" data-st="" style="margin:2px 0 0">${icon('check')} Baustelle hat schon begonnen</button>`
      : st === 'fertig' ? `<button class="btn block" id="stRech" style="--c:${farbe('rechnung')}">${icon('euro')} Schlussrechnung schreiben</button>`
      : st === 'angebot'
      ? `<div class="stk-2"><button class="btn" data-st="geplant" style="--c:#2f8a57">${icon('check')} Zugesagt</button><button class="btn" data-st="abgesagt" style="--c:#c0392b">${icon('x')} Abgesagt</button></div>`
      : nx ? `<button class="btn block" data-st="${nx[0]}" style="--c:${farbe(nx[0])}">${esc(nx[1])}</button>` : '';
    return `<div class="card stk" style="--c:${farbe(st)}">
      <div class="stk-top"><span class="stk-dot"></span><span class="stk-t"><small>Status</small><b>${esc(st === 'geplant' && w.baustart ? `Eingeplant · Baustart ${datumText(w.baustart)}` : statusName(st))}</b></span><button class="stk-alle" id="stAlle">Ändern</button></div>
      <div class="stk-pfad" aria-hidden="true">${PFAD.map((id, j) => `<i class="${st === 'abgesagt' ? (j <= 2 ? 'ab' : '') : j < i ? 'ok' : j === i ? 'jetzt' : ''}" style="--c:${farbe(id)}"></i>`).join('')}</div>
      ${st === 'geplant' ? `<label class="stk-feld">${icon('calendar')}<span>Baustart</span><input type="date" id="wBaustart" value="${esc(w.baustart || '')}"></label>
        <p class="hint" style="margin:0 0 6px">${w.baustart ? 'Am Tag des Baustarts springt der Status von selbst auf „Baustelle läuft“.' : 'Noch kein Baustart. Trag ihn ein, dann steht er im Kalender und das Projekt ist eingeplant.'}</p>` : ''}
      ${st === 'angebot' && tage >= nachfassen() ? `<p class="stk-tipp warn">${icon('phone')} Seit ${tage} Tagen beim Kunden. Zeit zum Nachfassen.</p>` : ''}
      ${st === 'angebot' && w.versendetAm && tage < nachfassen() ? `<p class="hint" style="margin:0 0 10px">Versendet am ${esc(datumText(w.versendetAm))}</p>` : ''}
      ${st === 'abgesagt' && w.absage?.grund ? `<p class="hint" style="margin:0 0 10px">Grund: ${esc(w.absage.grund)} · ${esc(new Date(w.absage.t).toLocaleDateString('de-DE'))}</p>` : ''}
      ${allesErledigt ? `<p class="stk-tipp">${icon('check')} Alle Schritte sind abgehakt. Jetzt abschließen?</p>` : ''}
      ${knoepfe}</div>`;
  }
  /** Angebot wurde gesendet (B6): Status auf „versendet“, Datum fürs Nachfassen merken. */
  async function angebotVersendet(wid) {
    const w = wid && (await kvGet(key(wid)));
    if (!w || !['besichtigung', 'entwurf', 'angebot'].includes(norm(w.status))) return;
    // Auch beim erneuten Senden (angepasstes Angebot) beginnt das Nachfassen von vorn
    if (norm(w.status) !== 'angebot') (w.verlauf ??= []).push({ st: 'angebot', t: Date.now() });
    w.status = 'angebot'; w.versendetAm = heuteIso();
    // Ab jetzt gesperrt (Wunsch Felix): Ändern geht nur noch über eine Kopie mit neuer Nummer
    w.angebotGesperrt = { t: Date.now(), nr: nrAusPdf(w) }; delete w.angebotFrei;
    await save(w);
    if (state.wohnung?.id === w.id) Object.assign(state.wohnung, { status: w.status, versendetAm: w.versendetAm, verlauf: w.verlauf, angebotGesperrt: w.angebotGesperrt, angebotFrei: undefined });
    toast('Angebot versendet. Es ist jetzt gesperrt, Änderungen gehen über eine Kopie.', 4500);
  }
  // ---------- Verschickte Angebote sind gesperrt (Wunsch Felix) ----------
  // Ein gespeichertes und verschicktes Angebot bleibt unverändert. Zum Ändern wird es kopiert und bekommt eine neue Nummer.
  // Ältere Aufträge (vor Version 75): gesperrt, wenn das verschickte PDF da ist und der Auftrag verschickt oder zugesagt ist.
  const nrAusPdf = (w) => (String(w.angebotPdf?.name || '').match(/^Angebot_([^_]+)/) || [])[1] || w.gesamtAngebot?.nr || '';
  const gesperrt = (w) => !!w && (!!w.angebotGesperrt || (!w.angebotFrei && !!w.angebotPdf && !w.angebotPdf.extern && (norm(w.status) === 'angebot' || zugesagt(w.status))));
  const sperrInfo = (w) => w.angebotGesperrt || { nr: nrAusPdf(w), t: w.angebotPdf?.t || 0 };
  async function gesperrtFrage(w) {
    const g = sperrInfo(w);
    const v = await sheet(`Angebot${g.nr ? ' Nr. ' + g.nr : ''} ist verschickt`, [
      { label: 'Verschicktes Angebot ansehen', sub: 'So, wie es der Kunde bekommen hat', icon: icon('eye'), value: 'zeigen' },
      { label: 'Ändern: als neues Angebot kopieren', sub: 'Bekommt eine neue Nummer. Das verschickte bleibt unverändert gespeichert.', icon: icon('edit'), value: 'kopie' },
    ]);
    if (v === 'zeigen') return dateiZeigen(await kvGet('angpdf:' + w.id), w.angebotPdf || { name: 'Angebot.pdf', typ: 'application/pdf' });
    if (v === 'kopie') return angebotKopieren(w);
  }
  async function angebotKopieren(w) {
    const alt = sperrInfo(w);
    if (!confirm(`Neues Angebot als Kopie von Nr. ${alt.nr || '?'} anlegen?\n\nDie Kopie bekommt eine neue Nummer und lässt sich bearbeiten. Das verschickte Angebot bleibt unverändert unter „Dokumente“.`)) return;
    // Das verschickte PDF bleibt in den Dokumenten (falls es dort noch nicht liegt, z. B. bei älteren Aufträgen)
    const data = await kvGet('angpdf:' + w.id);
    if (data && w.angebotPdf) {
      const k = 'wdok:' + w.id + ':' + w.angebotPdf.name.replace(/[^\wäöüÄÖÜß.-]+/g, '_');
      if (!(w.dokumente || []).some((d) => d.key === k)) { await kvSet(k, data); w.dokumente = [...(w.dokumente || []), { key: k, name: w.angebotPdf.name, t: w.angebotPdf.t || Date.now() }]; }
    }
    (w.angebotArchiv ??= []).push({ nr: alt.nr, t: alt.t || Date.now(), name: w.angebotPdf?.name || '' });
    const A = window.Angebot._intern;
    const list = await raeume(w), mitPos = list.filter((r) => r.angebot?.positionen?.length);
    const nr = await A.naechsteNummer();
    for (const r of list) if (r.angebot) { r.angebot.nr = mitPos.length === 1 && r === mitPos[0] ? nr : ''; r.angebot.versionen = []; await saveProject(r); }
    w.gesamtAngebot = { ...(w.gesamtAngebot || {}), nr: mitPos.length > 1 ? nr : '', versionen: [] };
    delete w.angebotGesperrt; w.angebotFrei = true; w.angebotKopieVon = alt.nr;
    if (norm(w.status) === 'angebot') { w.status = 'entwurf'; (w.verlauf ??= []).push({ st: 'entwurf', t: Date.now() }); }
    await save(w);
    toast(`Neues Angebot Nr. ${nr} angelegt. Jetzt ändern, speichern und senden.`, 5000);
    if (state.wohnung?.id === w.id) { state.wohnung = w; state.project = null; view(); window.scrollTo(0, 0); }
  }
  /** Angebot als PDF bauen (ein Raum oder alle Räume), dazu die Kundenmappe, falls visualisiert: { ang, files }. */
  async function angebotDateien(w, list) {
    const A = window.Angebot._intern;
    await A.preisliste();
    const mitPos = list.filter((r) => r.angebot?.positionen?.length);
    if (!mitPos.length) { toast('Bitte zuerst das Angebot ausarbeiten.'); return null; }
    toast('Angebot wird erstellt …', 15000);
    let ang;
    if (mitPos.length > 1) ang = await gesamtDoc(w, mitPos);
    else {
      const r = mitPos[0];
      Object.assign(r, { customer: w.customer, address: w.address, kundeId: w.kundeId, projektNr: w.nr || '' });
      A.init(r);
      const doc = await A.baueAngebotPdf(r);
      await saveProject(r);
      ang = { doc, syn: r, name: `Angebot_${r.angebot.nr}_${(w.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf` };
    }
    const files = [new File([ang.doc.output('blob')], ang.name, { type: 'application/pdf' })];
    const sel = list.filter(hasAnyResult).map((r) => ({ r, v: wahl(w, r) })).filter((x) => x.v !== '')
      .map(({ r, v }) => ({ r, pkgs: (v === 'alle' ? PKG_IDS.filter((id) => done(r, id)) : [v]).map((id) => pkgOf(r, id)).filter(Boolean) })).filter((x) => x.pkgs.length);
    if (sel.length && window.Mappe) {
      const md = await window.Mappe.baueKunde(w, sel);
      files.push(new File([md.output('blob')], `Kundenmappe_${window.Mappe.fileSafe(w.customer)}.pdf`, { type: 'application/pdf' }));
    }
    $('#toast').hidden = true;
    return { ang, files };
  }
  /** „Speichern“: PDF beim Auftrag (Kunde, Objekt) unter „Dokumente“ ablegen und ansehen. Nichts wird verschickt. */
  async function angebotSpeichern(w, list) {
    if (gesperrt(w)) return gesperrtFrage(w);
    if (w.isNew) { delete w.isNew; await save(w); }
    const r = await angebotDateien(w, list);
    if (!r) return;
    state.wohnung = w;
    await dokMerken(r.files);
    toast('Gespeichert beim Kunden unter „Dokumente“. Senden mit „Senden“.', 4500);
    const y = window.scrollY; await view(); window.scrollTo(0, y);
    pdfAnsicht(r.files[0], r.files[0].name);
  }
  /** B4: ein Angebot über alle Räume. Baut aus den Raum-Angeboten ein gemeinsames und nutzt das normale Angebots-PDF. */
  async function gesamtAngebot(w, raeume) {
    if (gesperrt(w)) return gesperrtFrage(w);
    toast('Gesamtangebot wird erstellt …', 8000);
    const { doc, name, syn } = await gesamtDoc(w, raeume);
    const A = window.Angebot._intern;
    const blob = doc.output('blob'), file = new File([blob], name, { type: 'application/pdf' });
    $('#toast').hidden = true;
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name, text: A.mailText(syn) }); await angebotMerken(w.id, doc, name); await angebotVersendet(w.id); return neuZeichnen(w); } catch (e) { if (e.name === 'AbortError') return neuZeichnen(w); } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    await angebotMerken(w.id, doc, name); await angebotVersendet(w.id); neuZeichnen(w);
  }
  /** PDF des Gesamtangebots über mehrere Räume: { doc, name, syn }. */
  async function gesamtDoc(w, raeume) {
    const A = window.Angebot._intern;
    await A.preisliste();
    const erst = raeume[0], mehrere = new Set(raeume.map((r) => r.room)).size > 1;
    const allg = new Map(), pos = [];
    const PL = await A.preisliste();
    // Preise je Raum (Nachkalkulation, eigene Einzelpreise) ins Gesamtangebot übernehmen
    const mitPreis = (x, r) => { const it = PL.positionen.find((y) => y.nr === x.nr); return it && !(x.epFix > 0) && r.angebot.kalk ? { ...x, epFix: A.ep(it, r.angebot.kalk) } : x; };
    for (const r of raeume) for (const x0 of r.angebot.positionen) {
      const x = mitPreis(x0, r);
      if (!x.raum) { const v = allg.get(x.nr); if (!v || v.menge < x.menge) allg.set(x.nr, { ...x }); continue; } // Allgemeines (z. B. Baustelleneinrichtung) nur einmal
      pos.push({ ...x, raum: mehrere ? `${r.room || 'Raum'}: ${x.raum}` : x.raum });
    }
    w.gesamtAngebot ??= {};
    if (!w.gesamtAngebot.nr) w.gesamtAngebot.nr = await A.naechsteNummer();
    const g = w.gesamtAngebot;
    const syn = { ...erst, _gesamt: true, id: 'gesamt-' + w.id, wohnungId: w.id, customer: w.customer, address: w.address, kundeId: w.kundeId, projektNr: w.nr || '',
      photos: [], results: {}, aufmass: { ...(erst.aufmass || {}), raeume: raeume.flatMap((r) => (r.aufmass?.raeume || []).map((a) => ({ ...a, name: mehrere ? `${r.room || 'Raum'}: ${a.name}` : a.name }))) },
      angebot: { ...erst.angebot, nr: g.nr, versionen: g.versionen || [], titel: g.titel || `Sanierung ${w.titel || raeume.map((r) => r.room).join(', ')}`, positionen: [...allg.values(), ...pos], mitBild: false } };
    const doc = await A.baueAngebotPdf(syn);
    g.versionen = syn.angebot.versionen; await save(w);
    const name = `Angebot_${g.nr}_${(w.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
    return { doc, name, syn };
  }
  const nachfassen = () => +vorgabe('nachfassenTage') || 7;
  const seitTagen = (iso) => (iso ? Math.floor((new Date(heuteIso() + 'T12:00') - new Date(iso + 'T12:00')) / 864e5) : -1);
  const datumText = (iso) => new Date(iso + 'T12:00').toLocaleDateString('de-DE');
  async function dateiZeigen(data, d) {
    if (!data) return toast('Die Datei ist auf diesem Gerät noch nicht da. Bitte kurz warten (Cloud-Abgleich).', 4000);
    const blob = await (await fetch(data)).blob();
    // In der App ansehen, mit Zoom (core.js pdfAnsicht)
    return pdfAnsicht(new File([blob], d.name || 'Dokument', { type: d.typ || blob.type }), d.name || 'Dokument');
  }
  const heuteIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  /** Automatik beim Start: eingeplante Projekte mit erreichtem Baustart auf „Baustelle läuft“ setzen. */
  async function automatik() {
    const h = heuteIso();
    for (const x of await projectIndex()) {
      if (norm(x.status) !== 'geplant' || !x.baustart || x.baustart > h) continue;
      const w = await kvGet(key(x.id));
      if (w && norm(w.status) === 'geplant') { w.status = ''; await save(w); }
    }
  }

  function raumAngebot(r, w) {
    if (gesperrt(w)) return gesperrtFrage(w);
    if (norm(w.status) === 'besichtigung') { w.status = 'entwurf'; if (!w.isNew) save(w); }
    r.customer = w.customer; r.address = w.address; r.kundeId = w.kundeId; r.projektNr = w.nr || ''; state.project = r; state.angebotAusProjekt = true; window.Angebot?.ansicht(r); }

  async function runAll(w) {
    if (!state.settings.apiKey) { toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000); return; }
    const list = (await raeume(w)).filter((r) => r.photos.length && r.selected.length);
    const total = list.reduce((n, r) => n + viewCount(r) * roomPackages(r).filter((x) => r.selected.includes(x.id)).length, 0);
    if (!total) { toast('Keine Räume mit Fotos und ausgewählten Paketen.'); return; }
    const already = list.filter(hasAnyResult).length;
    if (!confirm(`${total} Bilder für ${list.length} Räume erstellen?${already ? `\n\n${already} ${already === 1 ? 'Raum hat' : 'Räume haben'} schon Bilder, die werden dabei neu gemacht.` : ''}`)) return;
    running = w.id; view();
    let ok = 0;
    // Raum für Raum, damit Google nicht zu viele Anfragen gleichzeitig bekommt
    for (const [i, r] of list.entries()) {
      const info = $('#wRunInfo'); if (info && state.wohnung === w && !state.project) info.textContent = `Raum ${i + 1} von ${list.length}: ${r.room} …`;
      const pkgs = roomPackages(r).filter((x) => r.selected.includes(x.id));
      await window.voiceReady?.(r);
      await Promise.all(pkgs.map((pkg) => runPackage(r, pkg)));
      ok += pkgs.reduce((n, x) => n + (r.results[x.id] || []).filter(Boolean).length + (topOf(r, x.id) ? 1 : 0), 0);
    }
    running = null;
    await save(w);
    if (state.wohnung === w && !state.project) view();
    toast(ok === total ? 'Fertig! Jetzt kannst du die Kundenmappe erstellen.' : `${ok} von ${total} Bildern fertig. Fehlgeschlagene im Raum mit „Neu“ wiederholen.`, 5000);
  }

  // ---------- Moodboard dieses Projekts ----------
  /** Eigenes Moodboard des Projekts für einen Raumtyp (Kopie des Standard-Moodboards) oder null. */
  const eigenes = (w, rt) => (Array.isArray(w.boards?.[rt]) && w.boards[rt].length ? w.boards[rt] : null);
  /** Kopie anlegen, sobald im Projekt etwas geändert wird. Danach ändern sich nur noch die Pakete dieses Projekts. */
  function kopie(w, rt) {
    w.boards ??= {};
    if (!eigenes(w, rt)) w.boards[rt] = JSON.parse(JSON.stringify(packagesFor(rt, null)));
    return w.boards[rt];
  }
  async function moodboardView(w, rt) {
    state.project = null;
    const own = eigenes(w, rt);
    const pkgs = packagesFor(rt, w);
    header('Moodboard', `${w.customer || 'Projekt'} · ${roomType(rt).name}`, { label: 'Projekt', fn: () => { view(); window.scrollTo(0, 0); } });
    main().innerHTML = `
      <div class="card intro"><p>${own
        ? `Dieses Moodboard gilt <b>nur für ${esc(w.customer || 'dieses Projekt')}</b>. Visualisierung, Kundenmappe, Baumappe und Angebot nutzen es.`
        : `Hier steht noch dein <b>Standard-Moodboard</b>. Tippe auf ein Paket und ändere, was der Kunde anders möchte, zum Beispiel einen anderen Heizkörper. Die Änderung gilt nur für dieses Projekt.`}</p></div>
      <div class="pkgs">${pkgs.map((p) => `
        <button class="pkgcard" data-edit="${p.id}" style="--c:${p.color}">
          <span class="pk-thumbs">${p.images.slice(0, 3).map((im) => `<img src="${im.data}" alt="">`).join('') || `<span class="pk-empty">${icon('palette')}</span>`}</span>
          <span class="pk-t"><b><i></i>${esc(p.name)}</b><span>${esc(p.fields.beschreibung || '')}</span>
            <small>${p.images.length} ${p.images.length === 1 ? 'Bild' : 'Bilder'} · ${p.products.length} ${p.products.length === 1 ? 'Produkt' : 'Produkte'}</small></span>
          ${icon('chevron', 'pc-chev')}
        </button>`).join('')}</div>
      ${own ? `<p class="hint">Nach einer Änderung den Raum neu visualisieren, damit die Bilder zum Moodboard passen.</p>
        <button class="link-danger" id="mbReset">${icon('refresh')} Zurück zum Standard-Moodboard</button>` : ''}`;
    $$('[data-edit]').forEach((el) => (el.onclick = () => { kopie(w, rt); editView(w, rt, el.dataset.edit); window.scrollTo(0, 0); }));
    if ($('#mbReset')) $('#mbReset').onclick = async () => {
      if (!loeschFrage(`Die Anpassungen für ${roomType(rt).name} in diesem Projekt verwerfen und wieder das Standard-Moodboard nutzen?`)) return;
      delete w.boards[rt]; await save(w); moodboardView(w, rt);
    };
  }
  function editView(w, rt, id) {
    const soon = debounce(() => save(w), 500);
    viewPaketEdit(id, {
      rt, list: kopie(w, rt), save: () => save(w), saveSoon: soon,
      sub: `${w.customer || 'Projekt'} · nur für dieses Projekt`, backLabel: 'Moodboard',
      banner: `<div class="notice" style="margin:0 0 12px">${icon('palette')}<span>Änderungen gelten nur für <b>${esc(w.customer || 'dieses Projekt')}</b>. Dein Standard-Moodboard bleibt, wie es ist.</span></div>`,
      back: async () => { await save(w); moodboardView(w, rt); window.scrollTo(0, 0); },
    });
  }

  // ---------- Ansicht: Kundenmappe ----------
  /** Auswahl je Raum: 'alle' = alle fertigen Pakete zum Vergleich, pkgId = nur dieses Paket, '' = nicht in die Mappe. */
  const wahl = (w, r) => {
    const v = w.mappe[r.id];
    if (v === '' || v === 'alle') return v;
    if (v && done(r, v)) return v;
    return 'alle';
  };
  async function mappeView(w) {
    state.project = null;
    const list = (await raeume(w)).filter(hasAnyResult);
    header('Kundenmappe', w.customer || '', { label: 'Projekt', fn: () => { view(); window.scrollTo(0, 0); } });
    const allPk = PKG_IDS.filter((id) => list.some((r) => done(r, id)));
    const nm = (id) => list.map((r) => pkgOf(r, id)?.name).find(Boolean) || PKG_META[id][0];
    const col = (id) => list.map((r) => pkgOf(r, id)?.color).find(Boolean) || PKG_META[id][1];
    const anyEve = list.some(hasAnyEvening);
    const anyProducts = list.some((r) => roomPackages(r).some((x) => x.products.some((y) => y.name?.trim())));
    const picks = () => list.map((r) => ({ r, w: wahl(w, r) })).filter((x) => x.w);
    const seiten = () => picks().reduce((n, { r, w: v }) => n + (v === 'alle' ? PKG_IDS.filter((id) => done(r, id)).length : 1), 0);
    main().innerHTML = `
      <div class="card intro">
        <p>Wähle für jeden Raum, ob der Kunde <b>alle Varianten</b> zum Vergleich sieht oder <b>ein Paket</b>. Danach als Vorher-Nachher-PDF erstellen.</p>
        <div class="quick"><span>Für alle Räume:</span>
          <button class="qchip" data-all="alle">Alle Varianten</button>
          ${allPk.map((id) => `<button class="qchip" data-all="${id}" style="--c:${col(id)}">${esc(nm(id))}</button>`).join('')}
        </div>
      </div>
      <div class="mlist">${list.map((r) => {
        const v = wahl(w, r);
        const opts = [['alle', 'Alle'], ...PKG_IDS.filter((id) => done(r, id)).map((id) => [id, pkgOf(r, id).name]), ['', 'Nicht']];
        const img = v && v !== 'alle' ? firstResult(r, v) : firstResult(r, PKG_IDS.slice().reverse().find((id) => done(r, id)));
        return `<div class="mcard ${v ? '' : 'off'}">
          <img src="${img}" alt="">
          <div class="mc-b"><b>${esc(r.room || roomType(r.roomType).name)}</b>
            <div class="seg2">${opts.map(([id, l]) => `<button data-m="${r.id}" data-v="${id}" class="${v === id ? 'on' : ''}" ${id && id !== 'alle' ? `style="--c:${pkgOf(r, id).color}"` : ''}>${esc(l)}</button>`).join('')}</div></div>
        </div>`;
      }).join('')}</div>
      <div class="card opts">
        ${anyProducts ? `<label class="toggle"><input type="checkbox" id="mProd" ${w.pdfProducts ? 'checked' : ''}><span class="tg"></span><span>Produktliste mit Links</span></label>
        <label class="toggle"><input type="checkbox" id="mPrice" ${w.pdfPrices ? 'checked' : ''} ${w.pdfProducts ? '' : 'disabled'}><span class="tg"></span><span>Preise der Produkte zeigen</span></label>` : ''}
        ${anyEve ? `<label class="toggle"><input type="checkbox" id="mEve" ${w.pdfEvening !== false ? 'checked' : ''}><span class="tg"></span><span>Abendstimmung (Tag und Abend nebeneinander)</span></label>` : ''}
        <button class="btn big block" id="mPdf">${icon('file')} Vorher-Nachher als PDF</button>
        <button id="mPres" hidden></button>
        <p class="hint center" id="mInfo"></p>
      </div>`;
    const info = () => { const n = picks().length, s = seiten(); $('#mInfo').textContent = n ? `${n} ${n === 1 ? 'Raum' : 'Räume'} · ${s} Vorher-Nachher-${s === 1 ? 'Seite' : 'Seiten'}` : 'Bitte mindestens einen Raum auswählen.'; $('#mPdf').disabled = !n; $('#mPres').disabled = !n; };
    info();
    const persist = () => save(w);
    $$('[data-m]').forEach((b) => (b.onclick = () => { w.mappe[b.dataset.m] = b.dataset.v; persist(); const y = window.scrollY; mappeView(w).then(() => window.scrollTo(0, y)); }));
    $$('[data-all]').forEach((b) => (b.onclick = () => {
      const v = b.dataset.all;
      for (const r of list) w.mappe[r.id] = v === 'alle' || done(r, v) ? v : 'alle';
      persist(); mappeView(w);
    }));
    if ($('#mProd')) {
      $('#mProd').onchange = (e) => { w.pdfProducts = e.target.checked; $('#mPrice').disabled = !w.pdfProducts; persist(); };
      $('#mPrice').onchange = (e) => { w.pdfPrices = e.target.checked; persist(); };
    }
    if ($('#mEve')) $('#mEve').onchange = (e) => { w.pdfEvening = e.target.checked; persist(); };
    const pdf = async (btn, fn) => {
      const sel = picks().map(({ r, w: v }) => ({ r, pkgs: (v === 'alle' ? PKG_IDS.filter((id) => done(r, id)) : [v]).map((id) => pkgOf(r, id)) }));
      const b = $(btn); b.disabled = true; const t = b.innerHTML; b.innerHTML = '<span class="spinner sm"></span> PDF wird erstellt …';
      try { await fn(w, sel); } catch (e) { console.error(e); toast('PDF-Fehler: ' + e.message, 6000); }
      b.disabled = false; b.innerHTML = t;
    };
    $('#mPdf').onclick = () => pdf('#mPdf', window.Mappe.kunde);
    $('#mPres').onclick = () => pdf('#mPres', window.Mappe.praesentation);
  }

  const forget = (id) => rooms.delete(id);
  return { automatik, anlegen, angebotVersendet, gesperrt, gesperrtFrage, angebotKopieren, dateiZeigen, nachfassen, seitTagen, STATUS, ANGEBOT, ALLE, PHASEN, phase, farbe, pill, norm, zugesagt, statusName, statusKurz, raumAngebot, angebotMerken, forget, neu, neuDirekt, neuFuer, kundeUebernehmen, oeffnen, view, mappeView, moodboardView, migrate, raum, raeume, raumGespeichert, raumEntfernt, save, wahl, PKG_IDS, _intern: { titel, addRoom } };
})();
// Ältere Aufrufe (PR „Wohnungen“) laufen weiter
window.Wohnung = { neu: () => Projekt.neu(), oeffnen: (id) => Projekt.oeffnen(id), view: () => Projekt.view(), raumGespeichert: (p) => Projekt.raumGespeichert(p), raumEntfernt: (p) => Projekt.raumEntfernt(p) };
