'use strict';
/* DOM – Zeichnen mit Stift oder Finger: ein Werkzeug für Fotos, Pläne, Grundrisse und freie Skizzen.
 *
 *   const r = await Zeichnen.oeffnen(hintergrund, { titel, striche, masstab, farben, onSave });
 *   → r = { striche, bild } nach „Fertig“, sonst null. onSave(striche, bild) wird zusätzlich aufgerufen.
 *
 * hintergrund:
 *   - Bild als DataURL (Foto, Plan)
 *   - { breite, hoehe, zeichne(ctx) }: eigene Zeichnung (z. B. Grundriss aus dem Raumscan); ctx ist schon in
 *     „Blatt-Einheiten“ (0…breite, 0…hoehe) umgerechnet
 *   - nichts: leeres weißes Blatt (freie Skizze)
 * striche: [{ art: 'stift'|'linie'|'pfeil'|'kreis'|'text'|'mass', f: Farbe, b: Strichstärke, p: [[x, y], …], text }]
 *   in Blatt-Einheiten, bleiben also beim Zoomen und in jeder Bildgröße an derselben Stelle. Das Original wird nie
 *   verändert: „Fertig“ liefert die Striche (zum späteren Weiterzeichnen) und ein fertiges Bild (JPEG).
 * masstab: Blatt-Einheiten je Meter. Nur dann gibt es das Werkzeug „Maß“ (Linie mit Länge in m).
 *
 * Apple Pencil: Der Stift zeichnet immer. Sobald einmal ein Stift benutzt wurde, verschiebt der Finger nur noch
 * (Handballen-Schutz). Zwei Finger verschieben und zoomen immer. Ohne Stift zeichnet ein Finger.
 * Einstellbar (Einstellungen, bei den Bilder-Ordnern): Farben `zeichnenFarben`, Strichstärke `zeichnenStaerke`. */
