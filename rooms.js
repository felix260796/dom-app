'use strict';
/* Raumtypen mit eigenen Feldern und Beispiel-Moodboards (Basic / Standard / Premium).
 * Jeder Raumtyp hat eigene Moodboards, die der Nutzer in der App frei bearbeiten kann.
 * Die Paket-IDs (basic/standard/premium) sind in allen Raumtypen gleich. */

// Feld-Bibliothek: key -> [Bezeichnung, Platzhalter]
const FIELD_LIB = {
  beschreibung: ['Kurzbeschreibung (erscheint im PDF)', 'z. B. Hochwertige Sanierung mit edlen Materialien'],
  stil: ['Stil & Farbwelt', 'z. B. modern, warm, Naturtöne, Akzente in Messing'],
  wand: ['Wände (Farbe, Oberfläche, Spachtelstufe)', 'z. B. Q4 gespachtelt, Kalkputz, warmweiß matt'],
  decke: ['Decke', 'z. B. Stuckleisten, indirekte LED-Beleuchtung'],
  boden: ['Boden (Format, Farbe, Material)', 'z. B. Eichenparkett Landhausdiele / Feinsteinzeug 120x120 cm'],
  wandfliesen: ['Wandfliesen (Format, Farbe, Material, Verlegung, Höhe)', 'z. B. 60x120 cm, Marmoroptik, raumhoch'],
  dusche: ['Dusche / Badewanne', 'z. B. bodengleiche Dusche, rahmenlose Glaswand'],
  wc: ['WC', 'z. B. wandhängend, spülrandlos'],
  waschtisch: ['Waschtisch & Möbel', 'z. B. Doppelwaschtisch, Unterschrank Eiche'],
  armaturen: ['Armaturen (Farbe, Stil)', 'z. B. gebürstetes Messing, Unterputz'],
  spiegel: ['Spiegel & Licht', 'z. B. Spiegel mit LED-Hinterleuchtung'],
  fronten: ['Küchenfronten & Griffe', 'z. B. grifflos, Mattlack Salbeigrün'],
  arbeitsplatte: ['Arbeitsplatte', 'z. B. Quarzstein weiß, 2 cm'],
  rueckwand: ['Nischenrückwand / Fliesenspiegel', 'z. B. Glasrückwand, Metro-Fliesen'],
  geraete: ['Elektrogeräte', 'z. B. Kochfeld mit integriertem Abzug, Backofen auf Augenhöhe'],
  spuele: ['Spüle & Armatur', 'z. B. Unterbauspüle Edelstahl, Armatur schwarz'],
  moebel: ['Möblierung & Einrichtung', 'z. B. Sofa in Bouclé, Sideboard Eiche, Teppich'],
  einbau: ['Einbauten & Stauraum', 'z. B. deckenhoher Einbauschrank, Nischenregal'],
  licht: ['Beleuchtung', 'z. B. LED-Spots, Pendelleuchte, indirektes Licht'],
  heizung: ['Heizkörper', 'z. B. Designheizkörper schwarz'],
  tueren: ['Türen', 'z. B. weiße Lacktüren, flächenbündig'],
  fenster: ['Fenster', 'z. B. Kunststofffenster weiß / Holz-Alu anthrazit'],
  treppe: ['Treppe (Stufen, Belag)', 'z. B. Eichenstufen geölt, Setzstufen weiß'],
  gelaender: ['Geländer & Handlauf', 'z. B. Stahl schwarz, Handlauf Eiche'],
  eingang: ['Hauseingang (Tür, Briefkasten, Klingel)', 'z. B. Haustür anthrazit mit Glaselement'],
  fassade: ['Fassade (Putz, Farbe, Verkleidung)', 'z. B. WDVS mit Scheibenputz, gebrochenes Weiß'],
  sockel: ['Sockel & Akzente', 'z. B. Sockel anthrazit, Faschen um die Fenster'],
  dach: ['Dach & Dachrand', 'z. B. Dachziegel anthrazit, Dachrinnen Zink'],
  balkon: ['Balkone & Terrassen', 'z. B. Glasgeländer, Holzbelag'],
  aussen: ['Außenanlagen', 'z. B. Vorgarten mit Gräsern, Pflaster hell'],
  terrasse: ['Terrasse & Wege (Belag, Format, Farbe)', 'z. B. Feinsteinzeug 60x60 cm anthrazit, Weg aus Betonpflaster'],
  rasen: ['Rasen & Beete', 'z. B. Rollrasen, Staudenbeet mit Gräsern'],
  bepflanzung: ['Bäume, Hecken & Bepflanzung', 'z. B. Hainbuchenhecke, Solitärbaum'],
  einfassung: ['Zaun, Mauer & Einfassung', 'z. B. Doppelstabzaun anthrazit, Cortenstahl-Beetkanten'],
  gartenlicht: ['Gartenbeleuchtung', 'z. B. Pollerleuchten am Weg, Bodenstrahler an Bäumen'],
  waermepumpe: ['Wärmepumpe Außengerät (Hersteller, Modell, Farbe)', 'z. B. Luft/Wasser-Monoblock 8 kW, Gehäuse anthrazit'],
  geraetmasse: ['Abmessungen Außengerät (B × H × T in cm)', 'z. B. 110 × 80 × 45'],
  fundament: ['Fundament Wärmepumpe (Material, Höhe)', 'z. B. Betonsockel, 15 cm über Gelände, Kanten gefast'],
  umrandung: ['Umfeld Wärmepumpe (Kies, Platten, Sichtschutz)', 'z. B. Kiesstreifen, Lamellen-Sichtschutz Holz'],
  heizgeraet: ['Heizgerät / Innengerät (Hersteller, Modell)', 'z. B. Wärmepumpen-Inneneinheit mit Hydraulikmodul, weiß'],
  puffer: ['Pufferspeicher', 'z. B. 200 l, weiß verkleidet'],
  trinkwasser: ['Trinkwasserspeicher', 'z. B. 300 l Edelstahl, weiß verkleidet'],
  verrohrung: ['Rohrleitungen & Dämmung', 'z. B. Edelstahlrohre, Dämmung mit weißer PVC-Ummantelung, sauber parallel geführt'],
  regelung: ['Regelung, Elektro & Zubehör', 'z. B. Zählerschrank, Ausdehnungsgefäß, Enthärtungsanlage'],
  sonstiges: ['Sonstiges / Hinweise für die KI', 'z. B. Nischen mit Beleuchtung, keine Deko'],
};

