// Marketing: Vorher-Nachher-Video (Reel) und Instagram-Bilder direkt im Browser erzeugen.
// Kostenlos und offline: alles wird lokal auf einem Canvas gezeichnet und mit MediaRecorder aufgenommen.
// Nutzt globale Helfer aus app.js ($, $$, esc, toast, loadImg, state, firstResult, viewProjekt).

const SOCIAL_FORMATS = {
  reel: { label: 'Reel / Story (9:16)', w: 1080, h: 1920 },
  post: { label: 'Feed-Post (4:5)', w: 1080, h: 1350 },
  square: { label: 'Quadrat (1:1)', w: 1080, h: 1080 },
};
const NAVY = '#1E3550', BRASS = '#B8862F', CREAM = '#F6F1E7';
// Zeitplan des Videos in Sekunden
const T = { holdBefore: 1.8, wipe: 2.6, holdAfter: 2.0, back: 1.0, holdSplit: 1.0, end: 2.2 };
const T_WIPE = T.holdBefore, T_AFTER = T_WIPE + T.wipe, T_BACK = T_AFTER + T.holdAfter, T_SPLIT = T_BACK + T.back,
  T_END = T_SPLIT + T.holdSplit, T_TOTAL = T_END + T.end;

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** Bild „cover“ in ein Rechteck zeichnen, mit Zoom um die Mitte. */
function drawCover(ctx, img, x, y, w, h, zoom = 1) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function pill(ctx, text, x, y, align, bg, fg, size) {
  ctx.font = `700 ${size}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  const pad = size * 0.7, tw = ctx.measureText(text).width, w = tw + pad * 2, h = size * 2;
  const px = align === 'right' ? x - w : x;
  ctx.fillStyle = bg; roundRect(ctx, px, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(text, px + pad, y + h / 2 + 1);
}
function drawLogoBadge(ctx, logo, cx, cy, maxW, maxH) {
  if (!logo) return;
  const s = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
  const w = logo.naturalWidth * s, h = logo.naturalHeight * s, pad = maxH * 0.22;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  roundRect(ctx, cx - w / 2 - pad, cy - h / 2 - pad, w + 2 * pad, h + 2 * pad, pad); ctx.fill();
  ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
}

/** Layout je Format: wo liegt das Bild, wo Kopf- und Fußzeile. */
function socialLayout(W, H) {
  if (H / W > 1.5) { // Reel: Bild 4:5 in der Mitte, oben Logo, unten Text
    const ih = Math.round(W * 1.25), iy = Math.round((H - ih) / 2) - 20;
    return { img: { x: 0, y: iy, w: W, h: ih }, header: { y: iy / 2 }, footer: { y: iy + ih + (H - iy - ih) / 2 }, framed: true };
  }
  return { img: { x: 0, y: 0, w: W, h: H }, framed: false };
}

/**
 * Ein Bild des Videos zeichnen.
 * opt.t = Zeit in Sekunden; opt.still = 'split' für ein Standbild in der Vergleichsansicht.
 */
function drawSocialFrame(ctx, W, H, a, opt) {
  const { before, after, logo, pkg, company } = a;
  const L = socialLayout(W, H), R = L.img, u = W / 1080;
  const t = opt.still ? T_SPLIT : opt.t;

  // Wischposition 0 = nur Vorher, 1 = nur Nachher
  let pos;
  if (t < T_WIPE) pos = 0;
  else if (t < T_AFTER) pos = ease((t - T_WIPE) / T.wipe);
  else if (t < T_BACK) pos = 1;
  else if (t < T_SPLIT) pos = 1 - 0.5 * ease((t - T_BACK) / T.back);
  else pos = 0.5;
  const zoom = 1 + 0.06 * clamp01(t / T_END);

  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  drawCover(ctx, before, R.x, R.y, R.w, R.h, zoom);
  // Vorher links, Nachher schiebt sich von rechts herein
  const cut = R.x + R.w * (1 - pos);
  if (pos > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(cut, R.y, R.x + R.w - cut, R.h); ctx.clip();
    drawCover(ctx, after, R.x, R.y, R.w, R.h, zoom); ctx.restore();
  }
  // Leichter Verlauf oben für lesbare Beschriftung
  const g = ctx.createLinearGradient(0, R.y, 0, R.y + 220 * u);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, 220 * u);
  // Trennlinie mit Griff
  if (pos > 0.001 && pos < 0.999) {
    ctx.fillStyle = BRASS; ctx.fillRect(cut - 3 * u, R.y, 6 * u, R.h);
    ctx.beginPath(); ctx.arc(cut, R.y + R.h / 2, 30 * u, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${30 * u}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('‹ ›', cut, R.y + R.h / 2 + 1);
  }
  const fs = 30 * u, py = R.y + 36 * u;
  if (pos < 0.85) pill(ctx, 'VORHER', R.x + 36 * u, py, 'left', 'rgba(255,255,255,0.92)', NAVY, fs);
  if (pos > 0.15) pill(ctx, `NACHHER · ${pkg.name.toUpperCase()}`, R.x + R.w - 36 * u, py, 'right', BRASS, '#fff', fs);
  ctx.restore();

  // Kopf- und Fußzeile (nur Reel) bzw. Logo-Ecke (Post)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (L.framed) {
    drawLogoBadge(ctx, logo, W / 2, L.header.y, 440 * u, 150 * u);
    if (!logo) { ctx.fillStyle = '#fff'; ctx.font = `700 ${46 * u}px sans-serif`; ctx.fillText(company, W / 2, L.header.y); }
    ctx.fillStyle = '#fff'; ctx.font = `700 ${58 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(pos < 0.5 ? 'So sieht es heute aus …' : '… und so nach der Sanierung', W / 2, L.footer.y - 30 * u);
    ctx.fillStyle = BRASS; ctx.font = `600 ${36 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(`Paket ${pkg.name}`, W / 2, L.footer.y + 45 * u);
  } else if (logo) {
    drawLogoBadge(ctx, logo, W - 150 * u, H - 70 * u, 220 * u, 60 * u);
  }

  // Abspann mit Logo
  if (!opt.still && t > T_END) {
    const k = ease((t - T_END) / 0.6);
    ctx.globalAlpha = k; ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
    if (logo) {
      const s = Math.min(640 * u / logo.naturalWidth, 300 * u / logo.naturalHeight);
      const lw = logo.naturalWidth * s, lh = logo.naturalHeight * s;
      ctx.drawImage(logo, (W - lw) / 2, H / 2 - lh / 2 - 90 * u, lw, lh);
    }
    ctx.fillStyle = NAVY; ctx.font = `700 ${50 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(logo ? 'Ihre Sanierung, visualisiert.' : company, W / 2, H / 2 + 120 * u);
    ctx.fillStyle = BRASS; ctx.font = `600 ${34 * u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(logo ? company : 'Ihre Sanierung, visualisiert.', W / 2, H / 2 + 185 * u);
    ctx.globalAlpha = 1;
  }
}

function pickVideoMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const c = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return c.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

/** Video in Echtzeit aufnehmen. Liefert ein Blob (mp4 auf iPhone, sonst ggf. webm). */
async function recordSocialVideo(canvas, assets, onProgress) {
  const mime = pickVideoMime();
  if (mime === null || !canvas.captureStream) throw new Error('Dieses Gerät kann im Browser kein Video aufnehmen.');
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  drawSocialFrame(ctx, W, H, assets, { t: 0 });
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 10_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res, rej) => { rec.onstop = res; rec.onerror = (e) => rej(e.error || new Error('Aufnahme fehlgeschlagen')); });
  rec.start(250);
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawSocialFrame(ctx, W, H, assets, { t: Math.min(t, T_TOTAL) });
      onProgress?.(t / T_TOTAL);
      if (t < T_TOTAL + 0.3) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  rec.stop(); stream.getTracks().forEach((tr) => tr.stop());
  await done;
  return new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
}

async function shareFiles(files, fallbackName) {
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name || fallbackName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
}
const canvasBlob = (c, type = 'image/jpeg', q = 0.92) => new Promise((r) => c.toBlob(r, type, q));

function socialCaption(p, pkg, company) {
  const room = p.room || 'Raum';
  const tag = room.replace(/[^\wäöüÄÖÜß]/g, '');
  return `Vorher ➜ Nachher: ${room} im Paket ${pkg.name} ✨\n\n` +
    `So kann Ihr ${room} nach der Sanierung aussehen. Wir planen und setzen alles aus einer Hand um, von der Idee bis zur Übergabe.\n\n` +
    `📩 Jetzt unverbindlich anfragen: Link in der Bio.\n\n` +
    `${company}\n\n#vorhernachher #sanierung #${tag.toLowerCase()} #badsanierung #renovierung #modernisierung #interiordesign #beforeandafter\n\n` +
    `(KI-Visualisierung, unverbindliche Darstellung)`;
}

/** Ansicht: Marketing / Instagram für das aktuelle Projekt. */
async function viewSocial(p) {
  const pkgs = packagesFor(p.roomType).filter((x) => firstResult(p, x.id));
  if (!pkgs.length) { toast('Bitte zuerst eine Visualisierung erstellen.'); return; }
  const S = state.settings, company = S.company || 'DOM Projektmanagement GmbH';
  const sel = { pkg: pkgs[pkgs.length - 1].id, view: 0, fmt: 'reel' };
  const views = (id) => p.photos.map((_, i) => i).filter((i) => p.results[id]?.[i]);
  sel.view = views(sel.pkg)[0];
  const logo = S.logo ? await loadImg(S.logo).catch(() => null) : null;
  let assets = null, anim = 0, busy = false;

  setTitle('Instagram & Video');
  window.scrollTo(0, 0);
  main().innerHTML = `
    <div class="card">
      <h2>Vorher-Nachher für Social Media</h2>
      <p class="muted">Video mit Wisch-Effekt vom heutigen zum zukünftigen Raum, mit Logo und Abspann. Wird direkt auf dem Gerät erstellt, kostenlos und ohne KI-Kosten.</p>
      <label>Paket</label><select id="soPkg">${pkgs.map((x) => `<option value="${x.id}" ${x.id === sel.pkg ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <div id="soViewWrap"></div>
      <label>Format</label><select id="soFmt">${Object.entries(SOCIAL_FORMATS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select>
    </div>
    <div class="card">
      <canvas id="soCanvas" class="social-canvas"></canvas>
      <div id="soProg" class="social-prog" hidden><div></div></div>
      <button class="btn block" id="soVideo" style="margin-top:12px">🎬 Video erstellen (${Math.round(T_TOTAL)} Sek.)</button>
      <button class="btn secondary block" id="soImg" style="margin-top:10px">🖼️ Bilder für Post / Karussell</button>
      <p class="muted" style="margin-top:8px">Bilder: Vergleichsbild plus Vorher und Nachher einzeln, ideal als Karussell. Beim Teilen „Video sichern“ bzw. „Bilder sichern“ oder direkt Instagram wählen.</p>
    </div>
    <div class="card">
      <h2>Text-Vorschlag</h2>
      <textarea id="soCap" style="min-height:200px"></textarea>
      <button class="btn secondary block" id="soCopy" style="margin-top:8px">📋 Text kopieren</button>
    </div>
    <div class="card"><button class="btn secondary block" id="soBack">← Zurück zum Projekt</button></div>`;

  const canvas = $('#soCanvas'), ctx = canvas.getContext('2d');
  const pkgOf = () => packagesFor(p.roomType).find((x) => x.id === sel.pkg);
  const renderViewSelect = () => {
    const v = views(sel.pkg);
    if (!v.includes(sel.view)) sel.view = v[0];
    $('#soViewWrap').innerHTML = v.length > 1 ? `<label>Ansicht</label><select id="soView">${v.map((i) => `<option value="${i}" ${i === sel.view ? 'selected' : ''}>Ansicht ${i + 1}</option>`).join('')}</select>` : '';
    $('#soView') && ($('#soView').onchange = (e) => { sel.view = +e.target.value; load(); });
  };
  const load = async () => {
    const pkg = pkgOf();
    const [before, after] = await Promise.all([loadImg(p.photos[sel.view]), loadImg(p.results[sel.pkg][sel.view])]);
    assets = { before, after, logo, pkg, company };
    const f = SOCIAL_FORMATS[sel.fmt];
    canvas.width = f.w; canvas.height = f.h;
    $('#soCap').value = socialCaption(p, pkg, company);
    const btn = $('#soVideo'); btn.onclick = startVideo; btn.textContent = `🎬 Video erstellen (${Math.round(T_TOTAL)} Sek.)`;
  };
  // Vorschau in Endlosschleife
  const t0 = performance.now();
  const loop = () => {
    if (!canvas.isConnected) return;
    if (assets && !busy) drawSocialFrame(ctx, canvas.width, canvas.height, assets, { t: ((performance.now() - t0) / 1000) % (T_TOTAL + 0.5) });
    anim = requestAnimationFrame(loop);
  };

  $('#soPkg').onchange = (e) => { sel.pkg = e.target.value; renderViewSelect(); load(); };
  $('#soFmt').onchange = (e) => { sel.fmt = e.target.value; load(); };
  $('#soBack').onclick = () => { cancelAnimationFrame(anim); viewProjekt(); };
  $('#soCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#soCap').value); toast('Text kopiert.'); }
    catch { $('#soCap').select(); toast('Bitte Text markieren und kopieren.'); }
  };
  const base = () => `DOM_${(p.customer || 'Projekt').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${pkgOf().name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}`;

  const startVideo = async () => {
    if (busy || !assets) return;
    busy = true; const btn = $('#soVideo'), prog = $('#soProg');
    btn.disabled = true; btn.textContent = '⏺ Video wird aufgenommen …'; prog.hidden = false;
    try {
      const blob = await recordSocialVideo(canvas, assets, (k) => { prog.firstElementChild.style.width = `${Math.min(100, k * 100)}%`; });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `${base()}_${sel.fmt}.${ext}`, { type: blob.type });
      btn.textContent = '📤 Video teilen / sichern';
      btn.disabled = false;
      // Teilen braucht auf dem iPhone einen frischen Tipp, daher zweiter Schritt
      btn.onclick = () => shareFiles([file]);
      if (ext === 'webm') toast('Hinweis: Dieser Browser erzeugt WebM. Auf dem iPhone entsteht MP4 für Instagram.', 5000);
      else toast('Video fertig. Jetzt teilen oder sichern.');
    } catch (e) {
      toast('Video-Fehler: ' + e.message, 5000);
      btn.disabled = false; btn.textContent = `🎬 Video erstellen (${Math.round(T_TOTAL)} Sek.)`;
    }
    busy = false; prog.hidden = true;
  };

  $('#soImg').onclick = async () => {
    const f = SOCIAL_FORMATS[sel.fmt];
    const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
    const cx = c.getContext('2d');
    const out = [];
    drawSocialFrame(cx, f.w, f.h, assets, { still: 'split' });
    out.push(new File([await canvasBlob(c)], `${base()}_1_vergleich.jpg`, { type: 'image/jpeg' }));
    drawSocialFrame(cx, f.w, f.h, assets, { t: 0 });
    out.push(new File([await canvasBlob(c)], `${base()}_2_vorher.jpg`, { type: 'image/jpeg' }));
    drawSocialFrame(cx, f.w, f.h, assets, { t: T_AFTER + 0.5 });
    out.push(new File([await canvasBlob(c)], `${base()}_3_nachher.jpg`, { type: 'image/jpeg' }));
    await shareFiles(out);
  };

  renderViewSelect();
  await load();
  loop();
}
