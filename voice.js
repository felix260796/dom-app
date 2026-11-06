'use strict';
/* Gespräch vor Ort: Sprachaufnahme in der App (oder Audio-/Text-Import, z. B. von Plaud)
 * -> Transkript über Gemini -> Kundenwünsche, die in die Visualisierung einfließen.
 * Wird vor app.js geladen; nutzt dessen Hilfsfunktionen ($, esc, toast, state, saveProject) erst zur Laufzeit. */

const VOICE_MODEL = 'gemini-2.5-flash';   // Text-/Audio-Modell (günstig, versteht Deutsch gut)
const VOICE_MAX_MIN = 15;                 // Aufnahme stoppt automatisch nach 15 Minuten
const VOICE_SEGMENT_SEC = 300;            // Audio wird in 5-Minuten-Stücke geteilt (API-Limit 20 MB pro Anfrage)
const VOICE_RATE = 16000;                 // 16 kHz Mono reicht für Sprache

const voice = { rec: null, stream: null, chunks: [], timer: null, started: 0, busy: false };

// ---------- Gemini (Text/Audio) ----------
async function geminiText(parts, json = false) {
  const { apiKey } = state.settings;
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
  const body = { contents: [{ role: 'user', parts }], generationConfig: json ? { responseMimeType: 'application/json' } : {} };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${VOICE_MODEL}:generateContent`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Fehler ${r.status}`);
  const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  if (!txt) throw new Error(j.promptFeedback?.blockReason || 'Die KI hat keinen Text geliefert.');
  return txt;
}

// ---------- Audio -> 16 kHz Mono WAV-Stücke ----------
async function audioToWavSegments(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const audio = await new Promise((res, rej) => {
    const p = new Ctx(1, 1, VOICE_RATE).decodeAudioData(buf, res, rej);
    if (p?.then) p.then(res, rej);
  });
  // auf Mono mischen
  const n = audio.length, mono = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / audio.numberOfChannels; }
  const rate = audio.sampleRate, seg = VOICE_SEGMENT_SEC * rate, out = [];
  for (let s = 0; s < n; s += seg) out.push(encodeWav(mono.subarray(s, Math.min(n, s + seg)), rate));
  return { segments: out, seconds: n / rate };
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
async function transcribeAudio(blob, onStep) {
  onStep('Audio wird vorbereitet …');
  const { segments } = await audioToWavSegments(blob);
  const parts = [];
  for (let k = 0; k < segments.length; k++) {
    onStep(`Transkribiere${segments.length > 1 ? ` Teil ${k + 1} von ${segments.length}` : ''} …`);
    parts.push((await geminiText([
      { text: `Transkribiere dieses Gespräch auf Deutsch wortgetreu, aber ohne Füllwörter. Es ist ein Vor-Ort-Termin einer Sanierungsfirma mit Kunden${segments.length > 1 ? ` (Teil ${k + 1} von ${segments.length})` : ''}. Kennzeichne Sprecherwechsel mit neuen Zeilen. Gib nur das Transkript aus.` },
      { inline_data: { mime_type: 'audio/wav', data: bufToB64(segments[k]) } },
    ])).trim());
  }
  return parts.join('\n');
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
  return `
    <div class="voice" id="voicecard">
      <div class="voice-h"><b>Gespräch vor Ort</b><span>Die KI schreibt mit und übernimmt die Wünsche. Kunden vorher um Erlaubnis fragen.</span></div>
      <div class="row">
        <button class="btn ${voice.rec ? 'rec' : ''}" id="vrec">${voice.rec ? '■ Aufnahme beenden' : '● Aufnahme starten'}</button>
        <button class="btn secondary" id="vfile" ${voice.rec ? 'disabled' : ''}>Audio importieren</button>
      </div>
      <p class="hint" id="vstatus">${voice.rec ? 'Aufnahme läuft …' : ''}</p>
      <label>Kundenwünsche fürs Bild</label>
      <textarea id="wishes" placeholder="- z. B. Badewanne raus, bodengleiche Dusche&#10;- Waschtisch an die Fensterwand">${esc(p.wishes)}</textarea>
      <label>Sonstiges fürs Angebot (nicht im Bild)</label>
      <textarea id="otherNotes" placeholder="- z. B. Budget ca. 25.000 €, Start im März">${esc(p.otherNotes)}</textarea>
      <details class="sub" ${p.transcript ? '' : ''}>
        <summary>Transkript / Notizen aus Plaud ${p.transcript ? `(${p.transcript.length} Zeichen)` : ''}</summary>
        <textarea id="transcript" style="min-height:120px" placeholder="Hier erscheint das Transkript. Oder Text einfügen, z. B. die Zusammenfassung aus der Plaud-App.">${esc(p.transcript)}</textarea>
        <button class="btn secondary small" id="vextract" style="margin-top:8px" ${p.transcript ? '' : 'disabled'}>Wünsche aus Transkript ableiten</button>
      </details>
    </div>`;
}

