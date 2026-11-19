'use strict';
/* DOM – Profil der Subunternehmer (seit v114, Runde 13, P2): Gewerke mit Stufen, Preise je Stufe mit Datum,
 * Material liefert Sub, Konditionen als Felder, Pflichtnachweise mit Ablauf, Sterne je Projekt.
 * Daten am Partner:
 *   p.gewerke = [{ id, name, stufen: ['Silber'], material: 'sub' | 'wir' | '' }]   (p.gewerk und p.stufen werden daraus gebildet)
 *   p.stufenPreise = { [stufe]: { preise: { nr: preis }, eigene: [{ id, text, einheit, preis, gewerk }], datum: { nr | 'e:'+id: 'JJJJ-MM-TT' } } }
 *   p.preise / p.eigenePreise: nicht gespeicherte Verweise auf die Preise der gerade gewählten Stufe (alter Code liest weiter dort)
 *   p.zahlungsziel (Tage), p.skonto (%), p.skontoTage, p.gewaehr (Info), p.konditionen (weitere, Freitext)
 *   p.nachweise = [{ id, art, bis, dokId }]
 * Am Vorgang: w.sterne = [{ id, partnerId, n (1–5), grund, gewerk, stufe, t, wer }] */
window.SubProfil = (() => {
  const ALT = { basic: 'Bronze', standard: 'Silber', premium: 'Gold' };
  const STUFEN = () => { const l = vorgabe('partnerStufen') || ['Bronze', 'Silber', 'Gold']; return l.map((s) => ALT[String(s).toLowerCase()] || s); };
  const neuName = (s) => ALT[String(s || '').toLowerCase()] || String(s || '');
  const heute = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tag = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('de-DE') : '');
  const gewerkeAusText = (t) => String(t || '').split(/\s*[,/&+;]\s*|\s+und\s+/i).map((s) => s.trim()).filter(Boolean);

  // Gewerk einer Position unserer Preisliste (für das Datum je Gewerk und Stufe)
  let plGewerk = new Map();
  async function init() { try { const PL = await window.Angebot._intern.preisliste(); plGewerk = new Map(PL.positionen.map((x) => [x.nr, x.gewerk])); } catch {} }
  const gewerkVon = (nr) => plGewerk.get(nr) || '';
  const plGewerke = () => [...new Set([...plGewerk.values()])];

  /** Stufe, deren Preise p.preise gerade zeigt. */
  const ersteStufe = (p) => p.stufen?.[0] || Object.keys(p.stufenPreise || {}).find((s) => anzahl(p.stufenPreise[s])) || STUFEN()[Math.floor(STUFEN().length / 2)] || 'Silber';
  const aktiv = (p) => p.__stufe || ersteStufe(p);
  const liste = (p, s) => { const l = (p.stufenPreise[s] ??= { preise: {}, eigene: [], datum: {} }); l.preise ??= {}; l.eigene ??= []; l.datum ??= {}; return l; };
  const anzahl = (l) => (l ? Object.keys(l.preise || {}).length + (l.eigene || []).length : 0);
  const zeichen = (p) => { const s = {}; for (const [st, l] of Object.entries(p.stufenPreise || {})) { for (const [nr, v] of Object.entries(l.preise || {})) s[`${st}|${nr}`] = String(v); for (const e of l.eigene || []) s[`${st}|e:${e.id}`] = JSON.stringify([e.text, e.einheit, e.preis]); } return s; };
  const versteckt = (p, k, v) => Object.defineProperty(p, k, { value: v, enumerable: false, configurable: true, writable: true });

  /** Beim Laden (partner.js norm): alte Felder übernehmen, Verweise anlegen. */
  function norm(p) {
    p.stufen = (Array.isArray(p.stufen) ? p.stufen : []).map(neuName);
    if (!Array.isArray(p.gewerke)) p.gewerke = p.art === 'lief' ? [] : gewerkeAusText(p.gewerk).map((name) => ({ name, stufen: [...p.stufen] }));
    p.gewerke = p.gewerke.filter(Boolean).map((g) => ({ id: g.id || uid(), name: String(g.name || ''), stufen: (Array.isArray(g.stufen) ? g.stufen : []).map(neuName), material: ['sub', 'wir'].includes(g.material) ? g.material : '' }));
    if (p.gewerke.length) { p.gewerk = p.gewerke.map((g) => g.name).filter(Boolean).join(', '); p.stufen = [...new Set(p.gewerke.flatMap((g) => g.stufen))]; }
    p.stufenPreise = p.stufenPreise && typeof p.stufenPreise === 'object' ? p.stufenPreise : {};
    for (const s of Object.keys(p.stufenPreise)) if (ALT[s.toLowerCase()]) { p.stufenPreise[ALT[s.toLowerCase()]] = p.stufenPreise[s]; delete p.stufenPreise[s]; }
    // Alte Preisliste (eine je Firma) bzw. Änderung von einem Gerät mit älterer Fassung: in die erste Stufe
    const altP = Object.getOwnPropertyDescriptor(p, 'preise'), altE = Object.getOwnPropertyDescriptor(p, 'eigenePreise');
    if ((altP && 'value' in altP) || (altE && 'value' in altE)) {
      const l = liste(p, ersteStufe(p));
      if (altP?.value && typeof altP.value === 'object') Object.assign(l.preise, altP.value);
      for (const e of Array.isArray(altE?.value) ? altE.value : []) if (e && !l.eigene.some((x) => x.id === e.id)) l.eigene.push(e);
      delete p.preise; delete p.eigenePreise;
    }
    for (const s of Object.keys(p.stufenPreise)) liste(p, s);
    Object.defineProperty(p, 'preise', { get: () => liste(p, aktiv(p)).preise, set: (v) => { liste(p, aktiv(p)).preise = v || {}; }, enumerable: false, configurable: true });
    Object.defineProperty(p, 'eigenePreise', { get: () => liste(p, aktiv(p)).eigene, set: (v) => { liste(p, aktiv(p)).eigene = Array.isArray(v) ? v : []; }, enumerable: false, configurable: true });
    if (!p.__sig) versteckt(p, '__sig', zeichen(p));
    for (const f of ['skonto', 'skontoTage', 'zahlungsziel', 'gewaehr']) p[f] = String(p[f] ?? '');
    p.nachweise = (Array.isArray(p.nachweise) ? p.nachweise : []).filter(Boolean).map((n) => ({ id: n.id || uid(), art: String(n.art || ''), bis: String(n.bis || ''), dokId: String(n.dokId || '') }));
    return p;
  }
  /** Vor dem Speichern: geänderte Preise bekommen das heutige Datum (Preislisten-Datum je Gewerk und Stufe). */
  function stempeln(p) {
    const neu = zeichen(p), alt = p.__sig || {}, h = heute();
    for (const [k, v] of Object.entries(neu)) if (alt[k] !== v) { const [s, nr] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)]; liste(p, s).datum[nr] = h; }
    for (const l of Object.values(p.stufenPreise)) for (const k of Object.keys(l.datum || {})) if (!(k.startsWith('e:') ? l.eigene.some((e) => 'e:' + e.id === k) : k in l.preise)) delete l.datum[k];
    versteckt(p, '__sig', neu);
  }
  function stufeSetzen(p, s) { versteckt(p, '__stufe', s); }
  /** Preislisten des Partners: [{ stufe, n }] nur mit Preisen. */
  const listen = (p) => Object.entries(p.stufenPreise || {}).map(([stufe, l]) => ({ stufe, n: anzahl(l) })).filter((x) => x.n);
  /** Preis einer Position über alle Stufen (für die Kalkulation): kleinster Preis > 0. */
  const preiseFuer = (p, nr) => Object.values(p.stufenPreise || {}).map((l) => +l.preise?.[nr]).filter((x) => x > 0);
  /** Ältestes Preisdatum in Gewerk und Stufe ('' = ohne Datum). */
  function stand(p, gewerk, stufe) {
    const l = p.stufenPreise?.[stufe]; if (!l) return { n: 0, datum: '' };
    const keys = [...Object.keys(l.preise).filter((nr) => !gewerk || gewerkVon(nr) === gewerk), ...l.eigene.filter((e) => !gewerk || !e.gewerk || e.gewerk === gewerk).map((e) => 'e:' + e.id)];
    const d = keys.map((k) => l.datum[k] || '');
    return { n: keys.length, datum: d.includes('') ? '' : d.sort()[0] || '' };
  }
  const zuAlt = (datum) => { if (!datum) return true; const g = new Date(); g.setMonth(g.getMonth() - (+vorgabe('preislisteMonate') || 12)); return new Date(datum + 'T12:00') < g; };
  function bestaetigen(p) { const h = heute(); for (const l of Object.values(p.stufenPreise)) { for (const nr of Object.keys(l.preise)) l.datum[nr] = h; for (const e of l.eigene) l.datum['e:' + e.id] = h; } versteckt(p, '__sig', zeichen(p)); }

  /** Stufen-Umschalter über einer Preisliste. */
  function stufeLeiste(p, neu) {
    const st = [...new Set([...p.stufen, ...Object.keys(p.stufenPreise).filter((s) => anzahl(p.stufenPreise[s]))])];
    if (st.length < 2) return { html: st.length ? `<p class="hint sp-st1">Preise für Stufe <b>${esc(st[0])}</b></p>` : '', binden: () => {} };
    return { html: `<div class="seg2 sp-stufe" role="tablist">${st.map((s) => `<button type="button" data-spst="${esc(s)}" class="${s === aktiv(p) ? 'on' : ''}">${esc(s)} <small>${anzahl(p.stufenPreise[s])}</small></button>`).join('')}</div>`,
      binden: (el) => $$('[data-spst]', el).forEach((b) => (b.onclick = () => { stufeSetzen(p, b.dataset.spst); neu(); })) };
  }

  // ---------- Abschnitt „Gewerke und Stufen“ in der Partnerkarte ----------
  function gewerkeAbschnitt(el, p, persist, neuZeichnen) {
    if (!el) return;
    const ST = STUFEN();
    const zeile = (g) => {
      const st = g.stufen.map((s) => ({ s, ...stand(p, g.name, s) })).filter((x) => x.n);
      return `<div class="sp-gew" data-gw="${g.id}">
        <div class="sp-gew-k"><input type="text" list="spGewL" data-gwf="name" value="${esc(g.name)}" placeholder="Gewerk, z. B. Fliesen" autocomplete="off"><button type="button" class="icon-btn" data-gwdel aria-label="Gewerk entfernen">${icon('trash')}</button></div>
        <div class="chips sp-chips">${[...new Set([...ST, ...g.stufen])].map((s) => `<button type="button" class="qchip ${g.stufen.includes(s) ? 'on' : ''}" data-gws="${esc(s)}">${icon('check')}${esc(s)}</button>`).join('')}</div>
        <div class="seg2 sp-mat"><span class="muted">Material</span>${[['sub', 'liefert der Sub'], ['wir', 'liefern wir']].map(([v, l]) => `<button type="button" data-gwm="${v}" class="${g.material === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${st.length ? `<div class="sp-stand">${st.map((x) => `<span class="${zuAlt(x.datum) ? 'alt' : ''}">${esc(x.s)}: ${x.n} ${x.n === 1 ? 'Preis' : 'Preise'}, ${x.datum ? 'Stand ' + tag(x.datum) : 'ohne Datum'}${zuAlt(x.datum) ? ' · bitte prüfen' : ''}</span>`).join('')}</div>` : ''}
      </div>`;
    };
    const mitPreisen = Object.values(p.stufenPreise).some(anzahl);
    el.innerHTML = `<label>Gewerke <span class="muted">(je Gewerk die Stufen, in denen die Firma arbeitet)</span></label>
      <datalist id="spGewL">${[...new Set([...plGewerke(), 'Garten und Außen'])].map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
      <div class="sp-gewl">${p.gewerke.map(zeile).join('') || '<p class="hint" style="margin:4px 0">Noch kein Gewerk.</p>'}</div>
      <button type="button" class="link-add" data-gwneu>${icon('plus')} Gewerk hinzufügen</button>
      ${mitPreisen ? `<button type="button" class="btn secondary small sp-best" data-gwok>${icon('check')} Alle Preislisten dieses Subs als aktuell bestätigen</button>` : ''}`;
    const nachher = () => { norm(p); persist(); };
    $$('[data-gw]', el).forEach((row) => {
      const g = p.gewerke.find((x) => x.id === row.dataset.gw);
      $('[data-gwf]', row).oninput = (e) => { g.name = e.target.value; nachher(); };
      $('[data-gwf]', row).onchange = () => neuZeichnen();
      $$('[data-gws]', row).forEach((b) => (b.onclick = () => { const s = b.dataset.gws; g.stufen = g.stufen.includes(s) ? g.stufen.filter((x) => x !== s) : [...g.stufen, s]; nachher(); b.classList.toggle('on', g.stufen.includes(s)); }));
      $$('[data-gwm]', row).forEach((b) => (b.onclick = () => { g.material = g.material === b.dataset.gwm ? '' : b.dataset.gwm; nachher(); $$('[data-gwm]', row).forEach((x) => x.classList.toggle('on', x.dataset.gwm === g.material)); }));
      $('[data-gwdel]', row).onclick = () => { if (g.name && !confirm(`Gewerk „${g.name}“ entfernen? Die Preise bleiben.`)) return; p.gewerke = p.gewerke.filter((x) => x !== g); nachher(); neuZeichnen(); };
    });
    $('[data-gwneu]', el).onclick = () => { p.gewerke.push({ id: uid(), name: '', stufen: [ST[Math.floor(ST.length / 2)] || ST[0]].filter(Boolean), material: '' }); nachher(); neuZeichnen(); $$('[data-gwf]', el).pop()?.focus(); };
    if ($('[data-gwok]', el)) $('[data-gwok]', el).onclick = () => { bestaetigen(p); persist(); toast('Alle Preise mit heutigem Datum bestätigt'); neuZeichnen(); };
  }

  // ---------- Konditionen als Felder ----------
  const konditionenHtml = (p) => `<div class="row"><div><label style="margin-top:0">Zahlungsziel (Tage)</label><input type="text" inputmode="numeric" data-kf="zahlungsziel" value="${esc(p.zahlungsziel)}" placeholder="z. B. 14"></div>
      <div><label style="margin-top:0">Skonto %</label><input type="text" inputmode="decimal" data-kf="skonto" value="${esc(p.skonto)}" placeholder="z. B. 2"></div>
      <div><label style="margin-top:0">Skonto bei Zahlung in (Tagen)</label><input type="text" inputmode="numeric" data-kf="skontoTage" value="${esc(p.skontoTage)}" placeholder="z. B. 7"></div></div>
    <label>Gewährleistung des Subs (nur zur Info)</label><input type="text" data-kf="gewaehr" value="${esc(p.gewaehr)}" placeholder="z. B. 5 Jahre nach VOB/B">`;
  const konditionenBinden = (el, p, persist) => $$('[data-kf]', el).forEach((i) => (i.oninput = () => { p[i.dataset.kf] = i.value.trim(); persist(); }));

  // ---------- Pflichtnachweise ----------
  const warnBis = () => { const d = new Date(); d.setDate(d.getDate() + (+vorgabe('nachweisWarnTage') || 30)); return d.toISOString().slice(0, 10); };
  const nachweisStand = (n) => (!n.bis ? '' : n.bis < heute() ? 'abgelaufen' : n.bis <= warnBis() ? 'bald' : '');
  function nachweiseAbschnitt(el, p, persist) {
    if (!el) return;
    const fehlend = (vorgabe('nachweisArten') || []).filter((a) => !p.nachweise.some((n) => n.art === a));
    el.innerHTML = `<label>Nachweise <span class="muted">(gültig bis, DOM erinnert auf „Heute“)</span></label>
      ${p.nachweise.map((n) => { const s = nachweisStand(n); return `<div class="sp-nw ${s}" data-nw="${n.id}">
        <select data-nwf="art">${[...new Set([...(vorgabe('nachweisArten') || []), n.art].filter(Boolean))].map((a) => `<option ${a === n.art ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <input type="date" data-nwf="bis" value="${esc(n.bis)}" aria-label="gültig bis">
        <select data-nwf="dokId"><option value="">ohne Dokument</option>${p.dokumente.map((d) => `<option value="${esc(d.id)}" ${d.id === n.dokId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-nwdel aria-label="Nachweis entfernen">${icon('trash')}</button>
        ${s ? `<small>${s === 'abgelaufen' ? 'abgelaufen seit ' : 'läuft ab am '}${esc(tag(n.bis))}</small>` : ''}</div>`; }).join('')}
      <button type="button" class="link-add" data-nwneu>${icon('plus')} Nachweis hinzufügen</button>${fehlend.length && p.art === 'sub' ? `<p class="hint" style="margin:2px 0 0">Fehlt noch: ${esc(fehlend.join(', '))}</p>` : ''}`;
    const neu = () => nachweiseAbschnitt(el, p, persist);
    $$('[data-nw]', el).forEach((row) => {
      const n = p.nachweise.find((x) => x.id === row.dataset.nw);
      $$('[data-nwf]', row).forEach((i) => (i.onchange = () => { n[i.dataset.nwf] = i.value; persist(); neu(); }));
      $('[data-nwdel]', row).onclick = () => { p.nachweise = p.nachweise.filter((x) => x !== n); persist(); neu(); };
    });
    $('[data-nwneu]', el).onclick = () => { p.nachweise.push({ id: uid(), art: fehlend[0] || (vorgabe('nachweisArten') || [''])[0], bis: '', dokId: '' }); persist(); neu(); };
  }
  /** Für „Heute“: Nachweise, die abgelaufen sind oder bald ablaufen. */
  const ablaufend = () => (window.Partner?.liste() || []).filter((p) => !window.Sperre?.ist(p)).flatMap((p) => p.nachweise.filter((n) => nachweisStand(n)).map((n) => ({ p, n, abgelaufen: nachweisStand(n) === 'abgelaufen' })));

  // ---------- Sterne je Sub und Projekt ----------
  const sterneHtml = (n, gross) => `<span class="sp-sterne${gross ? ' gross' : ''}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= Math.round(n) ? 'an' : ''}" data-stern="${i}">★</i>`).join('')}</span>`;
  /** Partner, die an einem Projekt beteiligt sind: Positionen vom Sub, Eingangsrechnungen, Termine, Bestellungen. */
  async function beteiligte(w) {
    const ids = new Set();
    try { for (const r of await Projekt.raeume(w)) for (const x of r.angebot?.positionen || []) if (x.sub?.partnerId) ids.add(x.sub.partnerId); } catch {}
    for (const b of window.Finanzen?.fuerProjekt(w.id) || []) if (b.partnerId) ids.add(b.partnerId);
    for (const b of w.bestellungen || []) if (b.partnerId) ids.add(b.partnerId);
    for (const t of window.Kalender?.eintraege?.('2020-01-01', '2040-12-31', { filter: false }) || []) if (t.typ === 'termin' && t.projektId === w.id) for (const id of [t.partnerId, ...(t.partnerIds || [])]) if (id) ids.add(id);
    for (const s of w.sterne || []) ids.add(s.partnerId);
    return [...ids].map((id) => window.Partner?.byId(id)).filter((p) => p && p.art !== 'lief');
  }
  async function sterneAbschnitt(el, w, speichern) {
    if (!el) return;
    w.sterne = Array.isArray(w.sterne) ? w.sterne : [];
    const ps = await beteiligte(w);
    el.innerHTML = `<div class="sec-h" style="margin-top:18px"><h2>Partner bewerten</h2></div>
      <div class="card kform sp-bew">${ps.map((p) => { const s = w.sterne.find((x) => x.partnerId === p.id); return `<div class="sp-bz" data-bp="${p.id}">
        <span class="sp-bn"><b>${esc(Partner.titel(p) || 'Ohne Namen')}</b><span class="muted">${esc([s?.gewerk || p.gewerke[0]?.name, s?.stufe || p.gewerke[0]?.stufen[0]].filter(Boolean).join(' · '))}</span></span>
        ${sterneHtml(s?.n || 0, true)}
        <input type="text" data-bg value="${esc(s?.grund || '')}" placeholder="Begründung (optional)" autocomplete="off"></div>`; }).join('') || '<p class="hint" style="margin:0">Noch kein Partner an diesem Projekt.</p>'}
        <button type="button" class="link-add" data-bneu>${icon('plus')} Weiteren Partner bewerten</button></div>`;
    const eintrag = (p) => { let s = w.sterne.find((x) => x.partnerId === p.id); if (!s) { s = { id: uid(), partnerId: p.id, n: 0, grund: '', gewerk: p.gewerke[0]?.name || '', stufe: p.gewerke[0]?.stufen[0] || '', t: Date.now(), wer: window.Kalender?.wer() || '' }; w.sterne.push(s); } return s; };
    $$('[data-bp]', el).forEach((row) => {
      const p = Partner.byId(row.dataset.bp);
      $$('[data-stern]', row).forEach((i) => (i.onclick = async () => { const s = eintrag(p); s.n = +i.dataset.stern; s.t = Date.now(); await speichern(); sterneAbschnitt(el, w, speichern); }));
      $('[data-bg]', row).onchange = async (e) => { const s = eintrag(p); s.grund = e.target.value.trim(); await speichern(); };
    });
    $('[data-bneu]', el).onclick = async () => {
      const id = await Partner.waehlen(); if (!id) return;
      eintrag(Partner.byId(id)); sterneAbschnitt(el, w, speichern);
    };
  }
  /** Bewertungen eines Partners über alle Projekte: { schnitt, n, je: [{ gewerk, stufe, schnitt, n }], liste } */
  async function bewertung(p) {
    const idx = await projectIndex(), l = [];
    for (const x of idx) { const w = await kvGet('wohnung:' + x.id); for (const s of w?.sterne || []) if (s.partnerId === p.id && s.n > 0) l.push({ ...s, projekt: w.titel || w.customer || '' }); }
    const schnitt = (a) => (a.length ? a.reduce((s, x) => s + x.n, 0) / a.length : 0);
    const gruppen = new Map();
    for (const s of l) { const k = `${s.gewerk}|${s.stufe}`; gruppen.set(k, [...(gruppen.get(k) || []), s]); }
    return { schnitt: schnitt(l), n: l.length, liste: l, je: [...gruppen].map(([k, a]) => ({ gewerk: k.split('|')[0], stufe: k.split('|')[1], schnitt: schnitt(a), n: a.length })) };
  }
  async function bewertungAbschnitt(el, p) {
    if (!el || p.isNew) return;
    const b = await bewertung(p);
    if (!el.isConnected) return;
    const z = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    el.innerHTML = b.n ? `<div class="card sp-bewp"><div class="sp-bk">${sterneHtml(b.schnitt, true)}<b>${z(b.schnitt)}</b><span class="muted">${b.n} ${b.n === 1 ? 'Bewertung' : 'Bewertungen'}</span></div>
      ${b.je.length > 1 || b.je[0]?.gewerk ? b.je.map((x) => `<div class="sp-bje"><span>${esc([x.gewerk || 'ohne Gewerk', x.stufe].filter(Boolean).join(' · '))}</span>${sterneHtml(x.schnitt)}<span class="muted">${z(x.schnitt)} (${x.n})</span></div>`).join('') : ''}
      ${b.liste.filter((s) => s.grund).slice(-3).map((s) => `<p class="hint" style="margin:6px 0 0">${esc(s.projekt)}: ${esc(s.grund)}</p>`).join('')}</div>` : '';
  }

  return { STUFEN, init, norm, stempeln, stufeSetzen, aktiv, listen, preiseFuer, stand, zuAlt, bestaetigen, stufeLeiste, gewerkeAbschnitt, konditionenHtml, konditionenBinden, nachweiseAbschnitt, ablaufend, sterneAbschnitt, bewertung, bewertungAbschnitt, gewerkeAusText };
})();
