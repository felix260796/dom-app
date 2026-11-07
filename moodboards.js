'use strict';
/* DOM – Moodboards (Ausstattungspakete je Raumtyp) und Einstellungen. */

// ---------- Ansicht: Moodboards ----------
function viewPakete() {
  if (state.editPkg) return viewPaketEdit(state.editPkg);
  header('Standard-Moodboards', 'Gelten für alle Projekte', { label: 'Einstellungen', fn: () => { state.editPkg = null; viewEinstellungen(); window.scrollTo(0, 0); } });
  const rt = state.boardRoom;
  const pkgs = packagesFor(rt, null);
  main().innerHTML = `
    <div class="rtscroll" role="tablist">${ROOM_TYPES.map((r) => `<button class="rtchip ${r.id === rt ? 'on' : ''}" data-rt="${r.id}" role="tab">${roomIcon(r.id)}<span>${esc(r.name)}</span></button>`).join('')}</div>
    <p class="hint">So soll der Raumtyp „${esc(roomType(rt).name)}“ nach der Sanierung aussehen. Text, Referenzbilder und echte Produkte gehen an die KI und in die Mappen. Das gilt für alle Projekte. Wünscht ein Kunde etwas anderes, passt du es im Projekt an.</p>
    <div class="pkgs">${pkgs.map((p) => `
      <button class="pkgcard" data-edit="${p.id}" style="--c:${p.color}">
        <span class="pk-thumbs">${p.images.slice(0, 3).map((im) => `<img src="${im.data}" alt="">`).join('') || `<span class="pk-empty">${icon('palette')}</span>`}</span>
        <span class="pk-t"><b><i></i>${esc(p.name)}</b><span>${esc(p.fields.beschreibung || '')}</span>
          <small>${p.images.length} ${p.images.length === 1 ? 'Bild' : 'Bilder'} · ${p.products.length} ${p.products.length === 1 ? 'Produkt' : 'Produkte'}</small></span>
        ${icon('chevron', 'pc-chev')}
      </button>`).join('')}</div>
    <details class="more card">
      <summary>${icon('share')}<span>Moodboards sichern oder übertragen<small>z. B. vom PC aufs iPhone</small></span>${icon('chevron', 'more-chev')}</summary>
      <p class="hint">Nur die Moodboards aller Raumtypen als Datei. Für eine Komplettsicherung mit Projekten: Einstellungen → Datensicherung.</p>
      <div class="row"><button class="btn secondary" id="exp">Exportieren</button><button class="btn secondary" id="imp">Importieren</button></div>
      <button class="btn danger block" id="reset" style="margin-top:10px">${esc(roomType(rt).name)}: Beispiel-Pakete wiederherstellen</button>
    </details>`;
  $$('[data-rt]').forEach((b) => (b.onclick = () => { state.boardRoom = b.dataset.rt; viewPakete(); }));
  $('.rtchip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  $$('[data-edit]').forEach((el) => (el.onclick = () => { state.editPkg = el.dataset.edit; viewPakete(); window.scrollTo(0, 0); }));
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify({ version: 2, boards: state.boards })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'moodboards.json'; a.click();
  };
  $('#imp').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const data = JSON.parse(await inp.files[0].text());
        if (data.boards && typeof data.boards === 'object') state.boards = { ...state.boards, ...data.boards };
        else if (Array.isArray(data.packages)) state.boards.bad = data.packages.map(migrateBathPackage); // alte Sicherung (nur Bad)
        else throw new Error('Keine Moodboard-Datei');
        await saveBoards(); toast('Moodboards importiert'); viewPakete();
      } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 4000); }
    };
    inp.click();
  };
  $('#reset').onclick = async () => {
    if (!confirm(`Moodboards für „${roomType(rt).name}“ durch die Beispiel-Pakete ersetzen? Bilder und Produkte dieses Raumtyps gehen verloren.`)) return;
    state.boards[rt] = defaultPackagesFor(rt); await saveBoards(); viewPakete();
  };
}

