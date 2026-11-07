// DOM – Mitteilungen aufs iPhone (Supabase Edge Function „push“), Stand 7.11.2026
// 1. Die App meldet ein Gerät an ({ aktion: "anmelden" }): Das iPhone gibt eine Push-Adresse heraus, die hier mit den
//    Einstellungen des Geräts (Uhrzeit der Morgenübersicht, welche Hinweise, für wen) gespeichert wird.
// 2. Ein Zeitplan (Supabase Cron, alle 15 Minuten) ruft { aktion: "lauf" } auf. Dann gehen raus:
//    - die Morgenübersicht zur eingestellten Uhrzeit (Termine heute, Nachfassen, überfällige Rechnungen, Lieferungen, Mängel)
//    - eine Erinnerung kurz vor jedem Termin (eingestellte Minuten vorher)
//    Jede Mitteilung geht nur einmal raus.
// Die Schlüssel für Web-Push (VAPID) erzeugt die Funktion beim ersten Aufruf selbst und legt sie im Speicher unter
// „system/“ ab. Dort kommt nur Supabase selbst hin (die App sieht nur den Ordner „team“). Es gibt also keine
// zusätzlichen Geheimnisse einzutragen, nur CRON_SECRET (dasselbe wie bei den Terminmails).
// Beim Anlegen „Verify JWT“ ausschalten: die Funktion prüft die Anmeldung selbst.

import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const URL_ = env("SUPABASE_URL"), SRK = env("SUPABASE_SERVICE_ROLE_KEY"), ANON = env("SUPABASE_ANON_KEY");
const BUCKET = "dom", SPACE = "team", SYS = "system";
const TZ = "Europe/Berlin";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Prefs = { morgen?: string; termin?: number; nachfassen?: boolean; nachfassenTage?: number; geld?: boolean; baustelle?: boolean; vorlauf?: number; wer?: string };
type Geraet = { id: string; sub: { endpoint: string; keys: { p256dh: string; auth: string } }; prefs: Prefs; name?: string; created: number; updated: number };
type Termin = { id: string; titel?: string; datum: string; von?: string; ganztag?: boolean; ort?: string; wer?: string[]; kontext?: { kunde?: string } };

