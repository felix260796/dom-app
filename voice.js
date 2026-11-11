'use strict';
/* Gespräch vor Ort: Sprachaufnahme in der App (oder Audio-/Text-Import, z. B. von Plaud)
 * -> Transkript über Gemini -> Kundenwünsche, die in die Visualisierung einfließen.
 * Wird vor app.js geladen; nutzt dessen Hilfsfunktionen ($, esc, toast, state, saveProject) erst zur Laufzeit. */

const VOICE_SEGMENT_SEC = 300;            // Audio wird in 5-Minuten-Stücke geteilt (API-Limit 20 MB pro Anfrage)
const VOICE_RATE = 16000;                 // 16 kHz Mono reicht für Sprache

const voice = { rec: null, recId: null, recLabel: '', stream: null, timer: null, started: 0, paused: 0, pauseMs: 0, dabei: [], job: null, jobId: null, step: '', error: null, wake: null, finish: null };

// ---------- Gemini (Text/Audio) ----------
// Text-/Audio-Modell: textModel() in core.js (wechselt automatisch, wenn Google ein Modell abschaltet)
async function geminiText(parts, json = false, config = {}) {
  const j = await geminiCall('text', () => ({ contents: [{ role: 'user', parts }], generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), ...config } }));
  const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  if (!txt) throw new Error(j.promptFeedback?.blockReason || 'Die KI hat keinen Text geliefert.');
  return txt;
}

