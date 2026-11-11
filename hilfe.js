'use strict';
/* DOM – „Wie geht das?“ (Menü, state.tab = 'hilfe'): Frage zur App stellen, die KI antwortet in 1–3 Sätzen
 * und bietet einen Knopf „Dorthin“ an. Wissen über die App: WISSEN unten (bei neuen Funktionen ergänzen),
 * dazu alle Einstellungen aus Vorgaben.index(). Die Diktiertaste der iPhone-Tastatur funktioniert im Feld. */
window.Hilfe = (() => {
  // Wo was ist. Kurz halten, Sprache wie in der App.
  const WISSEN = `Mitdenken vor Ort: Im Angebot unter „Vor Ort“ steht „Was fehlt noch?“. Nach jeder Aufnahme (oder mit „Prüfen, was noch fehlt“) stellt die KI Rückfragen fürs Angebot, z. B. Maße, Deckenhöhe, Anzahl, Fabrikat, Foto. Antwort eintippen oder diktieren, dann ist die Frage abgehakt. Im Büro macht „Angebotsentwurf erstellen“ aus Gespräch, Fotos, Maßen und Antworten einen Vorschlag mit Positionen je Bereich; grün = gemessen, gelb = geschätzt, rot = Menge fehlt, „Preis kommt von Partner“ = Preis des Subunternehmers fehlt noch. Erst „übernehmen“ schreibt ins Angebot. Was fehlt, steht unter „Noch offen“. Einstellbar unter Einstellungen › Abläufe › Angebote und KI › Prompts.
Die DOM-App für Sanierung. Unten fünf Reiter: Kunden, Partner (Subunternehmer), Projekte, Angebote, Rechnungen. Tippen aufs DOM-Logo oben öffnet das Menü: Suche, Heute, Kalender, Karte, Auswertung, Preisliste, Preislisten der Partner, Unterlagen, Wie geht das?, Einstellungen; ganz unten, wem das Gerät gehört, und der Cloud-Abgleich. Das Mikrofon oben legt per Sprache Kunde, Projekt und Termin an. Die Kamera oben erkennt Rechnungen, Partner-Angebote und Dokumente und schlägt vor, wohin sie gehören.
Angebot: „Speichern und ansehen“ legt das PDF beim Kunden unter „Dokumente“ im Projekt ab, verschickt wird nur mit „Senden“. Nach dem Senden ist das Angebot gesperrt; ändern geht über „Ändern (Kopie)“, die Kopie bekommt eine neue Nummer. Die Textfelder vor und nach den Positionen (z. B. Einleitung, Ausführung und Leistungsumfang, Preis und Zahlung, Gewährleistung) stellst du unter Einstellungen › Aufschläge & Angebotstexte ein und je Angebot unter „Texte im Angebot“. Positionen eines Subunternehmers übernimmst du unter „Eigene Positionen“ › „Aus Angebot oder Preisliste eines Partners übernehmen“ (Foto, PDF oder seine Preisliste), mit deinem Zuschlag (Standard unter Einstellungen › Abläufe & Listen › Kalkulation). Dokumente lassen sich mit − und + oder zwei Fingern zoomen.
Kunden: Kundenkarte mit Kontakt, Anschrift, Quelle, darunter getrennt Angebote (bis zur Zusage) und Projekte (nach der Zusage). Standard ist ein Objekt = Kundenanschrift; „Vor Ort“ hat Bilder, Schlüssel, Ansprechpartner. Erst „Weiteres Objekt hinzufügen“ macht mehrere Objekte (Häuser) mit gemeinsamer Rechnungsanschrift. Geburtstag je Kunde und Subunternehmer: „Nur gratulieren“ oder „Mit Geschenk“ (Erinnerung 14 und 3 Tage vorher, einstellbar unter Einstellungen › Abläufe & Listen).
Reiter Projekte: nur zugesagte Aufträge in vier Bereichen Einzuplanen, Eingeplant (Baustart steht), In Durchführung, Abgeschlossen. Neue Projekte beginnen unter Angebote mit „Neues Angebot“ oder im Kundentermin mit „Angebot vor Ort“. Bis zur Zusage ist das Projekt ein geführter Ablauf in vier Schritten: 1 Vor Ort (Karte „Vor Ort aufnehmen“ sammelt alles vom Termin: Gespräch, Fotos, Pläne scannen, Raumscan mit LiDAR; darunter zugeklappt „Visualisieren“ als Zusatz, hat mit dem Angebot nichts zu tun), 2 Büro (Angebot je Raum ausarbeiten, Wünsche aus dem Gespräch stehen schon drin), 3 Senden mit Mappe, 4 Nachfassen (Zugesagt, Abgesagt, Angebot anpassen). Schnellangebot: „Beim Kunden merken“ speichert den genannten Preis in der Kundenkarte. Oben „Neues Projekt“ legt einen Auftrag direkt ohne Angebot an (startet unter Einzuplanen).
Projekt: oben die Statuskarte (Besichtigung, Angebot in Arbeit, Angebot versendet, zugesagt/abgesagt, eingeplant mit Baustart, Baustelle läuft, abgeschlossen, Rechnung gestellt, bezahlt). Darunter Räume mit Fotos, KI-Visualisierung der Pakete Basic/Standard/Premium, Moodboard. Je Raum Aufmaß und Angebot mit Positionen aus der Preisliste, Versionen „Änderung n“, Nachkalkulation (Aufschläge nur für dieses Angebot, Preis einer Position antippen zum Überschreiben), KI-Vorschläge aus Kundenwünschen. Gesamtangebot über alle Räume im Projekt. Angebot senden als PDF über das Teilen-Menü setzt den Status „versendet“. Unterschriebenes Angebot im Projekt unten bei den Unterlagen ablegen.
Im Projekt außerdem: Baufortschritt mit nummerierten Arbeitsschritten zum Abhaken (Schritt antippen › Nummer ändern legt die Reihenfolge fest), Baustelle mit Bestellungen beim Lieferanten (Liefertermin) und Abnahmeprotokoll mit Unterschrift auf dem Handy und Mängeln mit Frist, Rechnungen (Abschlagsrechnung nach Abschlagsplan 30/40/30, Schlussrechnung mit Nachträgen, Zahlungserinnerung und Mahnung, als bezahlt markieren), Kosten/Kalkulation Soll gegen Ist, Kundenmappe und Baumappe für Subunternehmer als PDF.
Angebote-Reiter: alle Angebote offen/zugesagt/abgesagt, Absagegrund, Schnellangebot ohne Projekt.
Rechnungen-Reiter: Eingangsrechnungen erfassen (Foto, KI liest Betrag aus), offene Kundenrechnungen, abzurechnende Baustellen, Kalkulation je Projekt mit Ampel, Auswertung.
Subunternehmer: Karte mit Gewerk, Kontakt, Dokumenten, Geburtstagen, Preisen je Position.
Kalender: Termine mit Mails an Team, Kunde, Subunternehmer, Erinnerungen, Kundentermin kann gleich ein Projekt „Besichtigung“ anlegen. Filter Felix/Deniel/beide. Nachfassen steht automatisch im Kalender (Einstellungen › Projekte). Tipp auf den Titel „Kunden“, „Partner“, „Projekte“, „Angebote“ oder „Rechnungen“ öffnet deren Einstellungen. Vor jedem PDF-Versand kommt eine Vorschau. Termin: Die gewählte Art (Kundentermin, Baustelle …) ist farbig gefüllt. Unter „E-Mail an die Beteiligten“ zeigt „Vorschau“ je Person, wie die Mail aussieht. Gespräch vor Ort: vorher antippen, wer dabei ist, dann schreibt die KI im Transkript vor jede Aussage, wer spricht. „Pause“ hält an, „Weiter“ nimmt in derselben Aufnahme weiter auf, erst „Beenden“ schließt ab und wertet aus; eine neue Aufnahme danach wird hinten an das Gespräch angehängt. In der iPhone-App läuft die Aufnahme auch bei gesperrtem Bildschirm und in der Kamera-App weiter (roter Punkt oben), nach einem Video oder Anruf geht sie von selbst weiter. Danach stehen Zusammenfassung und Aufgaben (zum Abhaken) als Text zum Ausklappen im Projekt; PDF gibt es zusätzlich. Raumscans vor Ort übernimmt man im Aufmaß mit „Maße vom Raumscan vor Ort übernehmen“. Per Sprache anlegen: Auf der Prüfseite mit dem kleinen Mikrofon korrigieren oder ergänzen („Nein, Meier mit ei“). PDF-Vorschau: mit + und − oder zwei Fingern zoomen. Angebot aus Excel: im Angebot unter Senden „Angebot-PDF hochladen“. Das Angebot je Raum ist eine Tabelle wie in Excel: alle Positionen der Preisliste nach Gewerk, Menge eintippen (0, 1 oder m²), Summe oben. Oben Maße (auch aus dem Gespräch) und „Aus Paket vorbelegen“, unten eigene Positionen mit Preis. Links steht die Kalenderwoche (KW), abschaltbar. KI-Bilder: Anweisungen (Prompts) unter Einstellungen › KI › Prompts, Version Neu/Alt zum Vergleichen, Deko an/aus.
Unterlagen: Firmenordner (Gewerbeanmeldung, Versicherung, Freistellungsbescheinigung …) mit Ablaufdatum zum Teilen, und Vorlagen (eigene Muster wie Abnahmeprotokoll, Regiebericht, Checkliste) mit Plus zum Ablegen.
Heute: Termine, Angebote zum Nachfassen, überfällige Rechnungen, Lieferungen, Mängel, Baustarts, ablaufende Firmendokumente.
Einstellungen: Firma & Logo, Preisliste, Aufschläge & Angebotstexte, Pakete & Excel-Import, Moodboards, Rechnungen & Mahnungen (Zahlungsziel, Abschläge, Texte), Abläufe & Listen, Mitteilungen aufs iPhone, Terminmails & Team, Baufortschritt-Vorlagen, KI-Schlüssel, iPhone-Funktionen, Cloud-Abgleich, Datensicherung. Oben eine Suche über alle Einstellungen.
iPhone-Funktionen (nur in der DOM-App aus TestFlight, Einstellungen › iPhone-Funktionen, jeder Schalter gilt nur für dieses Gerät): Dokumentenscanner (Kamera oben › „Dokument scannen“), Raum scannen mit LiDAR (im Aufmaß, nur iPhone Pro und iPad Pro), „An DOM teilen“ (PDF oder Bild in Mail, WhatsApp oder Dateien über Teilen an DOM schicken, dann als Eingangsrechnung oder Partner-Angebot übernehmen), Face ID beim Öffnen, Termine im iPhone-Kalender (eigener Kalender „DOM“), iPhone-Kontakte (beim Kunden übernehmen oder speichern). Kalender und Kontakte sind anfangs aus, damit sie nicht auf private Geräte kommen. Route für heute: Knopf auf der Seite „Heute“ über den Terminen, öffnet Google Maps mit allen Terminen als Stopps (umstellbar auf Apple Karten).`;
  // Ziele für „Dorthin“
  const ZIELE = {
    kunden: ['Kunden', () => switchTab('kunden')], partner: ['Partner', () => switchTab('partner')], projekte: ['Projekte', () => switchTab('projekt')],
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
