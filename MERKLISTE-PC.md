# Merkliste Windows-Programm (nach Version 108)

Felix hat diese Punkte am 15.11. freigegeben. Erst nach v108 bauen. Vorher prüfen, was davon schon da ist, und darauf aufbauen statt doppelt zu bauen.

1. Aufgabenliste mit Fälligkeit („Fliesen bestellen bis Freitag“) mit Erinnerung. Möglicher Anknüpfungspunkt: „Vorbereiten“ im Projekt (`todoFuellen`), „Heute“, Mitteilungen.
2. Nachkalkulation: geplante gegen tatsächliche Kosten je Projekt. Gibt es schon als Kalkulation Soll/Ist (`finanzen.js`, im Projekt Reiter Geld). Am PC als Tabelle zeigen.
3. Zahlungseingang abhaken mit Datum, offene Summe läuft im Dashboard mit. „Bezahlt“ mit Datum gibt es in `rechnung.js`; fehlt nur die Anzeige im Dashboard (v108).
4. Dokumentenablage je Projekt mit Ordnern (Pläne, Verträge, Fotos), per Ziehen mit der Maus. Baut auf `w.dokumente`, Bilder-Ordnern und dem Ziehen aus v107 auf.
5. Bestellliste für Material aus dem Angebot heraus, per Mail an den Händler. Baut auf Bestellungen in `baustelle.js` (`w.bestellungen`) auf.
6. Angebotsvergleich: zwei Varianten (z. B. Standard und Premium) nebeneinander.
7. Datensicherung per Klick als Datei zusätzlich zur Cloud. Gibt es als Excel-Sicherung (`Backup.excel`, Menü Datei); prüfen, ob eine vollständige Sicherungsdatei zum Wiederherstellen fehlt.
8. Digitale Unterschrift: Kunde unterschreibt das Angebot auf dem iPad (Finger oder Stift), das unterschriebene PDF landet beim Projekt, Auftrag gilt als angenommen. Baut auf `stiftLinien` in `core.js` und `Unterschrift` auf.
9. Jahresübersicht für den Steuerberater: ein Klick, eine Datei mit allen Rechnungen und Zahlungen des Jahres.
10. Eingang „Neue Aufnahmen“ am PC: Was draußen aufgenommen wurde (Gespräch, Fotos, Scans), landet dort und wird mit einem Klick zum Angebotsentwurf (`VorOrt.bueroKarte`). Felix' Favorit, gehört zur Brücke draußen/Büro.
11. Offline im Keller prüfen: Aufnahme vor Ort ohne Netz muss sicher gespeichert werden und später von selbst abgleichen (`sync.js`, Gespräch-Aufnahme, Fotos, Scans). Felix: „sehr wichtig“.

Dashboard (v108): EIN gemeinsames für Felix und Deniel, beide sehen alles (Angebote und Projekte), nicht nach Person getrennt.

Nicht gewollt: Stundenzettel. iPhone/iPad-Reiter nicht ändern (Felix gefällt die jetzige Aufteilung).

Leitbild (Felix, 15.11.): Felix und Deniel arbeiten 90 bis 95 % am PC. iPad und iPhone draußen nur für eine tipptoppe Angebotsaufnahme vor Ort und zum schnellen Suchen und Nachschlagen beim Kunden, übersichtlich. iPad und iPhone danach ausrichten.
Fotos vom iPad: liegen über den Cloud-Abgleich schon beim Kunden bzw. Objekt (Bilder-Ordner `bilder:<kunde>:<objekt>`), am PC im Angebot rechts unter „Bilder“ (v107).
