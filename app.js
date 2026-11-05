'use strict';
/* Sanierungs-Visualisierung – Web-App (PWA)
 * Alle Daten (Moodboards, Projekte, Einstellungen) liegen lokal auf dem Gerät (IndexedDB).
 * Bildbearbeitung über die Google Gemini API (Bild-Modell), direkt aus dem Browser. */

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
  return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function kvDel(k) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
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
const FIELDS = [
  ['beschreibung', 'Kurzbeschreibung (erscheint im PDF)', 'z. B. Hochwertiges Wohlfühlbad mit edlen Materialien'],
  ['stil', 'Stil & Farbwelt', 'z. B. modern, warm, Naturtöne, Akzente in Messing'],
  ['wand', 'Wände (Farbe, Oberfläche, Spachtelstufe)', 'z. B. Q4 gespachtelt, Kalkputz, warmweiß matt'],
  ['decke', 'Decke', 'z. B. Stuckleisten, indirekte LED-Beleuchtung'],
  ['wandfliesen', 'Wandfliesen (Format, Farbe, Material, Verlegung, Höhe)', 'z. B. 60x120 cm, Marmoroptik, raumhoch'],
  ['boden', 'Boden (Format, Farbe, Material)', 'z. B. 120x120 cm Feinsteinzeug anthrazit / Eichenparkett'],
  ['dusche', 'Dusche / Badewanne', 'z. B. bodengleiche Dusche, rahmenlose Glaswand'],
  ['wc', 'WC', 'z. B. wandhängend, spülrandlos'],
  ['waschtisch', 'Waschtisch & Möbel', 'z. B. Doppelwaschtisch, Unterschrank Eiche'],
  ['armaturen', 'Armaturen (Farbe, Stil)', 'z. B. gebürstetes Messing, Unterputz'],
  ['licht', 'Spiegel & Licht', 'z. B. Spiegel mit LED-Hinterleuchtung'],
  ['heizung', 'Heizkörper', 'z. B. Designheizkörper schwarz'],
  ['tueren', 'Türen & Fenster', 'z. B. weiße Lacktüren, flächenbündig'],
  ['sonstiges', 'Sonstiges / Hinweise für die KI', 'z. B. Nischen mit Beleuchtung, keine Deko'],
];
const MAX_REF_IMAGES = 6;

const DEFAULT_PACKAGES = [
  { id: 'basic', name: 'Basic', color: '#7a8795', images: [], fields: {
    beschreibung: 'Solide, saubere Grundsanierung zum fairen Preis.',
    stil: 'schlicht, hell, zeitlos, Weiß und Hellgrau',
    wand: 'Q2 gespachtelt, weiß gestrichen, matt',
    decke: 'glatt, weiß, einfache Deckenleuchte',
    wandfliesen: '30x60 cm, weiß glänzend, halbhoch ca. 1,20 m, im Duschbereich raumhoch',
    boden: '30x60 cm Feinsteinzeug hellgrau, matt',
    dusche: 'flache Duschtasse, Duschabtrennung mit Chromrahmen',
    wc: 'Wand-WC weiß, Standard',
    waschtisch: 'Keramik-Waschtisch 60 cm weiß, einfacher Unterschrank weiß',
    armaturen: 'Chrom, Einhebelmischer, Brausestange',
    licht: 'Spiegel mit einfacher Aufbauleuchte',
    heizung: 'Röhrenheizkörper weiß',
    tueren: 'weiße Standard-Innentür',
    sonstiges: '' } },
  { id: 'standard', name: 'Standard', color: '#1e3550', images: [], fields: {
    beschreibung: 'Modernes Bad mit großformatigen Fliesen und bodengleicher Dusche.',
    stil: 'modern, warm, Naturtöne, Akzente in Mattschwarz',
    wand: 'Q3 gespachtelt, warmes Weiß matt',
    decke: 'glatt, weiß, LED-Einbauspots',
    wandfliesen: '60x120 cm, Betonoptik hellgrau, matt, im Nassbereich raumhoch',
    boden: '60x120 cm Feinsteinzeug, Betonoptik mittelgrau',
    dusche: 'bodengleiche Dusche mit Rinne, Walk-In-Glaswand mit schwarzem Profil',
    wc: 'wandhängend, spülrandlos, weiß',
    waschtisch: 'Waschtisch 80 cm mit Unterschrank in Eiche-Optik',
    armaturen: 'Mattschwarz, Regenbrause Aufputz',
    licht: 'Spiegel mit LED-Hintergrundbeleuchtung',
    heizung: 'Designheizkörper weiß',
    tueren: 'weiße Lacktür, Drücker schwarz',
    sonstiges: '' } },
  { id: 'premium', name: 'Premium', color: '#b8862f', images: [], fields: {
    beschreibung: 'Exklusives Wohlfühlbad mit edlen Materialien und handwerklichen Details.',
    stil: 'luxuriös, elegant, Marmor, Messing, warmes Licht',
    wand: 'Q4 vollflächig gespachtelt, Feinputz in Greige, matt',
    decke: 'umlaufende Stuckleisten, indirekte LED-Lichtvoute, Spots',
    wandfliesen: '120x260 cm großformatig, Marmoroptik Calacatta mit feiner Goldäderung, poliert, raumhoch',
    boden: '120x120 cm Marmoroptik passend zur Wand (in Wohnräumen: Fischgrätparkett Eiche)',
    dusche: 'bodengleiche Dusche, rahmenlose Glaswand, beleuchtete Wandnische; freistehende Badewanne, wenn Platz ist',
    wc: 'wandhängend, spülrandlos, Betätigungsplatte Messing',
    waschtisch: 'Doppelwaschtisch mit Natursteinplatte, grifflose Unterschränke Nussbaum',
    armaturen: 'gebürstetes Messing, Unterputz, Regenbrause aus der Decke',
    licht: 'großer LED-Spiegel, Wandleuchten Messing',
    heizung: 'Designheizkörper Messing bzw. Fußbodenheizung',
    tueren: 'flächenbündige, deckenhohe Türen',
    sonstiges: '' } },
];

