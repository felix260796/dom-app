'use strict';
// Ganze Bildschirmhöhe als --voll (siehe style.css, Seitenaufbau): jede Seite ist etwas höher, damit iOS
// die Leiste unten ganz an den Rand setzt.
(() => {
  const setz = () => {
    const hoch = innerHeight >= innerWidth;
    const h = Math.max(hoch ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height), innerHeight);
    document.documentElement.style.setProperty('--voll', h + 'px');
  };
  setz(); addEventListener('resize', setz); addEventListener('orientationchange', () => setTimeout(setz, 300));
})();
/* DOM – Kern der App: Helfer, Speicher (IndexedDB), KI-Aufrufe (Gemini), Bildfunktionen.
 * Alle Daten liegen lokal auf dem Gerät. Sicherung: backup.js · Cloud-Abgleich: sync.js
 * Oberfläche: app.js (Projekte, Räume), projekt.js, moodboards.js · PDFs: pdf.js, baumappe.js */

// ---------- Hilfsfunktionen ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const main = () => $('#main');

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- Speicher (IndexedDB) ----------
let _db;
function db() {
  return (_db ??= new Promise((res, rej) => {
    const r = indexedDB.open('sanierung', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
async function kvGet(k) {
  const d = await db();
  return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function kvSet(k, v) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => { window.Backup?.markChange(); window.Sync?.changed(k); res(); }; tx.onerror = () => rej(tx.error); });
}
async function kvDel(k) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => { window.Backup?.markChange(); window.Sync?.deleted(k); res(); }; tx.onerror = () => rej(tx.error); });
}

// ---------- Bilder ----------
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild konnte nicht geladen werden')); i.src = src; });
}
function fileToDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}
/** Skaliert ein Bild auf maxSide und gibt eine JPEG- (oder PNG-) DataURL zurück. */
async function resize(src, maxSide = 1600, type = 'image/jpeg', quality = 0.86) {
  const img = await loadImg(src);
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const g = c.getContext('2d');
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, quality);
}
const b64 = (dataUrl) => dataUrl.split(',')[1];
const mimeOf = (dataUrl) => dataUrl.slice(5, dataUrl.indexOf(';'));
function pickFiles({ multiple = false, camera = false, accept = 'image/*' } = {}) {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    if (camera) inp.setAttribute('capture', 'environment');
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
}

// ---------- Moodboards (Pakete) ----------
// Raumtypen, Felder und Beispiel-Pakete stehen in rooms.js
const MAX_REF_IMAGES = 6;

// ---------- Zustand ----------
const state = { tab: 'kunden', settings: null, boards: null, project: null, wohnung: null, kunde: null, editPkg: null, boardRoom: 'bad' };

async function loadAll() {
  state.settings = (await kvGet('settings')) || { apiKey: '', model: 'gemini-2.5-flash-image', company: 'DOM Projektmanagement GmbH', contact: 'DOM Projektmanagement GmbH', logo: null };
  state.boards = (await kvGet('boards')) || null;
  if (!state.boards) {
    // Umstellung: bisherige (Bad-)Moodboards werden zu den Moodboards des Raumtyps "Badezimmer"
    const old = await kvGet('packages');
    state.boards = old ? { bad: old.map(migrateBathPackage) } : {};
    await saveBoards();
  }
  // Beim ersten Start das DOM-Logo als Standard übernehmen
  if (state.settings.logo === null) {
    try { const b = await (await fetch('assets/dom_logo.png')).blob(); state.settings.logo = await fileToDataUrl(b); } catch { state.settings.logo = ''; }
    await saveSettings();
  }
}
const saveSettings = () => kvSet('settings', state.settings);
const saveBoards = () => kvSet('boards', state.boards);
const saveBoardsDebounced = debounce(saveBoards, 500);
/** Moodboards (Pakete) eines Raumtyps; fehlende werden mit den Beispielen angelegt.
 * Hat das offene Projekt ein eigenes (angepasstes) Moodboard für den Raumtyp, gilt dieses:
 * für Visualisierung, Kundenmappe, Baumappe und Angebot. w = null erzwingt das allgemeine Moodboard. */
