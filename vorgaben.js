'use strict';
/* DOM – Vorgaben: alle Annahmen der App an einer Stelle, in den Einstellungen änderbar.
 * Jede Vorgabe hat einen Standardwert. Geänderte Werte liegen in state.settings.vorgaben (wird per Cloud abgeglichen).
 * vorgabe(k) liefert den Wert, vorgabeText(k, { nr, betrag, … }) setzt Platzhalter wie {nr} ein.
 * Seiten: 'rechnungen' (Rechnungen & Mahnungen), 'ablauf' (Abläufe & Listen) und in 'preise' Aufschläge, Angebotstexte,
 * Firmendaten und die Preisliste selbst (gespeichert in 'preisliste').
 * Wird vor allen Bereichen geladen; nutzt app.js-Helfer erst zur Laufzeit. */
const VORGABEN = {
  rechnungen: [
    ['Zahlung', [
      { k: 'zahlungsziel', l: 'Zahlungsziel in Tagen', t: 'zahl', d: 14 },
      { k: 'abschlagPlan', l: 'Abschläge in % (der letzte Teil kommt mit der Schlussrechnung)', t: 'plan', d: [30, 40, 30], h: 'Je Projekt kannst du im Projekt einen eigenen Plan eintragen.' },
      { k: 'mahnFrist', l: 'Neue Frist bei Erinnerung und Mahnung in Tagen', t: 'zahl', d: 7 },
    ]],
    ['Texte auf der Rechnung', [
      { k: 'textRechnungAbschlag', l: 'Einleitung Abschlagsrechnung', t: 'text', d: 'vielen Dank für Ihren Auftrag. Vereinbarungsgemäß berechnen wir Ihnen eine Abschlagszahlung von {prozent} % der Auftragssumme.' },
      { k: 'textRechnungSchluss', l: 'Einleitung Schlussrechnung', t: 'text', d: 'vielen Dank für Ihren Auftrag. Für die ausgeführten Leistungen berechnen wir Ihnen:' },
      { k: 'textZahlung', l: 'Zahlungsaufforderung', t: 'text', d: 'Bitte überweisen Sie den Betrag von {betrag} bis zum {faellig} unter Angabe der Rechnungsnummer {nr}.' },
      { k: 'textAufbewahrung', l: 'Hinweis auf der Schlussrechnung', t: 'text', d: 'Bitte bewahren Sie diese Rechnung zwei Jahre auf (§ 14b UStG).' },
      { k: 'textGruss', l: 'Grußformel', t: 'zeile', d: 'Mit freundlichen Grüßen' },
    ]],
    ['Zahlungserinnerung und Mahnungen', [
      { k: 'textErinnerung', l: 'Zahlungserinnerung', t: 'text', d: 'sicher ist es Ihrer Aufmerksamkeit entgangen: Für unsere {art} Nr. {nr} vom {datum}, fällig am {faellig}, konnten wir bisher keinen Zahlungseingang feststellen.' },
      { k: 'textMahnung1', l: '1. Mahnung', t: 'text', d: 'trotz unserer Zahlungserinnerung vom {vorher} ist der Betrag für unsere {art} Nr. {nr} vom {datum} noch offen.' },
      { k: 'textMahnung2', l: '2. Mahnung', t: 'text', d: 'trotz unserer 1. Mahnung vom {vorher} ist der Betrag für unsere {art} Nr. {nr} vom {datum} weiterhin offen. Wir bitten Sie dringend um Zahlung.' },
      { k: 'textMahnFrist', l: 'Zahlungsaufforderung in Erinnerung und Mahnung', t: 'text', d: 'Bitte überweisen Sie den offenen Betrag von {betrag} bis zum {frist}.' },
      { k: 'textMahnSchluss', l: 'Schlusssatz', t: 'text', d: 'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.' },
    ]],
    ['Begleittext beim Senden (Mail, WhatsApp)', [
      { k: 'mailAngebot', l: 'Angebot', t: 'text', d: '{anrede}\n\nvielen Dank für das angenehme Gespräch. Anbei erhalten Sie unser Angebot Nr. {nr}. Bei Fragen melden Sie sich gerne.\n\nFreundliche Grüße\n{firma}' },
      { k: 'mailRechnung', l: 'Rechnung', t: 'text', d: '{anrede}\n\nanbei erhalten Sie unsere {art} Nr. {nr} über {betrag}. Bitte überweisen Sie den Betrag bis zum {faellig}.\n\nVielen Dank und freundliche Grüße\n{firma}' },
      { k: 'mailMahnung', l: 'Erinnerung und Mahnung', t: 'text', d: '{anrede}\n\nzu unserer Rechnung Nr. {nr} vom {datum} konnten wir noch keinen Zahlungseingang feststellen. Anbei unsere {stufe}.\n\nFreundliche Grüße\n{firma}' },
    ]],
  ],
  push: [
    ['Morgenübersicht', [
      { k: 'pushMorgen', l: 'Uhrzeit der Morgenübersicht (leer = aus)', t: 'zeile', d: '07:00', h: 'Zum Beispiel 07:00. Die Mitteilung zeigt, was heute ansteht, wie die Seite „Heute“.' },
      { k: 'pushNachfassen', l: 'Angebote zum Nachfassen erwähnen', t: 'janein', d: 'ja' },
      { k: 'pushGeld', l: 'Überfällige und fällige Rechnungen erwähnen', t: 'janein', d: 'ja' },
      { k: 'pushBaustelle', l: 'Lieferungen, Mängel und Baustarts erwähnen', t: 'janein', d: 'ja' },
    ]],
    ['Termine', [
      { k: 'pushTermin', l: 'Erinnerung so viele Minuten vor jedem Termin (0 = aus)', t: 'zahl', d: 60, h: 'Es zählen die Termine der Person, der dieses Gerät gehört (unten im Menü einstellbar).' },
    ]],
    ['App-Symbol', [
      { k: 'appBadge', l: 'Zahl der offenen Punkte am App-Symbol zeigen', t: 'janein', d: 'ja' },
    ]],
  ],
  ablauf: [
    ['Angebote', [
      { k: 'nachfassenTage', l: 'Hinweis „Nachfassen“ nach wie vielen Tagen?', t: 'zahl', d: 7 },
      { k: 'absageGruende', l: 'Gründe für eine Absage (eine Zeile je Grund)', t: 'liste', d: ['Zu teuer', 'Anderer Anbieter', 'Macht es selbst', 'Kein Bedarf mehr', 'Zeitpunkt passt nicht', 'Keine Rückmeldung', 'Sonstiges'] },
    ]],
    ['Unterlagen (Menü): Firmenordner und Vorlagen', [
      { k: 'firmaDokArten', l: 'Arten von Firmendokumenten (eine Zeile je Art)', t: 'liste', d: ['Gewerbeanmeldung', 'Handelsregisterauszug', 'Betriebshaftpflicht', 'Freistellungsbescheinigung (§ 48b)', 'Unbedenklichkeitsbescheinigung Finanzamt', 'Unbedenklichkeitsbescheinigung Krankenkasse', 'Berufsgenossenschaft', 'Gesellschaftsvertrag', 'Sonstiges'] },
      { k: 'vorlageArten', l: 'Arten von Vorlagen (eine Zeile je Art)', t: 'liste', d: ['Abnahmeprotokoll', 'Regiebericht', 'Mängelanzeige', 'Bauzeitenplan', 'Checkliste Baustelle', 'Auftragsbestätigung', 'Sonstiges'] },
      { k: 'firmaDokWarnTage', l: 'Auf „Heute“ warnen, so viele Tage bevor ein Dokument abläuft', t: 'zahl', d: 30 },
    ]],
    ['Kalkulation', [
      { k: 'ampelGut', l: 'Marge grün ab %', t: 'zahl', d: 20 },
      { k: 'ampelKnapp', l: 'Marge gelb ab % (darunter rot)', t: 'zahl', d: 10 },
    ]],
    ['Kalender und Geburtstage', [
      { k: 'kalKW', l: 'Kalenderwoche (KW) im Kalender links anzeigen', t: 'janein', d: 'ja' },
      { k: 'terminVorlagen', l: 'Termin-Vorlagen (eine Zeile je Vorlage: Titel | Art | Notiz)', t: 'liste', d: [
        'Erstgespräch | kunde | Wünsche und Budget klären, Fotos machen, Termin für Vor-Ort-Besichtigung vereinbaren',
        'Vor-Ort-Termin | kunde | Gespräch aufnehmen, alle Räume fotografieren, Maße nehmen, Anschriften prüfen',
        'Bauabnahme | baustelle | Abnahmeprotokoll mit Unterschrift, Mängel mit Frist festhalten, Fotos machen',
        'Begehung | baustelle | Baufortschritt prüfen, Fotos machen, offene Punkte mit Subunternehmer klären',
      ], h: 'Art: kunde, baustelle, buero oder privat. Die Vorlagen stehen beim neuen Termin klein unter dem Titel.' },
    ]],
    ['Datensicherung', [
      { k: 'excelSicherungTage', l: 'An die Excel-Sicherung erinnern nach so vielen Tagen (0 = nie)', t: 'zahl', d: 7, h: 'Die Erinnerung steht auf „Heute“. Die Sicherung selbst: Einstellungen › Datensicherung.' },
    ]],
    ['Startseite „Heute“', [
      { k: 'heuteStart', l: 'Beim Öffnen der App mit „Heute“ starten', t: 'janein', d: 'ja', h: 'Sonst startet die App bei den Kunden. „Heute“ erreichst du immer über das Menü (DOM-Logo oben).' },
      { k: 'heuteVorlauf', l: 'Fälliges so viele Tage vorher zeigen', t: 'zahl', d: 3 },
    ]],
    ['Per Sprache anlegen (Mikrofon oben)', [
      { k: 'spracheDauer', l: 'Termin dauert so viele Minuten, wenn keine Endzeit gesagt wird', t: 'zahl', d: 60 },
      { k: 'spracheProjekt', l: 'Bei Kundenterminen gleich ein Projekt „Besichtigung“ vorschlagen', t: 'janein', d: 'ja' },
    ]],
    ['Baustelle', [
      { k: 'textAbnahme', l: 'Text im Abnahmeprotokoll', t: 'text', d: 'Die oben genannten Leistungen wurden am {datum} gemeinsam begangen und {ergebnis} abgenommen. Mit der Abnahme beginnt die Gewährleistungsfrist. Aufgeführte Mängel beseitigt der Auftragnehmer innerhalb der genannten Fristen.' },
    ]],
  ],
  // Bereichs-Einstellungen (Schnellzugriff: Tipp auf den Titel der Übersichtsseite)
  kundenEinst: [
    ['Kunden', [
      { k: 'kundenQuellen', l: 'Wie kommen Kunden zu uns? (eine Zeile je Quelle)', t: 'liste', d: ['Empfehlung', 'Google / Internet', 'Bauschild', 'Hausverwaltung', 'Stammkunde', 'Flyer / Anzeige', 'Sonstiges'] },
    ]],
    ['Geburtstage', [
      { k: 'gebArtStandard', l: 'Geburtstag: Standard für Kontakte, bei denen nichts gewählt ist', t: 'wahl', o: [['gratulieren', 'Nur gratulieren'], ['geschenk', 'Mit Geschenk']], d: 'gratulieren', h: 'Beim einzelnen Kunden oder Subunternehmer kannst du es jederzeit umstellen.' },
      { k: 'gebGeschenkTage', l: '„Geschenk besorgen“ so viele Tage vorher', t: 'zahl', d: 14 },
      { k: 'gebPruefTage', l: '„Geschenk wirklich besorgt?“ so viele Tage vorher', t: 'zahl', d: 3 },
    ]],
  ],
  partnerEinst: [
    ['Partner (Subunternehmer, Lieferanten, Außendienst)', [
      { k: 'partnerStufen', l: 'Qualitätseinstufung der Arbeit (eine Zeile je Stufe)', t: 'liste', d: ['Basic', 'Standard', 'Premium'], h: 'Beim Partner kannst du mehrere Stufen ankreuzen, z. B. Standard und Premium.' },
      { k: 'gewerkeExtra', l: 'Zusätzliche Gewerke für Eingangsrechnungen (neben denen der Preisliste)', t: 'liste', d: ['Elektro', 'Material', 'Entsorgung', 'Sonstiges'] },
    ]],
  ],
  projektEinst: [
    ['Projektnummer', [
      { k: 'projektNrFormat', l: 'Aufbau der Projektnummer', t: 'zeile', d: 'P{jahr}-{nr}', h: '{jahr} = Jahr der Zusage (z. B. 2026), {nr} = laufende Nummer dreistellig (001, 002 …). Die Nummer wird bei der Zusage einmal vergeben und ändert sich danach nicht mehr.' },
    ]],
    ['Gespräche und Nachfassen', [
      { k: 'gespraechArten', l: 'Arten der Gesprächsaufnahme (eine Zeile je Art)', t: 'liste', d: ['Vor-Ort-Besichtigung', 'Abnahmegespräch', 'Krisengespräch', 'Baubesprechung'] },
      { k: 'nachfassenKalender', l: 'Nachfassen als Eintrag in den Kalender', t: 'janein', d: 'ja', h: 'Am Tag, an dem nachgefasst werden soll (Tage siehe Abläufe & Listen), steht ein Eintrag im Kalender.' },
    ]],
  ],
  // KI-Anweisungen (Prompts). Englisch, weil die Bild-KI Englisch am genauesten umsetzt. Deutsche Erklärung jeweils darunter.
  prompts: [
    ['Welche Anweisung?', [
      { k: 'kiPromptVersion', l: 'Prompt-Version für die Bilder', t: 'wahl', o: [['neu', 'Neu (Englisch, gegliedert)'], ['alt', 'Alt (Deutsch, bis Version 67)']], d: 'neu', h: 'Zum Vergleichen: dasselbe Bad-Foto einmal mit „Neu“ und einmal mit „Alt“ berechnen. Danach die bessere Version stehen lassen.' },
      { k: 'kiDeko', l: 'Kleine Deko ins Bild (Handtücher, kleine Pflanze)', t: 'janein', d: 'nein', h: 'Nur kleine, lose Accessoires, nie Möbel. Standard ist aus.' },
    ]],
    ['Hauptbild innen', [
      { k: 'promptBild', l: 'Anweisung für das Nachher-Bild (Innenraum)', t: 'text', rows: 14, d: `Edit Image 1.
Image 1 is a photo of an existing {space}. Show the SAME {space} after a renovation in the "{package}" line. This is a renovation of a real room, NOT a new design and not a catalogue scene. Output exactly one image: the renovated version of Image 1.

KEEP EXACTLY (more important than anything else):
- Keep the original framing: same camera position, height, direction and crop. Correct only vertical lines like a tilt-shift lens. Do not widen, do not zoom out, do not invent anything outside the frame.
- Room geometry: walls, corners, ceiling, sloped ceilings and projections stay in place, same size, same vanishing lines. The room must not look larger, wider or deeper.
- Windows and doors: same position, size and shape.
- Perspective of Image 1.
- Radiators, pipes and visible installations stay where they are (they may be renewed in the new style).
{keep}
- Every fixture and piece of furniture stays in its place and size and is only renewed. ADD NOTHING that is not in the photo (no extra toilet, shower, bathtub, second washbasin, extra furniture or built-ins) unless it is explicitly listed under RENOVATE.

{facts}

RENOVATE (apply the moodboard materials to each surface):
{renovate}

LOOK:
- Photorealistic, like a photo in an architecture magazine.
- Daylight comes from the real window(s) of Image 1, from the same direction as in the photo.
- Realistic reflections on tiles, glass and fittings.
- Clean, straight, even grout lines. Tiles true to scale for the real room size (a door is about 2 m high).
- {deko}
- No people, no text, no watermarks, no construction mess. Before and after must overlay exactly.`,
        h: 'Aufbau: „Edit Image 1“ (bearbeite Bild 1), dann KEEP EXACTLY (genau so lassen: Bildausschnitt, Raumform, Fenster, Türen, Perspektive, Dachschrägen, Heizkörper, Leitungen), RENOVATE (Moodboard-Materialien je Fläche) und LOOK (Architekturmagazin-Foto, Tageslicht aus dem echten Fenster, echte Spiegelungen, saubere Fugen, Fliesen im richtigen Maßstab). Platzhalter: {space} Raumart, {package} Ausstattungslinie, {keep} was je Raumtyp bleibt, {facts} Maße und Bestand, {renovate} Plan bzw. Moodboard, {deko} Deko-Satz.' },
    ]],
    ['Hauptbild außen (Fassade, Garten)', [
      { k: 'promptBildAussen', l: 'Anweisung für das Nachher-Bild (außen)', t: 'text', rows: 12, d: `Edit Image 1.
Image 1 is a photo of an existing {space} (outdoor view). Show the SAME {space} after a renovation in the "{package}" line. This is a renovation of a real place, NOT a new design. Output exactly one image: the renovated version of Image 1.

KEEP EXACTLY (more important than anything else):
- Keep the original framing: same camera position, height, direction and crop. Correct only vertical lines like a tilt-shift lens. Do not widen, do not zoom out, do not invent anything outside the frame.
{keep}
- Sky, weather, neighbouring buildings, cars, trees and street stay as they are unless listed under RENOVATE.

{facts}

RENOVATE (apply the moodboard materials to each surface):
{renovate}

LOOK:
- Photorealistic, like a photo in an architecture magazine.
- Same daylight and sun direction as in the photo, realistic shadows and reflections on glass.
- Clean edges and joints, materials true to scale.
- No people, no text, no watermarks, no scaffolding. Before and after must overlay exactly.`,
        h: 'Wie innen, nur für Fassade und Garten: Bildausschnitt, Gebäudeform, Fenster, Umgebung bleiben, das Moodboard wird auf die Flächen gelegt.' },
    ]],
    ['Draufsicht', [
      { k: 'promptDraufsicht', l: 'Anweisung für die Draufsicht', t: 'text', rows: 10, d: `The photos show a real {space} BEFORE renovation, from different angles.
Create ONE new image: a photorealistic 3D dollhouse cutaway of the fully renovated {space} in the "{package}" line. Camera looks down from above at about 60 degrees, the ceiling is removed, all walls, windows and doors are visible, the whole room at one glance. Output exactly one image.

KEEP EXACTLY:
- Floor plan, room shape, proportions and size exactly like the real room (from the photos and measurements). A small room stays small.
- Windows, doors, sloped ceilings, projections and every fixture in the same place as in the photos, at realistic size.
- ADD NOTHING that does not exist in the room unless it is explicitly listed under RENOVATE.
- What no photo shows is completed plainly in the same style (wall, floor), without new objects.

{facts}

RENOVATE:
{renovate}

LOOK: photorealistic, bright natural light, clean and tidy. {deko} No people, no text, no dimensions, no watermarks.`,
        h: 'Puppenhaus-Schnitt von schräg oben (ca. 60 Grad), Decke weg, ganzer Raum auf einen Blick, Grundriss wie echt.' },
    ]],
    ['Abendstimmung', [
      { k: 'promptAbend', l: 'Abend innen', t: 'text', rows: 8, d: `Edit Image 1. Image 1 is a finished photorealistic visualisation ("{package}" line) in daylight. Recreate EXACTLY THIS IMAGE in an evening mood. Output exactly one image.

KEEP IDENTICAL: camera position, perspective, crop, all materials, tiles, colours, furniture, fittings, lights and objects in the same place. Add nothing, remove nothing. Only light fittings that already exist may glow.

CHANGE ONLY THE LIGHT:
- After sunset, blue hour: only deep blue dusk light through the windows, no sunlight.
- All existing lights are on and DIMMED: recessed spots, ceiling lights, wall lights, LED mirror, indirect lighting and lit niches glow in warm white light (2700 K).
- Cosy, high-end hotel atmosphere: soft light cones, gentle shadows, warm reflections on surfaces.

LOOK: photorealistic evening interior photography, correctly exposed (not too dark, details clearly visible), no people, no text, no watermarks.`,
        h: 'Gleiches Bild, nur Abendlicht: blaue Stunde draußen, alle vorhandenen Leuchten gedimmt an, warmweiß 2700 K.' },
      { k: 'promptAbendAussen', l: 'Abend außen', t: 'text', rows: 7, d: `Edit Image 1. Image 1 is a finished photorealistic visualisation ("{package}" line) in daylight. Recreate EXACTLY THIS IMAGE in an evening mood. Output exactly one image.

KEEP IDENTICAL: camera position, perspective, crop, all materials, colours and objects in the same place. Add nothing, remove nothing.

CHANGE ONLY THE LIGHT:
- Blue hour: sky deep blue to dark orange, no direct sunlight.
- Windows glow warm white from inside, facade, path and entrance lights are on (warm white, 2700 K).

LOOK: photorealistic architectural photography at dusk, correctly exposed, no people, no text, no watermarks.`,
        h: 'Für Fassade und Garten: blaue Stunde, Fenster leuchten warm, Außenlicht an.' },
    ]],
    ['Bestand und Plan (die KI antwortet weiter auf Deutsch)', [
      { k: 'promptBestand', l: 'Bestand erkennen', t: 'text', rows: 12, d: `You are an experienced building surveyor. {photos} (room type: {roomtype}) BEFORE renovation.{measures}

Describe the EXISTING STATE soberly so that an image AI does not change the room and does not invent anything. Answer in GERMAN, briefly, exactly in this format (keep the German headings):

RAUM: size (sehr klein / klein / mittel / groß), dimensions length × width × height in m ({measurehint}), shape (e.g. narrow, square, L-shape), sloped ceiling ja/nein
FENSTER UND TÜREN: number, position, approximate size
VORHANDEN: one line per item „- item – position in the room – approximate size“ (e.g. „- Badewanne – an der Stirnwand unter dem Fenster – ca. 170 × 75 cm“). All sanitary fixtures, furniture, radiators, appliances, lights.
NICHT VORHANDEN: what is usual for this room type but missing here (e.g. WC, Dusche, Badewanne, zweites Waschbecken, Heizkörper, Küchenzeile)
ANSCHLÜSSE: where water, drain, power and heating are visible or can safely be assumed
PLATZ: what realistically fits and what does not (e.g. „nur Einzelwaschtisch bis ca. 60 cm, kein Doppelwaschtisch, keine freistehende Wanne“)
{perphoto}

Only what is actually visible or measured. Invent nothing. If something is uncertain, write „unklar“.`,
        h: 'Die KI schaut sich die Fotos an und beschreibt auf Deutsch, was heute im Raum ist. Platzhalter: {photos} Satz zu den Fotos, {roomtype} Raumtyp, {measures} gemessene Maße, {measurehint} gemessen oder geschätzt, {perphoto} je Foto Blickrichtung.' },
      { k: 'promptPlan', l: 'Moodboard auf den Raum zuschneiden', t: 'text', rows: 14, d: `As an interior designer you plan the renovation of an existing {space} ({roomtype}) in the "{package}" line. An image AI will then apply your plan to the photo.

EXISTING STATE (this is how the room is today, binding):
{bestand}

MOODBOARD "{package}" (written generally for all rooms, not for this one):
{spec}
{extras}
Tailor the moodboard to EXACTLY THIS room. Rules:
1. Every existing item stays in its place and size. It is only renewed in the style of the line.
2. What does NOT exist today is NOT added, even if the moodboard mentions it (e.g. no toilet if there is none today). Exception: a customer wish or note explicitly asks for it AND it fits.
3. What does not fit is reduced to the fitting variant (e.g. single vanity in today's width instead of a double vanity, bathtub stays a bathtub in today's size, no kitchen island without space).
4. Surfaces (walls, floor, ceiling, tiles, colours, light, fittings) are fully taken from the moodboard, tile formats to scale with the real room size.
5. Customer wishes override the moodboard, but only within what is physically possible. Later statements override earlier ones.

Answer in GERMAN, briefly, exactly in this format (keep the German headings):
ERNEUERN:
- item (position, size as today): new version
OBERFLÄCHEN:
- area: finish
ÄNDERUNGEN LAUT KUNDENWUNSCH: (only if explicitly requested, otherwise „keine“)
NICHT EINBAUEN:
- moodboard item or object: short reason`,
        h: 'Die KI schneidet das Moodboard auf genau diesen Raum zu (nichts dazu, was es nicht gibt) und antwortet auf Deutsch. Platzhalter: {space}, {roomtype}, {package}, {bestand}, {spec} Moodboard, {extras} Produkte, Kundenwünsche, Hinweis.' },
    ]],
    ['Deko-Sätze', [
      { k: 'promptDekoAn', l: 'Satz, wenn Deko an ist', t: 'text', d: 'Styling: only a few small loose accessories are allowed (e.g. neatly folded towels, one small plant). No furniture, no rugs, no large objects.' },
      { k: 'promptDekoAus', l: 'Satz, wenn Deko aus ist', t: 'text', d: 'No decoration: no towels, plants, accessories or styling props.' },
    ]],
  ],
};
const VORGABE_FELDER = Object.fromEntries(Object.values(VORGABEN).flatMap((g) => g.flatMap(([, f]) => f)).map((f) => [f.k, f]));
function vorgabe(k) {
  const v = state.settings.vorgaben?.[k];
  if (v !== undefined && v !== null && v !== '') return v;
  // ältere Speicherorte (vor den Vorgaben)
  if (k === 'zahlungsziel' && state.settings.zahlungsziel) return +state.settings.zahlungsziel;
  if (k === 'abschlagPlan' && state.settings.abschlagPlan?.length) return state.settings.abschlagPlan;
  return VORGABE_FELDER[k]?.d;
}
function vorgabeText(k, vars = {}) {
  return String(vorgabe(k) ?? '').replace(/\{(\w+)\}/g, (m, n) => (vars[n] !== undefined && vars[n] !== null ? String(vars[n]) : m));
}
/** „30 / 40 / 30“ → [30, 40, 30]; null, wenn es nicht 100 % ergibt. */
function planLesen(s) {
  const p = String(s).split(/[^\d,.]+/).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => x > 0);
  return p.length && Math.round(p.reduce((a, b) => a + b, 0)) === 100 ? p : null;
}