const ROOMS = ['Badezimmer', 'Gäste-WC', 'Wohnzimmer', 'Schlafzimmer', 'Küche', 'Flur', 'Kinderzimmer', 'Sonstiger Raum'];

// ---------- Zustand ----------
const state = { tab: 'projekt', settings: null, packages: null, project: null, editPkg: null };

async function loadAll() {
  state.settings = (await kvGet('settings')) || { apiKey: '', model: 'gemini-2.5-flash-image', company: 'DOM Projektmanagement GmbH', contact: 'DOM Projektmanagement GmbH', logo: null };
  state.packages = (await kvGet('packages')) || structuredClone(DEFAULT_PACKAGES);
  // Beim ersten Start das DOM-Logo als Standard übernehmen
  if (state.settings.logo === null) {
    try { const b = await (await fetch('assets/dom_logo.png')).blob(); state.settings.logo = await fileToDataUrl(b); } catch { state.settings.logo = ''; }
    await saveSettings();
  }
}
const saveSettings = () => kvSet('settings', state.settings);
const savePackages = () => kvSet('packages', state.packages);
const savePackagesDebounced = debounce(savePackages, 500);

async function projectIndex() { return (await kvGet('projectIndex')) || []; }
async function saveProject(proj) {
  const { status, ...p } = proj;
  await kvSet('project:' + p.id, p);
  const idx = (await projectIndex()).filter((x) => x.id !== p.id);
  idx.unshift({ id: p.id, customer: p.customer, room: p.room, created: p.created, thumb: p.thumb || '' });
  await kvSet('projectIndex', idx.slice(0, 100));
}
async function deleteProject(id) {
  await kvDel('project:' + id);
  await kvSet('projectIndex', (await projectIndex()).filter((x) => x.id !== id));
}

