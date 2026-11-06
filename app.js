'use strict';
/* DOM – Oberfläche: Kopfzeile, Navigation, Projektliste und Raum-Ansicht.
 * Aufbau der App (bewusst flach):
 *   Projekte (Liste)  →  Projekt (Kunde, Räume, Unterlagen)  →  Raum (Fotos, Pakete, Ergebnis)
 * Ein Projekt hat einen oder mehrere Räume. Kundenmappe und Baumappe entstehen im Projekt.
 * Kern-Funktionen (Speicher, KI, Bilder) stehen in core.js. */

// ---------- Symbole (einfache Linien-Icons) ----------
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.6-2h6.8l1.6 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M21 16l-5-5L6 20"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h13v-4M8 7h7"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  euro: '<path d="M17.5 6.5a6.5 6.5 0 1 0 0 11"/><path d="M4 10h9M4 14h9"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.2a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.6"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.7-.9 1.3-1.9-.5-1.2.3-2.3 1.6-2.3H17a4 4 0 0 0 4-4C21 7.3 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  moon: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  map: '<path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0C18 15.5 12 21 12 21z"/><circle cx="12" cy="10.5" r="2"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  // Raumtypen
  'rt-bad': '<path d="M4 12h16v2.5A4.5 4.5 0 0 1 15.5 19h-7A4.5 4.5 0 0 1 4 14.5z"/><path d="M6.5 12V6.5a2.5 2.5 0 0 1 5 0"/><path d="M7.5 19l-1 2M16.5 19l1 2"/>',
  'rt-gaeste-wc': '<path d="M7 3h5v8H7z"/><path d="M5 11h14a6 6 0 0 1-6 6h-1.5l.8 4H8.5l.7-4.4A6 6 0 0 1 5 11z"/>',
  'rt-kueche': '<path d="M4 10h16"/><path d="M5.5 10v7a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-7M2 10h2.5M19.5 10H22"/><path d="M9 6.5c0-1.2 1.2-1.2 1.2-2.5M13.5 6.5c0-1.2 1.2-1.2 1.2-2.5"/>',
  'rt-wohnzimmer': '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12.5a2 2 0 0 1 4 0V15h10v-2.5a2 2 0 0 1 4 0V18H3z"/><path d="M5 18v2M19 18v2"/>',
  'rt-schlafzimmer': '<path d="M3 19V6M21 19v-5.5A2.5 2.5 0 0 0 18.5 11H11v4M3 15h18"/><circle cx="7" cy="12" r="1.8"/>',
  'rt-kinderzimmer': '<path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/>',
  'rt-flur': '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16"/><circle cx="14.5" cy="12" r=".9"/>',
  'rt-treppenhaus': '<path d="M3 20h5v-4h4v-4h4V8h5"/>',
  'rt-fassade': '<path d="M3 21V10l9-6 9 6v11z"/><path d="M9.5 21v-5h5v5M7 12h2.5M14.5 12H17"/>',
  'rt-garten': '<path d="M12 22v-6.5"/><path d="M12 15.5a5 5 0 0 0 5-5 5 5 0 0 0-5-7.5 5 5 0 0 0-5 7.5 5 5 0 0 0 5 5z"/><path d="M8 22h8"/>',
  'rt-heizraum': '<path d="M12 22a6.5 6.5 0 0 0 6.5-6.5c0-4.2-3.3-6.3-4.5-9.5-2 1.8-2.3 4-2.3 4s-1.3-1-1.3-3.2C7.2 9 5.5 12.2 5.5 15.5A6.5 6.5 0 0 0 12 22z"/>',
  'rt-sonstiges': '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS['rt-sonstiges']}</svg>`;