// Englische Bezeichnungen der Felder für die KI-Anweisungen (Prompts sind Englisch, die App bleibt Deutsch)
const FIELD_EN = {
  beschreibung: 'Short description', stil: 'Style & colour palette', wand: 'Walls (colour, finish, plaster level)', decke: 'Ceiling', boden: 'Floor (format, colour, material)',
  wandfliesen: 'Wall tiles (format, colour, material, laying pattern, height)', dusche: 'Shower / bathtub', wc: 'Toilet', waschtisch: 'Vanity & furniture', armaturen: 'Taps & fittings (finish, style)',
  spiegel: 'Mirror & lighting', fronten: 'Kitchen fronts & handles', arbeitsplatte: 'Worktop', rueckwand: 'Splashback', geraete: 'Appliances', spuele: 'Sink & tap',
  moebel: 'Furniture & furnishing', einbau: 'Built-ins & storage', licht: 'Lighting', heizung: 'Radiators', tueren: 'Doors', fenster: 'Windows', treppe: 'Stairs (treads, covering)',
  gelaender: 'Railing & handrail', eingang: 'Entrance (door, letterbox, doorbell)', fassade: 'Facade (render, colour, cladding)', sockel: 'Plinth & accents', dach: 'Roof & eaves',
  balkon: 'Balconies & terraces', aussen: 'Outdoor areas', terrasse: 'Terrace & paths', rasen: 'Lawn & beds', bepflanzung: 'Trees, hedges & planting', einfassung: 'Fence, wall & edging',
  gartenlicht: 'Garden lighting', waermepumpe: 'Heat pump outdoor unit', geraetmasse: 'Outdoor unit dimensions (W × H × D in cm)', fundament: 'Heat pump base', umrandung: 'Heat pump surroundings',
  heizgeraet: 'Heating unit / indoor unit', puffer: 'Buffer tank', trinkwasser: 'Hot water tank', verrohrung: 'Pipes & insulation', regelung: 'Controls, electrics & accessories', sonstiges: 'Other notes for the AI',
};
// Englischer Name des Raumtyps und was die KI unverändert lassen soll (für die neuen, englischen Prompts)
const KEEP_EN_INNEN = 'room geometry, floor plan, ceiling height, position of windows, doors and sloped ceilings';
const ROOM_EN = {
  bad: ['bathroom', [KEEP_EN_INNEN, 'connections: only the fixtures that exist TODAY (shower/bathtub, toilet, washbasin) stay in their position; if one is missing, it is NOT added']],
  'gaeste-wc': ['guest toilet', [KEEP_EN_INNEN, 'position of toilet and hand basin stays the same']],
  kueche: ['kitchen', [KEEP_EN_INNEN, 'kitchen run, sink and hob stay roughly in their position (connections)']],
  wohnzimmer: ['living room', [KEEP_EN_INNEN]],
  schlafzimmer: ['bedroom', [KEEP_EN_INNEN]],
  kinderzimmer: ["children's room", [KEEP_EN_INNEN]],
  flur: ['hallway', [KEEP_EN_INNEN]],
  treppenhaus: ['staircase', ['stair layout, number of steps, landings, room geometry, position of windows and doors']],
  fassade: ['building', ['building shape, number of storeys, roof shape, position and size of windows, doors and balconies, surroundings and neighbouring buildings']],
  garten: ['garden', ['building, house walls, windows, doors, property boundaries, neighbouring houses and terrain shape (levels, slopes) stay the same']],
  heizraum: ['boiler room', [KEEP_EN_INNEN, 'position of chimney, house connections (water, power, gas) and basement windows stays the same']],
  sonstiges: ['room', [KEEP_EN_INNEN]],
};
const roomEn = (id) => ROOM_EN[id] || ROOM_EN.sonstiges;

const PKG_META = { basic: ['Basic', '#7a8795'], standard: ['Standard', '#1e3550'], premium: ['Premium', '#b8862f'] };

