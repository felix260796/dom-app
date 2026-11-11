# DOM-App: Welche Datei wofür

Diese Datei zuerst lesen. Danach nur die Dateien des Bereichs öffnen, um den es geht, nicht die ganze App.

PWA ohne Build-Schritt: reines HTML, CSS und JS. Alle Skripte werden in `index.html` der Reihe nach geladen und teilen sich globale Helfer.
Die Oberfläche ist auf Deutsch. Der Nutzer ist Felix (Dom Projektmanagement GmbH), Kollege Deniel Kovacic.

## Neuerungen aus Version 75/76

Die Leiste unten hat fünf Reiter: Kunden, Partner, Projekte, Angebote, Rechnungen. Felix wollte die Vier-Reiter-Struktur aus Version 75 (Heute/Aufträge/Kontakte/Geld) nicht, darum hat Version 76 sie wieder entfernt. Die Ziele 'auftraege' und 'kontakte' führen über `TAB_ALIAS` zu Angebote bzw. Kunden.
Angebot: „Speichern und ansehen“ legt das PDF unter `w.dokumente` ab, „Senden“ verschickt. Nach dem Senden ist das Angebot gesperrt (`w.angebotGesperrt`, `Projekt.gesperrt/gesperrtFrage/angebotKopieren`); ändern nur über eine Kopie mit neuer Nummer (`w.angebotArchiv`, `w.angebotKopieVon`).
Textfelder vor und nach den Positionen: Standard `PL.einstellungen.bausteine`, je Auftrag `w.angebotTexte` (`Angebot._intern.texteAuftrag`, `texteEinstellungen`).
Partner-Angebote übernehmen: `Angebot._intern.subUebernehmen` (Foto, PDF oder Partner-Preisliste, KI liest, Zuschlag `subZuschlag`), Zeilen als eigene Positionen mit `x.sub`.
Dokumente ansehen mit Zoom: `pdfAnsicht` in `core.js` (seit Version 85 mit PDF.js, siehe unten). Listen in den Einstellungen: `listenFeld`/`listenBinden` in `core.js`.

## Neuerungen aus Version 83

Angebotsablauf Schritt 1 „Vor Ort“: Karte „Vor Ort aufnehmen“ (`Gespraech.karte` in `voice.js`) sammelt Gespräch, Fotos, Pläne und Raumscan. „Visualisieren“ ist darunter zugeklappt (`details#wVis` in `projekt.js`) und hat mit dem Angebot nichts zu tun.
Per Sprache anlegen: Auf der Prüfseite per Sprache oder Text korrigieren (`korrigieren` in `sprache.js`).
Handler wie `onkeydown = (e) => bedingung && tu()` sind verboten: Rückgabe `false` blockiert jede Taste (so war „Ordner benennen“ kaputt).

## Neuerungen aus Version 85

Dokumente ansehen: `pdfAnsicht` in `core.js` zeichnet PDFs mit PDF.js (`vendor/pdfjs`, wird erst beim Öffnen geladen) Seite für Seite als Bild; Zoom per Knopf, zwei Finger, Doppeltipp. Kein iframe und kein „neues Fenster“ mehr (geht in der iPhone-App nicht), stattdessen Teilen-Menü. Die Seite selbst zoomt nie.
Zurück an dieselbe Stelle: `core.js` merkt bei jedem Tipp die Scroll-Stelle je Seite (Reiter + Titel + Untertitel aus `header()`) und stellt sie nach einem Tipp auf `#topback` wieder her. Neue Seiten brauchen dafür nur `header(titel, sub, { label, fn })`.
Suchfelder (`input type="search"`): Enter schließt die Tastatur (global in `core.js`). Auswahlfenster `sheet`: Textfeld ohne Autofokus, Suchfeld filtert immer (`suche`, Einträge mit `such`).
`telLink(t)` in `core.js`: Anrufen immer mit Ländervorwahl (Vorgabe `telVorwahl`).
Bilder: `Bilder.alleView` (alle Bilder nach Datum), `raster` (Markieren, PDF über `bilderPdf`), `gross` zum Durchwischen (scroll-snap), `Bilder.fotosMachen({ kundeId, objektId, projektId, ordnerId?, ordnerName? })` mit `Kamera.serie` (mehrere Fotos hintereinander, Ordner aus Vorgabe `ordnerFotos`).
Karte: Filter je Gruppe (`FILTER` in `karte.js`, gemerkt in localStorage `dom:karteFilter`). Auswertung: `auswertung(daten, rechnungen, jahr)` in `finanzen.js` mit Jahr-Auswahl. „Heute“ hat ein X (`#hZu`, zurück zu `window.__vorHeute`).
Per Sprache anlegen: Prüfseite mit Feldern untereinander, Anschrift wird über `Kunden.sucheAdresse` um PLZ und Ort ergänzt (Vorgabe `spracheAdresse`).