function bindVoice(p, persist) {
  const status = (t) => { const el = $('#vstatus'); if (el) el.textContent = t; };
  for (const id of ['wishes', 'otherNotes', 'transcript']) $('#' + id).oninput = (e) => {
    p[id] = e.target.value; persist();
    if (id === 'transcript') $('#vextract').disabled = !p.transcript.trim();
  };

  const extract = async () => {
    if ((p.wishes?.trim() || p.otherNotes?.trim()) && !confirm('Die Wünsche-Felder werden neu aus dem Transkript erstellt. Eigene Änderungen dort gehen verloren. Fortfahren?')) return;
    status('Wünsche werden abgeleitet …');
    Object.assign(p, await extractWishes(p));
    await saveProject(p);
  };
  const run = async (fn) => {
    if (voice.busy) return;
    voice.busy = true;
    try { await fn(); status(''); toast('Gespräch ausgewertet.'); }
    catch (e) { status(''); toast('Fehler: ' + e.message, 6000); }
    finally { voice.busy = false; if (state.project === p) viewProjekt(); }
  };
  const handleAudio = (blob) => run(async () => {
    const t = await transcribeAudio(blob, status);
    p.transcript = [p.transcript?.trim(), t].filter(Boolean).join('\n\n--- weitere Aufnahme ---\n\n');
    await saveProject(p);
    status('Wünsche werden abgeleitet …');
    Object.assign(p, await extractWishes(p)); // nach einer neuen Aufnahme immer neu ableiten
    await saveProject(p);
  });

  $('#vextract').onclick = () => run(extract);
  $('#vfile').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*,.m4a,.mp3,.wav';
    inp.onchange = () => inp.files[0] && handleAudio(inp.files[0]);
    inp.click();
  };
  $('#vrec').onclick = async () => {
    if (voice.rec) { voice.rec.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Aufnahme wird auf diesem Gerät nicht unterstützt. Bitte Audio importieren.', 5000);
    try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return toast('Kein Zugriff aufs Mikrofon. Bitte in den iPhone-Einstellungen erlauben.', 5000); }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));
    const rec = new MediaRecorder(voice.stream, mime ? { mimeType: mime } : undefined);
    voice.chunks = [];
    rec.ondataavailable = (e) => e.data.size && voice.chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(voice.timer); voice.stream.getTracks().forEach((t) => t.stop());
      voice.rec = null;
      const blob = new Blob(voice.chunks, { type: rec.mimeType || mime || 'audio/mp4' });
      if (state.project === p) viewProjekt();
      handleAudio(blob);
    };
    rec.start(1000);
    voice.rec = rec; voice.started = Date.now();
    voice.timer = setInterval(() => {
      const s = Math.floor((Date.now() - voice.started) / 1000);
      status(`Aufnahme läuft … ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      if (s >= VOICE_MAX_MIN * 60) { toast(`Nach ${VOICE_MAX_MIN} Minuten automatisch gestoppt. Für mehr einfach neu starten.`, 5000); rec.stop(); }
    }, 1000);
    $('#vrec').textContent = '■ Aufnahme beenden'; $('#vrec').classList.add('rec'); $('#vfile').disabled = true;
  };
}
