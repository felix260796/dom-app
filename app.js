'use strict';
/* DOM – Oberfläche: Kopfzeile, Navigation, Auswahlfenster, Projektliste und Start. Raum-Ansicht in raum.js.
 * Aufbau der App (bewusst flach):
 *   Projekte (Liste)  →  Projekt (Kunde, Räume, Unterlagen)  →  Raum (Fotos, Pakete, Ergebnis)
 * Ein Projekt hat einen oder mehrere Räume. Kundenmappe und Baumappe entstehen im Projekt.
 * Kern-Funktionen (Speicher, KI, Bilder) stehen in core.js. */

// ---------- Symbole (einfache Linien-Icons) ----------
const APP_VERSION = '96';
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.6-2h6.8l1.6 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M21 16l-5-5L6 20"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-8M21 20H3"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
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
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
  grip: '<path d="M5 7h14M5 12h14M5 17h14"/>',
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
  essen: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2.2 0-3.5 2.5-3.5 6v4H17"/>',
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
  // Schnellzugriff: Auf den Übersichtsseiten führt ein Tipp auf den Titel direkt zu den passenden Einstellungen
  const ziel = !back && SCHNELL_EINST[title];
  const h = $('#title'); h.classList.toggle('einst-link', !!ziel);
  h.onclick = ziel ? () => { switchTab('einstellungen'); einstellungSeite(ziel); window.scrollTo(0, 0); } : null;
}
// Titel der Übersichtsseite → Einstellungsseite
const SCHNELL_EINST = { Kunden: 'kundenEinst', Partner: 'partnerEinst', Aufträge: 'projektEinst', Projekte: 'projektEinst', Angebote: 'kalkulation', Geld: 'rechnungen', Rechnungen: 'rechnungen' };
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
// Unten fünf Reiter: Kunden · Partner · Projekte · Angebote · Rechnungen (Version 76 wieder wie vor 75, Wunsch Felix).
// Namen aus Version 75 bleiben als Ziele gültig: 'auftraege' → Angebote, 'kontakte' → Kunden.
const TAB_ALIAS = { auftraege: 'angebote', kontakte: 'kunden' };
function switchTab(tab, restore) {
  tab = TAB_ALIAS[tab] || tab;
  // Einstellungen sind kein Reiter unten: merken, woher man kam, damit „Zurück“ dorthin führt
  if (tab === 'einstellungen' && state.tab !== 'einstellungen') window.__vorEinst = { tab: state.tab, s: { project: state.project, wohnung: state.wohnung, kunde: state.kunde, objekt: state.objekt, partner: state.partner } };
  // „Heute“ lässt sich mit dem X schließen: merken, welcher Reiter davor offen war
  if (tab === 'heute' && state.tab !== 'heute') window.__vorHeute = ['kunden', 'partner', 'projekt', 'angebote', 'rechnungen'].includes(state.tab) ? state.tab : 'kunden';
  if (state.tab !== tab || restore) {
    tabState[state.tab] = { project: state.project, wohnung: state.wohnung, kunde: state.kunde, objekt: state.objekt, partner: state.partner };
    const s = restore || tabState[tab] || {};
    state.project = s.project || null; state.wohnung = s.wohnung || null; state.kunde = s.kunde || null; state.objekt = s.objekt || null; state.partner = s.partner || null;
  }
  state.tab = tab; state.kalender = false; state.finanzen = false;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (tab === 'einstellungen') state.editPkg = null;
  ({ kunden: viewProjekt, partner: () => Partner.start(), projekt: viewProjekt, angebote: viewProjekt, rechnungen: () => Finanzen.view(), heute: () => Heute.view(), suche: () => Suche.view(), karte: () => Karte.view(), auswertung: () => Finanzen.auswertungView(), unterlagen: () => Unterlagen.view(), hilfe: () => Hilfe.view(), einstellungen: viewEinstellungen })[tab]();
}
/** Reiter wechseln und dort direkt etwas öffnen, z. B. openTab('kunden', { kunde }). */
window.openTab = (tab, s) => switchTab(tab, s);
$$('.tabbar button').forEach((b) => (b.onclick = () => {
  // Erneutes Tippen auf den aktiven Reiter führt zurück zur Liste
  if (b.dataset.tab === state.tab && !state.kalender && !state.finanzen) { state.project = null; state.wohnung = null; state.kunde = null; state.objekt = null; state.partner = null; }
  switchTab(b.dataset.tab);
}));

/** Auswahlfenster von unten. items: [{ label, sub?, icon?, color?, value }] → Promise<value|null>.
 * text: Platzhalter für ein freies Textfeld (Ergebnis dann { text }). suche: Platzhalter für ein Suchfeld über der Liste
 * (kommt bei langen Listen von selbst). Einträge können zusätzlich `such` tragen: Text, der nur für die Suche zählt. */