// ---------- Audio -> 16 kHz Mono WAV-Stücke ----------
/** Entschlüsselt die Aufnahme. iPhone-Safari kann nicht jede Abtastrate, daher mehrere Versuche. */
async function decodeAudio(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const Live = window.AudioContext || window.webkitAudioContext;
  const tries = [];
  if (Ctx) for (const rate of [VOICE_RATE, 44100, 48000]) tries.push(() => new Ctx(1, 1, rate));
  if (Live) tries.push(() => new Live());
  let last;
  for (const make of tries) {
    let ctx;
    try {
      ctx = make();
      const audio = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(buf.slice(0), res, (e) => rej(e || new Error('decode')));
        if (p?.then) p.then(res, rej);
      });
      if (audio?.length) return audio;
    } catch (e) { last = e; }
    finally { ctx?.close?.().catch?.(() => {}); }
  }
  throw last || new Error('decode');
}
/** Auf Mono mischen und auf 16 kHz herunterrechnen (Sprache braucht nicht mehr). */
function toMono16k(audio) {
  const n = audio.length, mono = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / audio.numberOfChannels; }
  const f = audio.sampleRate / VOICE_RATE;
  if (f <= 1.01) return { samples: mono, rate: audio.sampleRate };
  const m = Math.floor(n / f), out = new Float32Array(m);
  for (let i = 0; i < m; i++) { const a = Math.floor(i * f), b = Math.min(n, Math.floor((i + 1) * f)); let s = 0; for (let k = a; k < b; k++) s += mono[k]; out[i] = s / Math.max(1, b - a); }
  return { samples: out, rate: VOICE_RATE };
}
async function audioToWavSegments(blob) {
  const { samples, rate } = toMono16k(await decodeAudio(blob));
  const seg = VOICE_SEGMENT_SEC * rate, out = [];
  for (let s = 0; s < samples.length; s += seg) out.push(encodeWav(samples.subarray(s, Math.min(samples.length, s + seg)), rate));
  return { segments: out, seconds: samples.length / rate };
}
function encodeWav(samples, rate) {
  const v = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return v.buffer;
}
function bufToB64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- Auswertung ----------
// Sprecher erkennen (Wunsch Felix): Vor der Aufnahme wird angetippt, wer dabei ist (voice.dabei).
const TRANSCRIBE_PROMPT = (k, n, dabei = []) => `Transkribiere dieses Gespräch auf Deutsch wortgetreu, aber ohne Füllwörter. Es ist ein Vor-Ort-Termin einer Sanierungsfirma mit Kunden${n > 1 ? ` (Teil ${k + 1} von ${n})` : ''}.
${dabei.length ? `Dabei waren: ${dabei.join(', ')}.` : 'Wer dabei war, ist nicht bekannt.'}
Beginne bei jedem Sprecherwechsel eine neue Zeile und schreibe den Sprecher davor, z. B. „Felix: …“ oder „Kunde: …“. Nutze die Namen von oben. Erkenne die Sprecher an Stimme und Inhalt: Die Firma fragt nach, erklärt, nennt Maße, Abläufe und Preise; der Kunde erzählt seine Wünsche und fragt nach Kosten und Terminen. Bist du unsicher, wer von der Firma spricht, schreibe „Firma:“; bei Kundenseite „Kunde:“.
Gib nur das Transkript aus. Ist nichts Verständliches zu hören, antworte nur mit: (keine Sprache erkannt)`;
/** Dateityp so angeben, wie Gemini ihn kennt (iPhone nimmt als audio/mp4 bzw. m4a auf). */
function geminiAudioMime(blob) {
  const t = (blob.type || '').split(';')[0].toLowerCase(), n = (blob.name || '').toLowerCase();
  if (/mp4|m4a|aac/.test(t) || /\.(m4a|mp4|aac)$/.test(n)) return 'audio/aac';
  if (/mpeg|mp3/.test(t) || n.endsWith('.mp3')) return 'audio/mp3';
  if (/wav/.test(t) || n.endsWith('.wav')) return 'audio/wav';
  if (/ogg|opus/.test(t)) return 'audio/ogg';
  if (/webm/.test(t)) return 'audio/webm';
  if (/flac/.test(t)) return 'audio/flac';
  return t || 'audio/aac';
}
/** Große Aufnahmen (langes Gespräch) über die Datei-Schnittstelle von Gemini hochladen. Gibt die Datei-Adresse zurück. */
async function geminiUpload(blob, mime, onStep) {
  const { apiKey } = state.settings;
  const base = 'https://generativelanguage.googleapis.com';
  onStep('Aufnahme wird hochgeladen …');
  const start = await fetch(`${base}/upload/v1beta/files`, { method: 'POST', headers: { 'x-goog-api-key': apiKey, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(blob.size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { display_name: 'gespraech-' + Date.now() } }) });
  const upUrl = start.headers.get('x-goog-upload-url');
  if (!start.ok || !upUrl) { const j = await start.json().catch(() => ({})); throw new Error(j.error?.message || `Hochladen nicht möglich (${start.status})`); }
  const up = await fetch(upUrl, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: blob });
  let file = (await up.json().catch(() => ({}))).file;
  if (!up.ok || !file?.name) throw new Error('Hochladen der Aufnahme fehlgeschlagen.');
  for (let k = 0; file.state === 'PROCESSING' && k < 60; k++) {
    onStep('Aufnahme wird vorbereitet …');
    await new Promise((r) => setTimeout(r, 3000));
    file = await (await fetch(`${base}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': apiKey } })).json();
  }
  if (file.state === 'FAILED') throw new Error('Google konnte die Aufnahme nicht lesen.');
  return file.uri;
}
const MB = 1024 * 1024;
async function transcribeAudio(blob, onStep, dabei = []) {
  if (!blob?.size) throw new Error('Die Aufnahme ist leer. Bitte Mikrofon-Zugriff prüfen und nochmal aufnehmen.');
  onStep('Audio wird vorbereitet …');
  let segments = null;
  // Kurze Aufnahmen: in Sprach-WAV umwandeln (zuverlässigste Variante). Lange: Original hochladen (spart Speicher auf dem iPhone).
  if (blob.size <= 12 * MB) try { ({ segments } = await audioToWavSegments(blob)); } catch (e) { console.warn('Audio nicht umwandelbar, schicke Original', e); }
  const parts = [];
  if (segments) {
    for (let k = 0; k < segments.length; k++) {
      onStep(`Transkribiere${segments.length > 1 ? ` Teil ${k + 1} von ${segments.length}` : ''} …`);
      parts.push((await geminiText([{ text: TRANSCRIBE_PROMPT(k, segments.length, dabei) }, { inline_data: { mime_type: 'audio/wav', data: bufToB64(segments[k]) } }])).trim());
    }
  } else if (blob.size <= 12 * MB) {
    onStep('Transkribiere …');
    parts.push((await geminiText([{ text: TRANSCRIBE_PROMPT(0, 1, dabei) }, { inline_data: { mime_type: geminiAudioMime(blob), data: bufToB64(await blob.arrayBuffer()) } }])).trim());
  } else {
    const mime = geminiAudioMime(blob);
    const uri = await geminiUpload(blob, mime, onStep);
    onStep('Transkribiere das Gespräch (bei langen Aufnahmen 1–3 Minuten) …');
    parts.push((await geminiText([{ text: TRANSCRIBE_PROMPT(0, 1, dabei) }, { file_data: { mime_type: mime, file_uri: uri } }])).trim());
  }
  const t = parts.join('\n').trim();
  if (!t || /^\(keine Sprache erkannt\)$/i.test(t)) throw new Error('In der Aufnahme war keine Sprache zu hören. War das Mikrofon frei?');
  return t;
}

// ---------- Letzte Aufnahme sichern (eigene Datenbank: nur auf diesem Gerät, nicht in Sicherung/Cloud) ----------
let _audioDb;
function audioDb() {
  return (_audioDb ??= new Promise((res, rej) => {
    const r = indexedDB.open('dom-audio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('a');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
async function audioStore(id, blob) {
  try {
    const d = await audioDb();
    await new Promise((res, rej) => { const tx = d.transaction('a', 'readwrite'); const st = tx.objectStore('a'); blob ? st.put({ blob, t: Date.now() }, id) : st.delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn('Aufnahme nicht gesichert', e); }
}
async function audioLoad(id) {
  try {
    const d = await audioDb();
    return await new Promise((res) => { const q = d.transaction('a').objectStore('a').get(id); q.onsuccess = () => res(q.result?.blob || null); q.onerror = () => res(null); });
  } catch { return null; }
}

/** Leitet aus dem Transkript die Wünsche ab: fürs Bild (fließt in die Visualisierung) und Sonstiges (fürs spätere Angebot). */
async function extractWishes(p) {
  const txt = await geminiText([{ text: `Du unterstützt eine Sanierungsfirma. Unten steht das Transkript bzw. die Notizen eines Vor-Ort-Gesprächs mit dem Kunden zum Raum "${p.room}".

Ziehe die konkreten Wünsche und Entscheidungen des Kunden heraus, kurz und als Stichpunkte auf Deutsch:
- "bild": alles, was man auf einem Foto des sanierten Raums sehen würde (Aufteilung, Dusche/Wanne, Möbel, Farben, Materialien, Fliesen, Licht, was raus soll, was bleiben soll, was NEU dazukommen soll, z. B. „WC kommt neu dazu“). Schreibe ausdrücklich, wenn etwas neu eingebaut oder entfernt werden soll. Formuliere so, dass eine Bild-KI es umsetzen kann.
- "sonstiges": alles andere, was für Angebot und Planung wichtig ist (Budget, Termine, Maße, Technik, Elektro, Heizung, Barrierefreiheit, offene Fragen).
Nimm nur auf, was im Gespräch wirklich gesagt wurde. Spätere Aussagen haben Vorrang vor früheren.

Antworte nur mit JSON: {"bild": ["..."], "sonstiges": ["..."]}

TRANSKRIPT:
${p.transcript}` }], true);
  let j; try { j = JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim()); } catch { throw new Error('Antwort der KI war nicht lesbar. Bitte nochmal versuchen.'); }
  const list = (a) => (Array.isArray(a) ? a : []).map((s) => '- ' + String(s).trim()).join('\n');
  return { wishes: list(j.bild), otherNotes: list(j.sonstiges) };
}

// ---------- Wem gehört das Gespräch? ----------
// Räume in einem Projekt: ein Gespräch fürs ganze Projekt (die KI verteilt die Wünsche auf die Räume).
// Räume ohne Projekt (sehr alte Daten): Gespräch nur für diesen Raum.
const ownerOf = (p) => (p.wohnungId ? { id: p.wohnungId, projekt: true } : { id: p.id, projekt: false });
async function wohnungVon(id) {
  if (state.wohnung?.id === id) return state.wohnung;
  return (await kvGet('wohnung:' + id)) || null;
}
const pendingFor = (id) => (voice.job && voice.jobId === id ? voice.job : null);
function voicePending(p) { return pendingFor(ownerOf(p).id); }
/** Ansicht neu zeichnen, wenn sie gerade zu diesem Gespräch gehört. */
function voiceRefresh(id) {
  if (state.project && ownerOf(state.project).id === id) viewProjekt();
  else if (!state.project && state.wohnung?.id === id) window.Projekt?.view();
}

// ---------- Aufnahme (eine zur Zeit; läuft weiter, während man Räume anlegt und fotografiert) ----------
const REC_MAX_MIN = 90;
const Rec = {
  active: () => !!voice.rec,
  async start(id, label, onBlob) {
    if (voice.rec) return false;
    if (window.Geraet?.nativ?.()) return Rec.startNativ(id, label, onBlob);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Aufnahme wird auf diesem Gerät nicht unterstützt. Bitte Audio importieren.', 5000); return false; }
    // Für die Pegelanzeige: AudioContext gleich beim Antippen anlegen (iPhone erlaubt das nur direkt nach dem Tippen)
    try { const AC = window.AudioContext || window.webkitAudioContext; voice.meterCtx = AC ? new AC() : null; } catch { voice.meterCtx = null; }
    try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { voice.meterCtx?.close?.(); voice.meterCtx = null; toast('Kein Zugriff aufs Mikrofon. Bitte in den iPhone-Einstellungen (Safari > Mikrofon) erlauben.', 6000); return false; }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
    let rec;
    try { rec = new MediaRecorder(voice.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 }); }
    catch { rec = new MediaRecorder(voice.stream, mime ? { mimeType: mime } : undefined); }
    const chunks = [];
    voice.error = null;
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onerror = (e) => console.warn('Aufnahme-Fehler', e.error || e);
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearInterval(voice.timer); meterStop(); voice.stream?.getTracks().forEach((t) => t.stop());
      voice.wake?.release?.().catch(() => {}); voice.wake = null;
      const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'audio/mp4').split(';')[0] });
      voice.rec = null; voice.recId = null; voice.finish = null; voice.paused = 0;
      recBar();
      if (!blob.size) { voice.error = { id, msg: 'Die Aufnahme ist leer angekommen. Bitte App beim Aufnehmen geöffnet lassen und nochmal versuchen.' }; voiceRefresh(id); return; }
      onBlob(blob);
      voiceRefresh(id);
    };
    // iPhone liefert die Daten erst nach "stop", deshalb kurz warten, falls das letzte Stück noch kommt
    rec.onstop = () => setTimeout(finish, 300);
    voice.finish = finish;
    // Bildschirm anlassen, sonst stoppt das iPhone die Aufnahme beim Sperren
    try { voice.wake = await navigator.wakeLock?.request('screen'); } catch { voice.wake = null; }
    voice.stream.getAudioTracks().forEach((t) => (t.onended = () => rec.state !== 'inactive' && rec.stop()));
    // Kein Zeitraster: das iPhone erzeugt sonst Stücke, die sich später nicht mehr zusammensetzen lassen
    rec.start();
    voice.rec = rec; voice.recId = id; voice.recLabel = label; voice.started = Date.now(); voice.paused = 0; voice.pauseMs = 0;
    voice.timer = setInterval(() => {
      const s = Rec.sekunden();
      const el = $('#recbar-t'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= REC_MAX_MIN * 60) { toast(`Nach ${REC_MAX_MIN} Minuten automatisch gestoppt. Für mehr einfach neu starten.`, 5000); Rec.stop(); }
    }, 1000);
    recBar();
    meterStart();
    return true;
  },
  stop() { if (!voice.rec) return; voice.rec.nativ ? voice.rec.stop() : voice.rec.state !== 'inactive' ? voice.rec.stop() : voice.finish?.(); },
  // Pause und Weiter (Wunsch Felix): bleibt eine Aufnahme. Erst „Beenden“ schließt sie ab, dann wird ausgewertet.
  kannPause: () => !!window.Geraet?.nativ?.() || typeof window.MediaRecorder?.prototype?.pause === 'function',
  /** iPhone-App: Aufnahme im nativen Teil (geraet.js, DomGeraet.swift). Läuft weiter bei Bildschirmsperre, in der
   * Kamera-App und anderen Apps; nach einer Unterbrechung (Video, Anruf) geht sie von selbst weiter. Roter Punkt oben. */
  async startNativ(id, label, onBlob) {
    try { await Geraet.aufnahme.start(); }
    catch (e) { toast(String(e?.message || e || 'Aufnahme ging nicht.'), 6000); return false; }
    let done = false;
    const rec = {
      nativ: true, state: 'recording',
      pause() { this.state = 'paused'; Geraet.aufnahme.pause(); },
      resume() { this.state = 'recording'; Geraet.aufnahme.weiter(); },
      async stop() {
        if (done) return; done = true; this.state = 'inactive';
        clearInterval(voice.timer);
        voice.rec = null; voice.recId = null; voice.finish = null; voice.paused = 0;
        recBar();
        let blob = null;
        try { toast('Aufnahme wird gespeichert …', 3000); blob = await Geraet.aufnahme.stopp(); }
        catch (e) { voice.error = { id, msg: String(e?.message || e || 'Aufnahme nicht gespeichert.') }; voiceRefresh(id); return; }
        onBlob(blob);
        voiceRefresh(id);
      },
    };
    voice.finish = () => rec.stop();
    voice.rec = rec; voice.recId = id; voice.recLabel = label; voice.started = Date.now(); voice.paused = 0; voice.pauseMs = 0;
    voice.timer = setInterval(() => {
      const s = Rec.sekunden();
      const el = $('#recbar-t'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= REC_MAX_MIN * 60) { toast(`Nach ${REC_MAX_MIN} Minuten automatisch gestoppt. Für mehr einfach neu starten.`, 5000); Rec.stop(); }
    }, 1000);
    recBar();
    return true;
  },
  sekunden: () => Math.floor((Date.now() - voice.started - voice.pauseMs - (voice.paused ? Date.now() - voice.paused : 0)) / 1000),
  pause() {
    if (!voice.rec || voice.paused || voice.rec.state !== 'recording') return;
    try { voice.rec.pause(); } catch { return; }
    voice.paused = Date.now(); recBar(); voiceRefresh(voice.recId);
  },
  weiter() {
    if (!voice.rec || !voice.paused) return;
    try { voice.rec.resume(); } catch {}
    voice.pauseMs += Date.now() - voice.paused; voice.paused = 0; recBar(); voiceRefresh(voice.recId);
  },
};
/** Pegelanzeige: Ausschläge zeigen, dass das Mikrofon wirklich etwas hört. */
const METER_BARS = 24;
function meterStart() {
  const ctx = voice.meterCtx;
  if (!ctx || !voice.stream) return;
  try {
    ctx.resume?.();
    const src = ctx.createMediaStreamSource(voice.stream), an = ctx.createAnalyser();
    an.fftSize = 512; src.connect(an);
    const buf = new Float32Array(an.fftSize), hist = new Array(METER_BARS).fill(0);
    let last = 0, quiet = 0;
    const tick = (t) => {
      if (!voice.rec) return;
      voice.meterRaf = requestAnimationFrame(tick);
      if (t - last < 70) return; last = t;
      an.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const lvl = Math.min(1, Math.sqrt(s / buf.length) * 6);
      hist.push(lvl); hist.shift();
      quiet = lvl < 0.02 ? quiet + 1 : 0;
      const el = $('#rb-meter');
      if (el) el.innerHTML = hist.map((v) => `<i style="height:${Math.max(8, Math.round(v * 100))}%"></i>`).join('');
      const hint = $('#rb-hint');
      if (hint) hint.textContent = voice.paused ? 'Pausiert. „Weiter“ nimmt in derselben Aufnahme auf.' : quiet > 70 ? 'Sehr leise, Mikrofon frei?' : (voice.recLabel || '');
    };
    voice.meterRaf = requestAnimationFrame(tick);
  } catch (e) { console.warn('Pegelanzeige nicht möglich', e); }
}
function meterStop() {
  cancelAnimationFrame(voice.meterRaf);
  voice.meterCtx?.close?.().catch?.(() => {});
  voice.meterCtx = null;
}
/** Leiste über der Navigation, solange die Aufnahme läuft (auf jeder Seite sichtbar). */
function recBar() {
  let el = $('#recbar');
  if (!voice.rec) { el?.remove(); document.body.classList.remove('recording'); return; }
  if (!el) { el = document.createElement('div'); el.id = 'recbar'; el.className = 'recbar'; document.body.appendChild(el); }
  document.body.classList.add('recording');
  const s = Rec.sekunden();
  el.classList.toggle('pausiert', !!voice.paused);
  el.innerHTML = `<span class="rb-dot"></span><span class="rb-t"><b>${voice.paused ? 'Pausiert' : 'Aufnahme läuft'} <span id="recbar-t">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span></b><span id="rb-hint">${esc(voice.paused ? 'Weiter nimmt in derselben Aufnahme auf.' : voice.rec.nativ ? 'Läuft auch bei Sperre und in der Kamera weiter' : voice.recLabel || '')}</span></span>${voice.rec.nativ ? '' : `<span class="rb-meter" id="rb-meter" aria-hidden="true">${'<i></i>'.repeat(METER_BARS)}</span>`}${Rec.kannPause() ? `<button id="recbar-pause">${voice.paused ? '● Weiter' : 'Pause'}</button>` : ''}<button id="recbar-stop">■ Beenden</button>`;
  $('#recbar-stop').onclick = () => Rec.stop();
  if ($('#recbar-pause')) $('#recbar-pause').onclick = () => (voice.paused ? Rec.weiter() : Rec.pause());
}

// ---------- Auswerten ----------
/** Führt eine Auswertung aus (eine zur Zeit je Gespräch). Fehler bleiben in der Karte stehen. */
function voiceRun(id, fn, okMsg = 'Gespräch ausgewertet. Die Wünsche fließen in die Visualisierung ein.') {
  if (pendingFor(id)) return voice.job;
  voice.error = null; voice.jobId = id;
  voice.job = (async () => {
    try { await fn(); toast(okMsg, 4500); }
    catch (e) { voice.error = { id, msg: 'Auswertung fehlgeschlagen: ' + (e?.message || 'unbekannter Fehler') }; toast(voice.error.msg, 7000); }
    finally { voice.job = null; voice.step = ''; voiceRefresh(id); }
  })();
  voiceRefresh(id);
  return voice.job;
}
const voiceStatus = (t) => { voice.step = t; const el = $('#vstatus'); if (el) el.textContent = t; };

/** Ergebnis in das Raum-Objekt schreiben, auch wenn der Raum inzwischen neu geladen wurde. */
function voiceApply(p, fields) {
  Object.assign(p, fields);
  if (state.project && state.project !== p && state.project.id === p.id) Object.assign(state.project, fields);
}

const asList = (a) => (Array.isArray(a) ? a : []).map((s) => String(s).trim()).filter(Boolean);
const bullets = (a) => asList(a).map((s) => '- ' + s).join('\n');

/** Projekt-Gespräch auf die Räume verteilen. Ein Raum darf an mehreren Stellen besprochen werden. */
async function zuordnen(w, { fragen = true } = {}) {
  const g = w.gespraech;
  if (!g?.transcript?.trim()) return;
  const list = await window.Projekt.raeume(w);
  voiceStatus('Wünsche werden den Räumen zugeordnet …');
  const raumListe = list.map((r) => ({ id: r.id, name: r.room || roomType(r.roomType).name, typ: roomType(r.roomType).name }));
  const txt = await geminiText([{ text: `Du unterstützt eine Sanierungsfirma. Unten steht das Transkript eines Vor-Ort-Termins beim Kunden${w.customer ? ` (${w.customer}${w.address ? ', ' + w.address : ''})` : ''}. Das Gespräch geht durch mehrere Räume, springt hin und her, und ein Raum kann am Anfang und am Ende nochmal besprochen werden.

In der App angelegte Räume:
${JSON.stringify(raumListe)}

Ordne jede Aussage dem richtigen Raum zu. Fasse alles, was zu einem Raum gesagt wurde, zusammen. Spätere Aussagen haben Vorrang vor früheren (Kunde ändert seine Meinung). Ist der Raum nicht ausdrücklich genannt, nutze den Zusammenhang (z. B. Dusche, WC -> Bad; Kochfeld -> Küche). Gibt es zwei Räume gleichen Typs, nutze die Namen.

Je Raum als kurze Stichpunkte auf Deutsch:
- "bild": alles, was man auf einem Foto des sanierten Raums sehen würde (Aufteilung, Dusche/Wanne, Möbel, Farben, Materialien, Fliesen, Licht, was raus soll, was bleiben soll, was NEU dazukommen soll). Schreibe ausdrücklich, wenn etwas neu eingebaut oder entfernt werden soll.
- "sonstiges": alles andere für Angebot und Planung (Budget, Termine, Maße, Technik, Elektro, Heizung, Barrierefreiheit, offene Fragen).
"allgemein": was für alle Räume oder die ganze Wohnung gilt (z. B. überall derselbe Boden, Budget insgesamt, Starttermin).
"fehlend": Räume, über die gesprochen wurde, die aber noch nicht angelegt sind; "typ" ist einer von ${JSON.stringify(ROOM_TYPES.map((r) => r.id))}.
Nimm nur auf, was wirklich gesagt wurde.

Antworte nur mit JSON:
{"raeume":[{"id":"<id aus der Liste>","bild":["..."],"sonstiges":["..."]}],"allgemein":{"bild":["..."],"sonstiges":["..."]},"fehlend":[{"name":"...","typ":"...","bild":["..."],"sonstiges":["..."]}]}

TRANSKRIPT:
${g.transcript}` }], true, { temperature: 0.2 });
  let j; try { j = JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim()); } catch { throw new Error('Antwort der KI war nicht lesbar. Bitte nochmal versuchen.'); }
  const allgB = asList(j.allgemein?.bild), allgS = asList(j.allgemein?.sonstiges);
  const neu = list.map((r) => {
    const e = (j.raeume || []).find((x) => x.id === r.id) || {};
    return { r, wishes: bullets([...asList(e.bild), ...allgB.map((s) => s + ' (gilt für alle Räume)')]), otherNotes: bullets([...asList(e.sonstiges), ...allgS.map((s) => s + ' (ganzes Projekt)')]) };
  });
  // Selbst geänderte Wünsche nur nach Rückfrage überschreiben
  const edited = neu.filter(({ r, wishes, otherNotes }) => (r.wishes?.trim() && r.wishes !== r.wishesAuto && r.wishes !== wishes) || (r.otherNotes?.trim() && r.otherNotes !== r.otherAuto && r.otherNotes !== otherNotes));
  const ueberschreiben = !edited.length || !fragen || confirm(`In ${edited.map(({ r }) => r.room).join(', ')} hast du die Wünsche selbst geändert. Mit dem Gespräch überschreiben?\n\nOK = überschreiben\nAbbrechen = deine Änderungen behalten`);
  for (const { r, wishes, otherNotes } of neu) {
    if (!ueberschreiben && edited.some((x) => x.r === r)) continue;
    voiceApply(r, { wishes, otherNotes, wishesAuto: wishes, otherAuto: otherNotes, wishesFromTranscript: true });
    await saveProject(r);
  }
  Object.assign(g, { zugeordnet: list.map((r) => r.id), allgemein: { bild: allgB, sonstiges: allgS }, fehlend: (j.fehlend || []).filter((f) => f?.name), stand: g.transcript.length });
  await window.Projekt.save(w);
}

async function auswertenAudio(owner, blob, fromStore) {
  if (!fromStore) await audioStore(owner.id, blob); // Aufnahme sichern, damit sie bei einem Fehler nicht verloren ist
  const dabei = owner.projekt ? (await wohnungVon(owner.id))?.gespraech?.dabei || voice.dabei : voice.dabei;
  const t = await transcribeAudio(blob, voiceStatus, dabei || []);
  // Art des Gesprächs (Vor-Ort-Besichtigung, Abnahmegespräch …) als Überschrift über jeder Aufnahme
  const ueber = `--- ${voice.art || 'Gespräch'} · ${new Date().toLocaleDateString('de-DE')}${dabei?.length ? ` · dabei: ${dabei.join(', ')}` : ''} ---`;
  const join = (a) => [a?.trim(), `${ueber}\n${t}`].filter(Boolean).join('\n\n');
  if (owner.projekt) {
    const w = await wohnungVon(owner.id);
    if (!w) throw new Error('Projekt nicht gefunden.');
    w.gespraech = { ...(w.gespraech || {}), transcript: join(w.gespraech?.transcript), t: Date.now() };
    await window.Projekt.save(w);
    await zuordnen(w);
    if (vorgabe('gespraechZusammenfassung') !== 'nein') await zusammenfassung(w).catch((e) => console.warn('Zusammenfassung fehlgeschlagen', e));
    // Gleich mitdenken: Was fehlt noch fürs Angebot, solange man beim Kunden ist (vorort.js)
    window.VorOrt?.nachAufnahme(w).catch((e) => console.warn('Was fehlt noch?', e));
  } else {
    const p = state.project?.id === owner.id ? state.project : normalizeProject(await kvGet('project:' + owner.id));
    voiceApply(p, { transcript: join(p.transcript) });
    await saveProject(p);
    voiceStatus('Wünsche werden abgeleitet …');
    voiceApply(p, { ...(await extractWishes(p)), wishesFromTranscript: true });
    await saveProject(p);
  }
  await audioStore(owner.id, null);
}
const startAufnahme = (owner, label) => Rec.start(owner.id, label, (blob) => voiceRun(owner.id, () => auswertenAudio(owner, blob)));
function importAudio(owner) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'audio/*,.m4a,.mp3,.wav';
  inp.onchange = () => inp.files[0] && voiceRun(owner.id, () => auswertenAudio(owner, inp.files[0]));
  inp.click();
}

/** Vor dem Visualisieren: laufende Auswertung abwarten, neue Räume zuordnen, Transkript ohne Wünsche noch auswerten. */
async function voiceReady(p) {
  const owner = ownerOf(p);
  const job = pendingFor(owner.id);
  if (job) { toast('Das Gespräch wird noch ausgewertet. Danach geht es automatisch los.', 5000); await job.catch(() => {}); }
  try {
    if (owner.projekt) {
      const w = await wohnungVon(owner.id);
      const g = w?.gespraech;
      if (g?.transcript?.trim() && (!g.zugeordnet?.includes(p.id) || g.stand !== g.transcript.length)) {
        toast('Wünsche aus dem Gespräch werden übernommen …', 4000);
        await voiceRun(owner.id, () => zuordnen(w, { fragen: false }), 'Wünsche aus dem Gespräch übernommen.');
      }
    } else if (p.transcript?.trim() && !p.wishes?.trim() && !p.wishesFromTranscript) {
      toast('Wünsche aus dem Gespräch werden übernommen …', 4000);
      Object.assign(p, await extractWishes(p)); p.wishesFromTranscript = true; await saveProject(p);
    }
  } catch (e) { console.warn('Wünsche nicht übernommen', e); }
}

/** Zusammenfassung und Aufgaben als Text im Projekt (Wunsch Felix: ohne PDF, zum Ausklappen). */
async function zusammenfassung(w) {
  if (!w.gespraech?.transcript?.trim() || !window.GesprPdf) return;
  voiceStatus('Zusammenfassung und Aufgaben werden geschrieben …');
  const z = await window.GesprPdf.zusammenfassen(w, await window.Projekt.raeume(w));
  const alt = w.gespraech.zus;
  // Abgehakte Aufgaben behalten, wenn es sie noch gibt
  const erledigt = (z.aufgaben || []).map((a) => !!alt?.aufgaben?.some((x, i) => x === a && alt.erledigt?.[i]));
  w.gespraech.zus = { ...z, erledigt, stand: w.gespraech.transcript.length, t: Date.now() };
  await window.Projekt.save(w);
}

// ---------- Oberfläche ----------
function recButtons(owner) {
  const rec = voice.rec && voice.recId === owner.id, busy = !!pendingFor(owner.id);
  return `<div class="row">
      ${rec && Rec.kannPause() ? `<button class="btn secondary" id="vpause">${voice.paused ? '● Weiter' : 'Pause'}</button>` : ''}
      <button class="btn ${rec ? 'rec' : ''}" id="vrec" ${busy || (voice.rec && !rec) ? 'disabled' : ''}>${rec ? '■ Beenden' : '● Aufnahme starten'}</button>
      ${rec ? '' : `<button class="btn secondary" id="vfile" ${busy ? 'disabled' : ''}>Audio importieren</button>`}
    </div>
    <p class="hint" id="vstatus">${rec ? (voice.paused ? 'Pausiert. „Weiter“ nimmt in derselben Aufnahme auf. „Beenden“ schließt die Aufnahme ab, dann wertet die KI aus.' : (voice.rec?.nativ ? 'Aufnahme läuft, auch bei gesperrtem Bildschirm und wenn du in die Kamera-App wechselst. ' : 'Aufnahme läuft. Du kannst jetzt Räume anlegen und fotografieren. ') + '„Pause“ hält kurz an, „Beenden“ schließt ab.') : busy ? esc(voice.step || 'Gespräch wird ausgewertet …') : ''}</p>
    <div class="voice-err" id="verr" ${voice.error?.id === owner.id ? '' : 'hidden'}><span>${esc(voice.error?.id === owner.id ? voice.error.msg : '')}</span> <button class="btn secondary small" id="vretry" hidden>Nochmal auswerten</button></div>`;
}
function bindRecButtons(owner, label) {
  $('#vrec').onclick = () => (voice.rec ? Rec.stop() : startAufnahme(owner, label).then((ok) => ok && voiceRefresh(owner.id)));
  if ($('#vpause')) $('#vpause').onclick = () => (voice.paused ? Rec.weiter() : Rec.pause());
  if ($('#vfile')) $('#vfile').onclick = () => importAudio(owner);
  (async () => { const b = $('#vretry'); if (b && voice.error?.id === owner.id) b.hidden = !(await audioLoad(owner.id)); })();
  $('#vretry').onclick = async () => { const b = await audioLoad(owner.id); if (b) voiceRun(owner.id, () => auswertenAudio(owner, b, true)); };
}

/** Karte im Raum: Wünsche dieses Raums; aufgenommen wird fürs ganze Projekt. */
function voiceCard(p) {
  const owner = ownerOf(p);
  return `
    <div class="voice" id="voicecard">
      <div class="voice-h"><b>Gespräch vor Ort</b><span>${owner.projekt
        ? 'Eine Aufnahme fürs ganze Projekt. Einfach laufen lassen, Räume anlegen und fotografieren. Die KI verteilt die Wünsche danach auf die Räume. Kunden vorher um Erlaubnis fragen.'
        : 'Die KI schreibt mit und übernimmt die Wünsche ins Bild. Kunden vorher um Erlaubnis fragen.'}</span></div>
      ${recButtons(owner)}
      <label>Kundenwünsche fürs Bild${owner.projekt ? ' (dieser Raum)' : ''}</label>
      <textarea id="wishes" placeholder="- z. B. Badewanne raus, bodengleiche Dusche&#10;- Waschtisch an die Fensterwand">${esc(p.wishes)}</textarea>
      <label>Sonstiges fürs Angebot (nicht im Bild)</label>
      <textarea id="otherNotes" placeholder="- z. B. Budget ca. 25.000 €, Start im März">${esc(p.otherNotes)}</textarea>
      ${owner.projekt ? '<p class="hint">Das ganze Gespräch findest du in der Projektübersicht.</p>' : `
      <details class="sub">
        <summary>Transkript / Notizen aus Plaud ${p.transcript ? `(${p.transcript.length} Zeichen)` : ''}</summary>
        <textarea id="transcript" style="min-height:120px" placeholder="Hier erscheint das Transkript. Oder Text einfügen, z. B. die Zusammenfassung aus der Plaud-App.">${esc(p.transcript)}</textarea>
        <button class="btn secondary small" id="vextract" style="margin-top:8px" ${p.transcript ? '' : 'disabled'}>Wünsche aus Transkript ableiten</button>
      </details>`}
    </div>`;
}
function bindVoice(p, persist) {
  const owner = ownerOf(p);
  for (const id of ['wishes', 'otherNotes', 'transcript']) if ($('#' + id)) $('#' + id).oninput = (e) => {
    p[id] = e.target.value; persist();
    if (id === 'transcript') { $('#vextract').disabled = !p.transcript.trim(); p.wishesFromTranscript = false; }
  };
  bindRecButtons(owner, owner.projekt ? [p.customer, 'ganzes Projekt'].filter(Boolean).join(' · ') : p.room);
  if ($('#vextract')) $('#vextract').onclick = () => {
    if ((p.wishes?.trim() || p.otherNotes?.trim()) && !confirm('Die Wünsche-Felder werden neu aus dem Transkript erstellt. Eigene Änderungen dort gehen verloren. Fortfahren?')) return;
    voiceRun(owner.id, async () => { voiceStatus('Wünsche werden abgeleitet …'); voiceApply(p, { ...(await extractWishes(p)), wishesFromTranscript: true }); await saveProject(p); });
  };
}

/** Wer kann beim Gespräch dabei sein: Team (Felix, Deniel), der Kunde, Personen aus den Einstellungen und selbst ergänzte. */
function personen(w) {
  const team = window.Kalender?.team().map((p) => p.name) || [];
  const k = window.Kunden?.byId(w.kundeId);
  const kunde = k && Kunden.name(k) ? `${Kunden.name(k)} (Kunde)` : 'Kunde';
  return [...new Set([...team, kunde, ...(w.gespraech?.dabei || []), ...vorgabe('gespraechDabei')])].filter(Boolean);
}
/** Wer dabei ist. Ohne Auswahl: die Person dieses Geräts (sonst das ganze Team) und der Kunde. */
function dabeiVon(w) {
  if (Array.isArray(w.gespraech?.dabei)) return w.gespraech.dabei;
  const team = window.Kalender?.team() || [], ich = team.find((p) => p.id === window.Kalender?.wer());
  const k = window.Kunden?.byId(w.kundeId);
  return [...(ich ? [ich.name] : team.map((p) => p.name)), k && Kunden.name(k) ? `${Kunden.name(k)} (Kunde)` : 'Kunde'];
}
/** Plan scannen (iPhone-Scanner) oder fotografieren und beim Projekt im Bilder-Ordner „Pläne“ ablegen. */
async function planAufnehmen(w) {
  const k = window.Kunden?.byId(w.kundeId);
  if (!k) return toast('Bitte zuerst einen Kunden zuordnen.');
  let data = '';
  try {
    if (window.Geraet?.kann('scanner')) data = await Geraet.scannen();
    else { const f = await pickFiles({ camera: true }); if (!f.length) return; data = await resize(await fileToDataUrl(f[0]), 2200, 'image/jpeg', 0.85); }
  } catch (e) { return toast('Scannen ging nicht: ' + (e.message || e), 5000); }
  if (!data) return;
  if (w.isNew) delete w.isNew;
  const ordner = String(vorgabe('ordnerPlaene') || 'Pläne').trim() || 'Pläne';
  await Bilder.ablegen(k.id, w.objektId, data, ordner, w.id);
  w.vorOrt = { ...(w.vorOrt || {}), plaene: (w.vorOrt?.plaene || 0) + 1 };
  await window.Projekt.save(w);
  toast(`Plan im Ordner „${ordner}“ gespeichert`);
  voiceRefresh(w.id);
}
/** LiDAR-Raumscan vor Ort: Maße beim Projekt merken, im Aufmaß übernehmen. */
async function raumScan(w, list) {
  let m;
  try { m = await Geraet.raumScannen(); } catch (e) { return toast('' + (e.message || e), 6000); }
  if (!m) return;
  const namen = [...new Set(list.map((r) => r.room || roomType(r.roomType).name))];
  const v = await sheet('Welcher Raum war das?', namen.map((n) => ({ label: n, value: n })), { text: 'Name, z. B. Bad, Küche, Flur' });
  const name = (typeof v === 'string' ? v : v?.text?.trim()) || `Raum ${(w.vorOrt?.scans?.length || 0) + 1}`;
  w.vorOrt = { ...(w.vorOrt || {}), scans: [...(w.vorOrt?.scans || []), { id: uid(), name, t: Date.now(), laenge: m.laenge, breite: m.breite, hoehe: m.hoehe, flaeche: m.flaeche, tueren: m.tueren || [], fenster: m.fenster || [] }] };
  if (w.isNew) delete w.isNew;
  await window.Projekt.save(w);
  toast(`Raumscan „${name}“ gespeichert`);
  voiceRefresh(w.id);
}

/** Karte in der Projektübersicht: Sammelstelle vor Ort (Gespräch, Fotos, Pläne, Raumscan), Ergebnis, Zusammenfassung. */
window.Gespraech = {
  karte(w, list) {
    const owner = { id: w.id, projekt: true }, g = w.gespraech || {};
    const count = (s) => (s || '').split('\n').filter((l) => l.trim()).length;
    const offen = list.filter((r) => !g.zugeordnet?.includes(r.id));
    const fehlend = (g.fehlend || []).filter((f) => !list.some((r) => (r.room || '').toLowerCase() === String(f.name).toLowerCase()));
    const dabei = dabeiVon(w), wahl = personen(w);
    const z = g.zus, li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const scans = w.vorOrt?.scans || [];
    const zahl = (x) => (+x || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
    return `
      <div class="sec-h"><h2>Vor Ort aufnehmen</h2></div>
      <div class="card voice-p">
        <p class="hint" style="margin-top:0">Hier sammelst du alles vom Termin: Gespräch, Fotos, Pläne und Raumscan. Das Gespräch einmal starten und laufen lassen, währenddessen fotografieren. Kunden vorher um Erlaubnis fragen.</p>
        <div class="vo-sammel">
          <button type="button" class="vo-b" data-bilder>${icon('camera')}<b>Fotos</b><span>alle Räume</span></button>
          <button type="button" class="vo-b" id="vPlan">${icon('file')}<b>Pläne</b><span>${w.vorOrt?.plaene ? `${w.vorOrt.plaene} gescannt` : 'scannen'}</span></button>
          ${window.Geraet?.kann('lidar') ? `<button type="button" class="vo-b" id="vScan">${icon('ruler')}<b>Raumscan</b><span>${scans.length ? `${scans.length} ${scans.length === 1 ? 'Raum' : 'Räume'}` : 'LiDAR'}</span></button>` : ''}
        </div>
        ${scans.length ? `<div class="vo-scans">${scans.map((x) => `<div class="vo-scan">${icon('ruler')}<span><b>${esc(x.name)}</b> ${zahl(x.laenge)} × ${zahl(x.breite)} m${x.hoehe > 0 ? `, ${zahl(x.hoehe)} m hoch` : ''}${x.flaeche > 0 ? ` · ${zahl(x.flaeche)} m²` : ''}</span><button type="button" class="icon-btn" data-scandel="${x.id}" aria-label="Scan löschen">${icon('x')}</button></div>`).join('')}</div>
          <p class="hint" style="margin-top:4px">Im Angebot beim Aufmaß übernimmst du die Maße mit einem Tipp.</p>` : ''}

        <h3 class="vo-h">${icon('mic')} Gespräch</h3>
        <label style="margin-top:0">Was für ein Gespräch?</label>
        <select id="vArt">${[...new Set([...vorgabe('gespraechArten'), ...(voice.art ? [voice.art] : [])])].map((a) => `<option ${a === (voice.art || (window.Projekt?.zugesagt(w.status) ? '' : vorgabe('gespraechArten')[0])) ? 'selected' : ''}>${esc(a)}</option>`).join('')}<option value="__eigen">Eigene Bezeichnung …</option></select>
        <label>Wer ist dabei?</label>
        <div class="chips vdabei">${wahl.map((n, i) => `<button type="button" class="qchip ${dabei.includes(n) ? 'on' : ''}" data-dabei="${i}">${esc(n)}</button>`).join('')}<button type="button" class="qchip" data-dabeineu>${icon('plus')} Weitere</button></div>
        ${recButtons(owner)}
        ${z ? `
          <details class="sub vo-zus"><summary>Zusammenfassung</summary>
            ${z.kurz ? `<p>${esc(z.kurz)}</p>` : ''}
            ${z.masse?.length ? `<b>Maße</b><ul>${li(z.masse)}</ul>` : ''}
            ${(z.raeume || []).map((r) => `<b>${esc(r.raum || 'Raum')}</b><ul>${li(r.wuensche)}</ul>`).join('')}
            ${z.budget_termin ? `<b>Budget und Termine</b><p>${esc(z.budget_termin)}</p>` : ''}
          </details>
          <details class="sub vo-zus"><summary id="vAufgS">Aufgaben${z.aufgaben?.length ? ` (${z.aufgaben.length - (z.erledigt || []).filter(Boolean).length} offen)` : ''}</summary>
            ${(z.aufgaben || []).map((a, i) => `<label class="chk vo-aufg"><input type="checkbox" data-aufg="${i}" ${z.erledigt?.[i] ? 'checked' : ''}> <span>${esc(String(a).replace(/^[-•]\s*/, ''))}</span></label>`).join('') || '<p class="hint">Keine Aufgaben genannt.</p>'}
            ${z.fragen?.length ? `<b>Offene Fragen</b><ul>${li(z.fragen)}</ul>` : ''}
          </details>` : ''}
        ${g.transcript && (!z || z.stand !== g.transcript.length) ? `<button class="btn secondary small" id="vZus" ${pendingFor(w.id) ? 'disabled' : ''}>${z ? 'Zusammenfassung aktualisieren' : 'Zusammenfassung und Aufgaben erstellen'}</button>` : ''}
        ${g.transcript ? `
          ${fehlend.length ? `<div class="vp-miss"><span>Im Gespräch erwähnt, aber noch nicht angelegt:</span>${fehlend.map((f, i) => `<button class="qchip" data-miss="${i}">${icon('plus')} ${esc(f.name)}</button>`).join('')}</div>` : ''}
          ${offen.length || g.stand !== g.transcript.length ? `<button class="btn secondary small" id="vzu">Wünsche den Räumen neu zuordnen</button>` : ''}
          ${list.length ? `<details class="sub"><summary>Wünsche je Raum</summary>
            <div class="vp-list">${list.map((r) => `<div class="vp-r"><b>${esc(r.room || roomType(r.roomType).name)}</b><span>${g.zugeordnet?.includes(r.id) ? `${count(r.wishes)} Wünsche fürs Bild · ${count(r.otherNotes)} fürs Angebot` : 'noch nicht zugeordnet'}</span></div>`).join('')}</div>
            ${g.allgemein?.bild?.length || g.allgemein?.sonstiges?.length ? `<p class="hint"><b>Für alle Räume:</b> ${esc([...(g.allgemein.bild || []), ...(g.allgemein.sonstiges || [])].join(' · '))}</p>` : ''}</details>` : ''}
          <details class="sub"><summary>Ganzes Gespräch (${g.transcript.length} Zeichen)</summary>
            <textarea id="wTranscript" style="min-height:160px">${esc(g.transcript)}</textarea>
            <button class="btn secondary small" id="vzu2" style="margin-top:8px">Nach Änderung neu zuordnen</button></details>
          <div class="gpdf"><span class="hint">Als PDF:</span>
            <button class="btn secondary small" data-gpdf="zus">${icon('file')} Zusammenfassung</button>
            <button class="btn secondary small" data-gpdf="trans">${icon('file')} Transkript</button>
          </div>` : ''}
        ${(w.gespraechPdfs || []).length ? `<p class="hint" style="margin:6px 0 0">Gespeichert beim Kunden: ${(w.gespraechPdfs || []).map((x) => `<a href="#" data-gpdfopen="${x.art}">${esc(x.name)}</a>`).join(' · ')}</p>` : ''}
      </div>`;
  },
  bind(w, list) {
    if (!$('#vrec')) return;
    const owner = { id: w.id, projekt: true }, g = w.gespraech || {};
    bindRecButtons(owner, [w.customer, w.address].filter(Boolean).join(' · ') || 'Projekt');
    voice.dabei = dabeiVon(w);
    // Wer ist dabei? (fürs Erkennen der Sprecher)
    const wahl = personen(w);
    const dabeiSetzen = async (neu) => { w.gespraech = { ...(w.gespraech || {}), dabei: neu }; voice.dabei = neu; await window.Projekt.save(w); };
    $$('[data-dabei]').forEach((b) => (b.onclick = () => {
      const n = wahl[+b.dataset.dabei], d = dabeiVon(w);
      const neu = d.includes(n) ? d.filter((x) => x !== n) : [...d, n];
      b.classList.toggle('on', neu.includes(n)); dabeiSetzen(neu);
    }));
    if ($('[data-dabeineu]')) $('[data-dabeineu]').onclick = async () => {
      const v = await sheet('Wer ist noch dabei?', vorgabe('gespraechDabei').filter((x) => !wahl.includes(x)).map((x) => ({ label: x, value: x })), { text: 'Name oder Rolle, z. B. Frau Müller, Architekt' });
      const n = typeof v === 'string' ? v : v?.text?.trim();
      if (!n) return;
      await dabeiSetzen([...new Set([...dabeiVon(w), n])]); voiceRefresh(w.id);
    };
    // Sammelstelle: Pläne und Raumscan
    if ($('#vPlan')) $('#vPlan').onclick = () => planAufnehmen(w);
    if ($('#vScan')) $('#vScan').onclick = () => raumScan(w, list);
    $$('[data-scandel]').forEach((b) => (b.onclick = async () => {
      const x = (w.vorOrt?.scans || []).find((s) => s.id === b.dataset.scandel);
      if (!x || !confirm(`Raumscan „${x.name}“ löschen?`)) return;
      w.vorOrt.scans = w.vorOrt.scans.filter((s) => s !== x); await window.Projekt.save(w); voiceRefresh(w.id);
    }));
    $$('[data-aufg]').forEach((c) => (c.onchange = async () => {
      const z = w.gespraech?.zus; if (!z) return;
      z.erledigt = z.erledigt || []; z.erledigt[+c.dataset.aufg] = c.checked; await window.Projekt.save(w);
      const s = $('#vAufgS'); if (s) s.textContent = `Aufgaben (${z.aufgaben.length - z.erledigt.filter(Boolean).length} offen)`;
    }));
    if ($('#vZus')) $('#vZus').onclick = () => voiceRun(w.id, () => zusammenfassung(w), 'Zusammenfassung und Aufgaben stehen im Projekt.');
    const art = $('#vArt');
    if (art) {
      voice.art = art.value === '__eigen' ? voice.art : art.value;
      art.onchange = () => {
        if (art.value === '__eigen') { const n = prompt('Wie heißt das Gespräch?', ''); if (n?.trim()) { voice.art = n.trim(); voiceRefresh(w.id); } else art.value = voice.art || art.options[0].value; return; }
        voice.art = art.value;
      };
    }
    // Aufnahmen aus der älteren Version (je Raum gespeichert, Auswertung war fehlgeschlagen) fürs Projekt auswerten
    (async () => {
      if (pendingFor(w.id) || voice.rec) return;
      for (const r of list) {
        const blob = await audioLoad(r.id);
        if (!blob || !$('#verr')) continue;
        $('#verr').hidden = false;
        $('#verr span').textContent = `Es gibt noch eine gespeicherte Aufnahme aus „${r.room}“, die nicht ausgewertet wurde.`;
        const b = $('#vretry'); b.hidden = false; b.textContent = 'Jetzt auswerten';
        b.onclick = () => voiceRun(w.id, async () => { await audioStore(w.id, blob); await auswertenAudio(owner, blob, true); await audioStore(r.id, null); });
        return;
      }
    })();
    $$('[data-gpdf]').forEach((b) => (b.onclick = async () => {
      const t = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> PDF wird erstellt …';
      try { await window.GesprPdf?.erstellen(w, list, b.dataset.gpdf); } catch (e) { console.error(e); toast('PDF-Fehler: ' + e.message, 6000); }
      b.disabled = false; b.innerHTML = t;
    }));
    $$('[data-gpdfopen]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); window.GesprPdf?.oeffnen(w, a.dataset.gpdfopen); }));
    const zu = () => voiceRun(w.id, () => zuordnen(w), 'Wünsche den Räumen zugeordnet.');
    if ($('#vzu')) $('#vzu').onclick = zu;
    if ($('#vzu2')) $('#vzu2').onclick = zu;
    if ($('#wTranscript')) $('#wTranscript').oninput = debounce((e) => { g.transcript = e.target.value; window.Projekt.save(w); }, 500);
    const fehlend = (g.fehlend || []).filter((f) => !list.some((r) => (r.room || '').toLowerCase() === String(f.name).toLowerCase()));
    $$('[data-miss]').forEach((b) => (b.onclick = () => {
      const f = fehlend[+b.dataset.miss];
      const rt = ROOM_TYPES.some((r) => r.id === f.typ) ? f.typ : roomTypeIdFromName(f.name);
      const wishes = bullets(f.bild), otherNotes = bullets(f.sonstiges);
      window.Projekt._intern.addRoom(w, rt, { room: f.name, wishes, otherNotes, wishesAuto: wishes, otherAuto: otherNotes, wishesFromTranscript: true, nachZuordnen: true });
    }));
  },
};
