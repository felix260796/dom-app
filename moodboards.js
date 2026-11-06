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
function viewEinstellungen() {
  header('Einstellungen', 'Moodboards, Firma, KI, Preise, Sicherung');
  const S = state.settings;
  const nBoards = ROOM_TYPES.filter((r) => state.boards?.[r.id]?.some((p) => p.images?.length || p.products?.length)).length;
  main().innerHTML = `
    <div class="docs" style="margin-bottom:14px">
      <button class="doc" id="toBoards"><span class="d-ico brass">${icon('palette')}</span>
        <span class="d-t"><b>Standard-Moodboards</b><span>Basic, Standard und Premium je Raumtyp${nBoards ? ` · ${nBoards} Raumtyp${nBoards === 1 ? '' : 'en'} mit Bildern` : ''}</span></span>${icon('chevron', 'pc-chev')}</button>
    </div>
    <div class="card">
      <h2>Firma</h2>
      <label>Firmenname</label><input type="text" id="company" value="${esc(S.company)}" placeholder="z. B. Muster Projektentwicklung GmbH">
      <label>Kontaktzeile für die PDF-Fußzeile</label><input type="text" id="contact" value="${esc(S.contact)}" placeholder="Firma · Straße · Tel. · www">
      <label>Logo</label>
      ${S.logo ? `<img class="logo-prev" src="${S.logo}" alt="Logo">` : ''}
      <div class="row" style="margin-top:8px"><button class="btn secondary" id="logo">Logo wählen</button>${S.logo ? '<button class="btn danger" id="nologo">Entfernen</button>' : ''}</div>
    </div>
    <div class="card">
      <h2>KI-Bildbearbeitung (Google Gemini)</h2>
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
    <div id="angebot-settings"></div>
    <div id="sync-settings"></div>
    <div id="backup-settings"></div>`;
  $('#toBoards').onclick = () => { state.editPkg = null; viewPakete(); window.scrollTo(0, 0); };
  const save = debounce(saveSettings, 300);
  for (const id of ['company', 'contact', 'apiKey']) $('#' + id).oninput = (e) => { S[id] = e.target.value.trim(); save(); };
  $('#model').onchange = (e) => { S.model = e.target.value; save(); };
  $('#modelCustom').oninput = (e) => { if (e.target.value.trim()) { S.model = e.target.value.trim(); save(); } };
  $('#logo').onclick = async () => {
    const [f] = await pickFiles(); if (!f) return;
    S.logo = await resize(await fileToDataUrl(f), 800, 'image/png'); await saveSettings(); viewEinstellungen();
  };
  $('#nologo') && ($('#nologo').onclick = async () => { S.logo = ''; await saveSettings(); viewEinstellungen(); });
  window.Angebot?.einstellungenKarte();
  window.Sync?.einstellungenKarte($('#sync-settings'));
  window.Backup?.einstellungenKarte($('#backup-settings'));
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
}

