'use strict';
/* Gespräch vor Ort: Sprachaufnahme in der App (oder Audio-/Text-Import, z. B. von Plaud)
 * -> Transkript über Gemini -> Kundenwünsche, die in die Visualisierung einfließen.
 * Wird vor app.js geladen; nutzt dessen Hilfsfunktionen ($, esc, toast, state, saveProject) erst zur Laufzeit. */

const VOICE_MODEL = 'gemini-2.5-flash';   // Text-/Audio-Modell (günstig, versteht Deutsch gut)
const VOICE_MAX_MIN = 15;                 // Aufnahme stoppt automatisch nach 15 Minuten
const VOICE_SEGMENT_SEC = 300;            // Audio wird in 5-Minuten-Stücke geteilt (API-Limit 20 MB pro Anfrage)
const VOICE_RATE = 16000;                 // 16 kHz Mono reicht für Sprache

const voice = { rec: null, recId: null, stream: null, chunks: [], timer: null, started: 0, job: null, jobId: null, step: '', error: null, wake: null };

// ---------- Gemini (Text/Audio) ----------
async function geminiText(parts, json = false, config = {}, model = VOICE_MODEL) {
  const { apiKey } = state.settings;
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const body = { contents: [{ role: 'user', parts }], generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), ...config } };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Fehler ${r.status}`);
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
const TRANSCRIBE_PROMPT = (k, n) => `Transkribiere dieses Gespräch auf Deutsch wortgetreu, aber ohne Füllwörter. Es ist ein Vor-Ort-Termin einer Sanierungsfirma mit Kunden${n > 1 ? ` (Teil ${k + 1} von ${n})` : ''}. Kennzeichne Sprecherwechsel mit neuen Zeilen. Gib nur das Transkript aus. Ist nichts Verständliches zu hören, antworte nur mit: (keine Sprache erkannt)`;
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
async function transcribeAudio(blob, onStep) {
  if (!blob?.size) throw new Error('Die Aufnahme ist leer. Bitte Mikrofon-Zugriff prüfen und nochmal aufnehmen.');
  onStep('Audio wird vorbereitet …');
  let segments = null;
  try { ({ segments } = await audioToWavSegments(blob)); } catch (e) { console.warn('Audio nicht umwandelbar, schicke Original', e); }
  const parts = [];
  if (!segments) {
    // Umwandeln ging nicht (kommt auf dem iPhone vor): Originaldatei direkt schicken
    if (blob.size > 18 * 1024 * 1024) throw new Error('Die Aufnahme ist zu groß. Bitte kürzere Aufnahmen machen (bis ca. 15 Minuten).');
    onStep('Transkribiere …');
    parts.push((await geminiText([{ text: TRANSCRIBE_PROMPT(0, 1) }, { inline_data: { mime_type: geminiAudioMime(blob), data: bufToB64(await blob.arrayBuffer()) } }])).trim());
  } else {
    for (let k = 0; k < segments.length; k++) {
      onStep(`Transkribiere${segments.length > 1 ? ` Teil ${k + 1} von ${segments.length}` : ''} …`);
      parts.push((await geminiText([{ text: TRANSCRIBE_PROMPT(k, segments.length) }, { inline_data: { mime_type: 'audio/wav', data: bufToB64(segments[k]) } }])).trim());
    }
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

/** Läuft gerade eine Auswertung für diesen Raum? Visualisieren wartet darauf. */
function voicePending(p) { return voice.job && voice.jobId === p.id ? voice.job : null; }
/** Vor dem Visualisieren: laufende Auswertung abwarten; Transkript ohne Wünsche noch auswerten. */
async function voiceReady(p) {
  const job = voicePending(p);
  if (job) { toast('Das Gespräch wird noch ausgewertet. Danach geht es automatisch los.', 5000); await job.catch(() => {}); }
  if (p.transcript?.trim() && !p.wishes?.trim() && !p.wishesFromTranscript) {
    try { toast('Wünsche aus dem Gespräch werden übernommen …', 4000); Object.assign(p, await extractWishes(p)); p.wishesFromTranscript = true; await saveProject(p); }
    catch (e) { console.warn('Wünsche nicht ableitbar', e); }
  }
}

/** Leitet aus dem Transkript die Wünsche ab: fürs Bild (fließt in die Visualisierung) und Sonstiges (fürs spätere Angebot). */
async function extractWishes(p) {
  const txt = await geminiText([{ text: `Du unterstützt eine Sanierungsfirma. Unten steht das Transkript bzw. die Notizen eines Vor-Ort-Gesprächs mit dem Kunden zum Raum "${p.room}".

