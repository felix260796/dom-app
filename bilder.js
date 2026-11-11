'use strict';
/* DOM – Bilder & Dokumentation je Objekt eines Kunden (unabhängig von der KI).
 * Eigene, benennbare Ordner (Vorgabe: Bestand, Baufortschritt, Abnahme, Sonstiges; z. B. „Baufortschritt (10.11.2026)“).
 * Jedes Bild gehört zum Objekt und optional zu einem Projekt („Badumbau“). Im Objekt sieht man alle Bilder,
 * im Projekt dieselben Ordner, vorgefiltert auf das Projekt. Dazu die Fotos und Visualisierungen aus den Räumen.
 * Speicher: 'bilder:<kundeId>:<objektId>' { ordner:[{ id, name, projektId }] (eigene Ordner gehören zu einem Projekt), bilder:[{ id, t, ordner, projektId, text, thumb }] }
 * und jedes Bild einzeln als 'bild:<id>' (verkleinert), damit der Cloud-Abgleich nur Neues überträgt.
 * Ältere Einträge (nur eine Liste mit „phase“) werden beim Lesen umgestellt.
 * Seit Version 85: „Alle Bilder“ (nach Datum, alles am Stück durchsehen), Bilder markieren und als PDF,
 * große Ansicht zum Durchwischen, „Fotos machen“ nimmt mehrere Fotos hintereinander auf (Kamera.serie).
 * Zeichnen (zeichnen.js, Stift oder Finger): in der großen Ansicht auf einem Foto oder Plan markieren; das Original
 * bleibt, die Zeichnung liegt als neues Bild daneben (b.zeichnung = { von: Original-ID, striche }) und lässt sich
 * weiterzeichnen. „Skizze zeichnen“ legt ein leeres Blatt in den Ordner aus Vorgabe `ordnerSkizzen`. */
