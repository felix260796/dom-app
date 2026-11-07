'use strict';
/* DOM – Rechnungen an Kunden (Ausgangsrechnungen), B11 B15 B16 B19 B20 B22 B23.
 * - Abschlagsrechnungen nach Plan (Standard 30 / 40 / 30 %): Abschlag 1, Abschlag 2, der Rest kommt mit der Schlussrechnung
 * - Schlussrechnung aus den Raum-Angeboten des Projekts plus Nachträge, abzüglich der Abschläge, mit Lohnanteil (§ 35a)
 * - Nachträge je Projekt (w.nachtraege), zählen auch in der Kalkulation
 * - Zahlungsziel und Fälligkeit, überfällig = rot, Zahlungserinnerung und Mahnungen als PDF zum Senden
 * Speicher: 'rechnung:<id>' { id, kind:'rechnung', projektId, nr, art: 'abschlag'|'schluss', stufe, prozent, titel, zeitraum,
 *   datum, faellig, netto, satz, positionen (nur Schluss: [{raum, text, menge, einheit, ep, gp}]), nachtraege, abzuege, lohn,
 *   bezahlt ('JJJJ-MM-TT' oder ''), mahnungen [{stufe, datum}], notiz, created, updated }
 * Nummern fortlaufend je Jahr über 'rechnungZaehler' (R2026-001). Einstellungen: settings.zahlungsziel, settings.abschlagPlan.
 * Baut auf app.js, core.js, projekt.js, kunden.js, angebot.js (summen, preisliste) und finanzen.js auf. */