const roomIcon = (id, cls = '') => icon(ICONS['rt-' + id] ? 'rt-' + id : 'rt-sonstiges', cls);
const fmtDay = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ---------- Kopfzeile & Navigation ----------
/** Titel, Untertitel und Zurück-Knopf oben setzen. back = { label, fn } oder null. */
function header(title, sub = '', back = null) {
  $('#title').textContent = title;
  const s = $('#subtitle'); s.textContent = sub || ''; s.hidden = !sub;
  const tb = $('#topback');
  if (back) { tb.innerHTML = `${icon('back')}<span>${esc(back.label)}</span>`; tb.hidden = false; tb.onclick = back.fn; }
  else { tb.hidden = true; tb.onclick = null; }
}
const setTitle = (t) => { $('#title').textContent = t; $('#subtitle').hidden = true; };
// Ansichten aus angebot.js / social.js haben eigene Zurück-Knöpfe (#aBack, #soBack, #vBack). Sie werden oben gespiegelt.
const LEGACY_BACK = '#aBack, #vBack, #soBack';
new MutationObserver(() => {
  const src = main().querySelector(LEGACY_BACK);
  if (!src) return;
  const tb = $('#topback');
  tb.innerHTML = `${icon('back')}<span>${esc(src.textContent.replace(/^[←\s]+/, '').replace(/^Zurück zum /, '').trim() || 'Zurück')}</span>`;
  tb.hidden = false; tb.onclick = () => src.click();
}).observe(document.getElementById('main'), { childList: true });

function switchTab(tab) {
  state.tab = tab;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  ({ projekt: viewProjekt, pakete: viewPakete, einstellungen: viewEinstellungen })[tab]();
}
$$('.tabbar button').forEach((b) => (b.onclick = () => {
  if (b.dataset.tab === 'pakete') { state.editPkg = null; if (state.project?.roomType) state.boardRoom = state.project.roomType; }
  // Erneutes Tippen auf „Projekte“ führt zurück zur Liste
  if (b.dataset.tab === 'projekt' && state.tab === 'projekt') { state.project = null; state.wohnung = null; }
  switchTab(b.dataset.tab);
}));

/** Auswahlfenster von unten. items: [{ label, sub?, icon?, color?, value }] → Promise<value|null>.
 * text: Platzhalter für ein freies Textfeld (Ergebnis dann { text }). */
