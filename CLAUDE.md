# DOM-App: Welche Datei wofür

Diese Datei zuerst lesen. Danach nur die Dateien des Bereichs öffnen, um den es geht, nicht die ganze App.

PWA ohne Build-Schritt: reines HTML, CSS und JS. Alle Skripte werden in `index.html` der Reihe nach geladen und teilen sich globale Helfer.
Die Oberfläche ist auf Deutsch. Der Nutzer ist Felix (Dom Projektmanagement GmbH), Kollege Deniel Kovacic.

## Bereiche

| Bereich | Dateien | Inhalt |
|---|---|---|
| Gemeinsame Helfer | `core.js` | Speicher (IndexedDB `kvGet/kvSet`), `$`, `esc`, `toast`, KI-Aufrufe (Gemini), Bildfunktionen, Bildschirmhöhe `--voll` |
| Navigation, Leiste, Raum-Ansicht | `app.js`, `index.html` | Kopfzeile, Reiter unten (`switchTab`), Auswahlfenster `sheet`, Projektliste (Bereiche Angebot/Auftrag/Abrechnung/Erledigt), Raum: Fotos, Pakete, Ergebnis. `APP_VERSION` |
| Kunden | `kunden.js`, `kontakt.js` | Kundenkarte, Objekte (Anschriften), Nummern ab 1001, Anrede/Briefanrede |
| Subunternehmer | `partner.js` | Subunternehmer und Lieferanten, Dokumente |
| Projekte | `projekt.js` | Projekt = Kunde + Objekt + Räume; **Status-Ablauf** (`ALLE`, `PHASEN`, `WEITER`), Statuskarte |
| Baufortschritt | `fortschritt.js` | Arbeitsschritte zum Abhaken, Vorlagen |
| Angebot (je Raum) | `angebot.js`, `data/preisliste.json` | Aufmaß, Positionen, Summen, PDF, Bauzeitenplan, Excel-Import der Preisliste |
| Angebote-Reiter | `angebote.js`, `schnell.js` | Liste aller Angebote (Offen/Zugesagt/Abgesagt), Schnellangebot |
| Finanzen | `finanzen.js` | €-Symbol oben neben dem Kalender: Abzurechnen, offene Rechnungen; geplant: Eingangsrechnungen je Projekt, Rechnungen an Kunden, Kalkulation Soll/Ist |
| Kalender & Terminmails | `kalender.js`, `supabase/functions/termin-mail/index.ts` | Termine, Geburtstage, Mails an Team/Kunde/Subunternehmer, Erinnerungen (Cron in Supabase) |
| Fotos & Doku | `bilder.js` | Ordner je Objekt/Projekt |
| KI-Visualisierung | `core.js` (KI-Teil), `rooms.js`, `moodboards.js` (oberer Teil), `garten.js` | Raumtypen, Moodboards Basic/Standard/Premium, Wärmepumpe im Garten |
| Gespräch vor Ort | `voice.js` | Sprachaufnahme, Transkript, Kundenwünsche |
| Unterlagen (PDF) | `pdf.js`, `baumappe.js` | Kundenmappe, Baumappe für Subunternehmer |
| Karte | `karte.js`, `vendor/leaflet` | Baustellen auf der Karte |
| Einstellungen | `moodboards.js` (ab `EINST`) | Liste der Einstellungsseiten: Firma, KI, Preisliste, E-Mail-Automatisierung, Baufortschritt, Cloud, Sicherung |
| Cloud-Abgleich & Sicherung | `sync.js`, `backup.js` | Supabase-Abgleich (Ordner „team“, feldweise Zusammenführung), Datei-Sicherung |
| Marketing | `social.js` | Vorher-Nachher-Video, Instagram-Bilder |
| Design | `style.css` | Ein Stylesheet, Abschnitte mit `/* ---------- Name ---------- */` |
| Offline | `sw.js`, `manifest.webmanifest` | Service Worker. Neue Datei → in `FILES` eintragen |
| Test | `diag.html` | Bildschirm-Test (Höhen, Sicherheitsabstand) |

## Regeln

- Bei jeder Änderung `APP_VERSION` in `app.js` und `VERSION` in `sw.js` um eins erhöhen.
- Leiste unten: Das Fenster scrollt, `body` ist mindestens `--voll + 1px` hoch. Kein festes Gerüst mit `100dvh`, sonst sitzt die Leiste auf dem iPhone zu hoch.
- Keine Geheimnisse ins Repository. Der Gemini-Schlüssel liegt nur in den Einstellungen und im Cloud-Abgleich. Der Supabase-„Publishable key“ in `sync.js` ist öffentlich.
- Änderungen an `supabase/functions/termin-mail` muss Felix in Supabase neu deployen.
- Felix will einfache, logische Oberflächen, die man ohne Erklärung versteht. Keine Emojis in der App.