// ---------- KI: Prompt & Gemini-Aufruf ----------
const MAX_PHOTOS = 4;
/** Baut die Anweisung. ctx: { others: Anzahl weiterer Raumfotos, rendered: true wenn eine fertige Ansicht als Vorlage dabei ist } */
function buildPrompt(pkg, room, note, ctx = { others: 0, rendered: false }) {
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
  return `Du bist ein Werkzeug für fotorealistische Sanierungs-Visualisierungen.

Bild 1 ist ein Foto eines bestehenden Raums (${room}). Bearbeite GENAU DIESES FOTO (Bild 1) so, dass es denselben Raum nach einer kompletten Sanierung in der Ausstattungslinie "${pkg.name}" zeigt. Gib genau ein Bild aus: die sanierte Version von Bild 1.

UNBEDINGT BEIBEHALTEN:
- exakt dieselbe Kameraposition, Perspektive, Brennweite und Bildausschnitt wie Bild 1
- Raumgeometrie, Grundriss, Deckenhöhe, Lage von Fenstern, Türen und Dachschrägen
- Lage der Anschlüsse: Dusche/Wanne, WC und Waschtisch bleiben ungefähr an ihrer Position

ERNEUERN nach dieser Ausstattung:
${spec || '- moderne, hochwertige Sanierung'}
${list ? `\nWEITERE BILDER:\n${list}` : ''}${note?.trim() ? `\nZUSÄTZLICHER HINWEIS ZU DIESEM PROJEKT: ${note.trim()}\n` : ''}
Gilt eine Angabe für diesen Raumtyp nicht (z. B. WC in einem Wohnzimmer), lass sie weg.
Ergebnis: fotorealistisch wie professionelle Architektur-/Interior-Fotografie, natürliches Licht, aufgeräumt, keine Personen, kein Text, keine Wasserzeichen, kein Baustellenzustand.`;
}

const ASPECTS = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, '3:2': 3 / 2, '2:3': 2 / 3, '16:9': 16 / 9, '9:16': 9 / 16, '5:4': 5 / 4, '4:5': 4 / 5 };
async function nearestAspect(dataUrl) {
  const img = await loadImg(dataUrl);
  const r = img.naturalWidth / img.naturalHeight;
  return Object.entries(ASPECTS).sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0];
}

/** Rendert Ansicht i eines Projekts im Paket pkg. rendered = fertige Ansicht als Material-Vorlage (optional). */
async function renderWithGemini(pkg, project, i, rendered) {
  const { apiKey, model } = state.settings;
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const target = project.photos[i];
  const others = project.photos.filter((_, k) => k !== i);
  const img = (d) => ({ inline_data: { mime_type: mimeOf(d), data: b64(d) } });
  const parts = [{ text: buildPrompt(pkg, project.room, project.note, { others: others.length, rendered: !!rendered }) }, img(target)];
  for (const o of others) parts.push(img(o));
  if (rendered) parts.push(img(rendered));
  for (const im of pkg.images.slice(0, MAX_REF_IMAGES)) parts.push(img(im.data));
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: await nearestAspect(target) } },
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

/** Ältere Projekte (ein Foto) auf das neue Format (mehrere Fotos) umstellen. */
function normalizeProject(p) {
  if (!p) return p;
  if (!Array.isArray(p.photos)) p.photos = p.photo ? [p.photo] : [];
  delete p.photo;
  for (const k of Object.keys(p.results || {})) if (!Array.isArray(p.results[k])) p.results[k] = [p.results[k]];
  p.results ??= {};
  return p;
}
const hasAnyResult = (p) => Object.values(p.results).some((arr) => arr.some(Boolean));
const firstResult = (p, id) => (p.results[id] || []).find(Boolean);

