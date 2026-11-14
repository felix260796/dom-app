# DOM-App: Welche Datei wofür

Diese Datei zuerst lesen. Danach nur die Dateien des Bereichs öffnen, um den es geht, nicht die ganze App.

PWA ohne Build-Schritt: reines HTML, CSS und JS. Alle Skripte werden in `index.html` der Reihe nach geladen und teilen sich globale Helfer.
Die Oberfläche ist auf Deutsch. Der Nutzer ist Felix (Dom Projektmanagement GmbH), Kollege Deniel Kovacic.

## Neuerungen aus Version 75/76

Die Leiste unten hat fünf Reiter: Kunden, Partner, Angebote, Projekte, Rechnungen (Reihenfolge seit Version 88). Felix wollte die Vier-Reiter-Struktur aus Version 75 (Heute/Aufträge/Kontakte/Geld) nicht, darum hat Version 76 sie wieder entfernt. Die Ziele 'auftraege' und 'kontakte' führen über `TAB_ALIAS` zu Angebote bzw. Kunden.
Angebot: „Speichern und ansehen“ legt das PDF unter `w.dokumente` ab, „Senden“ verschickt. Nach dem Senden ist das Angebot gesperrt (`w.angebotGesperrt`, `Projekt.gesperrt/gesperrtFrage/angebotKopieren`); ändern nur über eine Kopie mit neuer Nummer (`w.angebotArchiv`, `w.angebotKopieVon`).
Textfelder vor und nach den Positionen: Standard `PL.einstellungen.bausteine`, je Auftrag `w.angebotTexte` (`Angebot._intern.texteAuftrag`, `texteEinstellungen`).
Partner-Angebote übernehmen: `Angebot._intern.subUebernehmen` (Foto, PDF oder Partner-Preisliste, KI liest, Zuschlag `subZuschlag`), Zeilen als eigene Positionen mit `x.sub`.
Dokumente ansehen mit Zoom: `pdfAnsicht` in `core.js` (seit Version 85 mit PDF.js, siehe unten). Listen in den Einstellungen: `listenFeld`/`listenBinden` in `core.js`.

## Neuerungen aus Version 83

Angebotsablauf Schritt 1 „Vor Ort“: Karte „Vor Ort aufnehmen“ (`Gespraech.karte` in `voice.js`) sammelt Gespräch, Fotos, Pläne und Raumscan. „Visualisieren“ ist darunter zugeklappt (`details#wVis` in `projekt.js`) und hat mit dem Angebot nichts zu tun.
Per Sprache anlegen: Auf der Prüfseite per Sprache oder Text korrigieren (`korrigieren` in `sprache.js`).
Handler wie `onkeydown = (e) => bedingung && tu()` sind verboten: Rückgabe `false` blockiert jede Taste (so war „Ordner benennen“ kaputt).

## Neuerungen aus Version 84

Mitdenken vor Ort und Angebotsentwurf: `vorort.js` (`VorOrt`). „Was fehlt noch?“ in Schritt 1 (`VorOrt.karte/bind`, Fragen in `w.vorOrt.fragen`, eigene Notizen `w.vorOrt.notiz`, startet nach jeder Aufnahme über `VorOrt.nachAufnahme` aus `voice.js`). „Angebotsentwurf erstellen“ in Schritt 2 (`bueroKarte/bueroBind`): Die KI schlägt je Bereich Positionen vor, Mengen aus dem Aufmaß (`mengeAus`), Prüfseite, erst „übernehmen“ schreibt in `r.angebot.positionen` (Kennzeichen `x.ki = { sicher, partner, grund }`). Bereiche ohne Raum werden als Raumtyp `sonstiges` angelegt („Leistungen“, „Allgemein“). Offenes in `w.entwurf.offen`. Vorgaben: `vorortAuto`, `vorortFragenMax`, `vorortPruefliste`, `vorortFotos`, `entwurfFotos`, `entwurfHinweise`, Prompts `promptVorOrt`, `promptEntwurf`. Nicht auf Bäder beschränken.

## Neuerungen aus Version 85

Dokumente ansehen: `pdfAnsicht` in `core.js` zeichnet PDFs mit PDF.js (`vendor/pdfjs`, wird erst beim Öffnen geladen) Seite für Seite als Bild; Zoom per Knopf, zwei Finger, Doppeltipp. Kein iframe und kein „neues Fenster“ mehr (geht in der iPhone-App nicht), stattdessen Teilen-Menü. Die Seite selbst zoomt nie.
Zurück an dieselbe Stelle: `core.js` merkt bei jedem Tipp die Scroll-Stelle je Seite (Reiter + Titel + Untertitel aus `header()`) und stellt sie nach einem Tipp auf `#topback` wieder her. Neue Seiten brauchen dafür nur `header(titel, sub, { label, fn })`.
Suchfelder (`input type="search"`): Enter schließt die Tastatur (global in `core.js`). Auswahlfenster `sheet`: Textfeld ohne Autofokus, Suchfeld filtert immer (`suche`, Einträge mit `such`).
`telLink(t)` in `core.js`: Anrufen immer mit Ländervorwahl (Vorgabe `telVorwahl`).
Bilder: `Bilder.alleView` (alle Bilder nach Datum), `raster` (Markieren, PDF über `bilderPdf`), `gross` zum Durchwischen (scroll-snap), `Bilder.fotosMachen({ kundeId, objektId, projektId, ordnerId?, ordnerName? })` mit `Kamera.serie` (mehrere Fotos hintereinander, Ordner aus Vorgabe `ordnerFotos`).
Karte: Filter je Gruppe (`FILTER` in `karte.js`, gemerkt in localStorage `dom:karteFilter`). Auswertung: `auswertung(daten, rechnungen, jahr)` in `finanzen.js` mit Jahr-Auswahl. „Heute“ hat ein X (`#hZu`, zurück zu `window.__vorHeute`).
Per Sprache anlegen: Prüfseite mit Feldern untereinander, Anschrift wird über `Kunden.sucheAdresse` um PLZ und Ort ergänzt (Vorgabe `spracheAdresse`).