function sheet(title, items, { text, value = '', suche } = {}) {
  // Lange Listen (ab 7 Einträgen) bekommen ein Suchfeld oben. Gibt es schon ein Textfeld (z. B. „Neuer Kunde“), filtert das beim Tippen mit.
  suche ??= items.length > 6 ? 'Suchen …' : '';
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'sheet-bg';
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="sheet-h"><b>${esc(title)}</b><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
      ${suche ? `<label class="search sheet-such">${icon('search')}<input type="search" id="sheetSuche" placeholder="${esc(suche)}" autocomplete="off"></label>` : ''}
      ${text ? `<div class="sheet-text"><input type="text" id="sheetText" placeholder="${esc(text)}" value="${esc(value)}" autocomplete="off" enterkeyhint="done"><button class="btn" id="sheetOk">OK</button></div>` : ''}
      <div class="sheet-list"><p class="sheet-leer hint" hidden>Nichts gefunden.</p>${items.map((it, i) => `<button class="sheet-item" data-i="${i}">${it.icon ? `<span class="si-ico" ${it.color ? `style="--c:${it.color}"` : ''}>${it.icon}</span>` : ''}<span class="si-t"><b>${esc(it.label)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}</span></button>`).join('')}</div></div>`;
    const close = (v) => { el.classList.remove('on'); setTimeout(() => el.remove(), 180); res(v); };
    el.onclick = (e) => { if (e.target === el || e.target.closest('[data-x]')) close(null); };
    $$('[data-i]', el).forEach((b) => (b.onclick = () => close(items[+b.dataset.i].value)));
    const filtern = (q) => {
      const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let n = 0;
      $$('[data-i]', el).forEach((b) => { const it = items[+b.dataset.i]; b.hidden = w.length > 0 && !w.every((x) => `${it.label} ${it.sub || ''} ${it.such || ''}`.toLowerCase().includes(x)); if (!b.hidden) n++; });
      const leer = $('.sheet-leer', el); if (leer) leer.hidden = n > 0 || !items.length;
    };
    if (suche) $('#sheetSuche', el).oninput = (e) => filtern(e.target.value);
    if (text) { const ok = () => { const v = $('#sheetText', el).value.trim(); if (v) close({ text: v }); }; $('#sheetOk', el).onclick = ok; $('#sheetText', el).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }; } // Achtung: kein „return false“, das blockiert jede Taste
    document.body.appendChild(el);
    // Die Tastatur geht erst auf, wenn man das Feld antippt (Wunsch Felix), nicht schon beim Öffnen des Fensters.
    if (text) el.classList.add('fest', 'on'); // ohne Hochfahr-Bewegung, damit das Feld beim Antippen schon ruhig steht
    else requestAnimationFrame(() => el.classList.add('on'));
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
let listFilter = '', listStatus = 'laufend';
async function viewProjektListe() {
  // Nur zugesagte Projekte, vier Bereiche: Einzuplanen · Eingeplant · In Durchführung · Abgeschlossen (Projekt.PHASEN)
  header('Projekte', state.settings.company || '');
  const alleP = await projectIndex();
  const reihe = Projekt.ALLE.map((s) => s[0]);
  const auftraege = alleP.filter((x) => Projekt.phase(x) !== 'angebot');
  const idx = auftraege.filter((x) => Projekt.phase(x) === listStatus).sort((a, b) => reihe.indexOf(Projekt.norm(a.status)) - reihe.indexOf(Projekt.norm(b.status)) || (b.updated || 0) - (a.updated || 0));
  const q = listFilter.trim().toLowerCase();
  const hay = (x) => { const k = Kunden.byId(x.kundeId); return `${x.nr || ''} ${x.titel || ''} ${x.customer} ${x.address || ''} ${x.room || ''} ${k ? `${k.nr} ${k.telefon} ${k.email} ${k.privat}` : ''}`.toLowerCase(); };
  const shown = q ? idx.filter((x) => q.split(/\s+/).every((t) => hay(x).includes(t))) : idx;
  main().innerHTML = `
    ${state.settings.apiKey || (window.Sync?.fest() && !window.Sync.active()) ? '' : `<button class="notice" id="toSet">${icon('gear')}<span><b>KI noch nicht eingerichtet.</b> Einmalig den Google-Schlüssel in den Einstellungen eintragen.</span>${icon('chevron')}</button>`}
    <div id="backupHint"></div>
    <label class="search big">${icon('search')}<input type="search" id="q" value="${esc(listFilter)}" placeholder="Kunde, Adresse, Raum oder Nummer" autocomplete="off"></label>
    <button class="cta slim" id="pNeu"><span class="cta-ico">${icon('plus')}</span><span class="cta-t"><b>Neues Projekt</b></span>${icon('chevron', 'cta-chev')}</button>
    <div class="phasen">${Projekt.PHASEN.map(([id, n]) => `<button data-ls="${id}" class="${listStatus === id ? 'on' : ''}"><b>${auftraege.filter((x) => Projekt.phase(x) === id).length}</b><span>${n}</span></button>`).join('')}</div>
    ${idx.length ? `
      <div class="plist">${shown.map((x) => `
        <button class="pcard" data-open="${x.id}" data-kind="${x.kind || ''}">
          ${x.thumb ? `<img src="${x.thumb}" alt="">` : `<span class="pc-ph">${icon('home')}</span>`}
          <span class="pc-t"><b>${esc(x.titel || x.room || 'Projekt')}</b>${Projekt.pill(x.status)}
            ${projektOrt(x) ? `<span class="muted pc-wo">${icon('map')}${esc(projektOrt(x))}</span>` : ''}
            ${projektKunde(x) ? `<span class="muted pc-wer">${icon('user')}${esc(projektKunde(x))}</span>` : ''}
            ${x.fort && Projekt.zugesagt(x.status) ? `<span class="bf-mini">${Fortschritt.balken(x.fort)}</span>` : ''}</span>
          ${icon('chevron', 'pc-chev')}
        </button>`).join('') || '<p class="empty">Nichts gefunden.</p>'}</div>` : `
      <div class="empty-state">${icon('home')}<b>${{ einplanen: 'Nichts einzuplanen', eingeplant: 'Kein Baustart geplant', laufend: 'Gerade keine Baustelle', abgeschlossen: 'Noch nichts abgeschlossen' }[listStatus]}</b><span>Hier stehen die zugesagten Aufträge. Offene und abgesagte Angebote findest du unter „Angebote“, sobald eins zugesagt ist, erscheint es hier.</span></div>`}`;
  $$('[data-ls]').forEach((b) => (b.onclick = () => { listStatus = b.dataset.ls; viewProjektListe(); }));
  $('#pNeu').onclick = () => { listStatus = 'einplanen'; Projekt.neuDirekt(); };
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

// ---------- Menü: Tippen aufs DOM-Logo, fährt rechts heraus ----------
// Alles, was keinen Reiter unten hat (das Mikrofon sitzt direkt unter dem Logo). Neues hier eintragen:
// [id, Titel, Symbol, Untertitel (Funktion), Öffnen (Funktion)]
const MENUE = [
  ['suche', 'Suche', 'search', () => 'Kunden, Projekte, Angebote, Rechnungen, Termine', () => switchTab('suche')],
  ['heute', 'Heute', 'sun', () => 'Was heute dran ist', () => switchTab('heute')],
  ['kalender', 'Kalender', 'calendar', () => { const n = window.Kalender?.eintraege(Kalender._heute(), Kalender._heute()).length || 0; return n ? `Heute ${n} ${n === 1 ? 'Eintrag' : 'Einträge'}` : 'Termine, Geburtstage'; }, () => { state.finanzen = false; Kalender.view(); window.scrollTo(0, 0); }],
  ['karte', 'Karte', 'map', () => 'Alle Baustellen auf der Karte', () => switchTab('karte')],
  ['auswertung', 'Auswertung', 'chart', () => 'Umsatz, Zusagen, Marge, Kundenquellen', () => switchTab('auswertung')],
  ['preisliste', 'Preisliste', 'euro', () => 'Positionen, Lohn, Material, Aufschläge', () => { switchTab('einstellungen'); einstellungSeite('preisliste'); }],
  ['ppreise', 'Preislisten der Partner', 'wrench', () => 'Nach Gewerk: wer macht was zu welchem Preis', () => { switchTab('partner'); setTimeout(() => Partner.preislistenView(), 150); window.scrollTo(0, 0); }],
  ['unterlagen', 'Unterlagen', 'file', () => 'Firmenordner und Vorlagen', () => switchTab('unterlagen')],
  ['hilfe', 'Wie geht das?', 'sparkle', () => 'Frag, wo du was findest', () => switchTab('hilfe')],
  ['einstellungen', 'Einstellungen', 'sliders', () => 'Firma, Angebote, Rechnungen, Abläufe, Technik', () => switchTab('einstellungen')],
];
/** Zeile unten im Menü: angemeldet als … und letzter Cloud-Abgleich. */
function syncText() {
  const S = window.Sync;
  if (!S?.active()) return 'Cloud-Abgleich nicht eingerichtet. Tippen zum Einrichten.';
  const st = S.status(), mail = S.email?.() || '';
  if (st.ok === false) return `${mail} · ${st.msg || 'Abgleich gestört'}`;
  const t = st.last ? new Date(st.last) : null;
  const wann = !t ? 'noch nicht abgeglichen' : t.toDateString() === new Date().toDateString() ? `zuletzt abgeglichen ${t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : `zuletzt abgeglichen am ${t.toLocaleDateString('de-DE')}`;
  return `${mail} · ${wann}`;
}
function menue() {
  if ($('.menu-bg')) return;
  const el = document.createElement('div');
  el.className = 'menu-bg';
  el.innerHTML = `<nav class="menu" aria-label="Menü"><div class="menu-h"><img src="assets/dom_logo_weiss.png" alt="DOM"><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
    ${MENUE.map(([id, l, ic, sub]) => `<button class="menu-i" data-m="${id}"><span class="menu-ic">${icon(ic)}</span><span><b>${esc(l)}</b><span>${esc(sub())}</span></span></button>`).join('')}
    <div class="menu-fuss">
      ${window.Kalender ? `<div class="menu-wer"><span>Auf diesem Gerät</span><div class="seg2 full">${[...Kalender.team().map((p) => [p.id, p.name.split(' ')[0]]), ['', 'Beide']].map(([id, n]) => `<button data-mw="${esc(id)}" class="${Kalender.wer() === id ? 'on' : ''}">${esc(n)}</button>`).join('')}</div></div>` : ''}
      <button class="menu-sync" data-m="cloud">${icon('cloud')}<span>${esc(syncText())}</span></button>
      <p class="menu-v">Version ${APP_VERSION}</p></div></nav>`;
  const zu = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 220); };
  el.onclick = (e) => { if (e.target === el || e.target.closest('[data-x]')) zu(); };
  $$('[data-m]', el).forEach((b) => (b.onclick = () => {
    zu();
    if (b.dataset.m === 'cloud') { switchTab('einstellungen'); return einstellungSeite('cloud'); }
    MENUE.find((m) => m[0] === b.dataset.m)[4]();
  }));
  // Wer nutzt dieses Gerät: filtert Kalender und „Heute“ (gemerkt auf dem Gerät)
  $$('[data-mw]', el).forEach((b) => (b.onclick = () => { Kalender.werSetzen(b.dataset.mw); window.Push?.abgleich(); $$('[data-mw]', el).forEach((x) => x.classList.toggle('on', x === b)); Kalender.punkt(); if (state.tab === 'heute') Heute.view(); }));
  let x0 = null; // nach rechts wischen schließt
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => { if (x0 !== null && e.changedTouches[0].clientX - x0 > 60) zu(); x0 = null; });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
}
$('#brandBtn').onclick = menue;
// Kalender oben neben dem Mikrofon
$('#calBtn').onclick = () => { if (state.kalender) return; state.finanzen = false; Kalender.view(); window.scrollTo(0, 0); };
// Mikrofon oben: Kunde, Projekt und Termin per Sprache anlegen (sprache.js)
$('#camBtn').onclick = () => Kamera.start().catch((e) => toast('Kamera: ' + e.message, 5000));
$('#micBtn').onclick = () => { const t = state.tab; Sprache.view(() => switchTab(t)); };

