'use strict';
/* DOM – Oberfläche: Kopfzeile, Navigation, Projektliste und Raum-Ansicht.
 * Aufbau der App (bewusst flach):
 *   Projekte (Liste)  →  Projekt (Kunde, Räume, Unterlagen)  →  Raum (Fotos, Pakete, Ergebnis)
 * Ein Projekt hat einen oder mehrere Räume. Kundenmappe und Baumappe entstehen im Projekt.
 * Kern-Funktionen (Speicher, KI, Bilder) stehen in core.js. */

// ---------- Symbole (einfache Linien-Icons) ----------
const APP_VERSION = '46';
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
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.7-.9 1.3-1.9-.5-1.2.3-2.3 1.6-2.3H17a4 4 0 0 0 4-4C21 7.3 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  moon: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  phone: '<path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 5.2 5.2l1.4-2.1 4.2 1.6V17a2.5 2.5 0 0 1-2.7 2.5A15.5 15.5 0 0 1 2.5 6.2 2.5 2.5 0 0 1 5 3.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  cake: '<path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 15c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0M12 11V8M12 5.5c-.8-.8-.8-1.7 0-2.5.8.8.8 1.7 0 2.5z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  map: '<path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0C18 15.5 12 21 12 21z"/><circle cx="12" cy="10.5" r="2"/>',
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V9"/><path d="M7 14l5-5 5 5"/><path d="M5 4h14"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>',
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

// Jeder Reiter merkt sich, wo man zuletzt war (Kunde, Projekt, Raum)
const tabState = {};
function switchTab(tab, restore) {
  if (state.tab !== tab || restore) {
    tabState[state.tab] = { project: state.project, wohnung: state.wohnung, kunde: state.kunde, objekt: state.objekt, partner: state.partner };
    const s = restore || tabState[tab] || {};
    state.project = s.project || null; state.wohnung = s.wohnung || null; state.kunde = s.kunde || null; state.objekt = s.objekt || null; state.partner = s.partner || null;
  }
  state.tab = tab; state.kalender = false;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (tab === 'einstellungen') state.editPkg = null;
  ({ kunden: viewProjekt, partner: () => Partner.start(), projekt: viewProjekt, schnell: () => Schnell.view(), einstellungen: viewEinstellungen })[tab]();
}
/** Reiter wechseln und dort direkt etwas öffnen, z. B. openTab('kunden', { kunde }). */
window.openTab = (tab, s) => switchTab(tab, s);
$$('.tabbar button').forEach((b) => (b.onclick = () => {
  // Erneutes Tippen auf den aktiven Reiter führt zurück zur Liste
  if (b.dataset.tab === state.tab && !state.kalender) { state.project = null; state.wohnung = null; state.kunde = null; state.objekt = null; state.partner = null; }
  switchTab(b.dataset.tab);
}));

/** Auswahlfenster von unten. items: [{ label, sub?, icon?, color?, value }] → Promise<value|null>.
 * text: Platzhalter für ein freies Textfeld (Ergebnis dann { text }). */