## Neuerungen aus Version 88

Schutz vor versehentlichem Ändern: `textSchutz` in `core.js` läuft von selbst nach jedem Neuzeichnen von `#main`. Jedes `textarea` mit Inhalt ist erst nach „Bearbeiten“ änderbar („Rückgängig“, „Fertig“). Ausnahme mit `data-frei`. Ganze Blöcke mit `data-schutz="<schlüssel>"` (alle Felder darin, Teile mit `data-edit-nur` gesperrt unsichtbar, `data-schutz-ohne-undo`); offen halten über Neuzeichnen mit `schutzOffen.add(schlüssel)`. Alle `textarea` bekommen Autokorrektur (außer `data-roh`).
Reihenfolge ändern: keine Pfeile mehr, sondern Griff `griffHtml()` und `ziehbar(box, zeilenSelektor, (von, nach) => …)` in `core.js` (Listen in den Einstellungen, Textfelder im Angebot).
Kunde: weitere Nummern und E-Mails über das kleine Plus (`Kontakt.mehrLabel/mehrBinden`, Daten in `k.weitere`, Bezeichnungen Vorgaben `telArten`/`mailArten`). Schnellübersicht `historie(k, idx)` in `kunden.js`: Angebots-, Projekt-, Rechnungshistorie; abgesagte Angebote mit Grund (`w.absage = { grund, t }`) und PDF (`angpdf:<id>` bzw. `w.dokumente`). Auswertung: Karte „Abgesagte Angebote“ (`data-awab`).
Route: `routeLink(adresse)` in `core.js` (Vorgabe `routeKarte`), jedes Anschriftfeld `.adr` bekommt von selbst ein Routen-Zeichen (`routeZeichen`), Schnellknopf „Route“ in `Kontakt.aktionen`.

## Neuerungen aus Version 89 (Angebotsablauf)

Angebotsablauf (bis zur Zusage) hat drei Reiter statt vier Schritten: Vor Ort, Büro, Angebote (`REITER`, `reiterVon/reiterSetzen`, `vorOrtTab`, `bueroTab`, `angeboteTab` in `projekt.js`). Jeder Reiter ist eine eigene Seite. Felix will das genau so, nicht wieder zu einer langen Seite zusammenlegen.
Vor Ort: einzelne Punkte, nicht eine Karte: Gespräch (`Gespraech.karte(w, list, { einzeln: true })`), Fotos (`Bilder.fotosMachen`), Plan scannen, Raum scannen, „Was fehlt noch?“. Visualisieren und Moodboard unten als Zusatz. Baumappe und Kundenmappe sind im Angebot vorerst weg (Felix später daran erinnern).
Büro: „Was wird angeboten?“ mit „Neu“ (`angebotsRaum`: Kleinigkeit = Raumtyp `sonstiges`, einzelner Raum, ganze Wohnung/ganzes Haus mit `raeumeWaehlen`, gescannte Räume aus `w.vorOrt.scans` oben, `r.scanId`). Zeile nach links wischen löscht (`wischen`, `raumLoeschen`). Nummer, Betreff, Anrede, Ansprechpartner, Aufschläge gelten fürs ganze Angebot (`bueroFelder`); im Angebot eines Raums gibt es dafür nur noch „Fertig“ (`ausPrj` in `angebotTabelle`).
Texte: `bausteine.js` (`Bausteine.block/bind`), aufklappbare Blöcke Anfangstexte und Schlusstexte zum Anhaken (`b.aus`), feste Zusätze Gruß mit Unterschrift und Auftragserteilung (`w.angebotOpt`, Vorgaben `angebotGruss`, `angebotAuftragsfeld`). Gleiches Muster ist für Rechnungen gedacht. Unterschrift im PDF über `window.Unterschrift?.pdf` (kommt aus dem Rechnungs-Thread).
Preisliste im Angebot wählbar (`plWahl` in `angebotTabelle`): allgemeine oder die eines Partners, Partnerpreise ohne Zuschlag (`x.sub.zuschlag = 0`, `x.sub.key`). Vorgabe `subZuschlag` steht auf 0.
Angebote: Stand Entwurf/Versendet/Abgesagt, frühere Fassungen aus `w.angebotArchiv` („überarbeitet“). Zugesagt → `zusage` → `auftragsbestaetigung` (`baueAngebotPdf(p, { art: 'ab' })`, Eintrag in `w.dokumente` mit `art: 'auftragsbestaetigung'`, `w.auftragsbestaetigung = { t, nr, dokId, gesendetAm }`, Vorgaben `abEinleitung`, `abSchluss`). Abgesagt: `w.absage = { grund, t }`, das PDF bleibt in `w.dokumente` (`pdfInDokumente`).

## Neuerungen aus Version 90 (Projekte und Rechnungen)

