# Gespräch in der Cloud auswerten (einmal einrichten)

Ab App-Version 140 legt DOM jede Gesprächsaufnahme im Firmenspeicher ab (zum Nachhören auf jedem Gerät) und lässt sie von der
Supabase-Funktion „auswertung“ transkribieren. Solange die Funktion fehlt, wertet das Gerät wie bisher selbst aus. Es geht also nichts kaputt.

**Wichtig:** Den Gemini-Schlüssel nie in einen Chat, eine Mail oder ein Bildschirmfoto geben. Du trägst ihn nur in Supabase selbst ein.

## 1. Gemini-Schlüssel als Secret eintragen

1. supabase.com öffnen, anmelden, Projekt **DOM-App** wählen.
2. Links **Edge Functions**, dann oben **Secrets** (bzw. „Manage secrets“).
3. **Add new secret**:
   - Name: `GEMINI_API_KEY`
   - Value: derselbe Schlüssel, der in DOM unter Einstellungen › KI steht (in Google AI Studio unter „API keys“ zu finden).
4. Speichern.

## 2. Funktion anlegen

1. Links **Edge Functions** › **Deploy a new function** › **Via Editor**.
2. Name: `auswertung`.
3. Den ganzen Inhalt der Datei `supabase/functions/auswertung/index.ts` aus GitHub (felix260796/dom-app) in den Editor kopieren.
4. **Deploy**.
5. **Verify JWT** (bzw. „Enforce JWT verification“) **anlassen**. Diese Funktion hat keinen Zeitplan, sie wird nur aus der App aufgerufen, und die App schickt dabei immer deine Anmeldung mit. Zusätzlich prüft die Funktion die Anmeldung selbst.

   Kommt bei der Auswertung trotzdem Fehler 401 (bei manchen Supabase-Projekten mit den neuen Schlüsseln `sb_publishable_…` kann Supabase die Anmeldung am Eingang nicht prüfen), dann Verify JWT ausschalten und speichern. Die Funktion bleibt geschützt, weil sie die Anmeldung selbst prüft: ohne Anmeldung aus der App antwortet sie mit 401 und macht nichts.

## 3. Prüfen

Eine kurze Aufnahme im Reiter Vor Ort machen. Während der Auswertung steht „Wird in der Cloud ausgewertet …“. Danach auf
„Aufnahme prüfen“: an jeder Zeile des Gesprächs steht eine Zeitmarke, ein Tipp spielt ab dieser Stelle ab.

Klappt die Cloud nicht, wertet das Gerät selbst aus und es fällt kaum auf. Ob die Funktion wirklich arbeitet, siehst du in
Supabase unter **Edge Functions › auswertung › Invocations** (bzw. „Logs“): Steht dort Status 200, ist alles gut. Steht dort 401,
bei Schritt 2.5 Verify JWT ausschalten.

## Gut zu wissen

- Supabase Free erlaubt je Aufruf 150 Sekunden. Lange Aufnahmen teilt DOM ohnehin in Stücke (Vorgabe „Lange Aufnahmen in Stücke teilen“, 30 Minuten). Reicht die Zeit für ein Stück nicht, wertet das Gerät dieses Stück selbst aus.
- Speicher: Supabase Free hat 1 GB. Eine Stunde Gespräch braucht etwa 30 bis 60 MB. Aufnahmen werden nach 6 Monaten gelöscht (Vorgabe „Abgelegte Aufnahmen nach so vielen Monaten löschen“).
- Abschalten: Einstellungen › Abläufe › Vor-Ort-Termin, „Gespräch in der Cloud auswerten“ bzw. „Gesprächsaufnahmen in der Cloud ablegen“.
