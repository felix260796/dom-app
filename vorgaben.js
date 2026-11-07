'use strict';
/* DOM – Vorgaben: alle Annahmen der App an einer Stelle, in den Einstellungen änderbar.
 * Jede Vorgabe hat einen Standardwert. Geänderte Werte liegen in state.settings.vorgaben (wird per Cloud abgeglichen).
 * vorgabe(k) liefert den Wert, vorgabeText(k, { nr, betrag, … }) setzt Platzhalter wie {nr} ein.
 * Seiten: 'rechnungen' (Rechnungen & Mahnungen), 'ablauf' (Abläufe & Listen) und in 'preise' Aufschläge, Angebotstexte,
 * Firmendaten und die Preisliste selbst (gespeichert in 'preisliste').
 * Wird vor allen Bereichen geladen; nutzt app.js-Helfer erst zur Laufzeit. */
const VORGABEN = {
  rechnungen: [
    ['Zahlung', [
      { k: 'zahlungsziel', l: 'Zahlungsziel in Tagen', t: 'zahl', d: 14 },
      { k: 'abschlagPlan', l: 'Abschläge in % (der letzte Teil kommt mit der Schlussrechnung)', t: 'plan', d: [30, 40, 30], h: 'Je Projekt kannst du im Projekt einen eigenen Plan eintragen.' },
      { k: 'mahnFrist', l: 'Neue Frist bei Erinnerung und Mahnung in Tagen', t: 'zahl', d: 7 },
    ]],
    ['Texte auf der Rechnung', [
      { k: 'textRechnungAbschlag', l: 'Einleitung Abschlagsrechnung', t: 'text', d: 'vielen Dank für Ihren Auftrag. Vereinbarungsgemäß berechnen wir Ihnen eine Abschlagszahlung von {prozent} % der Auftragssumme.' },
      { k: 'textRechnungSchluss', l: 'Einleitung Schlussrechnung', t: 'text', d: 'vielen Dank für Ihren Auftrag. Für die ausgeführten Leistungen berechnen wir Ihnen:' },
      { k: 'textZahlung', l: 'Zahlungsaufforderung', t: 'text', d: 'Bitte überweisen Sie den Betrag von {betrag} bis zum {faellig} unter Angabe der Rechnungsnummer {nr}.' },
      { k: 'textAufbewahrung', l: 'Hinweis auf der Schlussrechnung', t: 'text', d: 'Bitte bewahren Sie diese Rechnung zwei Jahre auf (§ 14b UStG).' },
      { k: 'textGruss', l: 'Grußformel', t: 'zeile', d: 'Mit freundlichen Grüßen' },
    ]],
    ['Zahlungserinnerung und Mahnungen', [
      { k: 'textErinnerung', l: 'Zahlungserinnerung', t: 'text', d: 'sicher ist es Ihrer Aufmerksamkeit entgangen: Für unsere {art} Nr. {nr} vom {datum}, fällig am {faellig}, konnten wir bisher keinen Zahlungseingang feststellen.' },
      { k: 'textMahnung1', l: '1. Mahnung', t: 'text', d: 'trotz unserer Zahlungserinnerung vom {vorher} ist der Betrag für unsere {art} Nr. {nr} vom {datum} noch offen.' },
      { k: 'textMahnung2', l: '2. Mahnung', t: 'text', d: 'trotz unserer 1. Mahnung vom {vorher} ist der Betrag für unsere {art} Nr. {nr} vom {datum} weiterhin offen. Wir bitten Sie dringend um Zahlung.' },
      { k: 'textMahnFrist', l: 'Zahlungsaufforderung in Erinnerung und Mahnung', t: 'text', d: 'Bitte überweisen Sie den offenen Betrag von {betrag} bis zum {frist}.' },
      { k: 'textMahnSchluss', l: 'Schlusssatz', t: 'text', d: 'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.' },
    ]],
    ['Begleittext beim Senden (Mail, WhatsApp)', [
      { k: 'mailAngebot', l: 'Angebot', t: 'text', d: '{anrede}\n\nvielen Dank für das angenehme Gespräch. Anbei erhalten Sie unser Angebot Nr. {nr}. Bei Fragen melden Sie sich gerne.\n\nFreundliche Grüße\n{firma}' },
      { k: 'mailRechnung', l: 'Rechnung', t: 'text', d: '{anrede}\n\nanbei erhalten Sie unsere {art} Nr. {nr} über {betrag}. Bitte überweisen Sie den Betrag bis zum {faellig}.\n\nVielen Dank und freundliche Grüße\n{firma}' },
      { k: 'mailMahnung', l: 'Erinnerung und Mahnung', t: 'text', d: '{anrede}\n\nzu unserer Rechnung Nr. {nr} vom {datum} konnten wir noch keinen Zahlungseingang feststellen. Anbei unsere {stufe}.\n\nFreundliche Grüße\n{firma}' },
    ]],
  ],
  push: [
    ['Morgenübersicht', [
      { k: 'pushMorgen', l: 'Uhrzeit der Morgenübersicht (leer = aus)', t: 'zeile', d: '07:00', h: 'Zum Beispiel 07:00. Die Mitteilung zeigt, was heute ansteht, wie die Seite „Heute“.' },
      { k: 'pushNachfassen', l: 'Angebote zum Nachfassen erwähnen', t: 'janein', d: 'ja' },
      { k: 'pushGeld', l: 'Überfällige und fällige Rechnungen erwähnen', t: 'janein', d: 'ja' },
      { k: 'pushBaustelle', l: 'Lieferungen, Mängel und Baustarts erwähnen', t: 'janein', d: 'ja' },
    ]],
    ['Termine', [
      { k: 'pushTermin', l: 'Erinnerung so viele Minuten vor jedem Termin (0 = aus)', t: 'zahl', d: 60, h: 'Es zählen die Termine der Person, der dieses Gerät gehört (unten im Menü einstellbar).' },
    ]],
    ['App-Symbol', [
      { k: 'appBadge', l: 'Zahl der offenen Punkte am App-Symbol zeigen', t: 'janein', d: 'ja' },
    ]],
  ],
  ablauf: [
    ['Angebote', [
      { k: 'nachfassenTage', l: 'Hinweis „Nachfassen“ nach wie vielen Tagen?', t: 'zahl', d: 7 },
      { k: 'absageGruende', l: 'Gründe für eine Absage (eine Zeile je Grund)', t: 'liste', d: ['Zu teuer', 'Anderer Anbieter', 'Macht es selbst', 'Kein Bedarf mehr', 'Zeitpunkt passt nicht', 'Keine Rückmeldung', 'Sonstiges'] },
    ]],
    ['Unterlagen (Menü): Firmenordner und Vorlagen', [
      { k: 'firmaDokArten', l: 'Arten von Firmendokumenten (eine Zeile je Art)', t: 'liste', d: ['Gewerbeanmeldung', 'Handelsregisterauszug', 'Betriebshaftpflicht', 'Freistellungsbescheinigung (§ 48b)', 'Unbedenklichkeitsbescheinigung Finanzamt', 'Unbedenklichkeitsbescheinigung Krankenkasse', 'Berufsgenossenschaft', 'Gesellschaftsvertrag', 'Sonstiges'] },
      { k: 'vorlageArten', l: 'Arten von Vorlagen (eine Zeile je Art)', t: 'liste', d: ['Abnahmeprotokoll', 'Regiebericht', 'Mängelanzeige', 'Bauzeitenplan', 'Checkliste Baustelle', 'Auftragsbestätigung', 'Sonstiges'] },
      { k: 'firmaDokWarnTage', l: 'Auf „Heute“ warnen, so viele Tage bevor ein Dokument abläuft', t: 'zahl', d: 30 },
    ]],
    ['Kunden', [
      { k: 'kundenQuellen', l: 'Wie kommen Kunden zu uns? (eine Zeile je Quelle)', t: 'liste', d: ['Empfehlung', 'Google / Internet', 'Bauschild', 'Hausverwaltung', 'Stammkunde', 'Flyer / Anzeige', 'Sonstiges'] },
    ]],
    ['Kalkulation', [
      { k: 'ampelGut', l: 'Marge grün ab %', t: 'zahl', d: 20 },
      { k: 'ampelKnapp', l: 'Marge gelb ab % (darunter rot)', t: 'zahl', d: 10 },
      { k: 'gewerkeExtra', l: 'Zusätzliche Gewerke für Eingangsrechnungen (neben denen der Preisliste)', t: 'liste', d: ['Material', 'Entsorgung', 'Sonstiges'] },
    ]],
    ['Startseite „Heute“', [
      { k: 'heuteStart', l: 'Beim Öffnen der App mit „Heute“ starten', t: 'janein', d: 'ja', h: 'Sonst startet die App bei den Kunden. „Heute“ erreichst du immer über das Menü (DOM-Logo oben).' },
      { k: 'heuteVorlauf', l: 'Fälliges so viele Tage vorher zeigen', t: 'zahl', d: 3 },
    ]],
    ['Per Sprache anlegen (Mikrofon oben)', [
      { k: 'spracheDauer', l: 'Termin dauert so viele Minuten, wenn keine Endzeit gesagt wird', t: 'zahl', d: 60 },
      { k: 'spracheProjekt', l: 'Bei Kundenterminen gleich ein Projekt „Besichtigung“ vorschlagen', t: 'janein', d: 'ja' },
    ]],
    ['Baustelle', [
      { k: 'textAbnahme', l: 'Text im Abnahmeprotokoll', t: 'text', d: 'Die oben genannten Leistungen wurden am {datum} gemeinsam begangen und {ergebnis} abgenommen. Mit der Abnahme beginnt die Gewährleistungsfrist. Aufgeführte Mängel beseitigt der Auftragnehmer innerhalb der genannten Fristen.' },
    ]],
  ],
};
const VORGABE_FELDER = Object.fromEntries(Object.values(VORGABEN).flatMap((g) => g.flatMap(([, f]) => f)).map((f) => [f.k, f]));
function vorgabe(k) {
  const v = state.settings.vorgaben?.[k];
  if (v !== undefined && v !== null && v !== '') return v;
  // ältere Speicherorte (vor den Vorgaben)
  if (k === 'zahlungsziel' && state.settings.zahlungsziel) return +state.settings.zahlungsziel;
  if (k === 'abschlagPlan' && state.settings.abschlagPlan?.length) return state.settings.abschlagPlan;
  return VORGABE_FELDER[k]?.d;
}
function vorgabeText(k, vars = {}) {
  return String(vorgabe(k) ?? '').replace(/\{(\w+)\}/g, (m, n) => (vars[n] !== undefined && vars[n] !== null ? String(vars[n]) : m));
}
/** „30 / 40 / 30“ → [30, 40, 30]; null, wenn es nicht 100 % ergibt. */
function planLesen(s) {
  const p = String(s).split(/[^\d,.]+/).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => x > 0);
  return p.length && Math.round(p.reduce((a, b) => a + b, 0)) === 100 ? p : null;
}

