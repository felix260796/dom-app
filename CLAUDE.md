# DOM-App: Welche Datei wofür

Diese Datei zuerst lesen. Danach nur die Dateien des Bereichs öffnen, um den es geht, nicht die ganze App.

PWA ohne Build-Schritt: reines HTML, CSS und JS. Alle Skripte werden in `index.html` der Reihe nach geladen und teilen sich globale Helfer.
Die Oberfläche ist auf Deutsch. Der Nutzer ist Felix (Dom Projektmanagement GmbH), Kollege Deniel Kovacic.

## Bereiche

| Bereich | Dateien | Inhalt |
|---|---|---|
| Vorgaben (alles einstellbar) | `vorgaben.js` | Alle Annahmen mit Standardwert: `vorgabe(k)`, `vorgabeText(k, {platzhalter})`, gespeichert in `settings.vorgaben`. Seiten Rechnungen & Mahnungen, Abläufe & Listen, Aufschläge & Angebotstexte, Firmendaten, Preisliste-Editor, Suchindex. **Neue Annahme = neuer Eintrag in `VORGABEN`, nie fest im Code** |
| Gemeinsame Helfer | `core.js` | Speicher (IndexedDB `kvGet/kvSet`), `$`, `esc`, `toast`, KI-Aufrufe (Gemini), Bildfunktionen, Bildschirmhöhe `--voll` |
| Startseite Heute | `heute.js` | Alles, was heute dran ist (Termine, Nachfassen, Geld, Lieferungen, Mängel, Baustarts, laufende Baustellen). Start der App und im Menü (`state.tab = 'heute'`) |
| Per Sprache anlegen | `sprache.js` | Mikrofon oben in der Kopfzeile unter dem DOM-Logo: ein Satz → KI liest Kunde, Anschrift, Projekt, Termin heraus → Prüfseite → anlegen; Termin öffnet danach den Termin-Editor |
| Suche über alles | `suche.js` | Menü › Suche (`state.tab = 'suche'`): Kunden, Projekte/Angebote, Rechnungen, Eingangsrechnungen, Termine, Subunternehmer |
| Unterlagen | `unterlagen.js` | Menü › Unterlagen (`state.tab = 'unterlagen'`): Firmenordner (`firmadok:<id>`, Datei `fdatei:<id>`, gültig bis, Warnung auf „Heute“) und Unterlagen aus den Projekten (Rechnungen, unterschriebene Angebote, Abnahmen, Eingangsrechnungen) |
| Wie geht das? | `hilfe.js` | Menü › Wie geht das? (`state.tab = 'hilfe'`): Frage an die KI mit `WISSEN` (bei neuen Funktionen ergänzen) und „Dorthin“-Knöpfen (`ZIELE`) |
| Navigation, Leiste | `app.js`, `index.html` | Kopfzeile (DOM-Logo öffnet das Menü `MENUE` mit Suche, Heute, Kalender, Karte, Auswertung, Preisliste, Unterlagen, Wie geht das?, Einstellungen; unten Gerät gehört Felix/Deniel/beide und Cloud-Stand; darunter nur das Mikrofon), Reiter unten Kunden/Subunternehmer/Projekte/Angebote/Rechnungen (`switchTab`), Auswahlfenster `sheet`, Projektliste (Bereiche Angebot/Auftrag/Abrechnung/Erledigt), Start. `APP_VERSION` |
| Raum-Ansicht | `raum.js` | Raum: Fotos, Pakete, KI-Ergebnis, Moodboard nur für den Raum. `viewProjekt` verteilt auch die Reiter Kunden/Projekte/Angebote |
| Kunden | `kunden.js`, `kontakt.js` | Kundenkarte, Objekte (Anschriften), Nummern ab 1001, Anrede/Briefanrede, Quelle (`k.quelle`, `QUELLEN`) |
| Subunternehmer | `partner.js` | Subunternehmer und Lieferanten, Dokumente. Preise je Position (`p.preise`, bearbeitet in `finanzen.js`) |
| Projekte | `projekt.js` | Projekt = Kunde + Objekt + Räume; **Status-Ablauf** (`ALLE`, `PHASEN`, `WEITER`), Statuskarte |
| Baufortschritt | `fortschritt.js` | Arbeitsschritte zum Abhaken, Vorlagen |
| Angebot (je Raum) | `angebot.js`, `data/preisliste.json` | Aufmaß, Positionen, Summen, PDF senden (setzt Status „versendet“), Versionen (`A.versionen`, „Änderung n“), KI-Vorschläge aus Kundenwünschen, Bauzeitenplan, Excel-Import. Gesamtangebot über alle Räume: `gesamtAngebot` in `projekt.js` (`w.gesamtAngebot`) |
| Angebote-Reiter | `angebote.js`, `schnell.js` | Liste aller Angebote (Offen/Zugesagt/Abgesagt), Schnellangebot |
| Rechnungen (Finanzen) | `finanzen.js` | Reiter „Rechnungen“ unten (`rechnungen`): Abzurechnen, offene Rechnungen, Eingangsrechnungen (`beleg:<id>`, Datei in `bdatei:<id>`, KI liest aus), Kalkulation Soll/Ist mit Ampel (auch im Projekt und beim Subunternehmer), Auswertung (Umsatz, Zusagequote, Marge, Kundenquellen, Absagegründe; eigene Seite im Menü, `auswertungView`, `state.tab = 'auswertung'`); offene Rechnungen an Kunden aus `rechnung.js` |
| Rechnungen an Kunden | `rechnung.js` | Abschläge nach Plan, Schlussrechnung aus den Angeboten + Nachträge (`w.nachtraege`), PDF, bezahlt, Zahlungserinnerung/Mahnung (`rechnung:<id>`, Nummern `rechnungZaehler`) |
| Kalender & Terminmails | `kalender.js`, `supabase/functions/termin-mail/index.ts` | Termine (Kundentermin kann gleich ein Projekt „Besichtigung“ anlegen), Geburtstage, Mails an Team/Kunde/Subunternehmer, Erinnerungen (Cron in Supabase) |
| Baustelle | `baustelle.js` | Bestellungen beim Lieferanten (`w.bestellungen`), Abnahmeprotokoll mit Unterschrift auf dem Handy und Mängeln (`w.abnahme`), PDF |
| Fotos & Doku | `bilder.js` | Ordner je Objekt/Projekt |
| KI-Visualisierung | `core.js` (KI-Teil), `rooms.js`, `moodboards.js`, `garten.js` | Raumtypen, Moodboards Basic/Standard/Premium, Wärmepumpe im Garten |
| Gespräch vor Ort | `voice.js` | Sprachaufnahme, Transkript, Kundenwünsche |
| Unterlagen (PDF) | `pdf.js`, `baumappe.js` | Kundenmappe, Baumappe für Subunternehmer |
| Karte | `karte.js`, `vendor/leaflet` | Baustellen auf der Karte, eigene Seite im Menü (`Karte.view`, `state.tab = 'karte'`) |
| Einstellungen | `einstellungen.js` (`EINST`) | Im Menü (DOM-Logo), kein Reiter. Gruppen Firma, Angebote, Rechnungen, Abläufe, Technik; Suche über alle Felder (`Vorgaben.index`), „KI fragen“ |
| Mitteilungen (Push) | `push.js`, `sw.js`, `supabase/functions/push/index.ts`, `PUSH_EINRICHTEN.md` | Einstellungen › Mitteilungen: Gerät anmelden, Morgenübersicht zur Uhrzeit, Erinnerung vor Terminen (Cron in Supabase), Zahl am App-Symbol (`Push.badge` aus `heute.js`). Vorgaben-Seite `push` |
| Cloud-Abgleich & Sicherung | `sync.js`, `backup.js` | Supabase-Abgleich (Ordner „team“, feldweise Zusammenführung), Datei-Sicherung |
| Marketing (stillgelegt) | `social.js` | Vorher-Nachher-Video, Instagram. Nicht mehr eingebunden, wird nicht gebraucht |
| Design | `css/*.css` | Je Bereich eine Datei: `basis` (Farben, Kopfzeile, Leiste, Grundbausteine), `projekte`, `raum`, `angebot`, `kunden`, `bilder`, `kalender`, `finanzen`. In `index.html` in dieser Reihenfolge laden (basis zuerst). Abschnitte mit `/* ---------- Name ---------- */` |
| Offline | `sw.js`, `manifest.webmanifest` | Service Worker. Neue Datei (JS oder CSS) → in `FILES` eintragen |
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
- Leiste unten: Das Fenster scrollt, `body` ist mindestens `--voll + 1px` hoch. Kein festes Gerüst mit `100dvh`, sonst sitzt die Leiste auf dem iPhone zu hoch.
- Keine Geheimnisse ins Repository. Der Gemini-Schlüssel liegt nur in den Einstellungen und im Cloud-Abgleich. Der Supabase-„Publishable key“ in `sync.js` ist öffentlich.
- Änderungen an `supabase/functions/termin-mail` und `supabase/functions/push` muss Felix in Supabase neu deployen.
- Felix will einfache, logische Oberflächen, die man ohne Erklärung versteht. Keine Emojis in der App.
- Alles, was die App annimmt (Prozente, Fristen, Texte, Listen), muss in den Einstellungen änderbar sein (`vorgaben.js`), wo sinnvoll zusätzlich je Projekt oder Angebot (z. B. `w.abschlagPlan`, `A.kalk`, `x.epFix`).
