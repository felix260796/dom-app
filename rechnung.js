'use strict';
/* DOM – Rechnungen an Kunden (Ausgangsrechnungen), B11 B15 B16 B19 B20 B22 B23.
 * - Abschlagsrechnungen nach Plan (Standard 30 / 40 / 30 %): Abschlag 1, Abschlag 2, der Rest kommt mit der Schlussrechnung
 * - Schlussrechnung aus den Raum-Angeboten des Projekts plus Nachträge, abzüglich der Abschläge, mit Lohnanteil (§ 35a)
 * - Nachträge je Projekt (w.nachtraege), zählen auch in der Kalkulation
 * - Zahlungsziel und Fälligkeit, überfällig = rot, Zahlungserinnerung und Mahnungen als PDF zum Senden
 * - Ein Weg für jede neue Rechnung (neu): Projekt suchen, Art wählen (Abschlag nach Plan, Abschlag frei, Schlussrechnung,
 *   ohne Angebot mit eigenen Positionen), Betrag steht schon da. Aus dem Reiter Rechnungen und aus dem Projekt, man bleibt, wo man war.
 * - Verschickte Rechnungen werden nicht gelöscht, sondern storniert (Stornorechnung mit eigener Nummer, art 'storno').
 * Speicher: 'rechnung:<id>' { id, kind:'rechnung', projektId, nr, art: 'abschlag'|'schluss'|'storno', artName, stufe, prozent, titel, zeitraum,
 *   datum, faellig, netto, satz, positionen (nur Schluss: [{raum, text, menge, einheit, ep, gp}]), eigen, nachtraege, abzuege, lohn,
 *   bezahlt ('JJJJ-MM-TT' oder ''), gesendet, storniert {nr, datum, id}, bezugNr/bezugId (Storno), mahnungen [{stufe, datum}], notiz, created, updated }
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
  const ueberfaellig = (r) => istOffen(r) && r.faellig && r.faellig < heute();
  const artName = (r) => r.artName || (r.art === 'storno' ? 'Stornorechnung' : r.art === 'schluss' ? 'Schlussrechnung' : `${r.stufe}. Abschlagsrechnung`);
  /** Zählt mit (nicht storniert und keine Stornorechnung). */
  const gilt = (r) => r.art !== 'storno' && !r.storniert;
  /** Kunde muss noch zahlen. Storniertes gilt als erledigt (beide tragen das Stornodatum unter „bezahlt“, Summen gleichen sich aus). */
  const istOffen = (r) => !r.bezahlt && gilt(r);
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
    return { zeilen, nachtraege, netto, lohn: r2(lohn + nachtraege.reduce((s, n) => s + (n.lohnBetrag ?? (n.lohn ? n.gp : 0)), 0)) };
  }

  // ---------- Stand der Abrechnung eines Projekts ----------
  const proz = (x) => (+x || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
  /** Was ist schon berechnet, was kommt als Nächstes (Abschlag nach Plan oder Schlussrechnung)? */
  function stand(w, a, re) {
    const abschl = re.filter((r) => r.art === 'abschlag' && gilt(r));
    const schluss = re.find((r) => r.art === 'schluss' && gilt(r));
    const P = plan(w), stufe = abschl.length + 1;
    // Der letzte Teil des Plans kommt mit der Schlussrechnung (30 / 40 / 30 = zwei Abschläge, dann Schluss)
    const planStufe = !!a.netto && stufe <= P.length - 1;
    const planProzent = planStufe ? +P[stufe - 1] : 0;
    const planNetto = r2((a.netto * planProzent) / 100);
    const abschlNetto = r2(abschl.reduce((s, r) => s + r.netto, 0));
    const berechnet = r2(re.filter(gilt).reduce((s, r) => s + r.netto, 0));
    const offen = r2(re.filter(istOffen).reduce((s, r) => s + zahlbetrag(r), 0));
    const vorschlag = schluss ? '' : !a.zeilen.length && !a.netto ? 'Kein Angebot im Projekt: Abschlag mit eigenem Betrag oder Rechnung mit eigenen Positionen.'
      : planStufe ? `Als Nächstes laut Plan: ${stufe}. Abschlag, ${proz(planProzent)} = ${eur(planNetto)} netto` : 'Als Nächstes: Schlussrechnung';
    return { abschl, schluss, stufe, planStufe, planProzent, planNetto, abschlNetto, berechnet, offen, vorschlag };
  }

  // ---------- Abschnitt im Projekt ----------
  async function projektAbschnitt(el, w) {
    if (!el) return;
    await laden();
    const a = await auftrag(w);
    if (!el.isConnected) return;
    const re = fuerProjekt(w.id), st = stand(w, a, re);
    el.innerHTML = `<div class="sec-h"><h2>Rechnungen</h2>${re.length ? `<span class="count">${re.length}</span>` : ''}</div>
      <div class="card">
        <div class="kalk-z"><span>Auftragssumme netto${a.nachtraege.length ? ` (mit ${a.nachtraege.length} ${a.nachtraege.length === 1 ? 'Nachtrag' : 'Nachträgen'})` : ''}</span><b>${eur(a.netto)}</b></div>
        <div class="kalk-z"><span>Schon berechnet netto</span><b>${eur(st.berechnet)}${a.netto ? ` · ${proz((st.berechnet / a.netto) * 100)}` : ''}</b></div>
        ${st.offen ? `<div class="kalk-z"><span>Kunde zahlt noch</span><b style="color:#d2691e">${eur(st.offen)}</b></div>` : ''}
      </div>
      <div class="plist">${re.map(zeile).join('')}</div>
      ${st.schluss ? '' : `<button class="btn block" id="rNeuP" style="margin-top:8px">${icon('plus')} Rechnung schreiben</button>
        <p class="hint center">${esc(st.vorschlag)}</p>`}
      <div class="sec-h" style="margin-top:18px"><h2>Nachträge</h2>${w.nachtraege?.length ? `<span class="count">${w.nachtraege.length}</span>` : ''}</div>
      <div class="plist">${(w.nachtraege || []).map((n) => `<button class="pcard" data-nt="${n.id}"><span class="pc-ph">${icon('plus')}</span>
        <span class="pc-t"><b>${esc(n.text || 'Nachtrag')}</b><span class="muted">${esc(String(n.menge).replace('.', ','))} ${esc(n.einheit)} × ${eur(n.ep)}${n.datum ? ' · ' + tag(n.datum) : ''}</span><span class="ang-sum">${eur(r2(n.menge * n.ep))} netto</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>
      ${st.schluss ? '' : `<button class="add-room" id="rNt" style="width:100%;margin-top:8px">${icon('plus')} Nachtrag (Zusatzleistung)</button>`}`;
    const zurueck = () => Projekt.view();
    if ($('#rNeuP', el)) $('#rNeuP', el).onclick = () => neu(w, zurueck);
    if ($('#rNt', el)) $('#rNt', el).onclick = () => nachtrag(w, null, zurueck);
    $$('[data-nt]', el).forEach((b) => (b.onclick = () => nachtrag(w, w.nachtraege.find((n) => n.id === b.dataset.nt), zurueck)));
    $$('[data-rech]', el).forEach((b) => (b.onclick = () => detail(alle.get(b.dataset.rech), zurueck)));
  }
  function zeile(r) {
    const st = r.art === 'storno' ? ['Storno', '#8a8f98'] : r.storniert ? ['Storniert', '#8a8f98'] : r.bezahlt ? ['Bezahlt', '#1b5e3a']
      : ueberfaellig(r) ? [r.mahnungen?.length ? MAHN[r.mahnungen.length - 1] : 'Überfällig', '#c0392b'] : ['Offen', '#d2691e'];
    return `<button class="pcard" data-rech="${r.id}"><span class="pc-ph">${icon('file')}</span>
      <span class="pc-t"><b>${esc(artName(r))}</b>
        <span class="pills"><span class="st-pill" style="--c:${st[1]}">${st[0]}</span><span class="muted">${esc(r.nr)} · ${esc(tag(r.datum))}</span></span>
        <span class="ang-sum">${eur(zahlbetrag(r))}${istOffen(r) ? ` · <span class="muted">fällig ${esc(tag(r.faellig))}</span>` : ''}</span></span>${icon('chevron', 'pc-chev')}</button>`;
  }

  // ---------- Neue Rechnung: Projekt wählen, Art wählen, Betrag herleiten ----------
  /** Ein Weg für jede neue Rechnung an Kunden, aus dem Reiter Rechnungen und aus dem Projekt.
   * w = Projekt (fehlt es, wird gefragt), fertig = zurück dorthin, wo man herkam (man bleibt im Reiter). */
  async function neu(w, fertig) {
    await laden();
    if (!w) {
      const REIHE = ['fertig', '', 'geplant', 'rechnung', 'bezahlt'];
      const idx = (await projectIndex()).filter((x) => Projekt.zugesagt(x.status))
        .sort((x, y) => REIHE.indexOf(Projekt.norm(x.status)) - REIHE.indexOf(Projekt.norm(y.status)) || (y.updated || 0) - (x.updated || 0));
      if (!idx.length) return toast('Rechnungen an Kunden gibt es, sobald ein Projekt zugesagt ist.', 4000);
      const pid = await sheet('Rechnung für welches Projekt?', idx.map((x) => {
        const n = fuerProjekt(x.id).filter(gilt).length;
        return { label: Kunden.name(Kunden.byId(x.kundeId)) || x.customer || 'Ohne Namen', icon: icon('home'), color: Projekt.farbe(x.status), value: x.id,
          sub: [x.titel || x.room, x.nr && `Nr. ${x.nr}`, Projekt.norm(x.status) === 'fertig' ? 'fertig, abzurechnen' : Projekt.statusKurz(x.status), n && `${n} ${n === 1 ? 'Rechnung' : 'Rechnungen'}`].filter(Boolean).join(' · ') };
      }), { suche: 'Kunde, Projekt oder Nummer' });
      if (!pid) return;
      w = await kvGet('wohnung:' + pid);
      if (!w) return toast('Projekt nicht gefunden.');
    }
    const a = await auftrag(w);
    const st = stand(w, a, fuerProjekt(w.id));
    if (st.schluss) { toast(`Die Schlussrechnung ${st.schluss.nr} ist schon gestellt. Zum Ändern dort stornieren.`, 5000); return detail(st.schluss, fertig); }
    const abBrutto = st.abschl.reduce((s, r) => s + brutto(r), 0);
    const opts = [];
    if (st.planStufe) opts.push({ label: `${st.stufe}. Abschlag nach Plan`, sub: `${proz(st.planProzent)} von ${eur(a.netto)} = ${eur(st.planNetto)} netto`, icon: icon('euro'), value: 'plan' });
    opts.push({ label: st.planStufe ? `${st.stufe}. Abschlag, Betrag selbst wählen` : `${st.stufe}. Abschlag`, sub: a.netto ? 'Prozent vom Auftrag oder Betrag eintragen' : 'Betrag eintragen', icon: icon('edit'), value: 'frei' });
    if (a.zeilen.length) opts.push({ label: st.abschl.length ? 'Schlussrechnung' : 'Rechnung über den ganzen Auftrag', icon: icon('file'), value: 'schluss',
      sub: st.abschl.length ? `${eur(r2(a.netto * 1.19))} brutto minus ${st.abschl.length} ${st.abschl.length === 1 ? 'Abschlag' : 'Abschläge'} = noch ${eur(r2(a.netto * 1.19 - abBrutto))}` : `${eur(a.netto)} netto, alle Positionen aus dem Angebot${a.nachtraege.length ? ' und die Nachträge' : ''}` });
    else opts.push({ label: st.abschl.length ? 'Schlussrechnung mit eigenen Positionen' : 'Rechnung mit eigenen Positionen', sub: 'Kein Angebot im Projekt: Leistungen selbst eintragen', icon: icon('list'), value: 'eigen' });
    const v = await sheet(`Welche Rechnung für ${Kunden.name(Kunden.byId(w.kundeId)) || w.customer || 'den Kunden'}?`, opts);
    if (!v) return;
    erstellen(w, v === 'plan' || v === 'frei' ? 'abschlag' : 'schluss', fertig, { eigen: v === 'eigen', frei: v === 'frei' });
  }

  // ---------- Nachtrag ----------
  async function nachtrag(w, n, fertig) {
    const neu = !n;
    n = n ? { ...n } : { id: uid(), text: '', menge: 1, einheit: 'pauschal', ep: 0, lohn: true, datum: heute(), stunden: '', beschreibung: '' };
    let foto = n.foto ? await kvGet('ntfoto:' + n.id) : null;
    header(neu ? 'Nachtrag' : 'Nachtrag bearbeiten', w.titel || '', { label: 'Zurück', fn: fertig });
    main().innerHTML = `<div class="card">
        ${foto ? `<img src="${foto}" alt="" style="width:100%;border-radius:12px;margin-bottom:8px">` : ''}
        <div class="row"><button class="btn secondary" id="nFoto">${icon('camera')} ${foto ? 'Anderes Foto' : 'Foto vom Nachtrag'}</button>${foto ? `<button class="btn secondary" id="nFotoWeg">${icon('x')} Foto entfernen</button>` : ''}</div>
        <p class="hint" style="margin:8px 0 0">${state.settings.apiKey ? 'Z. B. der Zettel vom Subunternehmer. Die KI liest Leistung, Stunden und Betrag aus, du prüfst nur noch.' : 'Z. B. der Zettel vom Subunternehmer.'}</p>
      </div>
      <div class="card kform">
        <label style="margin-top:0">Leistung</label><textarea id="nText" placeholder="z. B. Zusätzliche Steckdose im Bad, Leitungen erneuert">${esc(n.text)}</textarea>
        <label>Beschreibung (für das PDF, optional)</label><textarea id="nBeschr" placeholder="z. B. Auf Wunsch des Kunden wurde …">${esc(n.beschreibung || '')}</textarea>
        <div class="hv-h">${icon('wrench')}<span>Stunden (Arbeit)</span></div>
        <div class="row"><div><label>Stunden</label><input type="text" inputmode="decimal" id="nStd" value="${esc(String(n.stunden || '').replace('.', ','))}" placeholder="z. B. 3,5"></div>
          <div><label>Stundensatz netto</label><input type="text" inputmode="decimal" id="nSatz" value="${n.satz ? String(n.satz).replace('.', ',') : ''}" placeholder="z. B. 58,00"></div></div>
        <label>Monteur bzw. Firma</label>
        <select id="nWerP"><option value="">Eigenes Personal oder Name eintragen</option>${(window.Partner?.liste() || []).filter((p) => p.art !== 'lief').map((p) => `<option value="${p.id}" ${p.id === n.partnerId ? 'selected' : ''}>${esc(p.firma || p.inhaber || 'Ohne Namen')}</option>`).join('')}</select>
        <input type="text" id="nWer" value="${esc(n.monteur || '')}" placeholder="z. B. Monteur Ali, Firma Kaya" autocomplete="off" style="margin-top:6px" ${n.partnerId ? 'hidden' : ''}>
        <div class="hv-h" style="margin-top:14px">${icon('clipboard')}<span>Material</span></div>
        <label>Material (was?)</label><input type="text" id="nMatText" value="${esc(n.matText || '')}" placeholder="z. B. Steckdose, Kabel, Dose" autocomplete="off">
        <label>Material netto</label><input type="text" inputmode="decimal" id="nMat" value="${n.material ? String(n.material).replace('.', ',') : ''}" placeholder="0,00">
        <label>Beauftragt am</label><input type="date" id="nDatum" value="${esc(n.datum)}">
        <p class="hint" id="nSum" style="margin:6px 0 0"></p>
      </div>
      <button class="btn big block" id="nSave">${icon('check')} Speichern</button>
      <button class="btn secondary block" id="nPdf" style="margin-top:10px">${icon('file')} Nachtrag als PDF (mit Logo)</button>
      ${neu ? '' : `<button class="link-danger" id="nDel">${icon('trash')} Nachtrag löschen</button>`}`;
    // Material und Stunden getrennt; daraus ergibt sich der Betrag (Menge 1, pauschal). Lohnanteil = Stunden × Satz.
    const lesen = () => {
      n.text = $('#nText').value.trim(); n.beschreibung = $('#nBeschr').value.trim();
      n.stunden = num($('#nStd').value) || ''; n.satz = r2(num($('#nSatz').value)); n.partnerId = $('#nWerP').value; n.monteur = n.partnerId ? '' : $('#nWer').value.trim();
      n.matText = $('#nMatText').value.trim(); n.material = r2(num($('#nMat').value)); n.datum = $('#nDatum').value;
      const lohn = r2((+n.stunden || 0) * (n.satz || 0));
      if (lohn || n.material || !n.ep) { n.menge = 1; n.einheit = 'pauschal'; n.ep = r2(lohn + (n.material || 0)); }
      n.lohnBetrag = lohn; n.lohn = lohn > 0;
    };
    const sichern = async () => {
      if (foto) { await kvSet('ntfoto:' + n.id, foto); n.foto = true; } else { if (n.foto) await kvDel('ntfoto:' + n.id); delete n.foto; }
      w.nachtraege = (w.nachtraege || []).filter((x) => x.id !== n.id).concat(n);
      await Projekt.save(w);
    };
    $('#nFoto').onclick = async () => {
      const [f] = await pickFiles({ camera: true, accept: 'image/*' }); if (!f) return;
      lesen();
      foto = await resize(await fileToDataUrl(f), 1800, 'image/jpeg', 0.85);
      if (state.settings.apiKey) {
        toast('KI liest den Nachtrag …', 15000);
        try {
          const j = JSON.parse(await geminiText([{ text: 'Das ist ein Nachtrag bzw. eine Zusatzleistung auf einer Baustelle (z. B. Zettel vom Subunternehmer). Lies aus: leistung (kurz), beschreibung (1–3 Sätze), stunden (Zahl oder 0), betrag (netto in Euro, Zahl oder 0). Deutsch.' }, { inline_data: { mime_type: 'image/jpeg', data: foto.split(',')[1] } }], true,
            { responseSchema: { type: 'OBJECT', properties: { leistung: { type: 'STRING' }, beschreibung: { type: 'STRING' }, stunden: { type: 'NUMBER' }, betrag: { type: 'NUMBER' } } } }));
          if (j.leistung && !n.text) n.text = j.leistung;
          if (j.beschreibung && !n.beschreibung) n.beschreibung = j.beschreibung;
          if (j.stunden > 0 && !n.stunden) n.stunden = j.stunden;
          if (j.betrag > 0 && !n.ep) { n.ep = r2(j.betrag); n.menge = 1; n.einheit = 'pauschal'; }
          toast('Ausgelesen, bitte prüfen', 3000);
        } catch (e) { toast('Konnte nicht ausgelesen werden: ' + e.message, 4000); }
      }
      await sichern(); nachtrag(w, n, fertig);
    };
    if ($('#nFotoWeg')) $('#nFotoWeg').onclick = async () => { if (!loeschFrage('Foto vom Nachtrag entfernen?')) return; lesen(); foto = null; await sichern(); nachtrag(w, n, fertig); };
    $('#nPdf').onclick = async () => {
      lesen();
      if (!n.text) return toast('Bitte zuerst die Leistung eintragen.');
      await sichern();
      try { await nachtragPdf(w, n, foto); } catch (e) { toast('PDF-Fehler: ' + e.message, 5000); }
    };
    const summe = () => { lesen(); $('#nSum').textContent = `Stunden ${eur(n.lohnBetrag || 0)} + Material ${eur(n.material || 0)} = ${eur(r2(n.menge * n.ep))} netto. Kommt mit der Schlussrechnung zum Kunden.`; };
    ['#nStd', '#nSatz', '#nMat'].forEach((s) => ($(s).oninput = summe)); summe();
    $('#nWerP').onchange = (e) => { $('#nWer').hidden = !!e.target.value; };
    $('#nSave').onclick = async () => {
      lesen();
      if (!n.text || !n.ep) return toast('Bitte Leistung und Preis eintragen.');
      await sichern(); toast('Nachtrag gespeichert'); fertig();
    };
    if ($('#nDel')) $('#nDel').onclick = async () => { if (!loeschFrage('Nachtrag löschen?')) return; w.nachtraege = w.nachtraege.filter((x) => x.id !== n.id); await Projekt.save(w); fertig(); };
    window.scrollTo(0, 0);
  }

  /** Nachtrag als eigenes, sauberes PDF: Logo, Kunde, Bauvorhaben, Leistung, Beschreibung, Stunden, Betrag, Unterschrift. */
  async function nachtragPdf(w, n, foto) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 20, R = 192, NAVY = [30, 53, 80];
    const t = (s, x, y, o) => doc.text(Array.isArray(s) ? s : String(s ?? ''), x, y, o);
    const logo = state.settings.logo;
    if (logo) await addFit(doc, logo, R - 55, 10, 55, 22, mimeOf(logo) === 'image/png' ? 'PNG' : 'JPEG');
    else { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); t(E.firma, R, 20, { align: 'right' }); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120); t([E.firma, E.strasse, E.ort].filter(Boolean).join(' · '), M, 47);
    const kd = Kunden.byId(w.kundeId);
    doc.setFontSize(10.5); doc.setTextColor(30);
    (kd ? Kunden.postanschrift(kd) : [w.customer]).filter(Boolean).forEach((l, i) => t(l, M, 55 + i * 5));
    doc.setFontSize(9); let my = 55;
    for (const [k, v] of [['Datum', tag(n.datum || heute())], ...(w.nr ? [['Projekt-Nr.', w.nr]] : []), ...(kd?.nr ? [['Kunden-Nr.', kd.nr]] : [])]) { doc.setTextColor(120); t(k, 128, my); doc.setTextColor(30); t(String(v), 160, my); my += 4.6; }
    let y = 92;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); t('Nachtrag', M, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110); if (w.address) { t('Bauvorhaben: ' + w.address, M, y); y += 8; }
    doc.setTextColor(30); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    const lt = doc.splitTextToSize(n.text, R - M); t(lt, M, y); y += 5.5 * lt.length + 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (n.beschreibung) { const b = doc.splitTextToSize(n.beschreibung, R - M); t(b, M, y); y += 5 * b.length + 4; }
    const gp = r2(n.menge * n.ep), satz = E.mwst ?? 0.19;
    const wer = n.partnerId ? (window.Partner?.byId(n.partnerId)?.firma || '') : n.monteur || '';
    const zeilen = [
      ...(n.stunden ? [[`Arbeit${wer ? ` (${wer})` : ''}: ${String(n.stunden).replace('.', ',')} Std.${n.satz ? ` × ${eur(n.satz)}` : ''}`, n.lohnBetrag ? eur(n.lohnBetrag) : '']] : []),
      ...(n.material ? [[`Material${n.matText ? `: ${n.matText}` : ''}`, eur(n.material)]] : []),
      ...(!n.stunden && !n.material ? [['Pauschal', eur(n.ep)]] : []),
      ['Betrag netto', eur(gp)], [`zzgl. ${Math.round(satz * 100)} % MwSt.`, eur(r2(gp * satz))], ['Betrag brutto', eur(r2(gp * (1 + satz)))]];
    doc.setDrawColor(220); doc.line(M, y, R, y); y += 6;
    for (const [k, v] of zeilen) { const fett = k === 'Betrag brutto'; doc.setFont('helvetica', fett ? 'bold' : 'normal'); t(k, M, y); t(v, R, y, { align: 'right' }); y += 6; }
    y += 4;
    if (foto && y < 200) { try { await addFit(doc, foto, M, y, R - M, 270 - y - 30, 'JPEG'); y = 240; } catch {} }
    doc.setFontSize(9); doc.setTextColor(90);
    t('Der Nachtrag wird mit der Schlussrechnung abgerechnet. Mit Ihrer Unterschrift beauftragen Sie diese Zusatzleistung.', M, 262);
    doc.setDrawColor(150); doc.line(M, 280, M + 70, 280); doc.line(R - 70, 280, R, 280);
    t('Ort, Datum', M, 284); t('Unterschrift Auftraggeber', R - 70, 284);
    const name = `Nachtrag_${(w.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${(n.datum || heute())}.pdf`;
    await window.Mappe.teilen(doc, name);
  }

  // ---------- Rechnung erstellen ----------
  /** Rechnung vorbereiten und prüfen. art 'abschlag' | 'schluss'; o.frei = Abschlag mit eigenem Betrag, o.eigen = Positionen selbst eintragen (kein Angebot). */
  async function erstellen(w, art, fertig, o = {}) {
    const a = await auftrag(w);
    const re = fuerProjekt(w.id), st = stand(w, a, re);
    const k = Kunden.byId(w.kundeId);
    const stufe = st.stufe;
    const r = { id: uid(), kind: 'rechnung', projektId: w.id, nr: '', art, stufe, prozent: art === 'abschlag' ? (st.planStufe ? st.planProzent : 0) : 100, titel: w.titel || 'Sanierung',
      zeitraum: [w.baustart && tag(w.baustart), art === 'schluss' ? tag(heute()) : ''].filter(Boolean).join(' bis ') || '', datum: heute(), faellig: plusTage(heute(), ziel()),
      netto: 0, satz: 19, positionen: [], nachtraege: [], abzuege: [], lohn: 0, bezahlt: '', gesendet: '', mahnungen: [], notiz: '', created: Date.now() };
    if (art === 'schluss') {
      r.abzuege = st.abschl.map((x) => ({ nr: x.nr, datum: x.datum, netto: x.netto, brutto: brutto(x), bezahlt: !!x.bezahlt }));
      r.artName = r.abzuege.length ? 'Schlussrechnung' : 'Rechnung';
      r.nachtraege = a.nachtraege.map(({ text, menge, einheit, ep, gp }) => ({ text, menge, einheit, ep, gp }));
      if (o.eigen) { r.eigen = true; r.positionen = [{ raum: '', text: '', menge: 1, einheit: 'pauschal', ep: 0, gp: 0 }]; }
      else { r.positionen = a.zeilen.map(({ raum, text, menge, einheit, ep, gp }) => ({ raum, text, menge, einheit, ep, gp })); r.lohn = r2(a.lohn * 1.19); }
    }
    const summe = () => {
      if (art !== 'schluss') return;
      for (const z of r.positionen) z.gp = r2(z.menge * z.ep);
      r.netto = r2(r.positionen.reduce((s, z) => s + z.gp, 0) + r.nachtraege.reduce((s, n) => s + n.gp, 0));
    };
    if (art === 'abschlag') r.netto = r2((a.netto * r.prozent) / 100);
    summe();
    const titel = art === 'schluss' ? r.artName : `${stufe}. Abschlagsrechnung`;
    header(titel, [Kunden.name(k) || w.customer, w.titel].filter(Boolean).join(' · '), { label: 'Zurück', fn: fertig });
    const f = window.Fortschritt?.kurz(w);
    const anschrift = () => Kunden.postanschrift(k) || [Kunden.name(k) || w.customer, ...String(w.address || '').split(/\s*,\s*|\n/)].filter(Boolean);
    const hinweisAbschlag = () => {
      const zusammen = st.abschlNetto + r.netto;
      const t = [];
      if (a.netto) t.push(`Auftrag ${eur(a.netto)} netto. Mit diesem Abschlag sind ${proz((zusammen / a.netto) * 100)} berechnet.`);
      if (f?.n && vorgabe('abschlagFortschritt') !== 'nein') t.push(`Baufortschritt: ${f.fertig} von ${f.n} Schritten erledigt (${Math.round((f.fertig / f.n) * 100)} %).`);
      if (a.netto && zusammen > a.netto * 0.9) t.push('Achtung: Die Abschläge sind zusammen über 90 % des Auftrags. Bei Privatkunden ist das oft nicht erlaubt (§ 650m BGB).');
      return t.map((x) => esc(x)).join('<br>');
    };
    const posZeile = (z, i) => `<div class="rpos">
        <textarea data-pt="${i}" rows="2" placeholder="Leistung, z. B. Wasserhahn im Bad getauscht">${esc(z.text)}</textarea>
        <div class="row"><div><label>Menge</label><input type="text" inputmode="decimal" data-pm="${i}" value="${esc(String(z.menge).replace('.', ','))}"></div>
          <div><label>Einheit</label><input type="text" data-pe="${i}" value="${esc(z.einheit)}"></div>
          <div><label>Preis netto</label><input type="text" inputmode="decimal" data-pp="${i}" value="${z.ep ? esc(String(z.ep).replace('.', ',')) : ''}" placeholder="0,00"></div></div>
        ${r.positionen.length > 1 ? `<button type="button" class="link-danger" data-pdel="${i}" style="margin:2px 0 0">${icon('trash')} Position entfernen</button>` : ''}</div>`;
    const summenHtml = () => `
        <div class="kalk-z"><span>Summe netto</span><b>${eur(r.netto)}</b></div>
        <div class="kalk-z"><span>Brutto</span><b>${eur(brutto(r))}</b></div>
        ${r.abzuege.map((x) => `<div class="kalk-z"><span>abzüglich Abschlag ${esc(x.nr)}</span><b>- ${eur(x.brutto)}</b></div>`).join('')}
        <div class="kalk-z big" style="--c:var(--navy)"><span>Noch zu zahlen</span><b>${eur(zahlbetrag(r))}</b></div>`;
    const render = () => {
      const fehlt = !Kunden.postanschrift(k);
      main().innerHTML = `<div class="card radr">
          <small class="muted">Rechnung an</small>
          <p>${anschrift().map((l) => esc(l)).join('<br>')}</p>
          ${fehlt ? `<p class="warn" style="margin:4px 0 0">Keine eigene Rechnungsanschrift beim Kunden. Es wird die Anschrift der Baustelle genommen.</p>` : ''}
          ${k ? `<button type="button" class="link-add" id="rAdr">${icon('edit')} ${fehlt ? 'Rechnungsanschrift eintragen' : 'Rechnungsanschrift ändern'}</button>` : ''}
          ${w.nr ? `<small class="muted">Projekt-Nr. ${esc(w.nr)}${k?.nr ? ` · Kunden-Nr. ${esc(k.nr)}` : ''}</small>` : ''}
        </div>
        ${art === 'schluss' && r.eigen ? `<div class="sec-h"><h2>Leistungen</h2></div>
          <div class="card kform" id="rPosBox">${r.positionen.map(posZeile).join('')}
            <button type="button" class="link-add" id="rPosNeu">${icon('plus')} Weitere Position</button></div>
          ${r.nachtraege.length ? `<p class="hint">Dazu kommen ${r.nachtraege.length} ${r.nachtraege.length === 1 ? 'Nachtrag' : 'Nachträge'} aus dem Projekt (${eur(r.nachtraege.reduce((s, n) => s + n.gp, 0))} netto).</p>` : ''}` : ''}
        <div class="card kform">
          ${art === 'abschlag' ? `<div class="row">${a.netto ? `<div><label style="margin-top:0">Anteil vom Auftrag in %</label><input type="text" inputmode="decimal" id="rPro" value="${String(r.prozent).replace('.', ',')}"></div>` : ''}
            <div><label style="margin-top:0">Betrag netto</label><input type="text" inputmode="decimal" id="rNetto" value="${r.netto ? String(r.netto).replace('.', ',') : ''}" placeholder="0,00"></div></div>
            <p class="hint" id="rBr" style="margin:6px 0 0">Brutto ${eur(brutto(r))}</p>
            <p class="hint" id="rAbH" style="margin:6px 0 0">${hinweisAbschlag()}</p>`
          : `<div id="rSum">${r.eigen ? '' : `<div class="kalk-z"><span>Leistungen laut Angebot</span><b>${eur(a.zeilen.reduce((s, z) => s + z.gp, 0))}</b></div>
            ${a.nachtraege.length ? `<div class="kalk-z"><span>Nachträge (${a.nachtraege.length})</span><b>${eur(a.nachtraege.reduce((s, n) => s + n.gp, 0))}</b></div>` : ''}`}${summenHtml()}</div>`}
          <label>Bezeichnung</label><input type="text" id="rTitel" value="${esc(r.titel)}">
          <label>Leistungszeitraum</label><input type="text" id="rZeit" value="${esc(r.zeitraum)}" placeholder="z. B. 12.01.2027 bis 06.02.2027">
          <div class="row"><div><label>Rechnungsdatum</label><input type="date" id="rDatum" value="${r.datum}"></div>
            <div><label>Zahlbar bis</label><input type="date" id="rFaellig" value="${r.faellig}"></div></div>
        </div>
        <button class="btn big block" id="rSave">${icon('check')} Rechnung erstellen</button>
        <p class="hint center">Die Rechnung bekommt danach eine feste Nummer und lässt sich als PDF senden.</p>`;
      const merken = () => { r.titel = $('#rTitel').value.trim() || r.titel; r.zeitraum = $('#rZeit').value.trim(); r.datum = $('#rDatum').value || heute(); r.faellig = $('#rFaellig').value; };
      if ($('#rAdr')) $('#rAdr').onclick = async () => {
        merken();
        const v = await sheet('Rechnungsanschrift', [], { text: 'Straße Nr., PLZ Ort', value: Kunden.zeilen(k.privat || '').join(', ') });
        if (!v?.text) return;
        k.privat = v.text.split(/\s*,\s*/).filter(Boolean).join('\n');
        await Kunden.speichern(k); toast('Rechnungsanschrift gespeichert'); render();
      };
      if (art === 'abschlag') {
        const neuZeigen = () => { $('#rBr').textContent = `Brutto ${eur(brutto(r))}`; $('#rAbH').innerHTML = hinweisAbschlag(); };
        if ($('#rPro')) $('#rPro').oninput = () => { r.prozent = num($('#rPro').value); r.netto = r2((a.netto * r.prozent) / 100); $('#rNetto').value = String(r.netto).replace('.', ','); neuZeigen(); };
        $('#rNetto').oninput = () => { r.netto = r2(num($('#rNetto').value)); r.prozent = a.netto ? Math.round((r.netto / a.netto) * 1000) / 10 : 0; if ($('#rPro')) $('#rPro').value = String(r.prozent).replace('.', ','); neuZeigen(); };
      }
      if (r.eigen) {
        const neuRechnen = () => { summe(); $('#rSum').innerHTML = summenHtml(); };
        $$('[data-pt]').forEach((el) => (el.oninput = () => { r.positionen[+el.dataset.pt].text = el.value; }));
        $$('[data-pe]').forEach((el) => (el.oninput = () => { r.positionen[+el.dataset.pe].einheit = el.value.trim(); }));
        $$('[data-pm]').forEach((el) => (el.oninput = () => { r.positionen[+el.dataset.pm].menge = num(el.value); neuRechnen(); }));
        $$('[data-pp]').forEach((el) => (el.oninput = () => { r.positionen[+el.dataset.pp].ep = num(el.value); neuRechnen(); }));
        $$('[data-pdel]').forEach((b) => (b.onclick = () => { merken(); r.positionen.splice(+b.dataset.pdel, 1); summe(); render(); }));
        $('#rPosNeu').onclick = () => { merken(); r.positionen.push({ raum: '', text: '', menge: 1, einheit: 'pauschal', ep: 0, gp: 0 }); render(); setTimeout(() => $$('[data-pt]').pop()?.focus(), 50); };
      }
      $('#rDatum').onchange = (e) => { $('#rFaellig').value = plusTage(e.target.value, ziel()); };
      $('#rSave').onclick = async () => {
        merken();
        if (r.eigen) { r.positionen = r.positionen.filter((z) => z.text.trim()).map((z) => ({ ...z, text: z.text.trim() })); summe(); if (!r.positionen.length && !r.nachtraege.length) { r.positionen.push({ raum: '', text: '', menge: 1, einheit: 'pauschal', ep: 0, gp: 0 }); return toast('Bitte mindestens eine Leistung eintragen.'); } }
        if (!r.netto) return toast('Der Betrag ist 0.');
        if (!r.zeitraum) r.zeitraum = tag(r.datum);
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
    const k = w ? Kunden.byId(w.kundeId) : null;
    header(artName(r), [r.nr, Kunden.name(k) || w?.customer].filter(Boolean).join(' · '), { label: 'Zurück', fn: fertig });
    const storno = r.art === 'storno', erledigt = storno || r.storniert;
    const st = storno ? `Hebt Rechnung ${r.bezugNr} auf` : r.storniert ? `Storniert am ${tag(r.storniert.datum)} mit Nr. ${r.storniert.nr}`
      : r.bezahlt ? `Bezahlt am ${tag(r.bezahlt)}` : ueberfaellig(r) ? `Überfällig seit ${tag(r.faellig)}` : `Fällig am ${tag(r.faellig)}`;
    const farbe = erledigt ? '#8a8f98' : r.bezahlt ? '#1b5e3a' : ueberfaellig(r) ? '#c0392b' : '#d2691e';
    const naechsteMahn = r.mahnungen?.length || 0;
    main().innerHTML = `<div class="card">
        <div class="kalk-z"><span>${esc(r.titel)}</span><b></b></div>
        <div class="kalk-z"><span>Netto</span><b>${eur(r.netto)}</b></div>
        <div class="kalk-z"><span>Brutto</span><b>${eur(brutto(r))}</b></div>
        ${(r.abzuege || []).length && !storno ? `<div class="kalk-z"><span>abzüglich Abschläge</span><b>- ${eur((r.abzuege || []).reduce((s, a) => s + a.brutto, 0))}</b></div>` : ''}
        <div class="kalk-z big" style="--c:${erledigt ? '#8a8f98' : r.bezahlt ? '#1b5e3a' : ueberfaellig(r) ? '#c0392b' : 'var(--navy)'}"><span>Zahlbetrag</span><b>${eur(zahlbetrag(r))}</b></div>
        <p class="kalk-amp" style="--c:${farbe}"><i></i>${esc(st)}</p>
      </div>
      <div class="docs">
        <button class="doc" id="rPdf"><span class="d-ico navy">${icon('file')}</span><span class="d-t"><b>${storno ? 'Stornorechnung' : 'Rechnung'} als PDF senden</b><span>${r.gesendet ? `Zuletzt gesendet am ${tag(r.gesendet)}` : 'Per Mail, WhatsApp oder speichern'}</span></span>${icon('chevron', 'pc-chev')}</button>
        ${!erledigt && !r.bezahlt && ueberfaellig(r) && naechsteMahn < MAHN.length ? `<button class="doc" id="rMahn"><span class="d-ico brass">${icon('mail')}</span><span class="d-t"><b>${MAHN[naechsteMahn]} senden</b><span>${naechsteMahn ? `Zuletzt: ${esc(MAHN[naechsteMahn - 1])} am ${tag(r.mahnungen[naechsteMahn - 1].datum)}` : `Freundlich, mit neuer Frist von ${+vorgabe('mahnFrist') || 7} Tagen`}</span></span>${icon('chevron', 'pc-chev')}</button>` : ''}
      </div>
      ${erledigt ? '' : `<div class="card kform" style="margin-top:12px">
        <div class="row"><div><label style="margin-top:0">Zahlbar bis</label><input type="date" id="rFaellig" value="${esc(r.faellig)}"></div>
          <div><label style="margin-top:0">Bezahlt am</label><input type="date" id="rBez" value="${esc(r.bezahlt)}"></div></div>
        ${r.bezahlt ? '' : `<button class="btn secondary block" id="rJetzt" style="margin-top:10px">${icon('check')} Zahlung heute eingegangen</button>`}
        <label>Notiz</label><textarea id="rNotiz" placeholder="z. B. Teilzahlung, Skonto">${esc(r.notiz)}</textarea>
      </div>`}
      ${erledigt ? '' : `<button class="link-danger" id="rStorno">${icon('x')} Rechnung stornieren</button>
        <p class="hint center">Rechnungen werden nie gelöscht (Nummern lückenlos, 8 Jahre aufbewahren). Das Storno hebt sie mit eigener Nummer auf, danach schreibst du eine neue.</p>`}`;
    const speichernUndStatus = async () => {
      await speichern(r);
      // Alle Rechnungen inkl. Schlussrechnung bezahlt → Projekt „Bezahlt“
      const re = fuerProjekt(r.projektId).filter(gilt);
      if (w && re.some((x) => x.art === 'schluss') && re.every((x) => x.bezahlt) && Projekt.norm(w.status) !== 'bezahlt') {
        w.status = 'bezahlt'; (w.verlauf ??= []).push({ st: 'bezahlt', t: Date.now() }); await Projekt.save(w); toast('Alles bezahlt. Projekt ist erledigt.', 4000);
      }
    };
    if ($('#rFaellig')) $('#rFaellig').onchange = async (e) => { r.faellig = e.target.value; await speichern(r); };
    if ($('#rBez')) $('#rBez').onchange = async (e) => { r.bezahlt = e.target.value; await speichernUndStatus(); detail(r, fertig); };
    if ($('#rJetzt')) $('#rJetzt').onclick = async () => { r.bezahlt = heute(); await speichernUndStatus(); detail(r, fertig); };
    if ($('#rNotiz')) $('#rNotiz').oninput = debounce(async (e) => { r.notiz = e.target.value.trim(); await speichern(r); }, 500);
    $('#rPdf').onclick = async () => { if (await senden(r, w, null)) { r.gesendet = heute(); await speichern(r); detail(r, fertig); } };
    if ($('#rMahn')) $('#rMahn').onclick = async () => {
      const stufe = naechsteMahn;
      const ok = await senden(r, w, stufe);
      if (ok === false) return;
      (r.mahnungen ??= []).push({ stufe, datum: heute() });
      await speichern(r); detail(r, fertig);
    };
    if ($('#rStorno')) $('#rStorno').onclick = async () => {
      if (!confirm(`Rechnung ${r.nr} stornieren?\n\nEs entsteht eine Stornorechnung mit eigener Nummer über ${eur(-zahlbetrag(r))}. Die schickst du dem Kunden. Danach kannst du eine neue Rechnung schreiben.`)) return;
      const s = { id: uid(), kind: 'rechnung', projektId: r.projektId, nr: await naechsteNummer(), art: 'storno', stufe: r.stufe, prozent: r.prozent, titel: r.titel, zeitraum: r.zeitraum,
        datum: heute(), faellig: '', netto: -r.netto, satz: r.satz, positionen: [], nachtraege: [],
        // Abzüge umgedreht: Der Zahlbetrag des Stornos ist genau der negative Zahlbetrag der Rechnung (Summen gleichen sich aus)
        abzuege: (r.abzuege || []).map((x) => ({ ...x, netto: -x.netto, brutto: -x.brutto })), lohn: 0, bezahlt: heute(), mahnungen: [], notiz: '',
        bezugNr: r.nr, bezugId: r.id, bezugArt: artName(r), bezugDatum: r.datum, created: Date.now() };
      await speichern(s);
      r.storniert = { nr: s.nr, datum: s.datum, id: s.id }; if (!r.bezahlt) r.bezahlt = s.datum;
      await speichern(r);
      // Schlussrechnung storniert: Projekt wieder auf „Abgeschlossen“ (abzurechnen)
      if (w && r.art === 'schluss' && ['rechnung', 'bezahlt'].includes(Projekt.norm(w.status))) { w.status = 'fertig'; (w.verlauf ??= []).push({ st: 'fertig', t: Date.now() }); await Projekt.save(w); }
      toast(`Stornorechnung ${s.nr} erstellt. Bitte dem Kunden senden.`, 4500);
      detail(s, fertig);
    };
    window.scrollTo(0, 0);
  }

  async function senden(r, w, mahnStufe) {
    toast('PDF wird erstellt …', 8000);
    let doc;
    try { doc = await pdf(r, w, mahnStufe); } catch (e) { toast('PDF ging nicht: ' + e.message, 5000); return false; }
    const k = w ? Kunden.byId(w.kundeId) : null;
    const name = `${mahnStufe == null ? (r.art === 'storno' ? 'Stornorechnung' : 'Rechnung') : MAHN[mahnStufe].replace(/\.\s*/g, '_').replace(/\s+/g, '_')}_${r.nr}_${(Kunden.name(k) || w?.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    const anrede = k ? Kunden.briefAnrede(k) : 'Sehr geehrte Damen und Herren,';
    const vars = { anrede, art: artName(r), nr: r.nr, betrag: eur(zahlbetrag(r)), faellig: tag(r.faellig), datum: tag(r.datum), stufe: mahnStufe == null ? '' : MAHN[mahnStufe], firma: state.settings.company || '' };
    const text = vorgabeText(mahnStufe == null ? 'mailRechnung' : 'mailMahnung', vars);
    $('#toast').hidden = true;
    // Das PDF landet beim Senden auch unter „Dokumente“ im Projekt (core.js legt es beim gerade offenen Projekt ab).
    // Aus dem Reiter Rechnungen ist kein Projekt offen: kurz dieses Projekt setzen, danach zurück.
    const vorher = state.wohnung, fremd = w && vorher?.id !== w.id;
    if (fremd) state.wohnung = w;
    try {
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name, text }); return true; } catch (e) { if (e.name === 'AbortError') return false; } }
    } finally { if (fremd) state.wohnung = vorher; }
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
      ? [['Rechnung Nr.', r.nr], ...(r.art === 'storno' ? [['Storno zu Nr.', `${r.bezugNr} vom ${tag(r.bezugDatum)}`]] : []), ...(kd?.nr ? [['Kunden-Nr.', kd.nr]] : []), ...(w?.nr ? [['Projekt-Nr.', w.nr]] : []), ['Rechnungsdatum', tag(r.datum)], ['Leistungszeitraum', r.zeitraum || tag(r.datum)], ...(r.faellig ? [['Zahlbar bis', tag(r.faellig)]] : [])]
      : [['Datum', tag(heute())], ['Rechnung Nr.', r.nr], ['vom', tag(r.datum)], ...(kd?.nr ? [['Kunden-Nr.', kd.nr]] : [])];
    let my = 52;
    for (const [k, v] of meta) { doc.setTextColor(120); t(k, 128, my); doc.setTextColor(30); const lines = doc.splitTextToSize(String(v), R - 160); t(lines, 160, my); my += 4.6 * lines.length; }
    y = Math.max(92, my + 8);
    const neueSeite = async () => { doc.addPage(); await kopf(false); y = 34; };
    const platz = async (h, f) => { if (y + h > H - 28) { await neueSeite(); f?.(); } };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY);
    const ueber = mahnStufe == null ? (r.art === 'storno' ? `Stornorechnung zur ${r.bezugArt} Nr. ${r.bezugNr}` : `${artName(r)}: ${r.titel}`) : `${MAHN[mahnStufe]} zur Rechnung Nr. ${r.nr}`;
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
      await absatz(vorgabeText(r.art === 'storno' ? 'textStorno' : r.art === 'schluss' ? 'textRechnungSchluss' : 'textRechnungAbschlag', { prozent: String(r.prozent).replace('.', ','), nr: r.art === 'storno' ? r.bezugNr : r.nr, art: r.bezugArt || artName(r), datum: tag(r.bezugDatum || r.datum) }));
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
      } else if (r.art === 'storno') {
        tabKopf(); doc.setFontSize(9);
        t('1', C.pos + 3, y, { align: 'center' });
        t(doc.splitTextToSize(`Storno der ${r.bezugArt} Nr. ${r.bezugNr} vom ${tag(r.bezugDatum)} (${r.titel})`, C.menge - C.txt - 14), C.txt, y);
        t('1', C.menge, y, { align: 'right' }); t('pauschal', C.einh, y); t(eur(r.netto), C.ep, y, { align: 'right' }); t(eur(r.netto), C.gp, y, { align: 'right' });
        y += 8; doc.setDrawColor(230); doc.line(M - 1, y - 3.2, R + 1, y - 3.2);
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
      if (r.art !== 'storno') for (const a of r.abzuege || []) sumZ(`abzüglich Abschlagsrechnung ${a.nr} vom ${tag(a.datum)}`, '- ' + eur(a.brutto));
      if (r.abzuege?.length && r.art !== 'storno') { doc.line(C.txt, y - 3.8, R, y - 3.8); doc.setTextColor(...NAVY); sumZ('Noch zu zahlen', eur(zahlbetrag(r)), true); doc.setTextColor(30); }
      if (r.art === 'schluss' && r.lohn) { doc.setFontSize(8.5); doc.setTextColor(90); sumZ('Darin enthaltener Lohnanteil brutto (§ 35a EStG)', eur(r.lohn)); doc.setTextColor(30); }
      y += 4; doc.setFontSize(10);
      if (r.art !== 'storno') await absatz(vorgabeText('textZahlung', { betrag: eur(zahlbetrag(r)), faellig: tag(r.faellig), nr: r.nr }));
      // Hinweis zur Aufbewahrung: Pflicht auf jeder Rechnung über Bauleistungen an Privatkunden (§ 14 Abs. 4 Nr. 9 UStG), nicht bei Hausverwaltungen
      if (r.art !== 'storno' && !(kd && Kunden.istHv(kd)) && vorgabe('textAufbewahrung')) await absatz(vorgabeText('textAufbewahrung'));
    }
    await platz(34); y += 2;
    if (window.Unterschrift) y = await Unterschrift.pdf(doc, M, y, { firma: E.firma });
    else { doc.setFontSize(10); doc.setTextColor(30); t(vorgabeText('textGruss'), M, y); y += 5; t(E.firma, M, y); }
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
    const name = (r) => { const x = idx.find((y) => y.id === r.projektId); return x ? [Kunden.name(Kunden.byId(x.kundeId)) || x.customer, x.titel || x.room || 'Projekt'].filter(Boolean).join(' · ') : 'Projekt gelöscht'; };
    const offen = liste().filter(istOffen).sort((a, b) => (a.faellig || '').localeCompare(b.faellig || ''));
    return { offen, name, html: offen.map((r) => zeile(r).replace('<b>', `<b>${esc(name(r))} · `)).join('') };
  }

  return { laden, liste, fuerProjekt, projektAbschnitt, uebersicht, detail, auftrag, zahlbetrag, ueberfaellig, istOffen, gilt, neu, nachtrag, zeile, _intern: { pdf, stand } };
})();
