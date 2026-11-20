'use strict';
/* DOM – Aufnahme im Büro prüfen (seit v119, Runde 13, P5). Eine Seite je Vorgang (Pruefen.view(wid)):
 *  links Bereiche (Allgemein, jeder Bereich, „Offen“), Mitte die Punkte des Bereichs (Haken = übernehmen, Kreuz = verwerfen,
 *  Verschieben in einen anderen Bereich, eigene Punkte), Maße mit Herkunft (Aufmaß, Raumscan, Gespräch; Abweichungen nebeneinander)
 *  und Fotos des Bereichs (antippen = anderem Bereich zuordnen), rechts das Gespräch mit Suche.
 *  Am PC drei Spalten (css/projekte.css .pr-…), auf iPhone und iPad untereinander.
 * Die Punkte sind die Zeilen, die die KI-Zuordnung je Bereich schreibt (r.wishes = fürs Bild, r.otherNotes = für Angebot und Planung,
 *  Allgemeines in w.gespraech.allgemein.bild/sonstiges). Verwerfen und Verschieben ändern genau diese Texte, darum nimmt
 *  „Positionen vorschlagen lassen“ danach von selbst nur, was noch da ist. Kein Pflicht-Tor: Ungeprüftes zählt unter „Offen“.
 *  Haken: w.pruefung.ok = [Textschlüssel], fertig: w.pruefung.geprueft = { t, wer }.
 * Oben: Alle übernehmen, Aufnahme geprüft, An Sub schicken (PDF ohne Preise, Häkchen „Bitte um Angebot bis …“, w.subAnfragen),
 *  Nachtermin (Termin-Editor), Anruf notieren (als eigene Aufnahme „Telefonat“ ins Gespräch). */