// ---------- PDF ----------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
async function addFit(doc, dataUrl, x, y, w, h, fmt = 'JPEG') {
  const img = await loadImg(dataUrl);
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  doc.addImage(dataUrl, fmt, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
  return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

async function buildPdf(project) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210, M = 14;
  const S = state.settings;
  const pkgs = state.packages.filter((p) => firstResult(project, p.id));
  const date = new Date(project.created).toLocaleDateString('de-DE');
  const logoFmt = S.logo ? (mimeOf(S.logo) === 'image/png' ? 'PNG' : 'JPEG') : null;

  const footer = (n) => {
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(S.contact || S.company || '', M, H - 7);
    doc.text(`KI-Visualisierung, unverbindliche Darstellung  ·  Seite ${n}`, W - M, H - 7, { align: 'right' });
  };

  // Deckblatt
  if (S.logo) await addFit(doc, S.logo, M, M, 60, 22, logoFmt);
  else if (S.company) { doc.setFontSize(16); doc.setTextColor(30, 53, 80); doc.text(S.company, M, M + 10); }
  doc.setTextColor(30, 53, 80);
  doc.setFontSize(24); doc.setFont('helvetica', 'bold');
  doc.text(pkgs.length > 1 ? 'Ihre Sanierung in\nAusstattungsvarianten' : 'Ihre Sanierung\nVisualisierung', M, 58);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(70);
  let y = 84;
  for (const [k, v] of [['Kunde', project.customer], ['Objekt', project.address], ['Raum', project.room], ['Datum', date]]) {
    if (!v) continue;
    doc.setTextColor(130); doc.text(k, M, y); doc.setTextColor(40); doc.text(doc.splitTextToSize(String(v), 80), M + 22, y); y += 8;
  }
  doc.setFontSize(9); doc.setTextColor(130); doc.text('Ist-Zustand', 120, 26);
  await addFit(doc, project.photos[0], 120, 28, W - M - 120, 100);
  // Übersicht der Varianten
  const tw = (W - 2 * M - (pkgs.length - 1) * 6) / Math.max(pkgs.length, 1);
  for (const [i, p] of pkgs.entries()) {
    const x = M + i * (tw + 6);
    doc.setFillColor(...hexRgb(p.color)); doc.rect(x, 138, tw, 1.5, 'F');
    doc.setFontSize(10); doc.setTextColor(...hexRgb(p.color)); doc.setFont('helvetica', 'bold');
    doc.text(p.name, x, 145); doc.setFont('helvetica', 'normal');
    await addFit(doc, firstResult(project, p.id), x, 147, tw, 48);
  }
  footer(1);

  // Pro Paket und Ansicht eine Seite: Vorher / Nachher + Ausstattung
  let page = 1;
  for (const p of pkgs) {
    const views = project.photos.map((ph, i) => [ph, project.results[p.id]?.[i], i]).filter(([, r]) => r);
    for (const [vi, [photo, result, i]] of views.entries()) {
      doc.addPage(); page++;
      const rgb = hexRgb(p.color);
      if (S.logo) await addFit(doc, S.logo, M, 8, 40, 14, logoFmt);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...rgb);
      doc.text(`Paket ${p.name}`, W - M, 18, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
      const sub = [views.length > 1 ? `Ansicht ${vi + 1} von ${views.length}` : '', p.fields.beschreibung || ''].filter(Boolean).join('  ·  ');
      if (sub) doc.text(doc.splitTextToSize(sub, 170), W - M, 24, { align: 'right' });
      doc.setFillColor(...rgb); doc.rect(M, 29, W - 2 * M, 1, 'F');
      const bw = (W - 2 * M - 8) / 2, by = 40, bh = 108;
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(110);
      doc.text('VORHER', M, by - 3); doc.setTextColor(...rgb); doc.text(`NACHHER – ${p.name.toUpperCase()}`, M + bw + 8, by - 3);
      doc.setFont('helvetica', 'normal');
      await addFit(doc, photo, M, by, bw, bh);
      await addFit(doc, result, M + bw + 8, by, bw, bh);
      // Ausstattungsliste in 3 Spalten
      const items = FIELDS.filter(([k]) => !['beschreibung', 'sonstiges'].includes(k) && p.fields[k]?.trim());
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 53, 80);
      doc.text('Ausstattung', M, 156); doc.setFont('helvetica', 'normal');
      const cols = 3, cw = (W - 2 * M - (cols - 1) * 6) / cols, perCol = Math.ceil(items.length / cols);
      items.forEach(([k, label], n) => {
        const c = Math.floor(n / perCol), r = n % perCol;
        const x = M + c * (cw + 6), yy = 162 + r * 7.2;
        if (yy > H - 12) return;
        doc.setFontSize(7.5); doc.setTextColor(130); doc.text(label.replace(/\s*\(.*\)/, ''), x, yy);
        doc.setFontSize(8); doc.setTextColor(40);
        doc.text(doc.splitTextToSize(p.fields[k].trim(), cw)[0], x, yy + 3.3);
      });
      footer(page);
    }
  }
  return doc;
}

