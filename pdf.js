'use strict';
/* DOM – Gestaltung der PDF-Unterlagen (A4 quer) und die Kundenmappe.
 * Gemeinsames Layout (Farben, Kopf, Fuß, Bilder im festen Format) wird auch von baumappe.js genutzt.
 * Schrift: Helvetica (in jsPDF eingebaut). € und Umlaute gehen, Sonderzeichen wie ✓ nicht. */
window.Mappe = (() => {
  const NAVY = [30, 53, 80], BRASS = [184, 134, 47], CREAM = [247, 244, 238], INK = [34, 40, 49], GREY = [112, 120, 132], LIGHT = [229, 232, 237], SOFT = [243, 245, 248];
  const hexRgb = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : NAVY);
  const clean = (s) => String(s ?? '').replace(/[✓✔]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  const fileSafe = (s) => String(s || 'Projekt').replace(/[^\wäöüÄÖÜß-]+/g, '_').replace(/^_|_$/g, '');

  // ---------- Bilder ----------
  const cropCache = new Map();
  /** Bild auf ein festes Seitenverhältnis zuschneiden (mittig, wie „cover“), als JPEG. */
  async function crop(src, aspect, maxSide = 1500) {
    const k = src.length + ':' + src.slice(-40) + ':' + aspect.toFixed(3) + ':' + maxSide;
    if (cropCache.has(k)) return cropCache.get(k);
    const img = await loadImg(src);
    const r = img.naturalWidth / img.naturalHeight;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (r > aspect) { sw = sh * aspect; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / aspect; sy = (img.naturalHeight - sh) / 2; }
    const s = Math.min(1, maxSide / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * s); c.height = Math.round(sh * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', 0.88);
    if (cropCache.size > 60) cropCache.clear();
    cropCache.set(k, out);
    return out;
  }
  let whiteLogo;
  async function logoWeiss() {
    if (whiteLogo !== undefined) return whiteLogo;
    try { whiteLogo = await fileToDataUrl(await (await fetch('assets/dom_logo_weiss.png')).blob()); } catch { whiteLogo = null; }
    return whiteLogo;
  }
  /** Firmendaten aus dem Angebotstool (Excel), Platzhalter werden ausgelassen. */
  async function firma() {
    let E = {};
    try { E = (await window.Angebot?._intern.preisliste())?.einstellungen || {}; } catch {}
    const real = (v) => (v && !/muster|0000|00000|DE000/i.test(String(v)) ? String(v) : '');
    return { name: state.settings.company || E.firma || '', kontakt: state.settings.contact || '', strasse: real(E.strasse), ort: real(E.ort), tel: real(E.telefon), mail: real(E.email), ansprech: real(E.ansprechpartner) };
  }

  // ---------- Grundgerüst ----------
  /** Neues Dokument mit Helfern. kind: Text für die Fußzeile rechts. */
  async function start(kind) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const S = state.settings;
    const c = { doc, W: 297, H: 210, M: 16, S, kind, F: await firma(), logoFmt: S.logo ? (mimeOf(S.logo) === 'image/png' ? 'PNG' : 'JPEG') : null };
    c.color = (rgb) => doc.setTextColor(...rgb);
    c.font = (size, style = 'normal', rgb = INK) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...rgb); };
    c.text = (t, x, y, o = {}) => doc.text(Array.isArray(t) ? t.map(clean) : clean(t), x, y, o);
    c.caps = (t, x, y, rgb = BRASS, size = 7.5, o = {}) => { c.font(size, 'bold', rgb); doc.text(clean(t).toUpperCase(), x, y, { charSpace: 0.6, ...o }); };
    c.fill = (rgb, x, y, w, h, r = 0) => { doc.setFillColor(...rgb); r ? doc.roundedRect(x, y, w, h, r, r, 'F') : doc.rect(x, y, w, h, 'F'); };
    c.line = (rgb, x1, y1, x2, y2, lw = 0.25) => { doc.setDrawColor(...rgb); doc.setLineWidth(lw); doc.line(x1, y1, x2, y2); };
    c.lines = (t, w) => doc.splitTextToSize(clean(t), w);
    c.alpha = (a) => doc.setGState(new doc.GState({ opacity: a }));
    /** Bild in ein Feld (gefüllt, zugeschnitten). */
    c.image = async (src, x, y, w, h) => { if (!src) { c.fill(SOFT, x, y, w, h); return; } doc.addImage(await crop(src, w / h), 'JPEG', x, y, w, h, undefined, 'FAST'); };
    /** Bild vollständig in ein Feld einpassen (nichts abschneiden). */
    c.contain = async (src, x, y, w, h, fmt = 'JPEG') => addFit(doc, src, x, y, w, h, fmt);
    c.logo = async (x, y, w, h) => { if (S.logo) await addFit(doc, S.logo, x, y, w, h, c.logoFmt); };
    c.pill = (t, x, y, bg, fg = [255, 255, 255], size = 7) => {
      c.font(size, 'bold', fg);
      const tw = doc.getTextWidth(clean(t).toUpperCase()) + clean(t).length * 0.35, h = size * 0.62;
      c.fill(bg, x, y, tw + 6, h, h / 2);
      doc.text(clean(t).toUpperCase(), x + 3, y + h * 0.7, { charSpace: 0.35 });
      return tw + 6;
    };
    /** Kopfzeile einer Inhaltsseite: Oberzeile (klein, Messing), Titel, Untertitel, Logo rechts. */
    c.head = async (kicker, title, sub = '', rgb = NAVY) => {
      doc.addPage();
      if (kicker) c.caps(kicker, c.M, 17);
      c.font(20, 'bold', rgb); c.text(title, c.M, 26);
      if (sub) { c.font(9.5, 'normal', GREY); c.text(c.lines(sub, 175)[0], c.M, 32); }
      await c.logo(c.W - c.M - 42, 11, 42, 16);
    };
    c.footer = () => {
      const n = doc.getNumberOfPages();
      for (let i = 2; i <= n; i++) {
        doc.setPage(i);
        c.line(LIGHT, c.M, c.H - 11.5, c.W - c.M, c.H - 11.5, 0.3);
        c.font(7, 'normal', GREY);
        c.text([c.F.name, c.F.strasse && c.F.ort ? `${c.F.strasse}, ${c.F.ort}` : '', c.F.tel ? 'Tel. ' + c.F.tel : '', c.F.mail].filter(Boolean).join('   ·   ') || c.F.kontakt, c.M, c.H - 7);
        c.text(`${c.kind}   ·   Seite ${i} von ${n}`, c.W - c.M, c.H - 7, { align: 'right' });
      }
    };
    return c;
  }

  /** Deckblatt: links Dunkelblau mit Logo und Angaben, rechts großes Bild. */
  async function cover(c, { tag, title, sub, meta, hero, chips = [] }) {
    const { doc, H } = c;
    const LW = 118;
    c.fill(NAVY, 0, 0, LW, H);
    if (hero) await c.image(hero, LW, 0, c.W - LW, H); else c.fill(SOFT, LW, 0, c.W - LW, H);
    c.fill(BRASS, LW, 0, 1.4, H);
    const wl = await logoWeiss();
    if (wl) await c.contain(wl, 16, 16, 62, 20, 'PNG'); else { c.font(16, 'bold', [255, 255, 255]); c.text(c.F.name, 16, 28); }
    c.caps(tag, 16, 80, BRASS, 8);
    c.font(28, 'bold', [255, 255, 255]);
    const tl = c.lines(title, LW - 30); c.text(tl, 16, 93); let y = 93 + tl.length * 11;
    if (sub) { c.font(11, 'normal', [205, 214, 226]); const sl = c.lines(sub, LW - 30); c.text(sl, 16, y - 3); y += sl.length * 5.5; }
    c.fill(BRASS, 16, y + 2, 22, 0.9); y += 12;
    for (const [k, v] of meta.filter(([, v]) => v)) {
      c.caps(k, 16, y, [150, 166, 186], 6.5); c.font(10.5, 'normal', [255, 255, 255]);
      const vl = c.lines(v, LW - 32); c.text(vl, 16, y + 5); y += 6 + vl.length * 5 + 3;
    }
    if (chips.length) {
      let x = 16;
      for (const [t, rgb] of chips) { const w = c.pill(t, x, H - 26, rgb, [255, 255, 255], 6.5); x += w + 3; }
    }
    c.font(7, 'normal', [150, 166, 186]);
    c.text([c.F.name, c.F.tel ? 'Tel. ' + c.F.tel : '', c.F.mail].filter(Boolean).join('  ·  '), 16, H - 10);
    doc.setTextColor(...INK);
  }

  /** Ausstattungs-Raster eines Pakets (Feld-Bezeichnung + Text) im Bereich x..x+w ab y, max. Höhe h. */
  function ausstattung(c, r, pkg, x, y, w, h, { cols = 4 } = {}) {
    const items = fieldsFor(r.roomType).filter(([k]) => !['beschreibung', 'sonstiges'].includes(k) && pkg.fields[k]?.trim());
    if (!items.length) return;
    c.caps('Ausstattung', x, y);
    const cw = (w - (cols - 1) * 6) / cols, perCol = Math.ceil(items.length / cols), rowH = Math.min(11.5, (h - 4) / Math.max(perCol, 1));
    items.forEach(([k, label], n) => {
      const col = Math.floor(n / perCol), row = n % perCol;
      const xx = x + col * (cw + 6), yy = y + 6 + row * rowH;
      c.font(6.5, 'bold', GREY); c.text(label.replace(/\s*\(.*\)/, '').toUpperCase(), xx, yy, { charSpace: 0.25 });
      c.font(8.2, 'normal', INK);
      const lines = c.lines(pkg.fields[k].trim(), cw); c.text(lines.slice(0, rowH > 10 ? 2 : 1), xx, yy + 3.8);
    });
  }

  /** Vorher-/Nachher-Seite (und optional Tag/Abend) für einen Raum in einem Paket. */
  async function raumSeiten(c, r, pkg, { evening = true } = {}) {
    const { M, W } = c;
    const rgb = hexRgb(pkg.color);
    const views = r.photos.map((ph, i) => [ph, r.results[pkg.id]?.[i], i]).filter(([, res]) => res);
    const rn = r.room || roomType(r.roomType).name;
    for (const [vi, [photo, res, i]] of views.entries()) {
      await c.head(`${rn}${views.length > 1 ? `  ·  Ansicht ${vi + 1} von ${views.length}` : ''}`, `Paket ${pkg.name}`, pkg.fields.beschreibung || '', rgb);
      const gap = 6, bw = (W - 2 * M - gap) / 2, by = 39, bh = 112;
      await c.image(photo, M, by, bw, bh);
      await c.image(res, M + bw + gap, by, bw, bh);
      c.pill('Vorher', M + 4, by + 4, [60, 68, 80]);
      c.pill('Nachher · ' + pkg.name, M + bw + gap + 4, by + 4, rgb);
      ausstattung(c, r, pkg, M, by + bh + 9, W - 2 * M, 38);
      const eve = evening && eveningOf(r, pkg.id, i);
      if (eve) {
        await c.head(`${rn}  ·  Lichtstimmung`, `Paket ${pkg.name}: Tag und Abend`, 'So wirkt der Raum tagsüber und am Abend mit gedimmtem, warmweißem Licht.', rgb);
        await c.image(res, M, by, bw, bh);
        await c.image(eve, M + bw + gap, by, bw, bh);
        c.pill('Tagsüber', M + 4, by + 4, rgb);
        c.pill('Abends', M + bw + gap + 4, by + 4, [20, 28, 44]);
        c.font(9, 'normal', GREY);
        c.text(c.lines('Die Abendansicht zeigt die eingeplanten Leuchten (Spots, Spiegel, indirektes Licht) eingeschaltet und gedimmt. Lichtfarbe ca. 2700 Kelvin.', W - 2 * M), M, by + bh + 10);
      }
    }
    const top = topOf(r, pkg.id);
    if (top) {
      const by = 39, bh = 112;
      await c.head(`${rn}  ·  Draufsicht`, `Paket ${pkg.name}`, 'Der neue Raum auf einen Blick, von oben gesehen.', rgb);
      const box = await c.contain(top, M, by, W - 2 * M, bh);
      c.pill('Draufsicht · ' + pkg.name, box.x + 4, box.y + 4, rgb);
      if (!views.length) ausstattung(c, r, pkg, M, by + bh + 9, W - 2 * M, 38);
    }
  }

  /** Produktliste eines Pakets (Shop-Links, optional Preise). */
  async function produktSeite(c, pkg, { prices, sub, ohnePreise } = {}) {
    const prods = (pkg.products || []).filter((x) => x.name?.trim());
    if (!prods.length) return;
    const { doc, M, W, H } = c;
    const rgb = hexRgb(pkg.color);
    await c.head(sub || '', `Produkte · Paket ${pkg.name}`, 'Ausgewählte Produkte dieses Pakets, Links führen direkt zum Hersteller bzw. Händler.', rgb);
    const showPrice = prices && !ohnePreise;
    const cols = showPrice ? [['Bereich', 52], ['Produkt', 124], ['Lieferzeit', 36], ['Preis', 27], ['', 26]] : [['Bereich', 58], ['Produkt', 145], ['Lieferzeit', 36], ['', 26]];
    const xs = []; cols.reduce((x, [, w]) => (xs.push(x), x + w), M);
    let y = 44;
    const kopf = () => { c.fill(NAVY, M, y - 5, W - 2 * M, 7.5, 1.2); cols.forEach(([t], i) => { if (t) { c.font(7, 'bold', [255, 255, 255]); doc.text(t.toUpperCase(), xs[i] + 2.5, y, { charSpace: 0.4, align: t === 'Preis' ? 'left' : 'left' }); } }); y += 8; };
    kopf();
    let sum = 0, hasSum = false, zebra = false;
    for (const x of prods) {
      const area = (FIELD_LIB[x.area]?.[0] || x.area || '').replace(/\s*\(.*\)/, '');
      const vals = { Bereich: area, Produkt: x.name.trim(), Lieferzeit: x.delivery || '', Preis: fmtPrice(x.price) };
      c.font(8.8, 'normal', INK);
      const lines = cols.map(([t, w]) => (t && t !== '' ? c.lines(vals[t] || '', w - 5) : []));
      const rh = Math.max(1, ...lines.map((l) => l.length)) * 4.1 + 3.4;
      if (y + rh > H - 18) { await c.head(sub || '', `Produkte · Paket ${pkg.name}`, 'Fortsetzung', rgb); y = 44; kopf(); }
      if ((zebra = !zebra)) c.fill(SOFT, M, y - 4.6, W - 2 * M, rh, 0);
      cols.forEach(([t], i) => {
        if (t === 'Bereich') { c.font(7.5, 'bold', GREY); c.text(lines[i].map((s) => s.toUpperCase()), xs[i] + 2.5, y); }
        else if (t === 'Produkt') { c.font(8.8, 'bold', INK); c.text(lines[i], xs[i] + 2.5, y); }
        else if (t) { c.font(8.8, 'normal', INK); c.text(lines[i], xs[i] + 2.5, y); }
        else { const url = safeUrl(x.url); if (url) { c.font(8.5, 'bold', BRASS); doc.textWithLink('Zum Produkt ›', xs[i] + 1, y, { url }); } }
      });
      if (x.price !== '' && x.price != null && !isNaN(+x.price)) { sum += +x.price; hasSum = true; }
      y += rh;
    }
    if (showPrice && hasSum) {
      c.line(NAVY, xs[1], y - 2.5, W - M, y - 2.5, 0.4);
      c.font(9.5, 'bold', NAVY); c.text('Summe der Produkte', xs[1] + 2.5, y + 2.5); c.text(fmtPrice(sum), xs[3] + 2.5, y + 2.5);
      c.font(7, 'normal', GREY); c.text('Materialpreise laut Hersteller/Händler, unverbindlich, ohne Montage.', M, y + 9);
    }
  }

  /** Übersicht: je Raum eine Zeile mit Vorher und den gewählten Paketen. */
  async function uebersicht(c, sel) {
    const { M, W, H } = c;
    const maxPk = Math.max(...sel.map((x) => x.pkgs.length));
    const cols = 1 + maxPk;
    const labW = 46, gap = 5, iw = Math.min(62, (W - 2 * M - labW - (cols - 1) * gap) / cols), ih = iw * 0.68;
    const per = Math.max(1, Math.floor((H - 40 - 16) / (ih + 9)));
    for (let s = 0; s < sel.length; s += per) {
      await c.head('Überblick', sel.length > 1 ? 'Ihre Räume auf einen Blick' : 'Ihre Varianten auf einen Blick', s ? 'Fortsetzung' : '');
      let y = 40;
      for (const { r, pkgs } of sel.slice(s, s + per)) {
        c.font(11, 'bold', NAVY); c.text(c.lines(r.room || roomType(r.roomType).name, labW - 4), M, y + 6);
        c.font(7.5, 'normal', GREY); c.text(roomType(r.roomType).name, M, y + 11 + (c.lines(r.room || '', labW - 4).length - 1) * 4.5);
        const i0 = Math.max(0, (r.results[pkgs[0].id] || []).findIndex(Boolean));
        let x = M + labW;
        await c.image(r.photos[i0], x, y, iw, ih); c.pill('Vorher', x + 2.5, y + 2.5, [60, 68, 80], [255, 255, 255], 6);
        for (const pk of pkgs) {
          x += iw + gap;
          await c.image(r.results[pk.id]?.[i0] || firstResult(r, pk.id), x, y, iw, ih);
          c.pill(pk.name, x + 2.5, y + 2.5, hexRgb(pk.color), [255, 255, 255], 6);
        }
        y += ih + 9;
      }
    }
  }

  /** Schlussseite: nächste Schritte + Kontakt. */
  async function schluss(c, { steps, title = 'Nächste Schritte', note }) {
    const { doc, M, W, H } = c;
    doc.addPage();
    c.fill(CREAM, 0, 0, W, H);
    c.caps('So geht es weiter', M, 30);
    c.font(24, 'bold', NAVY); c.text(title, M, 41);
    const cw = (W - 2 * M - 2 * 10) / 3;
    steps.forEach(([t, d], i) => {
      const x = M + i * (cw + 10), y = 60;
      c.fill([255, 255, 255], x, y, cw, 62, 3);
      c.fill(NAVY, x + 8, y + 9, 11, 11, 5.5);
      c.font(11, 'bold', [255, 255, 255]); c.text(String(i + 1), x + 13.5, y + 16.6, { align: 'center' });
      c.font(12, 'bold', NAVY); c.text(t, x + 8, y + 31);
      c.font(9, 'normal', INK); c.text(c.lines(d, cw - 16), x + 8, y + 38);
    });
    const F = c.F;
    let y = 142;
    await c.logo(M, y - 4, 52, 20);
    const lines = [F.name, [F.strasse, F.ort].filter(Boolean).join(', '), F.tel ? 'Telefon ' + F.tel : '', F.mail, F.ansprech ? 'Ihre Ansprechpartner: ' + F.ansprech : '', !F.tel && !F.mail ? F.kontakt : ''].filter(Boolean);
    c.font(9.5, 'normal', INK); c.text(lines, M + 64, y + 2, { lineHeightFactor: 1.45 });
    if (note) { c.font(7.5, 'normal', GREY); c.text(c.lines(note, W - 2 * M), M, H - 20); }
  }

  /** Objekt mit Bezeichnung aus der Kundenkarte, z. B. „Ferienhaus · Seeweg 3, Konstanz“. */
  function objektZeile(w) {
    const k = window.Kunden?.byId(w.kundeId), o = k && Kunden.objekt(k, w.objektId);
    return o ? Kunden.objektText(o) : w.address;
  }
  async function teilen(doc, name) {
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---------- Kundenmappe ----------
  /** sel: [{ r: Raum, pkgs: [Paket, …] }] in der Reihenfolge des Projekts. */
  async function baueKunde(w, sel, { evening = w.pdfEvening !== false, products = w.pdfProducts, prices = w.pdfPrices } = {}) {
    const c = await start('Kundenmappe · KI-Visualisierung, unverbindliche Darstellung');
    const allPk = Object.keys(PKG_META).filter((id) => sel.some((x) => x.pkgs.some((p) => p.id === id)));
    // Titelbild: hochwertigstes Paket des ersten Raums
    const first = sel[0];
    const heroPk = first.pkgs[first.pkgs.length - 1];
    const one = sel.length === 1;
    await cover(c, {
      tag: allPk.length > 1 && sel.every((x) => x.pkgs.length > 1) ? 'Visualisierung · Ausstattungsvarianten' : 'Visualisierung Ihrer Sanierung',
      title: one ? (first.r.room || roomType(first.r.roomType).name) : 'Ihre Sanierung',
      sub: one ? (first.pkgs.length > 1 ? `in ${first.pkgs.length} Ausstattungsvarianten` : `Paket ${heroPk.name}`) : sel.map((x) => x.r.room || roomType(x.r.roomType).name).join(' · '),
      meta: [['Für', w.customer], ['Objekt', objektZeile(w)], ['Datum', new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })]],
      hero: firstResult(first.r, heroPk.id),
      chips: allPk.map((id) => { const p = sel.map((x) => x.pkgs.find((y) => y.id === id)).find(Boolean); return [p.name, hexRgb(p.color)]; }),
    });
    const pages = sel.reduce((n, x) => n + x.pkgs.length, 0);
    if (pages > 1) await uebersicht(c, sel);
    const shownProducts = new Set();
    for (const { r, pkgs } of sel) {
      for (const pk of pkgs) {
        await raumSeiten(c, r, pk, { evening });
        const k = r.roomType + ':' + pk.id;
        if (products && !shownProducts.has(k) && pk.products.some((x) => x.name?.trim())) { shownProducts.add(k); await produktSeite(c, pk, { prices, sub: roomType(r.roomType).name }); }
      }
    }
    await schluss(c, {
      steps: [
        ['Auswahl treffen', 'Sagen Sie uns, welche Ausstattung Ihnen gefällt. Gerne auch gemischt, zum Beispiel das Bad in Premium und die Küche in Standard.'],
        ['Festpreis-Angebot', 'Nach einem genauen Aufmaß erhalten Sie ein verbindliches Angebot mit allen Positionen und einem Bauzeitenplan.'],
        ['Umsetzung aus einer Hand', 'Wir koordinieren alle Gewerke, vom Rückbau bis zur Endreinigung, und sind Ihr fester Ansprechpartner.'],
      ],
      note: 'Die Bilder sind KI-Visualisierungen auf Basis Ihrer Fotos. Sie zeigen die Wirkung der Ausstattung und sind keine verbindliche Planung. Farben, Formate und Produkte werden im Angebot festgelegt.',
    });
    c.footer();
    return c.doc;
  }
  async function kunde(w, sel) {
    const doc = await baueKunde(w, sel);
    const pk = [...new Set(sel.flatMap((x) => x.pkgs.map((p) => p.name)))];
    await teilen(doc, `Kundenmappe_${fileSafe(w.customer)}${pk.length === 1 ? '_' + fileSafe(pk[0]) : ''}.pdf`);
  }

  // ---------- Präsentation (nur die neuen Bilder, ohne Vorher) ----------
  /** Ausstattung als eine Spalte (Bezeichnung + Text) im Bereich x..x+w von y bis maxY. */
  function ausstattungSpalte(c, r, pkg, x, y, w, maxY) {
    const items = fieldsFor(r.roomType).filter(([k]) => !['beschreibung', 'sonstiges'].includes(k) && pkg.fields[k]?.trim());
    if (!items.length) return y;
    c.caps('Ausstattung', x, y); y += 6.5;
    for (const [k, label] of items) {
      c.font(8.2, 'normal', INK);
      const lines = c.lines(pkg.fields[k].trim(), w).slice(0, 3);
      if (y + 3.8 + lines.length * 3.7 > maxY) break;
      c.font(6.3, 'bold', GREY); c.text(label.replace(/\s*\(.*\)/, '').toUpperCase(), x, y, { charSpace: 0.25 });
      c.font(8.2, 'normal', INK); c.text(lines, x, y + 3.9);
      y += 3.9 + lines.length * 3.7 + 3.2;
    }
    return y;
  }

  /** Präsentationsseiten eines Raums in einem Paket: großes Bild mit Ausstattung, weitere Ansichten groß, Abendstimmung. */
  async function praesSeiten(c, r, pkg, { evening = true } = {}) {
    const { M, W } = c;
    const rgb = hexRgb(pkg.color);
    const views = r.photos.map((_, i) => [r.results[pkg.id]?.[i], i]).filter(([res]) => res);
    if (!views.length) return;
    const rn = r.room || roomType(r.roomType).name;
    // Seite 1: Hauptbild links, rechts Paket und Ausstattung
    await c.head(roomType(r.roomType).name !== rn ? roomType(r.roomType).name : 'Ihr neuer Raum', rn, '', rgb);
    const iw = 182, ih = 146, by = 37;
    await c.image(views[0][0], M, by, iw, ih);
    c.fill(rgb, M, by + ih, iw, 1.2);
    const rx = M + iw + 9, rw = W - M - rx;
    c.pill('Paket ' + pkg.name, rx, by, rgb);
    let y = by + 13;
    if (pkg.fields.beschreibung?.trim()) {
      c.font(10, 'normal', INK);
      const dl = c.lines(pkg.fields.beschreibung.trim(), rw).slice(0, 6);
      c.text(dl, rx, y, { lineHeightFactor: 1.35 }); y += dl.length * 4.9 + 4;
      c.fill(BRASS, rx, y - 2, 14, 0.7); y += 6;
    }
    ausstattungSpalte(c, r, pkg, rx, y, rw, by + ih);
    // Weitere Ansichten: je Seite ein großes Bild über die ganze Breite
    for (const [vi, [res]] of views.entries()) {
      if (vi === 0) continue;
      await c.head(`${rn}  ·  Paket ${pkg.name}`, `Ansicht ${vi + 1} von ${views.length}`, '', rgb);
      await c.image(res, M, by, W - 2 * M, ih);
      c.fill(rgb, M, by + ih, W - 2 * M, 1.2);
    }
    // Abendstimmung
    const eves = evening ? views.map(([, i]) => eveningOf(r, pkg.id, i)).filter(Boolean) : [];
    if (eves.length) {
      await c.head(`${rn}  ·  Paket ${pkg.name}`, 'Am Abend', 'Die eingeplanten Leuchten eingeschaltet und gedimmt, warmweißes Licht.', rgb);
      if (eves.length === 1) await c.image(eves[0], M, by + 2, W - 2 * M, ih - 2);
      else {
        const gap = 6, bw = (W - 2 * M - gap) / 2;
        await c.image(eves[0], M, by + 2, bw, ih - 2); await c.image(eves[1], M + bw + gap, by + 2, bw, ih - 2);
      }
    }
  }

  async function baueVorstellung(w, sel, { evening = w.pdfEvening !== false, products = w.pdfProducts, prices = w.pdfPrices } = {}) {
    const c = await start('Präsentation · KI-Visualisierung, unverbindliche Darstellung');
    const first = sel[0];
    const heroPk = first.pkgs[first.pkgs.length - 1];
    const one = sel.length === 1;
    const allPk = Object.keys(PKG_META).filter((id) => sel.some((x) => x.pkgs.some((p) => p.id === id)));
    await cover(c, {
      tag: one ? 'Präsentation Ihres neuen Raums' : 'Präsentation Ihrer neuen Räume',
      title: one ? (first.r.room || roomType(first.r.roomType).name) : 'Ihre Sanierung',
      sub: one ? (first.pkgs.length > 1 ? `in ${first.pkgs.length} Ausstattungsvarianten` : `Paket ${heroPk.name}`) : sel.map((x) => x.r.room || roomType(x.r.roomType).name).join(' · '),
      meta: [['Für', w.customer], ['Objekt', objektZeile(w)], ['Datum', new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })]],
      hero: firstResult(first.r, heroPk.id),
      chips: allPk.map((id) => { const p = sel.map((x) => x.pkgs.find((y) => y.id === id)).find(Boolean); return [p.name, hexRgb(p.color)]; }),
    });
    const shownProducts = new Set();
    for (const { r, pkgs } of sel) {
      for (const pk of pkgs) {
        await praesSeiten(c, r, pk, { evening });
        const k = r.roomType + ':' + pk.id;
        if (products && !shownProducts.has(k) && pk.products.some((x) => x.name?.trim())) { shownProducts.add(k); await produktSeite(c, pk, { prices, sub: roomType(r.roomType).name }); }
      }
    }
    await schluss(c, {
      steps: [
        ['Auswahl treffen', 'Sagen Sie uns, was Ihnen gefällt und was Sie anders möchten. Wir passen Ausstattung und Produkte gerne für Sie an.'],
        ['Festpreis-Angebot', 'Nach einem genauen Aufmaß erhalten Sie ein verbindliches Angebot mit allen Positionen und einem Bauzeitenplan.'],
        ['Umsetzung aus einer Hand', 'Wir koordinieren alle Gewerke, vom Rückbau bis zur Endreinigung, und sind Ihr fester Ansprechpartner.'],
      ],
      note: 'Die Bilder sind KI-Visualisierungen. Sie zeigen die Wirkung der Ausstattung und sind keine verbindliche Planung. Farben, Formate und Produkte werden im Angebot festgelegt.',
    });
    c.footer();
    return c.doc;
  }
  async function praesentation(w, sel) {
    const doc = await baueVorstellung(w, sel);
    const pk = [...new Set(sel.flatMap((x) => x.pkgs.map((p) => p.name)))];
    await teilen(doc, `Praesentation_${fileSafe(w.customer)}${pk.length === 1 ? '_' + fileSafe(pk[0]) : ''}.pdf`);
  }

  return { objektZeile, kunde, baueKunde, praesentation, baueVorstellung, start, cover, head: null, raumSeiten, produktSeite, ausstattung, schluss, teilen, crop, fileSafe, clean, hexRgb, C: { NAVY, BRASS, CREAM, INK, GREY, LIGHT, SOFT } };
})();
