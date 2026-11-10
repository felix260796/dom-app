// DOM – Terminmails (Supabase Edge Function „termin-mail“), Stand 6.11.2026: eigene Mail je Empfänger (Team, Kunde, Subunternehmer)
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

type Rolle = "team" | "kunde" | "partner";
type Person = { name?: string; email?: string; rolle?: Rolle; anrede?: string };
type Texte = Partial<Record<Rolle, { bestaetigung?: string; erinnerung?: string }>>;
type Termin = {
  id: string; titel?: string; art?: string; datum: string; von?: string; bis?: string; ganztag?: boolean;
  ort?: string; notiz?: string; erinnerung?: number; mailAn?: Person[];
  kontext?: { kunde?: string; kundeTel?: string; objekt?: string; projekt?: string; partner?: string; firma?: string; kontakt?: string; wer?: string; werKontakt?: string; texte?: Texte };
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
// Jeder Empfänger bekommt seine eigene Mail:
//   team     alle Angaben (Kunde mit Telefon, Objekt, Projekt, Subunternehmer, wer dabei ist, Notiz)
//   kunde    nur Anlass, Zeit, Ort und wer von uns kommt, kein Hinweis auf den Subunternehmer, keine interne Notiz
//   partner  Anlass, Zeit, Adresse, Projekt, Kundenname und dass der Termin mit uns ist, ohne Kundentelefon und Notiz
const STANDARD: Record<Rolle, { bestaetigung: string; erinnerung: string }> = {
  team: { bestaetigung: "Neuer Termin im Kalender, hier alle Angaben.", erinnerung: "Erinnerung an den folgenden Termin." },
  kunde: { bestaetigung: "vielen Dank für Ihr Vertrauen. Hiermit bestätigen wir unseren Termin bei Ihnen.", erinnerung: "wir möchten Sie an unseren Termin bei Ihnen erinnern. Wir freuen uns auf Sie." },
  partner: { bestaetigung: "hiermit bestätigen wir den folgenden Termin mit uns.", erinnerung: "kurze Erinnerung an unseren gemeinsamen Termin." },
};
const rolleVon = (p: Person): Rolle => (p.rolle === "kunde" || p.rolle === "partner" ? p.rolle : "team");
const firmaVon = (t: Termin) => t.kontext?.firma || "DOM Projektmanagement";

function ics(t: Termin, methode: "REQUEST" | "CANCEL", seq: number, rolle: Rolle = "team") {
  const tx = (s: unknown) => String(s ?? "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const d = t.datum.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const utc = (x: Date) => x.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const naechster = new Date(Date.UTC(+t.datum.slice(0, 4), +t.datum.slice(5, 7) - 1, +t.datum.slice(8, 10) + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  const start = zeitpunkt(t.datum, t.von), ende = t.bis ? zeitpunkt(t.datum, t.bis) : new Date(start.getTime() + 3600e3);
  const k = t.kontext || {};
  const info = rolle === "team" ? [k.kunde, k.kundeTel, k.partner && `Subunternehmer: ${k.partner}`, t.notiz]
    : rolle === "kunde" ? [firmaVon(t), k.wer && `Von uns: ${k.wer}`]
    : [`Termin mit ${firmaVon(t)}`, k.projekt, k.kunde && `Kunde: ${k.kunde}`];
  const titel = rolle === "kunde" ? `${t.titel || "Termin"} (${firmaVon(t)})` : rolle === "partner" ? `${t.titel || "Termin"} mit ${firmaVon(t)}` : t.titel;
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DOM Projektmanagement//Termine//DE", `METHOD:${methode}`, "BEGIN:VEVENT", `UID:${t.id}@dom-app`, `SEQUENCE:${seq}`, `DTSTAMP:${stamp}`,
    ...(t.ganztag ? [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${naechster}`] : [`DTSTART:${utc(start)}`, `DTEND:${utc(ende)}`]),
    `SUMMARY:${tx(titel)}`, ...(t.ort ? [`LOCATION:${tx(t.ort)}`] : []), `DESCRIPTION:${tx(info.filter(Boolean).join("\n"))}`,
    ...(methode === "CANCEL" ? ["STATUS:CANCELLED"] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

type Art = "bestaetigung" | "aenderung" | "absage" | "erinnerung";
const KOPF: Record<Art, string> = { bestaetigung: "Terminbestätigung", aenderung: "Termin geändert", absage: "Termin abgesagt", erinnerung: "Terminerinnerung" };
function satz(t: Termin, rolle: Rolle, art: Art, wann = "") {
  const eigen = t.kontext?.texte?.[rolle];
  if (art === "absage") return rolle === "kunde" ? "leider müssen wir den folgenden Termin absagen. Wir melden uns für einen neuen Termin bei Ihnen." : "der folgende Termin findet leider nicht statt.";
  if (art === "aenderung") return rolle === "kunde" ? "unser Termin bei Ihnen hat sich geändert. Hier der neue Stand." : "der Termin hat sich geändert, hier der neue Stand.";
  const text = (art === "erinnerung" ? eigen?.erinnerung : eigen?.bestaetigung)?.trim() || STANDARD[rolle][art];
  return art === "erinnerung" && wann ? `${text} Der Termin ist ${wann}.` : text;
}
function mailHtml(t: Termin, p: Person, art: Art, wann = "") {
  const k = t.kontext || {}, rolle = rolleVon(p), firma = firmaVon(t);
  const zeile = (l: string, v?: string, html?: string) => (v ? `<tr><td style="padding:6px 14px 6px 0;color:#6b7380;vertical-align:top">${l}</td><td style="padding:6px 0;font-weight:600">${html ?? esc(v)}</td></tr>` : "");
  const karte = t.ort ? `<a href="https://maps.apple.com/?q=${encodeURIComponent(t.ort)}" style="color:#2b4a6f">${esc(t.ort)}</a>` : "";
  const anlass = zeile("Anlass", t.titel || "Termin"), zeit = zeile("Wann", wannText(t));
  const zeilen = rolle === "team"
    ? anlass + zeit + zeile("Wo", t.ort, karte) + zeile("Kunde", [k.kunde, k.kundeTel].filter(Boolean).join(" · ")) + zeile("Objekt", k.objekt) + zeile("Projekt", k.projekt) + zeile("Subunternehmer", k.partner) + zeile("Dabei", k.wer) + zeile("Notiz", t.notiz)
    : rolle === "kunde"
      ? anlass + zeit + zeile("Wo", t.ort, karte) + zeile("Von uns kommt", k.wer)
      : anlass + zeit + zeile("Adresse", t.ort, karte) + zeile("Projekt", k.projekt) + zeile("Kunde", k.kunde) + zeile("Termin mit", [firma, k.werKontakt || k.wer].filter(Boolean).join(" · "));
  const vor = String(p.name || "").trim();
  // Anrede kommt aus der App (Kundenkarte bzw. Subunternehmer); sonst wie bisher
  const anrede = String(p.anrede || "").trim() || (rolle === "team" ? "Hallo," : rolle === "kunde" ? `Guten Tag${vor ? " " + vor : ""},` : `Hallo${vor ? " " + vor.split(",")[0] : ""},`);
  const gruss = rolle === "team" ? "" : `<p style="margin:18px 0 0">Viele Grüße<br>${esc(firma)}${k.kontakt ? `<br><span style="font-size:13px;color:#6b7380">${esc(k.kontakt)}</span>` : ""}</p>`;
  return `<!doctype html><html><body style="margin:0;background:#f3f1ec;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1b2533">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#1e3550;color:#fff;border-radius:16px 16px 0 0;padding:18px 20px"><div style="font-size:13px;opacity:.75">${esc(firma)}</div><div style="font-size:21px;font-weight:700;margin-top:4px">${esc(KOPF[art])}</div></div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:18px 20px">
      <p style="margin:0 0 4px">${esc(anrede)}</p>
      <p style="margin:0 0 14px">${esc(satz(t, rolle, art, wann))}</p>
      <table style="border-collapse:collapse;font-size:15px">${zeilen}</table>
      ${gruss}
      <p style="margin:18px 0 0;font-size:13px;color:#6b7380">${art === "absage" ? "Im Anhang ist die Absage, damit der Termin aus dem Kalender verschwindet." : "Im Anhang ist der Termin zum Übernehmen in den Kalender."}</p>
    </div>
  </div></body></html>`;
}
function betreff(t: Termin, p: Person, art: Art, wann = "") {
  const rolle = rolleVon(p), was = t.titel || "Termin", firma = firmaVon(t);
  const vorne = { bestaetigung: "Terminbestätigung", aenderung: "Termin geändert", absage: "Abgesagt", erinnerung: "Erinnerung" }[art];
  const mit = rolle === "partner" ? ` mit ${firma}` : rolle === "kunde" ? ` – ${firma}` : "";
  return `${vorne}: ${was}${mit}${art === "erinnerung" && wann ? ` ${wann}` : ""}, ${wannText(t)}`;
}
/** Eine Mail je Empfänger, passend zu seiner Rolle. */
async function anAlle(t: Termin, an: Person[], art: Art, wann = "") {
  const methode = art === "absage" ? "CANCEL" : "REQUEST";
  const seq = art === "bestaetigung" || art === "erinnerung" ? 0 : Math.floor(Date.now() / 1000);
  let n = 0;
  const gueltig = an.filter((p) => /.+@.+\..+/.test(p.email || ""));
  for (const p of gueltig) {
    n += await senden([p], betreff(t, p, art, wann), mailHtml(t, p, art, wann), { name: art === "absage" ? "Absage.ics" : "Termin.ics", text: ics(t, methode, seq, rolleVon(p)), methode });
  }
  return n;
}

// ---------- Versand ----------
async function senden(an: Person[], betreff: string, html: string, anhang?: { name: string; text: string; methode: string }) {
  const empf = an.filter((p) => /.+@.+\..+/.test(p.email || "")).map((p) => (p.name ? `${p.name.replace(/[<>"]/g, "")} <${p.email}>` : p.email!));
  if (!empf.length) return 0;
  // Kurze Zeilen: Sehr lange HTML-Zeilen werden beim Versand (Quoted-Printable) umbrochen, manche Mailprogramme
  // zeigen das dann kaputt an (verschobene Tabelle, „=“-Zeichen, falsche Umlaute). Ein Umbruch nach jedem Tag verhindert das.
  html = html.replace(/>\s*</g, ">\n<");
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
    await anAlle(t, t.mailAn, "erinnerung", wann);
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
    const art: Art = body.aktion === "absage" ? "absage" : body.aktion === "aenderung" ? "aenderung" : "bestaetigung";
    return antwort({ ok: true, gesendet: await anAlle(t, an, art) });
  } catch (e) {
    console.error(e);
    return antwort({ fehler: String((e as Error)?.message || e) }, 500);
  }
});