function productRow(x, i, fields) {
  const url = safeUrl(x.url);
  return `<div class="product">
    <div class="row">
      <div style="flex:2"><label>Bereich</label><select data-prod="${i}" data-k="area"><option value="">–</option>${fields.filter(([k]) => k !== 'beschreibung').map(([k, l]) => `<option value="${k}" ${k === x.area ? 'selected' : ''}>${esc(l.replace(/\s*\(.*\)/, ''))}</option>`).join('')}</select></div>
      <div style="flex:3"><label>Produkt (Hersteller, Serie, Farbe)</label><input type="text" data-prod="${i}" data-k="name" value="${esc(x.name)}" placeholder="z. B. Hansgrohe Talis E, Mattschwarz"></div>
    </div>
    <label>Shop-Link</label>
    <div class="row" style="flex-wrap:nowrap"><input type="url" inputmode="url" data-prod="${i}" data-k="url" value="${esc(x.url)}" placeholder="https://…" style="flex:1">
      <a class="btn small secondary" style="flex:none" data-prodlink="${i}" href="${esc(url || '#')}" target="_blank" rel="noopener" ${url ? '' : 'hidden'}>Öffnen ↗</a></div>
    <div class="row">
      <div><label>Preis (€, brutto)</label><input type="text" inputmode="decimal" data-prod="${i}" data-k="price" value="${x.price === '' || x.price == null ? '' : esc((+x.price).toFixed(2).replace('.', ','))}" placeholder="z. B. 249,90"></div>
      <div><label>Lieferzeit</label><input type="text" data-prod="${i}" data-k="delivery" value="${esc(x.delivery)}" placeholder="z. B. 2–3 Wochen"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn small secondary" data-prodimg="${i}">${icon('camera')} Produktbild als Referenz</button>
      <button class="btn small danger" data-delprod="${i}">Entfernen</button>
    </div>
  </div>`;
}

/** Bearbeitungs-Kontext: allgemeine Moodboards (Reiter „Moodboards“) oder das Moodboard eines Projekts. */
const globalBoardCtx = () => ({
  rt: state.boardRoom, list: packagesFor(state.boardRoom, null), save: saveBoards, saveSoon: saveBoardsDebounced,
  sub: roomType(state.boardRoom).name, backLabel: 'Moodboards',
  back: () => { saveBoards(); state.editPkg = null; viewPakete(); window.scrollTo(0, 0); },
});