// ---------- Speicher (Service-Zugang) ----------
const sto = (path: string, init: RequestInit = {}) => fetch(`${URL_}/storage/v1/${path}`, { ...init, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, ...(init.headers || {}) } });
async function lesen<T>(pfad: string, standard: T): Promise<T> {
  const r = await sto(`object/${BUCKET}/${pfad}`);
  return r.ok ? ((await r.json().catch(() => standard)) as T) : standard;
}
const schreiben = (pfad: string, v: unknown) => sto(`object/${BUCKET}/${pfad}`, { method: "POST", headers: { "Content-Type": "application/json", "x-upsert": "true" }, body: JSON.stringify(v) });
/** Alle Einträge einer Art aus dem Firmenspeicher (z. B. "termin" → team/termin--<id>.json). */
async function alle<T>(art: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await sto(`object/list/${BUCKET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: SPACE, search: art + "--", limit: 1000, offset }) });
    if (!r.ok) throw new Error(`Speicher: ${r.status} ${await r.text()}`);
    const items = (await r.json()).filter((x: { id?: string; name: string }) => x.id && x.name.startsWith(art + "--") && x.name.endsWith(".json"));
    const teile = await Promise.all(items.map(async (x: { name: string }) => {
      const f = await sto(`object/${BUCKET}/${SPACE}/${encodeURIComponent(x.name)}`);
      return f.ok ? (await f.json().catch(() => null))?.v : null;
    }));
    out.push(...teile.filter(Boolean));
    if (items.length < 1000) return out;
  }
}
const einzeln = async <T>(k: string): Promise<T | null> => (await lesen<{ v?: T }>(`${SPACE}/${encodeURIComponent(k.replace(/:/g, "--"))}.json`, {})).v ?? null;

// ---------- Schlüssel ----------
async function vapid() {
  let v = await lesen<{ publicKey?: string; privateKey?: string }>(`${SYS}/push-vapid.json`, {});
  if (!v.publicKey || !v.privateKey) { v = webpush.generateVAPIDKeys(); await schreiben(`${SYS}/push-vapid.json`, v); }
  webpush.setVapidDetails("mailto:" + (env("PUSH_KONTAKT") || "info@dom-projektmanagement.de"), v.publicKey!, v.privateKey!);
  return v.publicKey!;
}

// ---------- Zeit (deutsche Ortszeit) ----------
function teile(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { datum: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
const plusTage = (datum: string, n: number) => { const d = new Date(datum + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const minuten = (hm = "") => { const m = /^(\d{1,2})[:.](\d{2})$/.exec(hm.trim()); return m ? +m[1] * 60 + +m[2] : -1; };
const tageSeit = (iso?: string | number, heute = "") => (iso ? Math.floor((Date.parse(heute + "T12:00:00Z") - new Date(iso).getTime()) / 864e5) : -1);

// ---------- Inhalt der Morgenübersicht ----------
type Daten = { termine: Termin[]; idx: any[]; rechnungen: any[]; belege: any[]; wohnungen: any[] };
const fuer = (t: Termin, wer = "") => !wer || !t.wer?.length || t.wer.includes(wer);
const STATUS = ["besichtigung", "entwurf", "angebot", "abgesagt", "geplant", "", "fertig", "rechnung", "bezahlt"];
const norm = (s: unknown) => (STATUS.includes(String(s ?? "")) ? String(s ?? "") : ""); // wie Projekt.norm in der App
function morgen(d: Daten, p: Prefs, heute: string) {
  const zeilen: string[] = [];
  let zahl = 0;
  const vor = plusTage(heute, p.vorlauf ?? 3);
  const tt = d.termine.filter((t) => t.datum === heute && fuer(t, p.wer)).sort((a, b) => (a.von || "").localeCompare(b.von || ""));
  if (tt.length) { zahl += tt.length; zeilen.push(`${tt.length} ${tt.length === 1 ? "Termin" : "Termine"}: ${tt.slice(0, 3).map((t) => `${t.ganztag || !t.von ? "" : t.von + " "}${t.titel || "Termin"}`).join(", ")}${tt.length > 3 ? " …" : ""}`); }
  if (p.nachfassen !== false) {
    const n = d.idx.filter((x) => norm(x.status) === "angebot" && tageSeit(x.versendetAm, heute) >= (p.nachfassenTage ?? 7)).length;
    if (n) { zahl += n; zeilen.push(`${n} ${n === 1 ? "Angebot" : "Angebote"} nachfassen`); }
  }
  if (p.geld !== false) {
    const k = d.rechnungen.filter((r) => !r.bezahlt && r.faellig && r.faellig < heute).length;
    const e = d.belege.filter((b) => !b.bezahlt && b.faellig && b.faellig <= vor).length;
    const a = d.idx.filter((x) => norm(x.status) === "fertig").length;
    if (k) zeilen.push(`${k} ${k === 1 ? "Kundenrechnung" : "Kundenrechnungen"} überfällig`);
    if (e) zeilen.push(`${e} ${e === 1 ? "Eingangsrechnung" : "Eingangsrechnungen"} fällig`);
    if (a) zeilen.push(`${a} ${a === 1 ? "Baustelle" : "Baustellen"} abrechnen`);
    zahl += k + e + a;
  }
  if (p.baustelle !== false) {
    let l = 0, m = 0, s = 0;
    for (const w of d.wohnungen) {
      l += (w.bestellungen || []).filter((b: any) => b.status !== "geliefert" && b.liefertermin && b.liefertermin <= vor).length;
      m += (w.abnahme?.maengel || []).filter((x: any) => !x.erledigt && x.frist && x.frist <= vor).length;
      if (norm(w.status) === "geplant" && w.baustart && w.baustart <= plusTage(heute, 7)) s++;
    }
    if (l) zeilen.push(`${l} ${l === 1 ? "Lieferung" : "Lieferungen"}`);
    if (m) zeilen.push(`${m} ${m === 1 ? "Mangel" : "Mängel"} mit Frist`);
    if (s) zeilen.push(`${s} ${s === 1 ? "Baustart" : "Baustarts"} diese Woche`);
    zahl += l + m + s;
  }
  return { zahl, text: zeilen.join(" · ") };
}

async function daten(): Promise<Daten> {
  const [termine, idx, rechnungen, belege] = await Promise.all([alle<Termin>("termin"), einzeln<any[]>("projectIndex"), alle<any>("rechnung"), alle<any>("beleg")]);
  const offen = (idx || []).filter((x) => ["geplant", "", "fertig"].includes(norm(x.status)));
  const wohnungen = (await Promise.all(offen.map((x) => einzeln<any>("wohnung:" + x.id)))).filter(Boolean);
  return { termine, idx: idx || [], rechnungen, belege, wohnungen };
}

// ---------- Senden ----------
async function senden(g: Geraet, nachricht: { titel: string; text: string; zahl?: number; ziel?: string; tag?: string }) {
  try {
    await webpush.sendNotification(g.sub, JSON.stringify(nachricht), { TTL: 6 * 3600, urgency: "high" });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await sto(`object/${BUCKET}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [`${SYS}/push-geraete/${g.id}.json`] }) }); // Gerät abgemeldet
    else console.error("push", code, e);
    return false;
  }
}
async function geraete(): Promise<Geraet[]> {
  const r = await sto(`object/list/${BUCKET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: `${SYS}/push-geraete`, limit: 1000 }) });
  if (!r.ok) return [];
  const items = (await r.json()).filter((x: { id?: string; name: string }) => x.id && x.name.endsWith(".json"));
  return (await Promise.all(items.map((x: { name: string }) => lesen<Geraet | null>(`${SYS}/push-geraete/${x.name}`, null)))).filter(Boolean) as Geraet[];
}

async function lauf() {
  await vapid();
  const liste = await geraete();
  if (!liste.length) return 0;
  const jetzt = new Date(), { datum: heute, min } = teile(jetzt);
  const st = await lesen<Record<string, number>>(`${SYS}/push-status.json`, {});
  let n = 0, d: Daten | null = null;
  for (const g of liste) {
    const p = g.prefs || {};
    // Morgenübersicht: einmal am Tag ab der eingestellten Uhrzeit (bis 3 Stunden danach, falls ein Lauf ausfällt)
    const m = minuten(p.morgen);
    const sm = `${g.id}|morgen|${heute}`;
    if (m >= 0 && min >= m && min < m + 180 && !st[sm]) {
      d ??= await daten();
      const r = morgen(d, p, heute);
      st[sm] = Date.now();
      if (await senden(g, { titel: "Heute", text: r.text || "Heute steht nichts an.", zahl: p.badge === false ? undefined : r.zahl, ziel: "heute", tag: "morgen" })) n++;
    }
    // Erinnerung vor jedem Termin
    const vorher = Number(p.termin) || 0;
    if (vorher > 0) {
      d ??= await daten();
      for (const t of d.termine) {
        if (t.ganztag || !t.von || t.datum !== heute || !fuer(t, p.wer)) continue;
        const beginn = minuten(t.von), sk = `${g.id}|t|${t.id}|${t.datum}|${t.von}`;
        if (beginn < 0 || st[sk] || min < beginn - vorher || min > beginn) continue;
        st[sk] = Date.now();
        const inMin = beginn - min;
        if (await senden(g, { titel: t.titel || "Termin", text: `${inMin <= 1 ? "Jetzt" : `In ${inMin} Minuten`}, ${t.von} Uhr${t.ort ? " · " + t.ort : ""}`, ziel: "kalender", tag: "t-" + t.id })) n++;
      }
    }
  }
  for (const [k, v] of Object.entries(st)) if (Date.now() - v > 14 * 864e5) delete st[k];
  await schreiben(`${SYS}/push-status.json`, st);
  return n;
}

// ---------- Aufruf ----------
async function angemeldet(req: Request) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return false;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON || SRK, Authorization: `Bearer ${tok}` } });
  return r.ok;
}
const geraetId = async (endpoint: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)))].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.aktion === "lauf") {
      if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return antwort({ fehler: "nicht erlaubt" }, 401);
      return antwort({ ok: true, gesendet: await lauf() });
    }
    if (!(await angemeldet(req))) return antwort({ fehler: "Bitte in der App beim Cloud-Abgleich anmelden." }, 401);
    if (body.aktion === "schluessel") return antwort({ ok: true, publicKey: await vapid() });
    const sub = body.sub;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return antwort({ fehler: "Gerät fehlt" }, 400);
    const id = await geraetId(sub.endpoint), pfad = `${SYS}/push-geraete/${id}.json`;
    if (body.aktion === "anmelden") {
      const alt = await lesen<Geraet | null>(pfad, null);
      const g: Geraet = { id, sub, prefs: body.prefs || {}, name: String(body.name || "").slice(0, 80), created: alt?.created || Date.now(), updated: Date.now() };
      await schreiben(pfad, g);
      return antwort({ ok: true, id });
    }
    if (body.aktion === "abmelden") {
      await sto(`object/${BUCKET}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [pfad] }) });
      return antwort({ ok: true });
    }
    if (body.aktion === "test") {
      await vapid();
      const g = await lesen<Geraet | null>(pfad, null);
      if (!g) return antwort({ fehler: "Dieses Gerät ist noch nicht angemeldet." }, 400);
      let text = "Mitteilungen funktionieren.";
      if (body.vorschau) { const { datum } = teile(new Date()); const r = morgen(await daten(), g.prefs || {}, datum); text = r.text || "Heute steht nichts an."; }
      const ok = await senden(g, { titel: body.vorschau ? "Heute" : "DOM", text, ziel: "heute", tag: "test" });
      return ok ? antwort({ ok: true }) : antwort({ fehler: "Die Mitteilung kam nicht an. Bitte Mitteilungen neu erlauben." }, 500);
    }
    return antwort({ fehler: "Unbekannte Aktion" }, 400);
  } catch (e) {
    console.error(e);
    return antwort({ fehler: String((e as Error)?.message || e) }, 500);
  }
});
