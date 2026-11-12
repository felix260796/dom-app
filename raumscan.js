'use strict';
/* DOM – Raumscan: Grundriss (2D), Modell (3D), Ablegen beim Objekt, Reinzeichnen.
 * Ablauf: Scan → prüfen („Nochmal scannen“ oder „Ablegen“) → Ausgangsdateien beim Objekt (Grundriss und 3D, je mit und ohne
 * Möbel, Bilder-Ordner „Pläne“; Grundriss-PDF in w.dokumente) → Reinzeichnen über zeichnen.js als neue Fassung daneben.
 * Kein Senden im Raumscan: geteilt wird aus der abgelegten Datei.
 * Daten je Projekt in w.vorOrt.scans[]: { id, name, t, laenge, breite, hoehe, flaeche, tueren, fenster, raumId, geo,
 *   abgelegt: { t, ordner, grundMit, grundOhne, dreiMit, dreiOhne (Bild-IDs), masstab (Bildpunkte je m), pdf } }.
 * geo kommt aus DomGeraet.swift (RoomPlan): waende [{x1,z1,x2,z2,h}], oeffnungen [{art,x,z,a,b,h,u}], objekte [{k,x,z,a,b,h,t,u}], boden [[x,z]], boeden [[[x,z]]].
 * Ganze Wohnung: Scan mit ganz: true, geo aus StructureBuilder, dazu geo.namen [{ text, x, z, m2 }] für die Raumnamen im Plan.
 * Alles in Metern, von oben gesehen. Ältere Scans ohne geo werden als Rechteck aus Länge und Breite gezeichnet.
 * zeichnung (nur ältere Scans aus v87): Striche in Metern, werden nur noch in der kleinen Vorschau gezeigt. */
