// DOM – Terminmails (Supabase Edge Function „termin-mail“)
// 1. Die App ruft sie beim Speichern eines Termins auf: Bestätigung (bzw. Änderung/Absage) an alle Beteiligten,
//    mit Kalendereinladung (.ics) im Anhang.
// 2. Ein Zeitplan (Supabase Cron, z. B. alle 15 Minuten) ruft sie mit { aktion: "erinnerungen" } auf:
//    Sie liest die Termine aus dem Firmenspeicher (Bucket „dom“, Ordner „team“) und schickt die Erinnerung,
//    sobald der eingestellte Vorlauf (z. B. 1 oder 2 Tage vorher) erreicht ist. Jede Erinnerung geht nur einmal raus.
//
// Geheimnisse (Edge Functions → Secrets):
//   MAIL_FROM      Absender, z. B.  DOM Projektmanagement <termine@deine-firma.de>
//   CRON_SECRET    beliebiges langes Wort, steht auch im Cron-Auftrag (Header x-cron-secret)
//   und entweder   RESEND_API_KEY  (Mail-Dienst resend.com)
//   oder SMTP:     SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS  (z. B. Gmail mit App-Passwort, IONOS, Strato)
// SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
// Beim Anlegen „Verify JWT“ ausschalten: die Funktion prüft die Anmeldung selbst.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const URL_ = env("SUPABASE_URL"), SRK = env("SUPABASE_SERVICE_ROLE_KEY"), ANON = env("SUPABASE_ANON_KEY");
const BUCKET = "dom", SPACE = "team", STATUS = "system/mailversand.json";
const TZ = "Europe/Berlin";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Person = { name?: string; email?: string };
type Termin = {
  id: string; titel?: string; art?: string; datum: string; von?: string; bis?: string; ganztag?: boolean;
  ort?: string; notiz?: string; erinnerung?: number; mailAn?: Person[]; kontext?: { kunde?: string; kundeTel?: string; objekt?: string; partner?: string; firma?: string; wer?: string };
};

// ---------- Zeit (deutsche Ortszeit, inkl. Sommerzeit) ----------
function offsetMin(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000;
}
/** „2026-11-13“ + „14:00“ (deutsche Zeit) → Zeitpunkt */
function zeitpunkt(datum: string, zeit = "00:00") {
  const [j, m, t] = datum.split("-").map(Number), [h, mi] = (zeit || "00:00").split(":").map(Number);
  const guess = new Date(Date.UTC(j, m - 1, t, h, mi));
  return new Date(guess.getTime() - offsetMin(guess) * 60000);
}
const tagText = (datum: string) => new Date(datum + "T12:00:00Z").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const wannText = (t: Termin) => `${tagText(t.datum)}${t.ganztag ? " (ganztags)" : `, ${t.von || ""} Uhr${t.bis ? ` bis ${t.bis} Uhr` : ""}`}`;