Zugesagtes Projekt (`auftragSeite` in `projekt.js`): Schritte Projektdetails, Projektfortschritt, Abnahme, Abrechnen; Kacheln Rechnung, Fotos, Bestellung, Nachtrag, Termin; „Vorbereiten“ (`todoFuellen`). Status „Zugesagt, noch einzuplanen“, kein Knopf „Baustelle läuft“ mehr. Löschen: `loeschenFragen` (Angebot eine Nachfrage, Projekt zwei, mit Rechnungen gar nicht). `Baustelle.abschnitt(el, w, list, 'bestellungen'|'abnahme')`.
Rechnung schreiben: ein Weg `Rechnung.neu(w?, fertig)` aus Projekt und Reiter (Projekt suchen, Art wählen: Abschlag nach Plan, Abschlag frei, Schlussrechnung, ohne Angebot eigene Positionen `r.eigen`). Rechnungen werden nie gelöscht, nur storniert (`art 'storno'`, `r.storniert`, beide tragen das Stornodatum in `bezahlt`, Summen gleichen sich aus; `Rechnung.gilt/istOffen`). Hinweis zur Aufbewahrung auf jeder Rechnung an Privatkunden. Vorgaben `abschlagFortschritt`, `textStorno`.
Reiter Rechnungen: Suche über alles (auch Bezahltes), oben „Neue Rechnung“ im selben Design wie „Neuer Kunde“, „Neues Angebot“ usw. (`cta slim`), darunter die Zeile „Eingang erfassen“ (`notice plain`, wie „Schnellangebot“ bei Angebote), Bereiche An Kunden / Eingang / Auswertung (`fSeg`, siehe Version 99).
GiroCode (QR zum Bezahlen) auf Rechnung und Mahnung: `qrcode.js` (`QR.giroCode`), IBAN/BIC in den Firmendaten (`PL.einstellungen.iban/bic`), Vorgabe `rechnungQr`.
Unterschrift unter PDFs: `unterschrift.js` (`Unterschrift.pdf(doc, x, y, { firma })` setzt Grußformel, Bild und Namen; je Person in `settings.unterschriften[personId]`, es unterschreibt, wem das Gerät gehört). Einstellungen › Firmendaten.
Firmenstempel: `settings.stempel`, einmal als Bild hinterlegt, `Unterschrift.pdf` setzt ihn rechts neben die Unterschrift (Angebot und Rechnung).
Texte auf der Rechnung: wie im Angebot über `bausteine.js`, je Rechnung `r.texte` (Standard `texteStd` aus den Vorgaben: Einleitung je Art, Zahlungsaufforderung, Aufbewahrung), feste Zusätze `r.opt.qr` und `r.opt.gruss`. Platzhalter werden erst im PDF gefüllt. Bearbeiten mit `Angebot._intern.textEditor`. Änderbar, bis die Rechnung gesendet oder bezahlt ist.

## Neuerungen aus Version 91

QR-Codes: `qrcode.js` (`QR.giroCode({ iban, bic, name, betrag, zweck })` → PNG für jsPDF, `QR.ibanOk`), Kodierung in `vendor/qrcode-generator.js`. Der GiroCode steht auf Rechnung und Mahnung (`rechnung.js`).
Visitenkarte: Die Kamera oben (`kamera.js`, `erkennen` mit art `visitenkarte` und `karte`) legt daraus einen Partner oder Kunden an (`visitenkarte`, `alsKunde`) und öffnet ihn zum Prüfen.
Zeichnen mit Stift oder Finger: `zeichnen.js`, ein Werkzeug für alles: `Zeichnen.oeffnen(hintergrund, { titel, striche, masstab, onSave(striche, bild) })`; hintergrund = Bild-DataURL, `{ breite, hoehe, zeichne(ctx) }` oder leer (Skizze). Striche sind Vektoren in Blatt-Einheiten, das Original bleibt unverändert. In `bilder.js`: Knopf „Zeichnen“ in der großen Ansicht (`b.zeichnung = { von, striche }`, weiterzeichnen möglich) und „Skizze zeichnen“ (Vorgabe `ordnerSkizzen`). Farben und Strichstärke: Vorgaben `zeichnenFarben`, `zeichnenStaerke`. Kein zweites Zeichenwerkzeug bauen.

## Neuerungen aus Version 92 (Kontakt halten, Musik nach Aufnahme)

Kontakt halten: `pflege.js` (`Pflege`). Bei Kunden und Partnern Abschnitt „Kontakt halten“ (`Pflege.abschnitt`): regelmäßig anrufen und Mittagessen vereinbaren mit Rhythmus (wöchentlich bis jährlich) und Tag fürs nächste Mal, Daten in `x.pflege = { anruf, essen }` (`r`, `faellig`, `zuletzt`, `spaeter`, `verschoben`, `wer`). Fehlt `x.pflege`, fragt die Karte nach (Vorgabe `pflegeFragen`). Auswahl je Tag `Pflege.heuteListe` (höchstens `pflegeAnrufeMax`/`pflegeEssenMax`, älteste zuerst, heute Erledigtes und Verschobenes zählt mit), auf „Heute“ mit Telefon rechts (`Pflege.heute()`), danach Nachfrage erledigt / später (`pflegeSpaeter`) / morgen. Kalender: Art `pflege`, vorausgerechnet (`Pflege.eintraege`). Mitteilung: `supabase/functions/push` (`pflegeHeute`, gleiche Auswahl) ab `pflegeAb` bis `pflegeBis`, alle `pflegeAlle` Minuten, bis erledigt; Schalter `pushPflege`, Wochenende `pflegeWochenende`. Prefs gehen über `Push.prefs().pflege` an die Funktion.
Musik nach Aufnahme: In der iPhone-App nimmt auch das Mikrofon oben (`sprache.js`) nativ auf (`Geraet.aufnahme`), danach gibt `DomAufnahme.freigeben()` die Audio-Sitzung mit `notifyOthersOnDeactivation` ab, damit vorher laufende Musik weiterspielt (`Geraet.audioFreigeben`, `aufnahmeAbbrechen`).

## Neuerungen aus Version 94 (Kontakt halten nachgebessert)