window.Raumscan = (() => {
  const MOEBEL = { storage: 'Schrank', refrigerator: 'Kühlschrank', stove: 'Herd', bed: 'Bett', sink: 'Waschbecken', washerDryer: 'Waschmaschine', toilet: 'WC', bathtub: 'Badewanne', oven: 'Backofen', dishwasher: 'Spülmaschine', table: 'Tisch', sofa: 'Sofa', chair: 'Stuhl', fireplace: 'Kamin', television: 'Fernseher', stairs: 'Treppe' };
  const FARBEN = [['#c0392b', 'Rot'], ['#1f6fb2', 'Blau'], ['#1e3550', 'Dunkel'], ['#2e8b57', 'Grün']];
  const NAVY = '#1e3550', BRASS = '#b08d57';
  const zahl = (x, d = 2) => (+x || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const moebelName = (k) => MOEBEL[k] || 'Objekt';

  // ---------- Raum und Raumtyp ----------
  /** Raumtyp aus dem Namen, sonst aus den erkannten Möbeln. */
  function typFuer(scan) {
    const n = String(scan?.name || '').toLowerCase();
    const nachName = ROOM_TYPES.find((r) => n && (r.name.toLowerCase() === n || r.name.toLowerCase().split(/[ /]+/).some((t) => t.length > 3 && n.includes(t))));
    if (nachName) return nachName.id;
    const regeln = [[/bad|dusch/, 'bad'], [/wc|toilette/, 'gaeste-wc'], [/küche|kueche/, 'kueche'], [/wohn/, 'wohnzimmer'], [/schlaf/, 'schlafzimmer'], [/kind/, 'kinderzimmer'], [/flur|diele|gang/, 'flur'], [/treppe/, 'treppenhaus'], [/heiz|technik/, 'heizraum']];
    const r = regeln.find(([re]) => re.test(n));
    if (r) return r[1];
    const art = { bathroom: 'bad', kitchen: 'kueche', bedroom: 'schlafzimmer', livingRoom: 'wohnzimmer', diningRoom: 'wohnzimmer' }[scan?.art];
    if (art) return art;
    const k = new Set((scan?.geo?.objekte || []).map((o) => o.k));
    if (k.has('bathtub') || (k.has('toilet') && k.has('sink'))) return 'bad';
    if (k.has('toilet')) return 'gaeste-wc';
    if (k.has('stove') || k.has('oven') || k.has('refrigerator') || k.has('dishwasher')) return 'kueche';
    if (k.has('bed')) return 'schlafzimmer';
    if (k.has('sofa') || k.has('television')) return 'wohnzimmer';
    return 'sonstiges';
  }
  /** Erkannte Möbel als kurzer Text, z. B. „WC, Badewanne, Waschbecken“. */
  const erkannt = (scan) => [...new Set((scan?.geo?.objekte || []).map((o) => moebelName(o.k)))].join(', ');
  const raumName = (r) => (r.room || roomType(r.roomType).name || '').trim().toLowerCase();
  /** Raum im Projekt, zu dem der Scan gehört (verknüpft oder gleicher Name). */
  const raumFuer = (scan, list) => list.find((r) => r.id === scan.raumId) || list.find((r) => raumName(r) === String(scan.name || '').trim().toLowerCase());
  /** Scans, zu denen es im Projekt noch keinen Raum gibt. */
  const offene = (w, list) => (w.vorOrt?.scans || []).filter((s) => !s.ganz && !raumFuer(s, list));
  /** Einträge für „Welcher Raum?“: gescannte Räume zuerst, value 'scan:<id>'. */
  const sheetEintraege = (w, list) => offene(w, list).map((s) => ({ label: s.name, sub: `Aus dem Raumscan, ${zahl(s.flaeche > 0 ? s.flaeche : s.laenge * s.breite)} m², Maße kommen mit`, icon: icon('ruler'), value: 'scan:' + s.id }));
  const scanVon = (w, v) => (typeof v === 'string' && v.startsWith('scan:') ? (w.vorOrt?.scans || []).find((s) => s.id === v.slice(5)) : null);
  /** Maße des Scans ins Aufmaß des Raums (Angebot) schreiben und verknüpfen. p = Raum (project:<id>). */
  function masseIn(p, scan) {
    const A = window.Angebot?._intern; if (!A) return;
    A.init(p);
    const r = p.aufmass.raeume[0];
    const rechteck = scan.laenge * scan.breite;
    A.uebernimmSchaetzung(r, { ...scan, genauigkeit_prozent: null,
      begruendung: scan.flaeche > 0 && rechteck > 0 && scan.flaeche < rechteck * 0.92 ? `Gescannte Bodenfläche ${zahl(scan.flaeche)} m², das Rechteck ist ${zahl(rechteck)} m². Der Raum ist also nicht rechteckig.` : '' });
    r.schaetzung.quelle = 'lidar';
    // Echter Umfang aus den gescannten Wänden (stimmt auch bei L-Form und Nischen)
    if (scan.geo?.waende?.length) { const u = kennzahlen(scan, plan(scan)).umfang; if (u > 0) r.umfang = zahl(u); }
    r.scanId = scan.id;
    scan.raumId = p.id;
  }

  /** Scan „ganze Wohnung“ aus den einzelnen Räumen (gleiche Koordinaten) und dem Gesamtgrundriss von RoomPlan. */
  function wohnungAus(raeume, gesamt, name) {
    const mitte = (g) => { const p = (g?.waende || []).flatMap((w) => [[w.x1, w.z1], [w.x2, w.z2]]); return p.length ? [p.reduce((n, q) => n + q[0], 0) / p.length, p.reduce((n, q) => n + q[1], 0) / p.length] : [0, 0]; };
    const geo = gesamt?.waende?.length ? { ...gesamt } : {
      waende: raeume.flatMap((r) => r.geo?.waende || []), oeffnungen: raeume.flatMap((r) => r.geo?.oeffnungen || []),
      objekte: raeume.flatMap((r) => r.geo?.objekte || []), boden: [], boeden: raeume.flatMap((r) => r.geo?.boeden?.length ? r.geo.boeden : r.geo?.boden?.length ? [r.geo.boden] : []) };
    geo.namen = raeume.map((r) => { const [x, z] = mitte(r.geo); return { text: r.name, x, z, m2: r.flaeche > 0 ? r.flaeche : r.laenge * r.breite }; });
    const p = geo.waende.flatMap((w) => [[w.x1, w.z1], [w.x2, w.z2]]);
    const ausd = (i) => Math.max(...p.map((q) => q[i])) - Math.min(...p.map((q) => q[i]));
    const l = p.length ? ausd(0) : 0, b = p.length ? ausd(1) : 0;
    return { id: uid(), name, ganz: true, t: Date.now(), laenge: Math.round(Math.max(l, b) * 100) / 100, breite: Math.round(Math.min(l, b) * 100) / 100,
      hoehe: Math.max(0, ...raeume.map((r) => +r.hoehe || 0)), flaeche: Math.round(raeume.reduce((n, r) => n + (r.flaeche > 0 ? r.flaeche : r.laenge * r.breite), 0) * 100) / 100,
      raeume: raeume.map((r) => r.id), tueren: [], fenster: [], geo };
  }

  // ---------- Geometrie ----------
  /** Grundriss-Daten: längste Wand waagerecht, links oben bei 0/0. */
  function plan(scan) {
    let g = scan.geo;
    if (!g?.waende?.length) {
      const l = +scan.laenge || 3, b = +scan.breite || 3, h = +scan.hoehe || 2.5;
      g = { waende: [{ x1: 0, z1: 0, x2: l, z2: 0, h }, { x1: l, z1: 0, x2: l, z2: b, h }, { x1: l, z1: b, x2: 0, z2: b, h }, { x1: 0, z1: b, x2: 0, z2: 0, h }], oeffnungen: [], objekte: [], boden: [[0, 0], [l, 0], [l, b], [0, b]] };
    }
    let a0 = 0, max = -1;
    for (const w of g.waende) { const l = Math.hypot(w.x2 - w.x1, w.z2 - w.z1); if (l > max) { max = l; a0 = Math.atan2(w.z2 - w.z1, w.x2 - w.x1); } }
    const c = Math.cos(-a0), s = Math.sin(-a0);
    const rot = (x, z) => [x * c - z * s, x * s + z * c];
    const W = g.waende.map((w) => ({ a: rot(w.x1, w.z1), b: rot(w.x2, w.z2), h: +w.h || 0 }));
    const O = (g.oeffnungen || []).map((o) => { const [x, z] = rot(o.x, o.z); return { ...o, x, z, a: (o.a || 0) - a0 }; });
    const M = (g.objekte || []).map((o) => { const [x, z] = rot(o.x, o.z); return { ...o, x, z, a: (o.a || 0) - a0 }; });
    const polys = (g.boeden?.length ? g.boeden : g.boden?.length ? [g.boden] : []).map((pl) => pl.map(([x, z]) => rot(x, z)));
    const B = polys.flat();
    const L = (g.namen || []).map((n) => { const [x, z] = rot(n.x, n.z); return { ...n, x, z }; });
    const pts = [...W.flatMap((w) => [w.a, w.b]), ...B];
    const minX = Math.min(...pts.map((p) => p[0])), minZ = Math.min(...pts.map((p) => p[1]));
    const sh = ([x, z]) => [x - minX, z - minZ];
    W.forEach((w) => { w.a = sh(w.a); w.b = sh(w.b); });
    O.forEach((o) => { [o.x, o.z] = sh([o.x, o.z]); });
    M.forEach((o) => { [o.x, o.z] = sh([o.x, o.z]); });
    const boden = B.map(sh);
    const boeden = polys.map((pl) => pl.map(sh));
    L.forEach((n) => { [n.x, n.z] = sh([n.x, n.z]); });
    const alle = [...W.flatMap((w) => [w.a, w.b]), ...boden];
    const breite = Math.max(...alle.map((p) => p[0])), tiefe = Math.max(...alle.map((p) => p[1]));
    const mitte = [W.reduce((n, w) => n + w.a[0] + w.b[0], 0) / (2 * W.length), W.reduce((n, w) => n + w.a[1] + w.b[1], 0) / (2 * W.length)];
    const hoehe = Math.max(+scan.hoehe || 0, ...W.map((w) => w.h));
    return { W, O, M, boden, boeden, L, breite, tiefe, mitte, hoehe };
  }
  /** Wand, auf der eine Öffnung sitzt, und ihre Lage auf der Wand (t = Abstand vom Wandanfang). */
  function wandVon(P, o) {
    let best = null;
    for (const w of P.W) {
      const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], l = Math.hypot(dx, dz); if (!l) continue;
      const t = ((o.x - w.a[0]) * dx + (o.z - w.a[1]) * dz) / l;
      const d = Math.abs((o.x - w.a[0]) * dz - (o.z - w.a[1]) * dx) / l;
      if (t < -0.2 || t > l + 0.2) continue;
      if (!best || d < best.d) best = { w, t, d, l };
    }
    return best && best.d < 0.4 ? best : null;
  }
  /** Zahlen für die Infozeile: Wandfläche ohne Türen und Fenster, Umfang. */
  function kennzahlen(scan, P) {
    const umfang = P.W.reduce((n, w) => n + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0);
    const brutto = P.W.reduce((n, w) => n + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) * (w.h || P.hoehe), 0);
    const oeff = P.O.reduce((n, o) => n + (o.b || 0) * (o.h || 0), 0);
    return { umfang, wand: Math.max(0, brutto - oeff), boden: scan.flaeche > 0 ? scan.flaeche : (scan.laenge || 0) * (scan.breite || 0) };
  }

  // ---------- Zeichnen (Bildschirm, Vorschau, PDF) ----------
  /** v = { s: Pixel je Meter, ox, oy }. opt = { moebel, masse, zeichnung, aktiv } */
  function zeichne(ctx, P, v, opt = {}) {
    const X = (x) => v.ox + x * v.s, Y = (z) => v.oy + z * v.s;
    const px = (m) => m * v.s;
    const k = opt.k || 1; // Schriften und Linien größer fürs PDF
    const wd = Math.max(3 * k, px(0.12));
    ctx.lineJoin = 'round';
    // Boden
    const bodenPkt = P.boeden.length ? P.boeden : null;
    ctx.fillStyle = '#f4f1ea';
    for (const pl of P.boeden) { ctx.beginPath(); pl.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)))); ctx.closePath(); ctx.fill(); }
    // Möbel
    if (opt.moebel !== false) {
      const fs = Math.max(9 * k, Math.min(14 * k, px(0.14)));
      for (const o of P.M) {
        ctx.save(); ctx.translate(X(o.x), Y(o.z)); ctx.rotate(o.a);
        ctx.fillStyle = 'rgba(176,141,87,.16)'; ctx.strokeStyle = BRASS; ctx.lineWidth = 1.2 * k;
        ctx.fillRect(-px(o.b) / 2, -px(o.t) / 2, px(o.b), px(o.t)); ctx.strokeRect(-px(o.b) / 2, -px(o.t) / 2, px(o.b), px(o.t));
        ctx.restore();
        if (px(Math.min(o.b, o.t)) > fs * 1.2) { ctx.fillStyle = '#7a6440'; ctx.font = `${fs}px -apple-system, Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(moebelName(o.k), X(o.x), Y(o.z)); }
      }
    }
    // Wände
    ctx.strokeStyle = NAVY; ctx.lineWidth = wd; ctx.lineCap = 'square';
    for (const w of P.W) { ctx.beginPath(); ctx.moveTo(X(w.a[0]), Y(w.a[1])); ctx.lineTo(X(w.b[0]), Y(w.b[1])); ctx.stroke(); }
    // Türen, Fenster, Durchgänge
    ctx.lineCap = 'butt';
    for (const o of P.O) {
      const ww = wandVon(P, o);
      const ux = ww ? (ww.w.b[0] - ww.w.a[0]) / ww.l : Math.cos(o.a), uz = ww ? (ww.w.b[1] - ww.w.a[1]) / ww.l : Math.sin(o.a);
      const cx = ww ? ww.w.a[0] + ux * ww.t : o.x, cz = ww ? ww.w.a[1] + uz * ww.t : o.z;
      const h = (o.b || 0.8) / 2;
      const p1 = [cx - ux * h, cz - uz * h], p2 = [cx + ux * h, cz + uz * h];
      ctx.strokeStyle = bodenPkt ? '#f4f1ea' : '#fff'; ctx.lineWidth = wd + 2 * k;
      ctx.beginPath(); ctx.moveTo(X(p1[0]), Y(p1[1])); ctx.lineTo(X(p2[0]), Y(p2[1])); ctx.stroke();
      // Seite zum Raum hin
      let nx = -uz, nz = ux;
      if ((P.mitte[0] - cx) * nx + (P.mitte[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
      if (o.art === 'fenster') {
        ctx.strokeStyle = '#1f6fb2'; ctx.lineWidth = 1.5 * k;
        for (const f of [-0.4, 0, 0.4]) { const d = wd / v.s * f; ctx.beginPath(); ctx.moveTo(X(p1[0] + nx * d), Y(p1[1] + nz * d)); ctx.lineTo(X(p2[0] + nx * d), Y(p2[1] + nz * d)); ctx.stroke(); }
      } else if (o.art === 'tuer') {
        const b = o.b || 0.8;
        ctx.strokeStyle = NAVY; ctx.lineWidth = 1.5 * k;
        ctx.beginPath(); ctx.moveTo(X(p1[0]), Y(p1[1])); ctx.lineTo(X(p1[0] + nx * b), Y(p1[1] + nz * b)); ctx.stroke();
        const a1 = Math.atan2(uz, ux), a2 = Math.atan2(nz, nx);
        let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        ctx.setLineDash([4 * k, 3 * k]); ctx.beginPath(); ctx.arc(X(p1[0]), Y(p1[1]), px(b), a1, a2, d < 0); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = NAVY; ctx.lineWidth = k;
        for (const p of [p1, p2]) { ctx.beginPath(); ctx.moveTo(X(p[0] - nx * 0.08), Y(p[1] - nz * 0.08)); ctx.lineTo(X(p[0] + nx * 0.08), Y(p[1] + nz * 0.08)); ctx.stroke(); }
      }
    }
    // Maße an den Wänden (außen)
    if (opt.masse !== false) {
      const fs = Math.max(10 * k, Math.min(15 * k, px(0.16)));
      ctx.font = `600 ${fs}px -apple-system, Helvetica, Arial, sans-serif`; ctx.fillStyle = NAVY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const w of P.W) {
        const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], l = Math.hypot(dx, dz);
        if (l < 0.25 || px(l) < fs * 2.2) continue;
        let nx = -dz / l, nz = dx / l;
        const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
        if ((P.mitte[0] - mx) * nx + (P.mitte[1] - mz) * nz > 0) { nx = -nx; nz = -nz; }
        const ab = wd / 2 + fs * 0.9;
        let a = Math.atan2(dz, dx); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
        ctx.save(); ctx.translate(X(mx) + nx * ab, Y(mz) + nz * ab); ctx.rotate(a); ctx.fillText(zahl(l), 0, 0); ctx.restore();
      }
    }
    // Raumnamen mit Fläche (ganze Wohnung)
    if (P.L.length) {
      const fs = Math.max(11 * k, Math.min(17 * k, px(0.2)));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = NAVY;
      for (const n of P.L) {
        ctx.font = `700 ${fs}px -apple-system, Helvetica, Arial, sans-serif`; ctx.fillText(n.text, X(n.x), Y(n.z) - (n.m2 > 0 ? fs * 0.55 : 0));
        if (n.m2 > 0) { ctx.font = `${fs * 0.85}px -apple-system, Helvetica, Arial, sans-serif`; ctx.fillText(zahl(n.m2) + ' m²', X(n.x), Y(n.z) + fs * 0.55); }
      }
    }
    // Eigene Zeichnung
    if (opt.zeichnung !== false) for (const z of [...(opt.striche || []), ...(opt.aktiv ? [opt.aktiv] : [])]) strich(ctx, z, X, Y, px);
  }
  function strich(ctx, z, X, Y, px) {
    ctx.strokeStyle = ctx.fillStyle = z.f || FARBEN[0][0];
    ctx.lineWidth = Math.max(1.5, px(0.025)); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = z.p || [];
    if (z.art === 'text') {
      const fs = Math.max(11, px(0.2));
      ctx.font = `600 ${fs}px -apple-system, Helvetica, Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (p[0]) ctx.fillText(z.text || '', X(p[0][0]), Y(p[0][1]));
      return;
    }
    if (p.length < 2) return;
    ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
    if (z.art === 'mass') {
      const [a, b] = [p[0], p[p.length - 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!l) return;
      const nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l, t = 0.08;
      for (const q of [a, b]) { ctx.beginPath(); ctx.moveTo(X(q[0] - nx * t), Y(q[1] - nz * t)); ctx.lineTo(X(q[0] + nx * t), Y(q[1] + nz * t)); ctx.stroke(); }
      const fs = Math.max(11, px(0.17));
      ctx.font = `700 ${fs}px -apple-system, Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save(); ctx.translate(X((a[0] + b[0]) / 2), Y((a[1] + b[1]) / 2)); ctx.rotate(ang); ctx.fillText(zahl(l) + ' m', 0, -3); ctx.restore();
    }
  }
  /** Ansicht so wählen, dass der ganze Raum mit Rand ins Bild passt. */
  function passend(P, w, h, rand = 44) {
    const s = Math.min((w - 2 * rand) / Math.max(P.breite, 0.5), (h - 2 * rand) / Math.max(P.tiefe, 0.5));
    return { s, ox: (w - P.breite * s) / 2, oy: (h - P.tiefe * s) / 2 };
  }
  /** Kleines Vorschaubild (für die Liste im Projekt). */
  function vorschau(canvas, scan) {
    const r = devicePixelRatio || 1, w = canvas.clientWidth || 64, h = canvas.clientHeight || 64;
    canvas.width = w * r; canvas.height = h * r;
    const ctx = canvas.getContext('2d'); ctx.scale(r, r);
    const P = plan(scan);
    zeichne(ctx, P, passend(P, w, h, 6), { masse: false, moebel: true, striche: scan.zeichnung });
  }

  // ---------- Ansicht ----------
  /** Vollbild: Grundriss oder 3D, Möbel ein/aus, Maße. Verschieben und zoomen mit den Fingern.
   * pruefen: direkt nach dem Scan, nur „Nochmal scannen“ oder „Ablegen“ (Ergebnis 'neu' | 'ablegen' | null).
   * Sonst: „Reinzeichnen“ (neue Fassung neben dem abgelegten Original) und für ältere Scans „Ablegen“. Kein Senden hier:
   * geteilt wird später aus der abgelegten Datei (Bilder-Ordner „Pläne“ oder Dokumente des Projekts). */
  function ansicht(w, scan, { pruefen = false } = {}) {
    const P = plan(scan), kz = kennzahlen(scan, P);
    const st = { modus: 'plan', moebel: true, masse: true };
    const el = document.createElement('div');
    el.className = 'rs';
    const info = [`${zahl(scan.laenge)} × ${zahl(scan.breite)} m`, kz.boden > 0 && `Boden ${zahl(kz.boden)} m²`, P.hoehe > 0 && `${zahl(P.hoehe)} m hoch`, kz.wand > 0 && `Wände ${zahl(kz.wand)} m² ohne Türen und Fenster`, `Umfang ${zahl(kz.umfang)} m`].filter(Boolean).join(' · ');
    const mb = erkannt(scan);
    const ab = scan.abgelegt;
    const ordner = ordnerName();
    const fuss = pruefen
      ? `<p class="hint"><b>Passt der Scan?</b> Beim Ablegen kommen Grundriss und 3D-Modell${P.M.length ? ', je mit und ohne Möbel,' : ''} in den Ordner „${esc(ordner)}“ beim Objekt, dazu der Grundriss als PDF.</p>
        <div class="rs-knoepfe"><button type="button" class="btn secondary" data-neu>Nochmal scannen</button><button type="button" class="btn" data-ablegen>Ablegen</button></div>`
      : `<div class="rs-knoepfe"><button type="button" class="btn" data-zeichnen>${icon('edit')} Reinzeichnen</button>${ab ? '' : `<button type="button" class="btn secondary" data-ablegen>Ablegen</button>`}</div>
        <p class="hint">${ab ? `Abgelegt am ${new Date(ab.t).toLocaleDateString('de-DE')} im Ordner „${esc(ab.ordner || ordner)}“ beim Objekt. Reinzeichnen legt eine neue Fassung daneben, das Original bleibt. Teilen geht aus dem Ordner.` : 'Noch nicht beim Objekt abgelegt.'}</p>`;
    el.innerHTML = `
      <div class="rs-h"><b>${esc(pruefen ? `Scan prüfen: ${scan.name || 'Raum'}` : scan.name)}</b><button type="button" class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
      <div class="rs-leiste">
        <div class="seg"><button type="button" data-modus="plan" class="on">Grundriss</button><button type="button" data-modus="3d">3D-Modell</button></div>
        <label class="chk" ${P.M.length ? '' : 'hidden'}><input type="checkbox" data-moebel checked> Möbel</label>
        <label class="chk" data-nurplan><input type="checkbox" data-masse checked> Maße</label>
      </div>
      <div class="rs-b"><canvas class="rs-c"></canvas><div class="rs-3d" hidden></div></div>
      <div class="rs-fuss">
        <p class="hint">${esc(info)}${mb ? `<br>Erkannt: ${esc(mb)}` : ''}${scan.geo ? '' : '<br>Älterer Scan: nur Länge und Breite, ohne Türen und Fenster.'}</p>
        ${fuss}
      </div>`;
    document.body.appendChild(el);
    const cv = $('.rs-c', el), box = $('.rs-b', el);
    let v = null, cw = 0, ch = 0;
    const male = () => {
      const ctx = cv.getContext('2d'), r = devicePixelRatio || 1;
      ctx.setTransform(r, 0, 0, r, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
      zeichne(ctx, P, v, { moebel: st.moebel, masse: st.masse });
    };
    const groesse = () => {
      const r = devicePixelRatio || 1; cw = box.clientWidth; ch = box.clientHeight;
      if (!cw || !ch) return;
      cv.width = cw * r; cv.height = ch * r; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
      if (!v) v = passend(P, cw, ch);
      male();
    };
    const ro = new ResizeObserver(() => groesse()); ro.observe(box);
    let drei = null;

    // Grundriss: mit einem Finger verschieben, mit zwei zoomen
    const pt = new Map();
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); pt.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
    cv.onpointermove = (e) => {
      const alt = pt.get(e.pointerId); if (!alt) return;
      const neu = { x: e.clientX, y: e.clientY };
      const andere = [...pt.entries()].filter(([id]) => id !== e.pointerId);
      if (andere.length) {
        const q = andere[0][1];
        const d0 = Math.hypot(alt.x - q.x, alt.y - q.y), d1 = Math.hypot(neu.x - q.x, neu.y - q.y);
        const b = cv.getBoundingClientRect(), mx = (neu.x + q.x) / 2 - b.left, my = (neu.y + q.y) / 2 - b.top;
        const f = d0 > 0 ? Math.min(2, Math.max(0.5, d1 / d0)) : 1;
        v.ox = mx - (mx - v.ox) * f - (alt.x - neu.x) / 2; v.oy = my - (my - v.oy) * f - (alt.y - neu.y) / 2; v.s *= f;
      } else { v.ox += neu.x - alt.x; v.oy += neu.y - alt.y; }
      pt.set(e.pointerId, neu); male();
    };
    cv.onpointerup = cv.onpointercancel = (e) => pt.delete(e.pointerId);
    cv.onwheel = (e) => { e.preventDefault(); const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, f = e.deltaY < 0 ? 1.12 : 1 / 1.12; v.ox = mx - (mx - v.ox) * f; v.oy = my - (my - v.oy) * f; v.s *= f; male(); };
    cv.ondblclick = () => { v = passend(P, cw, ch); male(); };

    $$('[data-modus]', el).forEach((b) => (b.onclick = async () => {
      st.modus = b.dataset.modus;
      $$('[data-modus]', el).forEach((x) => x.classList.toggle('on', x === b));
      const d3 = st.modus === '3d';
      cv.hidden = d3; $('.rs-3d', el).hidden = !d3; $('[data-nurplan]', el).hidden = d3;
      if (d3 && !drei) { try { drei = await modell($('.rs-3d', el), P, scan); drei.moebel(st.moebel); } catch (e) { toast('Das 3D-Modell ging nicht: ' + (e.message || e), 6000); } }
      if (!d3) groesse();
    }));
    $('[data-moebel]', el).onchange = (e) => { st.moebel = e.target.checked; male(); drei?.moebel(st.moebel); };
    $('[data-masse]', el).onchange = (e) => { st.masse = e.target.checked; male(); };
    groesse();

    return new Promise((fertig) => {
      const zu = (r) => { ro.disconnect(); drei?.weg(); el.remove(); fertig(r); };
      $('[data-x]', el).onclick = () => { if (pruefen && !confirm('Scan verwerfen? Er wird nicht gespeichert.')) return; zu(null); };
      if (pruefen) {
        $('[data-neu]', el).onclick = () => zu('neu');
        $('[data-ablegen]', el).onclick = () => zu('ablegen');
        return;
      }
      const ablegenKnopf = $('[data-ablegen]', el);
      if (ablegenKnopf) ablegenKnopf.onclick = async () => {
        ablegenKnopf.disabled = true;
        try { if (await ausgangAblegen(w, scan)) { zu(null); ansicht(w, scan); } } catch (e) { console.error(e); toast('Ablegen ging nicht: ' + (e.message || e), 6000); }
        if (ablegenKnopf.isConnected) ablegenKnopf.disabled = false;
      };
      $('[data-zeichnen]', el).onclick = async () => {
        const b = $('[data-zeichnen]', el); b.disabled = true;
        el.style.display = 'none'; // das Zeichenwerkzeug liegt darunter
        try { await reinzeichnen(w, scan, { drei: st.modus === '3d', moebel: st.moebel || !P.M.length }); } catch (e) { console.error(e); toast('Zeichnen ging nicht: ' + (e.message || e), 6000); }
        el.style.display = ''; b.disabled = false;
      };
    });
  }
  /** Gespeicherten Scan ansehen. */
  async function ansehen(w, scanId) {
    const scan = (w.vorOrt?.scans || []).find((s) => s.id === scanId);
    if (scan) await ansicht(w, scan);
  }
  /** Direkt nach dem Scan: 'ablegen', 'neu' (nochmal scannen) oder null (verworfen). */
  const pruefen = (w, scan) => ansicht(w, scan, { pruefen: true });

  /** Reinzeichnen über das gemeinsame Zeichenwerkzeug (zeichnen.js) auf dem abgelegten Original.
   * Das Original bleibt; die Zeichnung kommt als neues Bild „… (bearbeitet)“ in denselben Ordner und kann in den
   * Bildern weitergezeichnet werden (b.zeichnung = { von, striche }). */
  async function reinzeichnen(w, scan, { drei = false, moebel = true } = {}) {
    if (!window.Zeichnen) return toast('Das Zeichenwerkzeug fehlt.');
    if (!scan.abgelegt && !(await ausgangAblegen(w, scan))) return;
    const ab = scan.abgelegt;
    const id = drei ? (moebel ? ab.dreiMit : ab.dreiOhne) || ab.dreiMit || ab.dreiOhne : (moebel ? ab.grundMit : ab.grundOhne) || ab.grundMit || ab.grundOhne;
    let grund = id && (await kvGet('bild:' + id));
    if (!grund) { // Original wurde in den Bildern gelöscht: neu erzeugen, aber nicht ablegen
      grund = drei ? await dreiBild(scan, moebel) : grundrissBild(scan, moebel).data;
    }
    const titel = `${drei ? '3D-Modell' : 'Grundriss'} ${scan.name}${P_hatMoebel(scan) ? (moebel ? ' mit Möbeln' : ' ohne Möbel') : ''}`;
    const k = window.Kunden?.byId(w.kundeId);
    const r = await Zeichnen.oeffnen(grund, { titel: `${titel}: reinzeichnen`, striche: [], masstab: drei ? 0 : ab.masstab || 0, onSave: async (striche, bild) => {
      await Bilder.ablegen(k.id, w.objektId, bild, ab.ordner || ordnerName(), w.id, { text: `${titel} (bearbeitet)`, zeichnung: { von: id, striche, ...(drei ? {} : { masstab: ab.masstab || 0 }) } });
    } });
    if (r) toast(`Neue Fassung „${titel} (bearbeitet)“ abgelegt, das Original bleibt`, 4000);
  }
  const P_hatMoebel = (scan) => (scan.geo?.objekte || []).length > 0;

  // ---------- 3D-Modell (three.js, wird erst bei Bedarf geladen) ----------
  const laden = (src) => new Promise((ok, f) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => f(new Error('Datei fehlt: ' + src)); document.head.appendChild(s); });
  async function dreiLaden() {
    if (!window.THREE) await laden('vendor/three/three.min.js');
    if (!THREE.OrbitControls) await laden('vendor/three/OrbitControls.js');
  }
  async function modell(box, P, scan, opt = {}) {
    await dreiLaden();
    const T = THREE;
    const szene = new T.Scene(); szene.background = new T.Color('#f6f4ef');
    const w = box.clientWidth || 300, h = box.clientHeight || 300;
    const kamera = new T.PerspectiveCamera(50, w / h, 0.05, 200);
    const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opt.bild });
    r.setPixelRatio(opt.bild ? 1 : Math.min(2, devicePixelRatio || 1)); r.setSize(w, h);
    box.appendChild(r.domElement);
    szene.add(new T.AmbientLight(0xffffff, 0.75));
    const licht = new T.DirectionalLight(0xffffff, 0.55); licht.position.set(3, 8, 5); szene.add(licht);
    const H = P.hoehe || 2.5;
    const matWand = new T.MeshLambertMaterial({ color: 0xebe6dc });
    const kante = new T.LineBasicMaterial({ color: 0x1e3550 });
    const kasten = (b, hh, t, mat, x, y, z, a, mitKante = true, gruppe = szene) => {
      const g = new T.BoxGeometry(Math.max(b, 0.01), Math.max(hh, 0.01), Math.max(t, 0.01));
      const m = new T.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = -a; gruppe.add(m);
      if (mitKante) { const l = new T.LineSegments(new T.EdgesGeometry(g), kante); l.position.copy(m.position); l.rotation.copy(m.rotation); gruppe.add(l); }
      return m;
    };
    // Boden
    const matBoden = new T.MeshLambertMaterial({ color: 0xd9cfbf, side: T.DoubleSide });
    for (const umriss of P.boeden.length ? P.boeden : [[[0, 0], [P.breite, 0], [P.breite, P.tiefe], [0, P.tiefe]]]) {
      const boden = new T.Mesh(new T.ShapeGeometry(new T.Shape(umriss.map(([x, z]) => new T.Vector2(x, -z)))), matBoden);
      boden.rotation.x = -Math.PI / 2; szene.add(boden);
    }
    // Wände mit Aussparungen für Türen und Fenster
    const zuWand = new Map();
    for (const o of P.O) { const ww = wandVon(P, o); if (ww) { if (!zuWand.has(ww.w)) zuWand.set(ww.w, []); zuWand.get(ww.w).push({ o, t: ww.t }); } }
    const matGlas = new T.MeshLambertMaterial({ color: 0x7fb3e0, transparent: true, opacity: 0.45 });
    const matTuer = new T.MeshLambertMaterial({ color: 0xb08d57, transparent: true, opacity: 0.55 });
    for (const wnd of P.W) {
      const dx = wnd.b[0] - wnd.a[0], dz = wnd.b[1] - wnd.a[1], L = Math.hypot(dx, dz); if (!L) continue;
      const ux = dx / L, uz = dz / L, a = Math.atan2(dz, dx), hw = wnd.h || H, d = 0.1;
      const teil = (t1, t2, y1, y2, mat = matWand) => { if (t2 - t1 < 0.01 || y2 - y1 < 0.01) return; const tm = (t1 + t2) / 2; kasten(t2 - t1, y2 - y1, d, mat, wnd.a[0] + ux * tm, (y1 + y2) / 2, wnd.a[1] + uz * tm, a); };
      const loecher = (zuWand.get(wnd) || []).map(({ o, t }) => ({ o, t1: Math.max(0, t - o.b / 2), t2: Math.min(L, t + o.b / 2) })).sort((x, y) => x.t1 - y.t1);
      let pos = 0;
      for (const l of loecher) {
        if (l.t1 > pos) teil(pos, l.t1, 0, hw);
        const u = Math.max(0, l.o.u || 0), oben = Math.min(hw, u + (l.o.h || 0));
        teil(l.t1, l.t2, 0, u); teil(l.t1, l.t2, oben, hw);
        const tm = (l.t1 + l.t2) / 2;
        if (l.o.art === 'fenster') kasten(l.t2 - l.t1, oben - u, 0.02, matGlas, wnd.a[0] + ux * tm, (u + oben) / 2, wnd.a[1] + uz * tm, a, false);
        if (l.o.art === 'tuer') kasten(l.t2 - l.t1, oben - u, 0.03, matTuer, wnd.a[0] + ux * tm, (u + oben) / 2, wnd.a[1] + uz * tm, a, false);
        pos = Math.max(pos, l.t2);
      }
      if (pos < L) teil(pos, L, 0, hw);
    }
    // Möbel
    const moebel = new T.Group(); szene.add(moebel);
    const matM = new T.MeshLambertMaterial({ color: 0xcdb48a });
    const matWeiss = new T.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (const o of P.M) kasten(o.b, o.h, o.t, ['toilet', 'sink', 'bathtub', 'refrigerator', 'washerDryer', 'dishwasher', 'oven', 'stove'].includes(o.k) ? matWeiss : matM, o.x, (o.u || 0) + o.h / 2, o.z, o.a, true, moebel);
    // Kamera schräg von oben auf die Raummitte
    const [mx, mz] = P.mitte, gr = Math.max(P.breite, P.tiefe, 2);
    const nah = opt.bild ? 0.85 : 1; // im abgelegten Bild füllt der Raum das Bild besser
    kamera.position.set(mx + gr * 0.55 * nah, H * 0.35 + (H * 0.65 + gr * 1.7) * nah, mz + gr * 0.95 * nah);
    const ctl = new T.OrbitControls(kamera, r.domElement);
    ctl.target.set(mx, H * 0.35, mz); ctl.maxPolarAngle = Math.PI * 0.49; ctl.minDistance = 0.5; ctl.maxDistance = 40; ctl.enableDamping = false;
    const male = () => r.render(szene, kamera);
    ctl.addEventListener('change', male); ctl.update(); male();
    const ro = new ResizeObserver(() => { const w2 = box.clientWidth, h2 = box.clientHeight; if (!w2 || !h2) return; kamera.aspect = w2 / h2; kamera.updateProjectionMatrix(); r.setSize(w2, h2); male(); });
    ro.observe(box);
    return {
      moebel(an) { moebel.visible = an; male(); },
      bild() { male(); return r.domElement.toDataURL('image/jpeg', 0.9); },
      weg() { ro.disconnect(); ctl.dispose(); r.dispose(); r.forceContextLoss?.(); },
    };
  }

  // ---------- Beim Objekt ablegen ----------
  const ordnerName = () => String(vorgabe('ordnerPlaene') || 'Pläne').trim() || 'Pläne';
  const dateiName = (s) => String(s).replace(/[^\wäöüÄÖÜß-]+/g, '_');
  /** Grundriss als JPEG mit Überschrift. masstab = Bildpunkte je Meter (für das Werkzeug „Maß“ beim Reinzeichnen). */
  function grundrissBild(scan, moebel, titel) {
    const P = plan(scan);
    const s = Math.min(2400 / Math.max(P.breite, 0.5), 1700 / Math.max(P.tiefe, 0.5)), r = 90;
    const cv = document.createElement('canvas'); cv.width = Math.round(P.breite * s + 2 * r); cv.height = Math.round(P.tiefe * s + 2 * r + 60);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = NAVY; ctx.font = '700 34px -apple-system, Helvetica, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(titel || `Grundriss ${scan.name}`, 24, 20);
    zeichne(ctx, P, { s, ox: r, oy: r + 60 }, { moebel, masse: true, k: 2 });
    return { data: cv.toDataURL('image/jpeg', 0.9), masstab: s };
  }
  /** 3D-Modell als Bild, schräg von oben (gleiche Ansicht wie beim Öffnen). */
  async function dreiBild(scan, moebel) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-5000px;top:0;width:1600px;height:1200px';
    document.body.appendChild(box);
    try {
      const m = await modell(box, plan(scan), scan, { bild: true });
      m.moebel(moebel);
      const data = m.bild();
      m.weg();
      return data;
    } finally { box.remove(); }
  }
  /** Die Ausgangsdateien beim Objekt ablegen: Grundriss und 3D-Modell, je mit und ohne Möbel (ohne Möbel im Raum nur je eins),
   * im Bilder-Ordner „Pläne“ (Vorgabe ordnerPlaene), dazu der Grundriss als PDF in den Dokumenten des Projekts.
   * Die Originale werden nie verändert; Reinzeichnen legt eine neue Fassung daneben. Merkt sich die Bild-IDs in scan.abgelegt. */
  async function ausgangAblegen(w, scan, still = false) {
    const k = window.Kunden?.byId(w.kundeId);
    if (!k) { if (!still) toast('Bitte zuerst einen Kunden zuordnen.'); return false; }
    const P = plan(scan), mitM = P.M.length > 0, ordner = ordnerName();
    const ab = { t: Date.now(), ordner };
    const dazu = async (feld, titel, data) => {
      const bildId = uid();
      await Bilder.ablegen(k.id, w.objektId, data, ordner, w.id, { text: titel, bildId, masstab: feld.startsWith('grund') ? ab.masstab : 0 });
      ab[feld] = bildId;
    };
    const varianten = mitM ? [[true, ' mit Möbeln', 'Mit'], [false, ' ohne Möbel', 'Ohne']] : [[false, '', 'Ohne']];
    for (const [m, zusatz, f] of varianten) {
      const titel = `Grundriss ${scan.name}${zusatz}`, g = grundrissBild(scan, m, titel);
      ab.masstab = g.masstab;
      await dazu('grund' + f, titel, g.data);
    }
    let drei = true;
    for (const [m, zusatz, f] of varianten) {
      try { await dazu('drei' + f, `3D-Modell ${scan.name}${zusatz}`, await dreiBild(scan, m)); } catch (e) { console.warn('3D-Bild', e); drei = false; }
    }
    if (!mitM) { ab.grundMit = ab.grundOhne; ab.dreiMit = ab.dreiOhne; }
    // Grundriss als PDF (eine Seite je Variante) in die Dokumente des Projekts
    try {
      const doc = await pdfDoc(w, scan, varianten.map(([m]) => m));
      const name = `Grundriss_${dateiName(scan.name)}.pdf`, key = 'wdok:' + w.id + ':' + name;
      await kvSet(key, doc.output('datauristring'));
      w.dokumente = [...(w.dokumente || []).filter((d) => d.key !== key), { key, name, t: Date.now(), art: 'grundriss' }];
      ab.pdf = key;
    } catch (e) { console.warn('Grundriss-PDF', e); }
    scan.abgelegt = ab;
    await window.Projekt.save(w);
    if (!still) toast(`${scan.name}: ${varianten.length * (drei ? 2 : 1)} Bilder im Ordner „${ordner}“ beim Objekt${ab.pdf ? ', PDF bei den Dokumenten' : ''}`, 4500);
    return true;
  }

  // ---------- PDF ----------
  /** Grundriss als PDF (A4 quer) in einem üblichen Maßstab, mit Kopf, Infozeile und Hinweis; eine Seite je Möbel-Variante. */
  async function pdfDoc(w, scan, varianten = [true]) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const P = plan(scan), kz = kennzahlen(scan, P);
    const W = 297, H = 210, M = 14, kopf = 26, fuss = 22;
    const fw = W - 2 * M, fh = H - kopf - fuss - M;
    // Maßstab: der größte übliche, bei dem der Raum mit Rand passt
    const raum = Math.max(P.breite / fw, P.tiefe / fh) * 1000; // mm Papier → nötiger Maßstab
    const massstab = [20, 25, 50, 75, 100, 150, 200, 250, 500].find((n) => n >= raum * 1.15) || Math.ceil(raum * 1.15);
    const mmJeM = 1000 / massstab;
    const aufl = 8; // Pixel je mm
    const S = state.settings || {};
    for (const [i, moebel] of varianten.entries()) {
      if (i) doc.addPage();
      const cv = document.createElement('canvas'); cv.width = fw * aufl; cv.height = fh * aufl;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      const s = mmJeM * aufl;
      zeichne(ctx, P, { s, ox: (cv.width - P.breite * s) / 2, oy: (cv.height - P.tiefe * s) / 2 }, { moebel, masse: true, k: aufl * 0.3 });
      if (S.logo) { try { await addFit(doc, S.logo, W - M - 40, 8, 40, 14, /^data:image\/png/.test(S.logo) ? 'PNG' : 'JPEG'); } catch {} }
      doc.setTextColor(30, 53, 80); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(`Grundriss ${scan.name}${P.M.length ? (moebel ? ' mit Möbeln' : ' ohne Möbel') : ''}`, M, 15);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90);
      doc.text([w.customer, w.address].filter(Boolean).join(' · ') || '', M, 21);
      doc.addImage(cv.toDataURL('image/png'), 'PNG', M, kopf, fw, fh, undefined, 'FAST');
      // Maßstabsleiste 1 m
      const y = H - fuss + 2;
      doc.setDrawColor(30, 53, 80); doc.setLineWidth(0.5); doc.line(M, y, M + mmJeM, y); doc.line(M, y - 1.5, M, y + 1.5); doc.line(M + mmJeM, y - 1.5, M + mmJeM, y + 1.5);
      doc.setFontSize(8.5); doc.setTextColor(30, 53, 80); doc.text(`1 m · Maßstab 1:${massstab} (A4)`, M + mmJeM + 3, y + 1);
      doc.setTextColor(90);
      doc.text([`${zahl(scan.laenge)} × ${zahl(scan.breite)} m`, kz.boden > 0 && `Boden ${zahl(kz.boden)} m²`, P.hoehe > 0 && `Höhe ${zahl(P.hoehe)} m`, kz.wand > 0 && `Wände ${zahl(kz.wand)} m² ohne Türen und Fenster`].filter(Boolean).join('   ·   '), M, y + 7);
      doc.setFontSize(8); doc.text(`${vorgabe('grundrissHinweis')}  Stand ${new Date(scan.t || Date.now()).toLocaleDateString('de-DE')}`, M, y + 12);
    }
    return doc;
  }

  return { ansehen, pruefen, vorschau, plan, typFuer, erkannt, raumFuer, offene, sheetEintraege, scanVon, masseIn, ausgangAblegen, wohnungAus, MOEBEL };
})();