function viewPaketEdit(id, ctx = globalBoardCtx()) {
  const rt = ctx.rt;
  const FIELDS = fieldsFor(rt);
  const p = ctx.list.find((x) => x.id === id);
  if (!p) return ctx.back();
  const saveBoards = ctx.save, saveBoardsDebounced = ctx.saveSoon; // gleiche Namen wie bisher, Ziel je nach Kontext
  const sum = p.products.reduce((n, x) => n + (x.price === '' || x.price == null || isNaN(+x.price) ? 0 : +x.price), 0);
  header(p.name, ctx.sub, { label: ctx.backLabel, fn: ctx.back });
  main().innerHTML = `
    ${ctx.banner || ''}
    <div class="card">
      <h2>Allgemein</h2>
      <div class="row"><div style="flex:3"><label>Name des Pakets</label><input type="text" id="pname" value="${esc(p.name)}"></div>
      <div style="flex:1"><label>Farbe</label><input type="color" id="pcolor" value="${p.color}" style="width:100%;height:44px;border:0;background:none"></div></div>
    </div>
    <div class="card">
      <h2>Referenzbilder</h2>
      <p class="muted">Fotos von Fliesen, Armaturen, Farbmustern oder Beispielräumen. Beschrifte jedes Bild (z. B. „Wandfliese“, „Armatur Waschtisch“), damit die KI weiß, wofür es steht. Die ersten ${MAX_REF_IMAGES} Bilder werden verwendet.</p>
      <div class="thumbs">${p.images.map((im, i) => `
        <div class="thumb"><img src="${im.data}" alt=""><input type="text" data-label="${i}" value="${esc(im.label)}" placeholder="Wofür steht das Bild?"><button class="del" data-delimg="${i}">Entfernen</button></div>`).join('')}</div>
      <button class="btn secondary block" id="addimg" style="margin-top:10px">${icon('plus')} Bilder hinzufügen</button>
    </div>
    <div class="card">
      <h2>Produkte</h2>
      <p class="muted">Echte Produkte mit Shop-Link, Preis und Lieferzeit. Die KI bekommt die Produktnamen als Vorgabe, im PDF erscheint auf Wunsch eine Produktliste mit klickbaren Links. Tipp: Im Shop den Link kopieren und hier einfügen.</p>
      <div id="prods">${p.products.map((x, i) => productRow(x, i, FIELDS)).join('')}</div>
      ${p.products.length ? `<p class="muted" id="psum">Summe: <b>${fmtPrice(sum)}</b></p>` : ''}
      <button class="btn secondary block" id="addprod" style="margin-top:10px">${icon('plus')} Produkt hinzufügen</button>
    </div>
    <div class="card">
      <h2>Ausstattung</h2>
      <p class="muted">Je genauer, desto besser trifft die KI dein Paket. Leere Felder werden ignoriert.</p>
      ${FIELDS.map(([k, label, ph]) => `<label>${esc(label)}</label><textarea data-field="${k}" placeholder="${esc(ph)}" rows="2">${esc(p.fields[k] || '')}</textarea>`).join('')}
    </div>`;
  const rerender = async () => { await saveBoards(); const y = window.scrollY; viewPaketEdit(id, ctx); window.scrollTo(0, y); };
  $('#pname').oninput = (e) => { p.name = e.target.value; $('#title').textContent = p.name; saveBoardsDebounced(); };
  $('#pcolor').oninput = (e) => { p.color = e.target.value; saveBoardsDebounced(); };
  $$('[data-field]').forEach((t) => (t.oninput = () => { p.fields[t.dataset.field] = t.value; saveBoardsDebounced(); }));
  $$('[data-label]').forEach((t) => (t.oninput = () => { p.images[+t.dataset.label].label = t.value; saveBoardsDebounced(); }));
  $$('[data-delimg]').forEach((b) => (b.onclick = async () => { p.images.splice(+b.dataset.delimg, 1); rerender(); }));
  $('#addimg').onclick = async () => {
    const files = await pickFiles({ multiple: true });
    for (const f of files) p.images.push({ id: uid(), label: '', data: await resize(await fileToDataUrl(f), 1024) });
    rerender();
  };
  // Produkte
  $$('[data-prod]').forEach((el) => {
    const x = p.products[+el.dataset.prod], k = el.dataset.k;
    el.oninput = () => {
      x[k] = k === 'price' ? parsePrice(el.value) : el.value;
      if (k === 'price' && $('#psum')) $('#psum').innerHTML = `Summe: <b>${fmtPrice(p.products.reduce((n, y) => n + (y.price === '' || isNaN(+y.price) ? 0 : +y.price), 0))}</b>`;
      saveBoardsDebounced();
    };
    if (k === 'url') el.addEventListener('input', () => {
      const a = $(`[data-prodlink="${el.dataset.prod}"]`), u = safeUrl(el.value);
      a.hidden = !u; a.href = u || '#';
    });
  });
  $$('[data-delprod]').forEach((b) => (b.onclick = () => { if (!confirm('Produkt entfernen?')) return; p.products.splice(+b.dataset.delprod, 1); rerender(); }));
  $$('[data-prodimg]').forEach((b) => (b.onclick = async () => {
    const x = p.products[+b.dataset.prodimg];
    const [f] = await pickFiles(); if (!f) return;
    const area = (FIELD_LIB[x.area]?.[0] || '').replace(/\s*\(.*\)/, '');
    p.images.push({ id: uid(), label: [area, x.name].filter(Boolean).join(': ') || 'Produkt', data: await resize(await fileToDataUrl(f), 1024) });
    toast('Produktbild bei den Referenzbildern ergänzt');
    rerender();
  }));
  $('#addprod').onclick = () => { p.products.push({ id: uid(), area: '', name: '', url: '', price: '', delivery: '' }); rerender(); };
}