window.Zeichnen = (() => {
  const WERKZEUGE = [['stift', 'Stift'], ['linie', 'Linie'], ['pfeil', 'Pfeil'], ['kreis', 'Kreis'], ['text', 'Text'], ['mass', 'Maß'], ['radierer', 'Radierer']];
  const FARBEN = { rot: '#e02424', orange: '#f97316', gelb: '#f5b400', grün: '#16a34a', blau: '#1d4ed8', schwarz: '#111111', weiß: '#ffffff' };
  /** Farben aus den Einstellungen (Namen) → Farbwerte; Unbekanntes fällt weg. */
  const farbenVorgabe = () => {
    const l = [].concat(vg('zeichnenFarben', []) || []).map((n) => FARBEN[String(n).trim().toLowerCase().replace('weiss', 'weiß').replace('gruen', 'grün')]).filter(Boolean);
    return l.length ? [...new Set(l)] : [FARBEN.rot, FARBEN.gelb, FARBEN.blau, FARBEN.schwarz, FARBEN.weiß];
  };
  const vg = (k, sonst) => { try { const v = window.vorgabe?.(k); return v == null || v === '' ? sonst : v; } catch { return sonst; } };
  const meter = (m) => `${m.toFixed(2).replace('.', ',')} m`;

  async function blatt(h) {
    if (typeof h === 'string' && h) {
      const img = await loadImg(h);
      return { breite: img.naturalWidth, hoehe: img.naturalHeight, zeichne: (c) => c.drawImage(img, 0, 0) };
    }
    if (h && typeof h.zeichne === 'function') return h;
    return { breite: 2000, hoehe: 1500, zeichne: (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 2000, 1500); } };
  }

  /** Einen Strich zeichnen (ctx ist in Blatt-Einheiten). */
  function strich(c, s, masstab) {
    const p = s.p || [];
    if (!p.length) return;
    c.strokeStyle = c.fillStyle = s.f; c.lineWidth = s.b; c.lineCap = c.lineJoin = 'round';
    const [a, e] = [p[0], p[p.length - 1]];
    if (s.art === 'stift') {
      c.beginPath(); c.moveTo(a[0], a[1]);
      if (p.length === 1) c.lineTo(a[0] + 0.01, a[1]);
      // durch die Mitten glätten, damit Schrift mit dem Stift rund aussieht
      for (let i = 1; i < p.length - 1; i++) c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
      if (p.length > 1) c.lineTo(e[0], e[1]);
      c.stroke();
    } else if (s.art === 'kreis') {
      c.beginPath(); c.ellipse((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, Math.abs(e[0] - a[0]) / 2, Math.abs(e[1] - a[1]) / 2, 0, 0, Math.PI * 2); c.stroke();
    } else if (s.art === 'text') {
      const gr = s.b * 6;
      c.font = `600 ${gr}px -apple-system, system-ui, sans-serif`; c.textBaseline = 'middle';
      c.lineWidth = gr / 5; c.strokeStyle = s.f === '#ffffff' ? '#111' : '#fff'; c.strokeText(s.text || '', a[0], a[1]);
      c.fillText(s.text || '', a[0], a[1]);
    } else {
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]); c.stroke();
      const w = Math.atan2(e[1] - a[1], e[0] - a[0]), l = Math.hypot(e[0] - a[0], e[1] - a[1]);
      if (s.art === 'pfeil' && l > s.b * 2) {
        const k = Math.min(s.b * 5, l / 2);
        c.beginPath(); c.moveTo(e[0], e[1]);
        c.lineTo(e[0] - k * Math.cos(w - 0.45), e[1] - k * Math.sin(w - 0.45));
        c.lineTo(e[0] - k * Math.cos(w + 0.45), e[1] - k * Math.sin(w + 0.45));
        c.closePath(); c.fill();
      }
      if (s.art === 'mass') {
        const q = s.b * 2.5, nx = Math.sin(w) * q, ny = -Math.cos(w) * q;
        c.beginPath();
        for (const z of [a, e]) { c.moveTo(z[0] - nx, z[1] - ny); c.lineTo(z[0] + nx, z[1] + ny); }
        c.stroke();
        if (masstab && l > 0) {
          const gr = s.b * 5, t = meter(l / masstab);
          c.save(); c.translate((a[0] + e[0]) / 2, (a[1] + e[1]) / 2);
          c.rotate(Math.abs(w) > Math.PI / 2 ? w + Math.PI : w);
          c.font = `600 ${gr}px -apple-system, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'bottom';
          c.lineWidth = gr / 4; c.strokeStyle = s.f === '#ffffff' ? '#111' : '#fff'; c.strokeText(t, 0, -s.b * 1.5); c.fillText(t, 0, -s.b * 1.5);
          c.restore();
        }
      }
    }
  }

  /** Abstand eines Punktes zum Strich (für den Radierer). */
  function abstand(s, x, y) {
    const p = s.p || [];
    if (!p.length) return Infinity;
    const [a, e] = [p[0], p[p.length - 1]];
    if (s.art === 'text') { const br = (s.text || '').length * s.b * 3.3; return x >= a[0] - s.b && x <= a[0] + br && Math.abs(y - a[1]) <= s.b * 4 ? 0 : Infinity; }
    if (s.art === 'kreis') {
      const rx = Math.abs(e[0] - a[0]) / 2 || 1, ry = Math.abs(e[1] - a[1]) / 2 || 1;
      const d = Math.hypot((x - (a[0] + e[0]) / 2) / rx, (y - (a[1] + e[1]) / 2) / ry);
      return Math.abs(d - 1) * Math.min(rx, ry);
    }
    const strecke = (u, v) => {
      const dx = v[0] - u[0], dy = v[1] - u[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - u[0]) * dx + (y - u[1]) * dy) / l2)) : 0;
      return Math.hypot(x - u[0] - t * dx, y - u[1] - t * dy);
    };
    if (s.art !== 'stift') return strecke(a, e);
    let m = Math.hypot(x - a[0], y - a[1]);
    for (let i = 1; i < p.length; i++) m = Math.min(m, strecke(p[i - 1], p[i]));
    return m;
  }

  /** Fertiges Bild: Hintergrund und Striche, längste Seite höchstens `max` Pixel. */
  function bildAus(B, striche, masstab, max = 2400) {
    const k = Math.min(1, max / Math.max(B.breite, B.hoehe)) * (Math.max(B.breite, B.hoehe) < 1200 ? 1200 / Math.max(B.breite, B.hoehe) : 1);
    const c = document.createElement('canvas');
    c.width = Math.round(B.breite * k); c.height = Math.round(B.hoehe * k);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.scale(k, k);
    x.save(); B.zeichne(x); x.restore();
    for (const s of striche) { x.save(); strich(x, s, masstab); x.restore(); }
    return c.toDataURL('image/jpeg', 0.88);
  }

  async function oeffnen(hintergrund, opt = {}) {
    const B = await blatt(hintergrund);
    const masstab = Number(opt.masstab) || 0;
    const farben = opt.farben || farbenVorgabe();
    let striche = JSON.parse(JSON.stringify(opt.striche || []));
    const verlauf = [];
    let werkzeug = 'stift', farbe = farben[0], geaendert = false, stiftBenutzt = false;

    const el = document.createElement('div');
    el.className = 'zv';
    el.innerHTML = `<div class="zv-top"><button type="button" class="zv-k" data-ab>Abbrechen</button><b>${esc(opt.titel || 'Zeichnen')}</b><button type="button" class="zv-k on" data-ok>Fertig</button></div>
      <div class="zv-feld"><canvas></canvas></div>
      <div class="zv-bar">
        <div class="zv-w">${WERKZEUGE.filter(([w]) => w !== 'mass' || masstab).map(([w, n]) => `<button type="button" data-w="${w}">${n}</button>`).join('')}</div>
        <div class="zv-f">${farben.map((f) => `<button type="button" data-f="${f}" style="background:${f}" aria-label="Farbe"></button>`).join('')}<span class="zv-luft"></span><button type="button" class="zv-k" data-rueck>Rückgängig</button></div>
      </div>`;
    document.body.appendChild(el);
    const feld = $('.zv-feld', el), cv = $('canvas', el), c = cv.getContext('2d');
    // Ansicht: Bildschirm = Blatt * z + (ox, oy)
    let z = 1, ox = 0, oy = 0, z0 = 1;
    const passen = () => {
      const r = feld.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      z0 = Math.min(r.width / B.breite, r.height / B.hoehe) * 0.96;
      return r;
    };
    const mitte = () => { const r = passen(); z = z0; ox = (r.width - B.breite * z) / 2; oy = (r.height - B.hoehe * z) / 2; };
    // Strichstärke so, dass sie in der Ganzansicht gut sichtbar ist (Vorgabe in Bildschirm-Punkten)
    const staerke = () => Math.max(1, Math.min(10, Number(vg('zeichnenStaerke', 4)) || 4)) / z0;
    let entwurf = null;
    const malen = () => {
      const d = window.devicePixelRatio || 1;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#2b3542'; c.fillRect(0, 0, cv.width, cv.height);
      c.setTransform(z * d, 0, 0, z * d, ox * d, oy * d);
      c.save(); c.beginPath(); c.rect(0, 0, B.breite, B.hoehe); c.clip(); B.zeichne(c); c.restore();
      for (const s of entwurf ? [...striche, entwurf] : striche) { c.save(); strich(c, s, masstab); c.restore(); }
    };
    let warten = false;
    const neu = () => { if (warten) return; warten = true; requestAnimationFrame(() => { warten = false; malen(); }); };
    const leiste = () => {
      $$('[data-w]', el).forEach((b) => b.classList.toggle('on', b.dataset.w === werkzeug));
      $$('[data-f]', el).forEach((b) => b.classList.toggle('on', b.dataset.f === farbe));
      $('[data-rueck]', el).disabled = !verlauf.length;
    };
    const merken = () => { verlauf.push(JSON.stringify(striche)); if (verlauf.length > 60) verlauf.shift(); geaendert = true; };
    const ort = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / z, (e.clientY - r.top - oy) / z]; };

    // ---------- Stift, Finger, Maus ----------
    const zeiger = new Map();
    let zieh = null; // { x, y } Verschieben mit einem Finger; { d, mx, my } mit zwei Fingern
    const radieren = (x, y) => {
      const n = striche.findIndex((s) => abstand(s, x, y) <= Math.max(s.b * 1.5, 14 / z));
      if (n < 0) return;
      merken(); striche.splice(n, 1); leiste(); neu();
    };
    const zwei = () => { const [a, b] = [...zeiger.values()].filter((q) => q.art === 'touch'); return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    cv.onpointerdown = async (e) => {
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY, art: e.pointerType });
      if (e.pointerType === 'pen') stiftBenutzt = true;
      const finger = [...zeiger.values()].filter((p) => p.art === 'touch').length;
      if (e.pointerType === 'touch' && finger >= 2) { entwurf = null; zieh = zwei(); neu(); return; }
      if (e.pointerType === 'touch' && stiftBenutzt) { if (!entwurf) zieh = { id: e.pointerId }; return; }
      // Der Stift setzt an, während die Hand schon aufliegt: was die Hand gerade zeichnet, verwerfen
      if (e.pointerType === 'pen') zieh = null;
      const [x, y] = ort(e);
      if (werkzeug === 'radierer') { entwurf = null; zieh = { rad: true, id: e.pointerId }; return radieren(x, y); }
      if (werkzeug === 'text') {
        zeiger.delete(e.pointerId);
        const v = await sheet('Text', [], { text: 'z. B. Dusche, Steckdose, 2,40 m' });
        if (!v?.text?.trim()) return;
        merken(); striche.push({ art: 'text', f: farbe, b: staerke(), p: [[x, y]], text: v.text.trim() }); leiste(); neu();
        return;
      }
      entwurf = { art: werkzeug, f: farbe, b: staerke(), p: [[x, y], [x, y]], zid: e.pointerId };
      if (werkzeug === 'stift') entwurf.p = [[x, y]];
      neu();
    };
    cv.onpointermove = (e) => {
      const p = zeiger.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      const vx = p.x, vy = p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (zieh?.d) {
        if (p.art !== 'touch' || zeiger.size < 2) return;
        const n = zwei(), r = cv.getBoundingClientRect();
        const f = Math.max(z0 * 0.5 / z, Math.min(z0 * 12 / z, n.d / zieh.d));
        // um den Punkt zwischen den Fingern zoomen und mitschieben
        ox = n.mx - r.left - (zieh.mx - r.left - ox) * f; oy = n.my - r.top - (zieh.my - r.top - oy) * f; z *= f;
        zieh = n; return neu();
      }
      if (zieh?.rad && zieh.id === e.pointerId) return radieren(...ort(e));
      if (zieh && zieh.id === e.pointerId) { if (!entwurf) { ox += e.clientX - vx; oy += e.clientY - vy; neu(); } return; }
      if (!entwurf || entwurf.zid !== e.pointerId) return;
      // Zwischenpunkte des Stifts mitnehmen (iPad liefert mehr Punkte, als Bilder gezeichnet werden)
      const alle = entwurf.art === 'stift' && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const q of alle.length ? alle : [e]) {
        const [x, y] = ort(q);
        if (entwurf.art === 'stift') { const l = entwurf.p[entwurf.p.length - 1]; if (Math.hypot(x - l[0], y - l[1]) * z >= 1) entwurf.p.push([x, y]); }
        else entwurf.p[1] = [x, y];
      }
      neu();
    };
    const ende = (e) => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      if (zieh && (zieh.d || zieh.id === e.pointerId)) {
        // nach dem Zoomen schiebt der Finger, der liegen bleibt, weiter (zeichnet nicht versehentlich)
        const rest = [...zeiger.entries()].filter(([, q]) => q.art === 'touch');
        zieh = zieh.d && rest.length >= 2 ? zwei() : zieh.d && rest.length === 1 ? { id: rest[0][0] } : null;
        return;
      }
      if (!entwurf || entwurf.zid !== e.pointerId) return;
      const s = entwurf; entwurf = null; delete s.zid;
      const [a, b] = [s.p[0], s.p[s.p.length - 1]];
      // ein bloßer Tipp ist nur beim Stift ein Punkt, sonst nichts
      if (e.type !== 'pointercancel' && (s.art === 'stift' || Math.hypot(b[0] - a[0], b[1] - a[1]) * z > 6)) {
        s.p = s.p.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
        merken(); striche.push(s); leiste();
      }
      neu();
    };
    cv.onpointerup = ende; cv.onpointercancel = ende;
    cv.onwheel = (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), f = Math.max(z0 * 0.5 / z, Math.min(z0 * 12 / z, e.deltaY < 0 ? 1.15 : 1 / 1.15));
      ox = e.clientX - r.left - (e.clientX - r.left - ox) * f; oy = e.clientY - r.top - (e.clientY - r.top - oy) * f; z *= f; neu();
    };

    // ---------- Knöpfe ----------
    $$('[data-w]', el).forEach((b) => (b.onclick = () => { werkzeug = b.dataset.w; leiste(); }));
    $$('[data-f]', el).forEach((b) => (b.onclick = () => { farbe = b.dataset.f; if (werkzeug === 'radierer') werkzeug = 'stift'; leiste(); }));
    $('[data-rueck]', el).onclick = () => { if (!verlauf.length) return; striche = JSON.parse(verlauf.pop()); leiste(); neu(); };
    const drehen = () => { mitte(); malen(); };
    window.addEventListener('resize', drehen);
    return new Promise((fertig) => {
      const zu = (r) => { window.removeEventListener('resize', drehen); el.remove(); fertig(r); };
      $('[data-ab]', el).onclick = () => { if (geaendert && !confirm('Zeichnung verwerfen?')) return; zu(null); };
      $('[data-ok]', el).onclick = async () => {
        const r = { striche, bild: bildAus(B, striche, masstab) };
        try { await opt.onSave?.(r.striche, r.bild); } catch (e) { console.warn('Zeichnung nicht gespeichert', e); toast('Speichern hat nicht geklappt. Bitte nochmal „Fertig“ tippen.', 5000); return; }
        zu(r);
      };
      mitte(); leiste(); malen();
    });
  }

  return { oeffnen, bildAus, blatt, strich };
})();