window.Rechnung = (() => {
  const alle = new Map();
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const eur = (x) => (x || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const heute = () => iso(new Date());
  const plusTage = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
  const tag = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const ziel = () => +vorgabe('zahlungsziel') || 0;
  /** Abschlagsplan: eigener Plan des Projekts, sonst aus den Einstellungen. */
  const plan = (w) => (Array.isArray(w?.abschlagPlan) && w.abschlagPlan.length ? w.abschlagPlan : vorgabe('abschlagPlan'));
  const brutto = (r) => r2(r.netto * (1 + (r.satz ?? 19) / 100));
  /** Zahlbetrag: bei der Schlussrechnung abzüglich der Abschläge. */
  const zahlbetrag = (r) => r2(brutto(r) - (r.abzuege || []).reduce((s, a) => s + a.brutto, 0));
  const ueberfaellig = (r) => !r.bezahlt && r.faellig && r.faellig < heute();
  const artName = (r) => (r.art === 'schluss' ? 'Schlussrechnung' : `${r.stufe}. Abschlagsrechnung`);
  const MAHN = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'];

  // ---------- Speicher ----------
  async function laden() {
    alle.clear();
    const d = await db();
    const rows = await new Promise((res) => { const out = []; const q = d.transaction('kv').objectStore('kv').openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return res(out); if (String(c.key).startsWith('rechnung:')) out.push(c.value); c.continue(); }; q.onerror = () => res(out); });
    for (const r of rows) if (r?.id) alle.set(r.id, r);
  }
  const liste = () => [...alle.values()].sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.created || 0) - (a.created || 0));
  const fuerProjekt = (pid) => liste().filter((r) => r.projektId === pid).sort((a, b) => (a.created || 0) - (b.created || 0));
  async function speichern(r) { r.updated = Date.now(); alle.set(r.id, r); await kvSet('rechnung:' + r.id, r); }
  async function naechsteNummer() {
    const jahr = new Date().getFullYear();
    const z = (await kvGet('rechnungZaehler')) || {};
    z[jahr] = (z[jahr] || 0) + 1;
    await kvSet('rechnungZaehler', z);
    return `R${jahr}-${String(z[jahr]).padStart(3, '0')}`;
  }

  // ---------- Auftragssumme aus den Angeboten + Nachträge ----------
  async function auftrag(w) {
    const A = window.Angebot._intern;
    await A.preisliste();
    const zeilen = []; let lohn = 0;
    for (const id of w.rooms || []) {
      const r = await kvGet('project:' + id);
      if (!r?.angebot?.positionen?.length) continue;
      const S = A.summen(r.angebot.positionen, r.angebot.kalk);
      for (const z of S.zeilen) zeilen.push({ raum: z.raum || r.room || '', text: z.it.text + (z.bem ? ' – ' + z.bem : ''), menge: z.menge, einheit: z.it.einheit, ep: z.ep, gp: z.gp, gewerk: z.it.gewerk });
      lohn += S.zeilen.reduce((s, z) => s + z.lohn, 0);
    }
    const nachtraege = (w.nachtraege || []).map((n) => ({ ...n, gp: r2(n.menge * n.ep) }));
    const netto = r2(zeilen.reduce((s, z) => s + z.gp, 0) + nachtraege.reduce((s, n) => s + n.gp, 0));
    return { zeilen, nachtraege, netto, lohn: r2(lohn + nachtraege.reduce((s, n) => s + (n.lohn ? n.gp : 0), 0)) };
  }

  // ---------- Abschnitt im Projekt ----------
  async function projektAbschnitt(el, w) {
    if (!el) return;
    await laden();
    const a = await auftrag(w);
    if (!el.isConnected) return;
    const re = fuerProjekt(w.id);
    const abschl = re.filter((r) => r.art === 'abschlag'), schluss = re.find((r) => r.art === 'schluss');
    const P = plan(w), naechster = abschl.length + 1;
    const kannAbschlag = !schluss && naechster < P.length && a.netto > 0;
    const offen = re.filter((r) => !r.bezahlt);
    el.innerHTML = `<div class="sec-h"><h2>Rechnungen an den Kunden</h2>${re.length ? `<span class="count">${re.length}</span>` : ''}</div>
      <div class="card">
        <div class="kalk-z"><span>Auftragssumme netto</span><b>${eur(a.netto)}</b></div>
        ${a.nachtraege.length ? `<div class="kalk-z"><span>davon Nachträge</span><b>${eur(a.nachtraege.reduce((s, n) => s + n.gp, 0))}</b></div>` : ''}
        <div class="kalk-z"><span>Berechnet brutto</span><b>${eur(re.reduce((s, r) => s + brutto(r) - (r.abzuege || []).reduce((t, x) => t + x.brutto, 0), 0))}</b></div>
        ${offen.length ? `<div class="kalk-z"><span>Noch offen</span><b style="color:#d2691e">${eur(offen.reduce((s, r) => s + zahlbetrag(r), 0))}</b></div>` : ''}
        ${a.netto ? '' : '<p class="hint" style="margin:6px 0 0">Noch kein Angebot mit Positionen. Rechnungen entstehen aus dem Angebot.</p>'}
      </div>
      <div class="plist">${re.map(zeile).join('')}</div>
      ${schluss ? '' : `<label class="rplan">Abschläge in diesem Projekt <input type="text" id="rPlanW" value="${esc(P.join(' / '))}"></label>
      <p class="hint" style="margin:2px 0 0">${Array.isArray(w.abschlagPlan) && w.abschlagPlan.length ? 'Eigener Plan für dieses Projekt. Leeren für den Standard aus den Einstellungen.' : 'Standard aus den Einstellungen. Hier änderbar nur für dieses Projekt.'}</p>`}
      <div class="rbtns">
        ${kannAbschlag ? `<button class="btn" id="rAb">${icon('plus')} ${naechster}. Abschlag (${P[naechster - 1]} %)</button>` : ''}
        ${!schluss && a.netto ? `<button class="btn ${kannAbschlag ? 'secondary' : ''}" id="rSchluss">${icon('file')} Schlussrechnung</button>` : ''}
      </div>
      <div class="sec-h" style="margin-top:18px"><h2>Nachträge</h2>${w.nachtraege?.length ? `<span class="count">${w.nachtraege.length}</span>` : ''}</div>
      <div class="plist">${(w.nachtraege || []).map((n) => `<button class="pcard" data-nt="${n.id}"><span class="pc-ph">${icon('plus')}</span>
        <span class="pc-t"><b>${esc(n.text || 'Nachtrag')}</b><span class="muted">${esc(String(n.menge).replace('.', ','))} ${esc(n.einheit)} × ${eur(n.ep)}${n.datum ? ' · ' + tag(n.datum) : ''}</span><span class="ang-sum">${eur(r2(n.menge * n.ep))} netto</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>
      ${schluss ? '' : `<button class="add-room" id="rNt" style="width:100%;margin-top:8px">${icon('plus')} Nachtrag (Zusatzleistung)</button>`}`;
    const zurueck = () => Projekt.view();
    if ($('#rPlanW', el)) $('#rPlanW', el).onchange = async (e) => {
      if (!e.target.value.trim()) { delete w.abschlagPlan; await Projekt.save(w); toast('Standard-Plan'); return projektAbschnitt(el, w); }
      const p = planLesen(e.target.value);
      if (!p) return toast('Die Anteile müssen zusammen 100 % ergeben.', 4000);
      w.abschlagPlan = p; await Projekt.save(w); toast('Plan für dieses Projekt gespeichert'); projektAbschnitt(el, w);
    };
    if ($('#rAb', el)) $('#rAb', el).onclick = () => erstellen(w, 'abschlag', zurueck);
    if ($('#rSchluss', el)) $('#rSchluss', el).onclick = () => erstellen(w, 'schluss', zurueck);
    if ($('#rNt', el)) $('#rNt', el).onclick = () => nachtrag(w, null, zurueck);
    $$('[data-nt]', el).forEach((b) => (b.onclick = () => nachtrag(w, w.nachtraege.find((n) => n.id === b.dataset.nt), zurueck)));
    $$('[data-rech]', el).forEach((b) => (b.onclick = () => detail(alle.get(b.dataset.rech), zurueck)));
  }
  function zeile(r) {
    const st = r.bezahlt ? ['Bezahlt', '#1b5e3a'] : ueberfaellig(r) ? [r.mahnungen?.length ? MAHN[r.mahnungen.length - 1] : 'Überfällig', '#c0392b'] : ['Offen', '#d2691e'];
    return `<button class="pcard" data-rech="${r.id}"><span class="pc-ph">${icon('file')}</span>
      <span class="pc-t"><b>${esc(artName(r))}</b>
        <span class="pills"><span class="st-pill" style="--c:${st[1]}">${st[0]}</span><span class="muted">${esc(r.nr)} · ${esc(tag(r.datum))}</span></span>
        <span class="ang-sum">${eur(zahlbetrag(r))}${r.bezahlt ? '' : ` · <span class="muted">fällig ${esc(tag(r.faellig))}</span>`}</span></span>${icon('chevron', 'pc-chev')}</button>`;
  }

  // ---------- Nachtrag ----------
  async function nachtrag(w, n, fertig) {
    const neu = !n;
    n = n ? { ...n } : { id: uid(), text: '', menge: 1, einheit: 'pauschal', ep: 0, lohn: true, datum: heute() };
    header(neu ? 'Nachtrag' : 'Nachtrag bearbeiten', w.titel || '', { label: 'Zurück', fn: fertig });
    main().innerHTML = `<div class="card kform">
        <label style="margin-top:0">Leistung</label><textarea id="nText" placeholder="z. B. Zusätzliche Steckdose im Bad, Leitungen erneuert">${esc(n.text)}</textarea>
        <div class="row"><div><label>Menge</label><input type="text" inputmode="decimal" id="nMenge" value="${esc(String(n.menge).replace('.', ','))}"></div>
          <div><label>Einheit</label><select id="nEinh">${['pauschal', 'Stück', 'm²', 'lfm', 'Std.'].map((e) => `<option ${e === n.einheit ? 'selected' : ''}>${e}</option>`).join('')}</select></div></div>
        <div class="row"><div><label>Einzelpreis netto</label><input type="text" inputmode="decimal" id="nEp" value="${n.ep ? String(n.ep).replace('.', ',') : ''}" placeholder="0,00"></div>
          <div><label>Beauftragt am</label><input type="date" id="nDatum" value="${esc(n.datum)}"></div></div>
        <label class="chk"><input type="checkbox" id="nLohn" ${n.lohn ? 'checked' : ''}> Arbeitsleistung (zählt zum Lohnanteil)</label>
        <p class="hint" id="nSum" style="margin:6px 0 0"></p>
      </div>
      <button class="btn big block" id="nSave">${icon('check')} Speichern</button>
      ${neu ? '' : `<button class="link-danger" id="nDel">${icon('trash')} Nachtrag löschen</button>`}`;
    const lesen = () => { n.text = $('#nText').value.trim(); n.menge = num($('#nMenge').value) || 1; n.einheit = $('#nEinh').value; n.ep = r2(num($('#nEp').value)); n.datum = $('#nDatum').value; n.lohn = $('#nLohn').checked; };
    const summe = () => { lesen(); $('#nSum').textContent = `Summe ${eur(r2(n.menge * n.ep))} netto. Kommt mit der Schlussrechnung zum Kunden.`; };
    $('#nMenge').oninput = summe; $('#nEp').oninput = summe; summe();
    $('#nSave').onclick = async () => {
      lesen();
      if (!n.text || !n.ep) return toast('Bitte Leistung und Preis eintragen.');
      w.nachtraege = (w.nachtraege || []).filter((x) => x.id !== n.id).concat(n);
      await Projekt.save(w); toast('Nachtrag gespeichert'); fertig();
    };
    if ($('#nDel')) $('#nDel').onclick = async () => { if (!confirm('Nachtrag löschen?')) return; w.nachtraege = w.nachtraege.filter((x) => x.id !== n.id); await Projekt.save(w); fertig(); };
    window.scrollTo(0, 0);
  }

  // ---------- Rechnung erstellen ----------
  async function erstellen(w, art, fertig) {
    const a = await auftrag(w);
    const re = fuerProjekt(w.id), abschl = re.filter((r) => r.art === 'abschlag');
    const P = plan(w), stufe = abschl.length + 1;
    const r = { id: uid(), kind: 'rechnung', projektId: w.id, nr: '', art, stufe, prozent: art === 'abschlag' ? P[stufe - 1] : 100, titel: w.titel || 'Sanierung',
      zeitraum: [w.baustart && tag(w.baustart), art === 'schluss' ? tag(heute()) : ''].filter(Boolean).join(' bis ') || '', datum: heute(), faellig: plusTage(heute(), ziel()),
      netto: 0, satz: 19, positionen: [], nachtraege: [], abzuege: [], lohn: 0, bezahlt: '', mahnungen: [], notiz: '', created: Date.now() };
    if (art === 'schluss') {
      r.positionen = a.zeilen.map(({ raum, text, menge, einheit, ep, gp }) => ({ raum, text, menge, einheit, ep, gp }));
      r.nachtraege = a.nachtraege.map(({ text, menge, einheit, ep, gp }) => ({ text, menge, einheit, ep, gp }));
      r.netto = a.netto; r.lohn = r2(a.lohn * 1.19);
      r.abzuege = abschl.map((x) => ({ nr: x.nr, datum: x.datum, netto: x.netto, brutto: brutto(x), bezahlt: !!x.bezahlt }));
    } else r.netto = r2((a.netto * r.prozent) / 100);
    header(art === 'schluss' ? 'Schlussrechnung' : `${stufe}. Abschlagsrechnung`, w.titel || '', { label: 'Zurück', fn: fertig });
    const render = () => {
      main().innerHTML = `<div class="card kform">
          ${art === 'abschlag' ? `<div class="row"><div><label style="margin-top:0">Anteil vom Auftrag</label><input type="text" inputmode="decimal" id="rPro" value="${String(r.prozent).replace('.', ',')}"></div>
            <div><label style="margin-top:0">Betrag netto</label><input type="text" inputmode="decimal" id="rNetto" value="${String(r.netto).replace('.', ',')}"></div></div>
            <p class="hint" style="margin:4px 0 0">Auftragssumme ${eur(a.netto)} netto</p>` : `
            <div class="kalk-z"><span>Leistungen laut Angebot</span><b>${eur(a.zeilen.reduce((s, z) => s + z.gp, 0))}</b></div>
            ${a.nachtraege.length ? `<div class="kalk-z"><span>Nachträge (${a.nachtraege.length})</span><b>${eur(a.nachtraege.reduce((s, n) => s + n.gp, 0))}</b></div>` : ''}
            <div class="kalk-z"><span>Summe netto</span><b>${eur(r.netto)}</b></div>
            <div class="kalk-z"><span>Brutto</span><b>${eur(brutto(r))}</b></div>
            ${r.abzuege.map((x) => `<div class="kalk-z"><span>abzüglich Abschlag ${esc(x.nr)}</span><b>- ${eur(x.brutto)}</b></div>`).join('')}
            <div class="kalk-z big" style="--c:var(--navy)"><span>Noch zu zahlen</span><b>${eur(zahlbetrag(r))}</b></div>`}
          <label>Bezeichnung</label><input type="text" id="rTitel" value="${esc(r.titel)}">
          <label>Leistungszeitraum</label><input type="text" id="rZeit" value="${esc(r.zeitraum)}" placeholder="z. B. 12.01.2027 bis 06.02.2027">
          <div class="row"><div><label>Rechnungsdatum</label><input type="date" id="rDatum" value="${r.datum}"></div>
            <div><label>Zahlbar bis</label><input type="date" id="rFaellig" value="${r.faellig}"></div></div>
          ${art === 'abschlag' ? `<p class="hint" id="rBr" style="margin:6px 0 0">Brutto ${eur(brutto(r))}</p>` : ''}
        </div>
        <button class="btn big block" id="rSave">${icon('check')} Rechnung erstellen</button>
        <p class="hint center">Die Rechnung bekommt danach eine feste Nummer und lässt sich als PDF senden.</p>`;
      if (art === 'abschlag') {
        $('#rPro').oninput = () => { r.prozent = num($('#rPro').value); r.netto = r2((a.netto * r.prozent) / 100); $('#rNetto').value = String(r.netto).replace('.', ','); $('#rBr').textContent = `Brutto ${eur(brutto(r))}`; };
        $('#rNetto').oninput = () => { r.netto = r2(num($('#rNetto').value)); r.prozent = a.netto ? Math.round((r.netto / a.netto) * 1000) / 10 : 0; $('#rPro').value = String(r.prozent).replace('.', ','); $('#rBr').textContent = `Brutto ${eur(brutto(r))}`; };
      }
      $('#rDatum').onchange = (e) => { $('#rFaellig').value = plusTage(e.target.value, ziel()); };
      $('#rSave').onclick = async () => {
        r.titel = $('#rTitel').value.trim() || r.titel; r.zeitraum = $('#rZeit').value.trim(); r.datum = $('#rDatum').value || heute(); r.faellig = $('#rFaellig').value;
        if (!r.netto) return toast('Der Betrag ist 0.');
        r.nr = await naechsteNummer();
        await speichern(r);
        if (art === 'schluss' && ['', 'geplant', 'fertig'].includes(Projekt.norm(w.status))) { w.status = 'rechnung'; (w.verlauf ??= []).push({ st: 'rechnung', t: Date.now() }); await Projekt.save(w); }
        toast(`Rechnung ${r.nr} erstellt`);
        detail(r, fertig);
      };
    };
    render(); window.scrollTo(0, 0);
  }

  // ---------- Rechnung ansehen, senden, bezahlt, Mahnung ----------
  async function detail(r, fertig) {
    if (!r) return fertig();
    const w = await kvGet('wohnung:' + r.projektId);
    header(artName(r), `${r.nr} · ${tag(r.datum)}`, { label: 'Zurück', fn: fertig });
    const st = r.bezahlt ? `Bezahlt am ${tag(r.bezahlt)}` : ueberfaellig(r) ? `Überfällig seit ${tag(r.faellig)}` : `Fällig am ${tag(r.faellig)}`;
    const naechsteMahn = r.mahnungen?.length || 0;
    main().innerHTML = `<div class="card">
        <div class="kalk-z"><span>${esc(r.titel)}</span><b></b></div>
        <div class="kalk-z"><span>Netto</span><b>${eur(r.netto)}</b></div>
        <div class="kalk-z"><span>Brutto</span><b>${eur(brutto(r))}</b></div>
        ${(r.abzuege || []).length ? `<div class="kalk-z"><span>abzüglich Abschläge</span><b>- ${eur((r.abzuege || []).reduce((s, a) => s + a.brutto, 0))}</b></div>` : ''}
        <div class="kalk-z big" style="--c:${r.bezahlt ? '#1b5e3a' : ueberfaellig(r) ? '#c0392b' : 'var(--navy)'}"><span>Zahlbetrag</span><b>${eur(zahlbetrag(r))}</b></div>
        <p class="kalk-amp" style="--c:${r.bezahlt ? '#1b5e3a' : ueberfaellig(r) ? '#c0392b' : '#d2691e'}"><i></i>${esc(st)}</p>
      </div>
      <div class="docs">
        <button class="doc" id="rPdf"><span class="d-ico navy">${icon('file')}</span><span class="d-t"><b>Rechnung als PDF senden</b><span>Per Mail, WhatsApp oder speichern</span></span>${icon('chevron', 'pc-chev')}</button>
        ${!r.bezahlt && ueberfaellig(r) && naechsteMahn < MAHN.length ? `<button class="doc" id="rMahn"><span class="d-ico brass">${icon('mail')}</span><span class="d-t"><b>${MAHN[naechsteMahn]} senden</b><span>${naechsteMahn ? `Zuletzt: ${esc(MAHN[naechsteMahn - 1])} am ${tag(r.mahnungen[naechsteMahn - 1].datum)}` : 'Freundlich, mit neuer Frist von 7 Tagen'}</span></span>${icon('chevron', 'pc-chev')}</button>` : ''}
      </div>
      <div class="card kform" style="margin-top:12px">
        <div class="row"><div><label style="margin-top:0">Zahlbar bis</label><input type="date" id="rFaellig" value="${esc(r.faellig)}"></div>
          <div><label style="margin-top:0">Bezahlt am</label><input type="date" id="rBez" value="${esc(r.bezahlt)}"></div></div>
        ${r.bezahlt ? '' : `<button class="btn secondary block" id="rJetzt" style="margin-top:10px">${icon('check')} Zahlung heute eingegangen</button>`}
        <label>Notiz</label><textarea id="rNotiz" placeholder="z. B. Teilzahlung, Skonto">${esc(r.notiz)}</textarea>
      </div>
      <button class="link-danger" id="rDel">${icon('trash')} Rechnung löschen</button>`;
    const speichernUndStatus = async () => {
      await speichern(r);
      // Alle Rechnungen inkl. Schlussrechnung bezahlt → Projekt „Bezahlt“
      const re = fuerProjekt(r.projektId);
      if (w && re.some((x) => x.art === 'schluss') && re.every((x) => x.bezahlt) && Projekt.norm(w.status) !== 'bezahlt') {
        w.status = 'bezahlt'; (w.verlauf ??= []).push({ st: 'bezahlt', t: Date.now() }); await Projekt.save(w); toast('Alles bezahlt. Projekt ist erledigt.', 4000);
      }
    };
    $('#rFaellig').onchange = async (e) => { r.faellig = e.target.value; await speichern(r); };
    $('#rBez').onchange = async (e) => { r.bezahlt = e.target.value; await speichernUndStatus(); detail(r, fertig); };
    if ($('#rJetzt')) $('#rJetzt').onclick = async () => { r.bezahlt = heute(); await speichernUndStatus(); detail(r, fertig); };
    $('#rNotiz').oninput = debounce(async (e) => { r.notiz = e.target.value.trim(); await speichern(r); }, 500);
    $('#rPdf').onclick = async () => senden(r, w, null);
    if ($('#rMahn')) $('#rMahn').onclick = async () => {
      const stufe = naechsteMahn;
      const ok = await senden(r, w, stufe);
      if (ok === false) return;
      (r.mahnungen ??= []).push({ stufe, datum: heute() });
      await speichern(r); detail(r, fertig);
    };
    $('#rDel').onclick = async () => {
      if (!confirm(`Rechnung ${r.nr} löschen? Die Nummer wird nicht neu vergeben.`)) return;
      alle.delete(r.id); await kvDel('rechnung:' + r.id); fertig();
    };
    window.scrollTo(0, 0);
  }

  async function senden(r, w, mahnStufe) {
    toast('PDF wird erstellt …', 8000);
    let doc;
    try { doc = await pdf(r, w, mahnStufe); } catch (e) { toast('PDF ging nicht: ' + e.message, 5000); return false; }
    const k = w ? Kunden.byId(w.kundeId) : null;
    const name = `${mahnStufe == null ? 'Rechnung' : MAHN[mahnStufe].replace(/\.\s*/g, '_').replace(/\s+/g, '_')}_${r.nr}_${(Kunden.name(k) || w?.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    const anrede = k ? Kunden.briefAnrede(k) : 'Sehr geehrte Damen und Herren,';
    const vars = { anrede, art: artName(r), nr: r.nr, betrag: eur(zahlbetrag(r)), faellig: tag(r.faellig), datum: tag(r.datum), stufe: mahnStufe == null ? '' : MAHN[mahnStufe], firma: state.settings.company || '' };
    const text = vorgabeText(mahnStufe == null ? 'mailRechnung' : 'mailMahnung', vars);
    $('#toast').hidden = true;
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name, text }); return true; } catch (e) { if (e.name === 'AbortError') return false; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return true;
  }

  // ---------- PDF ----------
  async function pdf(r, w, mahnStufe) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 20, R = W - 18;
    const NAVY = [30, 53, 80], BRASS = [184, 134, 47];
    const logo = state.settings.logo, logoFmt = logo ? (mimeOf(logo) === 'image/png' ? 'PNG' : 'JPEG') : null;
    const t = (s, x, y, o) => doc.text(Array.isArray(s) ? s : String(s ?? ''), x, y, o);
    const kopf = async (erste) => {
      if (logo) await addFit(doc, logo, R - 55, 10, 55, erste ? 22 : 14, logoFmt);
      else { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); t(E.firma, R, 20, { align: 'right' }); }
      doc.setFont('helvetica', 'normal');
    };
    let y;
    await kopf(true);
    doc.setFontSize(7.5); doc.setTextColor(120); t([E.firma, E.strasse, E.ort].filter(Boolean).join(' · '), M, 47);
    doc.setDrawColor(200); doc.line(M, 48.5, M + 85, 48.5);
    doc.setFontSize(10.5); doc.setTextColor(30);
    const kd = w ? Kunden.byId(w.kundeId) : null;
    const post = kd ? Kunden.postanschrift(kd) : null;
    const adr = (post || [kd ? Kunden.name(kd) : w?.customer, ...String(w?.address || '').split(/\s*,\s*|\n/)]).map((x) => String(x || '').trim()).filter(Boolean);
    adr.forEach((l, i) => t(l, M, 55 + i * 5));
    const objekt = kd && w?.objektId ? Kunden.objekt(kd, w.objektId) : null;
    const bauvorhaben = objekt?.adresse ? Kunden.einzeilig(objekt.adresse) : w?.address || '';
    doc.setFontSize(9);
    const meta = mahnStufe == null
      ? [['Rechnung Nr.', r.nr], ...(kd?.nr ? [['Kunden-Nr.', kd.nr]] : []), ...(w?.nr ? [['Projekt-Nr.', w.nr]] : []), ['Rechnungsdatum', tag(r.datum)], ['Leistungszeitraum', r.zeitraum || tag(r.datum)], ['Zahlbar bis', tag(r.faellig)]]
      : [['Datum', tag(heute())], ['Rechnung Nr.', r.nr], ['vom', tag(r.datum)], ...(kd?.nr ? [['Kunden-Nr.', kd.nr]] : [])];
    let my = 52;
    for (const [k, v] of meta) { doc.setTextColor(120); t(k, 128, my); doc.setTextColor(30); const lines = doc.splitTextToSize(String(v), R - 160); t(lines, 160, my); my += 4.6 * lines.length; }
    y = Math.max(92, my + 8);
    const neueSeite = async () => { doc.addPage(); await kopf(false); y = 34; };
    const platz = async (h, f) => { if (y + h > H - 28) { await neueSeite(); f?.(); } };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY);
    const ueber = mahnStufe == null ? `${artName(r)}: ${r.titel}` : `${MAHN[mahnStufe]} zur Rechnung Nr. ${r.nr}`;
    const tl = doc.splitTextToSize(ueber, R - M); t(tl, M, y); y += 6 * tl.length + 2;
    if (bauvorhaben) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110); t('Bauvorhaben: ' + bauvorhaben, M, y); y += 7; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30);
    t(kd ? Kunden.briefAnrede(kd) : 'Sehr geehrte Damen und Herren,', M, y); y += 5;
    const absatz = async (s) => { for (const l of doc.splitTextToSize(s, R - M)) { await platz(5); t(l, M, y); y += 4.8; } y += 3; };

    if (mahnStufe != null) {
      const frist = tag(plusTage(heute(), +vorgabe('mahnFrist') || 7));
      const vars = { art: artName(r), nr: r.nr, datum: tag(r.datum), faellig: tag(r.faellig), betrag: eur(zahlbetrag(r)), frist, vorher: mahnStufe ? tag(r.mahnungen[mahnStufe - 1].datum) : '' };
      await absatz(vorgabeText(['textErinnerung', 'textMahnung1', 'textMahnung2'][mahnStufe], vars));
      await absatz(vorgabeText('textMahnFrist', vars));
      await absatz(vorgabeText('textMahnSchluss', vars));
      await platz(30);
      doc.setFont('helvetica', 'bold'); t('Offener Betrag', M, y); t(eur(zahlbetrag(r)), R, y, { align: 'right' }); y += 5.5;
      doc.setFont('helvetica', 'normal'); t('Zahlbar bis', M, y); t(frist, R, y, { align: 'right' }); y += 10;
    } else {
      await absatz(vorgabeText(r.art === 'schluss' ? 'textRechnungSchluss' : 'textRechnungAbschlag', { prozent: String(r.prozent).replace('.', ','), nr: r.nr }));
      const C = { pos: M, txt: M + 11, menge: 136, einh: 139, ep: 172, gp: R };
      const tabKopf = () => {
        doc.setFillColor(...NAVY); doc.rect(M - 1, y - 4.2, R - M + 2, 6.2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255);
        t('Pos.', C.pos, y); t('Leistung', C.txt, y); t('Menge', C.menge, y, { align: 'right' }); t('Einheit', C.einh, y); t('EP netto', C.ep, y, { align: 'right' }); t('GP netto', C.gp, y, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30); y += 6;
      };
      if (r.art === 'schluss') {
        tabKopf();
        let n = 0;
        const zeilenDruck = async (z) => {
          doc.setFontSize(9);
          const lines = doc.splitTextToSize(z.text, C.menge - C.txt - 14);
          const h = 4.3 * lines.length + 1.6;
          await platz(h, tabKopf); n++;
          t(String(n), C.pos + 3, y, { align: 'center' }); t(lines, C.txt, y);
          t(z.menge.toLocaleString('de-DE', { maximumFractionDigits: 2 }), C.menge, y, { align: 'right' }); t(z.einheit, C.einh, y);
          t(eur(z.ep), C.ep, y, { align: 'right' }); t(eur(z.gp), C.gp, y, { align: 'right' });
          y += h; doc.setDrawColor(230); doc.line(M - 1, y - 3.2, R + 1, y - 3.2);
        };
        const raeume = [...new Set(r.positionen.map((z) => z.raum))];
        for (const rn of raeume) {
          if (raeume.length > 1) { await platz(12, tabKopf); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BRASS); t(rn || 'Allgemein', C.txt, y + 1); doc.setFont('helvetica', 'normal'); doc.setTextColor(30); y += 6; }
          for (const z of r.positionen.filter((x) => x.raum === rn)) await zeilenDruck(z);
        }
        if (r.nachtraege?.length) {
          await platz(12, tabKopf); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BRASS); t('Nachträge', C.txt, y + 1); doc.setFont('helvetica', 'normal'); doc.setTextColor(30); y += 6;
          for (const z of r.nachtraege) await zeilenDruck(z);
        }
      } else {
        tabKopf(); doc.setFontSize(9);
        t('1', C.pos + 3, y, { align: 'center' });
        t(doc.splitTextToSize(`${r.stufe}. Abschlag, ${String(r.prozent).replace('.', ',')} % der Auftragssumme (${r.titel})`, C.menge - C.txt - 14), C.txt, y);
        t('1', C.menge, y, { align: 'right' }); t('pauschal', C.einh, y); t(eur(r.netto), C.ep, y, { align: 'right' }); t(eur(r.netto), C.gp, y, { align: 'right' });
        y += 8; doc.setDrawColor(230); doc.line(M - 1, y - 3.2, R + 1, y - 3.2);
      }
      await platz(36 + (r.abzuege?.length || 0) * 5.5);
      y += 3; doc.setFontSize(10);
      const sumZ = (k, v, fett) => { doc.setFont('helvetica', fett ? 'bold' : 'normal'); t(k, C.txt, y); t(v, C.gp, y, { align: 'right' }); y += 5.5; };
      sumZ('Summe netto', eur(r.netto));
      sumZ(`zzgl. ${r.satz} % USt.`, eur(r2(brutto(r) - r.netto)));
      doc.setDrawColor(...NAVY); doc.line(C.txt, y - 3.8, R, y - 3.8);
      sumZ('Rechnungsbetrag brutto', eur(brutto(r)), true);
      for (const a of r.abzuege || []) sumZ(`abzüglich Abschlagsrechnung ${a.nr} vom ${tag(a.datum)}`, '- ' + eur(a.brutto));
      if (r.abzuege?.length) { doc.line(C.txt, y - 3.8, R, y - 3.8); doc.setTextColor(...NAVY); sumZ('Noch zu zahlen', eur(zahlbetrag(r)), true); doc.setTextColor(30); }
      if (r.art === 'schluss' && r.lohn) { doc.setFontSize(8.5); doc.setTextColor(90); sumZ('Darin enthaltener Lohnanteil brutto (§ 35a EStG)', eur(r.lohn)); doc.setTextColor(30); }
      y += 4; doc.setFontSize(10);
      await absatz(vorgabeText('textZahlung', { betrag: eur(zahlbetrag(r)), faellig: tag(r.faellig), nr: r.nr }));
      if (r.art === 'schluss' && vorgabe('textAufbewahrung')) await absatz(vorgabeText('textAufbewahrung'));
    }
    await platz(16); doc.setFontSize(10); doc.setTextColor(30); t(vorgabeText('textGruss'), M, y); y += 5; t(E.firma, M, y);
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...BRASS); doc.setLineWidth(0.4); doc.line(M, H - 20, R, H - 20); doc.setLineWidth(0.2);
      doc.setFontSize(6.8); doc.setTextColor(120);
      t([E.firma, E.strasse, E.ort, `Tel. ${E.telefon}`, E.email].filter(Boolean).join(' · '), M, H - 16);
      t([`Sitz: ${E.sitz}`, E.hrb, `Geschäftsführer: ${E.gf}`, `USt-IdNr. ${E.ustid}`].join(' · '), M, H - 12.8);
      t(E.bank, M, H - 9.6);
      t(`Seite ${i} von ${pages}`, R, H - 9.6, { align: 'right' });
    }
    return doc;
  }

  // ---------- Übersicht im Reiter Rechnungen ----------
  async function uebersicht() {
    await laden();
    const idx = await projectIndex();
    const name = (r) => { const x = idx.find((y) => y.id === r.projektId); return x ? [x.titel || x.room || 'Projekt', Kunden.name(Kunden.byId(x.kundeId)) || x.customer].filter(Boolean).join(' · ') : 'Projekt gelöscht'; };
    const offen = liste().filter((r) => !r.bezahlt).sort((a, b) => (a.faellig || '').localeCompare(b.faellig || ''));
    return { offen, name, html: offen.map((r) => zeile(r).replace('<b>', `<b>${esc(name(r))} · `)).join('') };
  }

  return { laden, liste, fuerProjekt, projektAbschnitt, uebersicht, detail, auftrag, zahlbetrag, ueberfaellig };
})();
