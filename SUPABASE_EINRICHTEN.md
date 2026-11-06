# Cloud-Abgleich einrichten (Supabase, kostenlos)

Einmalig, ca. 5–10 Minuten. Am einfachsten am PC.
Ergebnis: iPhone und iPad (und PC) haben automatisch dieselben Projekte, Moodboards, Vorlagen und Einstellungen.

## 1. Konto anlegen
1. https://supabase.com öffnen und auf **Start your project** tippen.
2. Mit GitHub anmelden (du hast ja schon ein GitHub-Konto) oder mit E-Mail registrieren.

## 2. Projekt anlegen
1. **New project**.
2. Name: `dom-app`, Region: **Central EU (Frankfurt)**.
3. Ein Datenbank-Passwort vergeben (wird für die App nicht gebraucht, aber gut notieren).
4. Plan: **Free**. Dann **Create new project** und ca. 1–2 Minuten warten.

## 3. Speicher und Zugriffsschutz anlegen (ein Mal kopieren und ausführen)
1. Links auf **SQL Editor** und dann auf **New query**.
2. Diesen Text komplett hineinkopieren und auf **Run** tippen:

```sql
insert into storage.buckets (id, name, public)
values ('dom', 'dom', false)
on conflict (id) do nothing;

create policy "dom_eigene_dateien" on storage.objects
for all to authenticated
using (bucket_id = 'dom' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'dom' and (storage.foldername(name))[1] = auth.uid()::text);
```

Es sollte „Success“ erscheinen. Damit gibt es einen privaten Speicher „dom“, und jeder Benutzer sieht nur seine eigenen Daten.

## 4. Deinen App-Benutzer anlegen
1. Links auf **Authentication** und dann auf **Users**.
2. **Add user** und dann **Create new user**.
3. Deine E-Mail und ein eigenes Passwort eintragen und **Auto Confirm User** anhaken. Dann **Create user**.
4. Empfohlen: Unter **Authentication → Sign In / Providers** die Option **Allow new users to sign up** ausschalten. Dann kann sich niemand Fremdes registrieren.

## 5. Zugangsdaten für die App kopieren
1. Links unten auf **Project Settings** (Zahnrad) und dann auf **API Keys** (bzw. **Data API**).
2. Kopieren:
   - **Project URL**, sieht so aus: `https://abcdefgh.supabase.co`
   - **Publishable key** (`sb_publishable_…`) oder, falls nur der angezeigt wird, den **anon public** Key (`eyJ…`)
3. **Nicht** den „secret“ bzw. „service_role“-Schlüssel nehmen.

## 6. In der App verbinden
Zuerst auf dem iPhone (dort liegen deine aktuellen Daten):
1. DOM-App öffnen, dann **Einstellungen → ☁️ Cloud-Abgleich**.
2. Projekt-URL, Key, E-Mail und Passwort aus Schritt 4 eintragen und **Verbinden** tippen.
3. Es erscheint „✅ Cloud-Abgleich aktiv“. Deine Daten werden hochgeladen.

Dann auf dem iPad: App vom Homebildschirm öffnen und dieselben vier Angaben eintragen. Die Projekte vom iPhone erscheinen nach wenigen Sekunden.

## Gut zu wissen
- Der Abgleich läuft automatisch: beim Öffnen der App, nach jeder Änderung und jede Minute, solange die App offen ist.
- Gleiche Daten auf zwei Geräten gleichzeitig ändern: Der zuletzt gespeicherte Stand gewinnt.
- Der kostenlose Supabase-Tarif pausiert ein Projekt, wenn es **7 Tage lang gar nicht** genutzt wurde. Dann zeigt die App „Cloud nicht erreichbar“. Lösung: bei supabase.com anmelden und beim Projekt auf **Restore** tippen. Die Daten bleiben erhalten.
- Kostenlos sind 1 GB Speicher. Das reicht für mehrere hundert Projekte mit Fotos.
- Die Datei-Sicherung (Einstellungen → Datensicherung) bleibt zusätzlich als Notfall-Kopie, z. B. einmal im Monat.