„Mittagessen“ heißt „Treffen vereinbaren“ (intern weiter Art `essen`; Namen über Vorgaben `pflegeNameAnruf`, `pflegeNameTreffen`, gehen über `prefs.pflege.namen` auch in die Mitteilung). „Kontakt halten“ in Kunde/Partner ist ein kleines `details.pf-box`, zu, solange nichts eingetragen ist (keine Frage-Karte mehr, `pflegeFragen` entfällt). Heute: weißes Feld über die ganze Breite mit kleinem rundem Telefon (`.pf-tel`), ruft direkt die erste Nummer an. Kalender: Arten `pflegeAnruf`, `pflegeTreffen` getrennt filterbar, Einträge mit kleinem Telefon (`data-ktel`, `Pflege.anrufenEintrag`); „Geburtstage Partner“.

## Neuerungen aus Version 95 (Angebot anlegen in Schritten)

Büro im Angebotsablauf legt das Angebot in fünf Schritten an (`SCHRITTE`, `schrittVon`, `schrittWahl` in `projekt.js`, Knöpfe `data-schritt`, Leiste `.ab-schritte`): 1 Davor (`kundeKarte`, Nummer, Ansprechpartner, Betreff, Anrede, Anfangstexte), 2 Maße („Was wird angeboten?“, Länge/Breite/Höhe gleich in der Zeile `data-bm`, dürfen leer bleiben, Kleinigkeit `ohneMasse`), 3 Positionen (Bereich antippen → `raumAngebot`; KI-Karte `VorOrt.bueroKarte`; Aufschläge), 4 Danach (Schlusstexte), 5 Ansicht (Übersicht, „Angebot ansehen“ = `angebotSpeichern`). Felix will genau diese Reihenfolge, nicht wieder alles auf eine Seite.
Ein Angebot geht ohne Vor-Ort-Termin: Kein Schritt setzt Aufnahme, Plan oder Scan voraus. Link „Nicht vor Ort gewesen?“ im Reiter Vor Ort. Der Kopf (Nummer, Betreff, Anrede, Ansprechpartner) liegt in `w.angebotKopf`, solange es noch keinen Raum gibt, und wird über `kopfAnwenden` in die Räume übernommen.
„Angebotsentwurf erstellen“ heißt jetzt „Positionen vorschlagen lassen“ (Felix verstand darunter „Angebot anlegen“). Darüber steht „Was soll gemacht werden?“ (`#voKurz`, gleiches Feld wie die Notiz vor Ort `w.vorOrt.notiz`), damit die KI auch aus der Erinnerung arbeiten kann. Nach „Neu“ bleibt man in Schritt 2 und springt nicht mehr in die Positionen.

## Neuerungen aus Version 96 (Visitenkarte)

Visitenkarte (`kamera.js`): Das Foto wird immer abgelegt, beim Kunden über `Bilder.ablegen` im Ordner aus Vorgabe `ordnerVisitenkarte`, beim Partner als Dokument (`karteZuPartner`, `pdok:<id>`). `schonDa(v)` findet bestehende Partner und Kunden über Telefon/Mobil (ohne Vorwahl 0/+49), E-Mail (auch `weitere`, `hv`) oder genauen Namen ohne Rechtsform; das Auswahlfenster heißt dann „Schon angelegt: …“.

## Neuerungen aus Version 97 (Kontakte, Zurück)

Telefon und E-Mail bei Kunde und Partner gleich (`Kontakt.mehrLabel(text, art, label)` / `mehrBinden(box, plus, list, art, persist, { haupt, hauptFeld })`): Tippen auf „Telefon“ wählt die Bezeichnung (`Kontakt.artWaehlen`, Vorgaben `telArten`/`mailArten`, eigene möglich), Hauptfeld in `x.telArt`/`x.mailArt`, weitere in `x.weitere` mit eigener Bezeichnung; weitere Nummern mit Ländervorwahl (Vorwahl vom Hauptfeld). Schnellknöpfe über `Kontakt.nummernVon(x, art)`. Der alte gemischte Block „Weitere Nummer oder E-Mail“ beim Partner ist weg.
Geburtstage beim Partner kompakt (`details.geb-z`: „Geburtstag Name“ + Datum, aufklappen für Name, Position, Datum, gratulieren/Geschenk). „Kontakt halten“ beim Kunden ohne Eintrag nur als graue Zeile (`Pflege.abschnitt(el, x, persist, { klein: true })`), beim Partner als Box.
Zurück: Menü-Seiten (`MENUE_SEITEN` in `app.js`) bekommen in `header()` von selbst „Zurück“ zum vorigen Reiter. Wischen vom linken Rand nach rechts klickt `#topback` (core.js), nicht in Auswahlfenstern und Vollbild-Ansichten. Neue Unterseiten brauchen nur `header(titel, sub, { label, fn })`.

## Neuerungen aus Version 99 (Projektseite und Rechnungen, Rückmeldung Felix 12.11.)

