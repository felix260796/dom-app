// DOM – Garten: Wärmepumpe an einer markierten Stelle einsetzen
// Vor Ort einen Meterstab auf den Boden legen, Foto machen, in der App Anfang/Ende des Meterstabs
// und den Aufstellort antippen. Die KI setzt Fundament + Wärmepumpe in realistischer Größe ein.
// Baut auf app.js auf (state, $, $$, esc, toast, saveProject, resize, loadImg, mimeOf, b64, nearestAspect, ...).
'use strict';

window.Garten = (() => {
  // Moodboard-Felder, die nur für die Wärmepumpe gelten
  const WP_FELDER = ['waermepumpe', 'geraetmasse', 'fundament', 'umrandung'];
  const istWpBild = (im) => /w(ä|ae)rmepumpe|\bwp\b|fundament|au(ß|ss)engerät/i.test(im.label || '');
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const dez = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');
  const fotoKey = (ph) => (ph ? ph.length + ':' + ph.slice(-32) : '');

  function daten(p) {
    p.garten ??= {};
    const g = p.garten;
    g.wp ??= false; g.ruler ??= '2'; g.fl ??= '1,2'; g.fb ??= '0,6'; g.leitung ??= ''; g.removeRuler ??= true; g.marks ??= {};
    return g;
  }
  const marken = (p, i) => daten(p).marks[fotoKey(p.photos[i])] || [];
  const istGarten = (p) => typeof roomType === 'function' && !!roomType(p?.roomType)?.placement;

  /** Gerätemaße aus dem Moodboard ("110 × 80 × 45" in cm) */
  function geraet(pkg) {
    const z = String(pkg.fields.geraetmasse || '').match(/\d+(?:[.,]\d+)?/g)?.map(num) || [];
    const [b, h, t] = z;
    return { b: b || 100, h: h || 80, t: t || 40, angegeben: z.length >= 2 };
  }

  /** Maßstab aus dem Meterstab: Pixel pro Meter (bezogen auf die Originalgröße des Fotos) */
  function massstab(m, w, h, rulerM) {
    if (m.length < 2 || !(rulerM > 0)) return null;
    const px = Math.hypot((m[1].x - m[0].x) * w, (m[1].y - m[0].y) * h);
    return px > 5 ? px / rulerM : null;
  }

  // ---------- Orientierungsbild mit Markierungen ----------
  async function markiertesBild(photo, m, g, pkg) {
    const img = await loadImg(photo);
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const lw = Math.max(3, w / 250);
    const P = (pt) => [pt.x * w, pt.y * h];
    if (m.length >= 2) {
      x.strokeStyle = '#ffd400'; x.lineWidth = lw * 1.5; x.beginPath(); x.moveTo(...P(m[0])); x.lineTo(...P(m[1])); x.stroke();
      for (const pt of m.slice(0, 2)) { x.fillStyle = '#ffd400'; x.beginPath(); x.arc(...P(pt), lw * 2.5, 0, 7); x.fill(); }
      x.font = `bold ${Math.round(w / 35)}px sans-serif`; x.fillStyle = '#ffd400'; x.strokeStyle = '#000'; x.lineWidth = lw / 2;
      const [mx, my] = P({ x: (m[0].x + m[1].x) / 2, y: (m[0].y + m[1].y) / 2 });
      x.strokeText(`Meterstab ${dez(num(g.ruler))} m`, mx + lw * 3, my - lw * 3); x.fillText(`Meterstab ${dez(num(g.ruler))} m`, mx + lw * 3, my - lw * 3);
    }
    if (m.length >= 3) {
      const [sx, sy] = P(m[2]);
      const s = massstab(m, w, h, num(g.ruler));
      const d = geraet(pkg);
      if (s) {
        // Rahmen: Gerät von vorne (Breite × Höhe), unten mittig auf dem Aufstellort; darunter die Fundamentbreite
        const fw = (num(g.fl) || d.b / 100 + 0.2) * s, gw = (d.b / 100) * s, gh = (d.h / 100) * s;
        x.setLineDash([lw * 3, lw * 2]); x.strokeStyle = '#ff2020'; x.lineWidth = lw;
        x.strokeRect(sx - gw / 2, sy - gh, gw, gh);
        x.setLineDash([]); x.beginPath(); x.moveTo(sx - fw / 2, sy); x.lineTo(sx + fw / 2, sy); x.lineWidth = lw * 1.5; x.stroke();
      }
      const k = lw * 5; x.strokeStyle = '#ff2020'; x.lineWidth = lw * 1.2; x.setLineDash([]);
      x.beginPath(); x.moveTo(sx - k, sy - k); x.lineTo(sx + k, sy + k); x.moveTo(sx + k, sy - k); x.lineTo(sx - k, sy + k); x.stroke();
    }
    return resize(c.toDataURL('image/jpeg', 0.9), 1600);
  }

  // ---------- KI-Anweisung ----------
  function anweisung(pkg, p, ctx) {
    const g = daten(p), d = geraet(pkg), f = pkg.fields;
    const rulerM = num(g.ruler), m = ctx.m;
    const lines = (arr) => arr.filter(Boolean).map((t) => '- ' + t).join('\n');
    let n = 2;
    const bilder = [];
    if (ctx.markiert) bilder.push(`- Bild ${n++}: ORIENTIERUNGSBILD = Bild 1 mit Markierungen. Gelbe Linie mit Punkten: Anfang und Ende des Meterstabs. Rotes Kreuz: Aufstellort (Mitte der Vorderkante des Fundaments). Roter Rahmen: ungefähre Größe des Geräts von vorne, rote Linie: Breite des Fundaments. Die Markierungen dürfen im Ergebnis NICHT zu sehen sein.`);
    if (ctx.rendered) bilder.push(`- Bild ${n++}: bereits fertige Ansicht DESSELBEN Gartens aus einem anderen Blickwinkel. Verwende exakt dieselbe Wärmepumpe, dasselbe Fundament und dasselbe Umfeld.`);
    ctx.refs.forEach((im) => bilder.push(`- Bild ${n++}: ${im.label?.trim() || 'Referenzbild'} (Moodboard-Vorlage${istWpBild(im) ? ': Form, Farbe, Lüftergitter und Details des Geräts genau so übernehmen' : ''}, nicht als Garten übernehmen)`));
    const prods = (pkg.products || []).filter((x) => x.name?.trim() && (!x.area || WP_FELDER.includes(x.area))).map((x) => '- ' + x.name.trim()).join('\n');

    let ort;
    if (m.length >= 3) ort = 'Setze das Fundament mit der Wärmepumpe genau an die mit dem roten Kreuz markierte Stelle (siehe Orientierungsbild).';
    else ort = 'Es ist kein Aufstellort markiert: Wähle einen plausiblen, gut sichtbaren Platz auf dem Boden vor der Hauswand, mit ca. 30–50 cm Abstand zur Wand.';
    let mass;
    if (ctx.pxProM) {
      const proz = Math.round((d.b / 100) * ctx.pxProM / ctx.w * 100);
      mass = lines([
        `Im Foto liegt ein Meterstab (Zollstock) als Maßstab auf dem Boden. Aufgeklappt ist er ${dez(rulerM)} m lang (im Orientierungsbild gelb markiert).`,
        `Dort entspricht 1 m etwa ${Math.round(ctx.pxProM)} Pixel bei ${ctx.w} Pixel Bildbreite.`,
        `Das Gerät ist ${d.b} cm breit, also ${dez((d.b / 100) / rulerM)}-mal so breit wie der Meterstab lang ist. Steht es so weit weg wie der Meterstab, ist es ca. ${proz} % der Bildbreite breit; weiter hinten entsprechend kleiner (Perspektive).`,
      ]);
    } else {
      mass = lines(['Kein Maßstab markiert: Schätze die Größe an Haustür (ca. 2,0 m hoch), Fenstern, Stufen, Gehwegplatten und Zäunen.']);
    }
    return `Du bist ein Werkzeug für fotorealistische Visualisierungen im Garten- und Heizungsbau.

Bild 1 ist ein Foto eines Gartens / Außenbereichs am Haus (${p.room}). Bearbeite GENAU DIESES FOTO (Bild 1): Baue ein neues Betonfundament und stelle darauf das Außengerät einer Luft/Wasser-Wärmepumpe (Ausstattungslinie "${pkg.name}"). Gib genau ein Bild aus.

AUFSTELLORT:
- ${ort}

MASSSTAB (sehr wichtig, die Größe muss realistisch sein):
${mass}
- Lieber genau als zu groß oder zu klein. Perspektive, Fluchtlinien und Bodenneigung wie im Foto.

WAS EINGEBAUT WIRD:
- Fundament: ${dez(num(g.fl) || d.b / 100 + 0.2)} m breit (entlang der Gerätefront) × ${dez(num(g.fb) || d.t / 100 + 0.2)} m tief${f.fundament?.trim() ? `, ${f.fundament.trim()}` : ''}
- Wärmepumpe: ${f.waermepumpe?.trim() || 'moderne Luft/Wasser-Wärmepumpe, Monoblock'}; Abmessungen ca. ${d.b} cm breit × ${d.h} cm hoch × ${d.t} cm tief
${f.umrandung?.trim() ? `- Umfeld: ${f.umrandung.trim()}\n` : ''}- Die Lüfterseite zeigt frei nach vorne (nicht zur Wand). Leitungen verschwinden im Boden bzw. unter einer Abdeckung an der Hauswand.
${prods ? `\nKONKRETE PRODUKTE (so originalgetreu wie möglich darstellen):\n${prods}\n` : ''}${bilder.length ? `\nWEITERE BILDER:\n${bilder.join('\n')}\n` : ''}
UNBEDINGT BEIBEHALTEN:
- exakt dieselbe Kameraposition, Perspektive, Brennweite und Bildausschnitt wie Bild 1
- alles außer Fundament, Wärmepumpe und ihrem direkten Umfeld bleibt unverändert: Haus, Fenster, Türen, Rasen, Pflanzen, Zaun, Wege, Möbel, Wetter und Licht
- ${g.removeRuler ? 'Den Meterstab aus dem Bild entfernen und die Stelle natürlich ergänzen (Rasen, Pflaster o. ä. wie daneben).' : 'Der Meterstab bleibt liegen.'}
${p.note?.trim() ? `\nZUSÄTZLICHER HINWEIS ZU DIESEM PROJEKT: ${p.note.trim()}\n` : ''}${p.wishes?.trim() ? `\nKUNDENWÜNSCHE AUS DEM GESPRÄCH VOR ORT (haben Vorrang, Aufstellort und Größe bleiben trotzdem gleich):\n${p.wishes.trim()}\n` : ''}
Ergebnis: fotorealistisch, Licht und Schatten passend zum Foto (das Gerät wirft einen passenden Schatten), sauber fertiggestellt, keine Personen, kein Text, keine Markierungen, keine Wasserzeichen, kein Baustellenzustand.`;
  }

  async function render(pkg, p, i, rendered) {
    const { apiKey, model } = state.settings;
    if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
    const g = daten(p), target = p.photos[i], m = marken(p, i);
    const im = await loadImg(target);
    const pxProM = massstab(m, im.naturalWidth, im.naturalHeight, num(g.ruler));
    const markiert = m.length >= 2 ? await markiertesBild(target, m, g, pkg) : null;
    // Wärmepumpen-Bilder zuerst, dann übrige Moodboard-Bilder
    const refs = [...pkg.images.filter(istWpBild), ...pkg.images.filter((x) => !istWpBild(x))].slice(0, MAX_REF_IMAGES);
    const text = anweisung(pkg, p, { m, pxProM, w: im.naturalWidth, markiert: !!markiert, rendered: !!rendered, refs });
    const img = (d) => ({ inline_data: { mime_type: mimeOf(d), data: b64(d) } });
    const parts = [{ text }, img(target)];
    if (markiert) parts.push(img(markiert));
    if (rendered) parts.push(img(rendered));
    for (const r of refs) parts.push(img(r.data));
    const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: await nearestAspect(target) } } };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash-image')}:generateContent`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || `Fehler ${r.status}`);
    const cand = j.candidates?.[0];
    const part = cand?.content?.parts?.find((x) => x.inlineData || x.inline_data);
    if (!part) throw new Error(cand?.content?.parts?.map((x) => x.text).filter(Boolean).join(' ') || j.promptFeedback?.blockReason || cand?.finishReason || 'Die KI hat kein Bild geliefert. Bitte nochmal versuchen.');
    const d = part.inlineData || part.inline_data;
    return resize(`data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`, 1600);
  }

  /** Garten ohne Wärmepumpe: Wärmepumpen-Felder, -Produkte und -Bilder nicht an die KI geben. */
  function pkgFuer(pkg, p) {
    if (!istGarten(p) || daten(p).wp) return null;
    return { ...pkg, fields: Object.fromEntries(Object.entries(pkg.fields).filter(([k]) => !WP_FELDER.includes(k))),
      images: pkg.images.filter((x) => !istWpBild(x)), products: (pkg.products || []).filter((x) => !WP_FELDER.includes(x.area)) };
  }

  /** Werte ins Aufmaß übernehmen (Garten-Raum), damit Fundament und Leitungsweg im Angebot landen. */
  function insAufmass(p) {
    const g = daten(p);
    for (const r of p.aufmass?.raeume || []) if (/garten/i.test(r.typ)) Object.assign(r, { wp: g.wp, fl: g.fl, fb: g.fb, leitung: g.leitung });
  }

  // ---------- Karte im Projekt ----------
  const SCHRITTE = ['Tippe auf den ANFANG des Meterstabs', 'Tippe auf das ENDE des Meterstabs', 'Tippe auf den AUFSTELLORT (Mitte vorne am Fundament)', 'Fertig. Erneut tippen verschiebt den Aufstellort.'];
  function markerHtml(m) {
    const dot = (pt, cls) => `<span class="gm-dot ${cls}" style="left:${pt.x * 100}%;top:${pt.y * 100}%"></span>`;
    return `${m.length >= 2 ? `<svg class="gm-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="${m[0].x * 100}" y1="${m[0].y * 100}" x2="${m[1].x * 100}" y2="${m[1].y * 100}" /></svg>` : ''}
      ${m.slice(0, 2).map((pt) => dot(pt, 'gelb')).join('')}${m[2] ? dot(m[2], 'rot') : ''}`;
  }

  function projektKarte(p, persist) {
    const el = $('#garten-card'); if (!el) return;
    if (!istGarten(p)) { el.innerHTML = ''; return; }
    const g = daten(p);
    const save = () => { insAufmass(p); persist ? persist() : saveProject(p); };
    const neu = () => { save(); projektKarte(p, persist); };
    el.innerHTML = `<div class="card">
      <h2>Wärmepumpe im Garten</h2>
      <label class="check"><input type="checkbox" id="gWp" ${g.wp ? 'checked' : ''}>Wärmepumpe mit Fundament an einer bestimmten Stelle einsetzen</label>
      <p class="muted">${g.wp ? 'Die KI setzt nur Fundament und Wärmepumpe (laut Moodboard) ein, der restliche Garten bleibt, wie er ist.' : 'Ohne Haken gestaltet die KI den ganzen Garten nach dem Moodboard (Terrasse, Rasen, Bepflanzung …), ohne Wärmepumpe.'}</p>
      ${g.wp ? `
      <p class="muted"><b>Vor Ort:</b> Meterstab aufgeklappt auf den Boden legen, nah am geplanten Platz und <b>quer zur Kamera</b> (parallel zur Hauswand). Dann das Foto machen. Hier im Foto antippen: 1. Anfang und 2. Ende des Meterstabs, 3. den Aufstellort.</p>
      ${p.photos.length ? p.photos.map((ph, i) => { const m = marken(p, i); return `
        <div class="gm-wrap" data-gi="${i}"><img src="${ph}" alt="Ansicht ${i + 1}" draggable="false">${markerHtml(m)}</div>
        <div class="row" style="align-items:center;margin:6px 0 12px"><span class="muted" style="flex:3">${p.photos.length > 1 ? `Ansicht ${i + 1}: ` : ''}${SCHRITTE[Math.min(m.length, 3)]}</span>
        ${m.length ? `<button class="btn small secondary" style="flex:none" data-greset="${i}">Zurücksetzen</button>` : ''}</div>`; }).join('') : '<p class="muted">Erst oben ein Foto machen.</p>'}
      <div class="row">
        <div><label>Meterstab-Länge (m)</label><input type="text" inputmode="decimal" id="gRuler" value="${esc(g.ruler)}" placeholder="2"></div>
        <div><label>Leitungsweg zum Haus (m)</label><input type="text" inputmode="decimal" id="gLeit" value="${esc(g.leitung)}" placeholder="z. B. 4"></div>
      </div>
      <label>Fundament Breite × Tiefe (m)</label>
      <div class="mrow"><input type="text" inputmode="decimal" id="gFl" value="${esc(g.fl)}" placeholder="1,2"><span>×</span><input type="text" inputmode="decimal" id="gFb" value="${esc(g.fb)}" placeholder="0,6"></div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="gRm" ${g.removeRuler ? 'checked' : ''}>Meterstab im fertigen Bild entfernen</label>
      <p class="muted">Gerätemaße und Modell kommen aus dem Moodboard „Garten“ (Felder Wärmepumpe und Abmessungen). Fundament und Leitungsweg gehen ins Aufmaß und Angebot.</p>` : ''}
    </div>`;
    $('#gWp').onchange = (e) => { g.wp = e.target.checked; neu(); };
    if (!g.wp) return;
    for (const [id, k] of [['gRuler', 'ruler'], ['gLeit', 'leitung'], ['gFl', 'fl'], ['gFb', 'fb']]) $('#' + id).oninput = (e) => { g[k] = e.target.value; save(); };
    $('#gRm').onchange = (e) => { g.removeRuler = e.target.checked; save(); };
    $$('[data-greset]', el).forEach((b) => (b.onclick = () => { delete g.marks[fotoKey(p.photos[+b.dataset.greset])]; neu(); }));
    $$('[data-gi]', el).forEach((w) => (w.onclick = (e) => {
      const i = +w.dataset.gi, r = w.getBoundingClientRect();
      const pt = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
      const k = fotoKey(p.photos[i]), m = (g.marks[k] ||= []);
      if (m.length < 3) m.push(pt); else m[2] = pt;
      const y = window.scrollY; neu(); window.scrollTo(0, y);
    }));
  }

  return { zustaendig: (p) => istGarten(p) && !!daten(p).wp, render, pkgFuer, projektKarte, daten, _intern: { anweisung, massstab, markiertesBild, geraet } };
})();
