# Sanierungs-Visualisierung (Web-App fürs iPhone)

Foto vom Raum machen → KI baut den Raum in den Paketen Basic / Standard / Premium um → Vorher-Nachher-PDF mit Logo für den Kunden.

## Aufbau
- Reine Web-App (HTML/JS), kein Server nötig. Läuft auf jedem kostenlosen Hosting (GitHub Pages, Netlify).
- Moodboards, Projekte und Einstellungen liegen lokal auf dem Gerät (IndexedDB). Sicherung über „Moodboards → Exportieren“.
- KI-Bildbearbeitung: Google Gemini API (Modell `gemini-2.5-flash-image`, optional `gemini-3-pro-image-preview`). Foto + Moodboard-Text + bis zu 6 Referenzbilder gehen an das Modell.
- PDF: jsPDF, A4 quer. Deckblatt mit Ist-Zustand und Übersicht, danach eine Seite pro Paket (Vorher/Nachher + Ausstattungsliste).

## Dateien
- `app.js`: gesamte Logik (Moodboards, KI-Aufruf `renderWithGemini`, Prompt `buildPrompt`, PDF `buildPdf`)
- `social.js`: Instagram-Video (Vorher-Nachher-Wisch-Effekt, MP4 per MediaRecorder) und Post-/Karussell-Bilder, alles lokal im Browser
- `index.html`, `style.css`, `manifest.webmanifest`, `sw.js`, `icons/`, `vendor/jspdf.umd.min.js`

## Aufs iPhone bringen
1. App online stellen (HTTPS), z. B. GitHub Pages.
2. Auf dem iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
3. In der App unter Einstellungen den Gemini-API-Schlüssel eintragen (https://aistudio.google.com/apikey), Firmenname und Logo hinterlegen.