Zugesagtes Projekt (`auftragSeite` in `projekt.js`): oben immer Kunde, Objekt, Projektname, Ansprechpartner (aus dem Angebot, `r.angebot.anspr`) und Karte „Jetzt dran“ (`jetztDran(w)` → `{ text, sub, knopf, ziel }`, `jetztGehen(w, ziel)` springt in Reiter und Stelle). Darunter drei Reiter `PJ_REITER` Übersicht · Baustelle · Geld (`pjReiterVon`, gemerkt über `reiterWahl` wie im Angebotsablauf; ohne Wahl der Reiter des aktuellen Schritts). Keine Kacheln und keine Schritt-Leiste mehr. Übersicht: Statuskarte, Vorbereiten (nur eingeplant), Termine, Hinweise zur Baustelle (`w.hinweise`), Unterlagen, Dokumente, Vor Ort, Weiteres (Räume, Löschen). Baustelle: Leistungen und Baufortschritt (`Fortschritt.abschnitt`, „Leistungen aus dem Angebot übernehmen“ = Positionen ohne Preise aus `Rechnung.auftrag(w)`, Schritte mit `raum`, nach Räumen mit Überschrift `.bf-raum`), Bestellungen, Fotos (gleicher Bilder-Ordner wie beim Kunden), Nachträge (`Rechnung.projektAbschnitt(el, w, 'nachtraege')`), Abnahme. Geld: `Rechnung.projektAbschnitt(el, w, 'rechnungen')` und Kalkulation. Felix will genau diese drei Reiter.
Rechnung wie Angebot: „Speichern und ansehen“ vergibt die Nummer, legt das PDF in `w.dokumente` ab (`ablegen`, Schlüssel `wdok:<projekt>:<dateiname>`, `r.dokKey`) und zeigt es. Danach „Senden“ oder „Als versendet markieren“ (Datum, `r.gesendet`); nach dem Senden „Nochmal senden“ mit der abgelegten Fassung (`datei(r, w)`). Vor dem Senden wird das PDF bei jedem Ansehen neu gebaut (Texte können sich noch ändern).
Reiter Rechnungen: dritter Bereich heißt „Auswertung“ (Jahr wählen, `auswertung(...)`, darunter „Kalkulation je Projekt“). Menü › Auswertung ruft `Finanzen.auswertungView()` auf, das nur `fSeg = 'kalk'` setzt und in den Reiter Rechnungen wechselt (keine eigene Seite mehr). Keine Zeile „Einstellungen für Rechnungen“ im Reiter (Felix findet sie über Einstellungen). Eingang und Auswertung haben oben „Zurück“ zu An Kunden.

## Neuerungen aus Version 100 (Angebot nachgebessert)

Ansprechpartner immer genau eine Person: `ansprechpartner()` (Liste), `ansprVon(A)`, `einePerson` in `angebot.js`, Vorgaben `ansprechAngebot` (Felix), `ansprechProjekt` (Deniel, Projektseite `#wAnspr`, je Projekt wählbar in `w.ansprechpartner`). Werte mit zwei Namen gelten als nicht gewählt. Diese Person unterschreibt im PDF (`Unterschrift.pdf(doc, x, y, { name })`).
Betreff = Projektname (`w.titel`): kein eigenes Betreff-Feld mehr im Büro, im PDF `WA.titel` vor `A.titel` (`betreffWert/betreffBinden`).
Auftragserteilung und Gruß sind Bausteine mit `b.fest = 'auftrag' | 'gruss'` (`mitFest`, `texteFuer(w)` in `angebot.js`, alte `w.angebotOpt` wird übernommen). Stehen immer am Schluss: Schlusstexte, Auftragserteilung (nicht in der Auftragsbestätigung), ganz zuletzt Gruß mit Name, Unterschrift und Stempel. Im Text-Editor ohne Griff und ohne Löschen. Bauzeitenplan ist ganz raus (`bauzeit()` rechnet nur noch `{zeitraum}`).
Gewährleistung Standard 2 Jahre ab Abnahme (`GEW_ALT/GEW_NEU`, alter unveränderter Text wird beim Laden ersetzt).
Partnerangebot: `subUebernehmen` mit „Dokument scannen“ (`Geraet.scannen`), Foto, Screenshot/PDF; Original über `partnerOriginal` in `w.dokumente` mit `intern: true, art: 'partnerangebot'` (kein Senden-Knopf, nie an den Kunden).
Versand: „Als versendet markieren“ (`alsVersendet`, `datumFrage`, `angebotVersendet(wid, datum)`), „Nochmal senden“ (`angebotNochmal`, dasselbe PDF). Auftragsbestätigung im Projekt (`#dAb` → `abMenue`: ansehen, senden/nochmal senden `abSenden`, als versendet markieren; fehlt sie, wird sie erstellt), Stand in der Kundenhistorie (`abText/abPdf` in `kunden.js`).

## Neuerungen aus Version 101 (iPad und Computer)

Felix arbeitet draußen mit dem iPad Pro (Stift, LiDAR), im Büro am Windows-PC, das iPhone nur unterwegs. Alle drei laufen mit denselben App-Dateien, Daten über den Cloud-Abgleich.
iPad: Die TestFlight-App ist jetzt für iPhone und iPad (`TARGETED_DEVICE_FAMILY="1,2"` im iOS-Workflow). `zeigen` in `DomGeraet.swift` setzt für Sprechblasen-Fenster einen Ankerpunkt (sonst Absturz am iPad).
Großer Bildschirm: Ab 900 px Breite (iPad quer, großes iPad, Computer) wird die Leiste unten per CSS zur Seitenleiste links (`@media (min-width: 900px)` am Ende von `basis.css`), darunter die Menüpunkte (`seitenleiste` in `app.js`, Knöpfe `.nur-breit`, nur dort sichtbar). Am iPhone bleibt alles wie gehabt, die fünf Reiter unten nicht anfassen. Auswahlfenster stehen dort in der Mitte.
Stift: Unterschriftenfelder (`unterschrift.js`, Abnahme in `baustelle.js`) laufen über `stiftLinien(canvas, ctx, beimStart)` in `core.js`: Druck macht die Linie dicker, nach dem ersten Stiftstrich zählt die aufgelegte Hand nicht mehr. Zeichnen sonst nur über `zeichnen.js`.
Computer: Ordner `desktop/` (Electron). `main.js` lädt die App über `app://dom/` (fester Ort für den Speicher), Links nach draußen im Standardprogramm, Kamera/Mikrofon erlaubt, keine Mitteilungen (`push.js` prüft `window.DomDesktop`). `preload.js` setzt `window.DomDesktop`, `app.js` die Klasse `desktop` und Escape (Fenster zu bzw. Zurück). Bau: `.github/workflows/windows-programm.yml` auf windows-latest, kopiert die Dateien mit `desktop/app-bauen.js` (neue Ordner, die nicht ins Programm gehören, dort in `WEG` eintragen), bei Merge auf `main` als GitHub-Release `v<APP_VERSION>.0.<Lauf>` mit `DOM-Setup-….exe`. Das installierte Programm holt neue Fassungen selbst (electron-updater) und spielt sie beim Schließen ein. Nicht signiert: Windows warnt beim ersten Installieren („Weitere Informationen“ › „Trotzdem ausführen“).