// ---------- Inhalt ----------
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function ics(t: Termin, methode: "REQUEST" | "CANCEL", seq: number) {
  const tx = (s: unknown) => String(s ?? "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const d = t.datum.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const utc = (x: Date) => x.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const naechster = new Date(Date.UTC(+t.datum.slice(0, 4), +t.datum.slice(5, 7) - 1, +t.datum.slice(8, 10) + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  const start = zeitpunkt(t.datum, t.von), ende = t.bis ? zeitpunkt(t.datum, t.bis) : new Date(start.getTime() + 3600e3);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DOM Projektmanagement//Termine//DE", `METHOD:${methode}`, "BEGIN:VEVENT", `UID:${t.id}@dom-app`, `SEQUENCE:${seq}`, `DTSTAMP:${stamp}`,
    ...(t.ganztag ? [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${naechster}`] : [`DTSTART:${utc(start)}`, `DTEND:${utc(ende)}`]),
    `SUMMARY:${tx(t.titel)}`, ...(t.ort ? [`LOCATION:${tx(t.ort)}`] : []), `DESCRIPTION:${tx([t.kontext?.kunde, t.notiz].filter(Boolean).join("\n"))}`,
    ...(methode === "CANCEL" ? ["STATUS:CANCELLED"] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
function mailHtml(t: Termin, kopf: string, text: string) {
  const k = t.kontext || {};
  const zeile = (l: string, v?: string, html?: string) => (v ? `<tr><td style="padding:6px 14px 6px 0;color:#6b7380;vertical-align:top">${l}</td><td style="padding:6px 0;font-weight:600">${html ?? esc(v)}</td></tr>` : "");
  const karte = t.ort ? `<a href="https://maps.apple.com/?q=${encodeURIComponent(t.ort)}" style="color:#2b4a6f">${esc(t.ort)}</a>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f3f1ec;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b2533">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#1e3550;color:#fff;border-radius:16px 16px 0 0;padding:18px 20px"><div style="font-size:13px;opacity:.75">${esc(k.firma || "DOM Projektmanagement")}</div><div style="font-size:21px;font-weight:700;margin-top:4px">${esc(kopf)}</div></div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:18px 20px">
      <p style="margin:0 0 14px">${esc(text)}</p>
      <table style="border-collapse:collapse;font-size:15px">
        ${zeile("Anlass", t.titel || "Termin")}${zeile("Wann", wannText(t))}${zeile("Wo", t.ort, karte)}
        ${zeile("Kunde", [k.kunde, k.kundeTel].filter(Boolean).join(" · "))}${zeile("Objekt", k.objekt)}${zeile("Subunternehmer", k.partner)}${zeile("Dabei", k.wer)}${zeile("Notiz", t.notiz)}
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#6b7380">Im Anhang ist der Termin zum Übernehmen in den Kalender.</p>
    </div>
  </div></body></html>`;
}

// ---------- Versand ----------
async function senden(an: Person[], betreff: string, html: string, anhang?: { name: string; text: string; methode: string }) {
  const empf = an.filter((p) => /.+@.+\..+/.test(p.email || "")).map((p) => (p.name ? `${p.name.replace(/[<>"]/g, "")} <${p.email}>` : p.email!));
  if (!empf.length) return 0;
  const from = env("MAIL_FROM");
  if (!from) throw new Error("MAIL_FROM fehlt (Absender)");
  if (env("RESEND_API_KEY")) {
    for (const to of empf) { // einzeln, damit niemand die anderen Adressen sieht
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: betreff, html, ...(anhang ? { attachments: [{ filename: anhang.name, content: btoa(unescape(encodeURIComponent(anhang.text))), content_type: `text/calendar; method=${anhang.methode}` }] } : {}) }),
      });
      if (!r.ok) throw new Error(`Resend: ${r.status} ${await r.text()}`);
    }
    return empf.length;
  }
  if (!env("SMTP_HOST")) throw new Error("Kein Mail-Dienst eingerichtet (RESEND_API_KEY oder SMTP_HOST fehlt)");
  const client = new SMTPClient({ connection: { hostname: env("SMTP_HOST"), port: +(env("SMTP_PORT") || 465), tls: true, auth: { username: env("SMTP_USER"), password: env("SMTP_PASS") } } });
  try {
    for (const to of empf) {
      await client.send({ from, to, subject: betreff, html, content: "auto",
        ...(anhang ? { attachments: [{ filename: anhang.name, content: anhang.text, encoding: "text", contentType: `text/calendar; method=${anhang.methode}; charset=utf-8` }] } : {}) });
    }
  } finally { await client.close(); }
  return empf.length;
}

// ---------- Speicher (Service-Zugang) ----------
const sto = (path: string, init: RequestInit = {}) => fetch(`${URL_}/storage/v1/${path}`, { ...init, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, ...(init.headers || {}) } });
async function terminListe(): Promise<Termin[]> {
  const out: Termin[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await sto(`object/list/${BUCKET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: SPACE, search: "termin--", limit: 1000, offset }) });
    if (!r.ok) throw new Error(`Speicher: ${r.status} ${await r.text()}`);
    const items = (await r.json()).filter((x: { id?: string; name: string }) => x.id && x.name.startsWith("termin--") && x.name.endsWith(".json"));
    for (const x of items) {
      const f = await sto(`object/${BUCKET}/${SPACE}/${encodeURIComponent(x.name)}`);
      if (f.ok) { const j = await f.json().catch(() => null); if (j?.v?.id && j.v.datum) out.push(j.v); }
    }
    if (items.length < 1000) return out;
  }
}
async function statusLesen(): Promise<Record<string, number>> {
  const r = await sto(`object/${BUCKET}/${STATUS}`);
  return r.ok ? await r.json().catch(() => ({})) : {};
}
const statusSchreiben = (s: Record<string, number>) => sto(`object/${BUCKET}/${STATUS}`, { method: "POST", headers: { "Content-Type": "application/json", "x-upsert": "true" }, body: JSON.stringify(s) });

async function erinnerungen() {
  const jetzt = Date.now(), st = await statusLesen();
  let n = 0, geaendert = false;
  for (const t of await terminListe()) {
    const tage = Number(t.erinnerung) || 0;
    if (!tage || !t.mailAn?.length) continue;
    const start = zeitpunkt(t.datum, t.ganztag ? "08:00" : t.von).getTime();
    const ab = start - tage * 864e5;
    const schluessel = `${t.id}|${t.datum}|${t.ganztag ? "" : t.von}|${tage}`; // neue Zeit → neue Erinnerung
    if (st[schluessel] || jetzt < ab || jetzt > start) continue;
    const wann = tage === 1 ? "morgen" : tage === 7 ? "in einer Woche" : `in ${tage} Tagen`;
    await senden(t.mailAn, `Erinnerung: ${t.titel || "Termin"} ${wann}, ${wannText(t)}`, mailHtml(t, "Terminerinnerung", `Kurze Erinnerung an unseren Termin ${wann}.`), { name: "Termin.ics", text: ics(t, "REQUEST", 0), methode: "REQUEST" });
    st[schluessel] = jetzt; n++; geaendert = true;
  }
  // alte Einträge (älter als 60 Tage) aufräumen
  for (const [k, v] of Object.entries(st)) if (jetzt - v > 60 * 864e5) { delete st[k]; geaendert = true; }
  if (geaendert) await statusSchreiben(st);
  return n;
}

// ---------- Aufruf ----------
async function angemeldet(req: Request) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return false;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON || SRK, Authorization: `Bearer ${tok}` } });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.aktion === "erinnerungen") {
      if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return antwort({ fehler: "nicht erlaubt" }, 401);
      return antwort({ ok: true, gesendet: await erinnerungen() });
    }
    if (!(await angemeldet(req))) return antwort({ fehler: "Bitte in der App beim Cloud-Abgleich anmelden." }, 401);
    if (body.aktion === "test") {
      const n = await senden(body.an || [], "DOM: Test der Terminmails", `<p>Hallo,</p><p>die Terminmails der DOM-App funktionieren.</p>`);
      return antwort({ ok: true, gesendet: n });
    }
    const t: Termin = body.termin;
    if (!t?.id || !t.datum) return antwort({ fehler: "Termin fehlt" }, 400);
    const an = (t.mailAn || []).concat(body.zusaetzlich || []);
    let n = 0;
    if (body.aktion === "absage") {
      n = await senden(an, `Abgesagt: ${t.titel || "Termin"}, ${wannText(t)}`, mailHtml(t, "Termin abgesagt", "Dieser Termin findet leider nicht statt."), { name: "Absage.ics", text: ics(t, "CANCEL", Math.floor(Date.now() / 1000)), methode: "CANCEL" });
    } else {
      const neu = body.aktion !== "aenderung";
      n = await senden(an, `${neu ? "Terminbestätigung" : "Termin geändert"}: ${t.titel || "Termin"}, ${wannText(t)}`,
        mailHtml(t, neu ? "Terminbestätigung" : "Termin geändert", neu ? "Hiermit bestätigen wir den folgenden Termin." : "Der Termin hat sich geändert, hier der neue Stand."),
        { name: "Termin.ics", text: ics(t, "REQUEST", neu ? 0 : Math.floor(Date.now() / 1000)), methode: "REQUEST" });
    }
    return antwort({ ok: true, gesendet: n });
  } catch (e) {
    console.error(e);
    return antwort({ fehler: String((e as Error)?.message || e) }, 500);
  }
});
