'use strict';
/* DOM – Bilder & Dokumentation je Objekt eines Kunden (unabhängig von der KI).
 * Eigene, benennbare Ordner (Vorgabe: Bestand, Baufortschritt, Abnahme, Sonstiges; z. B. „Baufortschritt (10.11.2026)“).
 * Jedes Bild gehört zum Objekt und optional zu einem Projekt („Badumbau“). Im Objekt sieht man alle Bilder,
 * im Projekt dieselben Ordner, vorgefiltert auf das Projekt. Dazu die Fotos und Visualisierungen aus den Räumen.
 * Speicher: 'bilder:<kundeId>:<objektId>' { ordner:[{ id, name, projektId }] (eigene Ordner gehören zu einem Projekt), bilder:[{ id, t, ordner, projektId, text, thumb }] }
 * und jedes Bild einzeln als 'bild:<id>' (verkleinert), damit der Cloud-Abgleich nur Neues überträgt.
 * Ältere Einträge (nur eine Liste mit „phase“) werden beim Lesen umgestellt. */
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
    main().innerHTML = `
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
      <div class="sec-h"><h2>Projekte</h2><span class="count">${kacheln.length}</span></div>
      <p class="hint" style="margin-top:-4px">Die Bilder liegen beim jeweiligen Projekt, darin deine eigenen Ordner.</p>
      <div class="fgrid">${kacheln.map((p) => { const l = d.bilder.filter((b) => passt(b, p.id)).sort((a, b) => b.t - a.t); return `
        <button class="fold ${p.frei && !l.length ? 'add' : ''}" data-pp="${p.id}">${p.frei && !l.length ? `<span class="f-cov"><span class="f-empty">${icon('plus')}</span></span>` : deckel(l)}
          <b>${esc(p.frei && !l.length ? 'Bilder ohne Projekt' : p.name)}</b><span>${p.frei && !l.length ? 'z. B. Besichtigung, Schäden, Zähler' : `${l.length} ${l.length === 1 ? 'Bild' : 'Bilder'}${p.nr ? ' · ' + esc(p.nr) : ''}`}</span>
        </button>`; }).join('')}</div>`;
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
          <button class="btn big" id="gCam" style="flex:1">${icon('camera')} Foto machen</button>
          <button class="btn big secondary" id="gGal" style="flex:1">${icon('image')} Aus Fotos</button>
        </div>
        <p class="hint" style="margin-bottom:0">Viele Bilder auf einmal: mit der iPhone-Kamera fotografieren, dann hier „Aus Fotos“ und alle markieren. Bilder werden verkleinert gespeichert.</p>
      </div>
      <div class="ggrid">${list.map((b) => `<button class="gb" data-b="${b.id}"><img src="${b.thumb}" alt="" loading="lazy">${b.text ? '<i class="gb-t"></i>' : ''}</button>`).join('')}</div>
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
    $('#gCam').onclick = () => add(true);
    $('#gGal').onclick = () => add(false);
    $$('[data-b]').forEach((b) => (b.onclick = () => gross(ctx, list.map((x) => ({ own: x })), list.findIndex((x) => x.id === b.dataset.b), again, { ordner: d.ordner, pr })));
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

  /** Bild groß: blättern (Pfeile oder wischen), teilen/sichern; eigene Bilder: Notiz, Ordner, Projekt, löschen. */
  function gross(ctx, all, i, nachher, opt = {}) {
    const el = document.createElement('div');
    el.className = 'gview';
    let changed = false;
    const close = () => { el.remove(); document.removeEventListener('keydown', keys); if (changed) nachher(); };
    const upd = async (id, f) => { const d = await laden(ctx.kundeId, ctx.objektId); const b = d.bilder.find((y) => y.id === id); if (b) { f(b); await speichern(ctx.kundeId, ctx.objektId, d); } changed = true; };
    const show = async () => {
      const x = all[i], own = x.own;
      const data = own ? (await kvGet('bild:' + own.id)) || own.thumb : x.data;
      el.innerHTML = `<div class="gv-top"><span>${i + 1} / ${all.length}${own ? ` · ${esc(tag(own.t))}` : ''}</span><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
        <div class="gv-img"><img src="${data}" alt="">${i > 0 ? `<button class="gv-nav l" data-p aria-label="Vorheriges">${icon('back')}</button>` : ''}${i < all.length - 1 ? `<button class="gv-nav r" data-n aria-label="Nächstes">${icon('chevron')}</button>` : ''}</div>
        <div class="gv-bar">
          ${own ? `<div class="row gv-sel">
              <select id="gvOrd" aria-label="Ordner">${opt.ordner.map((o) => `<option value="${o.id}" ${o.id === own.ordner ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
              ${opt.pr.length ? `<select id="gvPr" aria-label="Projekt"><option value="">Ohne Projekt</option>${opt.pr.map((p) => `<option value="${p.id}" ${p.id === own.projektId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
            </div>
            <input type="text" id="gvText" value="${esc(own.text)}" placeholder="Notiz, z. B. Wasserschaden hinter WC">` : `<span class="gv-l">${esc(x.label)}</span>`}
          <div class="row"><button class="btn secondary" data-share style="flex:1">${icon('share')} Teilen / Sichern</button>${own ? `<button class="btn danger" data-del aria-label="Löschen">${icon('trash')}</button>` : ''}</div>
        </div>`;
      $('[data-x]', el).onclick = close;
      if ($('[data-p]', el)) $('[data-p]', el).onclick = () => { i--; show(); };
      if ($('[data-n]', el)) $('[data-n]', el).onclick = () => { i++; show(); };
      $('[data-share]', el).onclick = async () => {
        const blob = await (await fetch(data)).blob();
        const name = `DOM_${(ctx.titel || 'Objekt').replace(/[^\wäöüÄÖÜß-]+/g, '_').slice(0, 60)}_${i + 1}.jpg`;
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      };
      if (own) {
        $('#gvText', el).oninput = debounce((e) => { own.text = e.target.value; upd(own.id, (b) => (b.text = own.text)); }, 500);
        $('#gvOrd', el).onchange = (e) => { own.ordner = e.target.value; upd(own.id, (b) => (b.ordner = own.ordner)); toast('In anderen Ordner verschoben'); };
        if ($('#gvPr', el)) $('#gvPr', el).onchange = (e) => { own.projektId = e.target.value; upd(own.id, (b) => (b.projektId = own.projektId)); };
        $('[data-del]', el).onclick = async () => {
          if (!loeschFrage('Dieses Bild löschen?')) return;
          const d = await laden(ctx.kundeId, ctx.objektId);
          d.bilder = d.bilder.filter((y) => y.id !== own.id); await speichern(ctx.kundeId, ctx.objektId, d);
          await kvDel('bild:' + own.id);
          changed = true; all.splice(i, 1);
          if (!all.length) return close();
          i = Math.min(i, all.length - 1); show();
        };
      }
    };
    const keys = (e) => { if (e.target.closest?.('input, select')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft' && i > 0) { i--; show(); } if (e.key === 'ArrowRight' && i < all.length - 1) { i++; show(); } };
    document.addEventListener('keydown', keys);
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.target.closest('input, button, select') ? null : e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx > 50 && i > 0) { i--; show(); } else if (dx < -50 && i < all.length - 1) { i++; show(); }
    });
    document.body.appendChild(el);
    show();
  }

  /** Ein fertiges Bild in einen Ordner legen (Ordner wird angelegt, wenn es ihn noch nicht gibt). Für die Kamera oben. */
  async function ablegen(kid, oid, data, ordnerName, projektId = '') {
    const dd = await laden(kid, oid);
    let o = dd.ordner.find((x) => x.name === ordnerName && (x.projektId || '') === projektId);
    if (!o) { o = { id: uid(), name: ordnerName, projektId }; dd.ordner.push(o); }
    const id = uid();
    await kvSet('bild:' + id, data);
    dd.bilder.push({ id, t: Date.now(), ordner: o.id, projektId, text: '', thumb: await resize(data, 320, 'image/jpeg', 0.7) });
    await speichern(kid, oid, dd);
    return o;
  }
  return { view, anzahl, ablegen };
})();