function sheet(title, items, { text, value = '' } = {}) {
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'sheet-bg';
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="sheet-h"><b>${esc(title)}</b><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
      ${text ? `<div class="sheet-text"><input type="text" id="sheetText" placeholder="${esc(text)}" value="${esc(value)}"><button class="btn" id="sheetOk">OK</button></div>` : ''}
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
/** Zweite Zeile einer Projektkarte: Objekt (Bezeichnung bzw. Anschrift), nicht der Kunde. */
/** Projektliste: wo (Objektanschrift) und für wen (Kunde) */
function projektOrt(x) {
  const k = Kunden.byId(x.kundeId), o = k && Kunden.objekt(k, x.objektId);
  return (o && Kunden.einzeilig(o.adresse)) || x.address || (o && o.name.trim()) || '';
}
const projektKunde = (x) => Kunden.name(Kunden.byId(x.kundeId)) || x.customer || '';
function objektZeile(x) {
  const k = Kunden.byId(x.kundeId), o = k && Kunden.objekt(k, x.objektId);
  return [o && o.name.trim(), x.address || (o && Kunden.einzeilig(o.adresse))].filter(Boolean).join(' · ');
}
let listFilter = '', listStatus = '', listKarte = false;
async function viewProjektListe() {
  // Reiter: Angebote (versendet und abgesagt) · Eingeplant · Läuft · Fertig
  const GR = [['angebot', 'Angebote', Projekt.ANGEBOT[0][2]], ['geplant', 'Eingeplant', Projekt.STATUS[0][2]], ['', 'Läuft', Projekt.STATUS[1][2]], ['fertig', 'Fertig', Projekt.STATUS[2][2]]];
  header({ '': 'Laufende Projekte', angebot: 'Angebote', geplant: 'Eingeplante Projekte', fertig: 'Abgeschlossene Projekte' }[listStatus], state.settings.company || '');
  const alleP = await projectIndex();
  const stOf = (x) => (Projekt.ALLE.some((s) => s[0] === x.status) ? x.status : '');
  const grOf = (x) => (stOf(x) === 'abgesagt' ? 'angebot' : stOf(x));
  const idx = alleP.filter((x) => grOf(x) === listStatus).sort((a, b) => (stOf(a) === 'abgesagt') - (stOf(b) === 'abgesagt'));
  const q = listFilter.trim().toLowerCase();
  const hay = (x) => { const k = Kunden.byId(x.kundeId); return `${x.nr || ''} ${x.titel || ''} ${x.customer} ${x.address || ''} ${x.room || ''} ${k ? `${k.nr} ${k.telefon} ${k.email} ${k.privat}` : ''}`.toLowerCase(); };
  const shown = q ? idx.filter((x) => q.split(/\s+/).every((t) => hay(x).includes(t))) : idx;
  main().innerHTML = `
    <button class="cta slim" id="new">
      <span class="cta-ico">${icon('plus')}</span>
      <span class="cta-t"><b>Neues Projekt</b></span>
      ${icon('chevron', 'cta-chev')}
    </button>
    ${state.settings.apiKey ? '' : `<button class="notice" id="toSet">${icon('gear')}<span><b>KI noch nicht eingerichtet.</b> Einmalig den Google-Schlüssel in den Einstellungen eintragen.</span>${icon('chevron')}</button>`}
    <div id="backupHint"></div>
    ${alleP.length ? `<div class="seg2 full wstatus lstat" style="margin-top:14px">${GR.map(([id, n, c]) => `<button data-ls="${id}" class="${listStatus === id ? 'on' : ''}" style="--c:${c}">${n} <small>${alleP.filter((x) => grOf(x) === id).length}</small></button>`).join('')}</div>` : ''}
    ${idx.length ? `
      <div class="lk-row"><label class="search">${icon('search')}<input type="search" id="q" value="${esc(listFilter)}" placeholder="Kunde, Adresse, Raum oder Nummer" autocomplete="off"></label>
        <button class="lk-toggle ${listKarte ? 'on' : ''}" id="lkToggle">${icon(listKarte ? 'list' : 'map')}<span>${listKarte ? 'Liste' : 'Karte'}</span></button></div>
      ${listKarte ? '<div class="pmap" id="pmap"></div><p class="hint pmap-info" id="pmapInfo">Karte wird geladen …</p>' : `<div class="plist">${shown.map((x) => `
        <button class="pcard" data-open="${x.id}" data-kind="${x.kind || ''}">
          ${x.thumb ? `<img src="${x.thumb}" alt="">` : `<span class="pc-ph">${icon('home')}</span>`}
          <span class="pc-t"><b>${esc(x.titel || x.room || 'Projekt')}${stOf(x) === 'abgesagt' ? ' <span class="st-pill">Abgesagt</span>' : ''}</b>
            ${projektOrt(x) ? `<span class="muted pc-wo">${icon('map')}${esc(projektOrt(x))}</span>` : ''}
            ${projektKunde(x) ? `<span class="muted pc-wer">${icon('user')}${esc(projektKunde(x))}</span>` : ''}
            ${x.fort && Projekt.zugesagt(x.status) ? `<span class="bf-mini">${Fortschritt.balken(x.fort)}</span>` : ''}</span>
          ${icon('chevron', 'pc-chev')}
        </button>`).join('') || '<p class="empty">Nichts gefunden.</p>'}</div>`}` : `
      <div class="empty-state">${icon('home')}<b>${{ '': 'Keine laufenden Projekte', angebot: 'Keine offenen Angebote', geplant: 'Nichts eingeplant', fertig: 'Noch nichts abgeschlossen' }[listStatus]}</b><span>${alleP.length ? 'Den Status stellst du im Projekt direkt unter dem Kunden ein.' : 'Tippe auf „Neues Projekt“, gib den Kunden ein und füge die Räume hinzu.'}</span></div>`}`;
  $$('[data-ls]').forEach((b) => (b.onclick = () => { listStatus = b.dataset.ls; viewProjektListe(); }));
  if ($('#lkToggle')) $('#lkToggle').onclick = () => { listKarte = !listKarte; viewProjektListe(); };
  if (listKarte && $('#pmap')) window.Karte?.zeigen($('#pmap'), shown, $('#pmapInfo'), (id) => Projekt.oeffnen(id));
  $('#new').onclick = () => Projekt.neu();
  if ($('#toSet')) $('#toSet').onclick = () => { switchTab('einstellungen'); einstellungSeite('ki'); };
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
  if (!p) return state.wohnung ? Projekt.view() : state.tab === 'kunden' ? Kunden.start() : viewProjektListe();
  const w = state.wohnung;
  const rt = roomType(p.roomType);
  const backToProject = () => { state.project = null; viewProjekt(); window.scrollTo(0, 0); };
  header(p.room || rt.name, [w?.customer || p.customer, rt.name].filter(Boolean).join(' · '), { label: w ? 'Projekt' : state.tab === 'kunden' ? 'Kunde' : 'Projekte', fn: backToProject });
  const pkgs = roomPackages(p);
  const full = p.photos.length >= MAX_PHOTOS;
  const visible = pkgs.filter((x) => firstResult(p, x.id) || Object.keys(p.status || {}).some((k) => k.startsWith(x.id + ':') && (p.status[k].loading || p.status[k].error)));
  const nImg = viewCount(p) * p.selected.length;
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
          <div class="ph ${renderIdx(p).includes(i) ? '' : 'ph-off'}"><img src="${ph}" alt="Ansicht ${i + 1}"><span class="ph-n">${i + 1}</span><button class="ph-x" data-delphoto="${i}" aria-label="Foto entfernen">${icon('x')}</button>
            ${p.photos.length > 1 ? `<button class="ph-view" data-view="${i}">${renderIdx(p).includes(i) ? `${icon('check')} Nachher` : 'nur Info'}</button>` : ''}</div>`).join('')}
          ${full ? '' : `<button class="ph-add" id="cam">${icon('camera')}<span>Kamera</span></button><button class="ph-add" id="gal">${icon('image')}<span>Fotos</span></button>`}
        </div>
        <p class="hint">${p.photos.length > 1 ? 'Die KI nutzt alle Fotos, um den Raum zu verstehen. Ein Nachher-Bild gibt es nur für die Fotos mit Haken. Tippe unten aufs Foto, um das zu ändern.' : p.photos.length ? 'Weitere Blickwinkel helfen der KI, den Raum zu verstehen.' : 'Am besten quer und aus den Ecken fotografieren, bis zu 4 Blickwinkel.'}</p>
        ${p.photos.length && !rt.outdoor && rt.id !== 'garten' ? `<label class="toggle"><input type="checkbox" id="withTop" ${wantsTop(p) ? 'checked' : ''}><span class="tg"></span><span>Draufsicht: der neue Raum von oben</span></label>` : ''}
        ${rt.outdoor ? '' : `<div id="masseBox"><label>Raummaße in Metern (damit die KI weiß, wie groß der Raum ist)</label>
        <div class="row masse-row">${[['l', 'Länge'], ['b', 'Breite'], ['h', 'Höhe']].map(([k, l]) => `<input type="text" inputmode="decimal" data-mass="${k}" placeholder="${l}" aria-label="${l} in m" value="${esc(p.masse?.[k] || '')}">`).join('')}</div>
        ${aufmassText(p) && !raumMasse(p) ? '<p class="hint">Maße aus dem Aufmaß werden verwendet.</p>' : ''}</div>`}
      </div>
    </section>

    <section class="step">
      <div class="step-h"><span class="num">2</span><h2>Pakete</h2></div>
      <div class="card">
        <div class="chips">${pkgs.map((x) => `<button class="chip ${p.selected.includes(x.id) ? 'on' : ''}" data-sel="${x.id}" style="--c:${x.color}">${icon('check', 'chip-ck')}${esc(x.name)}</button>`).join('')}</div>
        <button class="btn secondary block small" id="raumBoard" style="margin:2px 0 10px">${icon('palette')} ${p.boards?.length && p.boardsType === p.roomType ? 'Moodboard dieses Raums (angepasst)' : 'Moodboard für diesen Raum anpassen'}</button>
        <label class="toggle"><input type="checkbox" id="withEvening" ${p.withEvening ? 'checked' : ''}><span class="tg"></span><span>${icon('moon')} Zusätzlich Abendstimmung</span></label>
        <details class="more" id="more" ${uiOpen.more ? 'open' : ''}>
          <summary>${icon('mic')}<span>Hinweise & Kundenwünsche<small>${[p.note?.trim() && 'Hinweis', p.wishes?.trim() && 'Wünsche', p.transcript?.trim() && 'Gespräch'].filter(Boolean).join(' · ') || 'optional'}</small></span>${icon('chevron', 'more-chev')}</summary>
          <label>Hinweis für die KI</label><textarea id="note" placeholder="${esc(rt.id === 'garten' ? 'z. B. Terrasse vergrößern, Wärmepumpe links neben die Tür' : 'z. B. Badewanne raus, dafür große Dusche')}">${esc(p.note)}</textarea>
          ${p.bestand?.text && !window.Garten?.zustaendig(p) ? `<label>So hat die KI den Raum erkannt</label><p class="hint" style="margin-top:0">Daran hält sich die Visualisierung. Stimmt etwas nicht (z. B. Maße, WC vorhanden ja/nein), hier korrigieren.</p><textarea id="bestand" style="min-height:140px">${esc(p.bestand.text)}</textarea>` : ''}
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
    if (Array.isArray(p.views?.on)) p.views.on = p.views.on.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k));
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
    delete p.boards; delete p.boardsType;
    if (!p.room || p.room === old) p.room = roomType(p.roomType).name;
    p.selected = roomPackages(p).map((x) => x.id);
    rerender();
  };
  $('#note').oninput = (e) => { p.note = e.target.value; persist(); };
  $$('[data-mass]').forEach((inp) => (inp.oninput = () => { p.masse = { ...(p.masse || {}), [inp.dataset.mass]: inp.value.trim() }; persist(); }));
  if ($('#bestand')) $('#bestand').oninput = (e) => { Object.assign(p.bestand, { text: e.target.value, manual: true, photos: p.photos.length, masse: masseText(p) }); persist(); };
  $('#more').ontoggle = (e) => { uiOpen.more = e.target.open; };
  const updGoInfo = () => {
    const n = viewCount(p) * p.selected.length;
    $('#go').disabled = !n;
    if (p.photos.length) $('#goInfo').textContent = n ? `${n} ${n === 1 ? 'Bild' : 'Bilder'}${p.withEvening ? ' + Abendstimmung' : ''} · ca. 10–30 Sekunden pro Bild` : 'Bitte mindestens ein Paket wählen.';
  };
  $('#raumBoard').onclick = () => { viewRaumMoodboard(p); window.scrollTo(0, 0); };
  $('#withEvening').onchange = (e) => { p.withEvening = e.target.checked; persist(); updGoInfo(); };
  if ($('#withTop')) $('#withTop').onchange = (e) => { p.views = { ...(p.views || {}), top: e.target.checked }; persist(); updGoInfo(); };
  $$('[data-view]').forEach((b) => (b.onclick = () => {
    const i = +b.dataset.view, on = new Set(renderIdx(p));
    on.has(i) ? on.delete(i) : on.add(i);
    if (!on.size) return toast('Mindestens ein Foto braucht ein Nachher-Bild.');
    p.views = { ...(p.views || {}), on: [...on].sort() };
    rerender();
  }));
  $$('[data-sel]').forEach((c) => (c.onclick = () => {
    c.classList.toggle('on');
    p.selected = $$('[data-sel]').filter((x) => x.classList.contains('on')).map((x) => x.dataset.sel);
    persist(); updGoInfo();
  }));
  bindVoice(p, persist);
  $('#go').onclick = async () => {
    if (!state.settings.apiKey) return toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000);
    const done = roomPackages(p).filter((x) => p.selected.includes(x.id) && firstResult(p, x.id));
    if (!rt.outdoor && !raumMasse(p) && !aufmassText(p) && !p.masseSkip) {
      if (confirm('Noch keine Raummaße eingetragen. Mit Länge, Breite und Höhe hält sich die KI viel besser an die echte Raumgröße.\n\nOK = Maße jetzt eingeben\nAbbrechen = ohne Maße weiter')) {
        $('#masseBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => $('[data-mass="l"]')?.focus(), 300); return;
      }
      p.masseSkip = true; persist();
    }
    if (done.length && !confirm(`${done.map((x) => x.name).join(', ')} ${done.length === 1 ? 'ist' : 'sind'} schon fertig und ${done.length === 1 ? 'wird' : 'werden'} neu erstellt. Weiter?`)) return;
    setTimeout(() => $('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    runAll(p);
  };
  $('#toMappe').onclick = () => w && Projekt.mappeView(w);
  $('#toAngebot').onclick = () => { state.angebotAusProjekt = false; window.Angebot?.ansicht(p); };
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

// ---------- Moodboard nur für diesen Raum ----------
const raumEigenes = (p) => (Array.isArray(p.boards) && p.boards.length && p.boardsType === p.roomType ? p.boards : null);
/** Kopie anlegen, sobald im Raum etwas geändert wird (Vorlage: Projekt-Moodboard bzw. allgemeines). */
function raumKopie(p) {
  if (!raumEigenes(p)) { p.boards = JSON.parse(JSON.stringify(packagesFor(p.roomType))); p.boardsType = p.roomType; }
  return p.boards;
}
function viewRaumMoodboard(p) {
  const own = raumEigenes(p), pkgs = roomPackages(p), rn = p.room || roomType(p.roomType).name;
  const kunde = state.wohnung?.customer || p.customer;
  const back = () => { viewProjekt(); window.scrollTo(0, 0); };
  header('Moodboard', [kunde, rn].filter(Boolean).join(' · '), { label: rn, fn: back });
  main().innerHTML = `
    <div class="card intro"><p>${own
      ? `Dieses Moodboard gilt <b>nur für ${esc(rn)}</b>${kunde ? ` bei ${esc(kunde)}` : ''}. Visualisierung, Kundenmappe, Baumappe und Angebot dieses Raums nutzen es.`
      : `Hier steht noch das Moodboard ${state.wohnung?.boards?.[p.roomType]?.length ? 'des Projekts' : 'aus deinen Standard-Moodboards'}. Tippe auf ein Paket und ändere Texte, Bilder oder Produkte. Die Änderung gilt <b>nur für ${esc(rn)}</b>.`}</p></div>
    <div class="pkgs">${pkgs.map((x) => `
      <button class="pkgcard" data-edit="${x.id}" style="--c:${x.color}">
        <span class="pk-thumbs">${x.images.slice(0, 3).map((im) => `<img src="${im.data}" alt="">`).join('') || `<span class="pk-empty">${icon('palette')}</span>`}</span>
        <span class="pk-t"><b><i></i>${esc(x.name)}</b><span>${esc(x.fields.beschreibung || '')}</span>
          <small>${x.images.length} ${x.images.length === 1 ? 'Bild' : 'Bilder'} · ${x.products.length} ${x.products.length === 1 ? 'Produkt' : 'Produkte'}</small></span>
        ${icon('chevron', 'pc-chev')}
      </button>`).join('')}</div>
    ${own ? `<p class="hint">Nach einer Änderung den Raum neu visualisieren, damit die Bilder zum Moodboard passen.</p>
      <button class="link-danger" id="rbReset">${icon('refresh')} Anpassungen dieses Raums verwerfen</button>` : ''}`;
  $$('[data-edit]').forEach((el) => (el.onclick = () => {
    const list = raumKopie(p);
    viewPaketEdit(el.dataset.edit, {
      rt: p.roomType, list, save: () => saveProject(p), saveSoon: debounce(() => saveProject(p), 500),
      sub: `${rn} · nur für diesen Raum`, backLabel: 'Moodboard',
      banner: `<div class="notice" style="margin:0 0 12px">${icon('palette')}<span>Änderungen gelten nur für <b>${esc(rn)}</b>${kunde ? ` bei ${esc(kunde)}` : ''}. Andere Räume und deine Standard-Moodboards bleiben, wie sie sind.</span></div>`,
      back: async () => { await saveProject(p); viewRaumMoodboard(p); window.scrollTo(0, 0); },
    });
    window.scrollTo(0, 0);
  }));
  if ($('#rbReset')) $('#rbReset').onclick = async () => {
    if (!confirm(`Die Moodboard-Anpassungen für ${rn} verwerfen?`)) return;
    delete p.boards; delete p.boardsType; await saveProject(p); viewRaumMoodboard(p);
  };
}

// ---------- Ergebnis-Karten ----------
function resultCard(pkg) {
  const p = state.project;
  const shown = p.photos.map((_, i) => i).filter((i) => p.results[pkg.id]?.[i] || p.status?.[`${pkg.id}:${i}`]?.loading || p.status?.[`${pkg.id}:${i}`]?.error);
  const multi = shown.length > 1 || !!(topOf(p, pkg.id) || p.status?.[`${pkg.id}:top`]);
  const views = shown.map((i) => {
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
  }).join('') + topCard(p, pkg);
  return `<div class="result" id="res-${pkg.id}" style="--c:${pkg.color}">
    <div class="r-head"><span class="r-name"><i></i>${esc(pkg.name)}</span><span class="r-desc">${esc(pkg.fields?.beschreibung || '')}</span></div>
    ${views}
  </div>`;
}
function topCard(p, pkg) {
  const st = p.status?.[`${pkg.id}:top`], img = topOf(p, pkg.id);
  if (!img && !st?.loading && !st?.error) return '';
  const body = st?.loading ? `<div class="status"><div class="spinner"></div>KI zeichnet die Draufsicht …</div>`
    : st?.error ? `<div class="status err">${esc(st.error)}</div>`
    : `<img class="top-img" src="${img}" alt="Draufsicht ${esc(pkg.name)}">`;
  return `<div class="rview"><div class="rv-n">Draufsicht</div><div class="rv-body">${body}</div><div class="rv-bar"><span></span><span class="rv-act">${st?.loading ? '' : `<button class="mini" data-redotop="${pkg.id}">${icon('refresh')} Neu</button>`}</span></div></div>`;
}
function refreshResult(pkg) {
  const p = state.project;
  if (!$('#results')) return;
  const el = $('#res-' + pkg.id);
  $('.empty-res')?.remove();
  if (!el) {
    // in Paket-Reihenfolge einfügen
    const order = roomPackages(p).map((x) => x.id);
    const next = $$('#results .result').find((r) => order.indexOf(r.id.slice(4)) > order.indexOf(pkg.id));
    if (next) next.insertAdjacentHTML('beforebegin', resultCard(pkg)); else $('#results').insertAdjacentHTML('beforeend', resultCard(pkg));
  } else el.outerHTML = resultCard(pkg);
  bindResultButtons(p);
  const any = hasAnyResult(p);
  if ($('#toMappe')) $('#toMappe').hidden = !any || !state.wohnung;
  for (const id of ['#social', '#toMarks']) if ($(id)) $(id).disabled = !any;
}
function bindResultButtons(p) {
  const pk = (id) => roomPackages(p).find((x) => x.id === id);
  $$('[data-redo]').forEach((b) => (b.onclick = async () => { await window.voiceReady?.(p); runView(p, pk(b.dataset.redo), +b.dataset.view); }));
  $$('[data-mood]').forEach((b) => (b.onclick = () => {
    const pkg = pk(b.dataset.pkg), i = +b.dataset.view;
    moodSel[`${p.id}:${pkg.id}:${i}`] = b.dataset.mood;
    if (b.dataset.mood === 'abend' && !eveningOf(p, pkg.id, i) && !p.status?.[`${pkg.id}:${i}:abend`]?.loading) {
      if (!state.settings.apiKey) return toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000);
      runEvening(p, pkg, i);
    } else refreshResult(pkg);
  }));
  $$('[data-redotop]').forEach((b) => (b.onclick = async () => { await window.voiceReady?.(p); runTop(p, pk(b.dataset.redotop)); }));
  $$('[data-redoeve]').forEach((b) => (b.onclick = () => runEvening(p, pk(b.dataset.redoeve), +b.dataset.view)));
}

// Kalender-Symbol oben: immer erreichbar
$('#calBtn').onclick = () => { if (state.kalender) return; Kalender.view(); window.scrollTo(0, 0); };

// ---------- Start ----------
(async () => {
  await loadAll();
  try { await Projekt.migrate(); } catch (e) { console.error('Umstellung', e); }
  try { await Kunden.laden(); await Kunden.migrate(); await Kunden.nummern(); } catch (e) { console.error('Kunden', e); }
  try { await Partner.laden(); await Kalender.laden(); Kalender.punkt(); } catch (e) { console.error('Kalender', e); }
  navigator.storage?.persist?.();
  switchTab('kunden');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    // Neue Version sofort übernehmen: beim Öffnen und beim Zurückkehren in die App nachsehen, dann einmal neu laden
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => null);
    const hadCtrl = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadCtrl || reloaded || voice.rec || voice.job) return; // nicht mitten in einer Aufnahme oder Auswertung
      reloaded = true; location.reload();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg?.update().catch(() => {}); });
    reg?.update().catch(() => {});
  }
})();