window.Vorgaben = (() => {
  const PLATZHALTER = {
    rechnungen: '{nr} Nummer, {art} Art der Rechnung, {betrag} Betrag, {datum} Rechnungsdatum, {faellig} fällig am, {frist} neue Frist, {prozent} Abschlag in %, {vorher} Datum der letzten Mahnung, {stufe} Erinnerung/Mahnung, {anrede} Briefanrede, {firma} Firmenname',
    ablauf: 'im Abnahmetext: {datum} Datum der Abnahme, {ergebnis} „ohne Mängel“ oder „mit den aufgeführten Mängeln“',
  };
  /** Einstellungsseite für eine Gruppe von Vorgaben. */
  // Zusätzlicher Bereich oben auf einer Seite (z. B. Mitteilungen: Gerät anmelden)
  const seiteKopf = { push: (el) => window.Push?.karte(el) };
  function seite(id, kopf = seiteKopf[id]) {
    const S = state.settings;
    S.vorgaben ??= {};
    const wert = (f) => { const v = vorgabe(f.k); return f.t === 'plan' ? v.join(' / ') : f.t === 'liste' ? v.join('\n') : v; };
    const feld = (f) => {
      const geaendert = S.vorgaben[f.k] !== undefined && S.vorgaben[f.k] !== '';
      const kopf = `<div class="vg-l"><label>${esc(f.l)}</label>${geaendert ? `<button type="button" class="vg-std" data-std="${f.k}">Standard</button>` : ''}</div>`;
      const inp = f.t === 'janein' ? `<select data-vg="${f.k}"><option value="ja" ${wert(f) === 'ja' ? 'selected' : ''}>Ja</option><option value="nein" ${wert(f) === 'nein' ? 'selected' : ''}>Nein</option></select>`
        : f.t === 'text' || f.t === 'liste' ? `<textarea data-vg="${f.k}" rows="${f.t === 'liste' ? Math.max(3, wert(f).split('\n').length) : 4}">${esc(wert(f))}</textarea>`
        : `<input type="text" data-vg="${f.k}" ${f.t === 'zahl' ? 'inputmode="decimal"' : ''} value="${esc(wert(f))}">`;
      return kopf + inp + (f.h ? `<p class="hint" style="margin:4px 0 0">${esc(f.h)}</p>` : '');
    };
    main().innerHTML = (kopf ? '<div id="vgKopf"></div>' : '') + VORGABEN[id].map(([titel, felder]) => `<div class="sec-h"><h2>${esc(titel)}</h2></div><div class="card kform vg">${felder.map(feld).join('')}</div>`).join('')
      + (PLATZHALTER[id] ? `<p class="hint">Platzhalter in Texten: ${esc(PLATZHALTER[id])}</p>` : '');
    if (kopf) kopf($('#vgKopf'));
    $$('[data-vg]').forEach((el) => (el.onchange = async () => {
      const f = VORGABE_FELDER[el.dataset.vg];
      let v = el.value;
      if (f.t === 'zahl') { v = parseFloat(v.replace(',', '.')); if (!Number.isFinite(v) || v < 0) return toast('Bitte eine Zahl eintragen.'); }
      if (f.t === 'plan') { v = planLesen(v); if (!v) return toast('Die Anteile müssen zusammen 100 % ergeben.', 4000); }
      if (f.t === 'liste') v = v.split('\n').map((x) => x.trim()).filter(Boolean);
      if (f.t === 'text' || f.t === 'zeile') v = v.trim();
      S.vorgaben[f.k] = v;
      await saveSettings(); toast('Gespeichert');
      window.Push?.abgleich();
      const y = window.scrollY; seite(id); window.scrollTo(0, y);
    }));
    $$('[data-std]').forEach((b) => (b.onclick = async () => {
      delete S.vorgaben[b.dataset.std];
      if (b.dataset.std === 'zahlungsziel') delete S.zahlungsziel;
      if (b.dataset.std === 'abschlagPlan') delete S.abschlagPlan;
      await saveSettings(); toast('Standard wiederhergestellt'); window.Push?.abgleich();
      const y = window.scrollY; seite(id); window.scrollTo(0, y);
    }));
  }

  // ---------- Preisliste & Angebot: Aufschläge, Texte, Firmendaten, Positionen ----------
  const PL_ZAHLEN = [['aufLohn', 'Aufschlag auf Lohn (Subunternehmer) in %', true], ['aufMat', 'Aufschlag auf Material in %', true], ['wagnis', 'Wagnis und Gewinn in %', true], ['mwst', 'Mehrwertsteuer in %', true], ['spanne', 'Spanne der Preisrichtung vor Ort ± %', true], ['gueltig', 'Angebot gültig (Tage)', false]];
  const PL_TEXTE = [['textLeistung', 'Ausführung und Leistungsumfang'], ['textBauseits', 'Bauseits zu stellen'], ['textZahlung', 'Zahlungsbedingungen'], ['textGewaehr', 'Gewährleistung'], ['textWiderruf', 'Widerruf'], ['textAuftrag', 'Auftragserteilung'], ['hinweise', 'Weitere Hinweise (eine Zeile je Hinweis)']];
  const PL_FIRMA = [['firma', 'Firmenname'], ['strasse', 'Straße'], ['ort', 'PLZ und Ort'], ['telefon', 'Telefon'], ['email', 'E-Mail'], ['ansprechpartner', 'Ansprechpartner'], ['ustid', 'USt-IdNr.'], ['sitz', 'Sitz'], ['hrb', 'Handelsregister'], ['gf', 'Geschäftsführer'], ['bank', 'Bankverbindung']];
  async function preisKarten(box) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    const sichern = async () => { await kvSet('preisliste', PL); toast('Gespeichert'); };
    box.innerHTML = `
      <div class="sec-h"><h2>Aufschläge</h2></div>
      <div class="card kform vg">${PL_ZAHLEN.map(([k, l, pr]) => `<label>${esc(l)}</label><input type="text" inputmode="decimal" data-ple="${k}" data-pr="${pr ? 1 : 0}" value="${esc(String(pr ? Math.round((E[k] || 0) * 1000) / 10 : E[k] ?? '').replace('.', ','))}">`).join('')}
        <p class="hint" style="margin:6px 0 0">Gilt für alle neuen Berechnungen. Im einzelnen Angebot kannst du unter „Nachkalkulation“ abweichen.</p></div>
      <div class="sec-h"><h2>Texte im Angebot</h2></div>
      <div class="card kform vg">${PL_TEXTE.map(([k, l]) => `<label>${esc(l)}</label><textarea data-plt="${k}" rows="3">${esc(Array.isArray(E[k]) ? E[k].join('\n') : E[k] || '')}</textarea>`).join('')}</div>
      `;
    $$('[data-ple]', box).forEach((el) => (el.onchange = async () => { const v = parseFloat(el.value.replace(',', '.')); if (!Number.isFinite(v)) return toast('Bitte eine Zahl eintragen.'); E[el.dataset.ple] = el.dataset.pr === '1' ? v / 100 : v; await sichern(); }));
    $$('[data-plt]', box).forEach((el) => (el.onchange = async () => { const k = el.dataset.plt; E[k] = k === 'hinweise' ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value.trim(); await sichern(); }));
  }
  /** Firmendaten, die auf Angeboten, Rechnungen und Protokollen stehen (Teil der Preisliste). */
  async function firmaKarte(box) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    box.innerHTML = `<div class="sec-h"><h2>Auf Angebot, Rechnung und Protokoll</h2></div>
      <div class="card kform vg">${PL_FIRMA.map(([k, l]) => `<label>${esc(l)}</label><input type="text" data-plf="${k}" value="${esc(E[k] || '')}">`).join('')}</div>`;
    $$('[data-plf]', box).forEach((el) => (el.onchange = async () => { E[el.dataset.plf] = el.value.trim(); await kvSet('preisliste', PL); toast('Gespeichert'); }));
  }
  async function preisliste(filter) {
    const PL = await window.Angebot._intern.preisliste();
    const I = window.Angebot._intern;
    header('Preisliste', `${PL.positionen.length} Positionen`, { label: 'Einstellungen', fn: () => { viewEinstellungen(); window.scrollTo(0, 0); } });
    const q = filter.toLowerCase();
    const liste = PL.positionen.filter((x) => !q || `${x.nr} ${x.text} ${x.gewerk}`.toLowerCase().includes(q));
    const gew = [...new Set(liste.map((x) => x.gewerk))];
    main().innerHTML = `<input type="search" id="plQ" value="${esc(filter)}" placeholder="Suchen, z. B. Fliesen oder FL-02" style="margin-bottom:10px">
      ${gew.map((g) => `<div class="sec-h"><h2>${esc(g)}</h2></div><div class="plist">${liste.filter((x) => x.gewerk === g).map((x) => `<button class="pcard" data-pl="${esc(x.nr)}"><span class="pc-t"><b>${esc(x.text)}</b><span class="muted">${esc(x.nr)} · Lohn ${esc(String(x.lohn).replace('.', ','))} € · Material ${esc(String(x.mat).replace('.', ','))} €${x.auf !== null && x.auf !== undefined ? ` · eigener Aufschlag ${Math.round(x.auf * 100)} %` : ''}</span><span class="ang-sum">${I.ep(x).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € / ${esc(x.einheit)}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>`).join('')}
      <button class="add-room" id="plNeu" style="width:100%;margin-top:12px">${icon('plus')} Neue Position</button>`;
    $('#plQ').oninput = debounce((e) => { preisliste(e.target.value); setTimeout(() => { const i = $('#plQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 0); }, 400);
    $$('[data-pl]').forEach((b) => (b.onclick = () => position(PL.positionen.find((x) => x.nr === b.dataset.pl), filter)));
    $('#plNeu').onclick = () => position(null, filter);
    window.scrollTo(0, 0);
  }
  async function position(x, filter) {
    const PL = await window.Angebot._intern.preisliste();
    const neu = !x;
    const p = x ? { ...x } : { nr: '', gewerk: PL.positionen[0]?.gewerk || '', text: '', einheit: 'Stück', lohn: 0, mat: 0, auf: null };
    const gew = [...new Set(PL.positionen.map((y) => y.gewerk))];
    header(neu ? 'Neue Position' : p.nr, p.gewerk, { label: 'Preisliste', fn: () => preisliste(filter) });
    const z = (v) => String(v ?? '').replace('.', ',');
    main().innerHTML = `<div class="card kform">
        <div class="row"><div><label style="margin-top:0">Nummer</label><input type="text" id="poNr" value="${esc(p.nr)}" ${neu ? '' : 'disabled'} placeholder="z. B. FL-30"></div>
          <div><label style="margin-top:0">Einheit</label><input type="text" id="poEinh" value="${esc(p.einheit)}"></div></div>
        <label>Gewerk</label><select id="poGew">${gew.map((g) => `<option ${g === p.gewerk ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <label>Leistung</label><textarea id="poText">${esc(p.text)}</textarea>
        <div class="row"><div><label>Lohn netto je Einheit</label><input type="text" inputmode="decimal" id="poLohn" value="${z(p.lohn)}"></div>
          <div><label>Material netto je Einheit</label><input type="text" inputmode="decimal" id="poMat" value="${z(p.mat)}"></div></div>
        <label>Eigener Aufschlag in % (leer = Standard)</label><input type="text" inputmode="decimal" id="poAuf" value="${p.auf !== null && p.auf !== undefined ? z(Math.round(p.auf * 1000) / 10) : ''}">
        <p class="hint" id="poEp" style="margin:6px 0 0"></p>
      </div>
      <button class="btn big block" id="poOk">${icon('check')} Speichern</button>
      ${neu ? '' : `<button class="link-danger" id="poDel">${icon('trash')} Position löschen</button>`}`;
    const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const lesen = () => { p.nr = $('#poNr').value.trim(); p.einheit = $('#poEinh').value.trim(); p.gewerk = $('#poGew').value; p.text = $('#poText').value.trim(); p.lohn = num($('#poLohn').value); p.mat = num($('#poMat').value); p.auf = $('#poAuf').value.trim() === '' ? null : num($('#poAuf').value) / 100; };
    const zeig = () => { lesen(); $('#poEp').textContent = `Preis für den Kunden: ${window.Angebot._intern.ep(p).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € netto je ${p.einheit}`; };
    ['#poLohn', '#poMat', '#poAuf'].forEach((s) => ($(s).oninput = zeig)); zeig();
    $('#poOk').onclick = async () => {
      lesen();
      if (!p.nr || !p.text) return toast('Nummer und Leistung eintragen.');
      if (neu && PL.positionen.some((y) => y.nr === p.nr)) return toast('Diese Nummer gibt es schon.');
      const i = PL.positionen.findIndex((y) => y.nr === p.nr);
      if (i >= 0) PL.positionen[i] = { ...PL.positionen[i], ...p }; else PL.positionen.push({ ...p, status: 'eigen' });
      await kvSet('preisliste', PL); toast('Gespeichert'); preisliste(filter);
    };
    if ($('#poDel')) $('#poDel').onclick = async () => {
      if (!confirm(`Position ${p.nr} löschen? Bestehende Angebote mit dieser Position verlieren die Zeile.`)) return;
      PL.positionen = PL.positionen.filter((y) => y.nr !== p.nr); await kvSet('preisliste', PL); preisliste(filter);
    };
    window.scrollTo(0, 0);
  }

  /** Suchindex über alle Einstellungen: [seite, Feldname, Stichworte, Feld-Kennung]. */
  function index() {
    const out = [];
    for (const [seiteId, gruppen] of Object.entries(VORGABEN)) for (const [g, felder] of gruppen) for (const f of felder) out.push([seiteId, f.l, g, 'vg:' + f.k]);
    for (const [k, l] of PL_ZAHLEN) out.push(['kalkulation', l, 'Aufschlag Kalkulation Preis', 'ple:' + k]);
    for (const [k, l] of PL_TEXTE) out.push(['kalkulation', 'Angebotstext: ' + l, 'Angebot Text', 'plt:' + k]);
    for (const [k, l] of PL_FIRMA) out.push(['firma', l, 'Firmendaten Briefkopf Fußzeile Angebot Rechnung', 'plf:' + k]);
    const fest = [
      ['firma', 'Firmenname und Logo', 'Logo Briefkopf'],
      ['preisliste', 'Preise einzelner Positionen', 'Lohn Material Einheitspreis Position neu löschen'],
      ['pakete', 'Excel-Angebotstool laden', 'Import Excel Preisliste zurücksetzen'],
      ['pakete', 'Was gehört in welches Paket?', 'Paket Vorlagen Basic Standard Premium Positionen'],
      ['moodboards', 'Moodboards Basic, Standard, Premium', 'Bilder Produkte Ausstattung'],
      ['team', 'Texte der Terminmails', 'Mail Termin Bestätigung Kunde Subunternehmer Team'],
      ['team', 'Erinnerungen und Bestätigung an den Kunden', 'Erinnerung automatisch Schalter'],
      ['team', 'Team: Personen im Kalender', 'Felix Deniel Mitarbeiter'],
      ['bau', 'Vorlagen für den Baufortschritt', 'Arbeitsschritte abhaken Bad Küche'],
      ['ki', 'KI-Schlüssel und Modell', 'Gemini API Schlüssel'],
      ['cloud', 'Cloud-Abgleich anmelden', 'Supabase Konto Kollege'],
      ['sicherung', 'Datensicherung als Datei', 'Export Import Backup OneDrive'],
    ];
    for (const [s, l, w] of fest) out.push([s, l, w, '']);
    return out;
  }

  return { seite, preisKarten, firmaKarte, preisliste, index };
})();