## Bereiche

| Bereich | Dateien | Inhalt |
|---|---|---|
| Vorgaben (alles einstellbar) | `vorgaben.js` | Alle Annahmen mit Standardwert: `vorgabe(k)`, `vorgabeText(k, {platzhalter})`, gespeichert in `settings.vorgaben`. Seiten Rechnungen & Mahnungen, Abläufe & Listen, Aufschläge & Angebotstexte, Firmendaten, Preisliste-Editor, Suchindex. **Neue Annahme = neuer Eintrag in `VORGABEN`, nie fest im Code** |
| KI-Prompts | `core.js` (`renderNeu`, `renderTopNeu`, `bestandPromptEn`, `planPromptEn`, `eveningPrompt`), `vorgaben.js` (Seite `prompts`), `rooms.js` (`FIELD_EN`, `ROOM_EN`) | Prompts Englisch, Antworten von Bestand/Plan Deutsch. Texte in den Vorgaben (Einstellungen › KI › Prompts), `kiPromptVersion` neu/alt, `kiDeko` |
| Gemeinsame Helfer | `core.js` | Speicher (IndexedDB `kvGet/kvSet`), `$`, `esc`, `toast`, KI-Aufrufe (Gemini), Bildfunktionen, Bildschirmhöhe `--voll` |
| Startseite Heute | `heute.js` | Alles, was heute dran ist (Termine, Nachfassen, Geld, Lieferungen, Mängel, Baustarts, laufende Baustellen). Start der App und im Menü (`state.tab = 'heute'`) |
| Per Sprache anlegen | `sprache.js` | Mikrofon oben in der Kopfzeile unter dem DOM-Logo: ein Satz → KI liest Kunde, Anschrift, Projekt, Termin heraus → Prüfseite → anlegen; Termin öffnet danach den Termin-Editor |
| Suche über alles | `suche.js` | Menü › Suche (`state.tab = 'suche'`): Kunden, Projekte/Angebote, Rechnungen, Eingangsrechnungen, Termine, Subunternehmer |
| Unterlagen | `unterlagen.js` | Menü › Unterlagen (`state.tab = 'unterlagen'`): Firmenordner und Vorlagen (`firmadok:<id>` mit `bereich` 'vorlage', Datei `fdatei:<id>`, gültig bis nur Firma, Warnung auf „Heute“) |
| Wie geht das? | `hilfe.js` | Menü › Wie geht das? (`state.tab = 'hilfe'`): Frage an die KI mit `WISSEN` (bei neuen Funktionen ergänzen) und „Dorthin“-Knöpfen (`ZIELE`) |
| Navigation, Leiste | `app.js`, `index.html` | Kopfzeile (oben rechts Kalender und Mikrofon; DOM-Logo öffnet das Menü `MENUE` mit Suche, Heute, Kalender, Karte, Auswertung, Preisliste, Unterlagen, Wie geht das?, Einstellungen; unten Gerät gehört Felix/Deniel/beide und Cloud-Stand), Reiter unten Kunden/Subunternehmer/Angebote/Projekte/Rechnungen (`switchTab`), Auswahlfenster `sheet`, Projektliste (nur zugesagte: Einzuplanen/Eingeplant/In Durchführung/Abgeschlossen, `Projekt.phase(x)`), Start. `APP_VERSION` |
| Raum-Ansicht | `raum.js` | Raum: Fotos, Pakete, KI-Ergebnis, Moodboard nur für den Raum. `viewProjekt` verteilt auch die Reiter Kunden/Projekte/Angebote |
| Kunden | `kunden.js`, `kontakt.js` | Kundenkarte, Objekte nur bei Bedarf (`einObjekt(k)`: ein Objekt = Kundenanschrift, sonst Rechnungsanschrift + Objektliste), Angebote/Projekte getrennt (`angebotePrj`), Nummern ab 1001, Anrede/Briefanrede, Quelle (`k.quelle`, `QUELLEN`), Geburtstag `gebArt` gratulieren/geschenk (`Kontakt.gebArt`) |
| Subunternehmer | `partner.js` | Subunternehmer und Lieferanten, Dokumente. Preise je Position (`p.preise`, bearbeitet in `finanzen.js`) |
| Projekte | `projekt.js` | Projekt = Kunde + Objekt + Räume; **Status-Ablauf** (`ALLE`, `PHASEN`, `WEITER`), Statuskarte |
| Baufortschritt | `fortschritt.js` | Arbeitsschritte zum Abhaken, Vorlagen |
| Angebot (je Raum) | `angebot.js`, `data/preisliste.json` | Aufmaß, Positionen, Summen, PDF senden (setzt Status „versendet“), Versionen (`A.versionen`, „Änderung n“), KI-Vorschläge aus Kundenwünschen, Bauzeitenplan, Excel-Import. Gesamtangebot über alle Räume: `gesamtAngebot` in `projekt.js` (`w.gesamtAngebot`) |
| Angebote-Reiter | `angebote.js`, `schnell.js` | Liste aller Angebote (Offen/Zugesagt/Abgesagt), Schnellangebot |
| Rechnungen (Finanzen) | `finanzen.js` | Reiter „Rechnungen“ unten (`rechnungen`): Abzurechnen, offene Rechnungen, Eingangsrechnungen (`beleg:<id>`, Datei in `bdatei:<id>`, KI liest aus), Kalkulation Soll/Ist mit Ampel (auch im Projekt und beim Subunternehmer), Auswertung (Umsatz, Zusagequote, Marge, Kundenquellen, Absagegründe; eigene Seite im Menü, `auswertungView`, `state.tab = 'auswertung'`); offene Rechnungen an Kunden aus `rechnung.js` |
| Rechnungen an Kunden | `rechnung.js` | Abschläge nach Plan, Schlussrechnung aus den Angeboten + Nachträge (`w.nachtraege`), PDF, bezahlt, Zahlungserinnerung/Mahnung (`rechnung:<id>`, Nummern `rechnungZaehler`) |
| Kontakt halten | `pflege.js` | Regelmäßig anrufen und Mittagessen bei Kunden und Partnern: Abschnitt in der Karte, „Heute“, Kalender, Mitteilungen (siehe Version 92) |
| Kalender & Terminmails | `kalender.js`, `supabase/functions/termin-mail/index.ts` | Mail-Vorschau im Termin (`mailNachbau` baut die Mail der Cloud nach, bei Änderungen an `mailHtml` mitändern). Termine (Kundentermin kann gleich ein Projekt „Besichtigung“ anlegen), Geburtstage, Mails an Team/Kunde/Subunternehmer, Erinnerungen (Cron in Supabase) |
| Baustelle | `baustelle.js` | Bestellungen beim Lieferanten (`w.bestellungen`), Abnahmeprotokoll mit Unterschrift auf dem Handy und Mängeln (`w.abnahme`), PDF |
| Fotos & Doku | `bilder.js` | Ordner je Objekt/Projekt |
| Raumscan, Grundriss, 3D | `raumscan.js`, `vendor/three/` | Scans in `w.vorOrt.scans[]` mit `geo` (Wände, Türen, Fenster, Möbel aus RoomPlan, `DomRaumScan.geo` in `DomGeraet.swift`) und `abgelegt` (Bild-IDs `grundMit/grundOhne/dreiMit/dreiOhne`, `masstab` Bildpunkte je m, `pdf`). Nach dem Scan `Raumscan.pruefen` („Nochmal scannen“ oder „Ablegen“), dann `Raumscan.ausgangAblegen`: Grundriss und 3D-Bild je mit und ohne Möbel in den Bilder-Ordner `ordnerPlaene`, Grundriss-PDF in `w.dokumente` (`art: 'grundriss'`). `Raumscan.ansehen`: Grundriss (Canvas) mit Möbel/Maße an-aus; „Reinzeichnen“ über `zeichnen.js` auf dem abgelegten Original, Ergebnis als neues Bild „… (bearbeitet)“ (`zeichnung: { von, striche, masstab }`). Kein Senden oder Teilen im Raumscan (Felix: das ist Vor-Ort-Aufnahme, geteilt wird aus der abgelegten Datei); 3D mit three.js r147 (erst bei Bedarf geladen). Ganze Wohnung (ab iOS 17): `Geraet.raumScannen({ wohnung: true })` scannt Raum für Raum in einer AR-Sitzung (`stop(pauseARSession: false)`, `RoomBuilder`, `StructureBuilder`), `Raumscan.wohnungAus` baut den Scan mit `ganz: true` und Raumnamen (`geo.namen`). Raum aus Scan: `Projekt._intern.raumAusScan`, `Raumscan.masseIn/typFuer/sheetEintraege` (für „Welcher Raum?“) |
| KI-Visualisierung | `core.js` (KI-Teil), `rooms.js`, `moodboards.js`, `garten.js` | Raumtypen, Moodboards Basic/Standard/Premium, Wärmepumpe im Garten |
| Gespräch vor Ort | `voice.js`, `gesprpdf.js` | Karte „Vor Ort aufnehmen“ im Projekt = Sammelstelle: Gespräch, Fotos, Pläne (Bilder-Ordner `ordnerPlaene`), LiDAR-Scans (`w.vorOrt.scans`, im Aufmaß übernehmbar). Wer dabei ist (`w.gespraech.dabei`, Sprecher im Transkript), Pause/Weiter/Beenden (`Rec`), in der iPhone-App nativ mit Hintergrund-Audio (`Geraet.aufnahme`, `DomAufnahme` in `DomGeraet.swift`, `UIBackgroundModes audio`). Zusammenfassung und Aufgaben als Text (`w.gespraech.zus`) |
| Unterlagen (PDF) | `pdf.js`, `baumappe.js` | Kundenmappe, Baumappe für Subunternehmer |
| Karte | `karte.js`, `vendor/leaflet` | Baustellen auf der Karte, eigene Seite im Menü (`Karte.view`, `state.tab = 'karte'`) |
| Einstellungen | `einstellungen.js` (`EINST`) | Im Menü (DOM-Logo), kein Reiter. Gruppen Firma, Angebote, Rechnungen, Abläufe, Technik; Suche über alle Felder (`Vorgaben.index`), „KI fragen“ |
| iPhone-Funktionen | `geraet.js`, `ios-resources/DomGeraet.swift` | Nur in der App aus TestFlight: Dokumentenscanner (Kamera oben), LiDAR-Raumscan im Aufmaß (RoomPlan), Face ID beim Öffnen, Termine in eigenen iPhone-Kalender „DOM“, Kontakte übernehmen/speichern, „An DOM teilen“ (PDF/Bilder, `Kamera.ausDatei`). Schalter je Gerät in localStorage (`dom:geraet`), Kalender/Kontakte anfangs aus. Einstellungen › iPhone-Funktionen (Vorgaben-Seite `iphone`). Route für heute in `heute.js` (Vorgabe `routeKarte`). Der Bau kopiert die Swift-Datei ins Xcode-Projekt (`projekt-ergaenzen.rb`), meldet das Plugin über `packageClassList` an, ergänzt den SceneDelegate (`scene-ergaenzen.py`), merged `info-zusatz.plist`, setzt iOS 16 |
| Mitteilungen (Push) | `push.js`, `sw.js`, `supabase/functions/push/index.ts`, `PUSH_EINRICHTEN.md` | Einstellungen › Mitteilungen: Gerät anmelden, Morgenübersicht zur Uhrzeit, Erinnerung vor Terminen (Cron in Supabase), Zahl am App-Symbol (`Push.badge` aus `heute.js`). Vorgaben-Seite `push` |
| Cloud-Abgleich & Sicherung | `sync.js`, `backup.js` | Supabase-Abgleich (Ordner „team“, feldweise Zusammenführung), Datei-Sicherung |
| Marketing (stillgelegt) | `social.js` | Vorher-Nachher-Video, Instagram. Nicht mehr eingebunden, wird nicht gebraucht |
| Design | `css/*.css` | Je Bereich eine Datei: `basis` (Farben, Kopfzeile, Leiste, Grundbausteine), `projekte`, `raum`, `angebot`, `kunden`, `bilder`, `kalender`, `finanzen`. In `index.html` in dieser Reihenfolge laden (basis zuerst). Abschnitte mit `/* ---------- Name ---------- */` |
| Offline | `sw.js`, `manifest.webmanifest` | Service Worker. Neue Datei (JS oder CSS) → in `FILES` eintragen |
| iPhone-App (TestFlight) | `.github/workflows/ios-testflight.yml`, `capacitor.config.json`, `package.json`, `ios-resources/`, `IPHONE_APP_EINRICHTEN.md` | Capacitor-Hülle, wird bei jedem Merge auf `main` auf einem macOS-Runner erzeugt, signiert und zu TestFlight hochgeladen. Signatur: `ios-resources/signatur.py` holt je Lauf ein Verteilungszertifikat und Profil „DOM CI <id>“ über die App-Store-Connect-API (Schlüssel in GitHub-Secrets). Eigene Zertifikate werden erst nach 24 Stunden gelöscht (`SIGNATUR_SCHONFRIST_STUNDEN`), sonst bleibt ein Bau, den Apple noch verarbeitet, für immer auf „wird verarbeitet“ hängen (so am 12.11. geschehen). Bauten nicht dicht hintereinander starten. Zum Testen den Workflow per „Run workflow“ auf einem Zweig starten (lädt auch hoch). Der Bau fragt mehrere Mac-Arten gleichzeitig an (Matrix `mac`, macos-15-intel bekam am 12.11. sofort einen Rechner, als die anderen stundenlang keinen hatten); der erste Rechner baut, die übrigen hören auf oder werden abgebrochen. Erfolg = ein Job „bauen (…)“ grün, der Lauf selbst kann dabei „abgebrochen“ zeigen. Kein `ios/`-Ordner im Repo. Monatlicher Lauf (cron) gegen den 90-Tage-Ablauf; beide Workflows schalten sich selbst wieder ein (60-Tage-Regel von GitHub). In der Hülle gibt es keinen Service Worker und kein Web-Push: Mitteilungen laufen dort über APNs (`push.js` `nativ()`, Plugin `@capacitor/push-notifications`, `www/capacitor.js` wird nur im Bau eingefügt; Supabase-Secrets `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`) |
| Test | `diag.html` | Bildschirm-Test (Höhen, Sicherheitsabstand) |

