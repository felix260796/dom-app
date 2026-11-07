'use strict';
/* DOM – „Wie geht das?“ (Menü, state.tab = 'hilfe'): Frage zur App stellen, die KI antwortet in 1–3 Sätzen
 * und bietet einen Knopf „Dorthin“ an. Wissen über die App: WISSEN unten (bei neuen Funktionen ergänzen),
 * dazu alle Einstellungen aus Vorgaben.index(). Die Diktiertaste der iPhone-Tastatur funktioniert im Feld. */
window.Hilfe = (() => {
  // Wo was ist. Kurz halten, Sprache wie in der App.
  const WISSEN = `Die DOM-App für Sanierung. Unten fünf Reiter: Kunden, Subunternehmer, Projekte, Angebote, Rechnungen. Tippen aufs DOM-Logo oben öffnet das Menü: Suche, Heute, Kalender, Karte, Auswertung, Preisliste, Unterlagen, Wie geht das?, Einstellungen; ganz unten, wem das Gerät gehört, und der Cloud-Abgleich. Das Mikrofon oben legt per Sprache Kunde, Projekt und Termin an.
Kunden: Kundenkarte mit Kontakt, Objekten (Anschriften der Baustellen), Projekten, Quelle. Neues Projekt aus der Kundenkarte oder im Reiter Projekte mit „Neues Projekt“.
Projekt: oben die Statuskarte (Besichtigung, Angebot in Arbeit, Angebot versendet, zugesagt/abgesagt, eingeplant mit Baustart, Baustelle läuft, abgeschlossen, Rechnung gestellt, bezahlt). Darunter Räume mit Fotos, KI-Visualisierung der Pakete Basic/Standard/Premium, Moodboard. Je Raum Aufmaß und Angebot mit Positionen aus der Preisliste, Versionen „Änderung n“, Nachkalkulation (Aufschläge nur für dieses Angebot, Preis einer Position antippen zum Überschreiben), KI-Vorschläge aus Kundenwünschen. Gesamtangebot über alle Räume im Projekt. Angebot senden als PDF über das Teilen-Menü setzt den Status „versendet“. Unterschriebenes Angebot im Projekt ablegen.
Im Projekt außerdem: Baufortschritt mit Arbeitsschritten zum Abhaken, Baustelle mit Bestellungen beim Lieferanten (Liefertermin) und Abnahmeprotokoll mit Unterschrift auf dem Handy und Mängeln mit Frist, Rechnungen (Abschlagsrechnung nach Abschlagsplan 30/40/30, Schlussrechnung mit Nachträgen, Zahlungserinnerung und Mahnung, als bezahlt markieren), Kosten/Kalkulation Soll gegen Ist, Kundenmappe und Baumappe für Subunternehmer als PDF.
Angebote-Reiter: alle Angebote offen/zugesagt/abgesagt, Absagegrund, Schnellangebot ohne Projekt.
Rechnungen-Reiter: Eingangsrechnungen erfassen (Foto, KI liest Betrag aus), offene Kundenrechnungen, abzurechnende Baustellen, Kalkulation je Projekt mit Ampel, Auswertung.
Subunternehmer: Karte mit Gewerk, Kontakt, Dokumenten, Geburtstagen, Preisen je Position.
Kalender: Termine mit Mails an Team, Kunde, Subunternehmer, Erinnerungen, Kundentermin kann gleich ein Projekt „Besichtigung“ anlegen. Filter Felix/Deniel/beide.
Unterlagen: Firmenordner (Gewerbeanmeldung, Versicherung, Freistellungsbescheinigung …) mit Ablaufdatum zum Teilen, und alle Rechnungen, unterschriebenen Angebote, Abnahmeprotokolle aus den Projekten.
Heute: Termine, Angebote zum Nachfassen, überfällige Rechnungen, Lieferungen, Mängel, Baustarts, ablaufende Firmendokumente.
Einstellungen: Firma & Logo, Preisliste, Aufschläge & Angebotstexte, Pakete & Excel-Import, Moodboards, Rechnungen & Mahnungen (Zahlungsziel, Abschläge, Texte), Abläufe & Listen, Mitteilungen aufs iPhone, Terminmails & Team, Baufortschritt-Vorlagen, KI-Schlüssel, Cloud-Abgleich, Datensicherung. Oben eine Suche über alle Einstellungen.`;
  // Ziele für „Dorthin“
  const ZIELE = {
    kunden: ['Kunden', () => switchTab('kunden')], partner: ['Subunternehmer', () => switchTab('partner')], projekte: ['Projekte', () => switchTab('projekt')],
    angebote: ['Angebote', () => switchTab('angebote')], rechnungen: ['Rechnungen', () => switchTab('rechnungen')], heute: ['Heute', () => switchTab('heute')],
    kalender: ['Kalender', () => { switchTab('heute'); Kalender.view(); }], suche: ['Suche', () => switchTab('suche')], karte: ['Karte', () => switchTab('karte')],
    auswertung: ['Auswertung', () => switchTab('auswertung')], unterlagen: ['Unterlagen', () => switchTab('unterlagen')], sprache: ['Per Sprache anlegen', () => Sprache.view(() => switchTab('hilfe'))],
    ...Object.fromEntries(EINST.map(([id, t]) => ['einst:' + id, ['Einstellungen › ' + t, () => { switchTab('einstellungen'); einstellungSeite(id); }]])),
  };
  const BEISPIELE = ['Wie stelle ich eine Abschlagsrechnung?', 'Wo trage ich eine Eingangsrechnung ein?', 'Wie ändere ich den Mahntext?', 'Wie schicke ich ein Angebot an den Kunden?'];
  let letzte = null;

  function view() {
    header('Wie geht das?', 'Frag einfach, wo du was findest');
    main().innerHTML = `<div class="card kform">
        <label style="margin-top:0">Deine Frage</label>
        <textarea id="hfQ" rows="2" placeholder="z. B. Wie stelle ich eine Schlussrechnung?"></textarea>
        <button class="btn block" id="hfGo" style="margin-top:10px">Fragen</button></div>
      <div id="hfA">${letzte ? antwortHtml(letzte) : `<div class="chips hf-bsp">${BEISPIELE.map((b) => `<button class="qchip" data-hb="${esc(b)}">${esc(b)}</button>`).join('')}</div>`}</div>`;
    $('#hfGo').onclick = () => fragen($('#hfQ').value.trim());
    $$('[data-hb]').forEach((b) => (b.onclick = () => { $('#hfQ').value = b.dataset.hb; fragen(b.dataset.hb); }));
    binden();
  }
  const antwortHtml = (j) => `<div class="card"><p class="hf-frage muted">${esc(j.frage)}</p><p style="margin:0;line-height:1.5">${esc(j.antwort || '')}</p></div>
    ${(j.ziele || []).filter((z) => ZIELE[z]).map((z) => `<button class="notice plain" data-hz2="${esc(z)}">${icon('map')}<span><b>Dorthin:</b> ${esc(ZIELE[z][0])}</span>${icon('chevron')}</button>`).join('')}`;
  const binden = () => $$('[data-hz2]').forEach((b) => (b.onclick = () => ZIELE[b.dataset.hz2][1]()));

  async function fragen(frage) {
    if (!frage) return;
    const box = $('#hfA'); box.innerHTML = '<p class="hint">Einen Moment …</p>';
    const einst = Vorgaben.index().map(([s, l]) => `${s}: ${l}`).join('\n');
    try {
      const txt = await geminiText([{ text: `Du bist die Hilfe in einer Handwerker-App. Der Nutzer fragt: „${frage}“.
So ist die App aufgebaut:
${WISSEN}
Einstellungsfelder (Seite: Feld):
${einst}
Antworte auf Deutsch in der du-Form, ohne Emojis, in 1 bis 3 kurzen Sätzen: wo er hintippt, Schritt für Schritt. Gibt es das nicht, sag das ehrlich.
ziele = passende Orte aus dieser Liste (höchstens 2): ${Object.keys(ZIELE).join(', ')}` }], true, {
        responseSchema: { type: 'OBJECT', properties: { antwort: { type: 'STRING' }, ziele: { type: 'ARRAY', items: { type: 'STRING' } } } } });
      letzte = { frage, ...JSON.parse(txt) };
      if (state.tab !== 'hilfe') return;
      box.innerHTML = antwortHtml(letzte); binden();
    } catch (e) { box.innerHTML = `<p class="hint">Die KI konnte nicht antworten (${esc(e.message)}).</p>`; }
  }

  return { view };
})();
