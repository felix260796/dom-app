'use strict';
/* DOM – Per Sprache anlegen: ein Satz wie „Neuer Kunde Herr Müller, Hauptstraße 5 in Köln, Telefon 0170…,
 * Besichtigung Bad am Dienstag um 10 Uhr“ wird zu Kunde, Objekt, Projekt und Termin.
 * Ablauf: Mikrofon oben in der Kopfzeile (oder auf „Heute“) → sprechen → die KI (Gemini) liest Name, Anschrift,
 * Telefon, E-Mail, Projekt und Termin heraus → Prüfseite mit allen Feldern → „Anlegen“.
 * Ein bekannter Kunde wird erkannt (gleicher Name), dann kommt nur Objekt/Projekt/Termin dazu.
 * Der Termin öffnet danach den normalen Termin-Editor (dort Mails an Team und Kunde wie gewohnt).
 * Statt zu sprechen kann man auch tippen (oder die Diktierfunktion der iPhone-Tastatur nutzen).
 * Vorgaben: 'spracheDauer' (Termindauer ohne Endzeit), 'spracheProjekt' (Projekt bei Kundenterminen vorschlagen). */
window.Sprache = (() => {
  let rec = null, stream = null, chunks = [], t0 = 0, uhr = null;
  let zurueck = null;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plusMin = (hm, n) => { const [h, m] = hm.split(':').map(Number); const x = h * 60 + m + n; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const klein = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // ---------- Startseite der Funktion ----------
  function view(back) {
    zurueck = back || zurueck || (() => switchTab('heute'));
    header('Sprechen', 'Kunde, Projekt und Termin anlegen', { label: 'Zurück', fn: () => { stopp(true); zurueck(); } });
    main().innerHTML = `
      <div class="card sp-card">
        <button class="sp-mic" id="spMic" aria-label="Aufnahme starten">${icon('mic')}</button>
        <b id="spStatus">Tippen und sprechen</b>
        <span class="muted" id="spHilfe">Zum Beispiel: „Neuer Kunde Herr Müller, Hauptstraße 5 in Köln, Telefon 0170 1234567, Bad sanieren, Besichtigung Dienstag um 10 Uhr.“</span>
      </div>
      <div class="card kform">
        <label style="margin-top:0">Oder schreiben</label>
        <textarea id="spText" rows="3" placeholder="Hier geht auch die Diktiertaste der iPhone-Tastatur"></textarea>
        <button class="btn" id="spGo" style="margin-top:10px;width:100%">Auswerten</button>
      </div>`;
    $('#spMic').onclick = () => (rec ? stopp() : start());
    $('#spGo').onclick = () => { const t = $('#spText').value.trim(); if (t) auswerten([{ text: 'Text:\n' + t }]); };
  }

  async function start() {
    if (typeof voice !== 'undefined' && voice.rec) { toast('Es läuft schon eine Gesprächsaufnahme. Bitte erst beenden oder unten schreiben.', 5000); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Aufnahme geht auf diesem Gerät nicht. Bitte unten schreiben.', 5000); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast('Kein Zugriff aufs Mikrofon. Bitte in den iPhone-Einstellungen (Safari > Mikrofon) erlauben.', 6000); return; }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = () => {
      const typ = (rec?.mimeType || mime || 'audio/mp4').split(';')[0];
      const abbruch = rec?.abbruch;
      stream?.getTracks().forEach((t) => t.stop()); stream = null; rec = null; clearInterval(uhr);
      if (abbruch || !chunks.length) return;
      const blob = new Blob(chunks, { type: typ });
      blob.arrayBuffer().then((buf) => auswerten([{ text: 'Sprachaufnahme:' }, { inline_data: { mime_type: geminiAudioMime(blob), data: bufToB64(buf) } }]));
    };
    rec.start(1000); t0 = Date.now();
    $('#spMic')?.classList.add('on');
    const st = () => { const s = Math.round((Date.now() - t0) / 1000); if ($('#spStatus')) $('#spStatus').textContent = `Ich höre zu … ${s} s. Zum Beenden tippen.`; if (s >= 180) stopp(); };
    st(); uhr = setInterval(st, 1000);
  }
  function stopp(abbruch) {
    if (!rec) return;
    rec.abbruch = !!abbruch;
    try { rec.stop(); } catch {}
    $('#spMic')?.classList.remove('on');
  }

  // ---------- KI liest heraus ----------
  async function auswerten(teile) {
    const st = $('#spStatus'); if (st) st.textContent = 'Wird verstanden …';
    $('#spGo') && ($('#spGo').disabled = true);
    const heute = new Date();
    const prompt = `Du hilfst einer Sanierungsfirma (Bad, Wohnung). Heute ist ${heute.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${iso(heute)}).
Der Nutzer will per Sprache einen Kunden, ein Projekt und/oder einen Termin anlegen. Lies aus der Aufnahme bzw. dem Text alles heraus.
Antworte nur mit JSON in genau dieser Form (fehlende Angaben als leerer Text):
{"transkript":"was gesagt wurde, wörtlich",
 "kunde":{"anrede":"Herr|Frau|Herr und Frau|Familie|Firma|Hausverwaltung|","vorname":"","name":"Nachname oder Firmenname","telefon":"","email":""},
 "adresse":"Straße Hausnummer, PLZ Ort der Baustelle",
 "projekt":{"anlegen":true,"titel":"kurz, z. B. Bad, Küche, Wohnung komplett"},
 "termin":{"anlegen":true,"titel":"kurz, z. B. Besichtigung Bad","datum":"JJJJ-MM-TT","von":"HH:MM","bis":"HH:MM","art":"kunde|baustelle|buero|privat"},
 "notiz":"alles Weitere, z. B. Wünsche, Schlüssel, Besonderheiten"}
Regeln: Wochentage ohne Datum meinen den nächsten solchen Tag ab morgen. „Morgen“, „übermorgen“, „nächste Woche“ entsprechend auflösen.
Telefonnummern ohne Leerzeichen-Fehler, E-Mails klein und mit @ (aus „at“ wird @, aus „Punkt“ wird .). Schreibe Namen und Straßen korrekt groß.
termin.anlegen nur true, wenn ein Termin genannt wird. projekt.anlegen true, wenn eine Arbeit/ein Raum genannt wird oder es um eine Besichtigung geht.`;
    let d;
    try {
      const txt = await geminiText([{ text: prompt }, ...teile], true);
      d = JSON.parse(String(txt).replace(/^```(json)?|```$/g, '').trim());
    } catch (e) {
      if (st) st.textContent = 'Das hat nicht geklappt';
      toast('Konnte nicht ausgewertet werden: ' + e.message, 6000);
      $('#spGo') && ($('#spGo').disabled = false);
      return;
    }
    pruefen(d);
  }

  // ---------- Prüfen und anlegen ----------
  /** Bekannte Kunden mit gleichem Nachnamen (und, falls gesagt, Vornamen). */
  function treffer(kd) {
    const n = klein(kd.name), v = klein(kd.vorname);
    if (!n) return [];
    return Kunden.liste().filter((k) => klein(k.name) === n && (!v || !klein(k.vorname) || klein(k.vorname) === v));
  }
  function objektZu(k, adresse) {
    if (!k || !adresse) return k?.objekte.length === 1 && !adresse ? k.objekte[0].id : '';
    const a = klein(adresse).split(',')[0];
    return k.objekte.find((o) => klein(o.adresse).includes(a))?.id || '';
  }

  function pruefen(d) {
    const kd = { anrede: '', vorname: '', name: '', telefon: '', email: '', ...(d.kunde || {}) };
    const pr = { anlegen: false, titel: '', ...(d.projekt || {}) };
    const te = { anlegen: false, titel: '', datum: '', von: '', bis: '', art: 'kunde', ...(d.termin || {}) };
    if (te.anlegen && te.von && !te.bis) te.bis = plusMin(te.von, +vorgabe('spracheDauer') || 60);
    if (te.anlegen && (te.art || 'kunde') === 'kunde' && vorgabe('spracheProjekt') !== 'nein') pr.anlegen = true;
    const tr = treffer(kd);
    let kundeId = tr.length === 1 ? tr[0].id : '';
    const f = (id, l, v, typ = 'text') => `<label>${l}</label><input type="${typ}" id="${id}" value="${esc(v || '')}" autocomplete="off">`;
    const render = () => {
      const k = Kunden.byId(kundeId);
      const oid = objektZu(k, d.adresse);
      header('Bitte prüfen', 'Stimmt alles? Dann „Anlegen“.', { label: 'Zurück', fn: () => view() });
      main().innerHTML = `
        ${d.transkript ? `<div class="card sp-zitat"><span class="muted">Verstanden:</span> „${esc(d.transkript)}“</div>` : ''}
        <div class="card kform">
          <h3 class="sp-h">Kunde</h3>
          ${tr.length ? `<label>Bekannter Kunde?</label><select id="spK"><option value="">Neuer Kunde</option>${tr.map((x) => `<option value="${x.id}" ${x.id === kundeId ? 'selected' : ''}>${esc(Kunden.name(x))} (${esc(x.nr)})</option>`).join('')}</select>` : ''}
          ${k ? `<p class="muted" style="margin:8px 0 0">${esc(Kunden.name(k))}, Kundennummer ${esc(k.nr)}. Telefon und E-Mail ergänze ich, falls sie fehlen.</p>` : `
            <label>Anrede</label><select id="spAnrede">${['', 'Herr', 'Frau', 'Herr und Frau', 'Familie', 'Firma', 'Hausverwaltung'].map((a) => `<option ${a === kd.anrede ? 'selected' : ''}>${a}</option>`).join('')}</select>
            <div class="row"><div>${f('spVor', 'Vorname', kd.vorname)}</div><div>${f('spName', 'Name', kd.name)}</div></div>`}
          <div class="row"><div>${f('spTel', 'Telefon', kd.telefon, 'tel')}</div><div>${f('spMail', 'E-Mail', kd.email, 'email')}</div></div>
          ${k && k.objekte.length ? `<label>Objekt (Baustelle)</label><select id="spObj">${k.objekte.map((o) => `<option value="${o.id}" ${o.id === oid ? 'selected' : ''}>${esc(Kunden.objLabel(o))}</option>`).join('')}<option value="" ${oid ? '' : 'selected'}>Neue Anschrift</option></select>` : ''}
          <div id="spAdrBox" ${k && oid ? 'hidden' : ''}>${f('spAdr', 'Anschrift der Baustelle', d.adresse)}</div>
        </div>
        <div class="card kform">
          <label class="chk sp-chk"><input type="checkbox" id="spP" ${pr.anlegen ? 'checked' : ''}> <b>Projekt anlegen</b></label>
          <div id="spPBox" ${pr.anlegen ? '' : 'hidden'}>${f('spPT', 'Was wird gemacht?', pr.titel)}<p class="muted" style="margin:6px 0 0">Startet mit Status „Besichtigung“.</p></div>
        </div>
        <div class="card kform">
          <label class="chk sp-chk"><input type="checkbox" id="spT" ${te.anlegen ? 'checked' : ''}> <b>Termin anlegen</b></label>
          <div id="spTBox" ${te.anlegen ? '' : 'hidden'}>
            ${f('spTT', 'Was?', te.titel)}
            ${f('spTD', 'Datum', te.datum, 'date')}
            <div class="row"><div>${f('spTV', 'von', te.von, 'time')}</div><div>${f('spTB', 'bis', te.bis, 'time')}</div></div>
            <p class="muted" style="margin:6px 0 0">Danach öffnet sich der Termin, dort wählst du wie gewohnt, wer eine E-Mail bekommt.</p>
          </div>
        </div>
        <div class="card kform">${f('spNotiz', 'Notiz', d.notiz)}</div>
        <button class="btn big" id="spOk" style="width:100%">Anlegen</button>`;
      if ($('#spK')) $('#spK').onchange = (e) => { merken(); kundeId = e.target.value; render(); };
      if ($('#spObj')) $('#spObj').onchange = (e) => { $('#spAdrBox').hidden = !!e.target.value; };
      $('#spP').onchange = (e) => { $('#spPBox').hidden = !e.target.checked; };
      $('#spT').onchange = (e) => { $('#spTBox').hidden = !e.target.checked; };
      $('#spOk').onclick = () => anlegen();
    };
    const wert = (id) => $('#' + id)?.value.trim() ?? null;
    /** Eingaben vor einem Neuzeichnen übernehmen. */
    const merken = () => {
      for (const [id, o, k] of [['spAnrede', kd, 'anrede'], ['spVor', kd, 'vorname'], ['spName', kd, 'name'], ['spTel', kd, 'telefon'], ['spMail', kd, 'email'], ['spAdr', d, 'adresse'], ['spPT', pr, 'titel'], ['spTT', te, 'titel'], ['spTD', te, 'datum'], ['spTV', te, 'von'], ['spTB', te, 'bis'], ['spNotiz', d, 'notiz']]) { const v = wert(id); if (v !== null) o[k] = v; }
      if ($('#spP')) pr.anlegen = $('#spP').checked;
      if ($('#spT')) te.anlegen = $('#spT').checked;
    };

    async function anlegen() {
      merken();
      let k = Kunden.byId(kundeId);
      if (!k && !kd.name) { toast('Bitte einen Namen eintragen.'); return; }
      if (te.anlegen && !te.datum) { toast('Bitte ein Datum für den Termin eintragen.'); return; }
      $('#spOk').disabled = true;
      if (!k) {
        k = { id: uid(), kind: 'kunde', created: Date.now(), anrede: kd.anrede, vorname: kd.vorname, name: kd.name, telefon: kd.telefon, email: kd.email, notiz: d.notiz || '', objekte: [] };
        await Kunden.speichern(k);
      } else {
        if (kd.telefon && !k.telefon) k.telefon = kd.telefon;
        if (kd.email && !k.email) k.email = kd.email;
        if (d.notiz && !te.anlegen) k.notiz = [k.notiz, d.notiz].filter(Boolean).join('\n');
        await Kunden.speichern(k);
      }
      let oid = $('#spObj')?.value || '';
      if (!oid && d.adresse) { const o = { id: uid(), name: '', adresse: d.adresse }; k.objekte.push(o); await Kunden.speichern(k); oid = o.id; }
      let pid = '';
      if (pr.anlegen) pid = await Projekt.anlegen(k.id, oid, pr.titel);
      const fertig = () => {
        if (pid) { switchTab('projekt', { wohnung: null }); Projekt.oeffnen(pid); }
        else Kunden.oeffnen(k.id);
      };
      toast(kundeId ? (pid ? 'Projekt angelegt' : 'Gespeichert') : pid ? 'Kunde und Projekt angelegt' : 'Kunde angelegt');
      if (te.anlegen) {
        Kalender.bearbeiten({ titel: te.titel, art: ['kunde', 'baustelle', 'buero', 'privat'].includes(te.art) ? te.art : 'kunde', datum: te.datum, von: te.von || '09:00', bis: te.bis || plusMin(te.von || '09:00', +vorgabe('spracheDauer') || 60), ganztag: !te.von, kundeId: k.id, objektId: oid, projektId: pid, notiz: d.notiz || '' }, fertig);
      } else fertig();
    }
    render(); window.scrollTo(0, 0);
  }

  return { view, _intern: { pruefen } };
})();
