'use strict';
/* DOM – Schnellangebot: grober Preis ohne Kundendaten, z. B. am Telefon.
 * Räume mit Grundfläche + Paket → Positionen aus den Paket-Vorlagen (wie im echten Angebot),
 * dazu einzelne Punkte aus der Preisliste antippen. Ergebnis: Preisrichtung (± Spanne aus den Einstellungen).
 * Mit einem Tipp wird daraus ein Projekt beim Kunden (Räume, Aufmaß und Positionen werden übernommen).
 * Speicher: 'schnellangebot'. Baut auf angebot.js (Angebot._intern), kunden.js und projekt.js auf. */
window.Schnell = (() => {
  const A = () => window.Angebot._intern;
  const KEY = 'schnellangebot';
  // Innenräume (für Fassade und Garten bedeutet „m²“ etwas anderes, die gehen über das richtige Angebot)
  const TYPEN = () => ROOM_TYPES.filter((r) => !r.outdoor);
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const eur = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
  const eur2 = (x) => x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const mg = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  let S = null;
  const leer = () => ({ raeume: [{ id: uid(), rt: 'bad', qm: '' }], paket: 'standard', aus: [], extra: [] });
  async function laden() { if (!S) S = (await kvGet(KEY)) || leer(); S.aus ??= []; S.extra ??= []; return S; }
  const speichern = debounce(() => kvSet(KEY, S), 400);

  /** Raumnamen eindeutig machen (Badezimmer, Badezimmer 2, …). */
  function namen() {
    const seen = {};
    return S.raeume.map((r) => { const b = roomType(r.rt).name; seen[b] = (seen[b] || 0) + 1; return seen[b] > 1 ? `${b} ${seen[b]}` : b; });
  }
  /** Rechteckiger Ersatzraum aus der Fläche (Seiten etwa 4 : 3, Höhe 2,50 m), damit die Mengenformeln greifen. */
  function aufmassRaum(r, name) {
    const qm = num(r.qm), l = Math.sqrt(qm * 4 / 3), b = qm / (l || 1);
    const x = A().neuerRaum(roomType(r.rt).name);
    x.name = name; x.teile = [{ l: l ? l.toFixed(2).replace('.', ',') : '', b: b ? b.toFixed(2).replace('.', ',') : '' }];
    if (r.h) x.h = r.h;
    return x;
  }
  const keyOf = (z) => `${z.raum}|${z.nr}|${z.bem}`;
  /** Alle Positionen: aus dem Paket (ohne abgewählte) und die einzeln angetippten. */
  function positionen() {
    const nm = namen();
    const p = { aufmass: { raeume: S.raeume.map((r, i) => aufmassRaum(r, nm[i])).filter((x, i) => num(S.raeume[i].qm) > 0) } };
    const gen = S.paket ? A().erzeuge(p, S.paket).positionen : [];
    const extra = S.extra.filter((x) => num(x.menge) > 0).map((x) => ({ nr: x.nr, raum: '', menge: num(x.menge), bem: '', extra: x.id }));
    return { gen, alle: [...gen.filter((z) => !S.aus.includes(keyOf(z))), ...extra] };
  }

  async function view() {
    await laden(); await A().preisliste(); await A().vorlagen();
    const PL = await A().preisliste();
    header('Schnellangebot', 'Grober Preis, z. B. am Telefon');
    const pk = Object.entries(PKG_META);
    const gewerke = [...new Set(PL.positionen.map((x) => x.gewerk))].filter((g) => g && !/eigenleistung/i.test(g));
    main().innerHTML = `
      <div class="card">
        <h2>Räume</h2>
        <div id="sRaeume">${S.raeume.map((r, i) => `
          <div class="srow" data-r="${i}">
            <select data-rf="rt" aria-label="Raum">${TYPEN().map((t) => `<option value="${t.id}" ${t.id === r.rt ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
            <label class="qm"><input type="text" inputmode="decimal" data-rf="qm" value="${esc(r.qm)}" placeholder="0"><span>m²</span></label>
            ${S.raeume.length > 1 ? `<button class="icon-btn" data-rdel="${i}" aria-label="Raum entfernen">${icon('x')}</button>` : ''}
          </div>`).join('')}</div>
        <button class="add-room" id="sAdd" style="width:100%;margin-top:10px">${icon('plus')} Weiterer Raum</button>
        <p class="hint">Grundfläche reicht. Wände, Fliesenflächen und Sockel rechnet die App mit 2,50 m Raumhöhe.</p>
      </div>

      <div class="card">
        <h2>Ausstattung</h2>
        <div class="chips">${pk.map(([id, [name, color]]) => `<button class="chip ${S.paket === id ? 'on' : ''}" data-pk="${id}" style="--c:${color}">${icon('check', 'chip-ck')}${esc(name)}</button>`).join('')}
          <button class="chip ${S.paket ? '' : 'on'}" data-pk="" style="--c:#6b7380">${icon('check', 'chip-ck')}Nur einzelne Punkte</button></div>
      </div>

      <div class="card sres" id="sRes"></div>

      <div class="sec-h"><h2>Einzelne Punkte dazu</h2></div>
      <div class="gchips">${gewerke.map((g) => `<button class="qchip" data-gw="${esc(g)}">${icon('plus')}${esc(g)}</button>`).join('')}</div>
      <div id="sExtra"></div>

      <details class="more card" id="sDet">
        <summary>${icon('clipboard')}<span>Enthaltene Positionen und Rechenweg<small id="sDetInfo"></small></span>${icon('chevron', 'more-chev')}</summary>
        <div id="sPos"></div>
      </details>

      <button class="btn big block" id="sProjekt" style="margin-top:16px">${icon('user')} Als Projekt beim Kunden anlegen</button>
      <p class="hint center">Räume, Flächen und Positionen werden übernommen. Danach Fotos machen und Maße genau aufnehmen.</p>
      <button class="link-danger" id="sReset">${icon('refresh')} Neu beginnen</button>`;

    const rerender = () => { const y = window.scrollY; view().then(() => window.scrollTo(0, y)); };
    $$('[data-r]').forEach((row) => {
      const r = S.raeume[+row.dataset.r];
      $('[data-rf="rt"]', row).onchange = (e) => { r.rt = e.target.value; speichern(); rechnen(); };
      $('[data-rf="qm"]', row).oninput = (e) => { r.qm = e.target.value; speichern(); rechnenOhneExtra(); };
    });
    $$('[data-rdel]').forEach((b) => (b.onclick = () => { S.raeume.splice(+b.dataset.rdel, 1); speichern(); rerender(); }));
    $('#sAdd').onclick = () => { S.raeume.push({ id: uid(), rt: 'wohnzimmer', qm: '' }); speichern(); rerender(); setTimeout(() => $$('[data-rf="qm"]').pop()?.focus(), 80); };
    $$('[data-pk]').forEach((b) => (b.onclick = () => { S.paket = b.dataset.pk; S.aus = []; speichern(); rerender(); }));
    $$('[data-gw]').forEach((b) => (b.onclick = async () => {
      const g = b.dataset.gw, ep = A().ep;
      const nr = await sheet(g, PL.positionen.filter((x) => x.gewerk === g).map((x) => ({ label: x.text, sub: `${x.nr} · ${eur2(ep(x))} je ${x.einheit} netto`, value: x.nr })));
      if (!nr) return;
      const it = PL.positionen.find((x) => x.nr === nr);
      const qm = S.raeume.reduce((s, r) => s + num(r.qm), 0);
      S.extra.push({ id: uid(), nr, menge: /^m²/.test(it.einheit) && qm ? String(mg(qm)) : '1' });
      speichern(); rerender();
      setTimeout(() => { const i = $$('[data-xm]').pop(); i?.focus(); i?.select(); }, 80);
    }));
    $('#sProjekt').onclick = alsProjekt;
    $('#sReset').onclick = () => { if (!confirm('Schnellangebot leeren und neu beginnen?')) return; S = leer(); kvSet(KEY, S); rerender(); };
    rechnen();
  }

  /** Ergebnis, Zusatzpunkte und Positionsliste neu berechnen (ohne die Eingabefelder oben neu zu zeichnen). */
  function rechnen() {
    const { summen, ep } = A();
    const { gen, alle } = positionen();
    const s = summen(alle);
    const qm = S.raeume.reduce((t, r) => t + num(r.qm), 0);
    $('#sRes').innerHTML = resHtml(s, qm, !alle.length);
    // Zusatzpunkte
    const ex = $('#sExtra');
    ex.innerHTML = S.extra.length ? `<div class="card xlist">${S.extra.map((x) => {
      const it = posOf(x.nr); if (!it) return '';
      return `<div class="xrow"><span class="xt"><b>${esc(it.text)}</b><small>${eur2(ep(it))} je ${esc(it.einheit)}, netto</small></span>
        <label class="qm sm"><input type="text" inputmode="decimal" data-xm="${x.id}" value="${esc(x.menge)}"><span>${esc(it.einheit)}</span></label>
        <span class="xgp" data-xgp="${x.id}">${eur2(num(x.menge) * ep(it))}</span>
        <button class="icon-btn" data-xdel="${x.id}" aria-label="Entfernen">${icon('x')}</button></div>`;
    }).join('')}</div>` : '';
    $$('[data-xm]', ex).forEach((inp) => (inp.oninput = () => {
      const x = S.extra.find((y) => y.id === inp.dataset.xm); x.menge = inp.value; speichern();
      rechnenOhneExtra();
    }));
    $$('[data-xdel]', ex).forEach((b) => (b.onclick = () => { S.extra = S.extra.filter((y) => y.id !== b.dataset.xdel); speichern(); rechnen(); }));
    liste(gen, s);
  }
  function resHtml(s, qm, leer) {
    if (leer) return `<p class="sres-hint">${icon('ruler')}<span>Fläche eintragen oder einzelne Punkte antippen, dann erscheint hier der Preis.</span></p>`;
    const E = PLcache.einstellungen, pz = (x) => Math.round(x * 100) + ' %';
    return `<span class="sres-l">Preisrichtung inkl. MwSt.</span>
      <b class="sres-p">ca. ${eur(s.von)} – ${eur(s.bis)}</b>
      <span class="sres-s">Spanne ± ${pz(E.spanne)} um den kalkulierten Preis, auf 100 € gerundet${qm ? ` · ca. ${eur(s.brutto / qm)} je m²` : ''}</span>
      <div class="sres-tab">
        <span>Summe der ${s.zeilen.length} Positionen (netto)</span><b>${eur2(s.netto)}</b>
        <span>+ ${pz(E.mwst)} MwSt.</span><b>${eur2(s.mwst)}</b>
        <span class="tot">Kalkuliert brutto</span><b class="tot">${eur2(s.brutto)}</b>
      </div>`;
  }
  // Beim Tippen in einer Menge nur Ergebnis, Zeilenpreise und Liste aktualisieren (Eingabefeld bleibt)
  function rechnenOhneExtra() {
    const ep = A().ep;
    for (const x of S.extra) { const el = $(`[data-xgp="${x.id}"]`), it = posOf(x.nr); if (el && it) el.textContent = eur2(num(x.menge) * ep(it)); }
    const { gen, alle } = positionen(), s = A().summen(alle);
    $('#sRes').innerHTML = resHtml(s, S.raeume.reduce((t, r) => t + num(r.qm), 0), !alle.length);
    liste(gen, s);
  }
  let PLcache = null;
  const PLs = () => PLcache?.einstellungen?.spanne ?? 0.15;
  const posOf = (nr) => PLcache?.positionen.find((x) => x.nr === nr);
  function liste(gen, s) {
    const el = $('#sPos'); if (!el) return;
    const aus = new Set(S.aus);
    const byRaum = {};
    for (const z of gen) (byRaum[z.raum || 'Allgemein'] ??= []).push(z);
    const gp = new Map(s.zeilen.map((z) => [keyOf(z), z.gp]));
    $('#sDetInfo').textContent = `${s.zeilen.length} Positionen${aus.size ? ` · ${aus.size} abgewählt` : ''}`;
    el.innerHTML = Object.entries(byRaum).map(([rn, zs]) => `<div class="o-h">${icon('home')}<span>${esc(rn)}</span></div>
      ${zs.map((z) => { const it = posOf(z.nr), k = keyOf(z), on = !aus.has(k);
        return `<label class="prow ${on ? '' : 'off'}"><input type="checkbox" data-pk2="${esc(k)}" ${on ? 'checked' : ''}>
          <span class="xt"><b>${esc(it?.text || z.nr)}</b><small>${mg(z.menge)} ${esc(it?.einheit || '')} × ${it ? eur2(A().ep(it)) : ''}${z.bem ? ' · ' + esc(z.bem) : ''}</small></span>
          <span class="xgp">${on ? eur2(gp.get(k) || 0) : '–'}</span></label>`; }).join('')}`).join('');
    if (!gen.length) { el.innerHTML = '<p class="hint">Mit Fläche und Paket erscheinen hier die einzelnen Positionen. Antippen nimmt eine heraus.</p>'; return; }
    const E = PLcache.einstellungen, pz = (x) => Math.round(x * 100) + ' %';
    const nExtra = S.extra.filter((x) => num(x.menge) > 0 && posOf(x.nr)).length;
    const sumGen = s.zeilen.filter((z) => !z.extra).reduce((t, z) => t + z.gp, 0);
    el.innerHTML += `<div class="psum"><span>Summe Paket-Positionen netto</span><b>${eur2(sumGen)}</b>
      ${nExtra ? `<span>+ einzelne Punkte netto</span><b>${eur2(s.netto - sumGen)}</b><span>Summe netto</span><b>${eur2(s.netto)}</b>` : ''}</div>
      <p class="hint">Alle Preise hier sind <b>netto</b>. Oben steht der Preis mit ${pz(E.mwst)} MwSt.<br>
      So entsteht ein Einzelpreis (wie in deinem Excel-Angebotstool): Sub-Lohn + ${pz(E.aufLohn)} Aufschlag, plus Material + ${pz(E.aufMat)} Aufschlag, das Ganze + ${pz(E.wagnis)} Wagnis. Die Mengen rechnet die App aus der Grundfläche (Raum etwa 4 : 3, Höhe 2,50 m, eine Tür, ein Fenster) mit den Paket-Vorlagen aus den Einstellungen.</p>`;
    $$('[data-pk2]', el).forEach((c) => (c.onchange = () => {
      const k = c.dataset.pk2; S.aus = c.checked ? S.aus.filter((x) => x !== k) : [...S.aus, k]; speichern(); rechnen();
    }));
  }

  /** Als Projekt beim Kunden anlegen: je Raum ein Projektraum mit Aufmaß und den Positionen. */
  async function alsProjekt() {
    const nm = namen();
    const raeume = S.raeume.map((r, i) => ({ r, name: nm[i] })).filter((x) => num(x.r.qm) > 0);
    if (!raeume.length && !S.extra.length) return toast('Bitte zuerst eine Fläche eintragen.');
    const k = await Kunden.waehlen('Für welchen Kunden?');
    if (!k) return;
    const oid = await Kunden.objektWaehlen(k);
    if (oid === null) return;
    const { gen } = positionen();
    const aus = new Set(S.aus);
    const o = Kunden.objekt(k, oid);
    const w = { id: uid(), kind: 'wohnung', created: Date.now(), kundeId: k.id, objektId: oid || '', customer: Kunden.name(k), address: Kunden.einzeilig(o?.adresse || ''), rooms: [], mappe: {}, pdfProducts: true, pdfPrices: false, pdfEvening: true };
    const list = raeume.length ? raeume : [{ r: { rt: 'sonstiges', qm: '' }, name: roomType('sonstiges').name }];
    for (const [i, { r, name }] of list.entries()) {
      const am = aufmassRaum(r, name);
      const pos = gen.filter((z) => (z.raum === name || (i === 0 && !z.raum)) && !aus.has(keyOf(z))).map(({ nr, menge, bem }) => ({ nr, raum: name, menge, bem }));
      if (i === 0) for (const x of S.extra) if (num(x.menge) > 0) pos.push({ nr: x.nr, raum: name, menge: num(x.menge), bem: '' });
      const room = { id: uid(), created: Date.now(), wohnungId: w.id, kundeId: k.id, customer: w.customer, address: w.address, roomType: r.rt, room: name, note: '', photos: [], thumb: '', results: {},
        selected: packagesFor(r.rt, null).map((x) => x.id), pdfProducts: true, pdfPrices: false,
        aufmass: { raeume: [am] }, angebot: { paket: S.paket || 'standard', positionen: pos, nr: '', titel: '', anrede: '', start: '', mitBauzeit: true, mitBild: true } };
      if (num(r.qm)) { room.masse = { l: am.teile[0].l, b: am.teile[0].b, h: am.h }; }
      await kvSet('project:' + room.id, room);
      w.rooms.push(room.id);
    }
    await Projekt.save(w);
    S = leer(); await kvSet(KEY, S);
    toast('Projekt angelegt. Die Maße sind geschätzt, bitte vor Ort nachmessen.', 5000);
    window.openTab('kunden', { kunde: k });
    Projekt.oeffnen(w.id);
  }

  async function start() { PLcache = await A().preisliste(); return view(); }
  return { view: start };
})();