async function sharePdf(project) {
  toast('PDF wird erstellt …', 8000);
  const doc = await buildPdf(project);
  const name = `Visualisierung_${(project.customer || 'Projekt').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
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

// ---------- Ansicht: Projekt ----------
async function viewProjekt() {
  const p = normalizeProject(state.project);
  if (!p) return viewProjektListe();
  setTitle(p.customer || 'Neues Projekt');
  const full = p.photos.length >= MAX_PHOTOS;
  main().innerHTML = `
    <div class="card">
      <h2>1. Fotos</h2>
      <p class="muted">1 bis ${MAX_PHOTOS} Fotos aus verschiedenen Blickwinkeln, am besten quer und aus den Ecken. Die KI nutzt alle Fotos, um den Raum besser zu verstehen, und erstellt <b>pro Foto eine Nachher-Ansicht</b> mit denselben Materialien.</p>
      ${p.photos.length ? `<div class="thumbs">${p.photos.map((ph, i) => `
        <div class="thumb"><img src="${ph}" alt="Ansicht ${i + 1}"><div style="padding:6px 8px;font-size:13px">Ansicht ${i + 1}</div><button class="del" data-delphoto="${i}">Entfernen</button></div>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:10px">
        <button class="btn" id="cam" ${full ? 'disabled' : ''}>📷 Kamera</button>
        <button class="btn secondary" id="gal" ${full ? 'disabled' : ''}>🖼️ Fotos</button>
      </div>
    </div>
    <div class="card">
      <h2>2. Angaben</h2>
      <label>Kunde</label><input type="text" id="customer" value="${esc(p.customer)}" placeholder="z. B. Familie Müller">
      <label>Objekt / Adresse</label><input type="text" id="address" value="${esc(p.address)}" placeholder="z. B. Hauptstr. 5, 2. OG">
      <label>Raum</label><select id="room">${ROOMS.map((r) => `<option ${r === p.room ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <label>Zusatzhinweis für die KI (optional)</label><textarea id="note" placeholder="z. B. Badewanne raus, dafür große Dusche">${esc(p.note)}</textarea>
    </div>
    <div class="card">
      <h2>3. Pakete visualisieren</h2>
      ${state.packages.map((x) => `<label class="check"><input type="checkbox" data-sel="${x.id}" ${p.selected.includes(x.id) ? 'checked' : ''}><span class="swatch" style="background:${x.color};height:20px;width:8px"></span>${esc(x.name)}</label>`).join('')}
      <button class="btn block" id="go" ${p.photos.length ? '' : 'disabled'}>✨ Visualisierung erstellen</button>
      <p class="muted">${p.photos.length > 1 ? `${p.photos.length} Ansichten × Pakete. ` : ''}Dauert ca. 10–30 Sekunden pro Bild.</p>
    </div>
    <div id="results">${state.packages.filter((x) => p.selected.includes(x.id) || firstResult(p, x.id)).map(resultCard).join('')}</div>
    <div class="card">
      <button class="btn block" id="pdf" ${hasAnyResult(p) ? '' : 'disabled'}>📄 Vorher-Nachher-PDF erstellen</button>
      <button class="btn secondary block" id="social" style="margin-top:10px" ${hasAnyResult(p) ? '' : 'disabled'}>🎬 Instagram-Video & Post</button>
      <div class="row" style="margin-top:10px">
        <button class="btn secondary" id="back">← Alle Projekte</button>
        <button class="btn danger" id="del">Projekt löschen</button>
      </div>
    </div>`;

  const persist = debounce(() => saveProject(p), 400);
  const addPhotos = async (camera) => {
    const files = await pickFiles({ camera, multiple: !camera });
    if (!files.length) return;
    const free = MAX_PHOTOS - p.photos.length;
    for (const f of files.slice(0, free)) p.photos.push(await resize(await fileToDataUrl(f), 1600));
    if (files.length > free) toast(`Maximal ${MAX_PHOTOS} Fotos pro Projekt.`);
    p.thumb = await resize(p.photos[0], 200);
    await saveProject(p); viewProjekt();
  };
  $('#cam').onclick = () => addPhotos(true);
  $('#gal').onclick = () => addPhotos(false);
  $$('[data-delphoto]').forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.delphoto;
    p.photos.splice(i, 1);
    for (const k of Object.keys(p.results)) p.results[k].splice(i, 1);
    p.thumb = p.photos[0] ? await resize(p.photos[0], 200) : '';
    await saveProject(p); viewProjekt();
  }));
  for (const id of ['customer', 'address', 'room', 'note']) $('#' + id).oninput = (e) => { p[id] = e.target.value; persist(); if (id === 'customer') setTitle(p.customer || 'Neues Projekt'); };
  $$('[data-sel]').forEach((c) => (c.onchange = () => { p.selected = $$('[data-sel]').filter((x) => x.checked).map((x) => x.dataset.sel); persist(); }));
  $('#go').onclick = () => runAll(p);
  $('#pdf').onclick = () => sharePdf(p).catch((e) => toast('PDF-Fehler: ' + e.message, 5000));
  $('#social').onclick = () => viewSocial(p).catch((e) => toast('Fehler: ' + e.message, 5000));
  $('#back').onclick = () => { state.project = null; viewProjekt(); };
  $('#del').onclick = async () => { if (!confirm('Projekt wirklich löschen?')) return; await deleteProject(p.id); state.project = null; viewProjekt(); };
  bindResultButtons(p);
}

