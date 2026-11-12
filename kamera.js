'use strict';
/* DOM – Kamera oben in der Kopfzeile (neben Kalender und Mikrofon).
 * Foto machen → die KI erkennt, ob es eine Rechnung, ein anderes Dokument oder ein normales Foto ist.
 * Dokumente werden wie gescannt aufbereitet (gerade, hell, gut lesbar). Danach fragt die App, wohin es gehört:
 * Eingangsrechnung (finanzen.js), zu einem Kunden in „Bilder & Dokumentation“ (bilder.js).
 * Visitenkarte: die KI liest die Kontaktdaten gleich mit, „Als Partner anlegen“ legt den Partner an und öffnet ihn zum Prüfen.
 * In der iPhone-App: Apples Dokumentenscanner (Geraet.scannen) und über „Teilen“ geschickte Dateien (ausDatei).
 * serie(): mehrere Fotos hintereinander in einer eigenen Kamera-Ansicht (für Bilder.fotosMachen). */
window.Kamera = (() => {
  /** Dokument-Look: Graustufen, mehr Kontrast, helles Papier. */
  async function scan(data) {
    const img = await loadImg(data);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.filter = 'grayscale(1) contrast(1.35) brightness(1.08)';
    x.drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  }
  /** KI: Was ist auf dem Bild? { art: 'rechnung'|'angebot'|'visitenkarte'|'dokument'|'foto', titel, firma, kunde, adresse,
   *  bei Visitenkarten zusätzlich karte: { firma, name, telefon, mobil, email, anschrift, web, gewerk, lieferant } } */
  async function erkennen(data) {
    if (!state.settings.apiKey) return { art: '' };
    try {
      const txt = await geminiText([{ text: 'Was zeigt dieses Foto? Es stammt von einer Sanierungsfirma. art: "rechnung" (Rechnung oder Lieferschein mit Betrag), "angebot" (Angebot oder Kostenvoranschlag eines Handwerkers, Subunternehmers oder Lieferanten mit Leistungen und Preisen), "visitenkarte" (Visitenkarte, auch Briefkopf oder Stempel nur mit Kontaktdaten einer Firma oder Person), "dokument" (anderes Schriftstück, Formular, Vertrag, Plan, Notiz) oder "foto" (Raum, Baustelle, Gegenstand). titel: kurzer deutscher Titel, z. B. „Rechnung Fliesen Kaya“, „Angebot Elektro Meier“ oder „Grundriss EG“. firma: Absender, falls erkennbar. kunde: Name des Kunden, Bauherrn oder Empfängers, falls erkennbar. adresse: Anschrift der Baustelle oder des Bauvorhabens, falls erkennbar. Nur bei art "visitenkarte" zusätzlich karte: firma (Firmenname mit Rechtsform), name (Vor- und Nachname der Person), telefon (Festnetz), mobil, email, anschrift (Straße Hausnummer, PLZ Ort in einer Zeile), web, gewerk (kurz auf Deutsch, z. B. „Fliesen“, „Sanitär, Heizung“, „Elektro“, „Baustoffhandel“), lieferant (true, wenn es ein Händler oder Lieferant ist, kein Handwerker). Nur übernehmen, was auf der Karte steht, nichts erfinden.' }, { inline_data: { mime_type: 'image/jpeg', data: data.split(',')[1] } }], true, {
        responseSchema: { type: 'OBJECT', properties: { art: { type: 'STRING' }, titel: { type: 'STRING' }, firma: { type: 'STRING' }, kunde: { type: 'STRING' }, adresse: { type: 'STRING' },
          karte: { type: 'OBJECT', properties: { firma: { type: 'STRING' }, name: { type: 'STRING' }, telefon: { type: 'STRING' }, mobil: { type: 'STRING' }, email: { type: 'STRING' }, anschrift: { type: 'STRING' }, web: { type: 'STRING' }, gewerk: { type: 'STRING' }, lieferant: { type: 'BOOLEAN' } } } }, required: ['art'] } });
      return JSON.parse(txt);
    } catch (e) { console.warn('Bild nicht erkannt', e); return { art: '' }; }
  }
  const woerter = (s) => String(s || '').toLowerCase().split(/[\s,.-]+/).filter((w) => w.length > 2);
  /** Passenden Kunden zum erkannten Namen vorschlagen. */
  const kundeZu = (name) => {
    const n = woerter(name);
    return n.length ? Kunden.liste().find((k) => n.some((w) => `${k.name} ${k.vorname}`.toLowerCase().includes(w))) : null;
  };
  /** Passenden Partner zur erkannten Firma. */
  const partnerZu = (firma) => {
    const n = woerter(firma);
    return n.length ? (window.Partner?.liste() || []).find((p) => n.some((w) => `${p.firma} ${p.inhaber}`.toLowerCase().includes(w))) : null;
  };
  /** Offene Aufträge, die zum Erkannten passen (Kunde oder Anschrift), die passendsten zuerst. */
  async function auftraegeZu(e, k, nur) {
    const a = woerter(e.adresse);
    const treffer = (x) => (k && x.kundeId === k.id ? 2 : 0) + (a.length && a.some((w) => `${x.address || ''}`.toLowerCase().includes(w)) ? 1 : 0);
    return (await projectIndex()).filter((x) => !['bezahlt', 'abgesagt'].includes(Projekt.norm(x.status)) && (!nur || nur.includes(Projekt.norm(x.status))))
      .map((x) => [x, treffer(x)]).sort((p, q) => q[1] - p[1] || (q[0].updated || 0) - (p[0].updated || 0));
  }
  /** Partner-Angebot: Auftrag und Raum wählen, dann die Positionen mit Zuschlag ins eigene Angebot übernehmen. */
  async function insAngebot(data, e, mime = 'image/jpeg') {
    const k = kundeZu(e.kunde);
    const kand = await auftraegeZu(e, k, ['besichtigung', 'entwurf']);
    if (!kand.length) return toast('Gerade ist kein Angebot in Arbeit. Lege zuerst unter „Aufträge“ eine Anfrage an.', 5000);
    const wid = await sheet('In welches Angebot?', kand.map(([x, t]) => ({ label: x.titel || x.customer || 'Auftrag', sub: [t ? 'passt' : '', x.customer, x.address].filter(Boolean).join(' · '), icon: icon('euro'), value: x.id })));
    if (!wid) return;
    const w = await kvGet('wohnung:' + wid);
    if (!w) return;
    w.mappe ??= {};
    if (Projekt.gesperrt(w)) { switchTab('auftraege', { wohnung: w }); return Projekt.gesperrtFrage(w); }
    const list = await Projekt.raeume(w);
    if (!list.length) { switchTab('auftraege', { wohnung: w }); return toast('Lege im Auftrag zuerst einen Raum fürs Angebot an (Schritt 2), dann nochmal fotografieren.', 6000); }
    const rid = list.length === 1 ? list[0].id : await sheet('Für welchen Raum?', list.map((r) => ({ label: r.room || 'Raum', icon: roomIcon(r.roomType), value: r.id })));
    const r = list.find((x) => x.id === rid);
    if (!r) return;
    switchTab('auftraege', { wohnung: w });
    Object.assign(r, { customer: w.customer, address: w.address, kundeId: w.kundeId, projektNr: w.nr || '' });
    state.project = r; state.angebotAusProjekt = true;
    await Angebot.ansicht(r);
    await Angebot._intern.subUebernehmen(r, () => { saveProject(r); Angebot.ansicht(r, false); }, { data, mime, partnerId: partnerZu(e.firma)?.id || '' });
  }

  /** Gibt es den Kontakt von der Visitenkarte schon? Sicher erkannt über Telefon, Mobil oder E-Mail, sonst über den
   *  Namen (Firma ohne Rechtsform bzw. Vor- und Nachname). Liefert { partner, kunde }. */
  function schonDa(v) {
    const nr = (x) => { const z = String(x || '').replace(/\D/g, '').replace(/^(00)?49/, '').replace(/^0+/, ''); return z.length >= 6 ? z : ''; };
    const ml = (x) => String(x || '').trim().toLowerCase();
    const nm = (x) => String(x || '').toLowerCase().replace(/\b(gmbh|ug|ag|kg|ohg|gbr|mbh|co|e\.?\s?k\.?|inh\.?|haftungsbeschränkt|herr|frau|familie|firma)\b/g, ' ').replace(/[^a-z0-9äöüß]+/g, ' ').trim();
    const nrn = [nr(v.telefon), nr(v.mobil)].filter(Boolean), mail = ml(v.email);
    const firma = nm(v.firma), person = nm(v.name);
    const trifft = (tels, mails, namen) =>
      tels.map(nr).some((x) => x && nrn.includes(x)) || (mail && mails.map(ml).includes(mail)) ||
      namen.map(nm).some((x) => x && x.length > 3 && (x === firma || x === person));
    const w = (x, art) => (x.weitere || []).filter((y) => y.art === art).map((y) => y.wert);
    const partner = (window.Partner?.liste() || []).find((p) => trifft([p.telefon, ...w(p, 'tel')], [p.email, ...w(p, 'mail')], [p.firma, p.inhaber])) || null;
    const kunde = Kunden.liste().find((k) => trifft([k.telefon, ...w(k, 'tel'), k.hv?.telefon], [k.email, ...w(k, 'mail'), k.hv?.email], [k.name, `${k.vorname || ""} ${k.name || ""}`])) || null;
    return { partner, kunde };
  }
  /** Foto der Visitenkarte bei den Dokumenten des Partners ablegen. */
  async function karteZuPartner(p, data) {
    const id = uid();
    await kvSet('pdok:' + id, data);
    p.dokumente = [...(p.dokumente || []), { id, name: 'Visitenkarte', typ: 'image/jpeg', groesse: Math.round(data.length * 0.75), t: Date.now() }];
    p.updated = Date.now();
    await kvSet('partner:' + p.id, p);
    await Partner.laden();
  }

  /** Visitenkarte → Partner oder Kunde anlegen und zum Prüfen öffnen. Gibt es ihn schon (schonDa), sagt die App das
   *  zuerst und bietet den Eintrag an. Das Foto der Karte wird immer abgelegt: beim Kunden in „Bilder & Dokumentation“
   *  (Ordner aus Vorgabe `ordnerVisitenkarte`), beim Partner unter „Dokumente“. */
  async function visitenkarte(v, data) {
    const t = (x) => String(x || '').trim();
    const firma = t(v.firma) || t(v.name);
    const { partner: da, kunde: kda } = schonDa(v);
    const schon = [da && `Partner ${da.firma || da.inhaber}`, kda && `Kunde ${Kunden.name(kda)}`].filter(Boolean).join(' und ');
    const wahl = await sheet(schon ? `Schon angelegt: ${schon}` : `Visitenkarte: ${firma || 'ohne Namen'}`, [
      ...(da ? [{ label: `${da.firma || da.inhaber} öffnen`, sub: 'Diese Karte gibt es schon bei den Partnern', icon: icon('wrench'), value: 'da' }] : []),
      { label: da ? 'Als neuen Partner anlegen' : 'Als Partner anlegen', sub: [t(v.gewerk), t(v.name), t(v.mobil) || t(v.telefon)].filter(Boolean).join(' · ') || 'Subunternehmer oder Lieferant', icon: icon('wrench'), value: 'neu' },
      ...(kda ? [{ label: `${Kunden.name(kda)} öffnen`, sub: 'Diese Karte gibt es schon bei den Kunden', icon: icon('user'), value: 'kda' }] : []),
      { label: kda ? 'Als neuen Kunden anlegen' : 'Als Kunde anlegen', sub: 'Auch Firmen können Kunden sein', icon: icon('user'), value: 'kunde' },
      { label: 'Nur als Foto ablegen', sub: 'Zu einem Kunden in „Bilder & Dokumentation“', icon: icon('camera'), value: 'foto' },
    ]);
    if (wahl === 'da') return Partner.oeffnen(da.id);
    if (wahl === 'kda') return Kunden.oeffnen(kda.id);
    if (wahl === 'kunde') return alsKunde(v, data);
    if (wahl === 'foto') {
      const k = await Kunden.waehlen('Zu welchem Kunden?');
      if (!k) return;
      const oid = await Kunden.objektWaehlen(k, 'Zu welchem Objekt?');
      if (oid === null) return;
      const o = await Bilder.ablegen(k.id, oid, data, kartenOrdner());
      return toast(`In „${o.name}“ bei ${Kunden.name(k) || 'Kunde'} gespeichert`, 4000);
    }
    if (wahl !== 'neu') return;
    const tel = t(v.telefon) || t(v.mobil);
    const p = { id: uid(), kind: 'partner', created: Date.now(), updated: Date.now(), art: v.lieferant ? 'lief' : 'sub',
      firma: t(v.firma), inhaber: t(v.name), gewerk: t(v.gewerk), telefon: tel, email: t(v.email), anschrift: t(v.anschrift), web: t(v.web),
      weitere: t(v.telefon) && t(v.mobil) ? [{ id: uid(), art: 'tel', label: 'Mobil', wert: t(v.mobil) }] : [] };
    if (!p.firma && !p.inhaber) return toast('Auf der Karte war kein Name zu lesen. Bitte nochmal fotografieren.', 5000);
    try { await karteZuPartner(p, data); } catch (e) { console.warn('Visitenkarte nicht abgelegt', e); await kvSet('partner:' + p.id, p); await Partner.laden(); }
    Partner.oeffnen(p.id);
    toast('Partner angelegt, die Karte liegt bei seinen Dokumenten. Bitte kurz prüfen.', 4500);
  }

  const kartenOrdner = () => vorgabe('ordnerVisitenkarte') || 'Dokumente';
  async function alsKunde(v, data) {
    const t = (x) => String(x || '').trim();
    const teile = t(v.name).split(/\s+/).filter(Boolean);
    const person = { vorname: teile.slice(0, -1).join(' '), name: teile.slice(-1)[0] || '' };
    const k = { id: uid(), kind: 'kunde', created: Date.now(), ...(t(v.firma) ? { anrede: 'Firma', vorname: '', name: t(v.firma) } : person),
      telefon: t(v.telefon) || t(v.mobil), email: t(v.email), privat: t(v.anschrift),
      weitere: t(v.telefon) && t(v.mobil) ? [{ id: uid(), art: 'tel', label: 'Mobil', wert: t(v.mobil) }] : [],
      notiz: [t(v.firma) && t(v.name) ? `Ansprechpartner: ${t(v.name)}` : '', t(v.web)].filter(Boolean).join('\n') };
    if (!k.name && !k.vorname) return toast('Auf der Karte war kein Name zu lesen. Bitte nochmal fotografieren.', 5000);
    await Kunden.speichern(k);
    try { await Bilder.ablegen(k.id, k.objekte?.[0]?.id || '', data, kartenOrdner()); } catch (e) { console.warn('Visitenkarte nicht abgelegt', e); }
    Kunden.oeffnen(k.id);
    toast(`Kunde angelegt, die Karte liegt in „Bilder & Dokumentation“ (${kartenOrdner()}). Bitte kurz prüfen.`, 5000);
  }

  async function start() {
    // In der iPhone-App mit eingeschaltetem Scanner (geraet.js): erst fragen, ob Dokument oder Foto
    if (window.Geraet?.kann('scanner')) {
      const w = await sheet('Kamera', [
        { label: 'Dokument scannen', sub: 'Rechnung, Angebot, Brief: Ränder und mehrere Seiten erkennt das iPhone', icon: icon('file'), value: 'scan' },
        { label: 'Foto aufnehmen', sub: 'Raum, Baustelle, Gegenstand', icon: icon('camera'), value: 'foto' },
      ]);
      if (!w) return;
      if (w === 'scan') { const data = await Geraet.scannen(); if (data) await verarbeiten(data, { gescannt: true }); return; }
    }
    const [f] = await pickFiles({ camera: true, accept: 'image/*' });
    if (!f) return;
    return verarbeiten(await resize(await fileToDataUrl(f), 2000, 'image/jpeg', 0.85));
  }

  /** Über „Teilen“ an DOM geschickte Datei (geraet.js): Bilder wie ein Foto, PDFs als Rechnung oder Partner-Angebot. */
  async function ausDatei({ data, mime = '', name = '' }) {
    if (mime.startsWith('image/')) return verarbeiten(await resize(data, 2000, 'image/jpeg', 0.85));
    if (mime !== 'application/pdf') return toast('Diese Datei kann DOM nicht öffnen. Geht: PDF und Bilder.', 5000);
    const wohin = await sheet(`Geteilt: ${name || 'PDF'}`, [
      { label: 'Als Eingangsrechnung erfassen', sub: 'Die KI liest Betrag, Datum und Absender aus', icon: icon('euro'), value: 'rechnung' },
      { label: 'Positionen in ein Angebot übernehmen', sub: 'Angebot eines Partners, mit deinem Zuschlag', icon: icon('wrench'), value: 'angebot' },
    ]);
    if (wohin === 'rechnung') { switchTab('rechnungen'); return Finanzen.ausBild(data, () => switchTab('rechnungen'), 'application/pdf', name); }
    if (wohin === 'angebot') return insAngebot(data, {}, 'application/pdf');
  }

  async function verarbeiten(data, { gescannt = false } = {}) {
    toast('Bild wird angesehen …', 15000);
    const e = await erkennen(data);
    $('#toast').hidden = true;
    if (gescannt && !['rechnung', 'angebot', 'visitenkarte'].includes(e.art)) e.art = 'dokument';
    if (e.art === 'visitenkarte' && e.karte) return visitenkarte(e.karte, data);
    const doc = ['rechnung', 'dokument', 'angebot'].includes(e.art);
    if (doc && !gescannt) data = await scan(data);
    const vorschlag = kundeZu(e.kunde);
    // Passende offene Aufträge des erkannten Kunden (oder der Anschrift) gleich als Ziel anbieten
    const zuAuftrag = vorschlag || e.adresse ? (await auftraegeZu(e, vorschlag)).filter(([, t]) => t > 0).slice(0, 2).map(([x]) => x) : [];
    const sub = partnerZu(e.firma);
    const ziele = [
      { label: 'Als Eingangsrechnung erfassen', sub: 'Die KI liest Betrag, Datum und Absender aus', icon: icon('euro'), value: 'rechnung', art: 'rechnung' },
      { label: 'Positionen in ein Angebot übernehmen', sub: `${sub ? `Von ${sub.firma || sub.inhaber}, ` : ''}mit deinem Zuschlag`, icon: icon('wrench'), value: 'angebot', art: 'angebot' },
      ...zuAuftrag.map((x) => ({ label: `Zum Auftrag ${x.titel || x.customer || ''}`.trim(), sub: `${[x.customer, x.address].filter(Boolean).join(' · ')} · in „Bilder & Dokumentation“`, icon: icon('home'), value: 'w:' + x.id, art: 'dokument' })),
      ...(vorschlag ? [{ label: `Zu ${Kunden.name(vorschlag)}`, sub: 'In „Bilder & Dokumentation“ des Kunden', icon: icon('user'), value: 'k:' + vorschlag.id, art: 'foto' }] : []),
      { label: 'Zu einem Kunden', sub: 'Kunde wählen, in „Bilder & Dokumentation“', icon: icon('users'), value: 'kunde' },
    ];
    // Das Erkannte steht oben
    ziele.sort((a, b) => (b.art === e.art) - (a.art === e.art));
    const wohin = await sheet(doc ? `Erkannt: ${e.titel || ({ rechnung: 'Rechnung', angebot: 'Angebot' }[e.art] || 'Dokument')}` : 'Wohin mit dem Foto?', ziele);
    if (!wohin) return;
    const zurueck = () => switchTab(state.tab === 'einstellungen' ? 'kunden' : state.tab);
    if (wohin === 'rechnung') { switchTab('rechnungen'); return Finanzen.ausBild(data, () => switchTab('rechnungen')); }
    if (wohin === 'angebot') return insAngebot(data, e);
    if (wohin.startsWith('w:')) {
      const w = await kvGet('wohnung:' + wohin.slice(2));
      if (!w) return;
      const heute0 = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const o = await Bilder.ablegen(w.kundeId, w.objektId || '', data, doc ? 'Dokumente' : `Fotos (${heute0})`, w.id);
      return toast(`In „${o.name}“ beim Auftrag ${w.titel || w.customer || ''} gespeichert`, 4000);
    }
    const k = wohin.startsWith('k:') ? Kunden.byId(wohin.slice(2)) : await Kunden.waehlen('Zu welchem Kunden?');
    if (!k) return;
    const oid = await Kunden.objektWaehlen(k, 'Zu welchem Objekt?');
    if (oid === null) return;
    const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const ordner = doc ? 'Dokumente' : `Fotos (${heute})`;
    const o = await Bilder.ablegen(k.id, oid, data, ordner);
    toast(`In „${o.name}“ bei ${Kunden.name(k) || 'Kunde'} gespeichert`, 4000);
    zurueck();
  }
  /** Mehrere Fotos hintereinander (Wunsch Felix): eigene Kamera-Ansicht mit Auslöser, Zähler und „Fertig“.
   * onFoto(dataUrl) wird je Foto aufgerufen und speichert es. Gibt die Anzahl der Fotos zurück.
   * Geht die Kamera im Fenster nicht (kein Zugriff, älteres Gerät), öffnet sich die normale iPhone-Kamera;
   * nach jedem Foto fragt die App dann, ob noch eins dazukommt. Eine laufende Gesprächsaufnahme läuft weiter. */
  async function serie({ titel = 'Fotos', onFoto }) {
    let stream = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('keine Kamera');
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } } });
    } catch (e) {
      console.warn('Kamera im Fenster geht nicht', e);
      let n = 0;
      for (;;) {
        const [f] = await pickFiles({ camera: true, accept: 'image/*' });
        if (!f) break;
        try { await onFoto(await fileToDataUrl(f)); n++; } catch (err) { toast('Foto nicht gespeichert: ' + (err.message || err), 5000); }
        const w = await sheet(`${n} ${n === 1 ? 'Foto' : 'Fotos'} gespeichert`, [{ label: 'Noch ein Foto', icon: icon('camera'), value: 'ja' }, { label: 'Fertig', icon: icon('check'), value: '' }]);
        if (!w) break;
      }
      return n;
    }
    return new Promise((res) => {
      const el = document.createElement('div');
      el.className = 'kserie';
      el.innerHTML = `<div class="ks-top"><b>${esc(titel)}</b><span data-n>Noch kein Foto</span></div>
        <div class="ks-bild"><video autoplay playsinline muted></video><i class="ks-blitz"></i></div>
        <div class="ks-bar"><span class="ks-letztes" data-l></span><button type="button" class="ks-ausl" data-ausl aria-label="Foto aufnehmen"><i></i></button><button type="button" class="btn ks-fertig" data-fertig>Fertig</button></div>`;
      document.body.appendChild(el);
      const video = $('video', el);
      video.srcObject = stream;
      video.play?.().catch(() => {});
      let n = 0, kette = Promise.resolve(), zu = false;
      const zaehler = () => { $('[data-n]', el).textContent = n ? `${n} ${n === 1 ? 'Foto' : 'Fotos'}` : 'Noch kein Foto'; };
      $('[data-ausl]', el).onclick = () => {
        if (zu || !video.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        const data = c.toDataURL('image/jpeg', 0.88);
        n++; zaehler();
        $('[data-l]', el).innerHTML = `<img src="${data}" alt="">`;
        const b = $('.ks-blitz', el); b.classList.remove('an'); void b.offsetWidth; b.classList.add('an');
        // nacheinander speichern, der Auslöser bleibt frei
        kette = kette.then(() => onFoto(data)).catch((err) => { n--; zaehler(); toast('Foto nicht gespeichert: ' + (err.message || err), 5000); });
      };
      $('[data-fertig]', el).onclick = async () => {
        if (zu) return; zu = true;
        $('[data-fertig]', el).textContent = 'Speichert …';
        stream.getTracks().forEach((t) => t.stop());
        await kette;
        el.remove();
        res(n);
      };
    });
  }
  return { start, scan, ausDatei, serie };
})();
