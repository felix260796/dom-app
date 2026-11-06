'use strict';
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
function pickFiles({ multiple = false, camera = false } = {}) {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
    if (camera) inp.setAttribute('capture', 'environment');
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
}

// ---------- Moodboards (Pakete) ----------
// Raumtypen, Felder und Beispiel-Pakete stehen in rooms.js
const MAX_REF_IMAGES = 6;

// ---------- Zustand ----------
const state = { tab: 'projekt', settings: null, boards: null, project: null, wohnung: null, editPkg: null, boardRoom: 'bad' };

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
/** Moodboards (Pakete) eines Raumtyps; fehlende werden mit den Beispielen angelegt. */
function packagesFor(rt) {
  const list = (state.boards[rt] ??= defaultPackagesFor(rt));
  for (const p of list) { p.images ??= []; p.products ??= []; p.fields ??= {}; }
  return list;
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

// ---------- KI: Prompt & Gemini-Aufruf ----------
const MAX_PHOTOS = 4;
/** Baut die Anweisung. ctx: { others: Anzahl weiterer Raumfotos, rendered: true wenn eine fertige Ansicht als Vorlage dabei ist } */
function buildPrompt(pkg, room, note, ctx = { others: 0, rendered: false, wishes: '' }) {
  const rt = roomType(ctx.rt || roomTypeIdFromName(room));
  const FIELDS = fieldsFor(rt.id);
  const spec = FIELDS.filter(([k]) => k !== 'beschreibung' && pkg.fields[k]?.trim())
    .map(([k, label]) => `- ${label.replace(/\s*\(.*\)/, '')}: ${pkg.fields[k].trim()}`).join('\n');
  let n = 2;
  const otherTxt = ctx.others ? `- Bild ${n}${ctx.others > 1 ? ` bis ${n + ctx.others - 1}` : ''}: weitere Fotos DESSELBEN Raums aus anderen Blickwinkeln (nur zum Verständnis von Grundriss, Fenstern, Anschlüssen und Größe, nicht ausgeben)\n` : '';
  n += ctx.others;
  const renderedTxt = ctx.rendered ? `- Bild ${n}: bereits fertig sanierte Ansicht DESSELBEN Raums in diesem Paket. Verwende EXAKT dieselben Fliesen, Farben, Möbel, Armaturen und Leuchten, damit alle Ansichten zusammenpassen\n` : '';
  if (ctx.rendered) n += 1;
  const refs = pkg.images.slice(0, MAX_REF_IMAGES)
    .map((im, i) => `- Bild ${n + i}: ${im.label?.trim() || 'Referenz für Material/Stil'} (Moodboard-Vorlage, nicht als Raum übernehmen)`).join('\n');
  const list = otherTxt + renderedTxt + (refs ? refs + '\n' : '');
  const fieldLabel = (k) => (FIELD_LIB[k]?.[0] || '').replace(/\s*\(.*\)/, '');
  const prods = (pkg.products || []).filter((x) => x.name?.trim())
    .map((x) => `- ${x.area ? fieldLabel(x.area) + ': ' : ''}${x.name.trim()}`).join('\n');
  const what = `${rt.what || (rt.outdoor ? 'eines bestehenden Gebäudes von außen' : 'eines bestehenden Raums')} (${room})`;
  return `Du bist ein Werkzeug für fotorealistische Sanierungs-Visualisierungen.

Bild 1 ist ein Foto ${what}. Bearbeite GENAU DIESES FOTO (Bild 1) so, dass es ${rt.same || (rt.outdoor ? 'dasselbe Gebäude' : 'denselben Raum')} nach einer kompletten Sanierung in der Ausstattungslinie "${pkg.name}" zeigt. Gib genau ein Bild aus: die sanierte Version von Bild 1.

UNBEDINGT BEIBEHALTEN:
- exakt dieselbe Kameraposition, Perspektive, Brennweite und Bildausschnitt wie Bild 1
${rt.keep.map((k) => '- ' + k).join('\n')}

ERNEUERN nach dieser Ausstattung:
${spec || '- moderne, hochwertige Sanierung'}
${prods ? `\nKONKRETE PRODUKTE (so originalgetreu wie möglich darstellen):\n${prods}\n` : ''}${list ? `\nWEITERE BILDER:\n${list}` : ''}${note?.trim() ? `\nZUSÄTZLICHER HINWEIS ZU DIESEM PROJEKT: ${note.trim()}\n` : ''}${ctx.wishes?.trim() ? `\nKUNDENWÜNSCHE AUS DEM GESPRÄCH VOR ORT (haben Vorrang vor der Ausstattung oben, wenn sie sich widersprechen; Perspektive und Raumgeometrie bleiben trotzdem gleich):\n${ctx.wishes.trim()}\n` : ''}
Gilt eine Angabe für diesen ${rt.outdoor ? 'Bildausschnitt' : 'Raum'} nicht, lass sie weg.
Ergebnis: fotorealistisch wie professionelle Architektur-/Interior-Fotografie, helles, freundliches Tageslicht, aufgeräumt, keine Personen, kein Text, keine Wasserzeichen, kein Baustellenzustand.`;
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
  const { apiKey, model } = state.settings;
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const target = project.photos[i];
  const others = project.photos.filter((_, k) => k !== i);
  const img = (d) => ({ inline_data: { mime_type: mimeOf(d), data: b64(d) } });
  const parts = [{ text: buildPrompt(pkg, project.room, project.note, { others: others.length, rendered: !!rendered, wishes: project.wishes, rt: project.roomType }) }, img(target)];
  for (const o of others) parts.push(img(o));
  if (rendered) parts.push(img(rendered));
  for (const im of pkg.images.slice(0, MAX_REF_IMAGES)) parts.push(img(im.data));
  return geminiImage(parts, await nearestAspect(target));
}

/** Schickt Text + Bilder an das Gemini-Bildmodell und gibt das gelieferte Bild (max. 1600 px) zurück. */
async function geminiImage(parts, aspectRatio) {
  const { apiKey, model } = state.settings;
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio } },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash-image')}:generateContent`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Fehler ${r.status}`);
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
  if (!Array.isArray(p.selected)) p.selected = packagesFor(p.roomType).map((x) => x.id);
  p.pdfProducts ??= true;
  p.evening ??= {};
  p.withEvening ??= false;
  p.pdfEvening ??= true;
  return p;
}
const hasAnyResult = (p) => Object.values(p.results).some((arr) => arr.some(Boolean));
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
  await runView(p, pkg, 0);
  await Promise.all(p.photos.slice(1).map((_, k) => runView(p, pkg, k + 1)));
}
async function runAll(p) {
  if (!state.settings.apiKey) { toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000); return; }
  const pkgs = packagesFor(p.roomType).filter((x) => p.selected.includes(x.id));
  if (!pkgs.length) { toast('Bitte mindestens ein Paket auswählen.'); return; }
  await Promise.all(pkgs.map((pkg) => runPackage(p, pkg)));
  const total = pkgs.length * p.photos.length;
  const ok = pkgs.reduce((n, x) => n + (p.results[x.id] || []).filter(Boolean).length, 0);
  toast(ok === total ? 'Fertig! Jetzt kannst du das PDF erstellen.' : `${ok} von ${total} Bildern fertig. Fehlgeschlagene mit „Neu“ wiederholen.`, 4000);
}
