'use strict';
/* DOM – Einstellungen (im Menü hinter dem DOM-Logo): Liste der Seiten EINST und jede Seite einzeln.
 * Baut auf app.js (header, main, icon, sheet), core.js und moodboards.js auf. */

// ---------- Ansicht: Einstellungen ----------
// Übersicht in Gruppen. Jede Zeile sagt, was man dort einstellt. Oben eine Suche über alle Felder, dazu „KI fragen“.
// [id, Titel, Symbol, Farbe, Gruppe, was man dort einstellt]
const EINST = [
  ['firma', 'Firma & Logo', 'home', 'navy', 'Firma', 'Name, Logo, Anschrift, Bank, Steuernummer auf Angebot und Rechnung'],
  ['kundenEinst', 'Kunden', 'user', 'navy', 'Bereiche', 'Kundenquellen, Geburtstage'],
  ['partnerEinst', 'Partner', 'wrench', 'brass', 'Bereiche', 'Qualitätseinstufung, Gewerke für Eingangsrechnungen'],
  ['projektEinst', 'Projekte', 'home', 'grey', 'Bereiche', 'Projektnummer, Gesprächsarten, Nachfassen im Kalender, Baufortschritt'],
  ['preisliste', 'Preisliste', 'euro', 'navy', 'Angebote', 'Jede Position: Lohn, Material, eigener Aufschlag, neue Positionen'],
  ['kalkulation', 'Aufschläge & Angebotstexte', 'euro', 'brass', 'Angebote', 'Aufschläge auf Lohn und Material, Wagnis, MwSt., Gültigkeit, Textfelder vor und nach den Positionen'],
  ['pakete', 'Pakete & Excel-Import', 'clipboard', 'grey', 'Angebote', 'Was in Basic, Standard, Premium gehört, Excel-Angebotstool laden'],
  ['moodboards', 'Standard-Moodboards', 'palette', 'brass', 'Angebote', 'Bilder und Produkte je Raumtyp und Paket'],
  ['rechnungen', 'Rechnungen & Mahnungen', 'file', 'navy', 'Rechnungen', 'Zahlungsziel, Abschläge (30/40/30), Mahnfrist, alle Rechnungs- und Mahntexte, Begleittexte'],
  ['ablauf', 'Abläufe & Listen', 'check', 'brass', 'Abläufe', 'Nachfassen nach Tagen, Absagegründe, Kundenquellen, Marge-Ampel, Gewerke, Abnahmetext'],
  ['push', 'Mitteilungen aufs iPhone', 'bell', 'brass', 'Abläufe', 'Morgenübersicht mit Uhrzeit, Erinnerung vor Terminen, Zahl am App-Symbol'],
  ['team', 'Terminmails & Team', 'mail', 'navy', 'Abläufe', 'Personen, Terminmails an Team, Kunde und Subunternehmer, Texte, Erinnerungen'],
  ['bau', 'Baufortschritt', 'check', 'grey', 'Abläufe', 'Vorlagen der Arbeitsschritte je Raumtyp'],
  ['ki', 'KI', 'sparkle', 'navy', 'Technik', 'Schlüssel und Modell für Bilder und Texte'],
  ['cloud', 'Cloud-Abgleich', 'refresh', 'brass', 'Technik', 'Anmelden, Abgleich mit dem Kollegen'],
  ['sicherung', 'Datensicherung', 'download', 'grey', 'Technik', 'Excel-Sicherung aller Daten, Sicherung als Datei'],
];
const EINST_ALT = { preise: 'pakete' }; // alte Seitennamen
// Unterseiten, die nicht in der Liste stehen: id -> [Titel, Elternseite]
const EINST_UNTER = { prompts: ['KI › Prompts', 'ki'] };
function einstellungInfo(k) {
  const S = state.settings;
  if (k === 'firma') return [S.company, S.logo ? 'mit Logo' : 'ohne Logo'].filter(Boolean).join(' · ');
  if (k === 'ki') return S.apiKey ? `Eingerichtet · ${(S.modelList || []).find((m) => m.id === S.model)?.label || S.model}` : 'Noch nicht eingerichtet';
  if (k === 'team') return `${S.mailAktiv ? 'Terminmails an' : 'Terminmails aus'} · ${(window.Kalender?.team() || []).map((p) => p.name).join(', ')}`;
  if (k === 'cloud') return window.Sync?.active() ? 'Verbunden, gleicht automatisch ab' : 'Nicht verbunden';
  if (k === 'push') return vorgabe('pushMorgen') ? `Morgenübersicht ${vorgabe('pushMorgen')} Uhr` : 'Morgenübersicht aus';
  if (k === 'rechnungen') return `Zahlungsziel ${vorgabe('zahlungsziel')} Tage · Abschläge ${vorgabe('abschlagPlan').join(' / ')} %`;
  return '';
}
function viewEinstellungen(suche = '') {
  state.editPkg = null;
  const v = window.__vorEinst || { tab: 'kunden', s: {} };
  header('Einstellungen', state.settings.company || '', { label: 'Zurück', fn: () => switchTab(v.tab, v.s) });
  const warn = (k) => (k === 'ki' && !state.settings.apiKey) || (k === 'cloud' && !window.Sync?.active());
  const gruppen = [...new Set(EINST.map((e) => e[4]))];
  main().innerHTML = `<div class="einst-such"><input type="search" id="eQ" value="${esc(suche)}" placeholder="Suchen, z. B. Mahnung, Aufschlag, Logo" autocomplete="off"></div>
    <div id="eTreffer"></div>
    <div id="eListe">${gruppen.map((g) => `<div class="sec-h"><h2>${esc(g)}</h2></div><div class="docs">${EINST.filter((e) => e[4] === g).map(([k, t, ic, col, , was]) => `
      <button class="doc" data-einst="${k}"><span class="d-ico ${col}">${icon(ic)}</span>
        <span class="d-t"><b>${esc(t)}</b><span class="${warn(k) ? 'warn' : ''}">${esc(einstellungInfo(k) ? einstellungInfo(k) : was)}</span>${einstellungInfo(k) ? `<span class="muted e-was">${esc(was)}</span>` : ''}</span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>`).join('')}</div>
    <p class="hint center" style="margin-top:18px">App-Version ${APP_VERSION} · <a href="diag.html">Bildschirm-Test</a></p>`;
  $$('[data-einst]').forEach((b) => (b.onclick = () => { einstellungSeite(b.dataset.einst); window.scrollTo(0, 0); }));
  const suchen = () => {
    const q = $('#eQ').value.trim().toLowerCase();
    $('#eListe').hidden = !!q;
    if (!q) { $('#eTreffer').innerHTML = ''; return; }
    const worte = q.split(/\s+/);
    const titel = (k) => EINST.find((e) => e[0] === k)?.[1] || EINST_UNTER[k]?.[0] || k;
    const alle = [...Vorgaben.index(), ...EINST.map(([k, t, , , g, was]) => [k, t, `${g} ${was}`, ''])];
    // zuerst im Feldnamen suchen, dann in Stichworten, zuletzt im Seitennamen
    const passt = (text) => (e) => worte.every((x) => text(e).toLowerCase().includes(x));
    let treffer = alle.filter(passt(([, l]) => l));
    if (treffer.length < 3) treffer = [...new Set([...treffer, ...alle.filter(passt(([, l, w]) => `${l} ${w}`))])];
    if (!treffer.length) treffer = alle.filter(passt(([s, l, w]) => `${l} ${w} ${titel(s)}`));
    treffer = treffer.slice(0, 25);
    $('#eTreffer').innerHTML = `<div class="docs">${treffer.map(([s, l, , feld]) => `<button class="doc" data-ziel="${s}" data-feld="${esc(feld)}"><span class="d-t"><b>${esc(l)}</b><span>${esc(titel(s))}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>
      ${treffer.length ? '' : '<p class="hint">Nichts gefunden.</p>'}
      ${state.settings.apiKey ? `<button class="notice plain" id="eFrage">${icon('sparkle')}<span><b>KI fragen:</b> „${esc($('#eQ').value.trim())}“</span>${icon('chevron')}</button><div id="eAntwort"></div>` : ''}`;
    $$('[data-ziel]').forEach((b) => (b.onclick = () => zuFeld(b.dataset.ziel, b.dataset.feld)));
    if ($('#eFrage')) $('#eFrage').onclick = () => einstellungFrage($('#eQ').value.trim());
  };
  $('#eQ').oninput = debounce(suchen, 200);
  if (suche) suchen();
}
/** Seite öffnen und zum gesuchten Feld springen, kurz hervorheben. */
async function zuFeld(seite, feld) {
  await einstellungSeite(seite);
  if (!feld) return window.scrollTo(0, 0);
  const [art, k] = feld.split(':');
  const sel = { vg: `[data-vg="${k}"]`, ple: `[data-ple="${k}"]`, plt: `[data-plt="${k}"]`, plf: `[data-plf="${k}"]` }[art];
  for (let i = 0; i < 20; i++) { const el = sel && document.querySelector(sel); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('vg-hl'); setTimeout(() => el.classList.remove('vg-hl'), 2400); return; } await new Promise((r) => setTimeout(r, 100)); }
}
/** Frage in eigenen Worten: Die KI sucht die passenden Einstellungen heraus und erklärt kurz. */
async function einstellungFrage(frage) {
  const box = $('#eAntwort'); if (!box) return;
  box.innerHTML = '<p class="hint">KI sucht …</p>';
  const idx = Vorgaben.index().map(([s, l, w, f], i) => `${i} | ${EINST.find((e) => e[0] === s)?.[1] || s} | ${l} | ${w}`).join('\n');
  try {
    const txt = await geminiText([{ text: `Du hilfst in einer Handwerker-App (Sanierung). Der Nutzer fragt: „${frage}“.\nHier alle Einstellungen (nr | Seite | Feld | Stichworte):\n${idx}\n\nAntworte kurz auf Deutsch, du-Form, ohne Emojis. antwort = 1–2 Sätze, wo und wie er es einstellt (oder dass es das nicht gibt). treffer = Nummern der passenden Einstellungen (höchstens 4).` }], true, {
      responseSchema: { type: 'OBJECT', properties: { antwort: { type: 'STRING' }, treffer: { type: 'ARRAY', items: { type: 'INTEGER' } } } } });
    const j = JSON.parse(txt), I = Vorgaben.index();
    box.innerHTML = `<div class="card"><p style="margin:0">${esc(j.antwort || '')}</p></div><div class="docs">${(j.treffer || []).map((n) => I[n]).filter(Boolean).map(([s, l, , feld]) => `<button class="doc" data-ziel="${s}" data-feld="${esc(feld)}"><span class="d-t"><b>${esc(l)}</b><span>${esc(EINST.find((e) => e[0] === s)?.[1] || EINST_UNTER[s]?.[0] || s)}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>`;
    $$('[data-ziel]', box).forEach((b) => (b.onclick = () => zuFeld(b.dataset.ziel, b.dataset.feld)));
  } catch (e) { box.innerHTML = `<p class="hint">Die KI konnte nicht antworten (${esc(e.message)}).</p>`; }
}
/** Beispiel einer Terminmail für einen Empfänger (r = team | kunde | partner). Gleicher Aufbau wie in supabase/functions/termin-mail. */
function mailVorschau(r, satz) {
  const firma = state.settings.company || 'DOM Projektmanagement';
  const z = (l, v) => (v ? `<tr><td style="padding:5px 12px 5px 0;color:#6b7380;vertical-align:top">${l}</td><td style="padding:5px 0;font-weight:600">${esc(v)}</td></tr>` : '');
  const wer = (window.Kalender?.team() || []).map((p) => p.name).join(', ');
  const zeilen = r === 'team'
    ? z('Anlass', 'Aufmaß Bad') + z('Wann', 'Freitag, 13. November 2026, 14:00 Uhr bis 15:00 Uhr') + z('Wo', 'Musterstraße 1, 70173 Stuttgart') + z('Kunde', 'Familie Müller · 0711 123456') + z('Objekt', 'Haus') + z('Projekt', 'Badumbau · Nr. 1001-01') + z('Subunternehmer', 'Fliesen Kaya GmbH · Mehmet Kaya') + z('Dabei', wer) + z('Notiz', 'Fliesenmuster mitbringen')
    : r === 'kunde'
      ? z('Anlass', 'Aufmaß Bad') + z('Wann', 'Freitag, 13. November 2026, 14:00 Uhr bis 15:00 Uhr') + z('Wo', 'Musterstraße 1, 70173 Stuttgart') + z('Von uns kommt', wer)
      : z('Anlass', 'Aufmaß Bad') + z('Wann', 'Freitag, 13. November 2026, 14:00 Uhr bis 15:00 Uhr') + z('Adresse', 'Musterstraße 1, 70173 Stuttgart') + z('Projekt', 'Badumbau · Nr. 1001-01') + z('Kunde', 'Familie Müller') + z('Termin mit', `${firma} (${wer})`);
  const anrede = r === 'team' ? 'Hallo Felix,' : r === 'kunde' ? 'Sehr geehrte Familie Müller,' : 'Hallo Mehmet Kaya,';
  const html = `<div style="background:#1e3550;color:#fff;border-radius:14px 14px 0 0;padding:14px 16px"><div style="font-size:12px;opacity:.75">${esc(firma)}</div><div style="font-size:19px;font-weight:700;margin-top:3px">Terminbestätigung</div></div>
    <div style="background:#fff;border-radius:0 0 14px 14px;padding:14px 16px;color:#1b2533"><p style="margin:0 0 4px">${esc(anrede)}</p><p style="margin:0 0 12px">${esc(satz)}</p><table style="border-collapse:collapse;font-size:14.5px">${zeilen}</table>
    ${r === 'team' ? '' : `<p style="margin:14px 0 0">Viele Grüße<br>${esc(firma)}</p>`}</div>`;
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" style="background:#f3f1ec"><div class="sheet-h"><b>Beispiel: Mail an ${r === 'team' ? 'euch' : r === 'kunde' ? 'den Kunden' : 'den Subunternehmer'}</b></div><div style="padding:4px 4px 12px">${html}</div><button class="btn block" data-zu>Schließen</button></div>`;
  document.body.appendChild(bg);
  requestAnimationFrame(() => bg.classList.add('on'));
  const zu = () => bg.remove();
  bg.onclick = (e) => { if (e.target === bg || e.target.closest('[data-zu]')) zu(); };
}
async function einstellungSeite(k) {
  k = EINST_ALT[k] || k;
  if (k === 'moodboards') { state.editPkg = null; return viewPakete(); }
  if (k === 'preisliste') return Vorgaben.preisliste('');
  const S = state.settings;
  if (EINST_UNTER[k]) {
    const [t, eltern] = EINST_UNTER[k];
    header(t, '', { label: 'Zurück', fn: () => { einstellungSeite(eltern); window.scrollTo(0, 0); } });
    return Vorgaben.seite(k);
  }
  const [, titel] = EINST.find((x) => x[0] === k) || [];
  header(titel || 'Einstellungen', '', { label: 'Einstellungen', fn: () => { viewEinstellungen(); window.scrollTo(0, 0); } });
  const save = debounce(saveSettings, 300);
  if (k === 'bau') return Fortschritt.einstellungen();
  if (VORGABEN[k]) return Vorgaben.seite(k);
  if (k === 'kalkulation') { main().innerHTML = '<div id="plKarten"></div>'; return Vorgaben.preisKarten($('#plKarten')); }
  if (k === 'team') {
    // Personen für den Kalender (Termine je Person, oben im Kalender umschaltbar)
    if (!Array.isArray(S.team) || !S.team.length) S.team = JSON.parse(JSON.stringify(Kalender.team()));
    const render = () => {
      const T = Kalender.mailTexte();
      const ROLLEN = [
        ['team', 'Ihr (Team)', 'Alle Angaben: Anlass, Zeit, Ort, Kunde mit Telefon, Objekt, Projekt, Subunternehmer, wer dabei ist, Notiz.'],
        ['kunde', 'Kunde', 'Nur Anlass, Zeit, Ort und wer von uns kommt. Kein Hinweis auf den Subunternehmer, keine interne Notiz.'],
        ['partner', 'Subunternehmer', 'Anlass, Zeit, Adresse, Projekt und Kundenname, dazu dass der Termin mit DOM ist und wer von uns dabei ist. Keine Kundentelefonnummer, keine interne Notiz.'],
      ];
      main().innerHTML = `<div class="sec-h" style="margin-top:4px"><h2>Team</h2></div>
        <p class="hint" style="margin-top:-4px">Im Kalender kannst du oben zwischen den Personen umschalten. Die E-Mail-Adressen werden für die Terminmails gebraucht.</p>
        ${S.team.map((p, i) => `<div class="card kform" data-tp="${i}">
          <label style="margin-top:0">Name</label><input type="text" data-tf="name" value="${esc(p.name)}" autocomplete="off" placeholder="Vor- und Nachname">
          <label>E-Mail</label><input type="email" data-tf="email" value="${esc(p.email || '')}" autocomplete="off" inputmode="email" placeholder="name@firma.de">
          ${S.team.length > 1 ? `<button class="link-danger" data-tdel style="margin-top:10px">${icon('trash')} Entfernen</button>` : ''}</div>`).join('')}
        <button class="add-room" id="tpAdd">${icon('plus')} Person hinzufügen</button>
        <div class="sec-h"><h2>Terminmails</h2></div>
        <div class="card kform">
          <p class="muted" style="margin-top:0">Beim Speichern eines Termins bekommen die Beteiligten eine Bestätigung mit Ort, Zeit und Anlass, vor dem Termin eine Erinnerung. Einmalig in Supabase einzurichten: <a href="https://github.com/felix260796/dom-app/blob/main/TERMINMAILS_EINRICHTEN.md" target="_blank" rel="noopener">Anleitung öffnen</a>.</p>
          <p><b>${S.mailAktiv ? 'Eingerichtet' : 'Noch nicht eingerichtet'}</b>${window.Sync?.active() ? '' : ' · zuerst den Cloud-Abgleich verbinden'}</p>
          <label class="toggle" style="margin-top:12px"><input type="checkbox" id="mkAuto" ${S.mailKundeAuto !== false ? 'checked' : ''}><span class="tg"></span><span>Kunde bekommt bei neuen Terminen eine Bestätigung</span></label>
          <label class="toggle"><input type="checkbox" id="erAuto" ${S.erinnerungAuto !== false ? 'checked' : ''}><span class="tg"></span><span>Erinnerungen automatisch verschicken</span></label>
          <p class="hint" style="margin:2px 0 0">Beides ist nur die Voreinstellung. Beim einzelnen Termin kannst du es trotzdem an- oder abwählen.</p>
          <div id="erinBox" ${S.erinnerungAuto === false ? 'hidden' : ''}><label>Erinnerung standardmäßig</label>
          <select id="erinT">${[[0, 'keine'], [1, '1 Tag vorher'], [2, '2 Tage vorher'], [3, '3 Tage vorher'], [7, '1 Woche vorher']].map(([v, n]) => `<option value="${v}" ${(S.erinnerungTage ?? 1) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <button class="btn secondary block" id="mailTest" style="margin-top:12px" ${window.Sync?.active() ? '' : 'disabled'}>${icon('mail')} Test-Mail an das Team senden</button>
          ${S.mailAktiv ? '<button class="link-danger" id="mailAus" style="margin-top:6px">Terminmails ausschalten</button>' : ''}
        </div>
        <div class="sec-h"><h2>Wer bekommt was?</h2></div>
        <p class="hint" style="margin-top:-4px">Jeder bekommt seine eigene Mail. Die Anrede setzt die App automatisch ein, z. B. „Sehr geehrte Familie Müller,“ aus der Kundenkarte oder „Hallo Mehmet Kaya,“ beim Subunternehmer. Den Satz danach kannst du je Empfänger ändern. Leer lassen heißt Standardtext.</p>
        ${ROLLEN.map(([r, n, was]) => `<div class="card kform mvorl" data-mr="${r}">
          <div class="hv-h" style="margin-top:0">${icon(r === 'team' ? 'users' : r === 'kunde' ? 'user' : 'wrench')}<span>${n}</span></div>
          <p class="muted" style="margin:6px 0 0;font-size:14px">${was}</p>
          <label>Terminbestätigung</label><textarea data-mt="bestaetigung" rows="2" placeholder="${esc(Kalender.MAILTEXTE[r].bestaetigung)}">${esc(S.mailTexte?.[r]?.bestaetigung || '')}</textarea>
          <label>Erinnerung</label><textarea data-mt="erinnerung" rows="2" placeholder="${esc(Kalender.MAILTEXTE[r].erinnerung)}">${esc(S.mailTexte?.[r]?.erinnerung || '')}</textarea>
          <button class="btn secondary small" data-mvor style="margin-top:10px">${icon('eye')} Beispiel ansehen</button>
        </div>`).join('')}`;
      $$('[data-mr]').forEach((c) => {
        const r = c.dataset.mr;
        $$('[data-mt]', c).forEach((ta) => (ta.oninput = () => { S.mailTexte ??= {}; S.mailTexte[r] ??= {}; S.mailTexte[r][ta.dataset.mt] = ta.value; save(); }));
        $('[data-mvor]', c).onclick = () => mailVorschau(r, Kalender.mailTexte()[r].bestaetigung);
      });
      $('#erinT').onchange = (e) => { S.erinnerungTage = +e.target.value; save(); };
      $('#mkAuto').onchange = (e) => { S.mailKundeAuto = e.target.checked; save(); };
      $('#erAuto').onchange = (e) => { S.erinnerungAuto = e.target.checked; $('#erinBox').hidden = !e.target.checked; save(); };
      $('#mailTest').onclick = async () => {
        const an = S.team.filter((p) => /.+@.+\..+/.test(p.email || '')).map((p) => ({ name: p.name, email: p.email }));
        if (!an.length) { toast('Bitte zuerst oben eine E-Mail-Adresse eintragen.'); return; }
        $('#mailTest').disabled = true;
        try {
          const r = await Sync.funktion('termin-mail', { aktion: 'test', an });
          S.mailAktiv = true; await saveSettings();
          toast(`Test-Mail an ${r.gesendet} ${r.gesendet === 1 ? 'Adresse' : 'Adressen'} verschickt. Terminmails sind jetzt eingeschaltet.`, 5000); render();
        } catch (e) { toast('Hat nicht geklappt: ' + e.message, 7000); $('#mailTest').disabled = false; }
      };
      if ($('#mailAus')) $('#mailAus').onclick = async () => { S.mailAktiv = false; await saveSettings(); render(); };
      $$('[data-tp]').forEach((c) => {
        const p = S.team[+c.dataset.tp];
        $$('[data-tf]', c).forEach((inp) => (inp.oninput = () => { p[inp.dataset.tf] = inp.value.trim(); save(); }));
        if ($('[data-tdel]', c)) $('[data-tdel]', c).onclick = async () => { if (!loeschFrage(`${p.name || 'Person'} entfernen?`)) return; S.team.splice(+c.dataset.tp, 1); await saveSettings(); render(); };
      });
      $('#tpAdd').onclick = async () => { S.team.push({ id: uid(), name: '', email: '' }); await saveSettings(); render(); $$('[data-tf="name"]').pop()?.focus(); };
    };
    render();
    return;
  }
  if (k === 'firma') {
    main().innerHTML = `
    <div class="card">
      <label>Firmenname</label><input type="text" id="company" value="${esc(S.company)}" placeholder="z. B. Muster Projektentwicklung GmbH">
      <label>Kontaktzeile für die PDF-Fußzeile</label><input type="text" id="contact" value="${esc(S.contact)}" placeholder="Firma · Straße · Tel. · www">
      <label>Logo</label>
      ${S.logo ? `<img class="logo-prev" src="${S.logo}" alt="Logo">` : ''}
      <div class="row" style="margin-top:8px"><button class="btn secondary" id="logo">Logo wählen</button>${S.logo ? '<button class="btn danger" id="nologo">Entfernen</button>' : ''}</div>
    </div>
`;
    for (const id of ['company', 'contact']) $('#' + id).oninput = (e) => { S[id] = e.target.value.trim(); save(); };
    $('#logo').onclick = async () => {
      const [f] = await pickFiles(); if (!f) return;
      S.logo = await resize(await fileToDataUrl(f), 800, 'image/png'); await saveSettings(); einstellungSeite('firma');
    };
    if ($('#nologo')) $('#nologo').onclick = async () => { S.logo = ''; await saveSettings(); einstellungSeite('firma'); };
    main().insertAdjacentHTML('beforeend', '<div id="plFirma"></div>');
    await Vorgaben.firmaKarte($('#plFirma'));
  } else if (k === 'ki') {
    main().innerHTML = `
    <div class="card">
      <p class="muted">Schlüssel kostenlos erstellen unter <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Abgerechnet wird pro Bild bei Google. Der Schlüssel bleibt nur auf diesem Gerät gespeichert.</p>
      <label>API-Schlüssel</label><input type="password" id="apiKey" value="${esc(S.apiKey)}" placeholder="AIza…" autocomplete="off">
      <label>Modell</label>
      <select id="model">${S.modelList?.length ? S.modelList.map((m) => `<option value="${esc(m.id)}" ${m.id === S.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('') : `
        <option value="gemini-2.5-flash-image" ${S.model === 'gemini-2.5-flash-image' ? 'selected' : ''}>Gemini 2.5 Flash Image (schnell, günstig)</option>
        <option value="gemini-3-pro-image-preview" ${S.model === 'gemini-3-pro-image-preview' ? 'selected' : ''}>Gemini 3 Pro Image (beste Qualität, teurer)</option>
        ${['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'].includes(S.model) ? '' : `<option selected value="${esc(S.model)}">${esc(S.model)}</option>`}`}
      </select>
      <p class="muted">Tipp: Nach dem Eintragen des Schlüssels auf „Verbindung testen“ tippen. Dann zeigt die Liste alle aktuell verfügbaren Bild-Modelle von Google. Für beste Qualität das „Pro“-Modell wählen.</p>
      <label>Eigenes Modell (optional, überschreibt Auswahl)</label><input type="text" id="modelCustom" placeholder="Modell-ID">
      <button class="btn secondary block" id="test" style="margin-top:12px">Verbindung testen & Modelle laden</button>
    </div>
    <div class="docs" style="margin-top:12px"><button class="doc" id="kiPrompts"><span class="d-ico navy">${icon('sparkle')}</span><span class="d-t"><b>Prompts</b><span>Version ${vorgabe('kiPromptVersion') === 'alt' ? 'Alt' : 'Neu'} · Deko ${vorgabe('kiDeko') === 'ja' ? 'an' : 'aus'}</span><span class="muted e-was">Anweisungen an die Bild-KI ansehen und ändern</span></span>${icon('chevron', 'pc-chev')}</button></div>
`;
    $('#kiPrompts').onclick = () => { einstellungSeite('prompts'); window.scrollTo(0, 0); };
    $('#apiKey').oninput = (e) => { S.apiKey = e.target.value.trim(); save(); };
    $('#model').onchange = (e) => { S.model = e.target.value; save(); };
    $('#modelCustom').oninput = (e) => { if (e.target.value.trim()) { S.model = e.target.value.trim(); save(); } };
    $('#test').onclick = async () => {
      if (!S.apiKey) { toast('Bitte zuerst den API-Schlüssel eintragen.'); return; }
      try {
        // Alle verfügbaren Modelle laden und die Bild-Modelle zur Auswahl anbieten
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': S.apiKey } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { toast(`${j.error?.message || r.status}`, 6000); return; }
        const imgModels = (j.models || [])
          .filter((m) => /image/i.test(m.name) && !/imagen/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
        if (!imgModels.length) { toast('Schlüssel ok, aber kein Bild-Modell gefunden.', 6000); return; }
        const sel = $('#model');
        sel.innerHTML = imgModels.map((m) => `<option value="${esc(m.id)}" ${m.id === S.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
        if (!imgModels.some((m) => m.id === S.model)) { S.model = imgModels[0].id; sel.value = S.model; await saveSettings(); }
        S.modelList = imgModels; await saveSettings();
        toast(`Verbunden. ${imgModels.length} Bild-Modell(e) gefunden, ausgewählt: ${sel.selectedOptions[0].textContent}`, 6000);
      } catch (e) { toast('' + e.message, 6000); }
    };
  } else if (k === 'pakete') {
    main().innerHTML = '<div id="angebot-settings"></div>';
    await window.Angebot?.einstellungenKarte();
  } else if (k === 'cloud') {
    main().innerHTML = '<div id="sync-settings"></div>';
    window.Sync?.einstellungenKarte($('#sync-settings'));
  } else if (k === 'sicherung') {
    main().innerHTML = '<div id="backup-settings"></div>';
    window.Backup?.einstellungenKarte($('#backup-settings'));
  }
}