window.Vorgaben = (() => {
  const PLATZHALTER = {
    rechnungen: '{nr} Nummer, {art} Art der Rechnung, {betrag} Betrag, {datum} Rechnungsdatum, {faellig} fällig am, {frist} neue Frist, {prozent} Abschlag in %, {vorher} Datum der letzten Mahnung, {stufe} Erinnerung/Mahnung, {anrede} Briefanrede, {firma} Firmenname',
    ablauf: 'im Abnahmetext: {datum} Datum der Abnahme, {ergebnis} „ohne Mängel“ oder „mit den aufgeführten Mängeln“',
  };
  /** Einstellungsseite für eine Gruppe von Vorgaben. */
  // Zusätzlicher Bereich oben auf einer Seite (z. B. Mitteilungen: Gerät anmelden)
  const seiteKopf = {
    push: (el) => window.Push?.karte(el),
    projektEinst: (el) => { el.innerHTML = `<div class="docs" style="margin-bottom:8px"><button class="doc" id="zuBau"><span class="d-ico grey">${icon('check')}</span><span class="d-t"><b>Vorlagen für den Baufortschritt</b><span>Arbeitsschritte je Raumtyp</span></span>${icon('chevron', 'pc-chev')}</button></div>`; $('#zuBau', el).onclick = () => { einstellungSeite('bau'); window.scrollTo(0, 0); }; },
    prompts: (el) => { el.innerHTML = '<p class="hint" style="margin-top:0">Das sind die Anweisungen, die die App an die Bild-KI schickt. Sie sind auf Englisch, weil die KI Englisch am genauesten umsetzt. Unter jedem Feld steht auf Deutsch, was es bewirkt. Wörter in geschweiften Klammern füllt die App selbst aus, die bitte stehen lassen. „Standard“ holt den ursprünglichen Text zurück.</p>'; },
  };
  function seite(id, kopf = seiteKopf[id]) {
    const S = state.settings;
    S.vorgaben ??= {};
    const wert = (f) => { const v = vorgabe(f.k); return f.t === 'plan' ? v.join(' / ') : f.t === 'liste' ? v.join('\n') : v; };
    const feld = (f) => {
      const geaendert = S.vorgaben[f.k] !== undefined && S.vorgaben[f.k] !== '';
      const kopf = `<div class="vg-l"><label>${esc(f.l)}</label>${geaendert ? `<button type="button" class="vg-std" data-std="${f.k}">Standard</button>` : ''}</div>`;
      const inp = f.t === 'janein' ? `<select data-vg="${f.k}"><option value="ja" ${wert(f) === 'ja' ? 'selected' : ''}>Ja</option><option value="nein" ${wert(f) === 'nein' ? 'selected' : ''}>Nein</option></select>`
        : f.t === 'wahl' ? `<select data-vg="${f.k}">${f.o.map(([v, n]) => `<option value="${esc(v)}" ${wert(f) === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`
        : f.t === 'text' || f.t === 'liste' ? `<textarea data-vg="${f.k}" rows="${f.t === 'liste' ? Math.max(3, wert(f).split('\n').length) : f.rows || 4}">${esc(wert(f))}</textarea>`
        : `<input type="text" data-vg="${f.k}" ${f.t === 'zahl' ? 'inputmode="decimal"' : ''} value="${esc(wert(f))}">`;
      return kopf + inp + (f.h ? `<p class="hint" style="margin:4px 0 0">${esc(f.h)}</p>` : '');
    };
    main().innerHTML = (kopf ? '<div id="vgKopf"></div>' : '') + VORGABEN[id].map(([titel, felder]) => `<div class="sec-h"><h2>${esc(titel)}</h2></div><div class="card kform vg">${felder.map(feld).join('')}</div>`).join('')
      + (PLATZHALTER[id] ? `<p class="hint">Platzhalter in Texten: ${esc(PLATZHALTER[id])}</p>` : '');
    if (kopf) kopf($('#vgKopf'));
    $$('[data-vg]').forEach((el) => (el.onchange = async () => {
      const f = VORGABE_FELDER[el.dataset.vg];
      let v = el.value;
      if (f.t === 'zahl') { v = parseFloat(v.replace(',', '.')); if (!Number.isFinite(v) || v < 0) return toast('Bitte eine Zahl eintragen.'); }
      if (f.t === 'plan') { v = planLesen(v); if (!v) return toast('Die Anteile müssen zusammen 100 % ergeben.', 4000); }
      if (f.t === 'liste') v = v.split('\n').map((x) => x.trim()).filter(Boolean);
      if (f.t === 'text' || f.t === 'zeile') v = v.trim();
      S.vorgaben[f.k] = v;
      await saveSettings(); toast('Gespeichert');
      window.Push?.abgleich();
      const y = window.scrollY; seite(id); window.scrollTo(0, y);
    }));
    $$('[data-std]').forEach((b) => (b.onclick = async () => {
      delete S.vorgaben[b.dataset.std];
      if (b.dataset.std === 'zahlungsziel') delete S.zahlungsziel;
      if (b.dataset.std === 'abschlagPlan') delete S.abschlagPlan;
      await saveSettings(); toast('Standard wiederhergestellt'); window.Push?.abgleich();
      const y = window.scrollY; seite(id); window.scrollTo(0, y);
    }));
  }

  // ---------- Preisliste & Angebot: Aufschläge, Texte, Firmendaten, Positionen ----------
  const PL_ZAHLEN = [['aufLohn', 'Aufschlag auf Lohn (Subunternehmer) in %', true], ['aufMat', 'Aufschlag auf Material in %', true], ['wagnis', 'Wagnis und Gewinn in %', true], ['mwst', 'Mehrwertsteuer in %', true], ['spanne', 'Spanne der Preisrichtung vor Ort ± %', true], ['gueltig', 'Angebot gültig (Tage)', false]];
  const PL_TEXTE = [['textLeistung', 'Ausführung und Leistungsumfang'], ['textBauseits', 'Bauseits zu stellen'], ['textZahlung', 'Zahlungsbedingungen'], ['textGewaehr', 'Gewährleistung'], ['textWiderruf', 'Widerruf'], ['textAuftrag', 'Auftragserteilung'], ['hinweise', 'Weitere Hinweise (eine Zeile je Hinweis)']];
  const PL_FIRMA = [['firma', 'Firmenname'], ['strasse', 'Straße'], ['ort', 'PLZ und Ort'], ['telefon', 'Telefon'], ['email', 'E-Mail'], ['ansprechpartner', 'Ansprechpartner'], ['ustid', 'USt-IdNr.'], ['sitz', 'Sitz'], ['hrb', 'Handelsregister'], ['gf', 'Geschäftsführer'], ['bank', 'Bankverbindung']];
  async function preisKarten(box) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    const sichern = async () => { await kvSet('preisliste', PL); toast('Gespeichert'); };
    box.innerHTML = `
      <div class="sec-h"><h2>Aufschläge</h2></div>
      <div class="card kform vg">${PL_ZAHLEN.map(([k, l, pr]) => `<label>${esc(l)}</label><input type="text" inputmode="decimal" data-ple="${k}" data-pr="${pr ? 1 : 0}" value="${esc(String(pr ? Math.round((E[k] || 0) * 1000) / 10 : E[k] ?? '').replace('.', ','))}">`).join('')}
        <p class="hint" style="margin:6px 0 0">Gilt für alle neuen Berechnungen. Im einzelnen Angebot kannst du unter „Nachkalkulation“ abweichen.</p></div>
      <div class="sec-h"><h2>Texte im Angebot</h2></div>
      <div class="card kform vg">${PL_TEXTE.map(([k, l]) => `<label>${esc(l)}</label><textarea data-plt="${k}" rows="3">${esc(Array.isArray(E[k]) ? E[k].join('\n') : E[k] || '')}</textarea>`).join('')}</div>
      `;
    $$('[data-ple]', box).forEach((el) => (el.onchange = async () => { const v = parseFloat(el.value.replace(',', '.')); if (!Number.isFinite(v)) return toast('Bitte eine Zahl eintragen.'); E[el.dataset.ple] = el.dataset.pr === '1' ? v / 100 : v; await sichern(); }));
    $$('[data-plt]', box).forEach((el) => (el.onchange = async () => { const k = el.dataset.plt; E[k] = k === 'hinweise' ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value.trim(); await sichern(); }));
  }
  /** Firmendaten, die auf Angeboten, Rechnungen und Protokollen stehen (Teil der Preisliste). */
  async function firmaKarte(box) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    box.innerHTML = `<div class="sec-h"><h2>Auf Angebot, Rechnung und Protokoll</h2></div>
      <div class="card kform vg">${PL_FIRMA.map(([k, l]) => `<label>${esc(l)}</label><input type="text" data-plf="${k}" value="${esc(E[k] || '')}">`).join('')}</div>`;
    $$('[data-plf]', box).forEach((el) => (el.onchange = async () => { E[el.dataset.plf] = el.value.trim(); await kvSet('preisliste', PL); toast('Gespeichert'); }));
  }
  async function preisliste(filter) {
    const PL = await window.Angebot._intern.preisliste();
    const I = window.Angebot._intern;
    header('Preisliste', `${PL.positionen.length} Positionen`, { label: 'Einstellungen', fn: () => { viewEinstellungen(); window.scrollTo(0, 0); } });
    const q = filter.toLowerCase();
    const liste = PL.positionen.filter((x) => !q || `${x.nr} ${x.text} ${x.gewerk}`.toLowerCase().includes(q));
    const gew = [...new Set(liste.map((x) => x.gewerk))];
    main().innerHTML = `<input type="search" id="plQ" value="${esc(filter)}" placeholder="Suchen, z. B. Fliesen oder FL-02" style="margin-bottom:10px">
      ${gew.map((g) => `<div class="sec-h"><h2>${esc(g)}</h2></div><div class="plist">${liste.filter((x) => x.gewerk === g).map((x) => `<button class="pcard" data-pl="${esc(x.nr)}"><span class="pc-t"><b>${esc(x.text)}</b><span class="muted">${esc(x.nr)} · Lohn ${esc(String(x.lohn).replace('.', ','))} € · Material ${esc(String(x.mat).replace('.', ','))} €${x.auf !== null && x.auf !== undefined ? ` · eigener Aufschlag ${Math.round(x.auf * 100)} %` : ''}</span><span class="ang-sum">${I.ep(x).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € / ${esc(x.einheit)}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>`).join('')}
      <button class="add-room" id="plNeu" style="width:100%;margin-top:12px">${icon('plus')} Neue Position</button>`;
    $('#plQ').oninput = debounce((e) => { preisliste(e.target.value); setTimeout(() => { const i = $('#plQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 0); }, 400);
    $$('[data-pl]').forEach((b) => (b.onclick = () => position(PL.positionen.find((x) => x.nr === b.dataset.pl), filter)));
    $('#plNeu').onclick = () => position(null, filter);
    window.scrollTo(0, 0);
  }
  async function position(x, filter) {
    const PL = await window.Angebot._intern.preisliste();
    const neu = !x;
    const p = x ? { ...x } : { nr: '', gewerk: PL.positionen[0]?.gewerk || '', text: '', einheit: 'Stück', lohn: 0, mat: 0, auf: null };
    const gew = [...new Set(PL.positionen.map((y) => y.gewerk))];
    header(neu ? 'Neue Position' : p.nr, p.gewerk, { label: 'Preisliste', fn: () => preisliste(filter) });
    const z = (v) => String(v ?? '').replace('.', ',');
    main().innerHTML = `<div class="card kform">
        <div class="row"><div><label style="margin-top:0">Nummer</label><input type="text" id="poNr" value="${esc(p.nr)}" ${neu ? '' : 'disabled'} placeholder="z. B. FL-30"></div>
          <div><label style="margin-top:0">Einheit</label><input type="text" id="poEinh" value="${esc(p.einheit)}"></div></div>
        <label>Gewerk</label><select id="poGew">${gew.map((g) => `<option ${g === p.gewerk ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <label>Leistung</label><textarea id="poText">${esc(p.text)}</textarea>
        <div class="row"><div><label>Lohn netto je Einheit</label><input type="text" inputmode="decimal" id="poLohn" value="${z(p.lohn)}"></div>
          <div><label>Material netto je Einheit</label><input type="text" inputmode="decimal" id="poMat" value="${z(p.mat)}"></div></div>
        <label>Eigener Aufschlag in % (leer = Standard)</label><input type="text" inputmode="decimal" id="poAuf" value="${p.auf !== null && p.auf !== undefined ? z(Math.round(p.auf * 1000) / 10) : ''}">
        <p class="hint" id="poEp" style="margin:6px 0 0"></p>
      </div>
      <button class="btn big block" id="poOk">${icon('check')} Speichern</button>
      ${neu ? '' : `<button class="link-danger" id="poDel">${icon('trash')} Position löschen</button>`}`;
    const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    const lesen = () => { p.nr = $('#poNr').value.trim(); p.einheit = $('#poEinh').value.trim(); p.gewerk = $('#poGew').value; p.text = $('#poText').value.trim(); p.lohn = num($('#poLohn').value); p.mat = num($('#poMat').value); p.auf = $('#poAuf').value.trim() === '' ? null : num($('#poAuf').value) / 100; };
    const zeig = () => { lesen(); $('#poEp').textContent = `Preis für den Kunden: ${window.Angebot._intern.ep(p).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € netto je ${p.einheit}`; };
    ['#poLohn', '#poMat', '#poAuf'].forEach((s) => ($(s).oninput = zeig)); zeig();
    $('#poOk').onclick = async () => {
      lesen();
      if (!p.nr || !p.text) return toast('Nummer und Leistung eintragen.');
      if (neu && PL.positionen.some((y) => y.nr === p.nr)) return toast('Diese Nummer gibt es schon.');
      const i = PL.positionen.findIndex((y) => y.nr === p.nr);
      if (i >= 0) PL.positionen[i] = { ...PL.positionen[i], ...p }; else PL.positionen.push({ ...p, status: 'eigen' });
      await kvSet('preisliste', PL); toast('Gespeichert'); preisliste(filter);
    };
    if ($('#poDel')) $('#poDel').onclick = async () => {
      if (!loeschFrage(`Position ${p.nr} löschen? Bestehende Angebote mit dieser Position verlieren die Zeile.`)) return;
      PL.positionen = PL.positionen.filter((y) => y.nr !== p.nr); await kvSet('preisliste', PL); preisliste(filter);
    };
    window.scrollTo(0, 0);
  }

  /** Suchindex über alle Einstellungen: [seite, Feldname, Stichworte, Feld-Kennung]. */
  function index() {
    const out = [];
    for (const [seiteId, gruppen] of Object.entries(VORGABEN)) for (const [g, felder] of gruppen) for (const f of felder) out.push([seiteId, f.l, g, 'vg:' + f.k]);
    for (const [k, l] of PL_ZAHLEN) out.push(['kalkulation', l, 'Aufschlag Kalkulation Preis', 'ple:' + k]);
    for (const [k, l] of PL_TEXTE) out.push(['kalkulation', 'Angebotstext: ' + l, 'Angebot Text', 'plt:' + k]);
    for (const [k, l] of PL_FIRMA) out.push(['firma', l, 'Firmendaten Briefkopf Fußzeile Angebot Rechnung', 'plf:' + k]);
    const fest = [
      ['firma', 'Firmenname und Logo', 'Logo Briefkopf'],
      ['preisliste', 'Preise einzelner Positionen', 'Lohn Material Einheitspreis Position neu löschen'],
      ['pakete', 'Excel-Angebotstool laden', 'Import Excel Preisliste zurücksetzen'],
      ['pakete', 'Was gehört in welches Paket?', 'Paket Vorlagen Basic Standard Premium Positionen'],
      ['moodboards', 'Moodboards Basic, Standard, Premium', 'Bilder Produkte Ausstattung'],
      ['team', 'Texte der Terminmails', 'Mail Termin Bestätigung Kunde Subunternehmer Team'],
      ['team', 'Erinnerungen und Bestätigung an den Kunden', 'Erinnerung automatisch Schalter'],
      ['team', 'Team: Personen im Kalender', 'Felix Deniel Mitarbeiter'],
      ['bau', 'Vorlagen für den Baufortschritt', 'Arbeitsschritte abhaken Bad Küche'],
      ['ki', 'KI-Schlüssel und Modell', 'Gemini API Schlüssel'],
      ['cloud', 'Cloud-Abgleich anmelden', 'Supabase Konto Kollege'],
      ['sicherung', 'Datensicherung als Datei', 'Export Import Backup OneDrive'],
    ];
    for (const [s, l, w] of fest) out.push([s, l, w, '']);
    return out;
  }

  return { seite, preisKarten, firmaKarte, preisliste, index };
})();