## Verknüpfungen zwischen den Bereichen

Alle Bereiche teilen einen Speicher (`kvGet/kvSet`, abgeglichen über `sync.js`). Verknüpft wird über IDs:

- Projekt (`wohnung:<id>`) → `kundeId`, `objektId`; Räume (`project:<id>`) → `wohnungId`; Liste in `projectIndex`.
- Angebot liegt im Raum (`r.angebot`, `r.aufmass`); `angebote.js` und `finanzen.js` lesen den Projektstatus aus `projectIndex`.
- Termin (`termin:<id>`) → `kundeId`, `objektId`, `projektId`, `partnerId`, `wer` (Team).
- Bilder (`bilder:<kundeId>:<objektId>`) → optional `projektId`.
- Eingangsrechnung (`beleg:<id>`) → `projektId`, `partnerId`; Kalkulation vergleicht die Raum-Angebote (Soll) mit den Eingangsrechnungen (Ist) je Gewerk.
- Projekt: `verlauf` (Statuswechsel), `versendetAm` (Nachfassen nach 7 Tagen), `absage.grund`, `baustart`, unterschriebenes Angebot in `auftrag:<id>`.

## Regeln

- Bei jeder Änderung `APP_VERSION` in `app.js` und `VERSION` in `sw.js` um eins erhöhen.
- Leiste unten: Das Fenster scrollt, `body` ist mindestens `--voll + 60px` hoch; nach jedem Neuzeichnen von `#main` (und bei pageshow, Tastatur zu, Rückkehr in die App) schubst `core.js` das Fenster 1 px (`leisteSchubs`), damit iOS die Leiste wieder ganz unten anlegt. Kein festes Gerüst mit `100dvh`, sonst sitzt die Leiste auf dem iPhone zu hoch.
- Keine Geheimnisse ins Repository. Der Gemini-Schlüssel liegt nur in den Einstellungen und im Cloud-Abgleich. Der Supabase-„Publishable key“ in `sync.js` ist öffentlich.
- Änderungen an `supabase/functions/termin-mail` und `supabase/functions/push` muss Felix in Supabase neu deployen.
- Felix will einfache, logische Oberflächen, die man ohne Erklärung versteht. Keine Emojis in der App.
- Alles, was die App annimmt (Prozente, Fristen, Texte, Listen), muss in den Einstellungen änderbar sein (`vorgaben.js`), wo sinnvoll zusätzlich je Projekt oder Angebot (z. B. `w.abschlagPlan`, `A.kalk`, `x.epFix`).
