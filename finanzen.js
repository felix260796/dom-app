'use strict';
/* DOM – Reiter „Rechnungen“ (Finanzen): alles Finanzielle an einem Ort.
 * - Übersicht: abzurechnende Projekte, offene Rechnungen an Kunden (aus dem Projektstatus)
 * - Eingangsrechnungen (B14): Rechnung von Subunternehmer oder Lieferant als Foto/PDF, KI liest die Daten aus,
 *   Zuordnung zu Projekt und Subunternehmer, Status offen/bezahlt, Fälligkeit (überfällig = rot)
 * - Kalkulation (B24): Angebot (Soll) gegen Eingangsrechnungen (Ist) je Projekt und Gewerk, Marge mit Ampel
 * Speicher: 'beleg:<id>' { id, kind:'beleg', projektId, partnerId, von, nr, datum, netto, satz, gewerk, faellig,
 *   bezahlt ('JJJJ-MM-TT' oder ''), notiz, datei: { typ, name } | null, created, updated }
 *   Die Datei selbst liegt getrennt unter 'bdatei:<id>' (Data-URL), damit die Liste klein bleibt.
 * Eigener Reiter „Rechnungen“ unten in der Leiste.
 * Baut auf app.js (state, header, main, icon, sheet, switchTab), projekt.js, kunden.js, partner.js, angebot.js auf. */
