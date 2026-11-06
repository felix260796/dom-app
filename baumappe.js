'use strict';
/* DOM – Baumappe für Subunternehmer (ohne Preise).
 * Pro Raum: Visualisierung mit nummerierten Markierungen (Verweis auf Produkt/Armatur), Ausstattung
 * und Produkte, Grundriss mit Bemaßung, Fliesenspiegel der Wände, Material- und Leistungsliste.
 * Daten je Raum: p.bau = { paket, wand, boden, hoehe, verband, dusche, fenster, hinweis, aus,
 *                         marks: { [pkgId]: { [ansicht]: [{ id, x, y, text, sub, url }] } } }
 * Wände: A = Türwand, von innen gesehen B rechts, C gegenüber, D links. A/C = Länge, B/D = Breite.
 * Baut auf core.js, app.js, pdf.js (Mappe) und angebot.js (Aufmaß, Mengen) auf. */
window.Baumappe = (() => {
  const PKG_IDS = Object.keys(PKG_META);
  const WAENDE = ['A', 'B', 'C', 'D'];
  const VERBAND = { kreuz: 'Kreuzfuge', halb: 'Halbversatz (1/2)', drittel: 'Drittelversatz (1/3)' };
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const dez = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('de-DE', { minimumFractionDigits: d === 2 ? 2 : 0, maximumFractionDigits: d });
  const m = (x) => dez(x) + ' m';
  const done = (r, id) => !!firstResult(r, id);
  const pkgOf = (r, id) => packagesFor(r.roomType).find((x) => x.id === id);
  const A = () => window.Angebot?._intern;

  function bau(r) {
    r.bau ??= {};
    const b = r.bau;
    b.marks ??= {}; b.verband ??= 'halb'; b.dusche ??= 'C'; b.fenster ??= 'C'; b.aus ??= true;
    return b;
  }
  /** Ausführungspaket: eigene Wahl, sonst Wahl in der Kundenmappe, sonst Angebots-Paket, sonst erstes fertiges. */
  function paket(r) {
    const b = bau(r), w = state.wohnung;
    const cands = [b.paket, w?.mappe?.[r.id], r.angebot?.paket, ...PKG_IDS];
    return cands.find((id) => id && id !== 'alle' && done(r, id)) || '';
  }
  const marks = (r, pk, i) => ((bau(r).marks[pk] ??= {})[i] ??= []);
  const anzahl = (r) => { const pk = paket(r); return pk ? Object.values(bau(r).marks[pk] || {}).reduce((n, a) => n + a.length, 0) : 0; };
  /** Foto i wurde gelöscht: Markierungen der folgenden Ansichten rutschen nach. */
  function fotoEntfernt(r, i) {
    for (const per of Object.values(bau(r).marks)) {
      const out = {};
      for (const [k, v] of Object.entries(per)) { const n = +k; if (n < i) out[n] = v; else if (n > i) out[n - 1] = v; }
      for (const k of Object.keys(per)) delete per[k];
      Object.assign(per, out);
    }
  }
  const aufmass = (r) => {
    const raum = r.aufmass?.raeume?.find((x) => A()?.masse(x).boden > 0);
    return raum ? { raum, m: A().masse(raum) } : null;
  };
  const format = (s, def) => { const x = String(s || '').match(/(\d{2,3})\s*[x×]\s*(\d{2,3})/); return x ? `${x[1]}x${x[2]}` : def; };
  const fliesen = (r, pk) => {
    const b = bau(r), f = pkgOf(r, pk)?.fields || {};
    const nass = A()?.gruppe ? A().gruppe(roomType(r.roomType).name) === 'nass' : /bad|wc/.test(r.roomType);
    const am = aufmass(r);
    const raumhoch = pk === 'premium' || /raumhoch/i.test(f.wandfliesen || '');
    const h = am?.m.hoehe || 2.5;
    return {
      wand: format(b.wand || f.wandfliesen, nass ? '30x60' : ''),
      boden: format(b.boden || f.boden, '60x60'),
      hoehe: num(b.hoehe) || (raumhoch ? h : nass ? 1.2 : 0),
      verband: b.verband, nass, raumhoch,
      dusche: am?.raum.dusche ? Math.min(num(am.raum.duschwand), am.m.umfang) : 0,
    };
  };
  const cm = (fmt) => fmt.split('x').map((v) => +v / 100); // "30x60" -> [0.3, 0.6]

  // ---------- Ansicht: Markierungen setzen ----------
  const sel = { view: 0 };
  async function markierungen(r) {
    state.project = r;
    const back = () => { viewProjekt(); window.scrollTo(0, 0); };
    const pk = paket(r);
    if (!pk) { toast('Erst ein Paket visualisieren.'); return back(); }
    const pkg = pkgOf(r, pk);
    const views = r.photos.map((_, i) => i).filter((i) => r.results[pk]?.[i]);
    if (!views.includes(sel.view)) sel.view = views[0];
    const i = sel.view, list = marks(r, pk, i);
    header('Markierungen', `${r.room || roomType(r.roomType).name} · Baumappe`, { label: r.room || 'Raum', fn: back });
    main().innerHTML = `
      <div class="card">
        <label>Ausführung in Paket</label>
        <div class="seg2 full">${PKG_IDS.filter((id) => done(r, id)).map((id) => `<button data-pk="${id}" class="${id === pk ? 'on' : ''}" style="--c:${pkgOf(r, id).color}">${esc(pkgOf(r, id).name)}</button>`).join('')}</div>
        ${views.length > 1 ? `<label>Ansicht</label><div class="seg2 full">${views.map((v) => `<button data-v="${v}" class="${v === i ? 'on' : ''}">Ansicht ${v + 1}</button>`).join('')}</div>` : ''}
      </div>
      <p class="hint">Tippe ins Bild, um eine Nummer zu setzen, z. B. auf Armatur, Fliese oder Leuchte. Nummern lassen sich mit dem Finger verschieben.</p>
      <div class="mk-wrap" id="mkWrap"><img src="${r.results[pk][i]}" alt="" draggable="false">
        ${list.map((x, n) => `<span class="mk" data-mk="${n}" style="left:${x.x * 100}%;top:${x.y * 100}%">${n + 1}</span>`).join('')}</div>
      <div class="card mk-list">${list.length ? list.map((x, n) => `
        <div class="mk-row"><span class="mk static">${n + 1}</span>
          <div class="mk-t"><input type="text" data-mt="${n}" value="${esc(x.text)}" placeholder="Was ist hier?"><span>${esc([x.sub, x.url ? 'mit Produktlink' : ''].filter(Boolean).join(' · '))}</span></div>
          <button class="icon-btn" data-md="${n}" aria-label="Entfernen">${icon('trash')}</button></div>`).join('') : '<p class="hint" style="margin:0">Noch keine Markierungen.</p>'}</div>`;
    const save = () => saveProject(r);
    const redraw = () => { const y = window.scrollY; markierungen(r); window.scrollTo(0, y); };
    $$('[data-pk]').forEach((b) => (b.onclick = () => { bau(r).paket = b.dataset.pk; save(); redraw(); }));
    $$('[data-v]').forEach((b) => (b.onclick = () => { sel.view = +b.dataset.v; redraw(); }));
    $$('[data-mt]').forEach((el) => (el.oninput = debounce(() => { list[+el.dataset.mt].text = el.value; save(); }, 300)));
    $$('[data-md]').forEach((b) => (b.onclick = () => { list.splice(+b.dataset.md, 1); save(); redraw(); }));
    const wrap = $('#mkWrap');
    const pos = (e) => { const rc = wrap.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - rc.left) / rc.width)), y: Math.min(1, Math.max(0, (e.clientY - rc.top) / rc.height)) }; };
    let drag = null;
    wrap.onpointerdown = (e) => {
      const mk = e.target.closest('[data-mk]');
      if (mk) { drag = { n: +mk.dataset.mk, el: mk, x0: e.clientX, y0: e.clientY, moved: false }; mk.setPointerCapture?.(e.pointerId); e.preventDefault(); }
    };
    wrap.onpointermove = (e) => {
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true;
      if (drag.moved) { const p = pos(e); drag.el.style.left = p.x * 100 + '%'; drag.el.style.top = p.y * 100 + '%'; }
    };
    wrap.onpointerup = async (e) => {
      if (drag) {
        const d = drag; drag = null;
        if (d.moved) { Object.assign(list[d.n], pos(e)); save(); return; }
        const was = await sheet(`Nummer ${d.n + 1}`, [{ label: 'Inhalt ändern', icon: icon('edit'), value: 'edit' }, { label: 'Nummer entfernen', icon: icon('trash'), value: 'del' }]);
        if (was === 'del') { list.splice(d.n, 1); save(); redraw(); }
        if (was === 'edit') { const v = await waehle(pkg, r); if (v) { Object.assign(list[d.n], v); save(); redraw(); } }
        return;
      }
      if (e.target.closest('[data-mk]')) return;
      const p = pos(e);
      const v = await waehle(pkg, r, list.length + 1);
      if (!v) return;
      list.push({ id: uid(), ...p, ...v });
      save(); redraw();
    };
  }
  /** Auswahl, worauf eine Nummer zeigt: Produkte und Ausstattung des Pakets oder freier Text. */
  async function waehle(pkg, r, n) {
    const fl = (k) => (FIELD_LIB[k]?.[0] || k).replace(/\s*\(.*\)/, '');
    const items = [
      ...(pkg.products || []).filter((x) => x.name?.trim()).map((x) => ({ label: x.name.trim(), sub: ['Produkt', x.area ? fl(x.area) : ''].filter(Boolean).join(' · '), icon: icon('pin'), value: { text: x.name.trim(), sub: x.area ? fl(x.area) : 'Produkt', url: safeUrl(x.url) } })),
      ...fieldsFor(r.roomType).filter(([k]) => !['beschreibung', 'stil', 'sonstiges'].includes(k) && pkg.fields[k]?.trim()).map(([k]) => ({ label: fl(k), sub: pkg.fields[k].trim(), icon: icon('clipboard'), value: { text: `${fl(k)}: ${pkg.fields[k].trim()}`, sub: '', url: '' } })),
    ];
    return sheet(n ? `Nummer ${n}: Was ist hier?` : 'Was ist hier?', items, { text: 'Eigener Text, z. B. „Unterputz-Thermostat, Höhe 1,10 m“' });
  }

  // ---------- Ansicht: Baumappe des Projekts ----------
  async function view(w) {
    state.project = null;
    const list = (await Projekt.raeume(w)).filter(hasAnyResult);
    header('Baumappe', w.customer || '', { label: 'Projekt', fn: () => { Projekt.view(); window.scrollTo(0, 0); } });
    try { await A()?.preisliste(); await A()?.vorlagen(); } catch {}
    w.bau ??= { material: true, leistung: true };
    main().innerHTML = `
      <div class="card intro"><p>Die Baumappe geht an deine <b>Subunternehmer</b>: Visualisierung mit Nummern, Produkte, Maße, Fliesenspiegel und Material. <b>Ohne Preise.</b></p></div>
      ${list.map((r) => {
        const b = bau(r), pk = paket(r), am = aufmass(r), F = fliesen(r, pk), n = anzahl(r);
        return `<div class="card bcard ${b.aus ? '' : 'off'}" data-r="${r.id}">
          <div class="bc-h"><img src="${firstResult(r, pk)}" alt=""><div><b>${esc(r.room || roomType(r.roomType).name)}</b>
            <label class="toggle sm"><input type="checkbox" data-aus ${b.aus ? 'checked' : ''}><span class="tg"></span><span>In die Baumappe</span></label></div></div>
          <label>Ausführung in Paket</label>
          <div class="seg2 full">${PKG_IDS.filter((id) => done(r, id)).map((id) => `<button data-pk="${id}" class="${id === pk ? 'on' : ''}" style="--c:${pkgOf(r, id).color}">${esc(pkgOf(r, id).name)}</button>`).join('')}</div>
          <button class="rowbtn" data-marks>${icon('pin')}<span><b>Markierungen im Bild</b><small>${n ? `${n} gesetzt` : 'noch keine, z. B. Armatur, Fliese, Leuchte'}</small></span>${icon('chevron')}</button>
          <button class="rowbtn" data-auf>${icon('ruler')}<span><b>Aufmaß</b><small>${am ? `${m(num(am.raum.teile[0]?.l))} × ${m(num(am.raum.teile[0]?.b))}, Höhe ${m(am.m.hoehe)}` : 'fehlt, dann gibt es keine Bemaßung'}</small></span>${icon('chevron')}</button>
          <details class="sub"><summary>Fliesen & Lage im Raum</summary>
            <div class="row"><div><label>Wandfliese (cm)</label><input type="text" data-b="wand" value="${esc(b.wand || '')}" placeholder="${esc(F.wand || 'z. B. 30x60')}"></div>
              <div><label>Bodenfliese (cm)</label><input type="text" data-b="boden" value="${esc(b.boden || '')}" placeholder="${esc(F.boden)}"></div></div>
            <div class="row"><div><label>Fliesenhöhe Wand (m)</label><input type="text" inputmode="decimal" data-b="hoehe" value="${esc(b.hoehe || '')}" placeholder="${F.hoehe ? dez(F.hoehe) : 'keine'}"></div>
              <div><label>Verlegung</label><select data-b="verband">${Object.entries(VERBAND).map(([k, l]) => `<option value="${k}" ${b.verband === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
            <div class="row"><div><label>Dusche an Wand</label><select data-b="dusche">${WAENDE.map((x) => `<option ${b.dusche === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
              <div><label>Fenster an Wand</label><select data-b="fenster">${WAENDE.map((x) => `<option ${b.fenster === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
            <p class="hint">Wand A ist die Türwand. Von innen gesehen: B rechts, C gegenüber, D links.</p>
          </details>
          <label>Hinweise für die Ausführung</label>
          <textarea data-b="hinweis" rows="2" placeholder="z. B. Armaturen auf 1,10 m, Nische 30×60 in Wand C, Silikonfarbe grau">${esc(b.hinweis || '')}</textarea>
        </div>`;
      }).join('')}
      <div class="card opts">
        <label class="toggle"><input type="checkbox" id="bMat" ${w.bau.material ? 'checked' : ''}><span class="tg"></span><span>Materialliste</span></label>
        <label class="toggle"><input type="checkbox" id="bLv" ${w.bau.leistung ? 'checked' : ''}><span class="tg"></span><span>Leistungen mit Mengen (ohne Preise)</span></label>
        <button class="btn big block" id="bPdf">${icon('file')} Baumappe als PDF</button>
        <p class="hint center">Mengen und Maße kommen aus dem Aufmaß. Vor Ort immer nachmessen.</p>
      </div>`;
    const saveW = () => Projekt.save(w);
    const redraw = () => { const y = window.scrollY; view(w).then(() => window.scrollTo(0, y)); };
    $$('[data-r]').forEach((card) => {
      const r = list.find((x) => x.id === card.dataset.r), b = bau(r);
      const save = debounce(() => saveProject(r), 300);
      $$('[data-pk]', card).forEach((x) => (x.onclick = () => { b.paket = x.dataset.pk; saveProject(r); redraw(); }));
      $('[data-aus]', card).onchange = (e) => { b.aus = e.target.checked; card.classList.toggle('off', !b.aus); save(); };
      $$('[data-b]', card).forEach((el) => (el.oninput = el.onchange = () => { b[el.dataset.b] = el.value; save(); }));
      $('[data-marks]', card).onclick = () => { r.customer = w.customer; r.address = w.address; markierungen(r); window.scrollTo(0, 0); };
      $('[data-auf]', card).onclick = () => { r.customer = w.customer; r.address = w.address; state.project = r; window.Angebot?.ansicht(r); };
    });
    $('#bMat').onchange = (e) => { w.bau.material = e.target.checked; saveW(); };
    $('#bLv').onchange = (e) => { w.bau.leistung = e.target.checked; saveW(); };
    $('#bPdf').onclick = async () => {
      const rs = list.filter((r) => bau(r).aus && paket(r));
      if (!rs.length) return toast('Bitte mindestens einen Raum auswählen.');
      const btn = $('#bPdf'), t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> PDF wird erstellt …';
      try { const doc = await baue(w, rs); await Mappe.teilen(doc, `Baumappe_${Mappe.fileSafe(w.customer)}.pdf`); }
      catch (e) { console.error(e); toast('PDF-Fehler: ' + e.message, 6000); }
      btn.disabled = false; btn.innerHTML = t;
    };
  }

  // ---------- PDF ----------
  const { NAVY, BRASS, INK, GREY, LIGHT, SOFT, CREAM } = Mappe.C;
  const TILE = [214, 220, 228], TILE_FILL = [247, 248, 250], SHOWER = [232, 240, 248];

  /** Nummer-Kreis (Markierung) auf der Seite. */
  function badge(c, x, y, n, rr = 3.1) {
    const { doc } = c;
    doc.setFillColor(...NAVY); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.6);
    doc.circle(x, y, rr, 'FD');
    c.font(rr > 2.6 ? 8 : 6.5, 'bold', [255, 255, 255]); doc.text(String(n), x, y + rr * 0.36, { align: 'center' });
  }
  /** Maßlinie mit Endstrichen und Beschriftung. vertical: Text gedreht. */
  function dim(c, x1, y1, x2, y2, label, { side = 1 } = {}) {
    const { doc } = c;
    doc.setDrawColor(...GREY); doc.setLineWidth(0.2);
    doc.line(x1, y1, x2, y2);
    const vert = Math.abs(x2 - x1) < 0.01;
    const t = 1.4;
    if (vert) { doc.line(x1 - t, y1 + t, x1 + t, y1 - t); doc.line(x2 - t, y2 + t, x2 + t, y2 - t); }
    else { doc.line(x1 - t, y1 + t, x1 + t, y1 - t); doc.line(x2 - t, y2 + t, x2 + t, y2 - t); }
    c.font(7.5, 'bold', INK);
    if (vert) doc.text(label, x1 + side * 2.4 + (side < 0 ? -0 : 0), (y1 + y2) / 2, { angle: 90, align: 'center' });
    else doc.text(label, (x1 + x2) / 2, y1 - (side > 0 ? 1.6 : -3.6), { align: 'center' });
  }

  async function seiteMarkierungen(c, r, pk, kicker) {
    const pkg = pkgOf(r, pk), rgb = Mappe.hexRgb(pkg.color);
    const views = r.photos.map((_, i) => i).filter((i) => r.results[pk]?.[i]);
    const withMarks = views.filter((i) => (bau(r).marks[pk]?.[i] || []).length);
    for (const i of withMarks.length ? withMarks : views.slice(0, 1)) {
      const list = bau(r).marks[pk]?.[i] || [];
      await c.head(kicker, list.length ? 'Details im Bild' : 'Visualisierung der Ausführung', `Paket ${pkg.name}${views.length > 1 ? ` · Ansicht ${i + 1}` : ''} · KI-Visualisierung, Maße und Lage vor Ort prüfen`, NAVY);
      const legW = list.length ? 88 : 0, iw = c.W - 2 * c.M - (legW ? legW + 8 : 0), ih = c.H - 40 - 20;
      const box = await c.contain(r.results[pk][i], c.M, 38, iw, ih);
      c.pill('Paket ' + pkg.name, box.x + 3, box.y + 3, rgb);
      list.forEach((x, n) => badge(c, box.x + x.x * box.w, box.y + x.y * box.h, n + 1));
      if (!list.length) {
        // kleines Vorher-Bild in die Ecke
        const vw = 52, vh = 39;
        await c.image(r.photos[i], box.x + box.w - vw - 3, box.y + box.h - vh - 3, vw, vh);
        c.pill('Vorher', box.x + box.w - vw, box.y + box.h - vh, [60, 68, 80], [255, 255, 255], 6);
        continue;
      }
      let y = 42; const x0 = c.W - c.M - legW;
      c.caps('Legende', x0, y); y += 6;
      for (const [n, x] of list.entries()) {
        const tl = c.lines(x.text || '–', legW - 10);
        if (y + tl.length * 4 + 6 > c.H - 16) { c.font(7.5, 'normal', GREY); c.text('… weitere Nummern siehe App', x0, y); break; }
        badge(c, x0 + 3, y - 1.2, n + 1, 2.6);
        c.font(8.5, 'bold', INK); c.text(tl, x0 + 8, y);
        y += tl.length * 3.9;
        const sub = [x.sub, ''].filter(Boolean).join(' · ');
        if (sub) { c.font(7, 'normal', GREY); c.text(c.lines(sub, legW - 10)[0], x0 + 8, y); y += 3.4; }
        if (x.url) { c.font(7.5, 'bold', BRASS); c.doc.textWithLink('Produktlink ›', x0 + 8, y, { url: x.url }); y += 3.6; }
        y += 2.6;
      }
    }
  }

  async function seiteAusstattung(c, r, pk, kicker) {
    const pkg = pkgOf(r, pk);
    await c.head(kicker, 'Ausstattung & Produkte', `Paket ${pkg.name}${pkg.fields.beschreibung ? ' · ' + pkg.fields.beschreibung : ''}`);
    const { M, W, H } = c;
    const colW = 118;
    let y = 42;
    c.caps('Ausstattung', M, y); y += 6;
    for (const [k, label] of fieldsFor(r.roomType).filter(([k]) => !['beschreibung', 'sonstiges'].includes(k) && pkg.fields[k]?.trim())) {
      const tl = c.lines(pkg.fields[k].trim(), colW - 42);
      c.font(7, 'bold', GREY);
      const lab = c.lines(label.replace(/\s*\(.*\)/, '').toUpperCase(), 36);
      const nz = Math.max(tl.length, lab.length);
      if (y + nz * 3.9 > H - 18) break;
      c.text(lab, M, y, { lineHeightFactor: 1.5 });
      c.font(8.5, 'normal', INK); c.text(tl, M + 42, y, { lineHeightFactor: 1.3 });
      const unten = y + (nz - 1) * 3.9 + 2;
      c.line(LIGHT, M, unten, M + colW, unten, 0.15);
      y = unten + 4.8;
    }
    // rechts: Produkte (ohne Preise) und Hinweise
    const x0 = M + colW + 12, w = W - M - x0;
    let yr = 42;
    const prods = (pkg.products || []).filter((x) => x.name?.trim());
    c.caps('Produkte', x0, yr); yr += 6;
    if (!prods.length) { c.font(8.5, 'normal', GREY); c.text('Im Moodboard sind keine konkreten Produkte hinterlegt.', x0, yr); yr += 7; }
    for (const x of prods) {
      const area = (FIELD_LIB[x.area]?.[0] || x.area || '').replace(/\s*\(.*\)/, '');
      const tl = c.lines(x.name.trim(), w - 30);
      if (yr + tl.length * 4 + 5 > H - 60) break;
      c.font(7, 'bold', GREY); c.text(c.lines(area.toUpperCase(), 26)[0] || '', x0, yr);
      c.font(8.8, 'bold', INK); c.text(tl, x0 + 28, yr);
      yr += tl.length * 3.9;
      const meta = [x.delivery ? 'Lieferzeit ' + x.delivery : ''].filter(Boolean).join(' · ');
      if (meta) { c.font(7.2, 'normal', GREY); c.text(meta, x0 + 28, yr); yr += 3.5; }
      if (safeUrl(x.url)) { c.font(7.5, 'bold', BRASS); c.doc.textWithLink('Produktlink ›', x0 + 28, yr, { url: safeUrl(x.url) }); yr += 3.6; }
      c.line(LIGHT, x0, yr - 1.9, W - M, yr - 1.9, 0.15); yr += 3;
    }
    const b = bau(r), am = aufmass(r);
    const notes = [['Ausführung', b.hinweis], ['Kundenwünsche', r.wishes], ['Hinweis', r.note], ['Sonstiges aus dem Gespräch', r.otherNotes], ['Notiz Aufmaß', am?.raum.notiz]].filter(([, v]) => v?.trim());
    if (notes.length) {
      yr = Math.max(yr + 4, 120);
      c.fill(CREAM, x0 - 4, yr - 5, w + 4, H - 16 - yr + 4, 2);
      c.caps('Hinweise für die Ausführung', x0, yr + 1); yr += 7;
      for (const [k, v] of notes) {
        const tl = c.lines(v.trim(), w - 6);
        c.font(7, 'bold', GREY); c.text(k.toUpperCase(), x0, yr); yr += 3.6;
        c.font(8.2, 'normal', INK);
        const room = Math.max(1, Math.floor((H - 18 - yr) / 3.7));
        c.text(tl.slice(0, room), x0, yr); yr += Math.min(tl.length, room) * 3.7 + 2.5;
        if (yr > H - 20) break;
      }
    }
  }

  async function seiteGrundriss(c, r, pk, kicker) {
    const am = aufmass(r); if (!am) return;
    const { raum, m: M2 } = am;
    const L = num(raum.teile[0].l), B = num(raum.teile[0].b);
    if (!(L > 0 && B > 0)) return;
    const F = fliesen(r, pk), b = bau(r);
    await c.head(kicker, 'Grundriss & Maße', 'Maße laut Aufmaß in Metern. Lage von Tür, Fenster und Dusche schematisch, vor Ort prüfen.');
    const { doc } = c;
    // Zeichenfläche links
    const ax = c.M + 12, ay = 50, aw = 150, ah = 120;
    const s = Math.min(aw / L, ah / B);
    const w = L * s, h = B * s, x = ax + (aw - w) / 2, y = ay + (ah - h) / 2;
    // Bodenfliesen-Raster
    if (F.boden) {
      const [tw, th] = cm(F.boden).sort((a, b2) => b2 - a);
      doc.setFillColor(...TILE_FILL); doc.rect(x, y, w, h, 'F');
      doc.setDrawColor(...TILE); doc.setLineWidth(0.12);
      const ox = ((L % tw) / 2) * s, oy = ((B % th) / 2) * s;
      for (let xx = x + ox; xx < x + w - 0.01; xx += tw * s) if (xx > x + 0.01) doc.line(xx, y, xx, y + h);
      for (let yy = y + oy; yy < y + h - 0.01; yy += th * s) if (yy > y + 0.01) doc.line(x, yy, x + w, yy);
    }
    // Dusche in der Ecke rechts an der Duschwand
    if (F.dusche > 0) {
      const d = Math.min(F.dusche / 2, Math.min(L, B) * 0.6) * s;
      const corner = { A: [x + w - d, y + h - d], B: [x + w - d, y], C: [x, y], D: [x, y + h - d] }[b.dusche] || [x, y];
      doc.setFillColor(...SHOWER); doc.rect(corner[0], corner[1], d, d, 'F');
      doc.setDrawColor(120, 150, 185); doc.setLineWidth(0.2); doc.setLineDashPattern([1, 1], 0); doc.rect(corner[0], corner[1], d, d); doc.setLineDashPattern([], 0);
      c.font(6.5, 'bold', [90, 120, 160]); doc.text('DUSCHE', corner[0] + d / 2, corner[1] + d / 2 + 1, { align: 'center' });
    }
    // Wände
    doc.setDrawColor(...NAVY); doc.setLineWidth(1.4); doc.rect(x, y, w, h);
    // Tür auf Wand A (unten, Mitte)
    const tuer = raum.oeff.find((o) => o.art === 'Tür' && num(o.b) > 0);
    if (tuer) {
      const tw = num(tuer.b) * s, tx = x + w / 2 - tw / 2;
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.8); doc.line(tx, y + h, tx + tw, y + h);
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.3); doc.line(tx, y + h, tx, y + h - tw);
      // Türbogen
      const steps = 12; let px = tx, py = y + h - tw;
      for (let k = 1; k <= steps; k++) { const a = (Math.PI / 2) * (k / steps); const nx = tx + Math.sin(a) * tw, ny = y + h - Math.cos(a) * tw; doc.line(px, py, nx, ny); px = nx; py = ny; }
      c.font(6.5, 'normal', GREY); doc.text(`Tür ${dez(num(tuer.b))} × ${dez(num(tuer.h))}`, tx + tw / 2, y + h + 9.5, { align: 'center' });
    }
    // Fenster
    const fen = raum.oeff.find((o) => o.art === 'Fenster' && num(o.b) > 0);
    if (fen) {
      const fw = num(fen.b) * s;
      const seg = { A: [x + w / 2 - fw / 2, y + h, x + w / 2 + fw / 2, y + h], B: [x + w, y + h / 2 - fw / 2, x + w, y + h / 2 + fw / 2], C: [x + w / 2 - fw / 2, y, x + w / 2 + fw / 2, y], D: [x, y + h / 2 - fw / 2, x, y + h / 2 + fw / 2] }[b.fenster];
      if (seg && !(b.fenster === 'A' && tuer)) { doc.setDrawColor(150, 190, 225); doc.setLineWidth(1.6); doc.line(...seg); doc.setDrawColor(...NAVY); doc.setLineWidth(0.25); doc.line(...seg); }
    }
    // Wandbuchstaben
    const lab = (t, lx, ly) => { doc.setFillColor(...BRASS); doc.circle(lx, ly, 3, 'F'); c.font(8, 'bold', [255, 255, 255]); doc.text(t, lx, ly + 1.1, { align: 'center' }); };
    lab('A', x + w / 2 + (tuer ? Math.max(12, num(tuer.b) * s / 2 + 6) : 0), y + h + 5); lab('B', x + w + 5, y + h / 2); lab('C', x + w / 2, y - 5); lab('D', x - 5, y + h / 2);
    // Maßketten
    dim(c, x, y + h + 15, x + w, y + h + 15, m(L), { side: 1 });
    dim(c, x + w + 13, y, x + w + 13, y + h, m(B), { side: 1 });
    // Tabelle rechts
    const tx0 = c.M + 185, tw0 = c.W - c.M - tx0;
    let ty = 46;
    const zeile = (k, v) => { c.font(7.2, 'bold', GREY); c.text(k.toUpperCase(), tx0, ty, { charSpace: 0.2 }); c.font(9, 'normal', INK); c.text(v, tx0 + tw0, ty, { align: 'right' }); ty += 6; c.line(LIGHT, tx0, ty - 3.8, tx0 + tw0, ty - 3.8, 0.15); };
    c.caps('Raum', tx0, ty - 4); ty += 3;
    zeile('Länge × Breite', `${m(L)} × ${m(B)}`);
    if (raum.teile.length > 1) zeile('Weitere Teilflächen', raum.teile.slice(1).filter((t) => num(t.l) && num(t.b)).map((t) => `${dez(num(t.l))} × ${dez(num(t.b))}`).join(', ') + ' (nicht gezeichnet)');
    zeile('Raumhöhe', m(M2.hoehe));
    zeile('Bodenfläche', dez(M2.boden) + ' m²');
    zeile('Wandfläche netto', dez(M2.wand) + ' m²');
    zeile('Umfang', m(M2.umfang));
    for (const o of raum.oeff.filter((o) => num(o.b) > 0)) zeile(o.art, `${num(o.n) || 1} × ${dez(num(o.b))} × ${dez(num(o.h))} m`);
    if (F.dusche) zeile('Duschbereich (Wandlänge)', m(F.dusche));
    ty += 4; c.caps('Fliesen', tx0, ty - 2); ty += 5;
    if (F.boden) zeile('Boden', `${F.boden.replace('x', ' × ')} cm`);
    if (F.wand && F.hoehe) zeile('Wand', `${F.wand.replace('x', ' × ')} cm, ${VERBAND[F.verband] || ''}`);
    if (F.wand && F.hoehe) zeile('Fliesenhöhe', F.hoehe >= M2.hoehe - 0.01 ? 'raumhoch' : m(F.hoehe) + (F.dusche ? ', Dusche raumhoch' : ''));
    const wandQm = F.wand && F.hoehe ? wandFliesenFlaeche(raum, M2, F) : 0;
    if (F.boden) zeile('Bodenfliesen inkl. 10 %', dez(M2.boden * 1.1) + ' m²');
    if (wandQm) zeile('Wandfliesen inkl. 10 %', dez(wandQm * 1.1) + ' m²');
    if (raum.skizze) { ty += 4; if (ty < c.H - 50) { c.caps('Skizze / Plan vor Ort', tx0, ty); await c.contain(raum.skizze, tx0, ty + 3, tw0, c.H - 20 - ty - 3); } }
  }
  function wandFliesenFlaeche(raum, M2, F) {
    const base = M2.wandbis(Math.min(F.hoehe, M2.hoehe));
    const extra = F.dusche && F.hoehe < M2.hoehe ? F.dusche * (M2.hoehe - F.hoehe) : 0;
    return base + extra;
  }

  /** Fliesenspiegel: Ansicht der vier Wände mit Fliesenraster, Öffnungen und Maßen. */
  async function seiteFliesenspiegel(c, r, pk, kicker) {
    const am = aufmass(r); if (!am) return;
    const F = fliesen(r, pk); if (!F.wand || !F.hoehe) return;
    const { raum, m: M2 } = am;
    const L = num(raum.teile[0].l), B = num(raum.teile[0].b), H = M2.hoehe || 2.5;
    if (!(L > 0 && B > 0)) return;
    const b = bau(r);
    const [f1, f2] = cm(F.wand); const tw = Math.max(f1, f2), th = Math.min(f1, f2); // quer verlegt
    await c.head(kicker, 'Fliesenspiegel', `Wandfliese ${F.wand.replace('x', ' × ')} cm quer, ${VERBAND[F.verband]}, Raster mittig. ${F.hoehe >= H - 0.01 ? 'Raumhoch gefliest.' : `Fliesenhöhe ${m(F.hoehe)}${F.dusche ? ', Duschbereich raumhoch' : ''}.`}`);
    const { doc } = c;
    const tuer = raum.oeff.find((o) => o.art === 'Tür' && num(o.b) > 0);
    const fen = raum.oeff.find((o) => o.art === 'Fenster' && num(o.b) > 0);
    const cellW = (c.W - 2 * c.M - 10) / 2, cellH = 72;
    const next = { A: 'B', B: 'C', C: 'D', D: 'A' };
    WAENDE.forEach((wand, k) => {
      const len = wand === 'A' || wand === 'C' ? L : B;
      const cx = c.M + (k % 2) * (cellW + 10), cy = 40 + Math.floor(k / 2) * (cellH + 8);
      const s = Math.min((cellW - 26) / len, (cellH - 20) / H);
      const ww = len * s, wh = H * s, x = cx + 16 + (cellW - 26 - ww) / 2, y = cy + 6;
      const y0 = y + wh; // Fußboden
      // geflieste Bereiche: Grundhöhe + Duschbereich (rechte Ecke der Duschwand, linke Ecke der folgenden Wand)
      const zones = [[0, len, Math.min(F.hoehe, H)]];
      if (F.dusche && F.hoehe < H) {
        const half = Math.min(F.dusche / 2, len);
        if (wand === b.dusche) zones.push([len - half, len, H]);
        if (wand === next[b.dusche]) zones.push([0, half, H]);
      }
      doc.setDrawColor(...TILE); doc.setLineWidth(0.12);
      for (const [z0, z1, zh] of zones) {
        const zx = x + z0 * s, zw = (z1 - z0) * s, zy = y0 - zh * s;
        doc.setFillColor(...(zh > F.hoehe + 0.01 ? SHOWER : TILE_FILL)); doc.rect(zx, zy, zw, zh * s, 'F');
        doc.setDrawColor(...TILE);
        const rows = Math.ceil(zh / th - 1e-9);
        for (let row = 0; row < rows; row++) {
          const ry = y0 - Math.min((row + 1) * th, zh) * s, ryb = y0 - row * th * s;
          if (row) doc.line(zx, ryb, zx + zw, ryb);
          const shift = F.verband === 'halb' ? (row % 2) * tw / 2 : F.verband === 'drittel' ? (row % 3) * tw / 3 : 0;
          const ox = ((len % tw) / 2 + shift) % tw;
          for (let xx = ox; xx < len; xx += tw) if (xx > z0 + 0.005 && xx < z1 - 0.005) doc.line(x + xx * s, ry, x + xx * s, ryb);
        }
        doc.setDrawColor(...BRASS); doc.setLineWidth(0.35); doc.line(zx, zy, zx + zw, zy); doc.setLineWidth(0.12);
      }
      // Öffnungen
      const opening = (ob, oh, sill, label) => {
        const owx = Math.min(ob, len) * s, ox = x + (ww - owx) / 2, oy = y0 - (sill + oh) * s;
        doc.setFillColor(255, 255, 255); doc.rect(ox, oy, owx, oh * s, 'F');
        doc.setDrawColor(...NAVY); doc.setLineWidth(0.3); doc.rect(ox, oy, owx, oh * s);
        c.font(6, 'normal', GREY); doc.text(label, ox + owx / 2, oy + (oh * s) / 2 + 1, { align: 'center' });
      };
      if (wand === 'A' && tuer) opening(num(tuer.b), Math.min(num(tuer.h) || 2.01, H), 0, `Tür ${dez(num(tuer.b))}`);
      if (wand === b.fenster && fen && !(wand === 'A' && tuer)) opening(num(fen.b), num(fen.h) || 1, Math.min(0.9, H - (num(fen.h) || 1)), `Fenster ${dez(num(fen.b))} × ${dez(num(fen.h))}`);
      // Umriss + Boden
      doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.rect(x, y, ww, wh);
      doc.setLineWidth(1); doc.line(x - 2, y0, x + ww + 2, y0);
      // Beschriftung
      doc.setFillColor(...BRASS); doc.circle(cx + 4, cy + 3, 3, 'F'); c.font(8, 'bold', [255, 255, 255]); doc.text(wand, cx + 4, cy + 4.1, { align: 'center' });
      c.font(7.5, 'bold', NAVY); doc.text({ A: 'Türwand', B: 'rechts', C: 'gegenüber', D: 'links' }[wand], cx + 9, cy + 4.1);
      dim(c, x, y0 + 5.5, x + ww, y0 + 5.5, m(len));
      dim(c, x - 5, y, x - 5, y0, m(H), { side: -1 });
      if (F.hoehe < H - 0.01) { c.font(6.5, 'bold', BRASS); doc.text(m(F.hoehe), x + ww + 1.5, y0 - F.hoehe * s + 1); }
    });
    c.font(7, 'normal', GREY);
    c.text((F.dusche && F.hoehe < H ? 'Hellblau: Duschbereich raumhoch, abgedichtet. ' : '') + 'Messinglinie: Oberkante Fliese. Raster mittig auf die Wand gesetzt, Schnittfliesen an beiden Rändern gleich.', c.M, c.H - 15);
  }

  async function seiteListen(c, r, pk, kicker, { material, leistung }) {
    const I = A(); if (!I || !r.aufmass?.raeume?.some((x) => I.masse(x).boden > 0)) return;
    const positionen = r.angebot?.geaendert && r.angebot.paket === pk && r.angebot.positionen ? r.angebot.positionen : I.erzeuge(r, pk).positionen;
    const mat = material ? I.materialliste(r, pk, positionen) : [];
    const lv = leistung ? I.summen(positionen).zeilen : [];
    if (!mat.length && !lv.length) return;
    const pkg = pkgOf(r, pk);
    const fmtQ = (q) => q.toLocaleString('de-DE', { maximumFractionDigits: q % 1 ? 1 : 0 });
    // zweispaltig: links Leistungen, rechts Material (wenn beides)
    const both = mat.length && lv.length;
    const colW = both ? (c.W - 2 * c.M - 10) / 2 : c.W - 2 * c.M;
    let page = 0;
    const startPage = async () => { await c.head(kicker, both ? 'Leistungen & Material' : lv.length ? 'Leistungen' : 'Materialliste', `Paket ${pkg.name} · Mengen aus dem Aufmaß, ohne Preise · Richtwerte, vor Bestellung prüfen${page++ ? ' · Fortsetzung' : ''}`); };
    await startPage();
    const col = async (x0, title, rows, render) => {
      let y = 44; c.caps(title, x0, y); y += 6;
      let grp = null;
      for (const row of rows) {
        const g = render.group(row);
        const tl = c.lines(render.text(row), colW - 32);
        const need = (g !== grp ? 7 : 0) + tl.length * 3.7 + 2.6;
        if (y + need > c.H - 16) return rows.indexOf(row);
        if (g !== grp) { grp = g; y += 1.5; c.font(7.5, 'bold', NAVY); c.text(String(g || 'Allgemein').toUpperCase(), x0, y, { charSpace: 0.3 }); y += 4.5; }
        c.font(8.2, 'normal', INK); c.text(tl, x0, y, { lineHeightFactor: 1.27 });
        c.font(8.2, 'bold', INK); c.text(render.qty(row), x0 + colW, y, { align: 'right' });
        let unten = y + (tl.length - 1) * 3.7;
        const h = render.hint?.(row); if (h) { unten += 3.2; c.font(6.8, 'normal', GREY); c.text(c.lines(h, colW - 32)[0], x0, unten); }
        c.line(LIGHT, x0, unten + 1.8, x0 + colW, unten + 1.8, 0.12); y = unten + 6;
      }
      return -1;
    };
    let lvRest = lv, matRest = mat;
    while (lvRest.length || matRest.length) {
      let x0 = c.M;
      if (lvRest.length) {
        const cut = await col(x0, 'Leistungen', lvRest, { group: (z) => z.raum || 'Allgemein', text: (z) => z.it.text + (z.bem ? ' – ' + z.bem : ''), qty: (z) => `${fmtQ(z.menge)} ${z.it.einheit}` });
        lvRest = cut < 0 ? [] : lvRest.slice(Math.max(cut, 1));
        x0 += colW + 10;
      }
      if (matRest.length) {
        const cut = await col(both ? c.M + colW + 10 : c.M, 'Material', matRest, { group: (x) => x.gruppe, text: (x) => x.text, qty: (x) => `${fmtQ(x.menge)} ${x.einheit}`, hint: (x) => x.hinweis });
        matRest = cut < 0 ? [] : matRest.slice(Math.max(cut, 1));
      }
      if (lvRest.length || matRest.length) await startPage();
    }
  }

  async function baue(w, rs) {
    const c = await Mappe.start('Baumappe · ohne Preise');
    try { await A()?.preisliste(); await A()?.vorlagen(); } catch {}
    const first = rs[0], fpk = paket(first);
    const date = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    await Mappe.cover(c, {
      tag: 'Baumappe · für die Ausführung',
      title: 'Baumappe',
      sub: rs.map((r) => r.room || roomType(r.roomType).name).join(' · '),
      meta: [['Bauherr', w.customer], ['Objekt', w.address], ['Stand', date], ['Bauleitung', c.F.ansprech ? `${c.F.ansprech}${c.F.tel ? ' · ' + c.F.tel : ''}` : c.F.tel]],
      hero: firstResult(first, fpk),
      chips: [['Ohne Preise', NAVY.map((v) => v + 30)]],
    });
    // Übersicht
    await c.head('Übersicht', 'Räume und Ausführung', 'Alle Maße laut Aufmaß. Vor Beginn vor Ort prüfen.');
    const cols = [['Raum', 52], ['Paket', 30], ['Maße (L × B × H)', 52], ['Fläche', 24], ['Fliesen Wand / Boden', 58], ['Nummern', 22]];
    const xs = []; cols.reduce((x, [, cw]) => (xs.push(x), x + cw), c.M);
    let y = 46;
    c.fill(NAVY, c.M, y - 5, c.W - 2 * c.M, 7.5, 1.2);
    cols.forEach(([t], i) => { c.font(7, 'bold', [255, 255, 255]); c.doc.text(t.toUpperCase(), xs[i] + 2.5, y, { charSpace: 0.3 }); });
    y += 9;
    let zebra = false;
    for (const r of rs) {
      const pk = paket(r), am = aufmass(r), F = fliesen(r, pk);
      if ((zebra = !zebra)) c.fill(SOFT, c.M, y - 5, c.W - 2 * c.M, 9);
      const vals = [r.room || roomType(r.roomType).name, pkgOf(r, pk).name, am ? `${dez(num(am.raum.teile[0].l))} × ${dez(num(am.raum.teile[0].b))} × ${dez(am.m.hoehe)} m` : 'kein Aufmaß', am ? dez(am.m.boden, 1) + ' m²' : '–', [F.wand && F.hoehe ? F.wand : '', F.boden].filter(Boolean).join(' / ') || '–', String(anzahl(r) || '–')];
      vals.forEach((v, i) => { c.font(8.5, i ? 'normal' : 'bold', INK); c.text(c.lines(v, cols[i][1] - 4)[0], xs[i] + 2.5, y); });
      y += 9;
      if (y > c.H - 30) break;
    }
    c.font(8, 'normal', GREY);
    c.text(c.lines('Wandbezeichnung in allen Plänen: A = Türwand, von innen gesehen B rechts, C gegenüber, D links. Nummern im Bild verweisen auf die Legende daneben.', c.W - 2 * c.M), c.M, Math.min(y + 8, c.H - 22));
    // je Raum
    for (const r of rs) {
      const pk = paket(r);
      const kicker = r.room || roomType(r.roomType).name;
      await seiteMarkierungen(c, r, pk, kicker);
      await seiteAusstattung(c, r, pk, kicker);
      await seiteGrundriss(c, r, pk, kicker);
      await seiteFliesenspiegel(c, r, pk, kicker);
      await seiteListen(c, r, pk, kicker, { material: w.bau?.material !== false, leistung: w.bau?.leistung !== false });
    }
    await Mappe.schluss(c, {
      title: 'Hinweise für die Ausführung',
      steps: [
        ['Vor Beginn prüfen', 'Maße, Anschlüsse, Untergründe und Lage der Leitungen vor Ort nachmessen. Abweichungen zum Plan sofort melden.'],
        ['Abstimmen', 'Änderungen an Material, Format oder Ausführung nur nach Rücksprache mit der Bauleitung. Fotos von Zwischenständen helfen.'],
        ['Sauber übergeben', 'Arbeitsbereich besenrein hinterlassen, Restmaterial kennzeichnen und die Fertigstellung mit Fotos melden.'],
      ],
      note: 'Die Visualisierungen sind KI-Bilder und zeigen die gewünschte Wirkung. Maßgeblich für die Ausführung sind Aufmaß, Produktangaben und die Abstimmung mit der Bauleitung.',
    });
    c.footer();
    return c.doc;
  }

  return { view, markierungen, anzahl, fotoEntfernt, paket, baue, _intern: { fliesen, aufmass, bau } };
})();
