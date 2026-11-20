// DOM – Gespräch in der Cloud auswerten (Supabase Edge Function „auswertung“), Stand 20.11.2026 (App-Version 140)
// Die App legt jedes Stück einer Gesprächsaufnahme im Firmenspeicher ab (Bucket „dom“, Ordner „team/audio/“) und ruft diese
// Funktion mit { key, mime, prompt } auf. Die Funktion holt das Audio aus dem Speicher, gibt es über die Datei-Schnittstelle
// an Gemini und liefert das Transkript (mit Zeitmarken [mm:ss]) zurück. Zuordnung und Zusammenfassung macht danach die App
// (nur Text, schnell). Klappt es hier nicht (Schlüssel fehlt, Zeitgrenze von 150 Sekunden im Free-Plan), wertet die App selbst aus.
//
// Geheimnis (Edge Functions → Secrets): GEMINI_API_KEY = derselbe Gemini-Schlüssel wie in DOM (Einstellungen › KI).
// Optional GEMINI_MODELL (Standard gemini-2.5-flash).
// SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
// Beim Anlegen „Verify JWT“ ausschalten: die Funktion prüft die Anmeldung selbst (wie „termin-mail“ und „push“).

const env = (k: string) => Deno.env.get(k) ?? "";
const URL_ = env("SUPABASE_URL"), SRK = env("SUPABASE_SERVICE_ROLE_KEY"), ANON = env("SUPABASE_ANON_KEY");
const BUCKET = "dom", SPACE = "team";
const G = "https://generativelanguage.googleapis.com";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function angemeldet(req: Request) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return false;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON || SRK, Authorization: `Bearer ${tok}` } });
  return r.ok;
}

async function transkribieren(blob: Blob, mime: string, prompt: string) {
  const KEY = env("GEMINI_API_KEY"), MODELL = env("GEMINI_MODELL") || "gemini-2.5-flash";
  const start = await fetch(`${G}/upload/v1beta/files`, {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(blob.size), "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json" },
    body: JSON.stringify({ file: { display_name: "dom-" + Date.now() } }),
  });
  const upUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !upUrl) throw new Error(`Gemini: Hochladen nicht gestartet (${start.status})`);
  const up = await fetch(upUrl, { method: "POST", headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: blob });
  let file = (await up.json().catch(() => ({}))).file;
  if (!up.ok || !file?.name) throw new Error("Gemini: Hochladen fehlgeschlagen");
  try {
    for (let k = 0; file.state === "PROCESSING" && k < 30; k++) {
      await warte(2000);
      file = await (await fetch(`${G}/v1beta/${file.name}`, { headers: { "x-goog-api-key": KEY } })).json();
    }
    if (file.state === "FAILED") throw new Error("Gemini konnte die Aufnahme nicht lesen");
    const r = await fetch(`${G}/v1beta/models/${MODELL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { file_data: { mime_type: mime, file_uri: file.uri } }] }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gemini: ${j?.error?.message || r.status}`);
    const text = (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text).filter(Boolean).join("");
    if (!text) throw new Error("Gemini hat keinen Text geliefert");
    return text;
  } finally {
    fetch(`${G}/v1beta/${file.name}`, { method: "DELETE", headers: { "x-goog-api-key": KEY } }).catch(() => {});
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!(await angemeldet(req))) return antwort({ fehler: "Bitte in der App beim Cloud-Abgleich anmelden." }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.aktion === "test") return antwort({ ok: true, schluessel: !!env("GEMINI_API_KEY") });
    if (!env("GEMINI_API_KEY")) return antwort({ fehler: "In Supabase fehlt das Secret GEMINI_API_KEY." }, 503);
    const key = String(body.key || "");
    if (!key.startsWith(SPACE + "/audio/") || key.includes("..")) return antwort({ fehler: "Ungültige Datei" }, 400);
    const prompt = String(body.prompt || "").slice(0, 6000);
    if (!prompt) return antwort({ fehler: "Prompt fehlt" }, 400);
    const a = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
    if (!a.ok) return antwort({ fehler: `Audio nicht gefunden (${a.status})` }, 404);
    const blob = await a.blob();
    const text = await transkribieren(blob, String(body.mime || "audio/aac"), prompt);
    return antwort({ ok: true, text });
  } catch (e) {
    console.error(e);
    return antwort({ fehler: String((e as Error)?.message || e) }, 500);
  }
});
