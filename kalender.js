'use strict';
/* DOM – Kalender: Termine mit Kunden (Objekt, Ort), Baustelle, Büro, Privat, dazu automatisch die Geburtstage
 * von Kunden und Subunternehmern. Arten lassen sich ein- und ausblenden (merkt sich das Gerät).
 * Speicher: 'termin:<id>' { id, kind:'termin', datum:'JJJJ-MM-TT', von:'HH:MM', bis:'HH:MM', ganztag,
 *   titel, art, wer:[personId], kundeId, objektId, projektId, partnerId, ort, notiz, created, updated }
 * Personen (Felix, Deniel …) stehen in den Einstellungen unter „Team“ (state.settings.team); oben im Kalender
 * lässt sich einer oder alle anzeigen. Termine ohne Person gelten für alle.
 * Immer erreichbar über das Kalender-Symbol oben unter dem DOM-Schriftzug, dazu die Kachel im Reiter Kunden
 * und „Termine“ in Kundenkarte, Objekt und Projekt. */
window.Kalender = (() => {
  const ARTEN = [
    ['kunde', 'Kundentermine', '#1e3550'],
    ['baustelle', 'Baustelle', '#b8862f'],
    ['buero', 'Büro / Intern', '#5b7a99'],
    ['privat', 'Privat', '#237a4b'],
    ['gebK', 'Kundengeburtstage', '#c0567a'],
    ['gebP', 'Geburtstage Subunternehmer', '#8a5cc2'],
  ];
  const art = (id) => ARTEN.find((a) => a[0] === id) || ARTEN[0];
  const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ausIso = (s) => { const [j, m, t] = s.split('-').map(Number); return new Date(j, m - 1, t); };
  const heute = () => iso(new Date());
  const tagLang = (s) => ausIso(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const tagKurz = (s) => ausIso(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

  // ---------- Daten ----------
  const alle = new Map();
  async function laden() {
    const d = await db();
    // Schreibweise im Team korrigiert (6.11.2026): Deniel Kovacic
    if (Array.isArray(state.settings.team) && state.settings.team.some((p) => p.name === 'Daniel Kovacic')) {
      state.settings.team.forEach((p) => { if (p.name === 'Daniel Kovacic') p.name = 'Deniel Kovacic'; });
      try { await saveSettings(); } catch {}
    }
    const list = await new Promise((res, rej) => {
      const q = d.transaction('kv').objectStore('kv').getAll(IDBKeyRange.bound('termin:', 'termin:￿'));
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    alle.clear();
    for (const t of list) if (t?.id) alle.set(t.id, t);
  }
  let aus;
  const ausgeblendet = () => {
    if (!aus) { try { aus = new Set(JSON.parse(localStorage.getItem('dom.kal.aus') || '[]')); } catch { aus = new Set(); } }
    return aus;
  };
  const merken = () => { try { localStorage.setItem('dom.kal.aus', JSON.stringify([...aus])); } catch {} };
  // Personen
  const STANDARD_TEAM = [{ id: 'felix', name: 'Felix Brenzinger', email: '' }, { id: 'daniel', name: 'Deniel Kovacic', email: '' }];
  const team = () => (Array.isArray(state.settings.team) && state.settings.team.length ? state.settings.team : STANDARD_TEAM);
  const vorname = (p) => String(p?.name || '').trim().split(/\s+/)[0] || 'Ohne Namen';
  let werFilter;
  const wer = () => { if (werFilter === undefined) { try { werFilter = localStorage.getItem('dom.kal.wer') || ''; } catch { werFilter = ''; } } return team().some((p) => p.id === werFilter) ? werFilter : ''; };
  const werSetzen = (v) => { werFilter = v; try { localStorage.setItem('dom.kal.wer', v); } catch {} };
  const werText = (t) => (Array.isArray(t.wer) && t.wer.length && t.wer.length < team().length ? t.wer.map((id) => vorname(team().find((p) => p.id === id))).join(' und ') : '');

  /** Alle Einträge zwischen von und bis (ISO, einschließlich), sortiert; Geburtstage jährlich. */
  function eintraege(von, bis, { filter = true } = {}) {
    const out = [];
    const w = filter ? wer() : '';
    for (const t of alle.values()) if (t.datum >= von && t.datum <= bis && (!w || !t.wer?.length || t.wer.includes(w))) out.push({ ...t, typ: 'termin' });
    const geb = [];
    for (const k of Kunden.liste()) if (k.geburtstag) geb.push({ art: 'gebK', datum: k.geburtstag, titel: `Geburtstag ${Kunden.name(k) || 'Kunde'}`, kundeId: k.id });
    for (const g of window.Partner?.geburtstage() || []) geb.push({ art: 'gebP', ...g });
    const j0 = +von.slice(0, 4), j1 = +bis.slice(0, 4);
    for (const g of geb) {
      for (let j = j0; j <= j1; j++) {
        let d = `${j}${g.datum.slice(4)}`;
        if (d.endsWith('-02-29') && new Date(j, 1, 29).getMonth() !== 1) d = `${j}-02-28`;
        if (d < von || d > bis) continue;
        const a = j - +g.datum.slice(0, 4);
        out.push({ ...g, typ: 'geb', id: `${g.art}-${g.kundeId || g.partnerId}-${g.titel}-${j}`, datum: d, ganztag: true, sub: [g.sub, a > 0 && a < 130 ? `wird ${a}` : ''].filter(Boolean).join(' · ') });
      }
    }
    const h = ausgeblendet();
    return out.filter((e) => !filter || !h.has(e.art)).sort((a, b) => a.datum.localeCompare(b.datum) || (a.ganztag ? -1 : b.ganztag ? 1 : (a.von || '').localeCompare(b.von || '')));
  }
  const zuKunde = (e) => {
    const k = Kunden.byId(e.kundeId), o = k && Kunden.objekt(k, e.objektId);
    return [k && Kunden.name(k), o && Kunden.objLabel(o)].filter(Boolean).join(' · ');
  };
  const zeile = (e) => `<button class="tz" data-e="${esc(e.id)}" style="--c:${art(e.art)[2]}">
      <span class="tz-z">${e.ganztag ? (e.typ === 'geb' ? icon('cake') : 'ganztags') : `${esc(e.von || '')}${e.bis ? `<small>${esc(e.bis)}</small>` : ''}`}</span>
      <span class="tz-t"><b>${esc(e.titel || art(e.art)[1])}</b><span>${esc(e.typ === 'geb' ? e.sub || '' : [werText(e), zuKunde(e), e.ort].filter(Boolean).join(' · ') || art(e.art)[1])}</span></span>
      ${icon('chevron', 'pc-chev')}</button>`;
  /** Klick auf einen Eintrag: Termin bearbeiten bzw. Kunde/Subunternehmer öffnen. */
  function bindZeilen(el, list, zurueck) {
    $$('[data-e]', el).forEach((b) => (b.onclick = () => {
      const e = list.find((x) => x.id === b.dataset.e); if (!e) return;
      if (e.typ === 'termin') return bearbeiten(alle.get(e.id), zurueck);
      if (e.kundeId) return Kunden.oeffnen(e.kundeId);
      if (e.partnerId) window.Partner?.oeffnen(e.partnerId);
    }));
  }

  // ---------- Kachel (Reiter Kunden) ----------
  async function kachel(el) {
    if (!el) return;
    await laden();
    const h = heute(), bis = iso(new Date(Date.now() + 7 * 864e5));
    const list = eintraege(h, bis);
    const heuteN = list.filter((e) => e.datum === h).length;
    el.innerHTML = `<button class="doc kal-k" id="kalOpen"><span class="d-ico navy">${icon('calendar')}</span>
      <span class="d-t"><b>Kalender</b><span>${heuteN ? `Heute ${heuteN} ${heuteN === 1 ? 'Eintrag' : 'Einträge'}` : 'Heute nichts eingetragen'}${list.length > heuteN ? ` · diese Woche noch ${list.length - heuteN}` : ''}</span>
      ${list.slice(0, 3).map((e) => `<span class="kal-l" style="--c:${art(e.art)[2]}"><i></i>${esc(e.datum === h ? 'Heute' : tagKurz(e.datum))}${e.von && !e.ganztag ? ' ' + esc(e.von) : ''} · ${esc(e.titel)}</span>`).join('')}</span>
      ${icon('chevron', 'pc-chev')}</button>`;
    $('#kalOpen').onclick = () => { view(); window.scrollTo(0, 0); };
  }

  // ---------- Abschnitt „Termine“ in Kundenkarte und Objekt ----------
  async function abschnitt(el, { kundeId, objektId = '', projektId = '', zurueck: zu = null }) {
    if (!el) return;
    await laden();
    const list = [...alle.values()].filter((t) => t.kundeId === kundeId && (!objektId || t.objektId === objektId) && (!projektId || t.projektId === projektId) && t.datum >= heute())
      .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von || '').localeCompare(b.von || '')).map((t) => ({ ...t, typ: 'termin' }));
    if (!el.isConnected) return;
    const zurueck = () => { (zu || Kunden.start)(); window.scrollTo(0, 0); };
    el.innerHTML = `<div class="sec-h"><h2>Termine</h2>${list.length ? `<span class="count">${list.length}</span>` : ''}</div>
      ${list.length ? `<div class="tlist">${list.slice(0, 6).map((e) => zeile({ ...e, titel: `${tagKurz(e.datum)} · ${e.titel || art(e.art)[1]}` })).join('')}</div>` : ''}
      <button class="add-room" data-tneu style="margin-top:${list.length ? 10 : 0}px">${icon('calendar')} Termin anlegen</button>`;
    bindZeilen(el, list, zurueck);
    $('[data-tneu]', el).onclick = () => bearbeiten({ art: projektId ? 'baustelle' : 'kunde', kundeId, objektId, projektId, datum: heute() }, zurueck);
  }

  // ---------- Monatsansicht ----------
  // Der Kalender legt sich über den aktuellen Reiter; „Zurück“ führt genau dorthin, wo man war.
  let monat = null, tag = null, vorher = null;
  async function view() {
    if (!state.kalender) vorher = { tab: state.tab, s: { project: state.project, wohnung: state.wohnung, kunde: state.kunde, objekt: state.objekt, partner: state.partner } };
    state.kalender = true;
    await laden();
    if (!state.kalender) return;
    const h = heute();
    monat ??= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    tag ??= h;
    const zurueck = () => { state.kalender = false; const v = vorher || { tab: state.tab, s: {} }; vorher = null; switchTab(v.tab, v.s); };
    header('Kalender', monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), { label: 'Zurück', fn: zurueck });
    const start = new Date(monat); start.setDate(1 - ((monat.getDay() + 6) % 7));
    const tage = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const sichtbar = tage[35].getMonth() === monat.getMonth() ? tage : tage.slice(0, 35);
    const list = eintraege(iso(sichtbar[0]), iso(sichtbar[sichtbar.length - 1]));
    const amTag = (s) => list.filter((e) => e.datum === s);
    const naechste = eintraege(h, iso(new Date(Date.now() + 60 * 864e5))).filter((e) => e.datum !== tag).slice(0, 8);
    const h2 = ausgeblendet();
    const tw = team(), w = wer();
    main().innerHTML = `
      <div class="seg2 full kal-wer">${[{ id: '', name: tw.length === 2 ? 'Beide' : 'Alle' }, ...tw].map((p) => `<button data-wer="${p.id}" class="${w === p.id ? 'on' : ''}">${esc(p.id ? p.name : p.name)}</button>`).join('')}</div>
      <div class="card kal">
        <div class="kal-nav"><button class="icon-btn" id="kPrev" aria-label="Voriger Monat">${icon('back')}</button>
          <b>${esc(monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }))}</b>
          <button class="btn secondary small" id="kHeute">Heute</button>
          <button class="icon-btn" id="kNext" aria-label="Nächster Monat">${icon('chevron')}</button></div>
        <div class="kal-g">${WT.map((w) => `<span class="kal-wt">${w}</span>`).join('')}
          ${sichtbar.map((d) => { const s = iso(d), e = amTag(s); return `<button class="kal-d ${d.getMonth() !== monat.getMonth() ? 'aus' : ''} ${s === h ? 'heute' : ''} ${s === tag ? 'sel' : ''}" data-d="${s}">
            <span>${d.getDate()}</span><i>${[...new Set(e.map((x) => x.art))].slice(0, 3).map((a) => `<em style="--c:${art(a)[2]}"></em>`).join('')}</i></button>`; }).join('')}
        </div>
        <div class="kal-f">${ARTEN.map(([id, n, c]) => `<button class="${h2.has(id) ? '' : 'on'}" data-art="${id}" style="--c:${c}" aria-pressed="${!h2.has(id)}"><i></i>${esc(n)}</button>`).join('')}</div>
      </div>
      <div class="kal-tag-h"><h2>${esc(tag === h ? 'Heute' : tagLang(tag))}</h2><button class="kal-neu" id="kNeu">${icon('plus')} Termin</button></div>
      <div class="tlist" id="kTag">${eintraege(tag, tag).map(zeile).join('') || '<p class="hint" style="margin:0">Nichts eingetragen.</p>'}</div>
      ${naechste.length ? `<div class="sec-h"><h2>Demnächst</h2></div><div class="tlist" id="kNaechste">${naechste.map((e) => zeile({ ...e, titel: `${tagKurz(e.datum)} · ${e.titel}` })).join('')}</div>` : ''}`;
    const neu = () => { view(); };
    bindZeilen($('#kTag'), eintraege(tag, tag), neu);
    if ($('#kNaechste')) bindZeilen($('#kNaechste'), naechste, neu);
    $('#kPrev').onclick = () => { monat = new Date(monat.getFullYear(), monat.getMonth() - 1, 1); view(); };
    $('#kNext').onclick = () => { monat = new Date(monat.getFullYear(), monat.getMonth() + 1, 1); view(); };
    $('#kHeute').onclick = () => { monat = null; tag = null; view(); };
    $$('[data-d]').forEach((b) => (b.onclick = () => { tag = b.dataset.d; const d = ausIso(tag); if (d.getMonth() !== monat.getMonth()) monat = new Date(d.getFullYear(), d.getMonth(), 1); view(); }));
    $$('[data-wer]').forEach((b) => (b.onclick = () => { werSetzen(b.dataset.wer); view(); }));
    $$('[data-art]').forEach((b) => (b.onclick = () => { const s = ausgeblendet(); s.has(b.dataset.art) ? s.delete(b.dataset.art) : s.add(b.dataset.art); merken(); view(); }));
    $('#kNeu').onclick = () => bearbeiten({ art: 'kunde', datum: tag }, neu);
    // Wischen: Monat vor/zurück
    let x0 = null; const g = $('.kal-g');
    g.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    g.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) (dx < 0 ? $('#kNext') : $('#kPrev')).click(); });
  }

  // ---------- Termin bearbeiten ----------
  function bearbeiten(vorlage, zurueck) {
    const isNeu = !vorlage.id;
    const t = { id: uid(), kind: 'termin', titel: '', art: 'kunde', datum: heute(), von: '09:00', bis: '10:00', ganztag: false, wer: wer() ? [wer()] : team().map((p) => p.id), kundeId: '', objektId: '', projektId: '', partnerId: '', ort: '', notiz: '', created: Date.now(), ...vorlage };
    if (!Array.isArray(t.wer)) t.wer = [];
    t.erinnerung ??= state.settings.erinnerungAuto === false ? 0 : state.settings.erinnerungTage ?? 1;
    if (isNeu && t.mailKunde === undefined) t.mailKunde = state.settings.mailKundeAuto !== false;
    const alt = isNeu ? null : JSON.stringify([t.datum, t.von, t.bis, t.ganztag, t.ort, t.titel]);
    let mailen = null; // null = automatisch (neu: ja, geändert: ja, wenn schon eine Bestätigung rausging)
    if (isNeu && t.kundeId && !t.objektId) { const k = Kunden.byId(t.kundeId); if (k?.objekte.length === 1) t.objektId = k.objekte[0].id; }
    if (isNeu && t.kundeId && !t.ort) { const k = Kunden.byId(t.kundeId), o = k && Kunden.objekt(k, t.objektId); t.ort = o ? Kunden.einzeilig(o.adresse) : ''; }
    const render = () => {
      const k = Kunden.byId(t.kundeId), p = window.Partner?.byId(t.partnerId);
      header(isNeu ? 'Neuer Termin' : t.titel || 'Termin', tagLang(t.datum), { label: 'Zurück', fn: zurueck });
      main().innerHTML = `
        <div class="card kform">
          <label style="margin-top:0">Was?</label><input type="text" id="tTitel" value="${esc(t.titel)}" autocomplete="off" placeholder="z. B. Aufmaß Bad, Besprechung Fliesen">
          <div class="chips tart">${ARTEN.filter((a) => !a[0].startsWith('geb')).map(([id, n, c]) => `<button type="button" class="qchip ${t.art === id ? 'on' : ''}" data-ta="${id}" style="--c:${c}"><i></i>${esc(n.replace('termine', 'termin'))}</button>`).join('')}</div>
          <label>Wer?</label><div class="chips twer">${team().map((p) => `<button type="button" class="qchip ${t.wer.includes(p.id) ? 'on' : ''}" data-tw="${p.id}">${icon('user')}${esc(p.name)}</button>`).join('')}</div>
          <div class="row"><div><label>Datum</label>${Kontakt.datumInput('tDatum', t.datum)}</div>
            <div class="tg"><label class="chk"><input type="checkbox" id="tGanz" ${t.ganztag ? 'checked' : ''}> ganztags</label></div></div>
          <div class="row" id="tZeit" ${t.ganztag ? 'hidden' : ''}><div><label>von</label><input type="time" id="tVon" value="${esc(t.von)}"></div><div><label>bis</label><input type="time" id="tBis" value="${esc(t.bis)}"></div></div>
          <label>Kunde</label>
          <button type="button" class="kline pick" id="tKunde">${k ? `<span class="av sm">${esc(Kunden.initialen(k))}</span>` : icon('user')}<span class="kl-t"><b>${esc(k ? Kunden.name(k) : 'Kunde wählen (optional)')}</b>${k?.nr ? `<small>Kunden-Nr. ${esc(k.nr)}</small>` : ''}</span>${k ? `<span class="icon-btn" data-kx aria-label="Kunde entfernen">${icon('x')}</span>` : icon('chevron', 'pc-chev')}</button>
          ${k && k.objekte.length ? `<label>Objekt</label><select id="tObjekt"><option value="">–</option>${k.objekte.map((o) => `<option value="${o.id}" ${o.id === t.objektId ? 'selected' : ''}>${esc(Kunden.objLabel(o))}</option>`).join('')}</select>` : ''}
          ${k && !t.projektId && t.art === 'kunde' ? `<label class="chk" style="margin-top:10px"><input type="checkbox" id="tBesicht" ${t._besicht ? 'checked' : ''}> Besichtigung: gleich ein Projekt anlegen</label>` : ''}
          ${window.Partner ? `<label>Subunternehmer</label>
          <button type="button" class="kline pick" id="tPartner">${icon('users')}<span class="kl-t"><b>${esc(p ? p.firma || 'Ohne Namen' : 'Subunternehmer wählen (optional)')}</b>${p?.gewerk ? `<small>${esc(p.gewerk)}</small>` : ''}</span>${p ? `<span class="icon-btn" data-px aria-label="Entfernen">${icon('x')}</span>` : icon('chevron', 'pc-chev')}</button>` : ''}
          <label>Ort</label><div class="adr"><input type="text" id="tOrt" value="${esc(t.ort)}" autocomplete="off" placeholder="Anschrift oder z. B. Büro"></div>
          <label>Notiz</label><textarea id="tNotiz" placeholder="z. B. Fliesenmuster mitbringen">${esc(t.notiz)}</textarea>
        </div>
        <div class="card kform tmail" id="tMail"></div>
        <button class="btn big block" id="tSave">${icon('check')} Speichern</button>
        <button class="btn secondary block" id="tIcs" style="margin-top:10px">${icon('calendar')} In den iPhone-Kalender übernehmen</button>
        ${isNeu ? '' : `<button class="link-danger" id="tDel">${icon('trash')} Termin löschen</button>`}`;
      const f = (id, key) => ($('#' + id).oninput = (e) => { t[key] = e.target.value; });
      f('tTitel', 'titel'); f('tVon', 'von'); f('tBis', 'bis'); f('tOrt', 'ort'); f('tNotiz', 'notiz');
      $('#tVon').onchange = (e) => { // Ende eine Stunde später vorschlagen
        const [hh, mm] = e.target.value.split(':').map(Number);
        if (!isNaN(hh) && (!t.bis || t.bis <= e.target.value)) { t.bis = `${String(Math.min(23, hh + 1)).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; $('#tBis').value = t.bis; }
      };
      Kontakt.datumFeld($('#tDatum'), (v) => { if (v) { t.datum = v; $('#subtitle').textContent = tagLang(v); } });
      $('#tGanz').onchange = (e) => { t.ganztag = e.target.checked; $('#tZeit').hidden = t.ganztag; };
      $$('[data-tw]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.tw; t.wer = t.wer.includes(id) ? t.wer.filter((x) => x !== id) : [...t.wer, id];
        b.classList.toggle('on', t.wer.includes(id));
      }));
      $$('[data-ta]').forEach((b) => (b.onclick = () => { t.art = b.dataset.ta; $$('[data-ta]').forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#tKunde').onclick = async (e) => {
        if (e.target.closest('[data-kx]')) { t.kundeId = ''; t.objektId = ''; return render(); }
        const nk = await Kunden.waehlen('Termin mit welchem Kunden?'); if (!nk) return;
        t.kundeId = nk.id; t.objektId = nk.objekte.length === 1 ? nk.objekte[0].id : '';
        const o = Kunden.objekt(nk, t.objektId); if (o && !t.ort) t.ort = Kunden.einzeilig(o.adresse);
        render();
      };
      if ($('#tObjekt')) $('#tObjekt').onchange = (e) => { t.objektId = e.target.value; const o = Kunden.objekt(Kunden.byId(t.kundeId), t.objektId); if (o) { t.ort = Kunden.einzeilig(o.adresse); $('#tOrt').value = t.ort; } };
      if ($('#tPartner')) $('#tPartner').onclick = async (e) => {
        if (e.target.closest('[data-px]')) { t.partnerId = ''; return render(); }
        const pid = await window.Partner.waehlen(); if (pid) { t.partnerId = pid; render(); }
      };
      Kunden.adressVorschlaege($('#tOrt'));
      // ---- E-Mail an die Beteiligten ----
      const mailBox = () => {
        const el = $('#tMail'); if (!el) return;
        const an = empfaenger(t);
        const fehlt = beteiligte(t).filter((x) => !x.email);
        const bereit = state.settings.mailAktiv && window.Sync?.active();
        const geaendert = !isNeu && alt !== JSON.stringify([t.datum, t.von, t.bis, t.ganztag, t.ort, t.titel]);
        const an_ = mailen ?? (isNeu || (geaendert && !!t.mailGesendet));
        el.innerHTML = `<div class="hv-h" style="margin-top:0">${icon('mail')}<span>E-Mail an die Beteiligten</span></div>
          ${bereit ? `
          <label class="chk" style="margin-top:10px"><input type="checkbox" id="tMailAn" ${an_ ? 'checked' : ''}> ${isNeu ? 'Terminbestätigung senden' : t.mailGesendet ? 'Änderung senden' : 'Terminbestätigung senden'}</label>
          <label style="margin-top:0">Erinnerung</label>
          <select id="tErin">${[[0, 'keine'], [1, '1 Tag vorher'], [2, '2 Tage vorher'], [3, '3 Tage vorher'], [7, '1 Woche vorher']].map(([v, n]) => `<option value="${v}" ${+t.erinnerung === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          ${k?.email ? `<label class="chk" style="margin-top:10px"><input type="checkbox" id="tMailK" ${t.mailKunde ? 'checked' : ''}> Kunde auch (${esc(k.email)})</label>` : ''}
          <p class="hint" style="margin-bottom:0">${an.length ? `An: ${esc(an.map((x) => x.name || x.email).join(', '))}` : 'Noch niemand mit E-Mail-Adresse.'}${fehlt.length ? ` · ohne E-Mail: ${esc(fehlt.map((x) => x.name).join(', '))}` : ''}</p>`
          : `<p class="hint" style="margin:8px 0 0">Bestätigung und Erinnerung per E-Mail sind noch nicht eingerichtet. Unter Einstellungen → Team steht, wie es geht.</p>`}`;
        if ($('#tMailAn')) $('#tMailAn').onchange = (e) => { mailen = e.target.checked; };
        if ($('#tErin')) $('#tErin').onchange = (e) => { t.erinnerung = +e.target.value; };
        if ($('#tMailK')) $('#tMailK').onchange = (e) => { t.mailKunde = e.target.checked; mailBox(); };
      };
      mailBox();
      $$('[data-tw]').forEach((b) => b.addEventListener('click', mailBox));
      $('#tSave').onclick = async () => {
        if (!t.titel.trim()) t.titel = zuKunde(t) ? `${art(t.art)[1].replace('termine', 'termin')} ${Kunden.name(Kunden.byId(t.kundeId)) || ''}`.trim() : art(t.art)[1].replace('termine', 'termin');
        t.updated = Date.now();
        const bereit = state.settings.mailAktiv && window.Sync?.active();
        const sendJetzt = bereit && ($('#tMailAn')?.checked ?? false);
        t.mailAn = bereit ? empfaenger(t) : t.mailAn || [];
        if ($('#tBesicht')?.checked && t.kundeId && !t.projektId) {
          t.projektId = await Projekt.anlegen(t.kundeId, t.objektId, /^Kundentermin\b/.test(t.titel) ? '' : t.titel);
          toast('Projekt angelegt (Besichtigung)');
        }
        try { window.__projIdx = await projectIndex(); } catch {}
        t.kontext = kontext(t);
        await kvSet('termin:' + t.id, t); alle.set(t.id, t); punkt();
        tag = t.datum; monat = new Date(ausIso(t.datum).getFullYear(), ausIso(t.datum).getMonth(), 1);
        if (sendJetzt && t.mailAn.length) {
          $('#tSave').disabled = true;
          try {
            window.Sync.run?.(); // damit die Erinnerung den neuen Stand in der Cloud findet
            const r = await window.Sync.funktion('termin-mail', { aktion: t.mailGesendet ? 'aenderung' : 'bestaetigung', termin: t });
            t.mailGesendet = Date.now(); await kvSet('termin:' + t.id, t);
            toast(`Termin gespeichert, E-Mail an ${r.gesendet} ${r.gesendet === 1 ? 'Person' : 'Personen'} verschickt`, 3500);
          } catch (e) { toast('Termin gespeichert, aber die E-Mail ging nicht raus: ' + e.message, 6000); }
        } else toast('Termin gespeichert');
        zurueck();
      };
      $('#tIcs').onclick = () => ics(t);
      if ($('#tDel')) $('#tDel').onclick = async () => {
        if (!confirm('Termin löschen?')) return;
        if (t.mailGesendet && t.mailAn?.length && window.Sync?.active() && confirm('Absage per E-Mail an die Beteiligten senden?')) {
          try { await window.Sync.funktion('termin-mail', { aktion: 'absage', termin: t }); toast('Absage verschickt'); } catch (e) { toast('Absage ging nicht raus: ' + e.message, 5000); }
        }
        await kvDel('termin:' + t.id); alle.delete(t.id); punkt(); zurueck();
      };
    };
    render(); window.scrollTo(0, 0);
    if (isNeu) setTimeout(() => $('#tTitel')?.focus(), 50);
  }

  /** Wer dabei ist: Team-Personen des Termins, Subunternehmer, auf Wunsch der Kunde (mit E-Mail oder ohne). */
  // Jede Person bekommt ihre eigene Mail (rolle): team = alle Angaben, kunde = Zeit, Ort, Anlass (ohne Subunternehmer),
  // partner = Adresse, Projekt, Kunde und dass der Termin mit uns ist.
  function beteiligte(t) {
    const out = team().filter((p) => !t.wer?.length || t.wer.includes(p.id)).map((p) => ({ name: p.name, email: (p.email || '').trim(), rolle: 'team', anrede: `Hallo ${vorname(p)},` }));
    const p = window.Partner?.byId(t.partnerId);
    if (p) out.push({ name: [p.inhaber, p.firma].filter(Boolean).join(', ') || 'Subunternehmer', email: p.email.trim(), rolle: 'partner', anrede: p.inhaber?.trim() ? `Hallo ${p.inhaber.trim()},` : 'Hallo,' });
    const k = Kunden.byId(t.kundeId);
    if (k && t.mailKunde) out.push({ name: Kunden.name(k), email: k.email.trim(), rolle: 'kunde', anrede: Kunden.briefAnrede(k) });
    return out;
  }
  const empfaenger = (t) => beteiligte(t).filter((x) => /.+@.+\..+/.test(x.email));
  /** Angaben für den Text der E-Mail (die Cloud kennt Kunden und Subunternehmer nicht einzeln). */
  function kontext(t) {
    const k = Kunden.byId(t.kundeId), o = k && Kunden.objekt(k, t.objektId), p = window.Partner?.byId(t.partnerId);
    const w = t.projektId && (state.wohnung?.id === t.projektId ? state.wohnung : null);
    const pi = t.projektId ? (window.__projIdx || []).find((x) => x.id === t.projektId) : null;
    const pr = w || pi;
    const dabei = team().filter((x) => !t.wer?.length || t.wer.includes(x.id));
    return { firma: state.settings.company || 'DOM Projektmanagement', kontakt: state.settings.contact || '', kunde: k ? Kunden.name(k) : '', kundeTel: k?.telefon || '', objekt: o ? Kunden.objLabel(o) : '',
      projekt: pr ? [pr.titel, pr.nr && `Nr. ${pr.nr}`].filter(Boolean).join(' · ') : '',
      partner: p ? [p.firma, p.inhaber, p.telefon].filter(Boolean).join(' · ') : '', wer: dabei.map((x) => x.name).join(', '),
      werKontakt: dabei.map((x) => [x.name, x.email].filter(Boolean).join(', ')).join(' · '), texte: Kalender.mailTexte() };
  }

  // Einleitungssätze der Mails, je Empfänger und Art; in Einstellungen → E-Mail-Automatisierung änderbar
  const MAILTEXTE = {
    team: { bestaetigung: 'Neuer Termin im Kalender, hier alle Angaben.', erinnerung: 'Erinnerung an den folgenden Termin.' },
    kunde: { bestaetigung: 'vielen Dank für Ihr Vertrauen. Hiermit bestätigen wir unseren Termin bei Ihnen.', erinnerung: 'wir möchten Sie an unseren Termin bei Ihnen erinnern. Wir freuen uns auf Sie.' },
    partner: { bestaetigung: 'hiermit bestätigen wir den folgenden Termin mit uns.', erinnerung: 'kurze Erinnerung an unseren gemeinsamen Termin.' },
  };
  function mailTexte() {
    const s = state.settings.mailTexte || {};
    return Object.fromEntries(Object.entries(MAILTEXTE).map(([r, v]) => [r, { bestaetigung: s[r]?.bestaetigung?.trim() || v.bestaetigung, erinnerung: s[r]?.erinnerung?.trim() || v.erinnerung }]));
  }

  /** .ics-Datei: das iPhone bietet „Zum Kalender hinzufügen“ an (mit Erinnerung). */
  async function ics(t) {
    const d = t.datum.replace(/-/g, ''), z = (s) => String(s || '').replace(/:/g, '') + '00';
    const tx = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const nd = iso(new Date(ausIso(t.datum).getTime() + 864e5)).replace(/-/g, '');
    const k = Kunden.byId(t.kundeId);
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DOM Projektmanagement//App//DE', 'BEGIN:VEVENT', `UID:${t.id}@dom-app`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      ...(t.ganztag ? [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nd}`] : [`DTSTART:${d}T${z(t.von)}`, `DTEND:${d}T${z(t.bis || t.von)}`]),
      `SUMMARY:${tx(t.titel)}`, t.ort && `LOCATION:${tx(t.ort)}`,
      `DESCRIPTION:${tx([k && `${Kunden.name(k)}${k.telefon ? ' · ' + k.telefon : ''}`, t.notiz].filter(Boolean).join('\n'))}`,
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Erinnerung', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    const file = new File([body], `Termin_${t.datum}.ics`, { type: 'text/calendar' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  /** Punkt am Kalender-Symbol, wenn heute etwas ansteht. */
  function punkt() { const d = $('#calDot'); if (d) d.hidden = !eintraege(heute(), heute()).length; }

  return { laden, view, kachel, abschnitt, bearbeiten, eintraege, punkt, team, ARTEN, MAILTEXTE, mailTexte };
})();