function zielOeffnen(z) {
  if (z === 'kalender') { switchTab('heute'); Kalender.view(); return; }
  switchTab(['kunden', 'heute', 'projekt', 'angebote', 'auftraege', 'kontakte', 'rechnungen', 'partner'].includes(z) ? z : 'heute');
}

// ---------- Start ----------
(async () => {
  await loadAll();
  try { await Projekt.migrate(); await Projekt.automatik(); } catch (e) { console.error('Umstellung', e); }
  try { await Kunden.laden(); await Kunden.migrate(); await Kunden.nummern(); } catch (e) { console.error('Kunden', e); }
  try { await Partner.laden(); await Kalender.laden(); Kalender.punkt(); } catch (e) { console.error('Kalender', e); }
  navigator.storage?.persist?.();
  // Aus einer Mitteilung geöffnet: ?ziel=heute|kalender
  const ziel = new URLSearchParams(location.search).get('ziel') || window.pushZiel; // pushZiel: iPhone-App, siehe push.js
  if (new URLSearchParams(location.search).get('ziel')) history.replaceState(null, '', location.pathname);
  zielOeffnen(ziel || (vorgabe('heuteStart') === 'nein' ? 'kunden' : 'heute'));
  window.appGestartet = true;
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.ziel) zielOeffnen(e.data.ziel); });
  setTimeout(() => window.Push?.abgleich(), 4000);
  window.Geraet?.start(); // iPhone-App: Kalender abgleichen, über „Teilen“ geschickte Dateien abholen
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
