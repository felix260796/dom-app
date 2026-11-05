'use strict';
/* Wohnungen: ein Projekt mit mehreren Räumen.
 * Jeder Raum ist ein ganz normales Projekt (eigene Fotos, Raumtyp, Titel, Visualisierungen,
 * Sprachnotizen, Angebot, Instagram) mit dem Feld wohnungId. Die Wohnung selbst liegt unter
 * 'wohnung:<id>' und steht in der Projektliste (projectIndex, kind: 'wohnung').
 * PDFs: eins je Paket (alle Räume in Basic / Standard / Premium) und eine eigene Mappe,
 * in der pro Raum ein Paket gewählt wird (z. B. Bad Premium, Wohnzimmer Basic).
 * Baut auf app.js auf (state, kvGet/kvSet/kvDel, saveProject, packagesFor, pdfStart, ...). */
window.Wohnung = (() => {
  const PKG_IDS = Object.keys(PKG_META); // basic, standard, premium
  const rooms = new Map(); // geladene Räume (dasselbe Objekt für Ansicht und laufende KI-Aufträge)
  let running = false;

  const key = (id) => 'wohnung:' + id;
  const save = async (w) => {
    await kvSet(key(w.id), w);
    const list = await Promise.all(w.rooms.map(raum));
    const thumb = list.find((r) => r?.thumb)?.thumb || '';
    const idx = (await projectIndex()).filter((x) => x.id !== w.id);
    const n = w.rooms.length;
    idx.unshift({ id: w.id, kind: 'wohnung', customer: w.customer, room: `Wohnung · ${n} ${n === 1 ? 'Raum' : 'Räume'}`, created: w.created, thumb });
    await kvSet('projectIndex', idx.slice(0, 100));
  };
  async function raum(id) {
    if (!rooms.has(id)) { const r = normalizeProject(await kvGet('project:' + id)); if (r) rooms.set(id, r); }
    return rooms.get(id);
  }
  const raeume = async (w) => (await Promise.all(w.rooms.map(raum))).filter(Boolean);
  const fileName = (w, suffix) => `Wohnung_${(w.customer || 'Projekt').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${suffix.replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
  const pkgOf = (r, id) => packagesFor(r.roomType).find((x) => x.id === id);
  const done = (r, id) => !!firstResult(r, id);

  // ---------- Aufrufe aus app.js ----------
  async function neu() {
    const w = { id: uid(), kind: 'wohnung', created: Date.now(), customer: '', address: '', rooms: [], mappe: {}, pdfProducts: true, pdfPrices: false };
    await save(w);
    state.project = null; state.wohnung = w; view();
  }
  async function oeffnen(id) {
    const w = await kvGet(key(id));
    if (!w) { toast('Wohnung nicht gefunden.'); return; }
    w.mappe ??= {};
    state.project = null; state.wohnung = w; view();
  }
  /** Wird von saveProject aufgerufen, wenn ein Raum gespeichert wurde (Vorschaubild der Wohnung aktualisieren). */
  async function raumGespeichert(p) {
    rooms.set(p.id, p);
    const w = state.wohnung?.id === p.wohnungId ? state.wohnung : await kvGet(key(p.wohnungId));
    if (w) await save(w);
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
    // Kunde und Adresse kommen immer von der Wohnung (für Angebot, PDF, Instagram)
    r.customer = w.customer; r.address = w.address;
    state.project = r; viewProjekt(); window.scrollTo(0, 0);
  }

  // ---------- Ansicht ----------
  async function view() {
    const w = state.wohnung;
    if (!w) return viewProjekt();
    setTitle(w.customer || 'Neue Wohnung');
    const list = await raeume(w);
    if (state.wohnung !== w || state.project) return; // inzwischen woanders hin gewechselt
    const name = (id) => list.map((r) => pkgOf(r, id)?.name).find(Boolean) || PKG_META[id][0];
    const color = (id) => list.map((r) => pkgOf(r, id)?.color).find(Boolean) || PKG_META[id][1];
    const withPhotos = list.filter((r) => r.photos.length);
    const anyResult = list.some(hasAnyResult);
    const anyProducts = list.some((r) => packagesFor(r.roomType).some((x) => x.products.some((y) => y.name?.trim())));
    // Mappe: Räume ohne gültige Wahl bekommen das erste fertige Paket (Basic vor Standard vor Premium)
    for (const r of list) if (!(r.id in w.mappe) || (w.mappe[r.id] && !done(r, w.mappe[r.id]))) w.mappe[r.id] = PKG_IDS.find((id) => done(r, id)) || '';
    const mappeCount = list.filter((r) => w.mappe[r.id]).length;

    main().innerHTML = `
      <div class="card">
        <h2>🏠 Wohnung</h2>
        <label>Kunde</label><input type="text" id="wCustomer" value="${esc(w.customer)}" placeholder="z. B. Familie Müller">
        <label>Objekt / Adresse</label><input type="text" id="wAddress" value="${esc(w.address)}" placeholder="z. B. Hauptstr. 5, 2. OG links">
      </div>
      <div class="card">
        <h2>1. Räume</h2>
        <p class="muted">Lege jeden Raum an, gib ihm einen Titel und mach die Fotos. Jeder Raum nutzt die Moodboards seines Raumtyps.</p>
        ${list.length ? list.map((r, i) => `
          <div class="list-item room-item" data-room="${r.id}">
            ${r.thumb ? `<img src="${r.thumb}" alt="">` : '<div class="ph-empty">📷</div>'}
            <div style="flex:1;min-width:0"><div><b>${esc(r.room || 'Raum')}</b></div>
              <div class="muted">${esc(roomType(r.roomType).name)} · ${r.photos.length} Foto(s)</div>
              <div class="badges">${PKG_IDS.map((id) => `<span class="badge ${done(r, id) ? 'on' : ''}" style="--c:${pkgOf(r, id)?.color || PKG_META[id][1]}">${done(r, id) ? '✓' : '○'} ${esc(pkgOf(r, id)?.name || PKG_META[id][0])}</span>`).join('')}</div></div>
            ${i > 0 ? `<button class="btn small secondary" data-up="${i}" title="Nach oben">↑</button>` : ''}
            <span>›</span>
          </div>`).join('') : '<p class="muted"><i>Noch keine Räume.</i></p>'}
        <h3>Raum hinzufügen</h3>
        <div class="row">
          <div><label>Raumtyp</label><select id="wRt">${ROOM_TYPES.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
          <div><label>Titel (optional)</label><input type="text" id="wTitle" placeholder="z. B. Kinderzimmer 1"></div>
        </div>
        <button class="btn block" id="wAdd" style="margin-top:10px">＋ Raum hinzufügen</button>
      </div>
      <div class="card">
        <h2>2. Alle Räume visualisieren</h2>
        <p class="muted">Erstellt für jeden Raum mit Fotos die Pakete, die im Raum angehakt sind (normalerweise Basic, Standard und Premium). Einzelne Räume kannst du auch im Raum selbst erstellen oder neu machen.</p>
        <button class="btn block" id="wRun" ${withPhotos.length && !running ? '' : 'disabled'}>${running ? '⏳ KI arbeitet …' : '✨ Alle Räume visualisieren'}</button>
        <p class="muted" id="wRunInfo">${withPhotos.length ? `${withPhotos.reduce((n, r) => n + r.photos.length * r.selected.length, 0)} Bilder, ca. 10–30 Sekunden pro Bild.` : 'Zuerst Räume mit Fotos anlegen.'}</p>
      </div>
      <div class="card">
        <h2>3. PDF je Paket</h2>
        <p class="muted">Ein PDF mit allen Räumen im selben Paket, mit Vorher-Nachher je Raum.</p>
        ${PKG_IDS.map((id) => {
          const n = list.filter((r) => done(r, id)).length;
          return `<button class="btn block pkg-btn" data-pdf="${id}" style="--c:${color(id)}" ${n ? '' : 'disabled'}>📄 ${esc(name(id))}-PDF <span class="muted-on">${n} von ${list.length} Räumen</span></button>`;
        }).join('')}
      </div>
      <div class="card">
        <h2>4. Eigene Mappe</h2>
        <p class="muted">Wähle pro Raum ein Paket, z. B. Bad Premium, Wohnzimmer Basic, Kinderzimmer Standard. Daraus wird ein gemeinsames Vorher-Nachher-PDF.</p>
        ${list.filter(hasAnyResult).map((r) => `
          <div class="mappe-row"><span>${esc(r.room || 'Raum')}</span>
            <select data-mappe="${r.id}">
              ${PKG_IDS.filter((id) => done(r, id)).map((id) => `<option value="${id}" ${w.mappe[r.id] === id ? 'selected' : ''}>${esc(pkgOf(r, id).name)}</option>`).join('')}
              <option value="" ${w.mappe[r.id] ? '' : 'selected'}>nicht in die Mappe</option>
            </select></div>`).join('') || '<p class="muted"><i>Sobald Räume visualisiert sind, kannst du hier die Pakete wählen.</i></p>'}
        <button class="btn block" id="wMappe" style="margin-top:10px" ${mappeCount ? '' : 'disabled'}>📄 Mappe als PDF (${mappeCount} ${mappeCount === 1 ? 'Raum' : 'Räume'})</button>
      </div>
      <div class="card">
        ${anyProducts ? `<label class="check"><input type="checkbox" id="wProducts" ${w.pdfProducts ? 'checked' : ''}>Produktliste mit Shop-Links in die PDFs</label>
        <label class="check"><input type="checkbox" id="wPrices" ${w.pdfPrices ? 'checked' : ''} ${w.pdfProducts ? '' : 'disabled'}>Preise in der Produktliste zeigen</label>` : ''}
        <div class="row" style="margin-top:6px">
          <button class="btn secondary" id="wBack">← Alle Projekte</button>
          <button class="btn danger" id="wDel">Wohnung löschen</button>
        </div>
      </div>`;

    const persist = debounce(() => save(w), 400);
    $('#wCustomer').oninput = (e) => { w.customer = e.target.value; setTitle(w.customer || 'Neue Wohnung'); persist(); syncRooms(w, list); };
    $('#wAddress').oninput = (e) => { w.address = e.target.value; persist(); syncRooms(w, list); };
    $$('[data-room]').forEach((el) => (el.onclick = (e) => { if (e.target.closest('[data-up]')) return; raumOeffnen(rooms.get(el.dataset.room), w); }));
    $$('[data-up]').forEach((b) => (b.onclick = async () => {
      const i = +b.dataset.up; [w.rooms[i - 1], w.rooms[i]] = [w.rooms[i], w.rooms[i - 1]];
      await save(w); view();
    }));
    $('#wAdd').onclick = async () => {
      const rt = $('#wRt').value;
      const r = { id: uid(), created: Date.now(), wohnungId: w.id, customer: w.customer, address: w.address, roomType: rt, room: titel(list, rt, $('#wTitle').value.trim()), note: '', photos: [], thumb: '', results: {}, selected: packagesFor(rt).map((x) => x.id), pdfProducts: true, pdfPrices: false };
      rooms.set(r.id, r);
      w.rooms.push(r.id);
      await kvSet('project:' + r.id, r);
      await save(w);
      raumOeffnen(r, w);
    };
    $('#wRun').onclick = () => runAll(w);
    $$('[data-pdf]').forEach((b) => (b.onclick = () => paketPdf(w, b.dataset.pdf).catch((e) => toast('PDF-Fehler: ' + e.message, 5000))));
    $$('[data-mappe]').forEach((s) => (s.onchange = () => { w.mappe[s.dataset.mappe] = s.value; persist(); view(); }));
    $('#wMappe').onclick = () => mappePdf(w).catch((e) => toast('PDF-Fehler: ' + e.message, 5000));
    if ($('#wProducts')) {
      $('#wProducts').onchange = (e) => { w.pdfProducts = e.target.checked; $('#wPrices').disabled = !w.pdfProducts; persist(); };
      $('#wPrices').onchange = (e) => { w.pdfPrices = e.target.checked; persist(); };
    }
    $('#wBack').onclick = () => { state.wohnung = null; viewProjekt(); };
    $('#wDel').onclick = async () => {
      if (!confirm(`Wohnung „${w.customer || 'ohne Namen'}“ mit allen ${list.length} Räumen, Fotos und Visualisierungen löschen?`)) return;
      for (const id of w.rooms) { await kvDel('project:' + id); rooms.delete(id); }
      await kvDel(key(w.id));
      await kvSet('projectIndex', (await projectIndex()).filter((x) => x.id !== w.id));
      state.wohnung = null; viewProjekt();
    };
  }
  /** Titel für einen neuen Raum: eingegebener Titel, sonst Raumtyp, bei Dopplung durchnummeriert. */
  function titel(list, rt, wanted) {
    const base = wanted || roomType(rt).name;
    const taken = new Set(list.map((r) => (r.room || '').trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2; while (taken.has(`${base} ${n}`.toLowerCase())) n++;
    return `${base} ${n}`;
  }
  const syncRooms = debounce(async (w, list) => {
    for (const r of list) { r.customer = w.customer; r.address = w.address; await kvSet('project:' + r.id, r); }
  }, 600);

  async function runAll(w) {
    if (!state.settings.apiKey) { toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000); return; }
    const list = (await raeume(w)).filter((r) => r.photos.length && r.selected.length);
    const total = list.reduce((n, r) => n + r.photos.length * packagesFor(r.roomType).filter((x) => r.selected.includes(x.id)).length, 0);
    if (!total) { toast('Keine Räume mit Fotos und ausgewählten Paketen.'); return; }
    const already = list.filter(hasAnyResult).length;
    if (!confirm(`${total} Bilder für ${list.length} Räume erstellen?${already ? `\n\n${already} Raum/Räume haben schon Bilder, die werden dabei neu gemacht.` : ''}`)) return;
    running = true; view();
    let ok = 0;
    // Raum für Raum, damit Google nicht zu viele Anfragen gleichzeitig bekommt
    for (const [i, r] of list.entries()) {
      const info = $('#wRunInfo'); if (info && state.wohnung === w && !state.project) info.textContent = `Raum ${i + 1} von ${list.length}: ${r.room} …`;
      const pkgs = packagesFor(r.roomType).filter((x) => r.selected.includes(x.id));
      await Promise.all(pkgs.map((pkg) => runPackage(r, pkg)));
      ok += pkgs.reduce((n, x) => n + (r.results[x.id] || []).filter(Boolean).length, 0);
    }
    running = false;
    await save(w);
    if (state.wohnung === w && !state.project) view();
    toast(ok === total ? 'Fertig! Jetzt kannst du die PDFs erstellen.' : `${ok} von ${total} Bildern fertig. Fehlgeschlagene im Raum mit „Neu“ wiederholen.`, 5000);
  }

  // ---------- PDF ----------
  /** picks: [{ r: Raum, p: Paket }] in der Reihenfolge der Wohnung. */
  async function buildPdf(w, picks, title) {
    const c = pdfStart();
    const { doc, W, H, M, S } = c;
    // Deckblatt
    if (S.logo) await c.logo(M, M, 60, 22);
    else if (S.company) { doc.setFontSize(16); doc.setTextColor(30, 53, 80); doc.text(S.company, M, M + 10); }
    doc.setTextColor(30, 53, 80); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
    doc.text(title, M, 52);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    let y = 70;
    const nR = picks.length;
    for (const [k, v] of [['Kunde', w.customer], ['Objekt', w.address], ['Räume', `${nR} ${nR === 1 ? 'Raum' : 'Räume'}`], ['Datum', new Date().toLocaleDateString('de-DE')]]) {
      if (!v) continue;
      doc.setTextColor(130); doc.text(k, M, y); doc.setTextColor(40); doc.text(doc.splitTextToSize(String(v), 110), M + 22, y); y += 7;
    }
    // Übersicht: je Raum ein Nachher-Bild mit Paket
    const cols = nR <= 4 ? Math.max(nR, 1) : nR <= 8 ? 4 : nR <= 12 ? 6 : 8;
    const top = Math.max(y + 6, 100), gap = 6;
    const rowsN = Math.ceil(nR / cols);
    const tw = (W - 2 * M - (cols - 1) * gap) / cols;
    const th = Math.min(tw * 0.75, (H - 16 - top - rowsN * 10) / rowsN);
    for (const [i, { r, p }] of picks.entries()) {
      const x = M + (i % cols) * (tw + gap), yy = top + Math.floor(i / cols) * (th + 10);
      const rgb = hexRgb(p.color);
      doc.setFillColor(...rgb); doc.rect(x, yy, tw, 1.2, 'F');
      doc.setFontSize(cols > 4 ? 7.5 : 9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 53, 80);
      doc.text(doc.splitTextToSize(r.room || 'Raum', tw * 0.62)[0], x, yy + 5);
      doc.setTextColor(...rgb); doc.text(p.name, x + tw, yy + 5, { align: 'right' }); doc.setFont('helvetica', 'normal');
      await addFit(doc, firstResult(r, p.id), x, yy + 7, tw, th);
    }
    c.footer();
    // Pro Raum: Vorher-Nachher-Seiten, danach (optional) die Produktliste des Pakets, jede nur einmal
    const shownProducts = new Set();
    for (const { r, p } of picks) {
      await pdfViewPages(c, r, p, { room: r.room || roomType(r.roomType).name });
      const k = r.roomType + ':' + p.id;
      if (w.pdfProducts && !shownProducts.has(k)) { shownProducts.add(k); await pdfProductPage(c, p, { prices: w.pdfPrices, sub: roomType(r.roomType).name }); }
    }
    return doc;
  }

  async function paketPdf(w, id) {
    const list = await raeume(w);
    const picks = list.filter((r) => done(r, id)).map((r) => ({ r, p: pkgOf(r, id) }));
    if (!picks.length) return;
    const missing = list.filter((r) => !done(r, id)).map((r) => r.room || 'Raum');
    const nm = picks[0].p.name;
    if (missing.length && !confirm(`Für ${missing.join(', ')} gibt es noch kein ${nm}-Bild. PDF trotzdem ohne diese Räume erstellen?`)) return;
    toast('PDF wird erstellt …', 15000);
    const doc = await buildPdf(w, picks, `Ihre Wohnung im\nPaket ${nm}`);
    await shareDoc(doc, fileName(w, nm));
  }

  async function mappePdf(w) {
    const picks = (await raeume(w)).filter((r) => w.mappe[r.id] && done(r, w.mappe[r.id])).map((r) => ({ r, p: pkgOf(r, w.mappe[r.id]) }));
    if (!picks.length) { toast('Bitte mindestens einem Raum ein Paket zuordnen.'); return; }
    toast('PDF wird erstellt …', 15000);
    const doc = await buildPdf(w, picks, 'Ihre Wohnung\nIhre Auswahl');
    await shareDoc(doc, fileName(w, 'Mappe'));
  }

  return { neu, oeffnen, view, raumGespeichert, raumEntfernt, _intern: { buildPdf, raeume, titel } };
})();
