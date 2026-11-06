# Terminmails einrichten (Bestätigung und Erinnerung)

Einmalig, ca. 15–20 Minuten, am besten am PC. Voraussetzung: Der Cloud-Abgleich (Supabase) läuft schon.

Danach gilt: Wenn du in der App einen Termin speicherst, bekommen alle Beteiligten (du, Deniel, der Subunternehmer, auf Wunsch der Kunde) eine **Terminbestätigung** mit Anlass, Zeit und Ort. Im Anhang ist eine Kalendereinladung. Zum eingestellten Zeitpunkt (z. B. 1 oder 2 Tage vorher) kommt eine **Erinnerung**. Änderst oder löschst du den Termin, geht auf Wunsch eine Änderung bzw. Absage raus.

---

## 1. Absender festlegen

Die Mails werden über ein normales E-Mail-Postfach verschickt. Nimm eine der beiden Möglichkeiten:

**A) Gmail (am schnellsten)**
1. https://myaccount.google.com/security öffnen und die **Bestätigung in zwei Schritten** einschalten, falls noch nicht geschehen.
2. https://myaccount.google.com/apppasswords öffnen, als Name `DOM-App` eingeben und auf **Erstellen** klicken.
3. Das 16-stellige Passwort notieren (ohne Leerzeichen). Es wird nur einmal angezeigt.

Deine Werte für Schritt 3:
`SMTP_HOST` = `smtp.gmail.com` · `SMTP_PORT` = `465` · `SMTP_USER` = deine Gmail-Adresse · `SMTP_PASS` = das App-Passwort · `MAIL_FROM` = `DOM Projektmanagement <deine Gmail-Adresse>`

**B) Firmen-Postfach (z. B. termine@deine-firma.de bei IONOS, Strato, …)**
Die Angaben findest du beim Anbieter unter „SMTP-Server“ bzw. „Postausgangsserver“. Bei IONOS ist das `smtp.ionos.de`, bei Strato `smtp.strato.de`. Port ist `465`, Benutzer ist die E-Mail-Adresse, dazu ihr Passwort. `MAIL_FROM` = `DOM Projektmanagement <termine@deine-firma.de>`.

(Wer lieber den Mail-Dienst resend.com nutzt: Dort braucht es eine eigene Domain. Dann statt der SMTP-Werte nur `RESEND_API_KEY` eintragen.)

## 2. Funktion in Supabase anlegen
1. https://supabase.com/dashboard öffnen und dein Projekt `dom-app` wählen.
2. Links auf **Edge Functions**, dann **Deploy a new function** und **Via Editor**.
3. Als Name `termin-mail` eintragen (genau so).
4. Den vorhandenen Beispieltext im Editor komplett löschen. Dann den Inhalt dieser Datei hineinkopieren:
   https://raw.githubusercontent.com/felix260796/dom-app/main/supabase/functions/termin-mail/index.ts
   (Link öffnen, alles markieren mit Strg+A, kopieren mit Strg+C, im Editor einfügen mit Strg+V.)
5. Auf **Deploy function** klicken und kurz warten.
6. In der Funktion oben auf **Details** bzw. **Settings** gehen. Dort **Verify JWT** (bzw. „Enforce JWT verification“) **ausschalten** und speichern. Die Funktion prüft die Anmeldung selbst.

## 3. Geheimnisse eintragen
1. Links auf **Edge Functions** und dann auf **Secrets**.
2. Diese Einträge anlegen (Name links, Wert rechts):
   - `MAIL_FROM`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (aus Schritt 1)
   - `CRON_SECRET`: ein langes Fantasiewort, z. B. `dom-erinnerung-7Kx2pQ9` (notieren, wird in Schritt 4 gebraucht)
3. **Save**.

## 4. Erinnerungen zeitgesteuert starten
1. Links auf **Integrations** und dann auf **Cron**. Falls gefragt, **Enable pg_cron** bestätigen.
2. **Create job**:
   - Name: `termin-erinnerungen`
   - Schedule: `*/15 * * * *` (alle 15 Minuten)
   - Type: **Supabase Edge Function**, Method **POST**, Function **termin-mail**
   - HTTP Headers: einen Header hinzufügen, Name `x-cron-secret`, Wert = dein `CRON_SECRET`
   - HTTP Request Body: `{"aktion":"erinnerungen"}`
3. **Create cron job**.

## 5. In der App einschalten
1. In der App auf **Einstellungen → Team** gehen.
2. Bei dir und bei Deniel die E-Mail-Adresse eintragen.
3. Auf **Test-Mail an das Team senden** tippen. Kommt die Mail an, sind die Terminmails eingeschaltet.
4. Beim Subunternehmer die E-Mail in seiner Karte eintragen. Dann bekommt er die Mails ebenfalls, sobald er beim Termin ausgewählt ist.

Klappt etwas nicht, zeigt die App die Fehlermeldung an. Schick sie mir einfach.

---

## Funktion aktualisieren (wenn sich der Mail-Inhalt ändert)
1. https://supabase.com/dashboard/project/flqjnhetnqdcgskjsgkv/functions öffnen und **termin-mail** anklicken.
2. Oben auf **Code** gehen.
3. Im Editor alles markieren (Strg+A) und löschen.
4. Den neuen Inhalt von https://raw.githubusercontent.com/felix260796/dom-app/main/supabase/functions/termin-mail/index.ts kopieren und einfügen.
5. Unten rechts auf **Deploy** klicken. Die Secrets und der Cron-Job bleiben, wie sie sind.
6. Unter **Settings** kurz prüfen, dass „Verify JWT“ weiterhin aus ist.