function resultCard(pkg) {
  const p = state.project;
  const views = p.photos.map((_, i) => {
    const st = p.status?.[`${pkg.id}:${i}`], res = p.results[pkg.id]?.[i];
    let body;
    if (st?.loading) body = `<div class="status"><div class="spinner"></div>KI arbeitet an „${esc(pkg.name)}“${p.photos.length > 1 ? `, Ansicht ${i + 1}` : ''} …</div>`;
    else if (st?.error) body = `<div class="status err">${esc(st.error)}</div>`;
    else if (res) body = `<img src="${res}" alt="Nachher ${esc(pkg.name)}">`;
    else body = '<div class="status">Noch nicht erstellt</div>';
    const label = p.photos.length > 1 ? `<span class="muted">Ansicht ${i + 1}</span>` : '<span></span>';
    return `<div style="border-top:1px solid var(--line)"><div class="head" style="font-weight:400;padding:6px 12px">${label}
      ${res || st?.error ? `<button class="btn small secondary" data-redo="${pkg.id}" data-view="${i}">↻ Neu</button>` : ''}</div>
      <div class="body">${body}</div></div>`;
  }).join('');
  return `<div class="result" id="res-${pkg.id}">
    <div class="head"><span><span class="swatch" style="display:inline-block;background:${pkg.color};height:14px;width:6px;vertical-align:-1px"></span> ${esc(pkg.name)}</span>
    ${p.photos.length > 1 && firstResult(p, pkg.id) ? `<button class="btn small secondary" data-redoall="${pkg.id}">↻ Alle neu</button>` : ''}</div>
    ${views}
  </div>`;
}
function refreshResult(pkg) {
  const el = $('#res-' + pkg.id);
  if (!el) { $('#results')?.insertAdjacentHTML('beforeend', resultCard(pkg)); }
  else el.outerHTML = resultCard(pkg);
  bindResultButtons(state.project);
  const pdf = $('#pdf'); if (pdf) pdf.disabled = !hasAnyResult(state.project);
  const soc = $('#social'); if (soc) soc.disabled = !hasAnyResult(state.project);
}
function bindResultButtons(p) {
  const pk = (id) => state.packages.find((x) => x.id === id);
  $$('[data-redo]').forEach((b) => (b.onclick = () => runView(p, pk(b.dataset.redo), +b.dataset.view)));
  $$('[data-redoall]').forEach((b) => (b.onclick = () => runPackage(p, pk(b.dataset.redoall))));
}

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
    p.status[key] = {};
    await saveProject(p);
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
  const pkgs = state.packages.filter((x) => p.selected.includes(x.id));
  if (!pkgs.length) { toast('Bitte mindestens ein Paket auswählen.'); return; }
  await Promise.all(pkgs.map((pkg) => runPackage(p, pkg)));
  const total = pkgs.length * p.photos.length;
  const ok = pkgs.reduce((n, x) => n + (p.results[x.id] || []).filter(Boolean).length, 0);
  toast(ok === total ? 'Fertig! Jetzt kannst du das PDF erstellen.' : `${ok} von ${total} Bildern fertig. Fehlgeschlagene mit „Neu“ wiederholen.`, 4000);
}

async function viewProjektListe() {
  setTitle('Projekte');
  const idx = await projectIndex();
  main().innerHTML = `
    <div class="card">
      <h2>Neues Projekt</h2>
      <p class="muted">Foto machen, Pakete auswählen, KI-Visualisierung und Vorher-Nachher-PDF für den Kunden.</p>
      <button class="btn block" id="new">＋ Neues Projekt starten</button>
      ${state.settings.apiKey ? '' : '<p class="muted" style="margin-top:10px">⚠️ Noch kein API-Schlüssel hinterlegt. Bitte zuerst unter <a href="#" id="toSet">Einstellungen</a> eintragen.</p>'}
    </div>
    ${idx.length ? `<div class="card"><h2>Letzte Projekte</h2>${idx.map((x) => `
      <div class="list-item" data-open="${x.id}">${x.thumb ? `<img src="${x.thumb}" alt="">` : '<div style="width:56px;height:56px;background:#eee;border-radius:8px"></div>'}
      <div><div><b>${esc(x.customer || 'Ohne Namen')}</b></div><div class="muted">${esc(x.room || '')} · ${new Date(x.created).toLocaleDateString('de-DE')}</div></div></div>`).join('')}</div>` : ''}`;
  $('#new').onclick = () => {
    state.project = { id: uid(), created: Date.now(), customer: '', address: '', room: ROOMS[0], note: '', photos: [], thumb: '', results: {}, selected: state.packages.map((x) => x.id) };
    viewProjekt();
  };
  $('#toSet') && ($('#toSet').onclick = (e) => { e.preventDefault(); switchTab('einstellungen'); });
  $$('[data-open]').forEach((el) => (el.onclick = async () => { state.project = normalizeProject(await kvGet('project:' + el.dataset.open)); viewProjekt(); }));
}