window.Pruefen = (() => {
  const wahl = new Map(), suche = new Map();
  const SUFFIX = /\s*\((gilt für alle Räume|ganzes Projekt)\)\s*$/;
  const zeilen = (t) => String(t || '').split('\n').map((s) => s.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
  const bullets = (a) => a.map((x) => '- ' + x).join('\n');
  const key = (t) => String(t).toLowerCase().replace(SUFFIX, '').replace(/\s+/g, ' ').trim();
  const titel = (r) => r.room || roomType(r.roomType).name;
  const ich = () => (window.Kalender?.team?.() || []).find((p) => p.id === window.Kalender?.wer?.())?.name?.split(' ')[0] || '';
  const zahl = (x) => parseFloat(String(x ?? '').replace(',', '.')) || 0;
  const de = (x) => (x ? (+x).toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '');
  const FELD = { wishes: 'fürs Bild', otherNotes: 'Angebot und Planung', bild: 'fürs Bild', sonstiges: 'Angebot und Planung' };

  // ---------- Punkte ----------
  function punkte(w, list) {
    const ok = new Set(w.pruefung?.ok || []), out = [];
    const g = w.gespraech || {};
    for (const [feld, a] of [['bild', g.allgemein?.bild], ['sonstiges', g.allgemein?.sonstiges]]) for (const t of a || []) out.push({ bereichId: '', feld, text: t });
    for (const r of list) for (const feld of ['otherNotes', 'wishes']) for (const t of zeilen(r[feld])) if (!SUFFIX.test(t)) out.push({ bereichId: r.id, feld, text: t });
    return out.map((p, i) => ({ ...p, id: 'p' + i, ok: ok.has(key(p.text)) }));
  }
  /** Allgemeines auch in den Räumen (mit Zusatz), wie die Zuordnung es schreibt. */
  async function allgemeinVerteilen(w, list) {
    const g = w.gespraech || {};
    for (const r of list) {
      const b = zeilen(r.wishes).filter((t) => !SUFFIX.test(t)), s = zeilen(r.otherNotes).filter((t) => !SUFFIX.test(t));
      r.wishes = bullets([...b, ...(g.allgemein?.bild || []).map((x) => x + ' (gilt für alle Räume)')]);
      r.otherNotes = bullets([...s, ...(g.allgemein?.sonstiges || []).map((x) => x + ' (ganzes Projekt)')]);
      await saveProject(r);
    }
  }
  async function entfernen(w, list, p) {
    if (!p.bereichId) {
      const g = (w.gespraech ??= {}); g.allgemein ??= { bild: [], sonstiges: [] };
      g.allgemein[p.feld] = (g.allgemein[p.feld] || []).filter((t) => key(t) !== key(p.text));
      await allgemeinVerteilen(w, list);
    } else {
      const r = list.find((x) => x.id === p.bereichId); if (!r) return;
      r[p.feld] = bullets(zeilen(r[p.feld]).filter((t) => key(t) !== key(p.text)));
      await saveProject(r);
    }
  }
  async function hinzu(w, list, bereichId, feld, text) {
    if (!bereichId) {
      const g = (w.gespraech ??= {}); g.allgemein ??= { bild: [], sonstiges: [] };
      const f = feld === 'wishes' || feld === 'bild' ? 'bild' : 'sonstiges';
      g.allgemein[f] = [...(g.allgemein[f] || []), text];
      await allgemeinVerteilen(w, list);
    } else {
      const r = list.find((x) => x.id === bereichId); if (!r) return;
      const f = feld === 'bild' || feld === 'wishes' ? 'wishes' : 'otherNotes';
      const z = zeilen(r[f]), eig = z.filter((t) => !SUFFIX.test(t)), allg = z.filter((t) => SUFFIX.test(t));
      r[f] = bullets([...eig, text, ...allg]);
      await saveProject(r);
    }
  }
  const okSetzen = (w, texte, an = true) => {
    const s = new Set(w.pruefung?.ok || []);
    for (const t of texte) an ? s.add(key(t)) : s.delete(key(t));
    w.pruefung = { ...(w.pruefung || {}), ok: [...s] };
  };

  // ---------- Offen: eine Liste (ungeprüfte Punkte, Fragen vor Ort, Offenes aus dem Vorschlag, Fragen und Aufgaben aus dem Gespräch) ----------
  function offen(w, list, P) {
    const z = w.gespraech?.zus || {}, ok = new Set(w.pruefung?.ok || []);
    return {
      punkte: P.filter((p) => !p.ok),
      fragen: (w.vorOrt?.fragen || []).filter((f) => !f.erledigt),
      entwurf: (w.entwurf?.offen || []).filter((o) => !o.erledigt),
      gespraech: (z.fragen || []).filter((f) => !ok.has(key(f))),
      aufgaben: (z.aufgaben || []).map((a, i) => ({ text: String(a).replace(/^[-•]\s*/, ''), i })).filter((a) => !z.erledigt?.[a.i]),
    };
  }
  const offenZahl = (o) => o.punkte.length + o.fragen.length + o.entwurf.length + o.gespraech.length + o.aufgaben.length;

  // ---------- Maße mit Herkunft ----------
  function masse(w, r) {
    const q = r.aufmass?.raeume?.[0], t = q?.teile?.[0] || {};
    const her = q?.schaetzung?.quelle === 'lidar' ? 'Raumscan' : r.masse?.von === 'sprache' ? 'gesagt' : q?.schaetzung ? 'aus Fotos geschätzt' : 'von Hand';
    const zeilenM = [{ quelle: `Aufmaß (gilt, ${her})`, l: zahl(t.l), b: zahl(t.b), h: zahl(q?.h), gilt: true }];
    const sc = (w.vorOrt?.scans || []).find((s) => s.id === r.scanId || s.raumId === r.id);
    if (sc) zeilenM.push({ quelle: `Raumscan „${sc.name}“`, l: +sc.laenge || 0, b: +sc.breite || 0, h: +sc.hoehe || 0, scan: sc });
    const n = titel(r).toLowerCase();
    const gespr = (w.gespraech?.zus?.masse || []).filter((m) => String(m).toLowerCase().includes(n) || n.includes(String(m).split(':')[0].toLowerCase().trim()));
    const ab = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) > 0.05;
    const g0 = zeilenM[0];
    for (const z of zeilenM.slice(1)) z.weicht = ab(g0.l, z.l) || ab(g0.b, z.b) || ab(g0.h, z.h);
    return { zeilen: zeilenM, gespr };
  }

  // ---------- Seite ----------
  async function view(wid) {
    const w = await kvGet('wohnung:' + wid); if (!w) return toast('Vorgang nicht gefunden.');
    window.Transkript?.sicher(w.gespraech || {});
    const list = await Projekt.raeume(w);
    const k = w.kundeId ? Kunden.byId(w.kundeId) : null;
    const zurueck = () => Projekt.oeffnen(w.id, { pc: 'angebot' });
    header('Aufnahme prüfen', [k ? Kunden.name(k) : w.customer, w.titel].filter(Boolean).join(' · '), { label: 'Zurück', fn: zurueck });
    const P = punkte(w, list), O = offen(w, list, P), nOffen = offenZahl(O);
    const sel = wahl.get(w.id) ?? (P.some((p) => !p.bereichId) || !list.length ? '' : list[0].id);
    const bereiche = [{ id: '', t: 'Allgemein' }, ...list.map((r) => ({ id: r.id, t: titel(r) })), { id: '__offen', t: 'Offen' }];
    const n = (id) => (id === '__offen' ? nOffen : P.filter((p) => p.bereichId === id && !p.ok).length);
    let bilder = [];
    try { if (k) bilder = (await Bilder.laden(k.id, w.objektId || '')).bilder.filter((b) => b.projektId === w.id); } catch {}
    const g = w.gespraech || {}, such = suche.get(w.id) || '';
    const r = list.find((x) => x.id === sel);
    const pr = w.pruefung?.geprueft;

    const punktZeile = (p, mitBereich) => `<div class="pr-p ${p.ok ? 'ok' : ''}" data-pp="${p.id}">
        <button type="button" class="pr-ok" data-pok="${p.id}" aria-label="Übernehmen">${icon('check')}</button>
        <span class="pr-t">${esc(p.text)}<small>${esc([mitBereich ? (p.bereichId ? titel(list.find((x) => x.id === p.bereichId) || {}) : 'Allgemein') : '', FELD[p.feld]].filter(Boolean).join(' · '))}</small></span>
        <select data-pmove="${p.id}" aria-label="Verschieben"><option value="">Verschieben …</option>${bereiche.filter((b) => b.id !== '__offen' && b.id !== p.bereichId).map((b) => `<option value="${b.id || '__allg'}">${esc(b.t)}</option>`).join('')}</select>
        <button type="button" class="icon-btn pr-weg" data-pweg="${p.id}" aria-label="Verwerfen">${icon('x')}</button></div>`;

    const mitte = sel === '__offen' ? `
        <h3 class="pr-h">Offen <span class="count">${nOffen || ''}</span></h3>
        ${nOffen ? '' : '<p class="hint">Nichts mehr offen.</p>'}
        ${O.punkte.length ? `<b class="pr-sub">Noch nicht übernommen</b>${O.punkte.map((p) => punktZeile(p, true)).join('')}` : ''}
        ${O.fragen.length ? `<b class="pr-sub">Fragen von vor Ort</b>${O.fragen.map((f) => `<label class="chk pr-c"><input type="checkbox" data-pfr="${f.id}"> <span>${esc(f.frage)}${f.bereich ? `<small>${esc(f.bereich)}</small>` : ''}</span></label>`).join('')}` : ''}
        ${O.gespraech.length ? `<b class="pr-sub">Offene Fragen aus dem Gespräch</b>${O.gespraech.map((f, i) => `<label class="chk pr-c"><input type="checkbox" data-pgf="${i}"> <span>${esc(f)}</span></label>`).join('')}` : ''}
        ${O.entwurf.length ? `<b class="pr-sub">Offen aus dem Vorschlag</b>${O.entwurf.map((o) => `<label class="chk pr-c"><input type="checkbox" data-pen="${o.id}"> <span>${esc(o.text)}</span></label>`).join('')}` : ''}
        ${O.aufgaben.length ? `<b class="pr-sub">Aufgaben aus dem Gespräch</b>${O.aufgaben.map((a) => `<label class="chk pr-c"><input type="checkbox" data-pau="${a.i}"> <span>${esc(a.text)}</span></label>`).join('')}
          <button type="button" class="btn secondary small" id="prTodos">${icon('check')} Aufgaben als To-dos anlegen</button>` : ''}`
      : `
        <h3 class="pr-h">${esc(sel ? titel(r || {}) : 'Allgemein')}</h3>
        ${P.filter((p) => p.bereichId === sel).map((p) => punktZeile(p)).join('') || `<p class="hint">${g.transcript ? 'Keine Punkte aus dem Gespräch.' : 'Noch kein Gespräch ausgewertet.'} Eigene Punkte unten eintragen.</p>`}
        <div class="pr-neu"><input type="text" id="prNeu" placeholder="Punkt ergänzen, z. B. Fliesen bis 1,20 m" autocomplete="off"><button type="button" class="btn small" id="prNeuGo">${icon('plus')}</button></div>
        ${r ? (() => { const M = masse(w, r); return `<b class="pr-sub">Maße</b>
          <div class="pr-masse">${M.zeilen.map((z, i) => `<div class="pr-m ${z.gilt ? 'gilt' : ''} ${z.weicht ? 'weicht' : ''}"><span>${esc(z.quelle)}</span><b>${z.l || z.b ? `${de(z.l) || '–'} × ${de(z.b) || '–'} m` : 'keine Länge/Breite'}${z.h ? `, Höhe ${de(z.h)} m` : ''}</b>${z.weicht ? `<small>weicht ab</small><button type="button" class="btn secondary small" data-pscan="${i}">Diese Maße nehmen</button>` : ''}</div>`).join('')}
            ${M.gespr.map((m) => `<div class="pr-m"><span>Im Gespräch genannt</span><b>${esc(m)}</b></div>`).join('')}</div>`; })() : ''}
        <b class="pr-sub">Fotos ${sel ? 'des Bereichs' : 'ohne Bereich'}</b>
        <div class="pr-fotos">${bilder.filter((b) => (b.bereichId || '') === sel).map((b) => `<button type="button" class="pr-foto" data-pfoto="${b.id}" title="Anderem Bereich zuordnen"><img src="${b.thumb}" alt=""></button>`).join('') || '<p class="hint">Keine.</p>'}</div>`;

    const zeilenG = (g.zeilen || []).filter((z) => !such || `${z.sprecher} ${z.text}`.toLowerCase().includes(such.toLowerCase()));
    const sprecher = [...new Set((g.zeilen || []).map((z) => z.sprecher).filter(Boolean))];
    const rechts = `
        <h3 class="pr-h">Gespräch</h3>
        <input type="search" id="prSuche" value="${esc(such)}" placeholder="Im Gespräch suchen">
        <div class="pr-gespr">${zeilenG.slice(0, 600).map((z) => { const au = z.ab != null && (g.aufnahmen || []).find((a) => a.id === z.aufnahmeId)?.audio; return `<p>${au ? `<button type="button" class="pr-hoer" data-hoer="${esc(z.id)}" title="Ab hier anhören">${icon('play')}${Audioablage.zeit(z.ab)}</button> ` : ''}<b class="sp${sprecher.indexOf(z.sprecher) % 4}">${esc(z.sprecher || '')}</b> ${esc(z.text)}</p>`; }).join('') || `<p class="hint">${g.transcript ? 'Nichts gefunden.' : 'Noch kein Gespräch.'}</p>`}</div>`;

    main().innerHTML = `
      <div class="pr-kopf">
        <span class="pr-stand">${pr ? `${icon('check')} Geprüft am ${esc(new Date(pr.t).toLocaleDateString('de-DE'))}${pr.wer ? ` (${esc(pr.wer)})` : ''}` : `${nOffen} offen`}</span>
        <button type="button" class="btn secondary small" id="prAlle">${icon('check')} Alle übernehmen</button>
        <button type="button" class="btn secondary small" id="prSub">${icon('mail')} An Sub schicken</button>
        <button type="button" class="btn secondary small" id="prNach">${icon('calendar')} Nachtermin</button>
        <button type="button" class="btn secondary small" id="prAnruf">${icon('phone')} Anruf notieren</button>
        <button type="button" class="btn small" id="prFertig">${pr ? 'Zum Angebot' : 'Aufnahme geprüft, zum Angebot'} ${icon('chevron')}</button>
      </div>
      <div class="pr-grid">
        <nav class="pr-links">${bereiche.map((b) => `<button type="button" class="pr-b ${b.id === sel ? 'on' : ''} ${b.id === '__offen' ? 'offen' : ''}" data-pb="${b.id}"><span>${esc(b.t)}</span>${n(b.id) ? `<span class="count">${n(b.id)}</span>` : ''}</button>`).join('')}</nav>
        <section class="pr-mitte card">${mitte}</section>
        <section class="pr-rechts card">${rechts}</section>
      </div>`;

    // ---------- Bindung ----------
    const neu = async () => { const y = window.scrollY; await view(w.id); window.scrollTo(0, y); };
    const speichern = async () => { delete w.isNew; await Projekt.save(w); };
    const pVon = (id) => P.find((p) => p.id === id);
    $$('[data-pb]').forEach((b) => (b.onclick = () => { wahl.set(w.id, b.dataset.pb); neu(); }));
    $$('[data-pok]').forEach((b) => (b.onclick = async () => { const p = pVon(b.dataset.pok); okSetzen(w, [p.text], !p.ok); await speichern(); neu(); }));
    $$('[data-pweg]').forEach((b) => (b.onclick = async () => {
      const p = pVon(b.dataset.pweg);
      await entfernen(w, list, p);
      w.pruefung = { ...(w.pruefung || {}), weg: [...(w.pruefung?.weg || []), { text: p.text, t: Date.now() }] };
      await speichern(); toast('Verworfen'); neu();
    }));
    $$('[data-pmove]').forEach((s) => (s.onchange = async () => {
      const p = pVon(s.dataset.pmove), ziel = s.value === '__allg' ? '' : s.value; if (!s.value) return;
      await entfernen(w, list, p); await hinzu(w, list, ziel, p.feld, p.text);
      await speichern(); toast('Verschoben'); neu();
    }));
    if ($('#prNeuGo')) {
      const go = async () => { const t = $('#prNeu').value.trim(); if (!t) return; await hinzu(w, list, sel, 'otherNotes', t); okSetzen(w, [t]); await speichern(); neu(); };
      $('#prNeuGo').onclick = go; $('#prNeu').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }
    $$('[data-pscan]').forEach((b) => (b.onclick = async () => {
      const z = masse(w, r).zeilen[+b.dataset.pscan];
      if (z.scan && window.Raumscan?.masseIn) Raumscan.masseIn(r, z.scan);
      else { window.Angebot._intern.init(r); const q = r.aufmass.raeume[0]; q.teile ??= [{}]; q.teile[0] = { ...(q.teile[0] || {}), l: de(z.l), b: de(z.b) }; if (z.h) q.h = de(z.h); }
      await saveProject(r); await speichern(); toast('Maße übernommen'); neu();
    }));
    $$('[data-pfoto]').forEach((b) => (b.onclick = async () => {
      const v = await sheet('Foto welchem Bereich zuordnen?', bereiche.filter((x) => x.id !== '__offen').map((x) => ({ label: x.t, value: x.id || '__allg' })));
      if (!v) return;
      const d = await Bilder.laden(k.id, w.objektId || ''), bb = d.bilder.find((x) => x.id === b.dataset.pfoto); if (!bb) return;
      if (v === '__allg') delete bb.bereichId; else bb.bereichId = v;
      await Bilder.speichern(k.id, w.objektId || '', d); neu();
    }));
    // Offen
    $$('[data-pfr]').forEach((c) => (c.onchange = async () => { const f = (w.vorOrt?.fragen || []).find((x) => x.id === c.dataset.pfr); if (f) { f.erledigt = c.checked; await speichern(); neu(); } }));
    $$('[data-pen]').forEach((c) => (c.onchange = async () => { const o = (w.entwurf?.offen || []).find((x) => x.id === c.dataset.pen); if (o) { o.erledigt = c.checked; await speichern(); neu(); } }));
    $$('[data-pgf]').forEach((c) => (c.onchange = async () => { okSetzen(w, [O.gespraech[+c.dataset.pgf]]); await speichern(); neu(); }));
    $$('[data-pau]').forEach((c) => (c.onchange = async () => { const z = w.gespraech.zus; (z.erledigt ??= [])[+c.dataset.pau] = c.checked; await speichern(); neu(); }));
    if ($('#prTodos')) $('#prTodos').onclick = async () => {
      for (const a of O.aufgaben) await window.Todos?.anlegen({ text: a.text, prio: 'mittel', wer: window.Kalender?.wer?.() || '', bezug: { kundeId: w.kundeId || '', vorgangId: w.id }, art: 'aufgabe', schluessel: `aufgabe:${w.id}:${key(a.text)}` });
      const z = w.gespraech.zus; for (const a of O.aufgaben) (z.erledigt ??= [])[a.i] = true;
      await speichern(); toast(`${O.aufgaben.length} To-dos angelegt`); neu();
    };
    // Gespräch
    $$('[data-hoer]').forEach((b) => (b.onclick = () => { const z = (g.zeilen || []).find((x) => x.id === b.dataset.hoer), a = z && (g.aufnahmen || []).find((x) => x.id === z.aufnahmeId); if (a) Audioablage.abspielen(a.audio, z.ab, `${a.art || 'Gespräch'} ${new Date(a.t).toLocaleDateString('de-DE')}`); }));
    if ($('#prSuche')) $('#prSuche').oninput = debounce((e) => { suche.set(w.id, e.target.value); const y = window.scrollY; view(w.id).then(() => { window.scrollTo(0, y); const s = $('#prSuche'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }); }, 350);
    // Kopf
    $('#prAlle').onclick = async () => { okSetzen(w, P.map((p) => p.text)); await speichern(); toast('Alle Punkte übernommen'); neu(); };
    $('#prFertig').onclick = async () => {
      if (!pr) { w.pruefung = { ...(w.pruefung || {}), geprueft: { t: Date.now(), wer: ich() } }; await speichern(); }
      zurueck();
    };
    $('#prNach').onclick = () => window.Kalender?.bearbeiten({ kundeId: w.kundeId || '', objektId: w.objektId || '', projektId: w.id, art: 'kunde', titel: `Nachtermin ${w.titel || ''}`.trim() }, () => view(w.id));
    $('#prAnruf').onclick = () => anruf(w).then((ok) => ok && neu());
    $('#prSub').onclick = () => anSub(w, list, bilder).then((ok) => ok && neu());
  }

  // ---------- Anruf notieren: als eigene Aufnahme „Telefonat“ ins Gespräch ----------
  async function anruf(w) {
    const v = await sheet('Anruf notieren', [], { text: 'Was wurde besprochen? Tippen oder das Mikrofon der Tastatur nehmen.', suche: '' });
    const t = String(v?.text || '').trim(); if (!t) return false;
    const g = (w.gespraech ??= {});
    const wer = ich() || 'Firma';
    window.Transkript.anhaengen(g, { art: vorgabe('anrufArt') || 'Telefonat', dabei: [wer, 'Kunde'], text: t.split(/\n+/).map((z) => (/^[\wÄÖÜäöüß .-]{1,30}:/.test(z) ? z : `${wer}: ${z}`)).join('\n') });
    g.t = Date.now();
    await Projekt.save(w);
    toast('Ins Gespräch übernommen. „Wünsche neu zuordnen“ verteilt es auf die Bereiche.', 5000);
    return true;
  }

  // ---------- An Sub schicken (ein Blatt ohne Preise und ohne interne Notizen) ----------
  async function anSub(w, list, bilder) {
    const pid = await window.Partner?.waehlen(); if (!pid) return false;
    const p = Partner.byId(pid); if (!p) return false;
    let ber = list;
    if (list.length > 1) {
      const v = await sheet('Welche Bereiche?', [{ label: 'Alle Bereiche', value: '__alle' }, ...list.map((r) => ({ label: titel(r), value: r.id }))]);
      if (!v) return false;
      if (v !== '__alle') ber = list.filter((r) => r.id === v);
    }
    const tage = +vorgabe('subFristTage') || 7;
    const frist = window.Besuch?.werktage(tage) || '';
    const fristDe = frist ? new Date(frist + 'T12:00').toLocaleDateString('de-DE') : '';
    const art = await sheet(`An ${Partner.titel(p)}`, [
      { label: `Bitte um Angebot bis ${fristDe}`, sub: 'Mit dem Satz „' + vorgabeText('subLohnMaterial') + '“, DOM erinnert dich an die Frist', icon: icon('check'), value: 'angebot' },
      { label: 'Nur zur Info', sub: 'Ohne Bitte um Angebot', icon: icon('file'), value: 'info' },
    ]);
    if (!art) return false;
    toast('Blatt wird erstellt …', 3000);
    const G = await GesprPdf._geruest(w, art === 'angebot' ? 'Anfrage' : 'Information zum Projekt');
    const k = w.kundeId ? Kunden.byId(w.kundeId) : null, o = k && w.objektId ? Kunden.objekt(k, w.objektId) : null;
    await G.absatz(`${w.titel || 'Projekt'} · Objekt: ${o ? Kunden.objektText(o) : w.address || ''}`, { fett: true });
    if (o) { const an = [o.etage && `Etage ${o.etage}`, o.aufzug && `Aufzug ${o.aufzug}`, o.parken && `Parken: ${o.parken}`].filter(Boolean).join(' · '); if (an) await G.absatz(an); }
    const allg = [...(w.gespraech?.allgemein?.sonstiges || []), ...(w.gespraech?.allgemein?.bild || [])];
    if (allg.length) { await G.ueber('Für alle Bereiche'); for (const t of allg) await G.absatz('• ' + t, { abstand: 0.5 }); }
    const maxF = +vorgabe('subFotosMax') || 6;
    for (const r of ber) {
      await G.ueber(titel(r));
      const M = masse(w, r).zeilen[0];
      if (M.l || M.b || M.h) await G.absatz(`Maße: ${[M.l && de(M.l), M.b && de(M.b)].filter(Boolean).join(' × ')} m${M.h ? `, Höhe ${de(M.h)} m` : ''}`);
      for (const t of [...zeilen(r.otherNotes), ...zeilen(r.wishes)].filter((x) => !SUFFIX.test(x))) await G.absatz('• ' + t, { abstand: 0.5 });
      const fotos = bilder.filter((b) => b.bereichId === r.id).slice(0, maxF);
      for (const b of fotos) {
        const data = await kvGet('bild:' + b.id); if (!data) continue;
        await G.platz(62); await addFit(G.doc, data, G.M, G.y, 80, 58, 'JPEG'); G.y += 62;
      }
    }
    if (art === 'angebot') { await G.ueber('Bitte um Angebot'); await G.absatz(vorgabeText('subAnfrageText', { frist: fristDe }) + ' ' + vorgabeText('subLohnMaterial')); }
    const name = `${art === 'angebot' ? 'Anfrage' : 'Info'}_${(w.titel || 'Projekt').replace(/[^\wÄÖÜäöüß-]+/g, '_')}_${Partner.titel(p).replace(/[^\wÄÖÜäöüß-]+/g, '_')}.pdf`;
    const file = new File([G.doc.output('blob')], name, { type: 'application/pdf' });
    const text = vorgabeText(art === 'angebot' ? 'textSubAnfrage' : 'textSubInfo', { anrede: p.inhaber ? `Hallo ${p.inhaber},` : 'Hallo,', projekt: w.titel || 'Projekt', frist: fristDe, name: ich() }).replace(/\n\s*\n/g, '\n').trim();
    let ok = false;
    try { if (navigator.canShare?.({ files: [file] }) || window.DomDesktop) { await navigator.share({ files: [file], title: name, text, an: p.email || '', betreff: `${art === 'angebot' ? 'Anfrage' : 'Info'}: ${w.titel || 'Projekt'}${w.nr ? ' ' + w.nr : ''}` }); ok = true; } else { await pdfAnsicht(file, name); ok = true; } }
    catch (e) { if (e.name !== 'AbortError') toast('Senden ging nicht: ' + (e.message || e), 5000); return false; }
    if (!ok) return false;
    w.subAnfragen = [...(w.subAnfragen || []), { id: uid(), partnerId: p.id, t: Date.now(), art, frist: art === 'angebot' ? frist : '', bereiche: ber.map((r) => r.id), wer: ich() }];
    await Projekt.save(w);
    if (art === 'angebot') await window.Todos?.anlegen({ text: `Angebot von ${Partner.titel(p)} nachfassen (${w.titel || 'Projekt'})`, faellig: frist, prio: 'mittel', wer: window.Kalender?.wer?.() || '', bezug: { kundeId: w.kundeId || '', partnerId: p.id, vorgangId: w.id }, art: 'subAnfrage', schluessel: `subAnfrage:${w.id}:${p.id}:${frist}` });
    toast(art === 'angebot' ? `Angefragt, To-do für den ${fristDe} angelegt` : 'Verschickt');
    return true;
  }

  /** Für Listen und das Dashboard: Stand der Prüfung. */
  const stand = (w) => (w.pruefung?.geprueft ? 'geprüft' : '');
  return { view, stand, punkte, anruf, anSub };
})();
