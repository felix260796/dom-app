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
  /** KI: Was ist auf dem Bild? { art: 'rechnung'|'dokument'|'foto', titel, firma, kunde } */
  async function erkennen(data) {
    if (!state.settings.apiKey) return { art: '' };
    try {
      const txt = await geminiText([{ text: 'Was zeigt dieses Foto? Es stammt von einer Sanierungsfirma. art: "rechnung" (Rechnung oder Lieferschein mit Betrag), "dokument" (anderes Schriftstück, Formular, Vertrag, Plan, Notiz) oder "foto" (Raum, Baustelle, Gegenstand). titel: kurzer deutscher Titel, z. B. „Rechnung Fliesen Kaya“ oder „Grundriss EG“. firma: Absender, falls erkennbar. kunde: Name des Kunden oder Empfängers, falls erkennbar.' }, { inline_data: { mime_type: 'image/jpeg', data: data.split(',')[1] } }], true, {
        responseSchema: { type: 'OBJECT', properties: { art: { type: 'STRING' }, titel: { type: 'STRING' }, firma: { type: 'STRING' }, kunde: { type: 'STRING' } }, required: ['art'] } });
      return JSON.parse(txt);
    } catch (e) { console.warn('Bild nicht erkannt', e); return { art: '' }; }
  }
  /** Passenden Kunden zum erkannten Namen vorschlagen. */
  const kundeZu = (name) => {
    const n = String(name || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return n.length ? Kunden.liste().find((k) => n.some((w) => `${k.name} ${k.vorname}`.toLowerCase().includes(w))) : null;
  };

  async function start() {
    const [f] = await pickFiles({ camera: true, accept: 'image/*' });
    if (!f) return;
    toast('Bild wird angesehen …', 15000);
    let data = await resize(await fileToDataUrl(f), 2000, 'image/jpeg', 0.85);
    const e = await erkennen(data);
    $('#toast').hidden = true;
    const doc = e.art === 'rechnung' || e.art === 'dokument';
    if (doc) data = await scan(data);
    const vorschlag = kundeZu(e.kunde);
    const wohin = await sheet(doc ? `Erkannt: ${e.titel || (e.art === 'rechnung' ? 'Rechnung' : 'Dokument')}` : 'Wohin mit dem Foto?', [
      { label: 'Als Eingangsrechnung erfassen', sub: 'Die KI liest Betrag, Datum und Absender aus', icon: icon('euro'), value: 'rechnung' },
      ...(vorschlag ? [{ label: `Zu ${Kunden.name(vorschlag)}`, sub: 'In „Bilder & Dokumentation“ des Kunden', icon: icon('user'), value: 'k:' + vorschlag.id }] : []),
      { label: 'Zu einem Kunden', sub: 'Kunde wählen, in „Bilder & Dokumentation“', icon: icon('users'), value: 'kunde' },
    ].sort((a, b) => (e.art === 'rechnung' ? 0 : (a.value === 'rechnung') - (b.value === 'rechnung'))));
    if (!wohin) return;
    const zurueck = () => switchTab(state.tab === 'einstellungen' ? 'kunden' : state.tab);
    if (wohin === 'rechnung') { switchTab('rechnungen'); return Finanzen.ausBild(data, () => switchTab('rechnungen')); }
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