Ziehe die konkreten Wünsche und Entscheidungen des Kunden heraus, kurz und als Stichpunkte auf Deutsch:
- "bild": alles, was man auf einem Foto des sanierten Raums sehen würde (Aufteilung, Dusche/Wanne, Möbel, Farben, Materialien, Fliesen, Licht, was raus soll, was bleiben soll). Formuliere so, dass eine Bild-KI es umsetzen kann.
- "sonstiges": alles andere, was für Angebot und Planung wichtig ist (Budget, Termine, Maße, Technik, Elektro, Heizung, Barrierefreiheit, offene Fragen).
Nimm nur auf, was im Gespräch wirklich gesagt wurde. Spätere Aussagen haben Vorrang vor früheren.

Antworte nur mit JSON: {"bild": ["..."], "sonstiges": ["..."]}

TRANSKRIPT:
${p.transcript}` }], true);
  let j; try { j = JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim()); } catch { throw new Error('Antwort der KI war nicht lesbar. Bitte nochmal versuchen.'); }
  const list = (a) => (Array.isArray(a) ? a : []).map((s) => '- ' + String(s).trim()).join('\n');
  return { wishes: list(j.bild), otherNotes: list(j.sonstiges) };
}

// ---------- Oberfläche ----------
function voiceCard(p) {
  const rec = voice.rec && voice.recId === p.id, busy = !!voicePending(p);
  const err = voice.error?.id === p.id ? voice.error.msg : '';
  return `
    <div class="voice" id="voicecard">
      <div class="voice-h"><b>Gespräch vor Ort</b><span>Die KI schreibt mit und übernimmt die Wünsche ins Bild. Kunden vorher um Erlaubnis fragen. Während der Aufnahme die App geöffnet lassen.</span></div>
      <div class="row">
        <button class="btn ${rec ? 'rec' : ''}" id="vrec" ${busy || (voice.rec && !rec) ? 'disabled' : ''}>${rec ? '■ Aufnahme beenden' : '● Aufnahme starten'}</button>
        <button class="btn secondary" id="vfile" ${rec || busy ? 'disabled' : ''}>Audio importieren</button>
      </div>
      <p class="hint" id="vstatus">${rec ? 'Aufnahme läuft …' : busy ? esc(voice.step || 'Gespräch wird ausgewertet …') : ''}</p>
      <div class="voice-err" id="verr" ${err ? '' : 'hidden'}><span>${esc(err)}</span> <button class="btn secondary small" id="vretry" hidden>Nochmal auswerten</button></div>
      <label>Kundenwünsche fürs Bild</label>
      <textarea id="wishes" placeholder="- z. B. Badewanne raus, bodengleiche Dusche&#10;- Waschtisch an die Fensterwand">${esc(p.wishes)}</textarea>
      <label>Sonstiges fürs Angebot (nicht im Bild)</label>
      <textarea id="otherNotes" placeholder="- z. B. Budget ca. 25.000 €, Start im März">${esc(p.otherNotes)}</textarea>
      <details class="sub">
        <summary>Transkript / Notizen aus Plaud ${p.transcript ? `(${p.transcript.length} Zeichen)` : ''}</summary>
        <textarea id="transcript" style="min-height:120px" placeholder="Hier erscheint das Transkript. Oder Text einfügen, z. B. die Zusammenfassung aus der Plaud-App.">${esc(p.transcript)}</textarea>
        <button class="btn secondary small" id="vextract" style="margin-top:8px" ${p.transcript ? '' : 'disabled'}>Wünsche aus Transkript ableiten</button>
      </details>
    </div>`;
}

/** Ergebnis in das Raum-Objekt schreiben, auch wenn der Raum inzwischen neu geladen wurde. */
function voiceApply(p, fields) {
  Object.assign(p, fields);
  if (state.project && state.project !== p && state.project.id === p.id) Object.assign(state.project, fields);
}

function bindVoice(p, persist) {
  const status = (t) => { voice.step = t; const el = $('#vstatus'); if (el && state.project?.id === p.id) el.textContent = t; };
  for (const id of ['wishes', 'otherNotes', 'transcript']) $('#' + id).oninput = (e) => {
    p[id] = e.target.value; persist();
    if (id === 'transcript') { $('#vextract').disabled = !p.transcript.trim(); p.wishesFromTranscript = false; }
  };
  const showRetry = async () => { const b = $('#vretry'); if (b && voice.error?.id === p.id) b.hidden = !(await audioLoad(p.id)); };
  showRetry();

  const run = (fn) => {
    if (voicePending(p)) return voice.job;
    voice.error = null;
    voice.jobId = p.id;
    voice.job = (async () => {
      try { await fn(); toast('Gespräch ausgewertet. Die Wünsche fließen in die Visualisierung ein.', 4000); }
      catch (e) { voice.error = { id: p.id, msg: 'Auswertung fehlgeschlagen: ' + (e?.message || 'unbekannter Fehler') }; toast(voice.error.msg, 7000); }
      finally { voice.job = null; voice.step = ''; if (state.project?.id === p.id) viewProjekt(); }
    })();
    return voice.job;
  };
  const extract = async () => {
    status('Wünsche werden abgeleitet …');
    voiceApply(p, { ...(await extractWishes(p)), wishesFromTranscript: true });
    await saveProject(p);
  };
  const handleAudio = (blob, fromStore) => run(async () => {
    if (!fromStore) await audioStore(p.id, blob); // Aufnahme sichern, damit sie bei einem Fehler nicht verloren ist
    const t = await transcribeAudio(blob, status);
    voiceApply(p, { transcript: [p.transcript?.trim(), t].filter(Boolean).join('\n\n--- weitere Aufnahme ---\n\n') });
    await saveProject(p);
    await extract(); // nach einer neuen Aufnahme immer neu ableiten
    await audioStore(p.id, null);
  });

  $('#vextract').onclick = () => {
    if ((p.wishes?.trim() || p.otherNotes?.trim()) && !confirm('Die Wünsche-Felder werden neu aus dem Transkript erstellt. Eigene Änderungen dort gehen verloren. Fortfahren?')) return;
    run(extract);
  };
  $('#vretry').onclick = async () => { const b = await audioLoad(p.id); if (b) handleAudio(b, true); };
  $('#vfile').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*,.m4a,.mp3,.wav';
    inp.onchange = () => inp.files[0] && handleAudio(inp.files[0]);
    inp.click();
  };
  $('#vrec').onclick = async () => {
    if (voice.rec) { voice.rec.state !== 'inactive' ? voice.rec.stop() : voice.finish?.(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Aufnahme wird auf diesem Gerät nicht unterstützt. Bitte Audio importieren.', 5000);
    try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return toast('Kein Zugriff aufs Mikrofon. Bitte in den iPhone-Einstellungen (Safari > Mikrofon) erlauben.', 6000); }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
    const rec = new MediaRecorder(voice.stream, mime ? { mimeType: mime } : undefined);
    voice.chunks = [];
    voice.error = null;
    rec.ondataavailable = (e) => { if (e.data?.size) voice.chunks.push(e.data); };
    rec.onerror = (e) => console.warn('Aufnahme-Fehler', e.error || e);
    // iPhone liefert die Daten erst nach "stop" – deshalb kurz warten, falls das letzte Stück noch kommt
    rec.onstop = () => setTimeout(finish, 300);
    let done = false;
    function finish() {
      if (done) return; done = true;
      clearInterval(voice.timer); voice.stream?.getTracks().forEach((t) => t.stop());
      voice.wake?.release?.().catch(() => {}); voice.wake = null;
      const blob = new Blob(voice.chunks, { type: (rec.mimeType || mime || 'audio/mp4').split(';')[0] });
      voice.rec = null; voice.recId = null; voice.chunks = [];
      if (!blob.size) {
        voice.error = { id: p.id, msg: 'Die Aufnahme ist leer angekommen. Bitte App beim Aufnehmen geöffnet lassen und nochmal versuchen.' };
        if (state.project?.id === p.id) viewProjekt();
        return;
      }
      handleAudio(blob);
      if (state.project?.id === p.id) viewProjekt();
    }
    // Bildschirm anlassen, sonst stoppt das iPhone die Aufnahme beim Sperren
    try { voice.wake = await navigator.wakeLock?.request('screen'); } catch { voice.wake = null; }
    voice.stream.getAudioTracks().forEach((t) => (t.onended = () => rec.state !== 'inactive' && rec.stop()));
    // Kein Zeitraster: das iPhone erzeugt sonst Stücke, die sich später nicht mehr zusammensetzen lassen
    voice.finish = finish;
    rec.start();
    voice.rec = rec; voice.recId = p.id; voice.started = Date.now();
    voice.timer = setInterval(() => {
      const s = Math.floor((Date.now() - voice.started) / 1000);
      if (state.project?.id === p.id) { const el = $('#vstatus'); if (el) el.textContent = `Aufnahme läuft … ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
      if (s >= VOICE_MAX_MIN * 60) { toast(`Nach ${VOICE_MAX_MIN} Minuten automatisch gestoppt. Für mehr einfach neu starten.`, 5000); rec.stop(); }
    }, 1000);
    $('#vrec').textContent = '■ Aufnahme beenden'; $('#vrec').classList.add('rec'); $('#vfile').disabled = true;
  };
}