// Was die KI je Raumtyp unbedingt unverändert lassen soll
const KEEP_INNEN = 'Raumgeometrie, Grundriss, Deckenhöhe, Lage von Fenstern, Türen und Dachschrägen';

const ROOM_TYPES = [
  { id: 'bad', name: 'Badezimmer', keep: [KEEP_INNEN, 'Lage der Anschlüsse: nur die HEUTE vorhandenen Objekte (Dusche/Wanne, WC, Waschtisch) bleiben an ihrer Position; fehlt eines davon, kommt es nicht dazu'],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'wandfliesen', 'boden', 'dusche', 'wc', 'waschtisch', 'armaturen', 'spiegel', 'heizung', 'tueren', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Solide, saubere Grundsanierung zum fairen Preis.', stil: 'schlicht, hell, zeitlos, Weiß und Hellgrau', wand: 'Q2 gespachtelt, weiß gestrichen, matt', decke: 'glatt, weiß, einfache Deckenleuchte', wandfliesen: '30x60 cm, weiß glänzend, halbhoch ca. 1,20 m, im Duschbereich raumhoch', boden: '30x60 cm Feinsteinzeug hellgrau, matt', dusche: 'flache Duschtasse, Duschabtrennung mit Chromrahmen', wc: 'Wand-WC weiß, Standard', waschtisch: 'Keramik-Waschtisch 60 cm weiß, einfacher Unterschrank weiß', armaturen: 'Chrom, Einhebelmischer, Brausestange', spiegel: 'Spiegel mit einfacher Aufbauleuchte', heizung: 'Röhrenheizkörper weiß', tueren: 'weiße Standard-Innentür' },
      standard: { beschreibung: 'Modernes Bad mit großformatigen Fliesen und bodengleicher Dusche.', stil: 'modern, warm, Naturtöne, Akzente in Mattschwarz', wand: 'Q3 gespachtelt, warmes Weiß matt', decke: 'glatt, weiß, LED-Einbauspots', wandfliesen: '60x120 cm, Betonoptik hellgrau, matt, im Nassbereich raumhoch', boden: '60x120 cm Feinsteinzeug, Betonoptik mittelgrau', dusche: 'bodengleiche Dusche mit Rinne, Walk-In-Glaswand mit schwarzem Profil', wc: 'wandhängend, spülrandlos, weiß', waschtisch: 'Waschtisch 80 cm mit Unterschrank in Eiche-Optik', armaturen: 'Mattschwarz, Regenbrause Aufputz', spiegel: 'Spiegel mit LED-Hintergrundbeleuchtung', heizung: 'Designheizkörper weiß', tueren: 'weiße Lacktür, Drücker schwarz' },
      premium: { beschreibung: 'Exklusives Wohlfühlbad mit edlen Materialien und handwerklichen Details.', stil: 'luxuriös, elegant, Marmor, Messing, warmes Licht', wand: 'Q4 vollflächig gespachtelt, Feinputz in Greige, matt', decke: 'umlaufende Stuckleisten, indirekte LED-Lichtvoute, Spots', wandfliesen: '120x260 cm großformatig, Marmoroptik Calacatta mit feiner Goldäderung, poliert, raumhoch', boden: '120x120 cm Marmoroptik passend zur Wand', dusche: 'bodengleiche Dusche, rahmenlose Glaswand, beleuchtete Wandnische; freistehende Badewanne, wenn Platz ist', wc: 'wandhängend, spülrandlos, Betätigungsplatte Messing', waschtisch: 'Doppelwaschtisch mit Natursteinplatte, grifflose Unterschränke Nussbaum', armaturen: 'gebürstetes Messing, Unterputz, Regenbrause aus der Decke', spiegel: 'großer LED-Spiegel, Wandleuchten Messing', heizung: 'Designheizkörper Messing bzw. Fußbodenheizung', tueren: 'flächenbündige, deckenhohe Türen' },
    } },
  { id: 'gaeste-wc', name: 'Gäste-WC', keep: [KEEP_INNEN, 'Lage von WC und Handwaschbecken bleibt gleich'],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'wandfliesen', 'boden', 'wc', 'waschtisch', 'armaturen', 'spiegel', 'tueren', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Frisches, pflegeleichtes Gäste-WC.', stil: 'hell, schlicht, Weiß und Hellgrau', wand: 'Q2 gespachtelt, weiß matt', decke: 'weiß, Deckenleuchte', wandfliesen: '30x60 cm weiß, halbhoch hinter WC und Becken', boden: '30x60 cm Feinsteinzeug hellgrau', wc: 'Wand-WC weiß', waschtisch: 'kleines Handwaschbecken weiß', armaturen: 'Chrom', spiegel: 'einfacher Spiegel mit Leuchte', tueren: 'weiße Standard-Innentür' },
      standard: { beschreibung: 'Modernes Gäste-WC mit Akzentwand.', stil: 'modern, Akzentwand dunkelgrün oder Terrazzo, Mattschwarz', wand: 'Q3 gespachtelt, Akzentwand hinter WC farbig', decke: 'LED-Spots', wandfliesen: 'Akzentwand hinter WC raumhoch, 60x120 cm', boden: '60x60 cm Feinsteinzeug Betonoptik', wc: 'wandhängend, spülrandlos', waschtisch: 'Handwaschbecken mit Holzablage Eiche', armaturen: 'Mattschwarz', spiegel: 'runder Spiegel mit LED', tueren: 'weiße Lacktür, Drücker schwarz' },
      premium: { beschreibung: 'Gäste-WC als Visitenkarte mit Naturstein und Messing.', stil: 'edel, dunkel, Naturstein, Messing, stimmungsvolles Licht', wand: 'Q4 gespachtelt, Kalkputz dunkel', decke: 'indirekte LED-Voute', wandfliesen: 'Natursteinplatte hinter WC und Becken raumhoch', boden: 'großformatig Marmoroptik', wc: 'wandhängend, Betätigungsplatte Messing', waschtisch: 'Aufsatzbecken aus Naturstein auf Konsole', armaturen: 'Wandarmatur gebürstetes Messing', spiegel: 'Spiegel mit Messingrahmen, Wandleuchten', tueren: 'flächenbündige, deckenhohe Tür' },
    } },
  { id: 'kueche', name: 'Küche', keep: [KEEP_INNEN, 'Küchenzeile, Spüle und Herd bleiben ungefähr an ihrer Position (Anschlüsse)'],
    fields: ['beschreibung', 'stil', 'fronten', 'arbeitsplatte', 'rueckwand', 'geraete', 'spuele', 'boden', 'wand', 'decke', 'licht', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Funktionale, helle Küche mit gutem Preis-Leistungs-Verhältnis.', stil: 'hell, zeitlos, Weiß und Holzoptik', fronten: 'weiß matt, Griffleisten Edelstahl', arbeitsplatte: 'Schichtstoff in Eiche-Optik', rueckwand: 'weiße Fliesen 10x30 cm', geraete: 'Standard-Einbaugeräte Edelstahl, Dunstabzugshaube', spuele: 'Edelstahlspüle mit Chromarmatur', boden: 'Feinsteinzeug 60x60 cm hellgrau', wand: 'Q2, weiß matt', decke: 'weiß, Deckenleuchte', licht: 'LED-Unterbauleuchten' },
      standard: { beschreibung: 'Moderne grifflose Küche mit Kochinsel, wenn Platz ist.', stil: 'modern, warm, Graphit und Eiche', fronten: 'grifflos, Mattlack Graphit kombiniert mit Eiche-Furnier', arbeitsplatte: 'Keramik 12 mm in Betonoptik', rueckwand: 'Keramik passend zur Arbeitsplatte', geraete: 'Kochfeld mit integriertem Abzug, Backofen auf Augenhöhe, Geschirrspüler integriert', spuele: 'Unterbauspüle, Armatur Mattschwarz', boden: 'Vinyl-Landhausdiele Eiche oder Feinsteinzeug 60x120 cm', wand: 'Q3, warmes Weiß', decke: 'LED-Spots', licht: 'Pendelleuchten über Insel/Tisch, LED-Unterbau' },
      premium: { beschreibung: 'Maßgefertigte Wohnküche mit Naturstein und Premiumgeräten.', stil: 'luxuriös, Naturstein, Nussbaum, Messing', fronten: 'Echtholz Nussbaum und Mattlack Salbeigrün, deckenhohe Hochschränke', arbeitsplatte: 'Naturstein Calacatta, 3 cm, Wasserfallkante an der Insel', rueckwand: 'durchgehend Naturstein wie Arbeitsplatte', geraete: 'Premium-Geräte, Weinklimaschrank, Dampfgarer, Muldenlüfter', spuele: 'Natursteinspüle, Armatur Messing gebürstet mit Kochendwasser', boden: 'Fischgrätparkett Eiche', wand: 'Q4, Kalkputz', decke: 'Stuck, indirekte Beleuchtung', licht: 'Designer-Pendelleuchten Messing, indirektes Licht in Nischen' },
    } },
  { id: 'wohnzimmer', name: 'Wohnzimmer', keep: [KEEP_INNEN],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'boden', 'moebel', 'einbau', 'licht', 'heizung', 'fenster', 'tueren', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Frisch renoviertes, helles Wohnzimmer.', stil: 'hell, freundlich, skandinavisch', wand: 'Q2, weiß matt', decke: 'weiß, glatt', boden: 'Laminat Eiche hell', moebel: 'schlichtes Sofa hellgrau, Couchtisch, Teppich', licht: 'Deckenleuchte, Stehleuchte', heizung: 'Plattenheizkörper weiß', tueren: 'weiße Standard-Innentür' },
      standard: { beschreibung: 'Modernes Wohnzimmer mit Parkett und warmen Farben.', stil: 'modern, warm, Naturtöne, Greige und Eiche', wand: 'Q3, eine Akzentwand in Greige', decke: 'LED-Spots, Schattenfuge', boden: 'Eichenparkett Landhausdiele, geölt', moebel: 'Sofa in Stoff Sand, Sideboard Eiche, Wollteppich', einbau: 'TV-Wand mit Lowboard', licht: 'Spots dimmbar, Stehleuchte', heizung: 'Flachheizkörper weiß', tueren: 'weiße Lacktüren, Drücker schwarz' },
      premium: { beschreibung: 'Elegantes Wohnzimmer im Altbau-Charme mit Stuck und Fischgrätparkett.', stil: 'elegant, klassisch-modern, Messing, Samt, warmes Licht', wand: 'Q4, Kalkputz in warmem Weiß, Wandpaneele', decke: 'umlaufender Stuck, Stuckrosette, indirekte Lichtvoute', boden: 'Fischgrätparkett Eiche', moebel: 'Designersofa Bouclé, Marmor-Couchtisch, Sessel Samt', einbau: 'maßgefertigtes Bücherregal deckenhoch', licht: 'Kronleuchter/Designerleuchte, Wandleuchten Messing', heizung: 'Fußbodenheizung', tueren: 'Kassettentüren deckenhoch' },
    } },
  { id: 'schlafzimmer', name: 'Schlafzimmer', keep: [KEEP_INNEN],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'boden', 'moebel', 'einbau', 'licht', 'heizung', 'tueren', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Ruhiges, frisch renoviertes Schlafzimmer.', stil: 'hell, ruhig, Weiß und Beige', wand: 'Q2, weiß matt', decke: 'weiß', boden: 'Laminat Eiche hell', moebel: 'Doppelbett mit Stoffkopfteil, Nachttische', licht: 'Deckenleuchte, Nachttischleuchten', heizung: 'Plattenheizkörper weiß', tueren: 'weiße Standard-Innentür' },
      standard: { beschreibung: 'Gemütliches Schlafzimmer mit Akzentwand und Einbauschrank.', stil: 'modern, gemütlich, Salbeigrün und Eiche', wand: 'Q3, Akzentwand hinter dem Bett in Salbeigrün', decke: 'LED-Spots dimmbar', boden: 'Eichenparkett', moebel: 'Polsterbett, Nachttische Eiche, Teppich', einbau: 'Einbauschrank weiß, grifflos', licht: 'Spots, Wandleuchten am Bett', heizung: 'Flachheizkörper weiß', tueren: 'weiße Lacktür' },
      premium: { beschreibung: 'Schlafzimmer im Hotelstil mit Wandpaneelen und Ankleide.', stil: 'Boutique-Hotel, warme Erdtöne, Samt, Messing', wand: 'Q4, Wandpaneele hinter dem Bett, Kalkputz', decke: 'Stuck, indirekte Lichtvoute', boden: 'Fischgrätparkett Eiche', moebel: 'Boxspringbett mit hohem gepolstertem Kopfteil, Sessel, Hochflorteppich', einbau: 'maßgefertigter Kleiderschrank deckenhoch mit Innenbeleuchtung', licht: 'Pendelleuchten als Nachttischleuchten, indirektes Licht', heizung: 'Fußbodenheizung', tueren: 'flächenbündige, deckenhohe Türen' },
    } },
  { id: 'kinderzimmer', name: 'Kinderzimmer', keep: [KEEP_INNEN],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'boden', 'moebel', 'einbau', 'licht', 'heizung', 'tueren', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Freundliches, robustes Kinderzimmer.', stil: 'hell, freundlich, Pastellakzente', wand: 'Q2, weiß, eine Wand in Pastell', decke: 'weiß', boden: 'robustes Laminat Eiche hell', moebel: 'Kinderbett, Schreibtisch, Regal weiß', licht: 'Deckenleuchte', heizung: 'Plattenheizkörper weiß', tueren: 'weiße Standard-Innentür' },
      standard: { beschreibung: 'Verspieltes Kinderzimmer mit Stauraum und Spielecke.', stil: 'verspielt, Naturtöne mit Farbakzenten, Holz', wand: 'Q3, zweifarbig gestrichen mit Bogenmotiv', decke: 'LED-Spots', boden: 'Vinyl-Landhausdiele Eiche, Spielteppich', moebel: 'Hausbett aus Holz, Schreibtisch, Leseecke', einbau: 'Einbauschrank und offene Regale', licht: 'Spots, Leseleuchte', heizung: 'Flachheizkörper weiß', tueren: 'weiße Lacktür' },
      premium: { beschreibung: 'Kinderzimmer zum Mitwachsen mit maßgefertigten Einbauten.', stil: 'hochwertig, warme Naturtöne, Echtholz, Akzente in Terrakotta', wand: 'Q4, Kalkfarbe, Wandpaneele halbhoch', decke: 'Sternenhimmel mit indirektem Licht', boden: 'Eichenparkett', moebel: 'Hochbett mit Kletterwand, Schreibtisch Massivholz', einbau: 'maßgefertigte Einbauten mit Leseecke im Fenster', licht: 'indirektes Licht, Wandleuchten', heizung: 'Fußbodenheizung', tueren: 'flächenbündige Tür' },
    } },
  { id: 'flur', name: 'Flur / Diele', keep: [KEEP_INNEN],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'boden', 'einbau', 'licht', 'tueren', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Heller, pflegeleichter Flur.', stil: 'hell, schlicht', wand: 'Q2, weiß matt', decke: 'weiß, Deckenleuchten', boden: 'Feinsteinzeug 30x60 cm hellgrau', einbau: 'Garderobe mit Haken und Spiegel', licht: 'Deckenleuchten', tueren: 'weiße Standard-Innentüren' },
      standard: { beschreibung: 'Moderner Flur mit Einbaugarderobe.', stil: 'modern, warm, Eiche und Greige', wand: 'Q3, Greige', decke: 'LED-Spots', boden: 'Feinsteinzeug 60x120 cm Betonoptik', einbau: 'Einbaugarderobe mit Sitzbank Eiche', licht: 'Spots, Bewegungsmelder', tueren: 'weiße Lacktüren, Drücker schwarz' },
      premium: { beschreibung: 'Repräsentative Diele mit Stuck und Fischgrätparkett.', stil: 'elegant, Altbau-Charme, Messing', wand: 'Q4, Wandpaneele halbhoch', decke: 'Stuck, indirekte Lichtvoute', boden: 'Fischgrätparkett Eiche', einbau: 'maßgefertigte deckenhohe Garderobe, Spiegelfront', licht: 'Wandleuchten Messing, indirektes Licht', tueren: 'deckenhohe Kassettentüren' },
    } },
  { id: 'treppenhaus', name: 'Treppenhaus', keep: ['Treppenverlauf, Stufenanzahl, Podeste, Raumgeometrie, Lage von Fenstern und Türen'],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'treppe', 'gelaender', 'boden', 'licht', 'tueren', 'eingang', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Saubere Auffrischung des Treppenhauses.', stil: 'hell, freundlich, robust', wand: 'Latexfarbe weiß, Sockelbereich abwaschbar hellgrau', decke: 'weiß', treppe: 'vorhandene Stufen gereinigt, neue Kantenprofile', gelaender: 'Geländer weiß lackiert', boden: 'Podeste Feinsteinzeug hellgrau', licht: 'LED-Wandleuchten mit Bewegungsmelder', tueren: 'Wohnungstüren weiß lackiert' },
      standard: { beschreibung: 'Modernes Treppenhaus mit warmem Holz und Akzentfarbe.', stil: 'modern, Weiß mit Akzent in Anthrazit, Eiche', wand: 'Q3, oben weiß, Sockel bis 1,10 m anthrazit', decke: 'weiß, LED-Spots', treppe: 'Stufen mit Eiche-Belag, Setzstufen weiß', gelaender: 'Stahlgeländer schwarz, Handlauf Eiche', boden: 'Podeste Feinsteinzeug Betonoptik', licht: 'LED-Wandleuchten schwarz', tueren: 'neue Wohnungstüren weiß mit schwarzen Beschlägen', eingang: 'Briefkastenanlage anthrazit' },
      premium: { beschreibung: 'Repräsentatives Treppenhaus mit Naturstein und Stuck.', stil: 'Gründerzeit-Eleganz, Naturstein, Messing', wand: 'Q4, Kalkputz, Wandpaneele bis Brüstungshöhe', decke: 'Stuckprofile, indirekte Beleuchtung', treppe: 'Stufen in Naturstein oder Eiche massiv', gelaender: 'restauriertes schmiedeeisernes Geländer, Handlauf Holz poliert', boden: 'Podeste Terrazzo oder Naturstein', licht: 'Wandleuchten Messing, indirektes Licht', tueren: 'Kassettentüren lackiert, Beschläge Messing', eingang: 'Briefkastenanlage Messing, Klingeltableau Messing' },
    } },
  { id: 'fassade', name: 'Fassade / Außen', outdoor: true, what: 'eines bestehenden Gebäudes von außen', same: 'dasselbe Gebäude', keep: ['Gebäudeform, Geschosszahl, Dachform, Lage und Größe von Fenstern, Türen und Balkonen, Umgebung und Nachbargebäude'],
    fields: ['beschreibung', 'stil', 'fassade', 'sockel', 'fenster', 'dach', 'eingang', 'balkon', 'aussen', 'licht', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Gepflegte Fassade mit neuem Anstrich.', stil: 'hell, klassisch, gebrochenes Weiß', fassade: 'Putz ausgebessert, Fassadenfarbe gebrochenes Weiß', sockel: 'Sockel hellgrau', fenster: 'vorhandene Fenster, Fensterbänke Aluminium', dach: 'Dachrinnen gereinigt, Dachkasten weiß', eingang: 'Haustür gestrichen', balkon: 'Geländer gestrichen', aussen: 'aufgeräumter Vorgarten', licht: 'einfache Außenleuchte am Eingang' },
      standard: { beschreibung: 'Energetisch saniertes Haus mit moderner Farbgebung.', stil: 'modern, Weiß mit Anthrazit-Akzenten', fassade: 'WDVS mit Scheibenputz, Weiß', sockel: 'Sockel und Faschen anthrazit', fenster: 'neue Kunststofffenster außen anthrazit', dach: 'Dachrinnen anthrazit', eingang: 'Aluminium-Haustür anthrazit mit Glaselement, Vordach Glas', balkon: 'Geländer Stahl anthrazit', aussen: 'Pflaster hellgrau, Gräser und Hecke', licht: 'Wandleuchten anthrazit' },
      premium: { beschreibung: 'Hochwertige Fassade mit Holz- oder Klinkerakzenten.', stil: 'architektonisch, Weiß mit Holz und Klinker', fassade: 'Edelputz fein, Teilflächen mit Holzlattung Lärche oder Klinkerriemchen', sockel: 'Naturstein-Sockel', fenster: 'Holz-Alu-Fenster bodentief, außen dunkelbronze', dach: 'neue Eindeckung anthrazit, Zinkverwahrungen', eingang: 'Designhaustür mit Holzoberfläche, flächenbündig, Eingangsüberdachung', balkon: 'Glasgeländer, Holzbelag', aussen: 'Natursteinplatten, Gartengestaltung mit Beleuchtung', licht: 'Fassadenstrahler und Bodenspots warmweiß' },
    } },
  { id: 'garten', name: 'Garten', outdoor: true, placement: true, what: 'eines Gartens / Außenbereichs am Haus', same: 'denselben Garten',
    keep: ['Gebäude, Hauswände, Fenster, Türen, Grundstücksgrenzen, Nachbarhäuser und die Geländeform (Höhen, Böschungen) bleiben gleich'],
    fields: ['beschreibung', 'stil', 'terrasse', 'rasen', 'bepflanzung', 'einfassung', 'gartenlicht', 'waermepumpe', 'geraetmasse', 'fundament', 'umrandung', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Gepflegter, pflegeleichter Garten.', stil: 'aufgeräumt, natürlich, Grün mit hellem Grau', terrasse: 'Betonpflaster hellgrau 20x10 cm, gerade Kanten', rasen: 'neuer Rollrasen, saubere Rasenkanten', bepflanzung: 'vorhandene Bäume bleiben, Hecke geschnitten', einfassung: 'Doppelstabzaun grün', gartenlicht: 'einfache Wandleuchte an der Hauswand',
        waermepumpe: 'Luft/Wasser-Wärmepumpe (Monoblock), schlichtes rechteckiges Gehäuse hellgrau/weiß, Lüfter vorne', geraetmasse: '100 × 80 × 40', fundament: 'Betonfundament glatt abgezogen, ca. 10 cm über Gelände, Gerät auf Gummi-Schwingungsdämpfern', umrandung: 'Kiesbett grau rund um das Fundament, Leitungen unterirdisch ins Haus' },
      standard: { beschreibung: 'Moderner Garten mit Terrasse aus großformatigen Platten.', stil: 'modern, klar, Anthrazit, Grün und Holz', terrasse: 'Terrasse Feinsteinzeug 60x60 cm anthrazit, Weg aus großformatigen Betonplatten', rasen: 'Rollrasen, Staudenbeete mit Gräsern', bepflanzung: 'Hainbuchenhecke als Sichtschutz, ein kleiner Solitärbaum', einfassung: 'Doppelstabzaun anthrazit, Beetkanten aus Stahl', gartenlicht: 'Pollerleuchten am Weg, warmweiß',
        waermepumpe: 'moderne, leise Luft/Wasser-Wärmepumpe, Gehäuse anthrazit mit Lüftergitter, abgerundete Kanten', geraetmasse: '110 × 85 × 45', fundament: 'Betonsockel, Kanten gefast, ca. 15 cm über Gelände', umrandung: 'Rand aus grauen Betonplatten 40x40 cm, Kiesstreifen, seitlich niedrige Gräser' },
      premium: { beschreibung: 'Wohngarten mit Naturstein, Holz und stimmungsvollem Licht.', stil: 'hochwertig, wohnlich, Naturstein, Holz, warmes Licht', terrasse: 'Natursteinplatten großformatig, Holzdeck aus Thermoesche', rasen: 'Rollrasen, üppige Stauden- und Gräserbeete', bepflanzung: 'Formgehölze, mehrstämmiger Solitärbaum, immergrüne Hecke', einfassung: 'Sichtschutzwand aus Holzlamellen, Cortenstahl-Hochbeete', gartenlicht: 'Bodenstrahler an Bäumen, indirektes Licht an Stufen, Pollerleuchten',
        waermepumpe: 'Design-Wärmepumpe, sehr leise, Gehäuse weiß oder anthrazit, edle glatte Front', geraetmasse: '130 × 100 × 50', fundament: 'Sockel in Sichtbetonqualität, 15 cm über Gelände', umrandung: 'Natursteinplatten und weißes Kiesbett, Lamellenverkleidung aus Holz bzw. Aluminium anthrazit seitlich und hinten, vorne offen für die Luft' },
    } },
  { id: 'heizraum', name: 'Heizraum', keep: [KEEP_INNEN, 'Lage von Schornstein, Hausanschlüssen (Wasser, Strom, Gas) und Kellerfenstern bleibt gleich'],
    fields: ['beschreibung', 'stil', 'heizgeraet', 'puffer', 'trinkwasser', 'verrohrung', 'regelung', 'wand', 'boden', 'licht', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Neue, saubere Heiztechnik mit Wärmepumpe.', stil: 'technisch, sauber, hell', heizgeraet: 'Inneneinheit der Wärmepumpe (Hydraulikmodul) weiß, an der Wand', puffer: 'Pufferspeicher ca. 100 l, weiß', trinkwasser: 'Trinkwasserspeicher ca. 200 l, weiß verkleidet', verrohrung: 'Kupfer-/Verbundrohre mit grauer Dämmung, ordentlich geführt', regelung: 'Ausdehnungsgefäß, einfache Regelung am Gerät', wand: 'Wände weiß gestrichen', boden: 'Boden grau beschichtet', licht: 'LED-Feuchtraumleuchte',
        sonstiges: 'alter Kessel, Öltank und alte Rohre sind entfernt' },
      standard: { beschreibung: 'Aufgeräumter Technikraum mit kompakter Wärmepumpen-Technik.', stil: 'modern, aufgeräumt, Weiß und Grau', heizgeraet: 'kompakte Inneneinheit / Wärmepumpen-Tower mit integriertem Speicher, weiß, Display vorne', puffer: 'Pufferspeicher 200 l, weiß verkleidet', trinkwasser: 'integriert im Tower bzw. 300 l Speicher weiß', verrohrung: 'Rohre mit weißer PVC-Ummantelung, sauber parallel und rechtwinklig geführt, beschriftet', regelung: 'Regelung mit Display, Zählerschrank neu, Enthärtungsanlage', wand: 'Wände weiß gestrichen, Leitungen in Kabelkanälen', boden: 'Feinsteinzeug 60x60 cm hellgrau', licht: 'LED-Lichtleisten, hell',
        sonstiges: 'alter Kessel, Öltank und alte Rohre sind entfernt, Raum aufgeräumt' },
      premium: { beschreibung: 'Technikraum in Showroom-Qualität mit Speicher-Kombination und PV-Batterie.', stil: 'Showroom, hochwertig, Weiß, Edelstahl, indirektes Licht', heizgeraet: 'Premium-Wärmepumpen-Inneneinheit mit großem Display, weiß/Glasfront', puffer: 'Pufferspeicher 300 l, weiß verkleidet', trinkwasser: 'Edelstahl-Trinkwasserspeicher 300 l bzw. Frischwasserstation', verrohrung: 'Edelstahl-Pressrohre, Dämmung mit Aluminium-Ummantelung, perfekt parallel geführt, farbig beschriftet (Vorlauf rot, Rücklauf blau)', regelung: 'Smart-Home-Regelung, Stromspeicher für PV an der Wand, neuer Zählerschrank', wand: 'Wände Q3 gespachtelt, weiß', boden: 'Feinsteinzeug 60x120 cm grau', licht: 'LED-Lichtleisten und indirektes Licht',
        sonstiges: 'alter Kessel, Öltank und alte Rohre sind entfernt, Raum wirkt wie ein Ausstellungsraum' },
    } },
  { id: 'sonstiges', name: 'Sonstiger Raum', keep: [KEEP_INNEN],
    fields: ['beschreibung', 'stil', 'wand', 'decke', 'boden', 'moebel', 'licht', 'heizung', 'fenster', 'tueren', 'sonstiges'],
    pkgs: {
      basic: { beschreibung: 'Solide, saubere Grundsanierung.', stil: 'hell, zeitlos', wand: 'Q2, weiß matt', decke: 'weiß', boden: 'Laminat Eiche hell', licht: 'Deckenleuchte', heizung: 'Plattenheizkörper weiß', tueren: 'weiße Standard-Innentür' },
      standard: { beschreibung: 'Moderne Sanierung mit warmen Materialien.', stil: 'modern, warm, Naturtöne', wand: 'Q3, warmes Weiß', decke: 'LED-Spots', boden: 'Eichenparkett Landhausdiele', licht: 'Spots dimmbar', heizung: 'Flachheizkörper weiß', tueren: 'weiße Lacktür' },
      premium: { beschreibung: 'Exklusive Sanierung mit handwerklichen Details.', stil: 'elegant, Messing, warmes Licht', wand: 'Q4, Kalkputz', decke: 'Stuck, indirekte Beleuchtung', boden: 'Fischgrätparkett Eiche', licht: 'Designerleuchten', heizung: 'Fußbodenheizung', tueren: 'flächenbündige, deckenhohe Türen' },
    } },
];

const roomType = (id) => ROOM_TYPES.find((r) => r.id === id) || ROOM_TYPES[0];
/** Felder eines Raumtyps als [key, label, placeholder]. */
const fieldsFor = (id) => roomType(id).fields.map((k) => [k, ...FIELD_LIB[k]]);
/** Beispiel-Moodboards eines Raumtyps (frische Kopie). */
function defaultPackagesFor(id) {
  const rt = roomType(id);
  return Object.entries(PKG_META).map(([pid, [name, color]]) => ({
    id: pid, name, color, images: [], products: [], fields: { ...Object.fromEntries(rt.fields.map((k) => [k, ''])), ...rt.pkgs[pid] },
  }));
}
/** Alter Raumname (Text) -> Raumtyp-ID */
function roomTypeIdFromName(name) {
  const n = String(name || '').toLowerCase();
  return (ROOM_TYPES.find((r) => r.name.toLowerCase() === n)
    || ROOM_TYPES.find((r) => n && (r.name.toLowerCase().includes(n) || n.includes(r.id.replace('-', ''))))
    || ROOM_TYPES[ROOM_TYPES.length - 1]).id;
}
