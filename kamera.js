'use strict';
/* DOM – Kamera oben in der Kopfzeile (neben Kalender und Mikrofon).
 * Foto machen → die KI erkennt, ob es eine Rechnung, ein anderes Dokument oder ein normales Foto ist.
 * Dokumente werden wie gescannt aufbereitet (gerade, hell, gut lesbar). Danach fragt die App, wohin es gehört:
 * Eingangsrechnung (finanzen.js), zu einem Kunden in „Bilder & Dokumentation“ (bilder.js). */
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
  /** KI: Was ist auf dem Bild? { art: 'rechnung'|'angebot'|'dokument'|'foto', titel, firma, kunde, adresse } */
  async function erkennen(data) {
    if (!state.settings.apiKey) return { art: '' };
    try {
      const txt = await geminiText([{ text: 'Was zeigt dieses Foto? Es stammt von einer Sanierungsfirma. art: "rechnung" (Rechnung oder Lieferschein mit Betrag), "angebot" (Angebot oder Kostenvoranschlag eines Handwerkers, Subunternehmers oder Lieferanten mit Leistungen und Preisen), "dokument" (anderes Schriftstück, Formular, Vertrag, Plan, Notiz) oder "foto" (Raum, Baustelle, Gegenstand). titel: kurzer deutscher Titel, z. B. „Rechnung Fliesen Kaya“, „Angebot Elektro Meier“ oder „Grundriss EG“. firma: Absender, falls erkennbar. kunde: Name des Kunden, Bauherrn oder Empfängers, falls erkennbar. adresse: Anschrift der Baustelle oder des Bauvorhabens, falls erkennbar.' }, { inline_data: { mime_type: 'image/jpeg', data: data.split(',')[1] } }], true, {
        responseSchema: { type: 'OBJECT', properties: { art: { type: 'STRING' }, titel: { type: 'STRING' }, firma: { type: 'STRING' }, kunde: { type: 'STRING' }, adresse: { type: 'STRING' } }, required: ['art'] } });
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
  async function insAngebot(data, e) {
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
    await Angebot._intern.subUebernehmen(r, () => { saveProject(r); Angebot.ansicht(r, false); }, { data, mime: 'image/jpeg', partnerId: partnerZu(e.firma)?.id || '' });
  }

  async function start() {
    const [f] = await pickFiles({ camera: true, accept: 'image/*' });
    if (!f) return;
    toast('Bild wird angesehen …', 15000);
    let data = await resize(await fileToDataUrl(f), 2000, 'image/jpeg', 0.85);
    const e = await erkennen(data);
    $('#toast').hidden = true;
    const doc = ['rechnung', 'dokument', 'angebot'].includes(e.art);
    if (doc) data = await scan(data);
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
  return { start, scan };
})();