function sheet(title, items, { text } = {}) {
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'sheet-bg';
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="sheet-h"><b>${esc(title)}</b><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
      ${text ? `<div class="sheet-text"><input type="text" id="sheetText" placeholder="${esc(text)}"><button class="btn" id="sheetOk">OK</button></div>` : ''}
      <div class="sheet-list">${items.map((it, i) => `<button class="sheet-item" data-i="${i}">${it.icon ? `<span class="si-ico" ${it.color ? `style="--c:${it.color}"` : ''}>${it.icon}</span>` : ''}<span class="si-t"><b>${esc(it.label)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}</span></button>`).join('')}</div></div>`;
    const close = (v) => { el.classList.remove('on'); setTimeout(() => el.remove(), 180); res(v); };
    el.onclick = (e) => { if (e.target === el || e.target.closest('[data-x]')) close(null); };
    $$('[data-i]', el).forEach((b) => (b.onclick = () => close(items[+b.dataset.i].value)));
    if (text) { const ok = () => { const v = $('#sheetText', el).value.trim(); if (v) close({ text: v }); }; $('#sheetOk', el).onclick = ok; $('#sheetText', el).onkeydown = (e) => e.key === 'Enter' && ok(); }
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
  });
}

// ---------- Projektliste ----------
let listFilter = '';
async function viewProjektListe() {
  header('Projekte', state.settings.company || '');
  const idx = await projectIndex();
  const q = listFilter.trim().toLowerCase();
  const shown = q ? idx.filter((x) => `${x.customer} ${x.address || ''} ${x.room || ''}`.toLowerCase().includes(q)) : idx;
  main().innerHTML = `
    <button class="cta" id="new">
      <span class="cta-ico">${icon('plus')}</span>
      <span class="cta-t"><b>Neues Projekt</b><span>Kunde anlegen, Räume fotografieren, Mappe erstellen</span></span>
      ${icon('chevron', 'cta-chev')}
    </button>
    ${state.settings.apiKey ? '' : `<button class="notice" id="toSet">${icon('gear')}<span><b>KI noch nicht eingerichtet.</b> Einmalig den Google-Schlüssel in den Einstellungen eintragen.</span>${icon('chevron')}</button>`}
    <div id="backupHint"></div>
    ${idx.length ? `
      <div class="sec-h"><h2>Deine Projekte</h2><span class="count">${idx.length}</span></div>
      ${idx.length > 5 ? `<label class="search">${icon('search')}<input type="search" id="q" value="${esc(listFilter)}" placeholder="Kunde, Adresse oder Raum suchen"></label>` : ''}
      <div class="plist">${shown.map((x) => `
        <button class="pcard" data-open="${x.id}" data-kind="${x.kind || ''}">
          ${x.thumb ? `<img src="${x.thumb}" alt="">` : `<span class="pc-ph">${icon('home')}</span>`}
          <span class="pc-t"><b>${esc(x.customer || 'Ohne Namen')}</b>
            ${x.address ? `<span class="muted">${esc(x.address)}</span>` : ''}
            <span class="pc-meta">${esc(x.room || '')}${x.room ? ' · ' : ''}${fmtDay(x.updated || x.created)}</span></span>
          ${icon('chevron', 'pc-chev')}
        </button>`).join('') || '<p class="empty">Nichts gefunden.</p>'}</div>` : `
      <div class="empty-state">${icon('home')}<b>Noch keine Projekte</b><span>Tippe auf „Neues Projekt“, gib den Kunden ein und füge die Räume hinzu.</span></div>`}`;
  $('#new').onclick = () => Projekt.neu();
  if ($('#toSet')) $('#toSet').onclick = () => switchTab('einstellungen');
  if ($('#q')) $('#q').oninput = debounce((e) => { listFilter = e.target.value; viewProjektListe().then(() => { const i = $('#q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 250);
  $$('[data-open]').forEach((el) => (el.onclick = async () => {
    if (el.dataset.kind === 'wohnung') return Projekt.oeffnen(el.dataset.open);
    // Altes Einzelprojekt (wird beim Start normalerweise umgestellt)
    const p = normalizeProject(await kvGet('project:' + el.dataset.open));
    if (p) { state.wohnung = null; state.project = p; viewProjekt(); }
  }));
  window.Backup?.hinweis($('#backupHint'));
}

// ---------- Raum ----------
const uiOpen = { more: false };
async function viewProjekt() {
  const p = normalizeProject(state.project);
  if (!p) return state.wohnung ? Projekt.view() : viewProjektListe();
  const w = state.wohnung;
  const rt = roomType(p.roomType);
  const backToProject = () => { state.project = null; viewProjekt(); window.scrollTo(0, 0); };
  header(p.room || rt.name, [w?.customer || p.customer, rt.name].filter(Boolean).join(' · '), { label: w ? 'Projekt' : 'Projekte', fn: backToProject });
  const pkgs = packagesFor(p.roomType);
  const full = p.photos.length >= MAX_PHOTOS;
  const visible = pkgs.filter((x) => firstResult(p, x.id) || Object.keys(p.status || {}).some((k) => k.startsWith(x.id + ':') && (p.status[k].loading || p.status[k].error)));
  const nImg = p.photos.length * p.selected.length;
  const marks = window.Baumappe?.anzahl(p) || 0;
  const am = p.aufmass?.raeume || [], qm = am.reduce((s, r) => s + (window.Angebot?._intern.masse(r).boden || 0), 0);
  main().innerHTML = `
    <div class="card room-head">
      <span class="rh-ico">${roomIcon(rt.id)}</span>
      <div class="rh-f">
        <input type="text" id="room" class="title-in" value="${esc(p.room)}" placeholder="${esc(rt.name)}" aria-label="Raumtitel">
        <select id="roomType" aria-label="Raumtyp">${ROOM_TYPES.map((r) => `<option value="${r.id}" ${r.id === p.roomType ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      </div>
    </div>

    <section class="step">
      <div class="step-h"><span class="num">1</span><h2>Fotos</h2><span class="step-x">${p.photos.length} von ${MAX_PHOTOS}</span></div>
      <div class="card">
        <div class="photos">${p.photos.map((ph, i) => `
          <div class="ph"><img src="${ph}" alt="Ansicht ${i + 1}"><span class="ph-n">${i + 1}</span><button class="ph-x" data-delphoto="${i}" aria-label="Foto entfernen">${icon('x')}</button></div>`).join('')}
          ${full ? '' : `<button class="ph-add" id="cam">${icon('camera')}<span>Kamera</span></button><button class="ph-add" id="gal">${icon('image')}<span>Fotos</span></button>`}
        </div>
        <p class="hint">${p.photos.length ? 'Jedes Foto wird eine eigene Nachher-Ansicht. Die KI nutzt alle Fotos, um den Raum zu verstehen.' : 'Am besten quer und aus den Ecken fotografieren, bis zu 4 Blickwinkel.'}</p>
      </div>
    </section>

    <section class="step">
      <div class="step-h"><span class="num">2</span><h2>Pakete</h2></div>
      <div class="card">
        <div class="chips">${pkgs.map((x) => `<button class="chip ${p.selected.includes(x.id) ? 'on' : ''}" data-sel="${x.id}" style="--c:${x.color}">${icon('check', 'chip-ck')}${esc(x.name)}</button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" id="withEvening" ${p.withEvening ? 'checked' : ''}><span class="tg"></span><span>${icon('moon')} Zusätzlich Abendstimmung</span></label>
        <details class="more" id="more" ${uiOpen.more ? 'open' : ''}>
          <summary>${icon('mic')}<span>Hinweise & Kundenwünsche<small>${[p.note?.trim() && 'Hinweis', p.wishes?.trim() && 'Wünsche', p.transcript?.trim() && 'Gespräch'].filter(Boolean).join(' · ') || 'optional'}</small></span>${icon('chevron', 'more-chev')}</summary>
          <label>Hinweis für die KI</label><textarea id="note" placeholder="${esc(rt.id === 'garten' ? 'z. B. Terrasse vergrößern, Wärmepumpe links neben die Tür' : 'z. B. Badewanne raus, dafür große Dusche')}">${esc(p.note)}</textarea>
          ${voiceCard(p)}
        </details>
        <div id="garten-card"></div>
        <button class="btn big block" id="go" ${p.photos.length && p.selected.length ? '' : 'disabled'}>${icon('sparkle')} Visualisieren</button>
        <p class="hint center" id="goInfo">${p.photos.length ? `${nImg} ${nImg === 1 ? 'Bild' : 'Bilder'}${p.withEvening ? ' + Abendstimmung' : ''} · ca. 10–30 Sekunden pro Bild` : 'Zuerst ein Foto machen.'}</p>
      </div>
    </section>

    <section class="step">
      <div class="step-h"><span class="num">3</span><h2>Ergebnis</h2></div>
      <div id="results">${visible.length ? visible.map(resultCard).join('') : `<div class="card empty-res">${icon('sparkle')}<span>Hier erscheinen die Nachher-Bilder. Mit dem Regler vergleichst du Vorher und Nachher.</span></div>`}</div>
      <button class="btn secondary block" id="toMappe" ${hasAnyResult(p) && w ? '' : 'hidden'}>${icon('book')} Zur Kundenmappe</button>
    </section>

    <section class="step">
      <div class="step-h"><span class="num">4</span><h2>Weiter mit diesem Raum</h2></div>
      <div class="tiles">
        <button class="tile" id="toAngebot"><span class="t-ico">${icon('ruler')}</span><b>Aufmaß & Angebot</b><span>${qm ? `${qm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} m²${p.angebot?.nr ? ' · Nr. ' + esc(p.angebot.nr) : ''}` : 'Maße, Preise, Bauzeit'}</span></button>
        <button class="tile" id="toMarks" ${hasAnyResult(p) ? '' : 'disabled'}><span class="t-ico">${icon('pin')}</span><b>Markierungen</b><span>${marks ? `${marks} für die Baumappe` : 'Nummern für die Baumappe'}</span></button>
        <button class="tile" id="social" ${hasAnyResult(p) ? '' : 'disabled'}><span class="t-ico">${icon('film')}</span><b>Instagram</b><span>Video & Post</span></button>
      </div>
    </section>
    <button class="link-danger" id="del">${icon('trash')} Raum löschen</button>`;

  const persist = debounce(() => saveProject(p), 400);
  const rerender = async () => { await saveProject(p); const y = window.scrollY; await viewProjekt(); window.scrollTo(0, y); };
  const addPhotos = async (camera) => {
    const files = await pickFiles({ camera, multiple: !camera });
    if (!files.length) return;
    const free = MAX_PHOTOS - p.photos.length;
    for (const f of files.slice(0, free)) p.photos.push(await resize(await fileToDataUrl(f), 1600));
    if (files.length > free) toast(`Maximal ${MAX_PHOTOS} Fotos pro Raum.`);
    p.thumb = await resize(p.photos[0], 240);
    rerender();
  };
  if ($('#cam')) { $('#cam').onclick = () => addPhotos(true); $('#gal').onclick = () => addPhotos(false); }
  $$('[data-delphoto]').forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.delphoto;
    if (Object.values(p.results).some((a) => a[i]) && !confirm('Foto mit den zugehörigen Nachher-Bildern entfernen?')) return;
    p.photos.splice(i, 1);
    for (const k of Object.keys(p.results)) p.results[k].splice(i, 1);
    for (const k of Object.keys(p.evening || {})) p.evening[k].splice(i, 1);
    window.Baumappe?.fotoEntfernt(p, i);
    p.thumb = p.photos[0] ? await resize(p.photos[0], 240) : '';
    rerender();
  }));
  $('#room').oninput = (e) => { p.room = e.target.value; persist(); $('#title').textContent = p.room || rt.name; };
  $('#roomType').onchange = async (e) => {
    const old = roomType(p.roomType).name;
    p.roomType = e.target.value;
    if (!p.room || p.room === old) p.room = roomType(p.roomType).name;
    p.selected = packagesFor(p.roomType).map((x) => x.id);
    rerender();
  };
  $('#note').oninput = (e) => { p.note = e.target.value; persist(); };
  $('#more').ontoggle = (e) => { uiOpen.more = e.target.open; };
  const updGoInfo = () => {
    const n = p.photos.length * p.selected.length;
    $('#go').disabled = !n;
    if (p.photos.length) $('#goInfo').textContent = n ? `${n} ${n === 1 ? 'Bild' : 'Bilder'}${p.withEvening ? ' + Abendstimmung' : ''} · ca. 10–30 Sekunden pro Bild` : 'Bitte mindestens ein Paket wählen.';
  };
  $('#withEvening').onchange = (e) => { p.withEvening = e.target.checked; persist(); updGoInfo(); };
  $$('[data-sel]').forEach((c) => (c.onclick = () => {
    c.classList.toggle('on');
    p.selected = $$('[data-sel]').filter((x) => x.classList.contains('on')).map((x) => x.dataset.sel);
    persist(); updGoInfo();
  }));
  bindVoice(p, persist);
  $('#go').onclick = async () => {
    if (!state.settings.apiKey) return toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000);
    const done = packagesFor(p.roomType).filter((x) => p.selected.includes(x.id) && firstResult(p, x.id));
    if (done.length && !confirm(`${done.map((x) => x.name).join(', ')} ${done.length === 1 ? 'ist' : 'sind'} schon fertig und ${done.length === 1 ? 'wird' : 'werden'} neu erstellt. Weiter?`)) return;
    setTimeout(() => $('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    runAll(p);
  };
  $('#toMappe').onclick = () => w && Projekt.mappeView(w);
  $('#toAngebot').onclick = () => window.Angebot?.ansicht(p);
  $('#toMarks').onclick = () => window.Baumappe?.markierungen(p);
  $('#social').onclick = () => viewSocial(p).catch((e) => toast('Fehler: ' + e.message, 5000));
  $('#del').onclick = async () => {
    if (!confirm(`Raum „${p.room || rt.name}“ mit Fotos und Visualisierungen löschen?`)) return;
    await deleteProject(p.id);
    if (p.wohnungId) await window.Projekt?.raumEntfernt(p);
    backToProject();
  };
  bindResultButtons(p);
  window.Garten?.projektKarte(p, persist);
}

// ---------- Ergebnis-Karten ----------
function resultCard(pkg) {
  const p = state.project;
  const multi = p.photos.length > 1;
  const views = p.photos.map((_, i) => {
    const key = `${pkg.id}:${i}`;
    const st = p.status?.[key], res = p.results[pkg.id]?.[i];
    const eve = eveningOf(p, pkg.id, i), est = p.status?.[key + ':abend'];
    const mood = moodSel[`${p.id}:${key}`] === 'abend' && (eve || est?.loading || est?.error) ? 'abend' : 'tag';
    let body;
    if (st?.loading) body = `<div class="status"><div class="spinner"></div>KI gestaltet „${esc(pkg.name)}“${multi ? `, Ansicht ${i + 1}` : ''} …</div>`;
    else if (st?.error) body = `<div class="status err">${esc(st.error)}</div>`;
    else if (res) {
      if (mood === 'abend' && est?.loading) body = `<div class="status"><div class="spinner"></div>KI setzt das Licht auf Abend …</div>`;
      else if (mood === 'abend' && est?.error && !eve) body = `<div class="status err">${esc(est.error)}</div>`;
      else body = beforeAfter(p.photos[i], mood === 'abend' ? eve : res, `Nachher ${pkg.name}`);
    } else body = '<div class="status">Noch nicht erstellt</div>';
    const moodBar = res && !st?.loading ? `<div class="mood"><button data-mood="tag" data-pkg="${pkg.id}" data-view="${i}" class="${mood === 'tag' ? 'on' : ''}">${icon('sun')} Tag</button><button data-mood="abend" data-pkg="${pkg.id}" data-view="${i}" class="${mood === 'abend' ? 'on' : ''}">${icon('moon')} Abend${eve || est?.loading ? '' : ' +'}</button></div>` : '<span></span>';
    const actions = [mood === 'abend' && (eve || est?.error) && !est?.loading ? `<button class="mini" data-redoeve="${pkg.id}" data-view="${i}">Abend neu</button>` : '',
      (res || st?.error) && !st?.loading ? `<button class="mini" data-redo="${pkg.id}" data-view="${i}">${icon('refresh')} Neu</button>` : ''].join('');
    return `<div class="rview">${multi ? `<div class="rv-n">Ansicht ${i + 1}</div>` : ''}<div class="rv-body">${body}</div><div class="rv-bar">${moodBar}<span class="rv-act">${actions}</span></div></div>`;
  }).join('');
  return `<div class="result" id="res-${pkg.id}" style="--c:${pkg.color}">
    <div class="r-head"><span class="r-name"><i></i>${esc(pkg.name)}</span><span class="r-desc">${esc(pkg.fields?.beschreibung || '')}</span></div>
    ${views}
  </div>`;
}
function refreshResult(pkg) {
  const p = state.project;
  if (!$('#results')) return;
  const el = $('#res-' + pkg.id);
  $('.empty-res')?.remove();
  if (!el) {
    // in Paket-Reihenfolge einfügen
    const order = packagesFor(p.roomType).map((x) => x.id);
    const next = $$('#results .result').find((r) => order.indexOf(r.id.slice(4)) > order.indexOf(pkg.id));
    if (next) next.insertAdjacentHTML('beforebegin', resultCard(pkg)); else $('#results').insertAdjacentHTML('beforeend', resultCard(pkg));
  } else el.outerHTML = resultCard(pkg);
  bindResultButtons(p);
  const any = hasAnyResult(p);
  if ($('#toMappe')) $('#toMappe').hidden = !any || !state.wohnung;
  for (const id of ['#social', '#toMarks']) if ($(id)) $(id).disabled = !any;
}
function bindResultButtons(p) {
  const pk = (id) => packagesFor(p.roomType).find((x) => x.id === id);
  $$('[data-redo]').forEach((b) => (b.onclick = () => runView(p, pk(b.dataset.redo), +b.dataset.view)));
  $$('[data-mood]').forEach((b) => (b.onclick = () => {
    const pkg = pk(b.dataset.pkg), i = +b.dataset.view;
    moodSel[`${p.id}:${pkg.id}:${i}`] = b.dataset.mood;
    if (b.dataset.mood === 'abend' && !eveningOf(p, pkg.id, i) && !p.status?.[`${pkg.id}:${i}:abend`]?.loading) {
      if (!state.settings.apiKey) return toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000);
      runEvening(p, pkg, i);
    } else refreshResult(pkg);
  }));
  $$('[data-redoeve]').forEach((b) => (b.onclick = () => runEvening(p, pk(b.dataset.redoeve), +b.dataset.view)));
}

// ---------- Start ----------
(async () => {
  await loadAll();
  try { await Projekt.migrate(); } catch (e) { console.error('Umstellung', e); }
  navigator.storage?.persist?.();
  switchTab('projekt');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