// ---------- Ansicht: Moodboards ----------
function viewPakete() {
  if (state.editPkg) return viewPaketEdit(state.editPkg);
  setTitle('Moodboards');
  main().innerHTML = `
    <div class="card">
      <h2>Deine Ausstattungspakete</h2>
      <p class="muted">Hier legst du pro Paket fest, wie der Raum nach der Sanierung aussehen soll: per Text und mit Referenzbildern (Fliesen, Armaturen, Farben …). Du kannst alles jederzeit ändern.</p>
      <div class="pkg-list">${state.packages.map((p) => `
        <div class="pkg" data-edit="${p.id}"><span class="swatch" style="background:${p.color}"></span>
        <div style="flex:1"><div class="name">${esc(p.name)}</div><div class="muted">${esc(p.fields.beschreibung || '')}</div><div class="muted">${p.images.length} Bild(er)</div></div><span>›</span></div>`).join('')}</div>
    </div>
    <div class="card">
      <h2>Sicherung</h2>
      <p class="muted">Moodboards als Datei sichern oder auf ein anderes Gerät übertragen (z. B. vom PC aufs iPhone).</p>
      <div class="row"><button class="btn secondary" id="exp">⬇️ Exportieren</button><button class="btn secondary" id="imp">⬆️ Importieren</button></div>
      <button class="btn danger block" id="reset" style="margin-top:10px">Auf Beispiel-Pakete zurücksetzen</button>
    </div>`;
  $$('[data-edit]').forEach((el) => (el.onclick = () => { state.editPkg = el.dataset.edit; viewPakete(); }));
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify({ version: 1, packages: state.packages })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'moodboards.json'; a.click();
  };
  $('#imp').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const data = JSON.parse(await inp.files[0].text());
        if (!Array.isArray(data.packages)) throw new Error('Keine Moodboard-Datei');
        state.packages = data.packages; await savePackages(); toast('Moodboards importiert'); viewPakete();
      } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 4000); }
    };
    inp.click();
  };
  $('#reset').onclick = async () => {
    if (!confirm('Alle Moodboards durch die Beispiel-Pakete ersetzen? Deine Bilder gehen verloren.')) return;
    state.packages = structuredClone(DEFAULT_PACKAGES); await savePackages(); viewPakete();
  };
}

