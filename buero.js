/* Büro-Programm am PC (Version 107, Wünsche Felix 15.11.): alles, was man am Schreibtisch mit Maus und Tastatur braucht.
 * Gilt nur am Computer (Tabelle.istBuero()); iPhone und iPad bleiben unverändert.
 * - Angebot: rechts Reiter „Bilder“ und „Preislisten“ zum Ansehen und Übernehmen (Klick auf + oder in die Tabelle ziehen)
 * - Dateien mit der Maus hineinziehen (Fotos und PDFs ins offene Projekt bzw. zum Kunden)
 * - Drucken (Symbol oben, Strg+P): offenes Dokument, sonst Angebot/Rechnung der Seite, beim Kunden das Kundenblatt
 * - Kundenablage: jedes PDF zusätzlich ohne Nachfrage in den Kundenordner (z. B. OneDrive), Ordner einmal wählen
 * - Listen: Rechtsklick-Menü, „Als Excel speichern“, Kunden „Aus Excel einlesen“
 * - Zuletzt geöffnet (Seitenleiste), Rundmail und Serienbrief, Kalender im eigenen Fenster */
window.Buero = (() => {
  const istPc = () => !!window.Tabelle?.istBuero();
  const warte = (sel, ms = 15000) => new Promise((fertig) => {
    const da = $(sel); if (da) return fertig(da);
    const o = new MutationObserver(() => { const el = $(sel); if (el) { o.disconnect(); clearTimeout(t); fertig(el); } });
    const t = setTimeout(() => { o.disconnect(); fertig(null); }, ms);
    o.observe(document.body, { childList: true, subtree: true });
  });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const eur = (x) => (+x || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const tag = (t) => (t ? new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

  // ---------- Angebot: Seitenleiste mit Bildern und Preislisten ----------
  let aptWahl = 'akt';
  try { aptWahl = localStorage.getItem('dom:apt') || 'akt'; } catch {}
  let plQuelle = '', plSuche = '';
  function angebotSeite(aside, w, list, tabBox) {
    const zeig = (id) => {
      aptWahl = id; try { localStorage.setItem('dom:apt', id); } catch {}
      $$('[data-apt]', aside).forEach((b) => b.classList.toggle('on', b.dataset.apt === id));
      $$('[data-apc]', aside).forEach((p) => (p.hidden = p.dataset.apc !== id));
      if (id === 'bild') bilderPane($('[data-apc="bild"]', aside), w).catch((e) => console.warn(e));
      if (id === 'pl') plPane($('[data-apc="pl"]', aside), tabBox).catch((e) => console.warn(e));
    };
    $$('[data-apt]', aside).forEach((b) => (b.onclick = () => zeig(b.dataset.apt)));
    zeig(aptWahl);
  }
  /** Bilder dieses Projekts zuerst, dann die übrigen am Objekt, dazu die Dokumente des Projekts. Klick = groß ansehen. */
  async function bilderPane(el, w) {
    if (!w.kundeId) { el.innerHTML = '<p class="hint">Erst einen Kunden wählen, dann stehen hier seine Fotos und Pläne.</p>'; return; }
    const d = await window.Bilder.laden(w.kundeId, w.objektId || '');
    const ordner = (id) => d.ordner.find((o) => o.id === id)?.name || 'Fotos';
    const eigene = d.bilder.filter((b) => b.projektId === w.id), andere = d.bilder.filter((b) => b.projektId !== w.id);
    const gruppe = (bilder) => {
      const g = new Map(); for (const b of [...bilder].sort((a, c) => (c.t || 0) - (a.t || 0))) { const n = ordner(b.ordner); if (!g.has(n)) g.set(n, []); g.get(n).push(b); }
      return [...g].map(([n, l]) => `<div class="apb-o"><b>${esc(n)}</b><span class="muted">${l.length}</span></div><div class="apb-g">${l.map((b) => `<button type="button" class="apb-b" data-bid="${esc(b.id)}" title="${esc([b.text, tag(b.t)].filter(Boolean).join(' · '))}"><img src="${b.thumb}" alt="" loading="lazy" draggable="false"></button>`).join('')}</div>`).join('');
    };
    const docs = (w.dokumente || []).filter((x) => x.key);
    el.innerHTML = `${eigene.length ? gruppe(eigene) : '<p class="hint">Zu diesem Angebot gibt es noch keine Fotos. Fotos vom iPad oder iPhone landen über den Cloud-Abgleich von selbst hier. Am PC: Bilder einfach auf dieses Fenster ziehen.</p>'}
      ${andere.length ? `<details class="apb-mehr"${eigene.length ? '' : ' open'}><summary>Weitere Fotos am Objekt (${andere.length})</summary>${gruppe(andere)}</details>` : ''}
      ${docs.length ? `<div class="apb-o"><b>Dokumente</b><span class="muted">${docs.length}</span></div><div class="apb-d">${docs.map((x, i) => `<button type="button" class="apb-dok" data-dok="${i}">${icon('file')}<span>${esc(x.name)}</span></button>`).join('')}</div>` : ''}`;
    $$('[data-bid]', el).forEach((b) => (b.onclick = async () => {
      const bild = d.bilder.find((x) => x.id === b.dataset.bid);
      pdfAnsicht((await kvGet('bild:' + bild.id)) || bild.thumb, bild.text || ordner(bild.ordner));
    }));
    $$('[data-dok]', el).forEach((b) => (b.onclick = async () => {
      const x = docs[+b.dataset.dok], data = await kvGet(x.key);
      if (!data) return toast('Das Dokument ist auf diesem Gerät noch nicht geladen.', 4000);
      pdfAnsicht(data, x.name);
    }));
  }
  /** Allgemeine Preisliste oder die eines Partners: suchen, mit + übernehmen oder in die Tabelle ziehen. */
  async function plPane(el, tabBox) {
    const A = window.Angebot._intern, PL = await A.preisliste();
    const partner = (window.Partner?.liste() || []).filter((p) => Object.keys(p.preise || {}).length || (p.eigenePreise || []).length)
      .sort((a, b) => Partner.titel(a).localeCompare(Partner.titel(b), 'de'));
    const posVon = (nr) => PL.positionen.find((x) => x.nr === nr);
    const zeilen = () => {
      const p = partner.find((x) => x.id === plQuelle);
      if (!p) return PL.positionen.map((x) => ({ text: x.text, einheit: x.einheit, gruppe: x.gewerk || '', preis: A.ep(x), pos: { text: x.text } }));
      return [...Object.entries(p.preise || {}).map(([nr, preis]) => { const x = posVon(nr); return x && { text: x.text, einheit: x.einheit, gruppe: x.gewerk || '', preis: +preis, pos: { text: x.text, einheit: x.einheit, ep: +preis } }; }).filter(Boolean),
        ...(p.eigenePreise || []).map((x) => ({ text: x.text || 'Eigene Position', einheit: x.einheit || '', gruppe: 'Eigene Positionen', preis: +x.preis || 0, pos: { text: x.text || 'Eigene Position', einheit: x.einheit || '', ep: +x.preis || 0 } }))];
    };
    el.innerHTML = `<select class="apl-q" aria-label="Preisliste"><option value="">Allgemeine Preisliste</option>${partner.map((p) => `<option value="${esc(p.id)}" ${p.id === plQuelle ? 'selected' : ''}>${esc(Partner.titel(p))}${p.gewerk ? ' · ' + esc(p.gewerk) : ''}</option>`).join('')}</select>
      <label class="search apl-s">${icon('search')}<input type="search" placeholder="Leistung suchen …" value="${esc(plSuche)}" autocomplete="off"></label>
      <p class="hint apl-h">${plQuelle ? 'Partnerpreise ohne Zuschlag.' : 'Preise netto für den Kunden.'} Mit + übernehmen oder in die Tabelle ziehen.</p>
      <div class="apl-l"></div>`;
    const liste = $('.apl-l', el);
    const zeichnen = () => {
      const w = plSuche.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const alle = zeilen().filter((z) => !w.length || w.every((t) => `${z.text} ${z.gruppe}`.toLowerCase().includes(t)));
      const l = alle.slice(0, 300);
      let gr = null;
      liste.innerHTML = l.map((z, i) => `${z.gruppe !== gr ? `<div class="apl-g">${esc((gr = z.gruppe) || 'Ohne Gewerk')}</div>` : ''}<div class="apl-z" draggable="true" data-pi="${i}"><span class="apl-t">${esc(z.text)}<small>${esc(z.einheit || '')}${z.preis ? ' · ' + eur(z.preis) : ''}</small></span><button type="button" class="icon-btn apl-plus" data-pp="${i}" title="Ins Angebot übernehmen">${icon('plus')}</button></div>`).join('')
        + (alle.length > l.length ? `<p class="hint">${alle.length - l.length} weitere, bitte genauer suchen.</p>` : '') || '<p class="hint">Nichts gefunden.</p>';
      $$('[data-pp]', liste).forEach((b) => (b.onclick = () => tabBox?.__einfuegen?.(l[+b.dataset.pp].pos)));
      $$('[data-pi]', liste).forEach((z) => (z.ondragstart = (e) => { e.dataTransfer.setData('application/x-dom-pos', JSON.stringify(l[+z.dataset.pi].pos)); e.dataTransfer.setData('text/plain', l[+z.dataset.pi].text); e.dataTransfer.effectAllowed = 'copy'; }));
    };
    $('.apl-q', el).onchange = (e) => { plQuelle = e.target.value; plPane(el, tabBox); };
    $('.apl-s input', el).oninput = debounce((e) => { plSuche = e.target.value; zeichnen(); }, 150);
    zeichnen();
  }

  // ---------- Dateien mit der Maus hineinziehen ----------
  /** Wohin gezogene Dateien gehen: offenes Projekt/Angebot, sonst offener Kunde, sonst wie „An DOM teilen“. */
  function ziel() {
    const w = state.wohnung?.id && !state.wohnung.isNew && $('.ape, .pj-top, #wDel, .ape-top') ? state.wohnung : null;
    if (w) return { w, text: `Ablegen bei ${w.titel || 'diesem Projekt'}${w.customer ? ' · ' + w.customer : ''}`, sub: 'Fotos in den Ordner Fotos, PDFs zu den Dokumenten' };
    const k = state.kunde?.id && !state.kunde.isNew && $('#kDel') ? state.kunde : null;
    if (k) return { k, text: `Ablegen bei ${Kunden.name(k) || 'diesem Kunden'}`, sub: 'Fotos in den Ordner Fotos, PDFs als Eingangsrechnung oder Partnerangebot' };
    return { text: 'Datei hier loslassen', sub: 'Bilder und PDFs: DOM fragt, wohin (Eingangsrechnung, Angebot, Visitenkarte …)' };
  }
  let dropEl = null, dropTiefe = 0;
  const mitDateien = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragenter', (e) => {
    if (!istPc() || !mitDateien(e)) return;
    dropTiefe++;
    if (dropEl) return;
    const z = ziel();
    dropEl = document.createElement('div'); dropEl.className = 'drop-ziel';
    dropEl.innerHTML = `<div>${icon('upload')}<b>${esc(z.text)}</b><span>${esc(z.sub)}</span></div>`;
    document.body.appendChild(dropEl);
  });
  const dropWeg = () => { dropTiefe = 0; dropEl?.remove(); dropEl = null; };
  document.addEventListener('dragleave', () => { if (dropEl && --dropTiefe <= 0) dropWeg(); });
  document.addEventListener('dragover', (e) => { if (istPc() && mitDateien(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('drop', (e) => {
    if (!istPc() || !mitDateien(e)) return;
    e.preventDefault(); dropWeg();
    dateienAblegen([...e.dataTransfer.files]).catch((err) => toast('Ging nicht: ' + (err.message || err), 6000));
  });
  async function dateienAblegen(files) {
    const ok = files.filter((f) => /^image\//.test(f.type) || f.type === 'application/pdf');
    if (ok.length < files.length) toast('Nur Bilder und PDFs können abgelegt werden.', 4000);
    if (!ok.length) return;
    const z = ziel(), bilder = ok.filter((f) => /^image\//.test(f.type)), pdfs = ok.filter((f) => f.type === 'application/pdf');
    const ordnerName = () => vorgabeText('ordnerFotos', { datum: tag(Date.now()) }).trim() || 'Fotos';
    const fotosAblegen = async (kid, oid, pid) => {
      for (const [i, f] of bilder.entries()) {
        toast(`Foto ${i + 1} von ${bilder.length} wird abgelegt …`, 20000);
        await Bilder.ablegen(kid, oid, await resize(await datUrl(f), 2000, 'image/jpeg', 0.85), ordnerName(), pid, { text: f.name.replace(/\.\w+$/, '') });
      }
    };
    if (z.w) {
      const w = z.w, y = scrollY;
      await fotosAblegen(w.kundeId, w.objektId || '', w.id);
      if (pdfs.length) await dokMerken(pdfs);
      toast([bilder.length && `${bilder.length} ${bilder.length === 1 ? 'Foto' : 'Fotos'}`, pdfs.length && `${pdfs.length} ${pdfs.length === 1 ? 'Dokument' : 'Dokumente'}`].filter(Boolean).join(' und ') + ' abgelegt.', 4000);
      if (bilder.length) { aptWahl = 'bild'; try { localStorage.setItem('dom:apt', 'bild'); } catch {} }
      await Projekt.oeffnen(w.id); setTimeout(() => scrollTo(0, y), 50);
      return;
    }
    if (z.k) {
      const k = z.k;
      if (bilder.length) {
        const oid = k.objekte.length > 1 ? await Kunden.objektWaehlen(k, 'Fotos zu welchem Objekt?') : k.objekte[0]?.id || '';
        if (oid === null || oid === undefined) return;
        await fotosAblegen(k.id, oid, '');
        toast(`${bilder.length} ${bilder.length === 1 ? 'Foto' : 'Fotos'} beim Kunden abgelegt.`, 4000);
      }
      for (const f of pdfs) await Kamera.ausDatei({ data: await datUrl(f), mime: f.type, name: f.name });
      return;
    }
    for (const f of ok) await Kamera.ausDatei({ data: await datUrl(f), mime: f.type, name: f.name });
  }

  // ---------- Drucken ----------
  /** Druckt ein PDF (oder Bild) über den Druckdialog von Windows: Seiten als Bilder in ein Druckblatt, dann print(). */
  async function druckeBlob(blob) {
    toast('Druck wird vorbereitet …', 15000);
    const blatt = document.createElement('div'); blatt.id = 'druckBlatt';
    document.body.appendChild(blatt);
    try {
      if (/^image\//.test(blob.type)) blatt.innerHTML = `<img src="${await datUrl(blob)}" alt="">`;
      else {
        const tmp = document.createElement('div');
        await pdfSeiten(blob, tmp, { breite: 1240 / Math.min(window.devicePixelRatio || 1, 3) });
        blatt.innerHTML = $$('canvas', tmp).map((c) => `<img src="${c.toDataURL('image/jpeg', 0.92)}" alt="">`).join('');
      }
      $('#toast').hidden = true;
      await Promise.all($$('img', blatt).map((i) => i.decode().catch(() => {})));
      window.print();
    } catch (e) { toast('Drucken ging nicht: ' + (e.message || e), 6000); }
    finally { setTimeout(() => blatt.remove(), 1000); }
  }
  /** Knopf „Ansehen“ der aktuellen Seite (Angebot, Rechnung, Auftragsbestätigung). */
  const ansehenKnopf = () => $('.ape-akt #wSpeichern:not([disabled])') || $('#rAns') || $('#rSave') || $('#aSpeichern') || $('#wSpeichern:not([disabled])');
  const kundeOffen = () => (state.kunde?.id && !state.kunde.isNew && $('#kDel') ? state.kunde : null);
  /** Dokument der Seite als PDF zeigen und das Fenster zurückgeben (für Drucken und Ablage). */
  async function dokumentDerSeite() {
    const offen = $$('.pdfz').pop();
    if (offen?.__blob) return offen;
    const k = kundeOffen();
    if (k) { await pdfAnsicht(await kundenblatt(k), `Kundenblatt_${(Kunden.name(k) || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`); return $$('.pdfz').pop(); }
    const b = ansehenKnopf();
    if (!b) return null;
    b.click();
    return warte('.pdfz', 30000);
  }
  async function drucken() {
    const d = await dokumentDerSeite();
    if (!d) return toast('Hier gibt es nichts zu drucken. Öffne ein Angebot, eine Rechnung oder einen Kunden.', 4500);
    for (let i = 0; i < 100 && !d.__blob; i++) await pause(100);
    if (d.__blob) druckeBlob(d.__blob);
  }
  /** Kundenblatt: Stammdaten, Objekte, Angebote und Projekte auf einer Seite. */
  async function kundenblatt(k) {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;
    const zeile = (l, t) => { if (!String(t || '').trim()) return; doc.setFont('helvetica', 'bold'); doc.text(l, 20, y); doc.setFont('helvetica', 'normal'); const z = doc.splitTextToSize(String(t), 125); doc.text(z, 65, y); y += z.length * 5.5 + 1.5; };
    const titel = (t) => { y += 4; doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(t, 20, y); doc.setDrawColor(200); doc.line(20, y + 1.5, 190, y + 1.5); y += 8; doc.setFontSize(10); };
    doc.setFontSize(9); doc.setTextColor(120); doc.text(`${state.settings.company || 'DOM Projektmanagement'} · Kundenblatt · ${tag(Date.now())}`, 20, 12); doc.setTextColor(0);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text(Kunden.name(k) || 'Kunde', 20, y); y += 9; doc.setFontSize(10);
    titel('Kontakt');
    zeile('Kunden-Nr.', k.nr); zeile('Anschrift', (Kunden.postanschrift(k) || []).join('\n') || k.privat);
    zeile('Telefon', k.telefon); zeile('E-Mail', k.email);
    for (const x of k.weitere || []) zeile(x.label || (x.art === 'mail' ? 'E-Mail' : 'Telefon'), x.wert || x.nummer || x.text || '');
    zeile('Geburtstag', k.geburtstag ? tag(k.geburtstag) : ''); zeile('Quelle', k.quelle);
    if (k.notiz?.trim()) { titel('Notiz'); doc.text(doc.splitTextToSize(k.notiz, 170), 20, y); y += doc.splitTextToSize(k.notiz, 170).length * 5 + 2; }
    if (k.objekte.length) { titel('Objekte'); for (const o of k.objekte) zeile(o.name.trim() || 'Objekt', [Kunden.einzeilig(o.adresse), ...(o.kontakte || []).map((x) => [x.name, x.telefon].filter(Boolean).join(' '))].filter(Boolean).join('\n')); }
    const pk = (await projectIndex()).filter((x) => x.kundeId === k.id);
    if (pk.length) { titel('Angebote und Projekte'); for (const x of pk) { if (y > 275) { doc.addPage(); y = 20; } zeile(x.nr || '–', `${x.titel || x.room || 'Projekt'} · ${Projekt.norm(x.status) || 'Entwurf'}${x.address ? ' · ' + x.address : ''}`); } }
    return doc.output('blob');
  }

  // ---------- Kundenablage (z. B. OneDrive) ----------
  const ablageAn = () => !!window.DomDesktop?.ablegen && vorgabe('ablageAuto') !== 'nein';
  const teileFuer = (w, k) => {
    k ||= Kunden.byId(w?.kundeId);
    const werte = { kunde: [k?.nr, Kunden.name(k) || w?.customer || 'Ohne Kunde'].filter(Boolean).join(' '), projekt: w ? [w.nr, w.titel || 'Projekt'].filter(Boolean).join(' ') : '' };
    return String(vorgabe('ablageMuster') || '{kunde}/{projekt}').split(/[\\/]+/).map((t) => t.replace(/\{(\w+)\}/g, (m, n) => werte[n] ?? '').trim()).filter(Boolean);
  };
  /** Ein PDF zusätzlich in den Kundenordner legen (ohne Nachfrage). Still, wenn noch kein Ordner gewählt ist. */
  async function ablage(w, name, blob) {
    if (!ablageAn() || !blob) return;
    try {
      if (!(await window.DomDesktop.ablageOrdner())) return;
      const r = await window.DomDesktop.ablegen(teileFuer(w), name, await blob.arrayBuffer());
      if (!r?.ok) toast('Kundenordner: ' + (r?.fehler || 'ging nicht'), 5000);
    } catch (e) { console.warn('Ablage', e); }
  }
  async function ordnerWaehlen() {
    if (!window.DomDesktop?.ordnerWaehlen) return null;
    const p = await window.DomDesktop.ordnerWaehlen();
    if (p) toast(`Kundenablage: ${p}`, 4000);
    return p;
  }
  /** Menü Datei › Als PDF in den Kundenordner: das Dokument der Seite (oder das Kundenblatt) jetzt ablegen. */
  async function ablageJetzt() {
    if (!window.DomDesktop?.ablegen) return toast('Das geht nur im Windows-Programm.', 4000);
    if (!(await window.DomDesktop.ablageOrdner()) && !(await ordnerWaehlen())) return;
    const d = await dokumentDerSeite();
    if (!d) return toast('Öffne zuerst ein Angebot, eine Rechnung oder einen Kunden.', 4500);
    for (let i = 0; i < 100 && !d.__blob; i++) await pause(100);
    const w = state.wohnung?.id && !kundeOffen() ? state.wohnung : null;
    const r = await window.DomDesktop.ablegen(teileFuer(w, kundeOffen()), d.__name || 'Dokument.pdf', await d.__blob.arrayBuffer());
    if (r?.ok) toast(`Abgelegt: ${r.pfad}`, 6000, { label: 'Im Ordner zeigen', fn: () => window.DomDesktop.zeigen(r.pfad) });
    else toast('Ging nicht: ' + (r?.fehler || ''), 5000);
  }

  // ---------- Listen: Rechtsklick, Excel ----------
  async function xlsx() {
    if (window.XLSX) return window.XLSX;
    await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = ok; s.onerror = () => fail(new Error('Excel-Baustein nicht geladen')); document.head.appendChild(s); });
    return window.XLSX;
  }
  async function excelSpeichern(name, zeilen, blatt = 'Liste') {
    const X = await xlsx(), wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(zeilen.length ? zeilen : [{ Hinweis: 'keine Einträge' }]), blatt.slice(0, 31));
    const blob = new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const datei = `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    if (window.DomDesktop) return desktopSpeichern(blob, datei);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = datei; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const NAMEN = { kunden: 'Kunden', partner: 'Partner', angebote: 'Angebote', projekte: 'Projekte', rechnungenAus: 'Rechnungen', rechnungenEin: 'Eingangsrechnungen', monate: 'Auswertung' };
  const nurText = (v) => { const x = v && typeof v === 'object' ? v : { text: v ?? '' }; const t = x.text !== undefined && x.text !== '' ? x.text : x.html ? x.html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : ''; return typeof t === 'number' ? t : String(t).trim(); };
  const alsZeile = (spalten, z) => Object.fromEntries(spalten.map((c) => [c.t, nurText(z.werte[c.k])]));
  /** Wird von Tabelle.liste nach jedem Zeichnen aufgerufen. */
  function listeExtras(box, { id, spalten, reihe, oeffnen }) {
    if (!istPc() || !box.isConnected) return;
    const name = NAMEN[id] || 'Liste';
    const export_ = () => excelSpeichern(`DOM_${name}`, reihe.map((z) => alsZeile(spalten, z)), name);
    const wz = document.createElement('div'); wz.className = 'ltab-wz';
    wz.innerHTML = `<span class="muted">${reihe.length} ${reihe.length === 1 ? 'Eintrag' : 'Einträge'} · Rechtsklick auf eine Zeile für mehr</span>
      ${id === 'kunden' ? `<button type="button" class="btn secondary small" data-lximp>${icon('upload')} Aus Excel einlesen</button>` : ''}
      <button type="button" class="btn secondary small" data-lxls>${icon('download')} Als Excel speichern</button>`;
    box.prepend(wz);
    $('[data-lxls]', wz).onclick = export_;
    if ($('[data-lximp]', wz)) $('[data-lximp]', wz).onclick = kundenEinlesen;
    $$('[data-lz]', box).forEach((tr) => (tr.oncontextmenu = (e) => {
      e.preventDefault(); tr.focus();
      const z = reihe.find((x) => String(x.id) === tr.dataset.lz); if (!z) return;
      const punkte = [['Öffnen', 'eye', () => oeffnen(z.id)],
        ['Zeile kopieren (für Excel)', 'clipboard', async () => { await navigator.clipboard.writeText(spalten.map((c) => nurText(z.werte[c.k])).join('\t')); toast('Kopiert.', 2000); }]];
      if (['kunden', 'angebote', 'projekte', 'rechnungenAus'].includes(id)) punkte.push(['Als PDF ansehen', 'file', async () => { oeffnen(z.id); await pause(700); dokumentDerSeite(); }], ['Drucken', 'file', async () => { oeffnen(z.id); await pause(700); drucken(); }]);
      punkte.push(['Liste als Excel speichern', 'download', export_]);
      if (['kunden', 'partner', 'angebote', 'projekte'].includes(id)) punkte.push(['Löschen …', 'trash', async () => {
        oeffnen(z.id);
        const b = await warte('#kDel, #pDel, .ape-links #wDel, #wDel', 5000);
        b ? b.click() : toast('Löschen geht unten in der geöffneten Akte.', 4000);
      }, true]);
      kontextMenue(e.clientX, e.clientY, punkte);
    }));
  }
  function kontextMenue(x, y, punkte) {
    $$('.kmenue').forEach((m) => m.remove());
    const m = document.createElement('div'); m.className = 'kmenue'; m.setAttribute('role', 'menu');
    m.innerHTML = punkte.map(([t, ic, , rot], i) => `<button type="button" role="menuitem" data-km="${i}" class="${rot ? 'rot' : ''}">${icon(ic)}<span>${esc(t)}</span></button>`).join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    const zu = () => { m.remove(); removeEventListener('mousedown', aussen, true); removeEventListener('keydown', taste, true); };
    const aussen = (e) => { if (!m.contains(e.target)) zu(); };
    const taste = (e) => { if (e.key === 'Escape') { e.stopPropagation(); zu(); } };
    addEventListener('mousedown', aussen, true); addEventListener('keydown', taste, true);
    $$('[data-km]', m).forEach((b) => (b.onclick = () => { zu(); Promise.resolve(punkte[+b.dataset.km][2]()).catch((e) => toast('Ging nicht: ' + (e.message || e), 5000)); }));
    $('button', m)?.focus();
  }
  /** Kunden aus einer Excel-Liste übernehmen (Spalten werden am Namen erkannt). Gleiche E-Mail oder gleicher Name = schon da. */
  function kundenEinlesen() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = async () => {
      try {
        const X = await xlsx(), wb = X.read(await inp.files[0].arrayBuffer(), { type: 'array' });
        const roh = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        const sp = (r, ...re) => { const k = Object.keys(r).find((n) => re.some((x) => x.test(n.trim()))); return k ? String(r[k]).trim() : ''; };
        const da = Kunden.liste(), mailDa = new Set(da.map((k) => k.email.trim().toLowerCase()).filter(Boolean)), nameDa = new Set(da.map((k) => Kunden.name(k).toLowerCase()).filter(Boolean));
        const neu = [];
        for (const r of roh) {
          const voll = sp(r, /^name$/i, /^kunde$/i), vor = sp(r, /^vorname$/i), nach = sp(r, /^nachname$/i, /^familienname$/i);
          const k = { id: uid(), kind: 'kunde', created: Date.now(), anrede: sp(r, /^anrede$/i), vorname: vor, name: nach || (vor ? '' : voll), telefon: sp(r, /^telefon/i, /^tel/i, /^mobil/i, /^handy/i), email: sp(r, /mail/i), notiz: sp(r, /^notiz/i, /^bemerkung/i), quelle: sp(r, /^quelle$/i) };
          if (!k.vorname && !k.name && voll) { const t = voll.split(/\s+/); k.name = t.pop(); k.vorname = t.join(' '); }
          const str = sp(r, /^stra(ss|ß)e/i, /^adresse$/i, /^anschrift$/i), ort = [sp(r, /^plz$/i, /^postleitzahl$/i), sp(r, /^ort$/i, /^stadt$/i)].filter(Boolean).join(' ');
          k.privat = [str, ort].filter(Boolean).join('\n');
          const n = [k.vorname, k.name].filter(Boolean).join(' ').toLowerCase();
          if (!n && !k.email) continue;
          if ((k.email && mailDa.has(k.email.toLowerCase())) || (n && nameDa.has(n))) continue;
          mailDa.add(k.email.toLowerCase()); nameDa.add(n); neu.push(k);
        }
        const doppelt = roh.length - neu.length;
        if (!neu.length) return toast(`Keine neuen Kunden gefunden${doppelt ? ` (${doppelt} schon da oder ohne Namen)` : ''}.`, 5000);
        const ok = await sheet(`${neu.length} neue Kunden übernehmen?`, [{ label: 'Ja, übernehmen', sub: `${neu.slice(0, 4).map((k) => [k.vorname, k.name].filter(Boolean).join(' ')).join(', ')}${neu.length > 4 ? ' …' : ''}${doppelt ? ` · ${doppelt} Zeilen übersprungen (schon da oder ohne Namen)` : ''}`, icon: icon('check'), value: 'ja' }, { label: 'Abbrechen', icon: icon('x'), value: null }]);
        if (ok !== 'ja') return;
        for (const k of neu) await Kunden.speichern(k);
        window.Backup?.markChange?.();
        toast(`${neu.length} Kunden übernommen.`, 4000);
        switchTab('kunden');
      } catch (e) { toast('Einlesen ging nicht: ' + (e.message || e), 6000); }
    };
    inp.click();
  }
  /** Preisliste als Excel (Einstellungen › Preisliste). */
  async function preislisteExcel() {
    const A = window.Angebot._intern, PL = await A.preisliste();
    return excelSpeichern('DOM_Preisliste', PL.positionen.map((x) => ({ Nr: x.nr, Gewerk: x.gewerk || '', Leistung: x.text, Einheit: x.einheit || '', 'Lohn netto': x.lohn || 0, 'Material netto': x.mat || 0, 'Preis Kunde netto': Math.round(A.ep(x) * 100) / 100, Stand: x.status || '' })), 'Preisliste');
  }

  // ---------- Zuletzt geöffnet (Seitenleiste) ----------
  const ZK = 'dom:zuletzt';
  const zuletzt = () => { try { return JSON.parse(localStorage.getItem(ZK) || '[]'); } catch { return []; } };
  let zuletztAlt = '';
  function merken() {
    if (!istPc()) return;
    const w = state.wohnung, k = state.kunde, p = state.partner;
    const e = w?.id && !w.isNew && $('.ape, .ape-top, #wDel') ? { a: 'w', id: w.id, t: w.titel || 'Projekt', s: w.customer || '' }
      : k?.id && !k.isNew && $('#kDel') ? { a: 'k', id: k.id, t: Kunden.name(k) || 'Kunde', s: Kunden.ort?.(k) || '' }
      : p?.id && !p.isNew && $('#pDel') ? { a: 'p', id: p.id, t: Partner.titel(p) || 'Partner', s: p.gewerk || '' } : null;
    if (!e) return;
    const l = [e, ...zuletzt().filter((x) => !(x.a === e.a && x.id === e.id))].slice(0, Math.max(1, +vorgabe('zuletztAnzahl') || 5));
    try { localStorage.setItem(ZK, JSON.stringify(l)); } catch {}
    zuletztZeichnen();
  }
  function zuletztZeichnen() {
    const fuss = $('.tabbar .seite-fuss'); if (!fuss) return;
    let box = $('.tabbar .seite-zul');
    const l = istPc() ? zuletzt() : [];
    const sig = JSON.stringify(l);
    if (box && sig === zuletztAlt) return;
    zuletztAlt = sig;
    if (!l.length) { box?.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'seite-zul nur-breit'; fuss.before(box); }
    const ic = { w: 'file', k: 'user', p: 'wrench' };
    box.innerHTML = `<small>Zuletzt geöffnet</small>${l.map((x, i) => `<button type="button" data-zul="${i}" title="${esc([x.t, x.s].filter(Boolean).join(' · '))}">${icon(ic[x.a])}<span>${esc(x.t)}${x.s ? `<i>${esc(x.s)}</i>` : ''}</span></button>`).join('')}`;
    $$('[data-zul]', box).forEach((b) => (b.onclick = () => {
      const x = l[+b.dataset.zul];
      if (x.a === 'w') Projekt.oeffnen(x.id); else if (x.a === 'k') Kunden.oeffnen(x.id); else Partner.oeffnen(x.id);
      window.scrollTo(0, 0);
    }));
  }
  const mainBeob = new MutationObserver(debounce(merken, 400));
  addEventListener('DOMContentLoaded', () => { const m = $('#main'); if (m) mainBeob.observe(m, { childList: true }); setTimeout(zuletztZeichnen, 500); });

  // ---------- Rundmail und Serienbrief ----------
  function gruppen() {
    const pf = (x, art) => !!x.pflege?.[art]?.r;
    return [
      ['kunden', 'Alle Kunden', (x, t) => t === 'k'],
      ['kAngebot', 'Kunden mit offenem Angebot', (x, t, ph) => t === 'k' && ph.get(x.id)?.has('angebot')],
      ['kProjekt', 'Kunden mit laufendem Projekt', (x, t, ph) => t === 'k' && ['einplanen', 'eingeplant', 'laufend'].some((p) => ph.get(x.id)?.has(p))],
      ['partner', 'Alle Partner', (x, t) => t === 'p'],
      ['sub', 'Subunternehmer', (x, t) => t === 'p' && x.art === 'sub'],
      ['lief', 'Lieferanten', (x, t) => t === 'p' && x.art === 'lief'],
      ['anruf', `Alle mit „${vorgabe('pflegeNameAnruf') || 'Regelmäßig anrufen'}“`, (x) => pf(x, 'anruf')],
      ['treffen', `Alle mit „${vorgabe('pflegeNameTreffen') || 'Treffen vereinbaren'}“`, (x) => pf(x, 'essen')],
    ];
  }
  async function rundmail() {
    const idx = await projectIndex(), ph = new Map();
    for (const x of idx) { if (Projekt.norm(x.status) === 'abgesagt') continue; if (!ph.has(x.kundeId)) ph.set(x.kundeId, new Set()); ph.get(x.kundeId).add(Projekt.phase(x)); }
    const leute = [...Kunden.liste().map((x) => ({ t: 'k', x, name: Kunden.name(x) || 'Ohne Namen', mail: x.email.trim(), sub: Kunden.ort?.(x) || '' })),
      ...(window.Partner?.liste() || []).map((x) => ({ t: 'p', x, name: Partner.titel(x) || 'Ohne Namen', mail: String(x.email || '').trim(), sub: x.gewerk || '' }))];
    const G = gruppen();
    let wahl = new Set(['kunden']);
    const an = new Set();
    const bg = document.createElement('div'); bg.className = 'sheet-bg rm-bg';
    bg.innerHTML = `<div class="sheet rm" role="dialog" aria-label="Rundmail oder Serienbrief"><div class="sheet-h"><b>Rundmail oder Serienbrief</b><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
      <div class="rm-in"><p class="hint" style="margin-top:0">Gruppen wählen, Empfänger prüfen, dann als Mail (alle in BCC, keiner sieht die anderen) oder als Excel für den Serienbrief in Word.</p>
      <div class="chips rm-g">${G.map(([id, n]) => `<button type="button" class="qchip" data-rg="${id}">${esc(n)}</button>`).join('')}</div>
      <div class="rm-kopf"><b data-rn></b><button type="button" class="link-add" data-ralle>Alle an</button><button type="button" class="link-add" data-rkeine>Alle aus</button></div>
      <div class="rm-l"></div>
      <label for="rmBetreff">Betreff</label><input type="text" id="rmBetreff" value="${esc(vorgabeText('rundmailBetreff') || '')}" autocomplete="off">
      <label for="rmText">Text</label><textarea id="rmText" rows="5" data-frei>${esc(vorgabeText('rundmailText', { absender: Kalender.team?.().find((p) => p.id === Kalender.wer())?.name || '', firma: state.settings.company || '' }) || '')}</textarea>
      <div class="rm-akt"><button type="button" class="btn" data-rmail>${icon('mail')} Mail schreiben</button><button type="button" class="btn secondary" data-rxls>${icon('download')} Excel für Serienbrief</button><button type="button" class="btn secondary" data-rkop>${icon('clipboard')} Adressen kopieren</button></div></div></div>`;
    document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('on'));
    const zu = () => { bg.classList.remove('on'); setTimeout(() => bg.remove(), 180); };
    bg.onclick = (e) => { if (e.target === bg || e.target.closest('[data-x]')) zu(); };
    const inGruppe = (p) => G.some(([id, , f]) => wahl.has(id) && f(p.x, p.t, ph));
    const zeichnen = (neuWaehlen) => {
      $$('[data-rg]', bg).forEach((b) => b.classList.toggle('on', wahl.has(b.dataset.rg)));
      const l = leute.filter(inGruppe).sort((a, b) => a.name.localeCompare(b.name, 'de'));
      if (neuWaehlen) { an.clear(); l.filter((p) => p.mail).forEach((p) => an.add(p)); }
      $('.rm-l', bg).innerHTML = l.map((p, i) => `<label class="chk rm-z ${p.mail ? '' : 'leer'}"><input type="checkbox" data-ri="${i}" ${an.has(p) ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(p.mail || 'keine E-Mail')}${p.sub ? ' · ' + esc(p.sub) : ''}</small></span></label>`).join('') || '<p class="hint">Niemand in dieser Auswahl.</p>';
      $$('[data-ri]', bg).forEach((c) => (c.onchange = () => { const p = l[+c.dataset.ri]; c.checked ? an.add(p) : an.delete(p); zahl(); }));
      bg.__l = l; zahl();
    };
    const zahl = () => { const m = [...an].filter((p) => p.mail).length; $('[data-rn]', bg).textContent = `${an.size} ausgewählt${an.size !== m ? `, ${m} mit E-Mail` : ''}`; };
    $$('[data-rg]', bg).forEach((b) => (b.onclick = () => { wahl.has(b.dataset.rg) ? wahl.delete(b.dataset.rg) : wahl.add(b.dataset.rg); zeichnen(true); }));
    $('[data-ralle]', bg).onclick = () => { bg.__l.forEach((p) => an.add(p)); zeichnen(); };
    $('[data-rkeine]', bg).onclick = () => { an.clear(); zeichnen(); };
    const mails = () => [...new Set([...an].map((p) => p.mail).filter(Boolean))];
    $('[data-rkop]', bg).onclick = async () => { const m = mails(); if (!m.length) return toast('Keine E-Mail-Adressen ausgewählt.'); await navigator.clipboard.writeText(m.join('; ')); toast(`${m.length} Adressen kopiert. In Outlook ins Feld BCC einfügen (Strg+V).`, 5000); };
    $('[data-rmail]', bg).onclick = async () => {
      const m = mails(); if (!m.length) return toast('Keine E-Mail-Adressen ausgewählt.');
      const eigen = state.settings.email || window.Angebot?._intern.einstellungen?.()?.email || '';
      const q = (bcc) => [bcc && 'bcc=' + encodeURIComponent(bcc), 'subject=' + encodeURIComponent($('#rmBetreff', bg).value), 'body=' + encodeURIComponent($('#rmText', bg).value)].filter(Boolean).join('&');
      let url = `mailto:${encodeURIComponent(eigen).replace(/%40/g, '@')}?${q(m.join(','))}`;
      if (url.length > 1900) { await navigator.clipboard.writeText(m.join('; ')).catch(() => {}); url = `mailto:${encodeURIComponent(eigen).replace(/%40/g, '@')}?${q('')}`; toast(`Die Liste ist zu lang für einen Klick: ${m.length} Adressen sind kopiert, bitte in der Mail ins Feld BCC einfügen (Strg+V).`, 12000); }
      const a = document.createElement('a'); a.href = url; a.click();
    };
    $('[data-rxls]', bg).onclick = () => {
      const l = [...an]; if (!l.length) return toast('Niemand ausgewählt.');
      excelSpeichern('DOM_Serienbrief', l.map((p) => {
        const z = p.t === 'k' ? (Kunden.postanschrift(p.x) || []) : [p.name, ...String(p.x.adresse || p.x.anschrift || '').split('\n')].filter(Boolean);
        const plzOrt = z.find((s) => /^\d{5}\s/.test(s)) || '';
        return { Name: p.name, Briefanrede: p.t === 'k' ? Kunden.briefAnrede(p.x) : `Sehr geehrte Damen und Herren,`, Anrede: p.t === 'k' ? p.x.anrede : '', Vorname: p.t === 'k' ? p.x.vorname : '', Nachname: p.t === 'k' ? p.x.name : p.x.inhaber || '',
          Firma: p.t === 'p' ? p.name : '', Straße: z.filter((s) => s !== plzOrt).slice(1).join(', '), PLZ: plzOrt.slice(0, 5), Ort: plzOrt.slice(6), 'E-Mail': p.mail, Telefon: p.x.telefon || '', Gruppe: p.t === 'k' ? 'Kunde' : 'Partner' };
      }), 'Serienbrief');
    };
    zeichnen(true);
  }

  // ---------- Akte Kunde und Partner wie in einem CRM (Wunsch Felix 15.11.: „nicht mehr wie iPhone und iPad“) ----------
  // Links die Stammdaten als Formular (Bezeichnung links, Feld rechts), rechts Registerkarten für alles, was dazugehört.
  // Baut nur die fertige Seite um (dieselben Felder und Knöpfe), damit iPhone und iPad unverändert bleiben.
  const regWahl = { k: 'ap', p: 'kond' };
  function akte() {
    const m = $('#main');
    if (!istPc() || !m || $(':scope > .akte', m)) return;
    const act = $(':scope > .kd-actions', m), form = act?.nextElementSibling;
    if (!act || !form?.matches('.kform')) return;
    const typ = $('#kVorname', form) ? 'k' : $('#pFirma', form) ? 'p' : null;
    if (!typ) return;
    const x = typ === 'k' ? state.kunde : state.partner;
    const rest = [...m.children].filter((c) => c !== act && c !== form);
    const gruppen = typ === 'k'
      ? [['ap', 'Angebote und Projekte'], ['obj', $('#oVorOrt', m) ? 'Vor Ort' : 'Objekte'], ['re', 'Rechnungen'], ['pf', 'Kontakt halten']]
      : [['kond', 'Konditionen und Verträge'], ['pers', 'Persönliches'], ['re', 'Rechnungen'], ['pf', 'Kontakt halten']];
    const inhalt = Object.fromEntries(gruppen.map(([id]) => [id, []]));
    const stamm = [];
    let akt = gruppen[0][0];
    for (const c of rest) {
      const h = c.matches('.sec-h') ? $('h2', c)?.textContent || '' : '';
      if (c.matches('#kDel, #pDel, #kAusKontakt, #kInKontakte')) { stamm.push(c); continue; }
      if (c.matches('#kPflege, #pPflege')) { inhalt.pf.push(c); continue; }
      if (c.matches('#kRech')) { c.hidden = true; stamm.push(c); continue; } // ersetzt durch die Karte „Rechnungen“
      if (c.matches('#pBelege')) { inhalt.re.push(c); continue; }
      if (typ === 'k') {
        if (c.matches('#kHist, #kProj') || /Telefon/.test(h)) akt = 'ap';
        else if (/Objekte/.test(h) || c.querySelector?.('#oVorOrt') || c.matches('#oAdd, .olist')) akt = 'obj';
      } else if (h) akt = /Geburtstag|Persönlich/.test(h) ? 'pers' : 'kond';
      if (h) c.classList.add('akte-weg');
      inhalt[akt].push(c);
    }
    const box = document.createElement('div'); box.className = 'akte';
    box.innerHTML = `<div class="akte-kopf"></div><div class="akte-leib"><section class="akte-stamm"><div class="akte-h"><b>Stammdaten</b></div></section>
      <section class="akte-reg"><div class="akte-tabs">${gruppen.map(([id, n]) => `<button type="button" data-areg="${id}">${esc(n)}</button>`).join('')}</div>${gruppen.map(([id]) => `<div class="akte-pane" data-apane="${id}" hidden></div>`).join('')}</section></div>`;
    m.prepend(box);
    $('.akte-kopf', box).append(act);
    $('.akte-stamm', box).append(form, ...stamm);
    for (const [id] of gruppen) $(`[data-apane="${id}"]`, box).append(...inhalt[id]);
    if (x?.isNew) { $('.akte-reg', box).hidden = true; box.classList.add('neu'); return; }
    const zeig = (id) => {
      regWahl[typ] = id;
      $$('[data-areg]', box).forEach((b) => b.classList.toggle('on', b.dataset.areg === id));
      $$('[data-apane]', box).forEach((p) => (p.hidden = p.dataset.apane !== id));
      if (typ === 'k' && id === 're') kundenRechnungen($('[data-apane="re"]', box), x).catch((e) => console.warn(e));
    };
    $$('[data-areg]', box).forEach((b) => (b.onclick = () => zeig(b.dataset.areg)));
    zeig(regWahl[typ]);
  }
  async function kundenRechnungen(el, k) {
    if (!window.Rechnung) return;
    const idx = (await projectIndex()).filter((x) => x.kundeId === k.id), ids = new Set(idx.map((x) => x.id));
    const l = Rechnung.liste().filter((r) => ids.has(r.projektId)).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    if (!l.length) { el.innerHTML = '<p class="empty">Noch keine Rechnung an diesen Kunden.</p>'; return; }
    const offen = l.filter(Rechnung.istOffen).reduce((s, r) => s + Rechnung.zahlbetrag(r), 0);
    el.innerHTML = `<p class="akte-sum">${l.length} ${l.length === 1 ? 'Rechnung' : 'Rechnungen'}${offen ? ` · <b class="rot">offen ${eur(offen)}</b>` : ' · alles bezahlt'}</p><div data-krt></div>`;
    window.Tabelle.liste($('[data-krt]', el), { id: 'kundeRechnungen', oeffnen: (id) => Rechnung.detail(l.find((r) => r.id === id), () => Kunden.oeffnen(k.id)),
      spalten: [{ k: 'nr', t: 'Nr.', b: 120 }, { k: 'datum', t: 'Datum', b: 100 }, { k: 'art', t: 'Art' }, { k: 'prj', t: 'Projekt' }, { k: 'betrag', t: 'Betrag', r: 1, b: 120 }, { k: 'st', t: 'Stand', b: 120 }],
      zeilen: l.map((r) => { const st = Rechnung.standVon(r), w = idx.find((x) => x.id === r.projektId); return { id: r.id, werte: { nr: r.nr || 'Entwurf', datum: { text: tag(r.datum), sort: r.datum || '' }, art: Rechnung.artName?.(r) || '', prj: w?.titel || '',
        betrag: { text: eur(Rechnung.zahlbetrag(r)), sort: Rechnung.zahlbetrag(r) }, st: { text: st[0], html: `<span style="color:${st[1]};font-weight:600">${esc(st[0])}</span>` } } }; }) });
  }
  const akteBeob = new MutationObserver(() => akte());
  addEventListener('DOMContentLoaded', () => { const m = $('#main'); if (m) akteBeob.observe(m, { childList: true }); });

  // ---------- Start: Druck-Knopf oben, eigenes Fenster (z. B. Kalender) ----------
  addEventListener('DOMContentLoaded', () => {
    const cal = $('#calBtn');
    if (cal && window.DomDesktop) {
      const b = document.createElement('button'); b.className = 'calbtn nur-pc'; b.id = 'druckBtn'; b.setAttribute('aria-label', 'Drucken'); b.title = 'Drucken (Strg+P)';
      b.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/></svg>';
      b.onclick = () => drucken();
      cal.before(b);
    }
  });
  const anker = /^#seite=([a-z]+)$/.exec(location.hash);
  if (anker) addEventListener('load', () => setTimeout(() => { try { desktopBefehl(anker[1]); } catch {} history.replaceState(null, '', location.pathname); }, 1500));

  return { angebotSeite, drucken, druckeBlob, kundenblatt, ablage, ablageJetzt, ordnerWaehlen, listeExtras, kontextMenue, excelSpeichern, preislisteExcel, rundmail, dateienAblegen, zuletztZeichnen };
})();
