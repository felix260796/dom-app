# DOM als iPhone-App über TestFlight

Die App bleibt dieselbe. GitHub packt sie in eine iPhone-Hülle, baut sie auf einem Apple-Rechner in der Cloud und lädt sie zu TestFlight hoch. Ein Mac ist nicht nötig. Nach jedem Merge auf `main` kommt automatisch eine neue Version in TestFlight.

Bundle-ID der App: **de.domprojektmanagement.app**

## Einmal einrichten (Felix)

1. **Team-ID notieren**: developer.apple.com › Account › Mitgliedschaftsdetails › „Team-ID“ (10 Zeichen).
2. **Bundle-ID anlegen**: developer.apple.com › Certificates, Identifiers & Profiles › Identifiers › Plus › „App IDs“ › „App“. Beschreibung `DOM`, Bundle ID „Explicit“: `de.domprojektmanagement.app`. Keine Häkchen nötig. Registrieren.
3. **App in App Store Connect anlegen**: appstoreconnect.apple.com › Apps › Plus › Neue App. Plattform iOS, Name `DOM Projektmanagement` (der Name muss im App Store einmalig sein, auf dem iPhone heißt die App trotzdem DOM), Sprache Deutsch, Bundle-ID aus Schritt 2 wählen, SKU `dom-app`, Zugriff „Vollständig“.
4. **API-Schlüssel erstellen**: App Store Connect › Benutzer und Zugriff › Integrationen › App Store Connect API › Teamschlüssel › Plus. Name `GitHub`, Zugriff **Admin**. Danach „API-Schlüssel laden“ (geht nur einmal, Datei gut aufheben). Notieren: **Schlüssel-ID** (in der Liste) und **Issuer-ID** (steht über der Liste).
5. **Geheimnisse in GitHub eintragen**: github.com/felix260796/dom-app › Settings › Secrets and variables › Actions › „New repository secret“, vier Mal:
   - `APPLE_TEAM_ID`: Team-ID aus Schritt 1
   - `ASC_KEY_ID`: Schlüssel-ID aus Schritt 4
   - `ASC_ISSUER_ID`: Issuer-ID aus Schritt 4
   - `ASC_KEY_P8`: die .p8-Datei mit dem Editor öffnen und den ganzen Text hineinkopieren (mit den Zeilen BEGIN und END)

   Die Geheimnisse sind nur für GitHub lesbar, auch wenn das Repository öffentlich ist.
6. **Ersten Bau starten**: github.com/felix260796/dom-app › Actions › „iPhone-App zu TestFlight“ › „Run workflow“. Dauert etwa 10 bis 20 Minuten. Danach verarbeitet Apple den Bau noch einmal 10 bis 30 Minuten.
7. **Tester eintragen**: App Store Connect › DOM Projektmanagement › TestFlight › Interne Tests › Plus › Gruppe „Team“, dich (und später Deniel) hinzufügen. Interne Tester brauchen keine Prüfung durch Apple.
8. **Auf dem iPhone**: App „TestFlight“ aus dem App Store laden, mit derselben Apple-ID anmelden, DOM installieren.

## Daten mitnehmen

Die iPhone-App hat einen eigenen Speicher, getrennt von der Homebildschirm-App. So kommen die Daten rüber:

1. In der **alten** Homebildschirm-App prüfen, dass der Cloud-Abgleich aktuell ist (Einstellungen › Cloud-Abgleich). Zur Sicherheit zusätzlich eine Datei-Sicherung machen.
2. In der **neuen** App unter Einstellungen › Cloud-Abgleich mit derselben E-Mail anmelden. Die Daten laden aus der Cloud. Den Gemini-Schlüssel bringt der Abgleich mit.
3. Erst wenn in der neuen App alles da ist, das alte Symbol vom Homebildschirm löschen.

## Mitteilungen in der iPhone-App (einmalig)

Die Morgenübersicht und die Erinnerung vor Terminen kommen in der iPhone-App über Apples eigenen Dienst. Dafür braucht Supabase einen Schlüssel von Apple.

1. **Schlüssel bei Apple erstellen**: developer.apple.com › Certificates, Identifiers & Profiles › Keys › Plus. Name `DOM Push`, Häkchen bei „Apple Push Notifications service (APNs)“. Falls Apple nach der Umgebung fragt: „Sandbox & Production“. Weiter, registrieren, Datei `AuthKey_….p8` laden (geht nur einmal). Die **Key ID** notieren.
2. **In Supabase eintragen**: supabase.com/dashboard › Projekt › Edge Functions › Secrets. Drei Einträge:
   - `APNS_KEY_P8`: ganzer Text der .p8-Datei
   - `APNS_KEY_ID`: die Key ID aus Schritt 1
   - `APNS_TEAM_ID`: deine Team-ID (dieselbe wie bei GitHub)
3. **Funktion `push` neu einspielen**: Edge Functions › push › Code. Alles löschen und den Inhalt von https://raw.githubusercontent.com/felix260796/dom-app/main/supabase/functions/push/index.ts einfügen, dann „Deploy“.
4. **Auf dem iPhone**: DOM öffnen › Einstellungen › Mitteilungen aufs iPhone › „Mitteilungen erlauben“ › „Test senden“.

Zeitplan und `CRON_SECRET` bleiben wie in `PUSH_EINRICHTEN.md`.

## Läuft dauerhaft von selbst

- Jeden Monat baut GitHub die App neu und lädt sie hoch, damit nie eine Version nach 90 Tagen abläuft. In der TestFlight-App bei DOM „Automatische Updates“ einschalten.
- Der tägliche Supabase-Wachhalter und der monatliche Bau schalten sich selbst immer wieder ein, damit GitHub sie nicht nach 60 Tagen Ruhe abschaltet.
- Das Zertifikat für die Signatur wird bei jedem Bau frisch geholt und kann darum nicht ablaufen. Die Schlüssel (GitHub und Push) haben kein Ablaufdatum.
- Was von Felix abhängt: das Apple-Entwicklerkonto jedes Jahr verlängern (99 USD) und neue Vertragsbedingungen bei Apple bestätigen, wenn Apple per Mail darum bittet. Ohne das nimmt Apple keine neuen Versionen an.
- Schickt GitHub eine Mail „Run failed“, ist ein Bau gescheitert. Dann Bescheid geben, die laufende Version bleibt bis zu ihrem Ablauf nutzbar.

## Gut zu wissen

- TestFlight-Versionen laufen nach 90 Tagen ab. Jeder Merge und der monatliche Lauf bauen eine neue, dann passiert das nicht.
- Die Zahl am App-Symbol setzt in der iPhone-App die Morgenübersicht. Ist unter „Heute“ nichts mehr offen, verschwindet sie beim Öffnen.
- Fehlen die Geheimnisse, überspringt GitHub den Bau einfach (kein Fehler).
