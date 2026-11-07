# Mitteilungen aufs iPhone einrichten

Einmalig, ca. 10 Minuten, am besten am PC. Voraussetzung: Der Cloud-Abgleich (Supabase) läuft und die Terminmails sind eingerichtet (dort hast du schon ein `CRON_SECRET` angelegt).

Danach bekommst du jeden Morgen zur eingestellten Uhrzeit eine Mitteilung wie „Heute: 2 Termine, 1 Angebot nachfassen, 1 Rechnung überfällig“, dazu kurz vor jedem Termin eine Erinnerung. Am App-Symbol steht eine Zahl, wie viel heute offen ist. Tippst du auf die Mitteilung, öffnet sich die App bei „Heute“ bzw. im Kalender.

---

## 1. Funktion in Supabase anlegen
1. https://supabase.com/dashboard öffnen und dein Projekt `dom-app` wählen.
2. Links auf **Edge Functions**, dann **Deploy a new function** und **Via Editor**.
3. Als Name `push` eintragen (genau so).
4. Den Beispieltext im Editor komplett löschen. Dann den Inhalt dieser Datei hineinkopieren:
   https://raw.githubusercontent.com/felix260796/dom-app/main/supabase/functions/push/index.ts
   (Link öffnen, alles markieren mit Strg+A, kopieren mit Strg+C, im Editor einfügen mit Strg+V.)
5. Auf **Deploy function** klicken und kurz warten.
6. In der Funktion unter **Details** bzw. **Settings** **Verify JWT** ausschalten und speichern.

Weitere Geheimnisse brauchst du nicht. Die Schlüssel für die Mitteilungen erzeugt die Funktion beim ersten Mal selbst und legt sie geschützt in Supabase ab.

## 2. Zeitplan anlegen
1. Links auf **Integrations** und dann auf **Cron**.
2. **Create job**:
   - Name: `push-hinweise`
   - Schedule: `*/15 * * * *` (alle 15 Minuten)
   - Type: **Supabase Edge Function**, Method **POST**, Function **push**
   - HTTP Headers: Name `x-cron-secret`, Wert = dasselbe `CRON_SECRET` wie bei den Terminmails
   - HTTP Request Body: `{"aktion":"lauf"}`
3. **Create cron job**.

## 3. Auf dem iPhone einschalten (du und Deniel, jeder auf seinem Gerät)
1. DOM über das Symbol auf dem **Home-Bildschirm** öffnen (nicht im Safari-Fenster). Nötig ist iOS 16.4 oder neuer.
2. Aufs DOM-Logo tippen, ganz unten auswählen, wem das Gerät gehört (Felix oder Deniel).
3. **Einstellungen → Mitteilungen aufs iPhone → Mitteilungen erlauben** und beim iPhone-Hinweis **Erlauben** tippen.
4. **Test senden** tippen. Kommt die Mitteilung, ist alles eingerichtet. **Übersicht jetzt** zeigt dir sofort, wie die Morgenübersicht aussieht.

Uhrzeit, Minuten vor dem Termin und welche Hinweise kommen, stellst du auf derselben Seite ein. Klappt etwas nicht, zeigt die App die Fehlermeldung an. Schick sie mir einfach.