function viewPaketEdit(id) {
  const p = state.packages.find((x) => x.id === id);
  setTitle('Moodboard ' + p.name);
  main().innerHTML = `
    <button class="btn secondary small" id="back" style="margin-bottom:12px">← Zurück</button>
    <div class="card">
      <h2>Allgemein</h2>
      <div class="row"><div style="flex:3"><label>Name des Pakets</label><input type="text" id="pname" value="${esc(p.name)}"></div>
      <div style="flex:1"><label>Farbe</label><input type="color" id="pcolor" value="${p.color}" style="width:100%;height:44px;border:0;background:none"></div></div>
    </div>
    <div class="card">
      <h2>Referenzbilder</h2>
      <p class="muted">Fotos von Fliesen, Armaturen, Farbmustern oder Beispielbädern. Beschrifte jedes Bild (z. B. „Wandfliese“, „Armatur Waschtisch“), damit die KI weiß, wofür es steht. Die ersten ${MAX_REF_IMAGES} Bilder werden verwendet.</p>
      <div class="thumbs">${p.images.map((im, i) => `
        <div class="thumb"><img src="${im.data}" alt=""><input type="text" data-label="${i}" value="${esc(im.label)}" placeholder="Wofür steht das Bild?"><button class="del" data-delimg="${i}">Entfernen</button></div>`).join('')}</div>
      <button class="btn secondary block" id="addimg" style="margin-top:10px">＋ Bilder hinzufügen</button>
    </div>
    <div class="card">
      <h2>Ausstattung</h2>
      <p class="muted">Je genauer, desto besser trifft die KI dein Paket. Leere Felder werden ignoriert.</p>
      ${FIELDS.map(([k, label, ph]) => `<label>${esc(label)}</label><textarea data-field="${k}" placeholder="${esc(ph)}" rows="2">${esc(p.fields[k] || '')}</textarea>`).join('')}
    </div>`;
  $('#back').onclick = () => { savePackages(); state.editPkg = null; viewPakete(); };
  $('#pname').oninput = (e) => { p.name = e.target.value; setTitle('Moodboard ' + p.name); savePackagesDebounced(); };
  $('#pcolor').oninput = (e) => { p.color = e.target.value; savePackagesDebounced(); };
  $$('[data-field]').forEach((t) => (t.oninput = () => { p.fields[t.dataset.field] = t.value; savePackagesDebounced(); }));
  $$('[data-label]').forEach((t) => (t.oninput = () => { p.images[+t.dataset.label].label = t.value; savePackagesDebounced(); }));
  $$('[data-delimg]').forEach((b) => (b.onclick = async () => { p.images.splice(+b.dataset.delimg, 1); await savePackages(); viewPaketEdit(id); }));
  $('#addimg').onclick = async () => {
    const files = await pickFiles({ multiple: true });
    for (const f of files) p.images.push({ id: uid(), label: '', data: await resize(await fileToDataUrl(f), 1024) });
    await savePackages(); viewPaketEdit(id);
  };
}

// ---------- Ansicht: Einstellungen ----------
function viewEinstellungen() {
  setTitle('Einstellungen');
  const S = state.settings;
  main().innerHTML = `
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
    <div class="card"><p class="muted">Alle Daten liegen nur auf diesem Gerät. Sichere deine Moodboards regelmäßig über „Moodboards → Exportieren“.</p></div>`;
  const save = debounce(saveSettings, 300);
  for (const id of ['company', 'contact', 'apiKey']) $('#' + id).oninput = (e) => { S[id] = e.target.value.trim(); save(); };
  $('#model').onchange = (e) => { S.model = e.target.value; save(); };
  $('#modelCustom').oninput = (e) => { if (e.target.value.trim()) { S.model = e.target.value.trim(); save(); } };
  $('#logo').onclick = async () => {
    const [f] = await pickFiles(); if (!f) return;
    S.logo = await resize(await fileToDataUrl(f), 800, 'image/png'); await saveSettings(); viewEinstellungen();
  };
  $('#nologo') && ($('#nologo').onclick = async () => { S.logo = ''; await saveSettings(); viewEinstellungen(); });
  $('#test').onclick = async () => {
    if (!S.apiKey) { toast('Bitte zuerst den API-Schlüssel eintragen.'); return; }
    try {
      // Alle verfügbaren Modelle laden und die Bild-Modelle zur Auswahl anbieten
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': S.apiKey } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(`❌ ${j.error?.message || r.status}`, 6000); return; }
      const imgModels = (j.models || [])
        .filter((m) => /image/i.test(m.name) && !/imagen/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
      if (!imgModels.length) { toast('✅ Schlüssel ok, aber kein Bild-Modell gefunden.', 6000); return; }
      const sel = $('#model');
      sel.innerHTML = imgModels.map((m) => `<option value="${esc(m.id)}" ${m.id === S.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
      if (!imgModels.some((m) => m.id === S.model)) { S.model = imgModels[0].id; sel.value = S.model; await saveSettings(); }
      S.modelList = imgModels; await saveSettings();
      toast(`✅ Verbunden. ${imgModels.length} Bild-Modell(e) gefunden, ausgewählt: ${sel.selectedOptions[0].textContent}`, 6000);
    } catch (e) { toast('❌ ' + e.message, 6000); }
  };
}

// ---------- Navigation ----------
function setTitle(t) { $('#title').textContent = t; }
function switchTab(tab) {
  state.tab = tab;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  ({ projekt: viewProjekt, pakete: viewPakete, einstellungen: viewEinstellungen })[tab]();
}
$$('.tabbar button').forEach((b) => (b.onclick = () => { if (b.dataset.tab === 'pakete') state.editPkg = null; switchTab(b.dataset.tab); }));

(async () => {
  await loadAll();
  navigator.storage?.persist?.();
  switchTab('projekt');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