// ---------- Ansicht: Einstellungen ----------
// Übersicht als Liste (wie „Standard-Moodboards“), jede Rubrik öffnet ihre eigene Seite.
const EINST = [
  ['moodboards', 'Standard-Moodboards', 'palette', 'brass'],
  ['firma', 'Firma & Logo', 'home', 'navy'],
  ['ki', 'KI-Bildbearbeitung', 'sparkle', 'navy'],
  ['preise', 'Preisliste & Angebot', 'euro', 'grey'],
  ['team', 'E-Mail-Automatisierung', 'mail', 'navy'],
  ['bau', 'Baufortschritt', 'check', 'brass'],
  ['cloud', 'Cloud-Abgleich', 'refresh', 'brass'],
  ['sicherung', 'Datensicherung', 'download', 'grey'],
];
function einstellungInfo(k) {
  const S = state.settings;
  if (k === 'moodboards') {
    const n = ROOM_TYPES.filter((r) => state.boards?.[r.id]?.some((p) => p.images?.length || p.products?.length)).length;
    return `Basic, Standard und Premium je Raumtyp${n ? ` · ${n} mit Bildern` : ''}`;
  }
  if (k === 'firma') return [S.company, S.logo ? 'mit Logo' : 'ohne Logo'].filter(Boolean).join(' · ');
  if (k === 'ki') return S.apiKey ? `Eingerichtet · ${(S.modelList || []).find((m) => m.id === S.model)?.label || S.model}` : 'Noch nicht eingerichtet';
  if (k === 'preise') return 'Excel-Angebotstool, Aufschläge, Paket-Vorlagen';
  if (k === 'team') return `${S.mailAktiv ? 'Terminmails an' : 'Terminmails aus'} · ${(window.Kalender?.team() || []).map((p) => p.name).join(', ')}`;
  if (k === 'cloud') return window.Sync?.active() ? 'Verbunden, gleicht automatisch ab' : 'Nicht verbunden';
  if (k === 'bau') return 'Vorlagen für Bad, Küche und alle anderen Räume';
  if (k === 'sicherung') return window.Sync?.active() ? 'Notfall-Export als Datei' : 'Sicherung als Datei, z. B. in OneDrive';
  return '';
}
function viewEinstellungen() {
  state.editPkg = null;
  const v = window.__vorEinst || { tab: 'kunden', s: {} };
  header('Einstellungen', state.settings.company || '', { label: 'Zurück', fn: () => switchTab(v.tab, v.s) });
  const warn = (k) => (k === 'ki' && !state.settings.apiKey) || (k === 'cloud' && !window.Sync?.active());
  main().innerHTML = `<div class="docs">${EINST.map(([k, t, ic, col]) => `
    <button class="doc" data-einst="${k}"><span class="d-ico ${col}">${icon(ic)}</span>
      <span class="d-t"><b>${esc(t)}</b><span class="${warn(k) ? 'warn' : ''}">${esc(einstellungInfo(k))}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>
    <p class="hint center" style="margin-top:18px">App-Version ${APP_VERSION} · <a href="diag.html">Bildschirm-Test</a></p>`;
  $$('[data-einst]').forEach((b) => (b.onclick = () => { einstellungSeite(b.dataset.einst); window.scrollTo(0, 0); }));
}
/** Beispiel einer Terminmail für einen Empfänger (r = team | kunde | partner). Gleicher Aufbau wie in supabase/functions/termin-mail. */
function mailVorschau(r, satz) {
  const firma = state.settings.company || 'DOM Projektmanagement';
  const z = (l, v) => (v ? `<tr><td style="padding:5px 12px 5px 0;color:#6b7380;vertical-align:top">${l}</td><td style="padding:5px 0;font-weight:600">${esc(v)}</td></tr>` : '');
  const wer = (window.Kalender?.team() || []).map((p) => p.name).join(', ');
  const zeilen = r === 'team'
    ? z('Anlass', 'Aufmaß Bad') + z('Wann', 'Freitag, 13. November 2026, 14:00 Uhr bis 15:00 Uhr') + z('Wo', 'Musterstraße 1, 70173 Stuttgart') + z('Kunde', 'Familie Müller · 0711 123456') + z('Objekt', 'Haus') + z('Projekt', 'Badumbau · Nr. 1001-01') + z('Subunternehmer', 'Fliesen Kaya GmbH · Mehmet Kaya') + z('Dabei', wer) + z('Notiz', 'Fliesenmuster mitbringen')
    : r === 'kunde'
      ? z('Anlass', 'Aufmaß Bad') + z('Wann', 'Freitag, 13. November 2026, 14:00 Uhr bis 15:00 Uhr') + z('Wo', 'Musterstraße 1, 70173 Stuttgart') + z('Von uns kommt', wer)
      : z('Anlass', 'Aufmaß Bad') + z('Wann', 'Freitag, 13. November 2026, 14:00 Uhr bis 15:00 Uhr') + z('Adresse', 'Musterstraße 1, 70173 Stuttgart') + z('Projekt', 'Badumbau · Nr. 1001-01') + z('Kunde', 'Familie Müller') + z('Termin mit', `${firma} (${wer})`);
  const anrede = r === 'team' ? 'Hallo Felix,' : r === 'kunde' ? 'Sehr geehrte Familie Müller,' : 'Hallo Mehmet Kaya,';
  const html = `<div style="background:#1e3550;color:#fff;border-radius:14px 14px 0 0;padding:14px 16px"><div style="font-size:12px;opacity:.75">${esc(firma)}</div><div style="font-size:19px;font-weight:700;margin-top:3px">Terminbestätigung</div></div>
    <div style="background:#fff;border-radius:0 0 14px 14px;padding:14px 16px;color:#1b2533"><p style="margin:0 0 4px">${esc(anrede)}</p><p style="margin:0 0 12px">${esc(satz)}</p><table style="border-collapse:collapse;font-size:14.5px">${zeilen}</table>
    ${r === 'team' ? '' : `<p style="margin:14px 0 0">Viele Grüße<br>${esc(firma)}</p>`}</div>`;
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" style="background:#f3f1ec"><div class="sheet-h"><b>Beispiel: Mail an ${r === 'team' ? 'euch' : r === 'kunde' ? 'den Kunden' : 'den Subunternehmer'}</b></div><div style="padding:4px 4px 12px">${html}</div><button class="btn block" data-zu>Schließen</button></div>`;
  document.body.appendChild(bg);
  requestAnimationFrame(() => bg.classList.add('on'));
  const zu = () => bg.remove();
  bg.onclick = (e) => { if (e.target === bg || e.target.closest('[data-zu]')) zu(); };
}
function einstellungSeite(k) {
  if (k === 'moodboards') { state.editPkg = null; return viewPakete(); }
  const S = state.settings;
  const [, titel] = EINST.find((x) => x[0] === k) || [];
  header(titel || 'Einstellungen', '', { label: 'Einstellungen', fn: () => { viewEinstellungen(); window.scrollTo(0, 0); } });
  const save = debounce(saveSettings, 300);
  if (k === 'bau') return Fortschritt.einstellungen();
  if (k === 'team') {
    // Personen für den Kalender (Termine je Person, oben im Kalender umschaltbar)
    if (!Array.isArray(S.team) || !S.team.length) S.team = JSON.parse(JSON.stringify(Kalender.team()));
    const render = () => {
      const T = Kalender.mailTexte();
      const ROLLEN = [
        ['team', 'Ihr (Team)', 'Alle Angaben: Anlass, Zeit, Ort, Kunde mit Telefon, Objekt, Projekt, Subunternehmer, wer dabei ist, Notiz.'],
        ['kunde', 'Kunde', 'Nur Anlass, Zeit, Ort und wer von uns kommt. Kein Hinweis auf den Subunternehmer, keine interne Notiz.'],
        ['partner', 'Subunternehmer', 'Anlass, Zeit, Adresse, Projekt und Kundenname, dazu dass der Termin mit DOM ist und wer von uns dabei ist. Keine Kundentelefonnummer, keine interne Notiz.'],
      ];
      main().innerHTML = `<div class="sec-h" style="margin-top:4px"><h2>Team</h2></div>
        <p class="hint" style="margin-top:-4px">Im Kalender kannst du oben zwischen den Personen umschalten. Die E-Mail-Adressen werden für die Terminmails gebraucht.</p>
        ${S.team.map((p, i) => `<div class="card kform" data-tp="${i}">
          <label style="margin-top:0">Name</label><input type="text" data-tf="name" value="${esc(p.name)}" autocomplete="off" placeholder="Vor- und Nachname">
          <label>E-Mail</label><input type="email" data-tf="email" value="${esc(p.email || '')}" autocomplete="off" inputmode="email" placeholder="name@firma.de">
          ${S.team.length > 1 ? `<button class="link-danger" data-tdel style="margin-top:10px">${icon('trash')} Entfernen</button>` : ''}</div>`).join('')}
        <button class="add-room" id="tpAdd">${icon('plus')} Person hinzufügen</button>
        <div class="sec-h"><h2>Terminmails</h2></div>
        <div class="card kform">
          <p class="muted" style="margin-top:0">Beim Speichern eines Termins bekommen die Beteiligten eine Bestätigung mit Ort, Zeit und Anlass, vor dem Termin eine Erinnerung. Einmalig in Supabase einzurichten: <a href="https://github.com/felix260796/dom-app/blob/main/TERMINMAILS_EINRICHTEN.md" target="_blank" rel="noopener">Anleitung öffnen</a>.</p>
          <p><b>${S.mailAktiv ? 'Eingerichtet' : 'Noch nicht eingerichtet'}</b>${window.Sync?.active() ? '' : ' · zuerst den Cloud-Abgleich verbinden'}</p>
          <label class="toggle" style="margin-top:12px"><input type="checkbox" id="mkAuto" ${S.mailKundeAuto !== false ? 'checked' : ''}><span class="tg"></span><span>Kunde bekommt bei neuen Terminen eine Bestätigung</span></label>
          <label class="toggle"><input type="checkbox" id="erAuto" ${S.erinnerungAuto !== false ? 'checked' : ''}><span class="tg"></span><span>Erinnerungen automatisch verschicken</span></label>
          <p class="hint" style="margin:2px 0 0">Beides ist nur die Voreinstellung. Beim einzelnen Termin kannst du es trotzdem an- oder abwählen.</p>
          <div id="erinBox" ${S.erinnerungAuto === false ? 'hidden' : ''}><label>Erinnerung standardmäßig</label>
          <select id="erinT">${[[0, 'keine'], [1, '1 Tag vorher'], [2, '2 Tage vorher'], [3, '3 Tage vorher'], [7, '1 Woche vorher']].map(([v, n]) => `<option value="${v}" ${(S.erinnerungTage ?? 1) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <button class="btn secondary block" id="mailTest" style="margin-top:12px" ${window.Sync?.active() ? '' : 'disabled'}>${icon('mail')} Test-Mail an das Team senden</button>
          ${S.mailAktiv ? '<button class="link-danger" id="mailAus" style="margin-top:6px">Terminmails ausschalten</button>' : ''}
        </div>
        <div class="sec-h"><h2>Wer bekommt was?</h2></div>
        <p class="hint" style="margin-top:-4px">Jeder bekommt seine eigene Mail. Die Anrede setzt die App automatisch ein, z. B. „Sehr geehrte Familie Müller,“ aus der Kundenkarte oder „Hallo Mehmet Kaya,“ beim Subunternehmer. Den Satz danach kannst du je Empfänger ändern. Leer lassen heißt Standardtext.</p>
        ${ROLLEN.map(([r, n, was]) => `<div class="card kform mvorl" data-mr="${r}">
          <div class="hv-h" style="margin-top:0">${icon(r === 'team' ? 'users' : r === 'kunde' ? 'user' : 'wrench')}<span>${n}</span></div>
          <p class="muted" style="margin:6px 0 0;font-size:14px">${was}</p>
          <label>Terminbestätigung</label><textarea data-mt="bestaetigung" rows="2" placeholder="${esc(Kalender.MAILTEXTE[r].bestaetigung)}">${esc(S.mailTexte?.[r]?.bestaetigung || '')}</textarea>
          <label>Erinnerung</label><textarea data-mt="erinnerung" rows="2" placeholder="${esc(Kalender.MAILTEXTE[r].erinnerung)}">${esc(S.mailTexte?.[r]?.erinnerung || '')}</textarea>
          <button class="btn secondary small" data-mvor style="margin-top:10px">${icon('eye')} Beispiel ansehen</button>
        </div>`).join('')}`;
      $$('[data-mr]').forEach((c) => {
        const r = c.dataset.mr;
        $$('[data-mt]', c).forEach((ta) => (ta.oninput = () => { S.mailTexte ??= {}; S.mailTexte[r] ??= {}; S.mailTexte[r][ta.dataset.mt] = ta.value; save(); }));
        $('[data-mvor]', c).onclick = () => mailVorschau(r, Kalender.mailTexte()[r].bestaetigung);
      });
      $('#erinT').onchange = (e) => { S.erinnerungTage = +e.target.value; save(); };
      $('#mkAuto').onchange = (e) => { S.mailKundeAuto = e.target.checked; save(); };
      $('#erAuto').onchange = (e) => { S.erinnerungAuto = e.target.checked; $('#erinBox').hidden = !e.target.checked; save(); };
      $('#mailTest').onclick = async () => {
        const an = S.team.filter((p) => /.+@.+\..+/.test(p.email || '')).map((p) => ({ name: p.name, email: p.email }));
        if (!an.length) { toast('Bitte zuerst oben eine E-Mail-Adresse eintragen.'); return; }
        $('#mailTest').disabled = true;
        try {
          const r = await Sync.funktion('termin-mail', { aktion: 'test', an });
          S.mailAktiv = true; await saveSettings();
          toast(`Test-Mail an ${r.gesendet} ${r.gesendet === 1 ? 'Adresse' : 'Adressen'} verschickt. Terminmails sind jetzt eingeschaltet.`, 5000); render();
        } catch (e) { toast('Hat nicht geklappt: ' + e.message, 7000); $('#mailTest').disabled = false; }
      };
      if ($('#mailAus')) $('#mailAus').onclick = async () => { S.mailAktiv = false; await saveSettings(); render(); };
      $$('[data-tp]').forEach((c) => {
        const p = S.team[+c.dataset.tp];
        $$('[data-tf]', c).forEach((inp) => (inp.oninput = () => { p[inp.dataset.tf] = inp.value.trim(); save(); }));
        if ($('[data-tdel]', c)) $('[data-tdel]', c).onclick = async () => { if (!confirm(`${p.name || 'Person'} entfernen?`)) return; S.team.splice(+c.dataset.tp, 1); await saveSettings(); render(); };
      });
      $('#tpAdd').onclick = async () => { S.team.push({ id: uid(), name: '', email: '' }); await saveSettings(); render(); $$('[data-tf="name"]').pop()?.focus(); };
    };
    render();
    return;
  }
  if (k === 'firma') {
    main().innerHTML = `
    <div class="card">
      <label>Firmenname</label><input type="text" id="company" value="${esc(S.company)}" placeholder="z. B. Muster Projektentwicklung GmbH">
      <label>Kontaktzeile für die PDF-Fußzeile</label><input type="text" id="contact" value="${esc(S.contact)}" placeholder="Firma · Straße · Tel. · www">
      <label>Logo</label>
      ${S.logo ? `<img class="logo-prev" src="${S.logo}" alt="Logo">` : ''}
      <div class="row" style="margin-top:8px"><button class="btn secondary" id="logo">Logo wählen</button>${S.logo ? '<button class="btn danger" id="nologo">Entfernen</button>' : ''}</div>
    </div>
`;
    for (const id of ['company', 'contact']) $('#' + id).oninput = (e) => { S[id] = e.target.value.trim(); save(); };
    $('#logo').onclick = async () => {
      const [f] = await pickFiles(); if (!f) return;
      S.logo = await resize(await fileToDataUrl(f), 800, 'image/png'); await saveSettings(); einstellungSeite('firma');
    };
    if ($('#nologo')) $('#nologo').onclick = async () => { S.logo = ''; await saveSettings(); einstellungSeite('firma'); };
  } else if (k === 'ki') {
    main().innerHTML = `
    <div class="card">
      <p class="muted">Schlüssel kostenlos erstellen unter <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Abgerechnet wird pro Bild bei Google. Der Schlüssel bleibt nur auf diesem Gerät gespeichert.</p>
      <label>API-Schlüssel</label><input type="password" id="apiKey" value="${esc(S.apiKey)}" placeholder="AIza…" autocomplete="off">
      <label>Modell</label>
      <select id="model">${S.modelList?.length ? S.modelList.map((m) => `<option value="${esc(m.id)}" ${m.id === S.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('') : `
        <option value="gemini-2.5-flash-image" ${S.model === 'gemini-2.5-flash-image' ? 'selected' : ''}>Gemini 2.5 Flash Image (schnell, günstig)</option>
        <option value="gemini-3-pro-image-preview" ${S.model === 'gemini-3-pro-image-preview' ? 'selected' : ''}>Gemini 3 Pro Image (beste Qualität, teurer)</option>
        ${['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'].includes(S.model) ? '' : `<option selected value="${esc(S.model)}">${esc(S.model)}</option>`}`}
      </select>
      <p class="muted">Tipp: Nach dem Eintragen des Schlüssels auf „Verbindung testen“ tippen. Dann zeigt die Liste alle aktuell verfügbaren Bild-Modelle von Google. Für beste Qualität das „Pro“-Modell wählen.</p>
      <label>Eigenes Modell (optional, überschreibt Auswahl)</label><input type="text" id="modelCustom" placeholder="Modell-ID">
      <button class="btn secondary block" id="test" style="margin-top:12px">Verbindung testen & Modelle laden</button>
    </div>
`;
    $('#apiKey').oninput = (e) => { S.apiKey = e.target.value.trim(); save(); };
    $('#model').onchange = (e) => { S.model = e.target.value; save(); };
    $('#modelCustom').oninput = (e) => { if (e.target.value.trim()) { S.model = e.target.value.trim(); save(); } };
    $('#test').onclick = async () => {
      if (!S.apiKey) { toast('Bitte zuerst den API-Schlüssel eintragen.'); return; }
      try {
        // Alle verfügbaren Modelle laden und die Bild-Modelle zur Auswahl anbieten
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': S.apiKey } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { toast(`${j.error?.message || r.status}`, 6000); return; }
        const imgModels = (j.models || [])
          .filter((m) => /image/i.test(m.name) && !/imagen/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
        if (!imgModels.length) { toast('Schlüssel ok, aber kein Bild-Modell gefunden.', 6000); return; }
        const sel = $('#model');
        sel.innerHTML = imgModels.map((m) => `<option value="${esc(m.id)}" ${m.id === S.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
        if (!imgModels.some((m) => m.id === S.model)) { S.model = imgModels[0].id; sel.value = S.model; await saveSettings(); }
        S.modelList = imgModels; await saveSettings();
        toast(`Verbunden. ${imgModels.length} Bild-Modell(e) gefunden, ausgewählt: ${sel.selectedOptions[0].textContent}`, 6000);
      } catch (e) { toast('' + e.message, 6000); }
    };
  } else if (k === 'preise') {
    main().innerHTML = '<div id="angebot-settings"></div>';
    window.Angebot?.einstellungenKarte();
  } else if (k === 'cloud') {
    main().innerHTML = '<div id="sync-settings"></div>';
    window.Sync?.einstellungenKarte($('#sync-settings'));
  } else if (k === 'sicherung') {
    main().innerHTML = '<div id="backup-settings"></div>';
    window.Backup?.einstellungenKarte($('#backup-settings'));
  }
}