window.Bilder = (() => {
  const STANDARD = [['bestand', 'Bestand'], ['bau', 'Baufortschritt'], ['abnahme', 'Abnahme'], ['sonst', 'Sonstiges']];
  const listKey = (kid, oid) => `bilder:${kid}:${oid || 'ohne'}`;
  async function laden(kid, oid) {
    let d = await kvGet(listKey(kid, oid));
    if (Array.isArray(d)) d = { bilder: d };
    d = d || {};
    // Startet leer: nur eigene Ordner (früher vorgegebene Ordner bleiben nur, wenn Bilder darin liegen)
    d.ordner = (Array.isArray(d.ordner) ? d.ordner : []).filter((o) => !STANDARD.some((s) => s[0] === o.id) || (d.bilder || []).some((b) => (b.ordner || b.phase) === o.id));
    for (const o of d.ordner) o.projektId ??= '';
    d.bilder = (d.bilder || []).map((b) => ({ ...b, ordner: b.ordner || b.phase || 'sonst', projektId: b.projektId || '' }));
    for (const b of d.bilder) if (!d.ordner.some((o) => o.id === b.ordner)) d.ordner.push({ id: b.ordner, name: (STANDARD.find((s) => s[0] === b.ordner) || [, 'Sonstiges'])[1] });
    return d;
  }
  const speichern = (kid, oid, d) => kvSet(listKey(kid, oid), { ordner: d.ordner, bilder: d.bilder.map(({ phase, ...b }) => b) });
  const tag = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const anzahl = async (kid, oid, pid) => (await laden(kid, oid)).bilder.filter((b) => !pid || b.projektId === pid).length;

  /** Projekte am Objekt (für Zuordnung und Gruppierung). */
  async function projekte(kid, oid) {
    return (await projectIndex()).filter((x) => x.kundeId === kid && (x.objektId || '') === (oid || ''))
      .map((x) => ({ id: x.id, name: x.titel || x.room || 'Projekt', nr: x.nr || '' }));
  }
  /** Fotos und Visualisierungen aus den Räumen (nur des Projekts, wenn pid gesetzt). */
  async function raumBilder(kid, oid, pid) {
    const out = [];
    for (const x of await projekte(kid, oid)) {
      if (pid && x.id !== pid) continue;
      const w = state.wohnung?.id === x.id ? state.wohnung : await kvGet('wohnung:' + x.id);
      if (!w) continue;
      for (const r of await Projekt.raeume(w)) {
        const rn = r.room || roomType(r.roomType).name;
        r.photos.forEach((ph, i) => out.push({ data: ph, label: `${x.name} · ${rn} · Foto ${i + 1}` }));
        for (const pkg of roomPackages(r)) {
          (r.results?.[pkg.id] || []).forEach((im) => im && out.push({ data: im, label: `${x.name} · ${rn} · ${pkg.name}` }));
          if (topOf(r, pkg.id)) out.push({ data: topOf(r, pkg.id), label: `${x.name} · ${rn} · ${pkg.name} Draufsicht` });
        }
      }
    }
    return out;
  }

  // ---------- Übersicht ----------
  // Im Projekt: direkt die Ordner dieses Projekts (Bestand, Baufortschritt, … und eigene).
  // Im Objekt: zuerst die Projekte (Badumbau, Wohnzimmer …), darin die Ordner. Ohne Projekte gleich die Ordner.
  /** ctx = { kundeId, objektId, projektId?, titel, zurueck: { label, fn } }; projektId '__ohne' = Bilder ohne Projekt */
  const OHNE = '__ohne';
  const passt = (b, pid) => !pid || (pid === OHNE ? !b.projektId : b.projektId === pid);
  const ordnerFuer = (d, pid) => d.ordner.filter((o) => !o.projektId || !pid || o.projektId === pid || d.bilder.some((b) => b.ordner === o.id && passt(b, pid)));
  const deckel = (l) => `<span class="f-cov">${l.slice(0, 4).map((b) => `<img src="${b.thumb}" alt="">`).join('') || `<span class="f-empty">${icon('image')}</span>`}</span>`;
  async function view(ctx) {
    state.project = null;
    const { kundeId: kid, objektId: oid } = ctx;
    const d = await laden(kid, oid);
    const pr = await projekte(kid, oid);
    if (!ctx.projektId && pr.length) return projekteView(ctx, d, pr);
    const pid = ctx.projektId || '';
    const rb = await raumBilder(kid, oid, pid === OHNE ? '__keins' : pid);
    header('Bilder & Dokumentation', ctx.titel || '', ctx.zurueck);
    const imOrdner = (o) => d.bilder.filter((b) => b.ordner === o.id && passt(b, pid)).sort((a, b) => b.t - a.t);
    const ord = ordnerFuer(d, pid);
    const nAlle = d.bilder.filter((b) => passt(b, pid)).length;
    main().innerHTML = `
      <div class="row galle">
        <button class="btn big" id="gSerie" style="flex:1">${icon('camera')} Fotos machen</button>
        <button class="btn big secondary" id="gAlle" style="flex:1" ${nAlle ? '' : 'disabled'}>${icon('image')} Alle Bilder${nAlle ? ` (${nAlle})` : ''}</button>
      </div>
      <p class="hint" style="margin:6px 0 0">„Fotos machen“ nimmt mehrere Fotos hintereinander auf und legt sie in „${esc(fotoOrdner())}“.</p>
      <button type="button" class="link-add" id="gSkizze" style="margin-top:8px">${icon('edit')} Skizze zeichnen</button>
      <div class="sec-h"><h2>Ordner</h2><span class="count">${ord.length}</span></div>
      <div class="fgrid">${ord.map((o) => { const l = imOrdner(o); return `
        <button class="fold" data-o="${o.id}">${deckel(l)}
          <b>${esc(o.name)}</b><span>${l.length} ${l.length === 1 ? 'Bild' : 'Bilder'}${l.length ? ' · ' + tag(l[0].t) : ''}</span>
        </button>`; }).join('')}
        <button class="fold add" id="fNeu"><span class="f-cov"><span class="f-empty">${icon('plus')}</span></span><b>Neuer Ordner</b><span>Name frei wählbar</span></button>
      </div>
      ${rb.length ? `<details class="more card" style="margin-top:16px"><summary>${icon('sparkle')}<span>Aus den Räumen<small>${rb.length} Fotos und Visualisierungen</small></span>${icon('chevron', 'more-chev')}</summary>
        <div class="ggrid" style="margin-top:8px">${rb.map((x, i) => `<button class="gb" data-rb="${i}"><img src="${x.data}" alt="" loading="lazy"></button>`).join('')}</div></details>` : ''}`;
    $$('[data-o]').forEach((b) => (b.onclick = () => { ordnerView(ctx, b.dataset.o); window.scrollTo(0, 0); }));
    $('#gAlle').onclick = () => { alleView(ctx); window.scrollTo(0, 0); };
    $('#gSerie').onclick = async () => { const n = await fotosMachen({ kundeId: kid, objektId: oid, projektId: pid && pid !== OHNE ? pid : '' }); if (n) view(ctx); };
    $('#gSkizze').onclick = async () => {
      const name = vorgabe('ordnerSkizzen') || 'Skizzen';
      const r = await Zeichnen.oeffnen(null, { titel: 'Skizze', onSave: (striche, bild) => ablegen(kid, oid, bild, name, pid && pid !== OHNE ? pid : '', { zeichnung: { von: '', striche } }) });
      if (r) { toast(`Skizze in „${name}“ gespeichert`, 3500); view(ctx); }
    };
    $('#fNeu').onclick = async () => {
      const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const v = await sheet('Neuer Ordner', [], { text: `Name, z. B. Besichtigung (${heute})` });
      if (!v?.text?.trim()) return;
      const nm = v.text.trim();
      const dd = await laden(kid, oid);
      const o = { id: uid(), name: nm, projektId: pid && pid !== OHNE ? pid : '' }; // eigene Ordner gehören zum Projekt
      dd.ordner.push(o); await speichern(kid, oid, dd);
      ordnerView(ctx, o.id); window.scrollTo(0, 0);
    };
    $$('[data-rb]').forEach((b) => (b.onclick = () => gross(ctx, rb.map((x) => ({ data: x.data, label: x.label })), +b.dataset.rb, () => view(ctx))));
  }

  /** Objekt-Ebene: ein Ordner je Projekt. */
  function projekteView(ctx, d, pr) {
    header('Bilder & Dokumentation', ctx.titel || '', ctx.zurueck);
    const kacheln = [...pr.map((p) => ({ id: p.id, name: p.name, nr: p.nr })), { id: OHNE, name: 'Ohne Projekt', nr: '', frei: true }];
    main().innerHTML = `
      <button class="btn big secondary block" id="gAlle" ${d.bilder.length ? '' : 'disabled'}>${icon('image')} Alle Bilder${d.bilder.length ? ` (${d.bilder.length})` : ''}</button>
      <p class="hint" style="margin:6px 0 0">Alle Bilder dieses Objekts nach Datum, zum schnellen Durchsehen.</p>
      <div class="sec-h"><h2>Projekte</h2><span class="count">${kacheln.length}</span></div>
      <p class="hint" style="margin-top:-4px">Die Bilder liegen beim jeweiligen Projekt, darin deine eigenen Ordner.</p>
      <div class="fgrid">${kacheln.map((p) => { const l = d.bilder.filter((b) => passt(b, p.id)).sort((a, b) => b.t - a.t); return `
        <button class="fold ${p.frei && !l.length ? 'add' : ''}" data-pp="${p.id}">${p.frei && !l.length ? `<span class="f-cov"><span class="f-empty">${icon('plus')}</span></span>` : deckel(l)}
          <b>${esc(p.frei && !l.length ? 'Bilder ohne Projekt' : p.name)}</b><span>${p.frei && !l.length ? 'z. B. Besichtigung, Schäden, Zähler' : `${l.length} ${l.length === 1 ? 'Bild' : 'Bilder'}${p.nr ? ' · ' + esc(p.nr) : ''}`}</span>
        </button>`; }).join('')}</div>`;
    $('#gAlle').onclick = () => { alleView({ ...ctx, zurueckAlle: () => view(ctx) }); window.scrollTo(0, 0); };
    $$('[data-pp]').forEach((b) => (b.onclick = () => {
      const p = kacheln.find((x) => x.id === b.dataset.pp);
      view({ ...ctx, projektId: p.id, titel: [p.name, ctx.titel].filter(Boolean).join(' · '), zurueck: { label: 'Projekte', fn: () => { view(ctx); window.scrollTo(0, 0); } } });
      window.scrollTo(0, 0);
    }));
  }

  // ---------- Ein Ordner ----------
  async function ordnerView(ctx, ordnerId) {
    const { kundeId: kid, objektId: oid } = ctx;
    const pid = ctx.projektId || '';
    const d = await laden(kid, oid);
    const o = d.ordner.find((x) => x.id === ordnerId);
    if (!o) return view(ctx);
    const pr = await projekte(kid, oid);
    const list = d.bilder.filter((b) => b.ordner === o.id && passt(b, pid)).sort((a, b) => b.t - a.t);
    const zurueck = () => { view(ctx); window.scrollTo(0, 0); };
    header(o.name, ctx.titel || '', { label: 'Ordner', fn: zurueck });
    main().innerHTML = `
      <div class="card gadd">
        <div class="row">
          <button class="btn big" id="gCam" style="flex:1">${icon('camera')} Fotos machen</button>
          <button class="btn big secondary" id="gGal" style="flex:1">${icon('image')} Aus Fotos</button>
        </div>
        <p class="hint" style="margin-bottom:0">„Fotos machen“ nimmt mehrere Fotos hintereinander auf. Bilder werden verkleinert gespeichert.</p>
      </div>
      <div id="gRaster"></div>
      ${!list.length ? `<div class="empty-state">${icon('camera')}<b>Noch keine Bilder</b><span>Fotos machen oder aus der Mediathek wählen.</span></div>` : ''}
      <div class="row" style="margin-top:18px"><button class="btn secondary small" id="fRen">${icon('edit')} Umbenennen</button>
        ${d.bilder.some((b) => b.ordner === o.id) ? '' : `<button class="btn danger small" id="fDel">${icon('trash')} Ordner löschen</button>`}</div>`;
    const again = () => { const y = window.scrollY; ordnerView(ctx, o.id).then(() => window.scrollTo(0, y)); };
    const add = async (camera) => {
      const files = await pickFiles({ camera, multiple: !camera });
      if (!files.length) return;
      const dd = await laden(kid, oid);
      let n = 0;
      for (const f of files) {
        try {
          const data = await resize(await fileToDataUrl(f), 1600, 'image/jpeg', 0.8);
          const id = uid();
          await kvSet('bild:' + id, data);
          dd.bilder.push({ id, t: f.lastModified && !camera ? f.lastModified : Date.now(), ordner: o.id, projektId: pid && pid !== OHNE ? pid : '', text: '', thumb: await resize(data, 320, 'image/jpeg', 0.7) });
          n++;
          if (files.length > 3) toast(`Speichere ${n} von ${files.length} …`, 4000);
        } catch (e) { console.error(e); }
      }
      await speichern(kid, oid, dd);
      toast(`${n} ${n === 1 ? 'Bild' : 'Bilder'} in „${o.name}“ gespeichert`);
      again();
    };
    $('#gCam').onclick = async () => { const n = await fotosMachen({ kundeId: kid, objektId: oid, projektId: pid && pid !== OHNE ? pid : '', ordnerId: o.id }); if (n) again(); };
    $('#gGal').onclick = () => add(false);
    raster($('#gRaster'), ctx, list, { ordner: d.ordner, pr, nachher: again, pdfTitel: o.name });
    $('#fRen').onclick = async () => {
      const v = await sheet('Ordner umbenennen', [], { text: 'Name des Ordners', value: o.name });
      if (!v?.text) return;
      const dd = await laden(kid, oid); dd.ordner.find((x) => x.id === o.id).name = v.text; await speichern(kid, oid, dd); again();
    };
    if ($('#fDel')) $('#fDel').onclick = async () => {
      if (!loeschFrage(`Ordner „${o.name}“ löschen?`)) return;
      const dd = await laden(kid, oid); dd.ordner = dd.ordner.filter((x) => x.id !== o.id); await speichern(kid, oid, dd); zurueck();
    };
  }

  // ---------- Alle Bilder nach Datum ----------
  let alleReihe = 'neu';
  /** Alle Bilder des Objekts (oder des Projekts) am Stück, nach Aufnahmedatum, mit Tagesüberschriften. */
  async function alleView(ctx) {
    const { kundeId: kid, objektId: oid } = ctx;
    const pid = ctx.projektId || '';
    const d = await laden(kid, oid);
    const pr = await projekte(kid, oid);
    const list = d.bilder.filter((b) => passt(b, pid)).sort((a, b) => (alleReihe === 'neu' ? b.t - a.t : a.t - b.t));
    const zurueck = () => { (ctx.zurueckAlle || (() => view(ctx)))(); window.scrollTo(0, 0); };
    header('Alle Bilder', ctx.titel || '', { label: 'Bilder', fn: zurueck });
    main().innerHTML = `
      <div class="seg2 full galle-r">${[['neu', 'Neueste zuerst'], ['alt', 'Älteste zuerst']].map(([id, n]) => `<button data-ar="${id}" class="${alleReihe === id ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="gRaster"></div>
      ${!list.length ? `<div class="empty-state">${icon('image')}<b>Noch keine Bilder</b><span>Bilder kommen über „Fotos machen“ oder in einem Ordner dazu.</span></div>` : ''}`;
    $$('[data-ar]').forEach((b) => (b.onclick = () => { alleReihe = b.dataset.ar; alleView(ctx); }));
    const again = () => { const y = window.scrollY; alleView(ctx).then(() => window.scrollTo(0, y)); };
    raster($('#gRaster'), ctx, list, { ordner: d.ordner, pr, nachher: again, tage: true, pdfTitel: 'Alle Bilder' });
  }

  /** Bilder-Raster mit „Auswählen“ (markieren) und „PDF“. Tippen öffnet die große Ansicht, im Auswahl-Modus markiert es.
   * opt: { ordner, pr, nachher, tage (Überschrift je Tag), pdfTitel } */
  function raster(el, ctx, list, opt) {
    if (!el || !list.length) return;
    let wahl = null; // null = normal, Set = Auswahl-Modus
    el.style.setProperty('--kopf', (document.querySelector('.topbar')?.offsetHeight || 0) + 'px'); // Leiste „Markieren“ bleibt unter der Kopfzeile stehen
    const ordnerName = Object.fromEntries(opt.ordner.map((o) => [o.id, o.name]));
    const zeichne = () => {
      let tagVor = '';
      const kacheln = list.map((b) => {
        const t = tag(b.t), kopf = opt.tage && t !== tagVor ? `<h3 class="gtag">${esc(new Date(b.t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }))}</h3>` : '';
        tagVor = t;
        return `${kopf}<button class="gb ${wahl?.has(b.id) ? 'wahl' : ''}" data-b="${b.id}"><img src="${b.thumb}" alt="" loading="lazy">${b.text ? '<i class="gb-t"></i>' : ''}${wahl ? `<i class="gb-w">${wahl.has(b.id) ? icon('check') : ''}</i>` : ''}</button>`;
      }).join('');
      el.innerHTML = `<div class="gwahl">${wahl
        ? `<b>${wahl.size} markiert</b><button class="btn small secondary" data-gw="alle">${wahl.size === list.length ? 'Keine' : 'Alle'}</button><button class="btn small" data-gw="pdf" ${wahl.size ? '' : 'disabled'}>${icon('file')} PDF erstellen</button><button class="btn small secondary" data-gw="aus">Fertig</button>`
        : `<span class="muted">${list.length} ${list.length === 1 ? 'Bild' : 'Bilder'}</span><button class="btn small secondary" data-gw="an">${icon('check')} Markieren</button><button class="btn small secondary" data-gw="pdfalle">${icon('file')} PDF aus allen</button>`}</div>
        <div class="ggrid ${opt.tage ? 'mit-tag' : ''}">${kacheln}</div>`;
      $$('[data-b]', el).forEach((k) => (k.onclick = () => {
        if (wahl) { wahl.has(k.dataset.b) ? wahl.delete(k.dataset.b) : wahl.add(k.dataset.b); return zeichne(); }
        gross(ctx, list.map((x) => ({ own: x })), list.findIndex((x) => x.id === k.dataset.b), opt.nachher, { ordner: opt.ordner, pr: opt.pr });
      }));
      $$('[data-gw]', el).forEach((k) => (k.onclick = async () => {
        const w = k.dataset.gw;
        if (w === 'an') wahl = new Set();
        else if (w === 'aus') wahl = null;
        else if (w === 'alle') wahl = wahl.size === list.length ? new Set() : new Set(list.map((b) => b.id));
        else {
          const auswahl = w === 'pdf' ? list.filter((b) => wahl.has(b.id)) : list;
          k.disabled = true;
          try { await bilderPdf(ctx, auswahl, opt.pdfTitel, ordnerName); } catch (e) { toast('PDF ging nicht: ' + (e.message || e), 5000); }
          k.disabled = false;
          return;
        }
        zeichne();
      }));
    };
    zeichne();
  }

  /** PDF aus Bildern: zwei je Seite (Vorgabe „bilderPdfJeSeite“), darunter Datum, Ordner und Notiz. Älteste zuerst. */
  async function bilderPdf(ctx, list, titel, ordnerName) {
    if (!list.length) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15;
    const je = Math.min(6, Math.max(1, +vorgabe('bilderPdfJeSeite') || 2));
    const spalten = je >= 4 ? 2 : 1, zeilen = Math.ceil(je / spalten);
    const oben = 30, bw = (W - 2 * M - (spalten - 1) * 6) / spalten, bh = (H - oben - M - zeilen * 10) / zeilen;
    const kopf = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 53, 80);
      doc.text(String(titel || 'Bilder'), M, 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 110, 110);
      doc.text(doc.splitTextToSize([ctx.titel, state.settings.company].filter(Boolean).join(' · '), W - 2 * M)[0] || '', M, 22);
      doc.setDrawColor(200, 200, 200); doc.line(M, 25, W - M, 25);
    };
    const sortiert = [...list].sort((a, b) => a.t - b.t);
    kopf();
    for (const [i, b] of sortiert.entries()) {
      toast(`PDF: Bild ${i + 1} von ${sortiert.length} …`, 8000);
      const pos = i % je;
      if (i && pos === 0) { doc.addPage(); kopf(); }
      const x = M + (pos % spalten) * (bw + 6), y = oben + Math.floor(pos / spalten) * (bh + 10);
      try {
        const data = await resize((await kvGet('bild:' + b.id)) || b.thumb, 1500, 'image/jpeg', 0.78);
        const img = await loadImg(data);
        const f = Math.min(bw / img.naturalWidth, bh / img.naturalHeight), w = img.naturalWidth * f, h = img.naturalHeight * f;
        doc.addImage(data, 'JPEG', x + (bw - w) / 2, y, w, h, undefined, 'FAST');
        doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
        doc.text(doc.splitTextToSize([tag(b.t), ordnerName?.[b.ordner], b.text].filter(Boolean).join(' · '), bw).slice(0, 2), x, y + h + 4.5);
      } catch (e) { console.warn('Bild fehlt im PDF', e); }
    }
    $('#toast').hidden = true;
    const safe = (t) => String(t || '').replace(/[^\wäöüÄÖÜß-]+/g, '_').slice(0, 50);
    await Mappe.teilen(doc, `Bilder_${safe(titel)}_${safe(ctx.titel)}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ---------- Mehrere Fotos hintereinander ----------
  const fotoOrdner = () => vorgabeText('ordnerFotos', { datum: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }).trim() || 'Fotos';
  /** Kamera öffnen und beliebig viele Fotos nacheinander machen (Kamera.serie). Jedes Foto wird sofort gespeichert:
   * in den Ordner ordnerId, sonst in den Ordner ordnerName (Standard: Vorgabe „ordnerFotos“, wird bei Bedarf angelegt).
   * { kundeId, objektId, projektId?, ordnerId?, ordnerName? } → Anzahl der Fotos. Auch für andere Bereiche (z. B. „Vor Ort“). */
  async function fotosMachen({ kundeId, objektId = '', projektId = '', ordnerId = '', ordnerName = '' }) {
    const nm = ordnerName || fotoOrdner();
    let wo = '';
    const n = await Kamera.serie({ titel: 'Fotos', onFoto: async (roh) => {
      const data = await resize(roh, 1600, 'image/jpeg', 0.8);
      const dd = await laden(kundeId, objektId);
      let o = ordnerId ? dd.ordner.find((x) => x.id === ordnerId) : dd.ordner.find((x) => x.name === nm && (x.projektId || '') === projektId);
      if (!o) { o = { id: uid(), name: nm, projektId }; dd.ordner.push(o); }
      const id = uid();
      await kvSet('bild:' + id, data);
      dd.bilder.push({ id, t: Date.now(), ordner: o.id, projektId, text: '', thumb: await resize(data, 320, 'image/jpeg', 0.7) });
      await speichern(kundeId, objektId, dd);
      wo = o.name;
    } });
    if (n) toast(`${n} ${n === 1 ? 'Foto' : 'Fotos'} in „${wo}“ gespeichert`, 3500);
    return n;
  }

  /** Bild groß: mit dem Finger nach rechts und links durchwischen (oder Pfeile), teilen/sichern, vergrößern;
   * eigene Bilder: Notiz, Ordner, Projekt, löschen. */
  function gross(ctx, all, i, nachher, opt = {}) {
    const el = document.createElement('div');
    el.className = 'gview';
    let changed = false;
    const close = () => { el.remove(); document.removeEventListener('keydown', keys); if (changed) nachher(); };
    const upd = async (id, f) => { const d = await laden(ctx.kundeId, ctx.objektId); const b = d.bilder.find((y) => y.id === id); if (b) { f(b); await speichern(ctx.kundeId, ctx.objektId, d); } changed = true; };
    el.innerHTML = `<div class="gv-top"><span data-nr></span><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
      <div class="gv-img"><div class="gv-roll"></div><button class="gv-nav l" data-p aria-label="Vorheriges">${icon('back')}</button><button class="gv-nav r" data-n aria-label="Nächstes">${icon('chevron')}</button></div>
      <div class="gv-bar"></div>`;
    const roll = $('.gv-roll', el);
    const voll = async (x) => (x.own ? (await kvGet('bild:' + x.own.id)) || x.own.thumb : x.data);
    /** Folien neu aufbauen (am Anfang und nach dem Löschen); Bilder werden erst geladen, wenn sie dran sind. */
    const folien = () => { roll.innerHTML = all.map((x, n) => `<div class="gv-s" data-s="${n}">${x.own ? `<img src="${x.own.thumb}" alt="">` : ''}</div>`).join(''); };
    const lade = async (n) => {
      const s = roll.children[n], x = all[n];
      if (!s || !x || s.dataset.voll) return;
      s.dataset.voll = '1';
      const data = await voll(x);
      if (all[n] === x) s.innerHTML = `<img src="${data}" alt="">`;
    };
    const leiste = () => {
      const x = all[i], own = x.own;
      $('[data-nr]', el).textContent = `${i + 1} / ${all.length}${own ? ` · ${tag(own.t)}` : ''}`;
      $('[data-p]', el).hidden = i <= 0; $('[data-n]', el).hidden = i >= all.length - 1;
      const bar = $('.gv-bar', el);
      bar.innerHTML = `
          ${own ? `<div class="row gv-sel">
              <select id="gvOrd" aria-label="Ordner">${opt.ordner.map((o) => `<option value="${o.id}" ${o.id === own.ordner ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
              ${opt.pr.length ? `<select id="gvPr" aria-label="Projekt"><option value="">Ohne Projekt</option>${opt.pr.map((p) => `<option value="${p.id}" ${p.id === own.projektId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
            </div>
            <input type="text" id="gvText" value="${esc(own.text)}" placeholder="Notiz, z. B. Wasserschaden hinter WC">` : `<span class="gv-l">${esc(x.label)}</span>`}
          <div class="row"><button class="btn secondary" data-share style="flex:1">${icon('share')} Teilen / Sichern</button><button class="btn secondary" data-zoom aria-label="Vergrößern">${icon('search')}</button>${own && window.Zeichnen ? `<button class="btn secondary" data-zeichnen>${icon('edit')} Zeichnen</button>` : ''}${own ? `<button class="btn danger" data-del aria-label="Löschen">${icon('trash')}</button>` : ''}</div>`;
      $('[data-zoom]', bar).onclick = async () => pdfAnsicht(await voll(x), own ? `Bild ${tag(own.t)}` : x.label || 'Bild');
      $('[data-share]', bar).onclick = async () => {
        const blob = await (await fetch(await voll(x))).blob();
        const name = `DOM_${(ctx.titel || 'Objekt').replace(/[^\wäöüÄÖÜß-]+/g, '_').slice(0, 60)}_${i + 1}.jpg`;
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      };
      if (own && $('[data-zeichnen]', bar)) $('[data-zeichnen]', bar).onclick = async () => {
        // Schon eine Zeichnung: weiterzeichnen (auf dem Original bzw. dem leeren Blatt) und dieses Bild ersetzen.
        // Sonst: Original bleibt, die Zeichnung kommt als neues Bild in denselben Ordner.
        const zn = own.zeichnung;
        const grund = zn?.von ? await kvGet('bild:' + zn.von) : null;
        const weiter = !!zn && (!zn.von || !!grund);
        const r = await Zeichnen.oeffnen(weiter ? grund : await voll(x), { titel: weiter ? 'Weiterzeichnen' : 'Zeichnen', striche: weiter ? zn.striche : [], onSave: async (striche, bild) => {
          if (weiter) {
            await kvSet('bild:' + own.id, bild);
            const thumb = await resize(bild, 320, 'image/jpeg', 0.7);
            await upd(own.id, (b) => { b.zeichnung = { von: zn.von, striche }; b.thumb = thumb; });
          } else await ablegen(ctx.kundeId, ctx.objektId, bild, '', own.projektId, { zeichnung: { von: own.id, striche }, ordnerId: own.ordner, text: own.text });
        } });
        if (!r) return;
        changed = true;
        toast(weiter ? 'Zeichnung gespeichert' : 'Als neues Bild gespeichert, das Original bleibt', 3500);
        close();
      };
      if (own) {
        $('#gvText', bar).oninput = debounce((e) => { own.text = e.target.value; upd(own.id, (b) => (b.text = own.text)); }, 500);
        $('#gvOrd', bar).onchange = (e) => { own.ordner = e.target.value; upd(own.id, (b) => (b.ordner = own.ordner)); toast('In anderen Ordner verschoben'); };
        if ($('#gvPr', bar)) $('#gvPr', bar).onchange = (e) => { own.projektId = e.target.value; upd(own.id, (b) => (b.projektId = own.projektId)); };
        $('[data-del]', bar).onclick = async () => {
          if (!loeschFrage('Dieses Bild löschen?')) return;
          const d = await laden(ctx.kundeId, ctx.objektId);
          d.bilder = d.bilder.filter((y) => y.id !== own.id); await speichern(ctx.kundeId, ctx.objektId, d);
          await kvDel('bild:' + own.id);
          changed = true; all.splice(i, 1);
          if (!all.length) return close();
          i = Math.min(i, all.length - 1); folien(); geh(i, false);
        };
      }
    };
    /** Zum Bild n springen. */
    const geh = (n, weich = true) => {
      i = Math.max(0, Math.min(all.length - 1, n));
      roll.scrollTo({ left: i * roll.clientWidth, behavior: weich ? 'smooth' : 'auto' });
      lade(i); lade(i + 1); lade(i - 1); leiste();
    };
    // Wischen: Der Bereich rollt seitlich und rastet je Bild ein. Nach dem Rollen steht fest, welches Bild dran ist.
    let warte = 0;
    roll.addEventListener('scroll', () => {
      clearTimeout(warte);
      warte = setTimeout(() => {
        const n = Math.round(roll.scrollLeft / Math.max(1, roll.clientWidth));
        if (n !== i && all[n]) { i = n; lade(i); lade(i + 1); lade(i - 1); leiste(); }
      }, 90);
    }, { passive: true });
    $('[data-x]', el).onclick = close;
    $('[data-p]', el).onclick = () => geh(i - 1);
    $('[data-n]', el).onclick = () => geh(i + 1);
    const keys = (e) => { if (e.target.closest?.('input, select')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') geh(i - 1); if (e.key === 'ArrowRight') geh(i + 1); };
    document.addEventListener('keydown', keys);
    document.body.appendChild(el);
    folien(); geh(i, false);
  }

  /** Ein fertiges Bild in einen Ordner legen (Ordner wird angelegt, wenn es ihn noch nicht gibt). Für die Kamera oben. */
  async function ablegen(kid, oid, data, ordnerName, projektId = '', { ordnerId = '', text = '', zeichnung } = {}) {
    const dd = await laden(kid, oid);
    let o = ordnerId ? dd.ordner.find((x) => x.id === ordnerId) : dd.ordner.find((x) => x.name === ordnerName && (x.projektId || '') === projektId);
    if (!o) { o = { id: uid(), name: ordnerName, projektId }; dd.ordner.push(o); }
    const id = uid();
    await kvSet('bild:' + id, data);
    dd.bilder.push({ id, t: Date.now(), ordner: o.id, projektId, text, thumb: await resize(data, 320, 'image/jpeg', 0.7), ...(zeichnung ? { zeichnung } : {}) });
    await speichern(kid, oid, dd);
    return o;
  }
  return { view, anzahl, ablegen, fotosMachen, alleView };
})();