## Neuerungen aus Version 86

Zugesagtes Projekt (`auftragSeite` in `projekt.js`): Schritte Projektdetails, Projektfortschritt, Abnahme, Abrechnen; Kacheln Rechnung, Fotos, Bestellung, Nachtrag, Termin; „Vorbereiten“ (`todoFuellen`). Status „Zugesagt, noch einzuplanen“, kein Knopf „Baustelle läuft“ mehr. Löschen: `loeschenFragen` (Angebot eine Nachfrage, Projekt zwei, mit Rechnungen gar nicht). `Baustelle.abschnitt(el, w, list, 'bestellungen'|'abnahme')`.
Rechnung schreiben: ein Weg `Rechnung.neu(w?, fertig)` aus Projekt und Reiter (Projekt suchen, Art wählen: Abschlag nach Plan, Abschlag frei, Schlussrechnung, ohne Angebot eigene Positionen `r.eigen`). Rechnungen werden nie gelöscht, nur storniert (`art 'storno'`, `r.storniert`, beide tragen das Stornodatum in `bezahlt`, Summen gleichen sich aus; `Rechnung.gilt/istOffen`). Hinweis zur Aufbewahrung auf jeder Rechnung an Privatkunden. Vorgaben `abschlagFortschritt`, `textStorno`.
Reiter Rechnungen: Suche über alles (auch Bezahltes), zwei Knöpfe „Rechnung schreiben“ / „Eingang erfassen“, Bereiche An Kunden / Eingang / Kalkulation (`fSeg`).
GiroCode (QR zum Bezahlen) auf Rechnung und Mahnung: `qrcode.js` (`QR.giroCode`), IBAN/BIC in den Firmendaten (`PL.einstellungen.iban/bic`), Vorgabe `rechnungQr`.
Unterschrift unter PDFs: `unterschrift.js` (`Unterschrift.pdf(doc, x, y, { firma })` setzt Grußformel, Bild und Namen; je Person in `settings.unterschriften[personId]`, es unterschreibt, wem das Gerät gehört). Einstellungen › Firmendaten.

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
| Navigation, Leiste | `app.js`, `index.html` | Kopfzeile (oben rechts Kalender und Mikrofon; DOM-Logo öffnet das Menü `MENUE` mit Suche, Heute, Kalender, Karte, Auswertung, Preisliste, Unterlagen, Wie geht das?, Einstellungen; unten Gerät gehört Felix/Deniel/beide und Cloud-Stand), Reiter unten Kunden/Subunternehmer/Projekte/Angebote/Rechnungen (`switchTab`), Auswahlfenster `sheet`, Projektliste (nur zugesagte: Einzuplanen/Eingeplant/In Durchführung/Abgeschlossen, `Projekt.phase(x)`), Start. `APP_VERSION` |
| Raum-Ansicht | `raum.js` | Raum: Fotos, Pakete, KI-Ergebnis, Moodboard nur für den Raum. `viewProjekt` verteilt auch die Reiter Kunden/Projekte/Angebote |
| Kunden | `kunden.js`, `kontakt.js` | Kundenkarte, Objekte nur bei Bedarf (`einObjekt(k)`: ein Objekt = Kundenanschrift, sonst Rechnungsanschrift + Objektliste), Angebote/Projekte getrennt (`angebotePrj`), Nummern ab 1001, Anrede/Briefanrede, Quelle (`k.quelle`, `QUELLEN`), Geburtstag `gebArt` gratulieren/geschenk (`Kontakt.gebArt`) |
| Subunternehmer | `partner.js` | Subunternehmer und Lieferanten, Dokumente. Preise je Position (`p.preise`, bearbeitet in `finanzen.js`) |
| Projekte | `projekt.js` | Projekt = Kunde + Objekt + Räume; **Status-Ablauf** (`ALLE`, `PHASEN`, `WEITER`), Statuskarte |
| Baufortschritt | `fortschritt.js` | Arbeitsschritte zum Abhaken, Vorlagen |
| Angebot (je Raum) | `angebot.js`, `data/preisliste.json` | Aufmaß, Positionen, Summen, PDF senden (setzt Status „versendet“), Versionen (`A.versionen`, „Änderung n“), KI-Vorschläge aus Kundenwünschen, Bauzeitenplan, Excel-Import. Gesamtangebot über alle Räume: `gesamtAngebot` in `projekt.js` (`w.gesamtAngebot`) |
| Angebote-Reiter | `angebote.js`, `schnell.js` | Liste aller Angebote (Offen/Zugesagt/Abgesagt), Schnellangebot |
| Rechnungen (Finanzen) | `finanzen.js` | Reiter „Rechnungen“ unten (`rechnungen`): Abzurechnen, offene Rechnungen, Eingangsrechnungen (`beleg:<id>`, Datei in `bdatei:<id>`, KI liest aus), Kalkulation Soll/Ist mit Ampel (auch im Projekt und beim Subunternehmer), Auswertung (Umsatz, Zusagequote, Marge, Kundenquellen, Absagegründe; eigene Seite im Menü, `auswertungView`, `state.tab = 'auswertung'`); offene Rechnungen an Kunden aus `rechnung.js` |
| Rechnungen an Kunden | `rechnung.js` | Abschläge nach Plan, Schlussrechnung aus den Angeboten + Nachträge (`w.nachtraege`), PDF, bezahlt, Zahlungserinnerung/Mahnung (`rechnung:<id>`, Nummern `rechnungZaehler`) |
| Kalender & Terminmails | `kalender.js`, `supabase/functions/termin-mail/index.ts` | Mail-Vorschau im Termin (`mailNachbau` baut die Mail der Cloud nach, bei Änderungen an `mailHtml` mitändern). Termine (Kundentermin kann gleich ein Projekt „Besichtigung“ anlegen), Geburtstage, Mails an Team/Kunde/Subunternehmer, Erinnerungen (Cron in Supabase) |
| Baustelle | `baustelle.js` | Bestellungen beim Lieferanten (`w.bestellungen`), Abnahmeprotokoll mit Unterschrift auf dem Handy und Mängeln (`w.abnahme`), PDF |
| Fotos & Doku | `bilder.js` | Ordner je Objekt/Projekt |
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
| iPhone-App (TestFlight) | `.github/workflows/ios-testflight.yml`, `capacitor.config.json`, `package.json`, `ios-resources/`, `IPHONE_APP_EINRICHTEN.md` | Capacitor-Hülle, wird bei jedem Merge auf `main` auf einem macOS-Runner erzeugt, signiert und zu TestFlight hochgeladen. Signatur: `ios-resources/signatur.py` holt je Lauf ein Verteilungszertifikat und Profil „DOM CI <id>“ über die App-Store-Connect-API (Schlüssel in GitHub-Secrets) und löscht das des vorigen Laufs. Zum Testen den Workflow per „Run workflow“ auf einem Zweig starten. Kein `ios/`-Ordner im Repo. Monatlicher Lauf (cron) gegen den 90-Tage-Ablauf; beide Workflows schalten sich selbst wieder ein (60-Tage-Regel von GitHub). In der Hülle gibt es keinen Service Worker und kein Web-Push: Mitteilungen laufen dort über APNs (`push.js` `nativ()`, Plugin `@capacitor/push-notifications`, `www/capacitor.js` wird nur im Bau eingefügt; Supabase-Secrets `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`) |
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
