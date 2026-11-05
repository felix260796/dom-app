# Sanierungs-Visualisierung (Web-App fürs iPhone)

Foto vom Raum machen → KI baut den Raum in den Paketen Basic / Standard / Premium um → Vorher-Nachher-PDF mit Logo für den Kunden.

## Aufbau
- Reine Web-App (HTML/JS), kein Server nötig. Läuft auf jedem kostenlosen Hosting (GitHub Pages, Netlify).
- Moodboards, Projekte und Einstellungen liegen lokal auf dem Gerät (IndexedDB). Sicherung über „Moodboards → Exportieren“.
- KI-Bildbearbeitung: Google Gemini API (Modell `gemini-2.5-flash-image`, optional `gemini-3-pro-image-preview`). Foto + Moodboard-Text + bis zu 6 Referenzbilder gehen an das Modell.
- PDF: jsPDF, A4 quer. Deckblatt mit Ist-Zustand und Übersicht, danach eine Seite pro Paket (Vorher/Nachher + Ausstattungsliste).

## Aufmaß, Angebot, Bauzeitenplan (`angebot.js`)
- Im Projekt unter „4. Aufmaß & Angebot“: Räume aufmessen (Länge × Breite, Teilflächen, Höhe, Türen/Fenster, Duschbereich). Daraus Boden-, Wand-, Deckenfläche, Umfang, Sockel.
- Paket-Vorlagen (Einstellungen → Paket-Vorlagen): je Paket und Raumgruppe (Bad/WC, Küche, Wohnräume) Positionen der Preisliste mit Mengenformel, z. B. `wandbis(1.2) + duschwand*(hoehe-1.2)`.
- Preise wie im Excel-Angebotstool: EP = (Lohn × (1 + Aufschlag) + Material × (1 + Materialaufschlag)) × (1 + Wagnis). Standardpreise in `data/preisliste.json` (Schätzwerte aus dem Angebotstool v3). Eigene Preise: Einstellungen → „Excel-Angebotstool laden“, sie bleiben nur auf dem Gerät.
- Angebots-PDF (A4 hoch) im Layout des Musterangebots, optional mit Bauzeitenplan und Visualisierung. Positionen lassen sich fürs Excel-Blatt „Eingabe“ kopieren.
- Bauzeitenplan: Richtwerte pro Gewerk (Menge je Arbeitstag) plus Trocknungszeiten, Mo bis Fr.

## Dateien
- `app.js`: gesamte Logik (Moodboards, KI-Aufruf `renderWithGemini`, Prompt `buildPrompt`, PDF `buildPdf`)
- `angebot.js`: Aufmaß, Angebot, Bauzeitenplan, Excel-Import (`vendor/xlsx.mini.min.js`, wird erst beim Import geladen)
- `index.html`, `style.css`, `manifest.webmanifest`, `sw.js`, `icons/`, `vendor/jspdf.umd.min.js`

## Aufs iPhone bringen
1. App online stellen (HTTPS), z. B. GitHub Pages.
2. Auf dem iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
3. In der App unter Einstellungen den Gemini-API-Schlüssel eintragen (https://aistudio.google.com/apikey), Firmenname und Logo hinterlegen.