window.Finanzen = (() => {
  let alleZeigen = false;
  const belege = new Map();
  const MAX_MB = 6;
  const GEWERKE_EXTRA = ['Material', 'Entsorgung', 'Sonstiges'];
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const eur = (x) => x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const eur0 = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
  const heute = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tagText = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const brutto = (b) => r2(b.netto * (1 + (b.satz ?? 19) / 100));
  const ueberfaellig = (b) => !b.bezahlt && b.faellig && b.faellig < heute();
  const vonText = (b) => { const p = window.Partner?.byId(b.partnerId); return p ? p.firma || p.inhaber || 'Subunternehmer' : b.von || 'Unbekannt'; };

  // ---------- Speicher ----------
  async function laden() {
    belege.clear();
    const d = await db();
    const rows = await new Promise((res) => { const out = []; const q = d.transaction('kv').objectStore('kv').openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return res(out); if (String(c.key).startsWith('beleg:')) out.push(c.value); c.continue(); }; q.onerror = () => res(out); });
    for (const b of rows) if (b?.id) belege.set(b.id, b);
  }
  const liste = () => [...belege.values()].sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.created || 0) - (a.created || 0));
  const fuerProjekt = (pid) => liste().filter((b) => b.projektId === pid);
  const fuerPartner = (pid) => liste().filter((b) => b.partnerId === pid);
  async function speichern(b) { b.updated = Date.now(); belege.set(b.id, b); await kvSet('beleg:' + b.id, b); }
  async function loeschen(b) { belege.delete(b.id); await kvDel('beleg:' + b.id); if (b.datei) await kvDel('bdatei:' + b.id); }
  const neu = (vor = {}) => ({ id: uid(), kind: 'beleg', projektId: '', partnerId: '', von: '', nr: '', datum: heute(), netto: 0, satz: 19, gewerk: '', faellig: '', bezahlt: '', notiz: '', datei: null, created: Date.now(), isNew: true, ...vor });

  // ---------- Kalkulation ----------
  /** Soll aus den Raum-Angeboten des Projekts: netto gesamt und je Gewerk. */
  async function soll(w) {
    const out = { netto: 0, gewerke: {}, plan: 0, mitPreis: 0, zeilen: 0 };
    const A = window.Angebot?._intern;
    // B5: günstigster hinterlegter Subunternehmer-Preis je Position = geplante Kosten
    const subEp = (nr) => { const ps = (window.Partner?.liste() || []).map((p) => p.preise?.[nr]).filter((x) => x > 0); return ps.length ? Math.min(...ps) : 0; };
    if (!A || !w?.rooms?.length) return out;
    try { await A.preisliste(); } catch { return out; }
    for (const id of w.rooms) {
      const r = await kvGet('project:' + id);
      if (!r?.angebot?.positionen?.length) continue;
      try {
        const S = A.summen(r.angebot.positionen);
        out.netto += S.netto;
        for (const z of S.zeilen) {
          const g = z.it?.gewerk || 'Sonstiges'; out.gewerke[g] = (out.gewerke[g] || 0) + z.gp;
          const ep = subEp(z.nr); out.zeilen++; if (ep) { out.mitPreis++; out.plan += z.menge * ep; }
        }
      } catch {}
    }
    // Nachträge zählen zum Auftrag
    for (const n of w.nachtraege || []) { const gp = r2(n.menge * n.ep); out.netto += gp; out.gewerke.Nachträge = (out.gewerke.Nachträge || 0) + gp; }
    out.netto = r2(out.netto);
    return out;
  }
  function ist(pid) {
    const out = { netto: 0, gewerke: {}, offen: 0 };
    for (const b of fuerProjekt(pid)) {
      out.netto += b.netto; const g = b.gewerk || 'Sonstiges';
      out.gewerke[g] = (out.gewerke[g] || 0) + b.netto;
      if (!b.bezahlt) out.offen += brutto(b);
    }
    out.netto = r2(out.netto);
    return out;
  }
  /** Ampel nach Marge in Prozent vom Angebot: ab 20 % grün, ab 10 % gelb, darunter rot. */
  const ampel = (proz) => (proz >= 20 ? ['gut', '#2f8a57'] : proz >= 10 ? ['knapp', '#c99a2e'] : ['kritisch', '#c0392b']);
  async function kalkulation(w) {
    const s = await soll(w), i = ist(w.id);
    const marge = r2(s.netto - i.netto), proz = s.netto ? (marge / s.netto) * 100 : 0;
    return { soll: s, ist: i, marge, proz, ampel: ampel(proz) };
  }
  function kalkHtml(k) {
    if (!k.soll.netto && !k.ist.netto) return '<p class="hint" style="margin:0">Noch kein Angebot mit Positionen und keine Eingangsrechnung. Sobald beides da ist, siehst du hier die Marge.</p>';
    const gewerke = [...new Set([...Object.keys(k.soll.gewerke), ...Object.keys(k.ist.gewerke)])];
    const balken = k.soll.netto ? Math.min(100, (k.ist.netto / k.soll.netto) * 100) : 100;
    return `<div class="kalk">
      <div class="kalk-z"><span>Angebot netto (Soll)</span><b>${eur0(k.soll.netto)}</b></div>
      ${k.soll.mitPreis ? `<div class="kalk-z"><span>Geplante Kosten (Preise der Subunternehmer, ${k.soll.mitPreis} von ${k.soll.zeilen} Positionen)</span><b>${eur0(k.soll.plan)}</b></div>` : ''}
      <div class="kalk-z"><span>Kosten netto (Ist)</span><b>${eur0(k.ist.netto)}</b></div>
      <div class="kalk-bar"><i style="width:${balken}%;background:${k.ampel[1]}"></i></div>
      <div class="kalk-z big" style="--c:${k.ampel[1]}"><span>Marge</span><b>${eur0(k.marge)}${k.soll.netto ? ` · ${k.proz.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %` : ''}</b></div>
      ${k.soll.netto ? `<p class="kalk-amp" style="--c:${k.ampel[1]}"><i></i>${{ gut: 'Im Plan', knapp: 'Knapp, Kosten im Blick behalten', kritisch: 'Kritisch, Kosten liegen über Plan' }[k.ampel[0]]}</p>` : ''}
      ${gewerke.length > 1 || (gewerke.length && k.ist.netto) ? `<details class="kalk-g"><summary>Je Gewerk</summary>
        <div class="kalk-gt"><span></span><span>Soll</span><span>Ist</span></div>
        ${gewerke.map((g) => { const so = k.soll.gewerke[g] || 0, is = k.ist.gewerke[g] || 0; return `<div class="kalk-gt ${is > so && so ? 'drueber' : ''}"><span>${esc(g)}</span><span>${so ? eur0(so) : '–'}</span><span>${is ? eur0(is) : '–'}</span></div>`; }).join('')}
      </details>` : ''}
    </div>`;
  }

  // ---------- Listen-Zeile einer Eingangsrechnung ----------
  const belegZeile = (b, mitProjekt = true) => {
    const x = mitProjekt && b.projektId ? window.__fIdx?.find((y) => y.id === b.projektId) : null;
    const st = b.bezahlt ? ['Bezahlt', '#1b5e3a'] : ueberfaellig(b) ? ['Überfällig', '#c0392b'] : ['Offen', '#d2691e'];
    return `<button class="pcard beleg" data-beleg="${b.id}">
      <span class="pc-ph">${icon(b.datei?.typ === 'application/pdf' ? 'file' : b.datei ? 'image' : 'euro')}</span>
      <span class="pc-t"><b>${esc(vonText(b))}</b>
        <span class="pills"><span class="st-pill" style="--c:${st[1]}">${st[0]}</span><span class="muted">${esc([b.nr && `Nr. ${b.nr}`, tagText(b.datum)].filter(Boolean).join(' · '))}</span></span>
        ${mitProjekt ? `<span class="muted pc-wo">${icon('home')}${esc(x ? x.titel || x.room || 'Projekt' : 'noch keinem Projekt zugeordnet')}</span>` : ''}
        <span class="ang-sum">${eur(b.netto)} netto${b.gewerk ? ` · <span class="muted">${esc(b.gewerk)}</span>` : ''}</span></span>
      ${icon('chevron', 'pc-chev')}</button>`;
  };

  // ---------- Übersicht ----------
  async function view() {
    state.beleg = null;
    const hier = () => state.tab === 'rechnungen' && !state.kalender;
    header('Rechnungen', 'Eingang, Zahlungen, Kalkulation');
    const idx = await projectIndex(); window.__fIdx = idx;
    await laden();
    if (!hier()) return;
    const abrechnen = idx.filter((x) => Projekt.norm(x.status) === 'fertig');
    const aus = await Rechnung.uebersicht();
    const ausUeber = aus.offen.filter(Rechnung.ueberfaellig);
    const ein = liste(), einOffen = ein.filter((b) => !b.bezahlt), einUeber = einOffen.filter(ueberfaellig);
    const zeigeEin = alleZeigen ? ein : einOffen;
    const zeile = (x) => `<button class="pcard" data-fp="${x.id}">
        <span class="pc-ph">${icon('euro')}</span>
        <span class="pc-t"><b>${esc(x.titel || x.room || 'Projekt')}</b>${Projekt.pill(x.status)}
          <span class="muted pc-wer">${icon('user')}${esc(Kunden.name(Kunden.byId(x.kundeId)) || x.customer || '')}</span></span>
        ${icon('chevron', 'pc-chev')}</button>`;
    // Kalkulation: Projekte im Auftrag oder danach, mit Angebot oder Kosten
    const kalkP = idx.filter((x) => Projekt.zugesagt(x.status));
    const kalk = await Promise.all(kalkP.map(async (x) => { const w = await kvGet('wohnung:' + x.id); return w ? { x, k: await kalkulation(w) } : null; }));
    const kalkShown = kalk.filter((e) => e && (e.k.soll.netto || e.k.ist.netto));
    if (!hier()) return;
    main().innerHTML = `
      <div class="phasen drei">
        <div class="fz"><b>${abrechnen.length}</b><span>Abzurechnen</span></div>
        <div class="fz ${ausUeber.length ? 'rot' : ''}"><b>${aus.offen.length}</b><span>${ausUeber.length ? `${ausUeber.length} Kunde überfällig` : 'Kunde zahlt noch'}</span></div>
        <div class="fz ${einUeber.length ? 'rot' : ''}"><b>${einOffen.length}</b><span>${einUeber.length ? `${einUeber.length} überfällig` : 'Eingang offen'}</span></div>
      </div>

      <div class="sec-h"><h2>Eingangsrechnungen</h2>${einOffen.length ? `<span class="count">${eur0(einOffen.reduce((s, b) => s + brutto(b), 0))} offen</span>` : ''}</div>
      <button class="cta slim" id="fNeu"><span class="cta-ico">${icon('plus')}</span><span class="cta-t"><b>Eingangsrechnung erfassen</b></span>${icon('chevron', 'cta-chev')}</button>
      ${ein.length ? `<div class="seg2 full" style="margin-top:12px"><button data-fa="0" class="${alleZeigen ? '' : 'on'}">Offen (${einOffen.length})</button><button data-fa="1" class="${alleZeigen ? 'on' : ''}">Alle (${ein.length})</button></div>` : ''}
      <div class="plist">${zeigeEin.map((b) => belegZeile(b)).join('') || (ein.length ? '<p class="hint">Alles bezahlt.</p>' : '<p class="hint">Fotografiere die Rechnung eines Subunternehmers oder Lieferanten. Die KI liest Betrag, Datum und Absender aus.</p>')}</div>

      ${abrechnen.length ? `<div class="sec-h"><h2>Abgeschlossen, noch keine Rechnung</h2></div><div class="plist">${abrechnen.map(zeile).join('')}</div>` : ''}
      <div class="sec-h"><h2>Rechnungen an Kunden, offen</h2>${aus.offen.length ? `<span class="count">${eur0(aus.offen.reduce((s, r) => s + Rechnung.zahlbetrag(r), 0))}</span>` : ''}</div>
      <div class="plist">${aus.html || '<p class="hint">Keine offenen Rechnungen. Rechnungen erstellst du im Projekt (Abschlag oder Schlussrechnung).</p>'}</div>

      <div class="sec-h"><h2>Kalkulation je Projekt</h2></div>
      ${kalkShown.length ? `<div class="plist">${kalkShown.map(({ x, k }) => `<button class="pcard" data-fp="${x.id}">
          <span class="pc-ph" style="color:${k.ampel[1]}">${icon('euro')}</span>
          <span class="pc-t"><b>${esc(x.titel || x.room || 'Projekt')}</b>${Projekt.pill(x.status)}
            <span class="ang-sum" style="color:${k.ampel[1]}">Marge ${eur0(k.marge)}${k.soll.netto ? ` · ${k.proz.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %` : ''}</span>
            <span class="muted">Angebot ${eur0(k.soll.netto)} · Kosten ${eur0(k.ist.netto)}</span></span>
          ${icon('chevron', 'pc-chev')}</button>`).join('')}</div>`
        : '<p class="hint">Sobald ein zugesagtes Projekt ein Angebot und Eingangsrechnungen hat, steht hier die Marge.</p>'}

      ${Rechnung.einstellungenHtml()}`;
    Rechnung.einstellungenBinden();
    $$('[data-rech]').forEach((b) => (b.onclick = async () => { await Rechnung.laden(); Rechnung.detail(Rechnung.liste().find((r) => r.id === b.dataset.rech), () => view()); }));
    $$('[data-fa]').forEach((b) => (b.onclick = () => { alleZeigen = b.dataset.fa === '1'; view(); }));
    $('#fNeu').onclick = () => erfassen(neu(), () => view());
    $$('[data-beleg]').forEach((b) => (b.onclick = () => erfassen(belege.get(b.dataset.beleg), () => view())));
    $$('[data-fp]').forEach((b) => (b.onclick = () => { switchTab('projekt', { wohnung: null }); Projekt.oeffnen(b.dataset.fp); }));
  }

  // ---------- KI: Rechnung auslesen ----------
  async function auslesen(data) {
    const prompt = `Das ist eine Eingangsrechnung an eine Baufirma (Sanierung). Lies die Daten aus.
Gib Beträge als Zahl in Euro (Punkt als Dezimaltrennzeichen). netto = Summe ohne Umsatzsteuer. Bei Reverse-Charge (§ 13b UStG) ist satz 0.
Datum als JJJJ-MM-TT. faellig = Fälligkeitsdatum, falls angegeben (oder Datum + Zahlungsziel). gewerk: eines von ${JSON.stringify(gewerke())}.`;
    const j = await geminiCall('text', () => ({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeOf(data), data: b64(data) } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: {
        absender: { type: 'STRING' }, rechnungsnummer: { type: 'STRING' }, datum: { type: 'STRING' }, faellig: { type: 'STRING' },
        netto: { type: 'NUMBER' }, satz: { type: 'NUMBER' }, brutto: { type: 'NUMBER' }, gewerk: { type: 'STRING' } } } },
    }));
    const txt = j.candidates?.[0]?.content?.parts?.map((x) => x.text).filter(Boolean).join('');
    return JSON.parse(txt);
  }
  function gewerke() {
    return [...new Set([...(window.__plGewerke || []), ...GEWERKE_EXTRA])];
  }
  async function gewerkeLaden() {
    try { const PL = await window.Angebot._intern.preisliste(); window.__plGewerke = [...new Set(PL.positionen.map((x) => x.gewerk).filter((g) => g && !/eigenleistung/i.test(g)))]; } catch { window.__plGewerke = []; }
  }

  // ---------- Erfassen / Bearbeiten ----------
  async function erfassen(b, fertig) {
    if (!b) return;
    await gewerkeLaden();
    const idx = await projectIndex();
    const projekte = idx.slice().sort((a, c) => (Projekt.zugesagt(c.status) - Projekt.zugesagt(a.status)) || (c.updated || 0) - (a.updated || 0));
    const partner = (window.Partner?.liste() || []).slice().sort((a, c) => (a.firma || a.inhaber || '').localeCompare(c.firma || c.inhaber || ''));
    const zurueck = () => { state.beleg = null; fertig(); window.scrollTo(0, 0); };
    state.beleg = b;
    header(b.isNew ? 'Eingangsrechnung' : vonText(b), b.isNew ? 'Neu erfassen' : [b.nr && `Nr. ${b.nr}`, tagText(b.datum)].filter(Boolean).join(' · '), { label: 'Zurück', fn: zurueck });
    const projName = (x) => [x.titel || x.room || 'Projekt', Kunden.name(Kunden.byId(x.kundeId)) || x.customer].filter(Boolean).join(' · ');
    const render = () => {
      main().innerHTML = `
        <div class="card">
          ${b.datei ? `<button class="doc" id="bAnsehen" style="width:100%"><span class="d-ico ${b.datei.typ === 'application/pdf' ? 'navy' : 'brass'}">${icon(b.datei.typ === 'application/pdf' ? 'file' : 'image')}</span><span class="d-t"><b>Rechnung ansehen</b><span>${esc(b.datei.name || '')}</span></span>${icon('chevron', 'pc-chev')}</button>
            <div class="row" style="margin-top:8px"><button class="btn secondary" id="bDatei">${icon('camera')} Andere Datei</button>${state.settings.apiKey ? `<button class="btn secondary" id="bKi">${icon('sparkle')} Neu auslesen</button>` : ''}</div>`
          : `<div class="row"><button class="btn" id="bFoto">${icon('camera')} Foto</button><button class="btn secondary" id="bDatei">${icon('file')} PDF / Bild</button></div>
             <p class="hint" style="margin:8px 0 0">${state.settings.apiKey ? 'Die KI liest Absender, Nummer, Datum und Betrag aus. Du prüfst nur noch.' : 'Ohne KI-Schlüssel trägst du die Daten selbst ein.'}</p>`}
          <p class="hint" id="bKiInfo" hidden></p>
        </div>
        <div class="card kform">
          <label style="margin-top:0">Projekt</label>
          <select id="bProj"><option value="">Noch keinem Projekt zuordnen</option>${projekte.map((x) => `<option value="${x.id}" ${x.id === b.projektId ? 'selected' : ''}>${esc(projName(x))}</option>`).join('')}</select>
          <label>Von (Subunternehmer oder Lieferant)</label>
          <select id="bPartner"><option value="">Anderer, Name eintragen</option>${partner.map((p) => `<option value="${p.id}" ${p.id === b.partnerId ? 'selected' : ''}>${esc([p.firma, p.inhaber].filter(Boolean).join(' · ') || 'Ohne Namen')}</option>`).join('')}</select>
          <input type="text" id="bVon" value="${esc(b.von)}" placeholder="z. B. Baustoffhandel Müller" autocomplete="off" ${b.partnerId ? 'hidden' : ''} style="margin-top:6px">
          <div class="row"><div><label>Rechnungsnummer</label><input type="text" id="bNr" value="${esc(b.nr)}" autocomplete="off"></div>
            <div><label>Rechnungsdatum</label><input type="date" id="bDatum" value="${esc(b.datum)}"></div></div>
          <div class="row"><div><label>Betrag netto</label><input type="text" inputmode="decimal" id="bNetto" value="${b.netto ? String(b.netto).replace('.', ',') : ''}" placeholder="0,00"></div>
            <div><label>USt.</label><select id="bSatz">${[[19, '19 %'], [7, '7 %'], [0, '0 % (§ 13b)']].map(([v, n]) => `<option value="${v}" ${(b.satz ?? 19) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
          <p class="hint" id="bBrutto" style="margin:4px 0 0">Brutto ${eur(brutto(b))}</p>
          <label>Gewerk</label>
          <select id="bGewerk"><option value="">Bitte wählen</option>${gewerke().map((g) => `<option ${g === b.gewerk ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
          <div class="row"><div><label>Fällig am</label><input type="date" id="bFaellig" value="${esc(b.faellig)}"></div>
            <div><label>Bezahlt am</label><input type="date" id="bBezahlt" value="${esc(b.bezahlt)}"></div></div>
          ${b.bezahlt ? '' : `<button class="btn secondary block" id="bJetzt" style="margin-top:10px">${icon('check')} Heute bezahlt</button>`}
          <label>Notiz</label><textarea id="bNotiz" placeholder="z. B. Abschlag 1, Skonto 2 % bis …">${esc(b.notiz)}</textarea>
        </div>
        <button class="btn big block" id="bSave">${icon('check')} ${b.isNew ? 'Speichern' : 'Fertig'}</button>
        ${b.isNew ? '' : `<button class="link-danger" id="bDel">${icon('trash')} Eingangsrechnung löschen</button>`}`;
      binden();
    };
    const lesen = () => {
      b.projektId = $('#bProj').value; b.partnerId = $('#bPartner').value; b.von = $('#bVon').value.trim();
      b.nr = $('#bNr').value.trim(); b.datum = $('#bDatum').value; b.netto = r2(num($('#bNetto').value)); b.satz = +$('#bSatz').value;
      b.gewerk = $('#bGewerk').value; b.faellig = $('#bFaellig').value; b.bezahlt = $('#bBezahlt').value; b.notiz = $('#bNotiz').value.trim();
    };
    const datei = async (camera) => {
      const [f] = await pickFiles({ camera, accept: camera ? 'image/*' : 'application/pdf,image/*' });
      if (!f) return;
      if (f.size > MAX_MB * 1e6) return toast(`Die Datei ist zu groß (höchstens ${MAX_MB} MB).`, 4000);
      lesen();
      let data = await fileToDataUrl(f), typ = f.type || 'application/pdf';
      if (typ.startsWith('image/')) { data = await resize(data, 2000, 'image/jpeg', 0.85); typ = 'image/jpeg'; }
      b._daten = data; b.datei = { typ, name: f.name || 'Rechnung' };
      render();
      if (state.settings.apiKey) ki();
    };
    const ki = async () => {
      const data = b._daten || await kvGet('bdatei:' + b.id);
      if (!data) return;
      const info = $('#bKiInfo'); if (info) { info.hidden = false; info.textContent = 'KI liest die Rechnung …'; }
      try {
        const r = await auslesen(data);
        lesen();
        if (r.absender) {
          const s = r.absender.toLowerCase();
          const p = (window.Partner?.liste() || []).find((x) => [x.firma, x.inhaber].filter(Boolean).some((n) => n.length > 2 && (s.includes(n.toLowerCase()) || n.toLowerCase().includes(s))));
          if (p) { b.partnerId = p.id; b.von = ''; } else if (!b.partnerId) b.von = r.absender;
        }
        if (r.rechnungsnummer) b.nr = r.rechnungsnummer;
        if (/^\d{4}-\d{2}-\d{2}$/.test(r.datum || '')) b.datum = r.datum;
        if (/^\d{4}-\d{2}-\d{2}$/.test(r.faellig || '')) b.faellig = r.faellig;
        if ([0, 7, 19].includes(r.satz)) b.satz = r.satz;
        if (r.netto > 0) b.netto = r2(r.netto); else if (r.brutto > 0) b.netto = r2(r.brutto / (1 + (b.satz ?? 19) / 100));
        if (r.gewerk && gewerke().includes(r.gewerk)) b.gewerk = r.gewerk;
        render();
        const i2 = $('#bKiInfo'); if (i2) { i2.hidden = false; i2.textContent = 'Ausgelesen. Bitte kurz prüfen, vor allem Betrag und Projekt.'; }
      } catch (e) {
        const i2 = $('#bKiInfo'); if (i2) { i2.hidden = false; i2.textContent = 'Auslesen hat nicht geklappt, bitte selbst eintragen. (' + e.message + ')'; }
      }
    };
    function binden() {
      if ($('#bFoto')) $('#bFoto').onclick = () => datei(true);
      $('#bDatei').onclick = () => datei(false);
      if ($('#bKi')) $('#bKi').onclick = () => ki();
      if ($('#bAnsehen')) $('#bAnsehen').onclick = async () => {
        const data = b._daten || await kvGet('bdatei:' + b.id);
        if (!data) return toast('Die Datei ist auf diesem Gerät noch nicht da. Bitte kurz warten (Cloud-Abgleich).', 4000);
        const blob = await (await fetch(data)).blob();
        const url = URL.createObjectURL(new File([blob], b.datei.name || 'Rechnung', { type: b.datei.typ }));
        const win = window.open(url, '_blank');
        if (!win) { const a = document.createElement('a'); a.href = url; a.download = b.datei.name || 'Rechnung'; a.click(); }
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      };
      $('#bPartner').onchange = (e) => { $('#bVon').hidden = !!e.target.value; };
      const brut = () => { lesen(); $('#bBrutto').textContent = `Brutto ${eur(brutto(b))}`; };
      $('#bNetto').oninput = brut; $('#bSatz').onchange = brut;
      if ($('#bJetzt')) $('#bJetzt').onclick = () => { $('#bBezahlt').value = heute(); $('#bJetzt').remove(); };
      $('#bSave').onclick = async () => {
        lesen();
        if (!b.netto) return toast('Bitte den Betrag eintragen.');
        if (!b.partnerId && !b.von) return toast('Bitte eintragen, von wem die Rechnung ist.');
        if (b._daten) { await kvSet('bdatei:' + b.id, b._daten); delete b._daten; }
        const warNeu = b.isNew; delete b.isNew;
        await speichern(b);
        toast(warNeu ? 'Eingangsrechnung gespeichert' : 'Gespeichert');
        zurueck();
      };
      if ($('#bDel')) $('#bDel').onclick = async () => { if (!confirm('Diese Eingangsrechnung löschen?')) return; await loeschen(b); zurueck(); };
    }
    render();
  }

  // ---------- Abschnitt im Projekt: Kosten & Kalkulation ----------
  async function projektAbschnitt(el, w) {
    if (!el) return;
    await laden();
    const k = await kalkulation(w);
    if (!el.isConnected) return;
    const liste = fuerProjekt(w.id);
    el.innerHTML = `<div class="sec-h"><h2>Kosten & Kalkulation</h2>${liste.length ? `<span class="count">${liste.length}</span>` : ''}</div>
      <div class="card">${kalkHtml(k)}</div>
      <div class="plist">${liste.map((b) => belegZeile(b, false)).join('')}</div>
      <button class="add-room" id="wBelegNeu" style="width:100%;margin-top:8px">${icon('plus')} Eingangsrechnung zu diesem Projekt</button>`;
    const zurueckZumProjekt = () => { Projekt.view(); };
    $('#wBelegNeu', el).onclick = () => erfassen(neu({ projektId: w.id }), zurueckZumProjekt);
    $$('[data-beleg]', el).forEach((b) => (b.onclick = () => erfassen(belege.get(b.dataset.beleg), zurueckZumProjekt)));
  }

  // ---------- Abschnitt beim Subunternehmer: seine Rechnungen ----------
  async function partnerAbschnitt(el, p) {
    if (!el || !p?.id) return;
    await laden(); window.__fIdx = await projectIndex();
    const liste = fuerPartner(p.id);
    if (!el.isConnected) return;
    const summe = liste.reduce((s, b) => s + b.netto, 0), offen = liste.filter((b) => !b.bezahlt);
    el.innerHTML = `<div class="sec-h"><h2>Rechnungen dieser Firma</h2>${liste.length ? `<span class="count">${eur0(summe)} netto</span>` : ''}</div>
      ${liste.length ? `${offen.length ? `<p class="hint" style="margin-top:-4px">${offen.length} offen, ${eur0(offen.reduce((s, b) => s + brutto(b), 0))} brutto</p>` : ''}<div class="plist">${liste.map((b) => belegZeile(b)).join('')}</div>`
        : '<p class="hint" style="margin-top:-4px">Noch keine Eingangsrechnung von dieser Firma.</p>'}
      <button class="add-room" id="pBelegNeu" style="width:100%;margin-top:8px">${icon('plus')} Rechnung dieser Firma erfassen</button>
      <div class="sec-h" style="margin-top:18px"><h2>Preise je Position</h2>${Object.keys(p.preise || {}).length ? `<span class="count">${Object.keys(p.preise).length}</span>` : ''}</div>
      <p class="hint" style="margin-top:-4px">Was diese Firma pro Einheit verlangt. Die Kalkulation rechnet damit die geplanten Kosten aus.</p>
      <div class="card kform" id="pPreise"></div>`;
    await preiseRender($('#pPreise', el), p);
    const zurueck = () => Partner.detail(p);
    $('#pBelegNeu', el).onclick = () => erfassen(neu({ partnerId: p.id }), zurueck);
    $$('[data-beleg]', el).forEach((b) => (b.onclick = () => erfassen(belege.get(b.dataset.beleg), zurueck)));
  }

  async function preiseRender(box, p) {
    let PL; try { PL = await window.Angebot._intern.preisliste(); } catch { return; }
    const pos = (nr) => PL.positionen.find((x) => x.nr === nr);
    const eintraege = Object.entries(p.preise || {}).filter(([nr]) => pos(nr));
    const gew = [...new Set(PL.positionen.map((x) => x.gewerk))];
    box.innerHTML = `${eintraege.map(([nr, ep]) => { const it = pos(nr); return `<div class="prow-sub"><span><b>${esc(it.text)}</b><span class="muted">${esc(nr)} · Angebot ${eur(window.Angebot._intern.ep(it))}/${esc(it.einheit)}</span></span>
        <input type="text" inputmode="decimal" data-sp="${esc(nr)}" value="${String(ep).replace('.', ',')}"><span class="muted">€/${esc(it.einheit)}</span><button class="icon-btn" data-spdel="${esc(nr)}" aria-label="Entfernen">${icon('trash')}</button></div>`; }).join('')}
      <select id="spNeu" style="margin-top:${eintraege.length ? 10 : 0}px"><option value="">Position hinzufügen …</option>${gew.map((g) => `<optgroup label="${esc(g)}">${PL.positionen.filter((x) => x.gewerk === g && !(p.preise || {})[x.nr]).map((x) => `<option value="${esc(x.nr)}">${esc(x.nr)} ${esc(x.text)}</option>`).join('')}</optgroup>`).join('')}</select>`;
    const sichern = async () => { p.updated = Date.now(); await kvSet('partner:' + p.id, p); await window.Partner?.laden(); };
    $$('[data-sp]', box).forEach((x) => (x.onchange = async () => { p.preise[x.dataset.sp] = r2(num(x.value)); await sichern(); toast('Gespeichert'); }));
    $$('[data-spdel]', box).forEach((x) => (x.onclick = async () => { delete p.preise[x.dataset.spdel]; await sichern(); preiseRender(box, p); }));
    $('#spNeu', box).onchange = async (e) => { if (!e.target.value) return; (p.preise ??= {})[e.target.value] = 0; await sichern(); await preiseRender(box, p); $(`[data-sp="${e.target.value}"]`, box)?.focus(); };
  }

  return { view, laden, liste, fuerProjekt, kalkulation, projektAbschnitt, partnerAbschnitt, erfassen };
})();
