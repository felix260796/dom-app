'use strict';
/* DOM – Bilder & Dokumentation je Objekt eines Kunden (unabhängig von der KI):
 * Bestand, Baufortschritt, Abnahme, Sonstiges – mit Datum. Dazu automatisch die Fotos und
 * Visualisierungen aus den Räumen der Projekte an diesem Objekt.
 * Speicher: Liste 'bilder:<kundeId>:<objektId>' [{ id, t, phase, text, thumb }] und jedes Bild einzeln
 * als 'bild:<id>' (Data-URL, verkleinert). So überträgt der Cloud-Abgleich nur neue Bilder.
 * Baut auf core.js/app.js/kunden.js/projekt.js auf. */
window.Bilder = (() => {
  const PHASEN = [['bestand', 'Bestand'], ['bau', 'Baufortschritt'], ['abnahme', 'Abnahme'], ['sonst', 'Sonstiges']];
  const phName = (id) => (PHASEN.find((p) => p[0] === id) || PHASEN[3])[1];
  const listKey = (kid, oid) => `bilder:${kid}:${oid || 'ohne'}`;
  const liste = async (kid, oid) => (await kvGet(listKey(kid, oid))) || [];
  const tag = (t) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  let phase = 'bestand', filter = '';

  /** Fotos und Visualisierungen aus allen Räumen der Projekte an diesem Objekt. */
  async function raumBilder(kid, oid) {
    const idx = (await projectIndex()).filter((x) => x.kundeId === kid && (x.objektId || '') === (oid || ''));
    const out = [];
    for (const x of idx) {
      const w = state.wohnung?.id === x.id ? state.wohnung : await kvGet('wohnung:' + x.id);
      if (!w) continue;
      for (const r of await Projekt.raeume(w)) {
        const rn = r.room || roomType(r.roomType).name;
        r.photos.forEach((ph, i) => out.push({ data: ph, label: `${rn} · Foto ${i + 1}` }));
        for (const pkg of roomPackages(r)) {
          (r.results?.[pkg.id] || []).forEach((im, i) => im && out.push({ data: im, label: `${rn} · ${pkg.name}${i ? ', Ansicht ' + (i + 1) : ''}` }));
          (r.evening?.[pkg.id] || []).forEach((im) => im && out.push({ data: im, label: `${rn} · ${pkg.name} Abend` }));
          if (topOf(r, pkg.id)) out.push({ data: topOf(r, pkg.id), label: `${rn} · ${pkg.name} Draufsicht` });
        }
      }
    }
    return out;
  }
  /** Anzahl eigener Bilder (für Kacheln). */
  const anzahl = async (kid, oid) => (await liste(kid, oid)).length;

  /** ctx = { kundeId, objektId, titel, zurueck: { label, fn } } */
  async function view(ctx) {
    state.project = null;
    const { kundeId: kid, objektId: oid } = ctx;
    const list = (await liste(kid, oid)).sort((a, b) => b.t - a.t);
    const rb = await raumBilder(kid, oid);
    header('Bilder & Dokumentation', ctx.titel || '', ctx.zurueck);
    const shown = filter ? list.filter((b) => b.phase === filter) : list;
    const count = (ph) => list.filter((b) => b.phase === ph).length;
    // nach Phase, darin nach Tag
    const gruppen = PHASEN.map(([id, name]) => ({ id, name, list: shown.filter((b) => b.phase === id) })).filter((g) => g.list.length);
    const tage = (l) => { const m = new Map(); for (const b of l) { const d = new Date(b.t).toDateString(); if (!m.has(d)) m.set(d, []); m.get(d).push(b); } return [...m.values()]; };
    main().innerHTML = `
      <div class="card gadd">
        <label style="margin-top:0">Neue Bilder gehören zu</label>
        <div class="seg2 full">${PHASEN.map(([id, n]) => `<button data-ph="${id}" class="${phase === id ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn big" id="gCam" style="flex:1">${icon('camera')} Foto machen</button>
          <button class="btn big secondary" id="gGal" style="flex:1">${icon('image')} Aus Fotos</button>
        </div>
        <p class="hint" style="margin-bottom:0">Viele Bilder auf einmal: mit der iPhone-Kamera fotografieren, dann hier „Aus Fotos“ und alle markieren. Bilder werden verkleinert gespeichert, mit Datum.</p>
      </div>
      ${list.length ? `<div class="chips gfilter">
        <button class="qchip ${filter ? '' : 'on'}" data-f="">Alle ${list.length}</button>
        ${PHASEN.filter(([id]) => count(id)).map(([id, n]) => `<button class="qchip ${filter === id ? 'on' : ''}" data-f="${id}">${n} ${count(id)}</button>`).join('')}</div>` : ''}
      ${gruppen.map((g) => `<div class="sec-h"><h2>${esc(g.name)}</h2><span class="count">${g.list.length}</span></div>
        ${tage(g.list).map((d) => `<div class="o-h">${icon('file')}<span>${esc(tag(d[0].t))} · ${d.length} ${d.length === 1 ? 'Bild' : 'Bilder'}</span></div>
          <div class="ggrid">${d.map((b) => `<button class="gb" data-b="${b.id}"><img src="${b.thumb}" alt="" loading="lazy">${b.text ? '<i class="gb-t"></i>' : ''}</button>`).join('')}</div>`).join('')}`).join('')}
      ${!list.length ? `<div class="empty-state">${icon('camera')}<b>Noch keine Bilder</b><span>Fotos vom Bestand, vom Baufortschritt und von der Abnahme landen hier, sortiert nach Datum.</span></div>` : ''}
      ${rb.length ? `<details class="more card" style="margin-top:16px"><summary>${icon('sparkle')}<span>Aus den Räumen<small>${rb.length} Fotos und Visualisierungen</small></span>${icon('chevron', 'more-chev')}</summary>
        <div class="ggrid" style="margin-top:8px">${rb.map((x, i) => `<button class="gb" data-rb="${i}"><img src="${x.data}" alt="" loading="lazy"></button>`).join('')}</div></details>` : ''}`;
    const again = () => { const y = window.scrollY; view(ctx).then(() => window.scrollTo(0, y)); };
    $$('[data-ph]').forEach((b) => (b.onclick = () => { phase = b.dataset.ph; $$('[data-ph]').forEach((x) => x.classList.toggle('on', x === b)); }));
    $$('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; again(); }));
    const add = async (camera) => {
      const files = await pickFiles({ camera, multiple: !camera });
      if (!files.length) return;
      const cur = await liste(kid, oid);
      let n = 0;
      for (const f of files) {
        try {
          const src = await fileToDataUrl(f);
          const id = uid(), data = await resize(src, 1600, 'image/jpeg', 0.8);
          await kvSet('bild:' + id, data);
          cur.push({ id, t: f.lastModified && !camera ? f.lastModified : Date.now(), phase, text: '', thumb: await resize(data, 320, 'image/jpeg', 0.7) });
          n++;
          if (files.length > 3) toast(`Speichere ${n} von ${files.length} …`, 4000);
        } catch (e) { console.error(e); }
      }
      await kvSet(listKey(kid, oid), cur);
      toast(`${n} ${n === 1 ? 'Bild' : 'Bilder'} unter „${phName(phase)}“ gespeichert`);
      filter = ''; again();
    };
    $('#gCam').onclick = () => add(true);
    $('#gGal').onclick = () => add(false);
    const order = gruppen.flatMap((g) => g.list.map((b) => b.id));
    const ownItems = order.map((id) => ({ own: list.find((b) => b.id === id) }));
    $$('[data-b]').forEach((b) => (b.onclick = () => gross(ctx, ownItems, order.indexOf(b.dataset.b), again)));
    $$('[data-rb]').forEach((b) => (b.onclick = () => gross(ctx, rb.map((x) => ({ data: x.data, label: x.label })), +b.dataset.rb, again)));
  }

  /** Bild groß: blättern (Pfeile oder wischen), teilen/sichern; eigene Bilder beschriften, Phase ändern, löschen. */
  function gross(ctx, all, i, nachher) {
    const el = document.createElement('div');
    el.className = 'gview';
    let changed = false;
    const close = () => { el.remove(); document.removeEventListener('keydown', keys); if (changed) nachher(); };
    const show = async () => {
      const x = all[i], own = x.own;
      const data = own ? (await kvGet('bild:' + own.id)) || own.thumb : x.data;
      el.innerHTML = `<div class="gv-top"><span>${i + 1} / ${all.length}${own ? ` · ${esc(tag(own.t))}` : ''}</span><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
        <div class="gv-img"><img src="${data}" alt="">${i > 0 ? `<button class="gv-nav l" data-p aria-label="Vorheriges">${icon('back')}</button>` : ''}${i < all.length - 1 ? `<button class="gv-nav r" data-n aria-label="Nächstes">${icon('chevron')}</button>` : ''}</div>
        <div class="gv-bar">
          ${own ? `<div class="seg2 full">${PHASEN.map(([id, n]) => `<button data-gp="${id}" class="${own.phase === id ? 'on' : ''}">${n}</button>`).join('')}</div>
            <input type="text" id="gvText" value="${esc(own.text)}" placeholder="Notiz, z. B. Wasserschaden hinter WC">` : `<span class="gv-l">${esc(x.label)}</span>`}
          <div class="row"><button class="btn secondary" data-share style="flex:1">${icon('share')} Teilen / Sichern</button>${own ? `<button class="btn danger" data-del aria-label="Löschen">${icon('trash')}</button>` : ''}</div>
        </div>`;
      $('[data-x]', el).onclick = close;
      if ($('[data-p]', el)) $('[data-p]', el).onclick = () => { i--; show(); };
      if ($('[data-n]', el)) $('[data-n]', el).onclick = () => { i++; show(); };
      $('[data-share]', el).onclick = async () => {
        const blob = await (await fetch(data)).blob();
        const name = `DOM_${(ctx.titel || 'Objekt').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${i + 1}.jpg`;
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      };
      if (own) {
        const upd = async (f) => { const l = await liste(ctx.kundeId, ctx.objektId); const b = l.find((y) => y.id === own.id); if (b) { f(b); await kvSet(listKey(ctx.kundeId, ctx.objektId), l); } changed = true; };
        $('#gvText', el).oninput = debounce((e) => { own.text = e.target.value; upd((b) => (b.text = own.text)); }, 500);
        $$('[data-gp]', el).forEach((b) => (b.onclick = () => { own.phase = b.dataset.gp; upd((y) => (y.phase = own.phase)); $$('[data-gp]', el).forEach((z) => z.classList.toggle('on', z === b)); }));
        $('[data-del]', el).onclick = async () => {
          if (!confirm('Dieses Bild löschen?')) return;
          await kvSet(listKey(ctx.kundeId, ctx.objektId), (await liste(ctx.kundeId, ctx.objektId)).filter((y) => y.id !== own.id));
          await kvDel('bild:' + own.id);
          changed = true; all.splice(i, 1);
          if (!all.length) return close();
          i = Math.min(i, all.length - 1); show();
        };
      }
    };
    const keys = (e) => { if (e.target.closest?.('input')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft' && i > 0) { i--; show(); } if (e.key === 'ArrowRight' && i < all.length - 1) { i++; show(); } };
    document.addEventListener('keydown', keys);
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.target.closest('input, button') ? null : e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx > 50 && i > 0) { i--; show(); } else if (dx < -50 && i < all.length - 1) { i++; show(); }
    });
    document.body.appendChild(el);
    show();
  }

  return { view, anzahl, PHASEN };
})();