function packagesFor(rt, w = state.wohnung) {
  const own = w?.boards?.[rt];
  const list = Array.isArray(own) && own.length ? own : (state.boards[rt] ??= defaultPackagesFor(rt));
  for (const p of list) { p.images ??= []; p.products ??= []; p.fields ??= {}; }
  return list;
}
/** Moodboard eines Raums: eigenes Raum-Moodboard, sonst das des Projekts, sonst das allgemeine. */
function roomPackages(r) {
  const own = r?.boards;
  if (!Array.isArray(own) || !own.length || r.boardsType !== r.roomType) return packagesFor(r.roomType);
  for (const p of own) { p.images ??= []; p.products ??= []; p.fields ??= {}; }
  return own;
}
/** Alte Bad-Pakete: Feld "licht" hieß dort "Spiegel & Licht" und heißt jetzt "spiegel". */
function migrateBathPackage(p) {
  if (p.fields?.licht && !p.fields.spiegel) { p.fields.spiegel = p.fields.licht; delete p.fields.licht; }
  p.products ??= [];
  return p;
}
const fmtPrice = (v) => (v === '' || v == null || isNaN(+v) ? '' : (+v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
const parsePrice = (s) => { const t = String(s).replace(/[^\d,.-]/g, ''); const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return isNaN(n) ? '' : n; };
const safeUrl = (u) => { const t = String(u || '').trim(); if (!t) return ''; const v = /^https?:\/\//i.test(t) ? t : 'https://' + t; try { return new URL(v).href; } catch { return ''; } };

async function projectIndex() { return (await kvGet('projectIndex')) || []; }
async function saveProject(proj) {
  const { status, ...p } = proj;
  await kvSet('project:' + p.id, p);
  // Räume einer Wohnung stehen nicht einzeln in der Projektliste, sondern unter ihrer Wohnung (projekt.js)
  if (p.wohnungId) return window.Projekt?.raumGespeichert(p);
  const idx = (await projectIndex()).filter((x) => x.id !== p.id);
  idx.unshift({ id: p.id, customer: p.customer, room: p.room, created: p.created, updated: Date.now(), thumb: p.thumb || '' });
  await kvSet('projectIndex', idx);
}
async function deleteProject(id) {
  await kvDel('project:' + id);
  await kvSet('projectIndex', (await projectIndex()).filter((x) => x.id !== id));
}

// ---------- KI-Modelle: veraltete Namen automatisch ersetzen ----------
// Google schaltet ältere Modelle ab (z. B. „gemini-2.5-flash is no longer available“). Dann nimmt die App
// das von Google genannte Nachfolgemodell bzw. das neueste passende aus der Modellliste und merkt es sich.
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const textModel = () => state.settings.textModel || 'gemini-2.5-flash';
const imageModel = () => state.settings.model || 'gemini-3-pro-image-preview';
const veraltet = (msg) => /no longer available|not found|is not supported|deprecated|has been (retired|shut ?down)|please (update|migrate)/i.test(msg || '');
/** Neuestes Modell der Art ('text' oder 'image') laut Modellliste des Schlüssels. */
async function neuestesModell(kind) {
  const r = await fetch(`${GEMINI}/models?pageSize=1000`, { headers: { 'x-goog-api-key': state.settings.apiKey } });
  const j = await r.json().catch(() => ({}));
  const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const ok = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  const pick = (re) => ok.filter((n) => re.test(n)).sort((a, b) => ver(b) - ver(a) || a.length - b.length)[0];
  return kind === 'image'
    ? pick(/^gemini-[\d.]+-pro-image/) || pick(/^gemini-[\d.]+-flash-image/) || pick(/image/)
    : pick(/^gemini-[\d.]+-flash$/) || pick(/^gemini-[\d.]+-flash(-latest)?$/) || pick(/^gemini-[\d.]+-flash/);
}
/** generateContent mit automatischem Wechsel auf ein Nachfolgemodell. kind: 'text' | 'image'. */
async function geminiCall(kind, body, model = kind === 'image' ? imageModel() : textModel()) {
  const { apiKey } = state.settings;
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const send = (m) => fetch(`${GEMINI}/models/${encodeURIComponent(m)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body(m)) });
  let r = await send(model), j = await r.json().catch(() => ({}));
  if (!r.ok && veraltet(j.error?.message)) {
    const genannt = (j.error.message.match(/use\s+(?:models\/)?(gemini-[\w.\-]+)/i) || [])[1]?.replace(/[.,;)]+$/, '');
    let neu = genannt;
    if (!neu || neu === model) neu = await neuestesModell(kind).catch(() => null);
    if (neu && neu !== model) {
      console.warn(`Modell ${model} abgeschaltet, nehme ${neu}`);
      r = await send(neu); j = await r.json().catch(() => ({}));
      if (r.ok) { state.settings[kind === 'image' ? 'model' : 'textModel'] = neu; saveSettings(); }
    }
  }
  if (!r.ok) throw new Error(j.error?.message || `Fehler ${r.status}`);
  return j;
}

// ---------- KI: Prompt & Gemini-Aufruf ----------
const MAX_PHOTOS = 4;

/** Kurzer Fingerabdruck eines Textes (z. B. der Fotos), um zu erkennen, ob sich etwas geändert hat. */
function quickHash(str) {
  let h = 2166136261; const step = Math.max(1, Math.floor(str.length / 4000));
  for (let i = 0; i < str.length; i += step) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + str.length.toString(36);
}
const amDez = (v) => (+v).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const amZahl = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
/** Maße aus dem Aufmaß als Text, damit die KI die echte Raumgröße kennt. */
function aufmassText(p) {
  return (p.aufmass?.raeume || []).map((r) => {
    const teile = (r.teile || []).map((t) => [amZahl(t.l), amZahl(t.b)]).filter(([l, b]) => l > 0 && b > 0);
    if (!teile.length) return '';
    const fl = teile.reduce((s, [l, b]) => s + l * b, 0), h = amZahl(r.h);
    const oe = (r.oeff || []).filter((o) => amZahl(o.n) > 0 && amZahl(o.b) > 0).map((o) => `${o.n}× ${o.art} ${amDez(amZahl(o.b))} × ${amDez(amZahl(o.h))} m`).join(', ');
    return `- ${r.name || 'Raum'}: ${teile.map(([l, b]) => `${amDez(l)} × ${amDez(b)} m`).join(' + ')} (${amDez(fl)} m² Boden)${h ? `, Raumhöhe ${amDez(h)} m` : ''}${oe ? `; ${oe}` : ''}${r.dusche ? `; Dusche${amZahl(r.duschwand) ? ` (Wandlänge ${amDez(amZahl(r.duschwand))} m)` : ''}` : ''}${r.notiz?.trim() ? `; Notiz: ${r.notiz.trim()}` : ''}`;
  }).filter(Boolean).join('\n');
}

/** Schnell eingegebene Raummaße im Schritt Fotos (Länge × Breite × Höhe in m). */
function raumMasse(p) {
  const l = amZahl(p.masse?.l), b = amZahl(p.masse?.b), h = amZahl(p.masse?.h);
  if (!l && !b) return '';
  return `- Raum: ${[l, b].filter(Boolean).map(amDez).join(' × ')} m${l && b ? ` (${amDez(l * b)} m² Boden)` : ''}${h ? `, Raumhöhe ${amDez(h)} m` : ''} (vor Ort gemessen)`;
}
/** Alle bekannten Maße: vor Ort eingegeben und aus dem Aufmaß. */
function masseText(p) { return [raumMasse(p), aufmassText(p)].filter(Boolean).join('\n'); }

/** Schritt 1: Die KI schaut sich die Fotos an und beschreibt den Bestand (was wo steht, wie groß, was fehlt).
 *  Ergebnis wird im Raum gespeichert (p.bestand) und kann in der App korrigiert werden. */
const _bestandJobs = new Map();
function bestandSig(p) { return quickHash(p.photos.join('|') + '|' + p.roomType + '|' + masseText(p)); }
async function roomBestand(p) {
  const sig = bestandSig(p);
  if (p.bestand?.text?.trim() && (p.bestand.sig === sig || p.bestand.manual && p.bestand.photos === p.photos.length && p.bestand.masse === masseText(p))) return p.bestand.text;
  const key = p.id + sig;
  if (!_bestandJobs.has(key)) _bestandJobs.set(key, (async () => {
    const rt = roomType(p.roomType);
    const masse = masseText(p);
    const parts = [{ text: `Du bist erfahrener Bausachverständiger. ${p.photos.length > 1 ? `Die ${p.photos.length} Fotos zeigen DENSELBEN ${rt.outdoor ? 'Bereich' : 'Raum'} aus verschiedenen Blickwinkeln` : 'Das Foto zeigt einen ' + (rt.outdoor ? 'Außenbereich' : 'Raum')} (Raumtyp: ${rt.name}${p.room && p.room !== rt.name ? `, „${p.room}“` : ''}) VOR der Sanierung.${masse ? `\n\nGemessene Maße (diese sind verbindlich):\n${masse}` : ''}

Beschreibe nüchtern den BESTAND, damit eine Bild-KI bei der Sanierung den Raum nicht verändert und nichts dazuerfindet. Antworte auf Deutsch, knapp, genau in diesem Format:

RAUM: Größe (sehr klein / klein / mittel / groß), Maße Länge × Breite × Höhe in m (${masse ? 'gemessen, siehe oben' : 'geschätzt, Tür ≈ 2 m hoch und ≈ 0,8 m breit als Maßstab'}), Form (z. B. schmaler Schlauch, quadratisch, L-Form), Dachschräge ja/nein
FENSTER UND TÜREN: Anzahl, Lage, ungefähre Größe
VORHANDEN: je Gegenstand eine Zeile „- Gegenstand – Lage im Raum – ungefähre Größe“ (z. B. „- Badewanne – an der Stirnwand unter dem Fenster – ca. 170 × 75 cm“). Alle Sanitärobjekte, Möbel, Heizkörper, Geräte, Leuchten.
NICHT VORHANDEN: was in einem Raum dieses Typs üblich wäre, hier aber fehlt (z. B. WC, Dusche, Badewanne, zweites Waschbecken, Heizkörper, Küchenzeile)
ANSCHLÜSSE: wo Wasser, Abfluss, Strom, Heizung sichtbar sind oder sicher anzunehmen sind
PLATZ: was hier realistisch hineinpasst und was nicht (z. B. „nur Einzelwaschtisch bis ca. 60 cm, kein Doppelwaschtisch, keine freistehende Wanne, keine zusätzliche Dusche“)
${p.photos.length > 1 ? 'JE FOTO: „Foto 1: Blickrichtung, welche Wände und Gegenstände zu sehen sind“, dann Foto 2 usw.' : 'FOTO: Blickrichtung, welche Wände und Gegenstände zu sehen sind'}

Nur was wirklich zu sehen oder gemessen ist. Nichts erfinden. Wenn etwas unsicher ist, schreibe „unklar“.` }];
    p.photos.forEach((ph, i) => { parts.push({ text: `Foto ${i + 1}:` }, { inline_data: { mime_type: mimeOf(ph), data: b64(ph) } }); });
    const text = (await geminiText(parts, false, { temperature: 0.2 })).trim();
    p.bestand = { sig, text, photos: p.photos.length, masse: masseText(p), t: Date.now() };
    await saveProject(p);
    return text;
  })().finally(() => setTimeout(() => _bestandJobs.delete(key), 1000)));
  return _bestandJobs.get(key);
}

/** Ausstattung des Moodboards als Textzeilen. */
function pkgSpec(pkg, rt) {
  const spec = fieldsFor(rt.id).filter(([k]) => k !== 'beschreibung' && pkg.fields[k]?.trim())
    .map(([k, label]) => `- ${label.replace(/\s*\(.*\)/, '')}: ${pkg.fields[k].trim()}`).join('\n');
  const fieldLabel = (k) => (FIELD_LIB[k]?.[0] || '').replace(/\s*\(.*\)/, '');
  const prods = (pkg.products || []).filter((x) => x.name?.trim())
    .map((x) => `- ${x.area ? fieldLabel(x.area) + ': ' : ''}${x.name.trim()}`).join('\n');
  return { spec, prods };
}

/** Schritt 2: Moodboard auf genau diesen Raum zuschneiden (nichts dazu, was es nicht gibt; nichts, was nicht passt). */
const _planJobs = new Map();
async function roomPlan(pkg, p, bestand) {
  const rt = roomType(p.roomType);
  const { spec, prods } = pkgSpec(pkg, rt);
  const sig = quickHash([bestand, spec, prods, p.wishes || '', p.note || '', pkg.name].join('|'));
  if (p.plan?.[pkg.id]?.sig === sig) return p.plan[pkg.id].text;
  const key = p.id + pkg.id + sig;
  if (!_planJobs.has(key)) _planJobs.set(key, (async () => {
    const text = (await geminiText([{ text: `Du planst als Innenarchitekt die Sanierung eines bestehenden ${rt.outdoor ? 'Außenbereichs' : 'Raums'} (${rt.name}) in der Ausstattungslinie „${pkg.name}“. Eine Bild-KI setzt danach deinen Plan auf dem Foto um.

BESTAND (so ist der Raum heute, das ist verbindlich):
${bestand}

AUSSTATTUNG LAUT MOODBOARD „${pkg.name}“ (allgemein für alle Räume geschrieben, nicht für diesen):
${spec || '- moderne, hochwertige Sanierung'}
${prods ? `\nKONKRETE PRODUKTE:\n${prods}\n` : ''}${p.wishes?.trim() ? `\nKUNDENWÜNSCHE AUS DEM GESPRÄCH:\n${p.wishes.trim()}\n` : ''}${p.note?.trim() ? `\nHINWEIS DES PLANERS:\n${p.note.trim()}\n` : ''}
Schneide die Ausstattung auf GENAU DIESEN Raum zu. Regeln:
1. Jeder vorhandene Gegenstand bleibt an seiner Stelle und in seiner Größe. Er wird nur in der Ausführung der Ausstattungslinie erneuert.
2. Was im Bestand NICHT vorhanden ist, kommt NICHT dazu, auch wenn das Moodboard es nennt (z. B. kein WC, wenn heute keins da ist). Ausnahme: Kundenwunsch oder Hinweis verlangt es ausdrücklich UND es passt räumlich.
3. Was nicht in den Raum passt, wird auf die passende Variante reduziert (z. B. Einzelwaschtisch in der heutigen Breite statt Doppelwaschtisch, Wanne bleibt Wanne in heutiger Größe statt freistehender Wanne, keine Kochinsel ohne Platz).
4. Oberflächen (Wände, Boden, Decke, Fliesen, Farben, Licht, Armaturen) aus dem Moodboard vollständig übernehmen, Fliesenformate maßstäblich zur echten Raumgröße.
5. Kundenwünsche haben Vorrang vor dem Moodboard, aber nur im Rahmen dessen, was räumlich möglich ist. Spätere Aussagen gelten vor früheren.

Antworte auf Deutsch, knapp, genau in diesem Format:
ERNEUERN:
- Gegenstand (Lage, Größe wie Bestand): neue Ausführung
OBERFLÄCHEN:
- Bereich: Ausführung
ÄNDERUNGEN LAUT KUNDENWUNSCH: (nur wenn ausdrücklich gewünscht, sonst „keine“)
NICHT EINBAUEN:
- Moodboard-Punkt oder Gegenstand: kurzer Grund` }], false, { temperature: 0.2 })).trim();
    p.plan = { ...(p.plan || {}), [pkg.id]: { sig, text } };
    await saveProject(p);
    return text;
  })().finally(() => setTimeout(() => _planJobs.delete(key), 1000)));
  return _planJobs.get(key);
}

/** Baut die Anweisung fürs Bildmodell (als Textteile zwischen den Bildern).
 *  ctx: { bestand, plan, others: [Index der weiteren Fotos], rendered, refs } */
function buildPrompt(pkg, project, ctx) {
  const rt = roomType(project.roomType || roomTypeIdFromName(project.room));
  const room = project.room;
  const { spec, prods } = pkgSpec(pkg, rt);
  const what = `${rt.what || (rt.outdoor ? 'eines bestehenden Gebäudes von außen' : 'eines bestehenden Raums')} (${room})`;
  const raum = rt.outdoor ? 'Bereich' : 'Raum';
  const umsetzung = ctx.plan
    ? `UMSETZUNG (auf diesen ${raum} zugeschnitten, genau so umsetzen):\n${ctx.plan}`
    : `AUSSTATTUNG (gilt nur für das, was im Foto vorhanden ist; Anzahl, Größe und Lage der Gegenstände kommen immer aus dem Foto, z. B. bleibt ein einzelner Waschtisch ein einzelner Waschtisch in derselben Breite):\n${spec || '- moderne, hochwertige Sanierung'}${prods ? `\n\nKONKRETE PRODUKTE (so originalgetreu wie möglich):\n${prods}` : ''}${project.wishes?.trim() ? `\n\nKUNDENWÜNSCHE AUS DEM GESPRÄCH (haben Vorrang, soweit räumlich möglich):\n${project.wishes.trim()}` : ''}${project.note?.trim() ? `\n\nHINWEIS: ${project.note.trim()}` : ''}`;
  const intro = `Du bist ein Werkzeug für fotorealistische Sanierungs-Visualisierungen IM BESTAND. Das ist eine Renovierung eines echten ${raum}s, KEIN neuer Entwurf und keine Katalog-Szene.

Bild 1 ist ein Foto ${what}. Bearbeite GENAU DIESES FOTO so, dass es ${rt.same || (rt.outdoor ? 'dasselbe Gebäude' : 'denselben Raum')} nach der Sanierung in der Ausstattungslinie „${pkg.name}“ zeigt. Gib genau ein Bild aus: die sanierte Version von Bild 1.`;
  const regeln = `UNVERÄNDERLICH (wichtiger als alles andere):
- Kamera exakt wie Bild 1: gleiche Position, Höhe, Blickrichtung, Brennweite und Bildausschnitt. Nicht weitwinkliger, nicht herauszoomen, nichts außerhalb des Bildausschnitts dazuerfinden.
- Der ${raum} behält seine echte Größe und Form: Wände, Ecken, Decke, Dachschrägen, Vorsprünge, Fenster und Türen bleiben an derselben Stelle, in derselben Größe und mit denselben Fluchtlinien. Der ${raum} darf nicht größer, breiter oder tiefer wirken.
${rt.keep.map((k) => '- ' + k).join('\n')}
${rt.outdoor ? '' : `- Jeder Einrichtungs- und Sanitärgegenstand bleibt an seiner Stelle und in seiner Größe und wird nur erneuert. NICHTS hinzufügen, was im Foto nicht vorhanden ist: keine zusätzliche Toilette, Dusche oder Wanne, kein zweites Waschbecken, keine zusätzlichen Möbel oder Einbauten, außer es steht ausdrücklich unter UMSETZUNG.
- Maßstab realistisch: Fliesen, Armaturen und Möbel im richtigen Größenverhältnis zum echten ${raum} (eine Tür ist etwa 2 m hoch).
`}- Licht aus derselben Richtung wie im Foto (Fenster bleiben die Lichtquelle).`;
  const masse = masseText(project);
  const bestand = (masse ? `GEMESSENE RAUMMASSE (verbindlich, danach richten sich Größe und Anzahl der Objekte):\n${masse}\n\n` : '') + (ctx.bestand ? `BESTAND (so sieht der ${raum} heute aus, das ist verbindlich):\n${ctx.bestand}` : '');
  const schluss = `Gilt eine Angabe für diesen ${rt.outdoor ? 'Bildausschnitt' : raum} nicht oder passt sie nicht hinein, lass sie weg.
Ergebnis: fotorealistisch wie professionelle Architektur-/Interior-Fotografie, helles, natürliches Tageslicht, aufgeräumt, keine Personen, kein Text, keine Wasserzeichen, kein Baustellenzustand. Vorher und Nachher müssen sich exakt übereinanderlegen lassen.`;
  return { intro, regeln, bestand, umsetzung, schluss };
}

const ASPECTS = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '3:2': 3 / 2, '2:3': 2 / 3, '16:9': 16 / 9, '9:16': 9 / 16, '5:4': 5 / 4, '4:5': 4 / 5 };
async function nearestAspect(dataUrl) {
  const img = await loadImg(dataUrl);
  const r = img.naturalWidth / img.naturalHeight;
  return Object.entries(ASPECTS).sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0];
}

/** Rendert Ansicht i eines Projekts im Paket pkg. rendered = fertige Ansicht als Material-Vorlage (optional). */
async function renderWithGemini(pkg, project, i, rendered) {
  // Garten: Wärmepumpe an markierter Stelle einsetzen (garten.js), sonst Garten ohne Wärmepumpen-Angaben
  if (window.Garten?.zustaendig(project)) return Garten.render(pkg, project, i, rendered);
  pkg = window.Garten?.pkgFuer(pkg, project) || pkg;
  const { apiKey } = state.settings;
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  // Erst verstehen, dann bauen: Bestand erkennen und Moodboard auf den Raum zuschneiden.
  // Klappt das nicht (z. B. kurz kein Netz), geht es mit den strengen Regeln trotzdem weiter.
  let bestand = '', plan = '';
  try { bestand = await roomBestand(project); } catch (e) { console.warn('Bestand nicht erkannt', e); }
  if (bestand) try { plan = await roomPlan(pkg, project, bestand); } catch (e) { console.warn('Plan nicht erstellt', e); }
  const target = project.photos[i];
  const others = project.photos.map((ph, k) => [ph, k]).filter(([, k]) => k !== i);
  const refs = pkg.images.slice(0, MAX_REF_IMAGES);
  const t = buildPrompt(pkg, project, { bestand, plan });
  const img = (d) => ({ inline_data: { mime_type: mimeOf(d), data: b64(d) } });
  let n = 1;
  const parts = [{ text: t.intro }, { text: 'Bild 1 – das Foto, das bearbeitet wird:' }, img(target)];
  for (const [ph, k] of others) parts.push({ text: `Bild ${++n} – Foto ${k + 1} DESSELBEN Raums aus einem anderen Blickwinkel. Nur zum Verständnis von Grundriss, Größe, Fenstern und Anschlüssen. Nicht ausgeben, Blickwinkel nicht übernehmen:` }, img(ph));
  if (rendered) parts.push({ text: `Bild ${++n} – bereits fertig sanierte andere Ansicht DESSELBEN Raums in „${pkg.name}“. Verwende exakt dieselben Fliesen, Farben, Armaturen, Möbelausführungen und Leuchten, damit alle Ansichten zusammenpassen. Perspektive und Raumaufbau kommen aber nur aus Bild 1:` }, img(rendered));
  for (const im of refs) parts.push({ text: `Bild ${++n} – Moodboard-Vorlage: ${im.label?.trim() || 'Material/Stil'}. Nur Material, Farbe und Stil übernehmen. Raum, Aufteilung, Größe und Gegenstände aus diesem Bild NICHT übernehmen:` }, img(im.data));
  parts.push({ text: [t.regeln, t.bestand, t.umsetzung, t.schluss].filter(Boolean).join('\n\n') });
  return geminiImage(parts, await nearestAspect(target));
}

// ---------- Ansichten: welche Fotos ein Nachher-Bild bekommen, plus Draufsicht ----------
const DEFAULT_VIEWS = 2; // ohne Auswahl bekommen die ersten 2 Fotos ein Nachher-Bild, die übrigen helfen nur beim Verstehen
/** Indizes der Fotos, die ein Nachher-Bild bekommen. */
function renderIdx(p) {
  const on = p.views?.on;
  const idx = p.photos.map((_, i) => i).filter((i) => (Array.isArray(on) ? on.includes(i) : i < DEFAULT_VIEWS));
  return idx.length || !p.photos.length ? idx : [0];
}
/** Draufsicht gewünscht? (Innenräume, standardmäßig an) */
const wantsTop = (p) => !roomType(p.roomType).outdoor && !window.Garten?.zustaendig(p) && p.views?.top !== false && p.photos.length > 0;
/** Anzahl Bilder je Paket */
const viewCount = (p) => renderIdx(p).length + (wantsTop(p) ? 1 : 0);
const topOf = (p, id) => p.top?.[id] || '';

/** Draufsicht des sanierten Raums aus allen Fotos (3D von schräg oben, ohne Decke). ref = fertige Ansicht als Material-Vorlage. */
async function renderTop(pkg, project, ref) {
  pkg = window.Garten?.pkgFuer(pkg, project) || pkg;
  let bestand = '', plan = '';
  try { bestand = await roomBestand(project); } catch (e) { console.warn('Bestand nicht erkannt', e); }
  if (bestand) try { plan = await roomPlan(pkg, project, bestand); } catch (e) { console.warn('Plan nicht erstellt', e); }
  const t = buildPrompt(pkg, project, { bestand, plan });
  const rt = roomType(project.roomType);
  const img = (d) => ({ inline_data: { mime_type: mimeOf(d), data: b64(d) } });
  const parts = [{ text: `Du bist ein Werkzeug für fotorealistische Sanierungs-Visualisierungen IM BESTAND. Die Fotos zeigen einen echten ${rt.name} (${project.room}) VOR der Sanierung aus verschiedenen Blickwinkeln.

Erzeuge daraus EINE neue Ansicht: eine fotorealistische 3D-Draufsicht des fertig sanierten Raums in der Ausstattungslinie „${pkg.name}“, wie ein aufgeschnittenes Puppenhaus: Blick von schräg oben (ca. 60 Grad), Decke entfernt, alle Wände, Fenster und Türen sichtbar, der ganze Raum auf einen Blick. Gib genau ein Bild aus.` }];
  project.photos.forEach((ph, k) => parts.push({ text: `Foto ${k + 1} des Raums (Bestand):` }, img(ph)));
  if (ref) parts.push({ text: `Bereits fertig sanierte Ansicht DESSELBEN Raums in „${pkg.name}“. Verwende exakt dieselben Fliesen, Farben, Armaturen, Möbelausführungen und Leuchten:` }, img(ref));
  for (const im of pkg.images.slice(0, MAX_REF_IMAGES)) parts.push({ text: `Moodboard-Vorlage: ${im.label?.trim() || 'Material/Stil'}. Nur Material, Farbe und Stil übernehmen, nicht den Raum:` }, img(im.data));
  parts.push({ text: [`WICHTIG FÜR DIE DRAUFSICHT:
- Grundriss, Raumform, Proportionen und Größe exakt wie der echte Raum (aus den Fotos${masseText(project) ? ' und den gemessenen Maßen' : ''}). Ein kleiner Raum bleibt klein.
- Fenster, Türen, Dachschrägen, Vorsprünge und alle Einrichtungsgegenstände an derselben Stelle wie in den Fotos, in realistischer Größe.
- NICHTS hinzufügen, was es im Raum nicht gibt, außer es steht ausdrücklich unter UMSETZUNG.
- Was auf keinem Foto zu sehen ist, schlicht und passend zur Ausstattung ergänzen (Wandfläche, Boden), ohne neue Objekte.`, t.bestand, t.umsetzung, 'Ergebnis: fotorealistisch, helles natürliches Licht, sauber und aufgeräumt, keine Personen, kein Text, keine Maßangaben, keine Wasserzeichen.'].filter(Boolean).join('\n\n') });
  return geminiImage(parts, '4:3');
}

/** Schickt Text + Bilder an das Gemini-Bildmodell und gibt das gelieferte Bild (max. 1600 px) zurück. */
async function geminiImage(parts, aspectRatio) {
  const j = await geminiCall('image', (m) => ({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio, ...(/gemini-[3-9]/.test(m) && /pro/.test(m) ? { imageSize: '2K' } : {}) } },
  }));
  const cand = j.candidates?.[0];
  const imgPart = cand?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  if (!imgPart) {
    const txt = cand?.content?.parts?.map((p) => p.text).filter(Boolean).join(' ');
    throw new Error(txt || j.promptFeedback?.blockReason || cand?.finishReason || 'Die KI hat kein Bild geliefert. Bitte nochmal versuchen.');
  }
  const d = imgPart.inlineData || imgPart.inline_data;
  return resize(`data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`, 1600);
}

// ---------- Lichtstimmung: Abend (warmes, gedimmtes Licht) ----------
/** Anweisung, um eine fertige Tageslicht-Visualisierung in die Abendstimmung zu versetzen. */
function eveningPrompt(pkg, rt) {
  const light = rt.outdoor
    ? `- Abenddämmerung (blaue Stunde): Himmel tiefblau bis dunkelorange, kein direktes Sonnenlicht mehr
- Fenster leuchten von innen warmweiß, Außen- und Fassadenbeleuchtung, Wege- und Eingangslicht eingeschaltet (warmweiß, ca. 2700 K)`
    : `- Abend nach Sonnenuntergang: durch die Fenster nur noch dunkelblaues Dämmerlicht, kein Sonnenlicht
- alle vorhandenen Leuchten sind eingeschaltet und GEDIMMT: Einbauspots, Deckenleuchten, Wandleuchten, LED-Spiegel, indirekte Beleuchtung und beleuchtete Nischen leuchten sichtbar in warmweißem Licht (ca. 2700 K)
- gemütliche, hochwertige Atmosphäre wie in einem Hotel: weiche Lichtkegel, sanfte Schatten, warme Reflexe auf den Oberflächen`;
  return `Bild 1 ist eine fertige, fotorealistische Visualisierung (Ausstattungslinie "${pkg.name}") bei Tageslicht. Erzeuge GENAU DIESES BILD noch einmal, aber in Abendstimmung. Gib genau ein Bild aus.

UNBEDINGT IDENTISCH LASSEN:
- Kameraposition, Perspektive, Bildausschnitt
- alle Materialien, Fliesen, Farben, Möbel, Armaturen, Leuchten und Gegenstände an derselben Stelle (nichts hinzufügen, nichts entfernen; nur Licht, das schon als Leuchte vorhanden ist, darf leuchten)

NUR DIE LICHTSTIMMUNG ÄNDERN:
${light}

Ergebnis: fotorealistisch wie professionelle Architektur-/Interior-Fotografie am Abend, korrekt belichtet (nicht zu dunkel, Details gut erkennbar), keine Personen, kein Text, keine Wasserzeichen.`;
}
async function renderEvening(pkg, project, dayImg) {
  const parts = [{ text: eveningPrompt(pkg, roomType(project.roomType)) }, { inline_data: { mime_type: mimeOf(dayImg), data: b64(dayImg) } }];
  return geminiImage(parts, await nearestAspect(dayImg));
}

/** Ältere Projekte (ein Foto) auf das neue Format (mehrere Fotos) umstellen. */
function normalizeProject(p) {
  if (!p) return p;
  if (!Array.isArray(p.photos)) p.photos = p.photo ? [p.photo] : [];
  delete p.photo;
  for (const k of Object.keys(p.results || {})) if (!Array.isArray(p.results[k])) p.results[k] = [p.results[k]];
  p.results ??= {};
  if (!p.roomType) p.roomType = roomTypeIdFromName(p.room);
  p.room ||= roomType(p.roomType).name;
  if (!Array.isArray(p.selected)) p.selected = roomPackages(p).map((x) => x.id);
  p.pdfProducts ??= true;
  p.evening ??= {};
  p.withEvening ??= false;
  p.pdfEvening ??= true;
  return p;
}
const hasAnyResult = (p) => Object.values(p.results).some((arr) => arr.some(Boolean)) || Object.values(p.top || {}).some(Boolean);
const firstResult = (p, id) => (p.results[id] || []).find(Boolean);
const eveningOf = (p, id, i) => p.evening?.[id]?.[i] || '';
const hasAnyEvening = (p) => Object.values(p.evening || {}).some((arr) => arr.some(Boolean));

// ---------- PDF ----------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
async function addFit(doc, dataUrl, x, y, w, h, fmt = 'JPEG') {
  const img = await loadImg(dataUrl);
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  doc.addImage(dataUrl, fmt, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}


async function shareDoc(doc, name) {
  const blob = doc.output('blob');
  const file = new File([blob], name, { type: 'application/pdf' });
  $('#toast').hidden = true;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------- Vorher-Nachher-Schieberegler ----------
const moodSel = {}; // gewählte Lichtstimmung je Ansicht (nur für die Anzeige)
/** Vorher-Foto und Nachher-Bild übereinander; mit dem Finger die Trennlinie verschieben. */
function beforeAfter(before, after, alt) {
  return `<div class="ba" style="--pos:50%">
    <img class="ba-after" src="${after}" alt="${esc(alt)}" draggable="false">
    <img class="ba-before" src="${before}" alt="Vorher" draggable="false">
    <div class="ba-line"><span class="ba-knob">‹ ›</span></div>
    <span class="ba-tag l">Vorher</span><span class="ba-tag r">Nachher</span>
  </div>`;
}
(() => {
  let cur = null;
  const set = (e) => {
    const r = cur.getBoundingClientRect();
    cur.style.setProperty('--pos', Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)) + '%');
  };
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('.ba'); if (!el) return;
    cur = el; el.setPointerCapture?.(e.pointerId); set(e); e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => { if (cur) set(e); });
  const end = () => (cur = null);
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

// ---------- KI-Aufträge (Ansicht, Abendstimmung, Paket, Raum) ----------
/** Eine Ansicht rendern. Für Ansicht 2+ dient die erste fertige Ansicht als Material-Vorlage. */
async function runView(p, pkg, i) {
  p.status ??= {};
  const key = `${pkg.id}:${i}`;
  p.status[key] = { loading: true };
  if (state.project === p) refreshResult(pkg);
  try {
    const arr = (p.results[pkg.id] ??= []);
    const ref = arr.find((r, k) => r && k !== i);
    arr[i] = await renderWithGemini(pkg, p, i, ref);
    if (p.evening?.[pkg.id]) p.evening[pkg.id][i] = ''; // alte Abendstimmung passt nicht mehr zum neuen Bild
    p.status[key] = {};
    await saveProject(p);
  } catch (e) {
    p.status[key] = { error: e.message };
  }
  if (state.project === p) refreshResult(pkg);
  if (p.withEvening && p.results[pkg.id]?.[i] && !p.status[key].error) await runEvening(p, pkg, i);
}
/** Abendstimmung einer fertigen Ansicht erstellen (Vorlage: die Tageslicht-Visualisierung). */
async function runEvening(p, pkg, i) {
  const day = p.results[pkg.id]?.[i];
  if (!day) return;
  p.status ??= {};
  const key = `${pkg.id}:${i}:abend`;
  p.status[key] = { loading: true };
  if (state.project === p) refreshResult(pkg);
  try {
    const img = await renderEvening(pkg, p, day);
    if (p.results[pkg.id]?.[i] === day) { (p.evening[pkg.id] ??= [])[i] = img; await saveProject(p); }
    p.status[key] = {};
  } catch (e) {
    p.status[key] = { error: e.message };
  }
  if (state.project === p) refreshResult(pkg);
}
/** Alle Ansichten eines Pakets: erst Ansicht 1, dann die übrigen mit Ansicht 1 als Vorlage. */
async function runPackage(p, pkg) {
  p.results[pkg.id] = [];
  if (p.top) delete p.top[pkg.id];
  const idx = renderIdx(p);
  if (idx.length) await runView(p, pkg, idx[0]);
  await Promise.all([...idx.slice(1).map((i) => runView(p, pkg, i)), wantsTop(p) ? runTop(p, pkg) : null]);
}
/** Draufsicht eines Pakets erstellen. */
async function runTop(p, pkg) {
  p.status ??= {};
  const key = `${pkg.id}:top`;
  p.status[key] = { loading: true };
  if (state.project === p) refreshResult(pkg);
  try {
    (p.top ??= {})[pkg.id] = await renderTop(pkg, p, firstResult(p, pkg.id));
    p.status[key] = {};
    await saveProject(p);
  } catch (e) { p.status[key] = { error: e.message }; }
  if (state.project === p) refreshResult(pkg);
}
async function runAll(p) {
  if (!state.settings.apiKey) { toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000); return; }
  const pkgs = roomPackages(p).filter((x) => p.selected.includes(x.id));
  if (!pkgs.length) { toast('Bitte mindestens ein Paket auswählen.'); return; }
  await window.voiceReady?.(p); // Gespräch erst fertig auswerten, damit die Wünsche ins Bild kommen
  await Promise.all(pkgs.map((pkg) => runPackage(p, pkg)));
  const total = pkgs.length * viewCount(p);
  const ok = pkgs.reduce((n, x) => n + (p.results[x.id] || []).filter(Boolean).length + (topOf(p, x.id) ? 1 : 0), 0);
  toast(ok === total ? 'Fertig! Jetzt kannst du das PDF erstellen.' : `${ok} von ${total} Bildern fertig. Fehlgeschlagene mit „Neu“ wiederholen.`, 4000);
}
