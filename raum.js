'use strict';
/* DOM – Raum-Ansicht: Fotos, Pakete, KI-Ergebnis, Moodboard nur für diesen Raum, Ergebnis-Karten.
 * viewProjekt ist zugleich der Verteiler für die Reiter Kunden/Projekte/Angebote (siehe switchTab in app.js).
 * Baut auf core.js und app.js (header, main, icon, sheet) auf. */

// ---------- Raum ----------
const uiOpen = { more: false };
async function viewProjekt() {
  const p = normalizeProject(state.project);
  if (!p) return state.wohnung ? Projekt.view() : state.tab === 'kunden' ? Kunden.start() : Auftraege.view();
  const w = state.wohnung;
  const rt = roomType(p.roomType);
  const backToProject = () => { state.project = null; viewProjekt(); window.scrollTo(0, 0); };
  header(p.room || rt.name, [w?.customer || p.customer, rt.name].filter(Boolean).join(' · '), { label: w ? 'Auftrag' : state.tab === 'kunden' ? 'Kunde' : 'Aufträge', fn: backToProject });
  const pkgs = roomPackages(p);
  const full = p.photos.length >= MAX_PHOTOS;
  const visible = pkgs.filter((x) => firstResult(p, x.id) || Object.keys(p.status || {}).some((k) => k.startsWith(x.id + ':') && (p.status[k].loading || p.status[k].error)));
  const nImg = viewCount(p) * p.selected.length;
  const marks = window.Baumappe?.anzahl(p) || 0;
  const am = p.aufmass?.raeume || [], qm = am.reduce((s, r) => s + (window.Angebot?._intern.masse(r).boden || 0), 0);
  main().innerHTML = `
    <div class="card room-head">
      <span class="rh-ico">${roomIcon(rt.id)}</span>
      <div class="rh-f">
        <input type="text" id="room" class="title-in" value="${esc(p.room)}" placeholder="${esc(rt.name)}" aria-label="Raumtitel">
        <select id="roomType" aria-label="Raumtyp">${ROOM_TYPES.map((r) => `<option value="${r.id}" ${r.id === p.roomType ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      </div>
    </div>

    <section class="step">
      <div class="step-h"><span class="num">1</span><h2>Fotos</h2><span class="step-x">${p.photos.length} von ${MAX_PHOTOS}</span></div>
      <div class="card">
        <div class="photos">${p.photos.map((ph, i) => `
          <div class="ph ${renderIdx(p).includes(i) ? '' : 'ph-off'}"><img src="${ph}" alt="Ansicht ${i + 1}"><span class="ph-n">${i + 1}</span><button class="ph-x" data-delphoto="${i}" aria-label="Foto entfernen">${icon('x')}</button>
            ${p.photos.length > 1 ? `<button class="ph-view" data-view="${i}">${renderIdx(p).includes(i) ? `${icon('check')} Nachher` : 'nur Info'}</button>` : ''}</div>`).join('')}
          ${full ? '' : `<button class="ph-add" id="cam">${icon('camera')}<span>Kamera</span></button><button class="ph-add" id="gal">${icon('image')}<span>Fotos</span></button>`}
        </div>
        <p class="hint">${p.photos.length > 1 ? 'Die KI nutzt alle Fotos, um den Raum zu verstehen. Ein Nachher-Bild gibt es nur für die Fotos mit Haken. Tippe unten aufs Foto, um das zu ändern.' : p.photos.length ? 'Weitere Blickwinkel helfen der KI, den Raum zu verstehen.' : 'Am besten quer und aus den Ecken fotografieren, bis zu 4 Blickwinkel.'}</p>
        ${p.photos.length && !rt.outdoor && rt.id !== 'garten' ? `<label class="toggle"><input type="checkbox" id="withTop" ${wantsTop(p) ? 'checked' : ''}><span class="tg"></span><span>Draufsicht: der neue Raum von oben</span></label>` : ''}
        ${rt.outdoor ? '' : `<div id="masseBox"><label>Raummaße in Metern (damit die KI weiß, wie groß der Raum ist)</label>
        <div class="row masse-row">${[['l', 'Länge'], ['b', 'Breite'], ['h', 'Höhe']].map(([k, l]) => `<input type="text" inputmode="decimal" data-mass="${k}" placeholder="${l}" aria-label="${l} in m" value="${esc(p.masse?.[k] || '')}">`).join('')}</div>
        ${aufmassText(p) && !raumMasse(p) ? '<p class="hint">Maße aus dem Aufmaß werden verwendet.</p>' : ''}</div>`}
      </div>
    </section>

    <section class="step">
      <div class="step-h"><span class="num">2</span><h2>Pakete</h2></div>
      <div class="card">
        <div class="chips">${pkgs.map((x) => `<button class="chip ${p.selected.includes(x.id) ? 'on' : ''}" data-sel="${x.id}" style="--c:${x.color}">${icon('check', 'chip-ck')}${esc(x.name)}</button>`).join('')}</div>
        <button class="btn secondary block small" id="raumBoard" style="margin:2px 0 10px">${icon('palette')} ${p.boards?.length && p.boardsType === p.roomType ? 'Moodboard dieses Raums (angepasst)' : 'Moodboard für diesen Raum anpassen'}</button>
        <label class="toggle"><input type="checkbox" id="withEvening" ${p.withEvening ? 'checked' : ''}><span class="tg"></span><span>${icon('moon')} Zusätzlich Abendstimmung</span></label>
        <details class="more" id="more" ${uiOpen.more ? 'open' : ''}>
          <summary>${icon('mic')}<span>Hinweise & Kundenwünsche<small>${[p.note?.trim() && 'Hinweis', p.wishes?.trim() && 'Wünsche', p.transcript?.trim() && 'Gespräch'].filter(Boolean).join(' · ') || 'optional'}</small></span>${icon('chevron', 'more-chev')}</summary>
          <label>Hinweis für die KI</label><textarea id="note" placeholder="${esc(rt.id === 'garten' ? 'z. B. Terrasse vergrößern, Wärmepumpe links neben die Tür' : 'z. B. Badewanne raus, dafür große Dusche')}">${esc(p.note)}</textarea>
          ${p.bestand?.text && !window.Garten?.zustaendig(p) ? `<label>So hat die KI den Raum erkannt</label><p class="hint" style="margin-top:0">Daran hält sich die Visualisierung. Stimmt etwas nicht (z. B. Maße, WC vorhanden ja/nein), hier korrigieren.</p><textarea id="bestand" style="min-height:140px">${esc(p.bestand.text)}</textarea>` : ''}
          ${voiceCard(p)}
        </details>
        <div id="garten-card"></div>
        <button class="btn big block" id="go" ${p.photos.length && p.selected.length ? '' : 'disabled'}>${icon('sparkle')} Visualisieren</button>
        <p class="hint center" id="goInfo">${p.photos.length ? `${nImg} ${nImg === 1 ? 'Bild' : 'Bilder'}${p.withEvening ? ' + Abendstimmung' : ''} · ca. 10–30 Sekunden pro Bild` : 'Zuerst ein Foto machen.'}</p>
      </div>
    </section>

    <section class="step">
      <div class="step-h"><span class="num">3</span><h2>Ergebnis</h2></div>
      <div id="results">${visible.length ? visible.map(resultCard).join('') : `<div class="card empty-res">${icon('sparkle')}<span>Hier erscheinen die Nachher-Bilder. Mit dem Regler vergleichst du Vorher und Nachher.</span></div>`}</div>
      <button class="btn secondary block" id="toMappe" ${hasAnyResult(p) && w ? '' : 'hidden'}>${icon('book')} Zur Kundenmappe</button>
    </section>

    <section class="step" hidden><!-- vorerst ausgeblendet (Wunsch Felix): Angebot direkt aus der Visualisierung, Markierungen für Mappen. Angebot jetzt über Schritt 2 „Büro“ im Angebot -->
      <div class="step-h"><span class="num">4</span><h2>Weiter mit diesem Raum</h2></div>
      <div class="tiles">
        <button class="tile" id="toAngebot"><span class="t-ico">${icon('ruler')}</span><b>Aufmaß & Angebot</b><span>${qm ? `${qm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} m²${p.angebot?.nr ? ' · Nr. ' + esc(p.angebot.nr) : ''}` : 'Maße, Preise, Bauzeit'}</span></button>
        <button class="tile" id="toMarks" ${hasAnyResult(p) ? '' : 'disabled'}><span class="t-ico">${icon('pin')}</span><b>Markierungen</b><span>${marks ? `${marks} für die Baumappe` : 'Nummern für die Baumappe'}</span></button>
      </div>
    </section>
    <button class="link-danger" id="del">${icon('trash')} Raum löschen</button>`;

  const persist = debounce(() => saveProject(p), 400);
  const rerender = async () => { await saveProject(p); const y = window.scrollY; await viewProjekt(); window.scrollTo(0, y); };
  const addPhotos = async (camera) => {
    const files = await pickFiles({ camera, multiple: !camera });
    if (!files.length) return;
    const free = MAX_PHOTOS - p.photos.length;
    for (const f of files.slice(0, free)) p.photos.push(await resize(await fileToDataUrl(f), 1600));
    if (files.length > free) toast(`Maximal ${MAX_PHOTOS} Fotos pro Raum.`);
    p.thumb = await resize(p.photos[0], 240);
    rerender();
  };
  if ($('#cam')) { $('#cam').onclick = () => addPhotos(true); $('#gal').onclick = () => addPhotos(false); }
  $$('[data-delphoto]').forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.delphoto;
    if (Object.values(p.results).some((a) => a[i]) && !loeschFrage('Foto mit den zugehörigen Nachher-Bildern entfernen?')) return;
    p.photos.splice(i, 1);
    if (Array.isArray(p.views?.on)) p.views.on = p.views.on.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k));
    for (const k of Object.keys(p.results)) p.results[k].splice(i, 1);
    for (const k of Object.keys(p.evening || {})) p.evening[k].splice(i, 1);
    window.Baumappe?.fotoEntfernt(p, i);
    p.thumb = p.photos[0] ? await resize(p.photos[0], 240) : '';
    rerender();
  }));
  $('#room').oninput = (e) => { p.room = e.target.value; persist(); $('#title').textContent = p.room || rt.name; };
  $('#roomType').onchange = async (e) => {
    const old = roomType(p.roomType).name;
    p.roomType = e.target.value;
    delete p.boards; delete p.boardsType;
    if (!p.room || p.room === old) p.room = roomType(p.roomType).name;
    p.selected = roomPackages(p).map((x) => x.id);
    rerender();
  };
  $('#note').oninput = (e) => { p.note = e.target.value; persist(); };
  $$('[data-mass]').forEach((inp) => (inp.oninput = () => { p.masse = { ...(p.masse || {}), [inp.dataset.mass]: inp.value.trim() }; persist(); }));
  if ($('#bestand')) $('#bestand').oninput = (e) => { Object.assign(p.bestand, { text: e.target.value, manual: true, photos: p.photos.length, masse: masseText(p) }); persist(); };
  $('#more').ontoggle = (e) => { uiOpen.more = e.target.open; };
  const updGoInfo = () => {
    const n = viewCount(p) * p.selected.length;
    $('#go').disabled = !n;
    if (p.photos.length) $('#goInfo').textContent = n ? `${n} ${n === 1 ? 'Bild' : 'Bilder'}${p.withEvening ? ' + Abendstimmung' : ''} · ca. 10–30 Sekunden pro Bild` : 'Bitte mindestens ein Paket wählen.';
  };
  $('#raumBoard').onclick = () => { viewRaumMoodboard(p); window.scrollTo(0, 0); };
  $('#withEvening').onchange = (e) => { p.withEvening = e.target.checked; persist(); updGoInfo(); };
  if ($('#withTop')) $('#withTop').onchange = (e) => { p.views = { ...(p.views || {}), top: e.target.checked }; persist(); updGoInfo(); };
  $$('[data-view]').forEach((b) => (b.onclick = () => {
    const i = +b.dataset.view, on = new Set(renderIdx(p));
    on.has(i) ? on.delete(i) : on.add(i);
    if (!on.size) return toast('Mindestens ein Foto braucht ein Nachher-Bild.');
    p.views = { ...(p.views || {}), on: [...on].sort() };
    rerender();
  }));
  $$('[data-sel]').forEach((c) => (c.onclick = () => {
    c.classList.toggle('on');
    p.selected = $$('[data-sel]').filter((x) => x.classList.contains('on')).map((x) => x.dataset.sel);
    persist(); updGoInfo();
  }));
  bindVoice(p, persist);
  $('#go').onclick = async () => {
    if (!state.settings.apiKey) return toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000);
    const done = roomPackages(p).filter((x) => p.selected.includes(x.id) && firstResult(p, x.id));
    if (!rt.outdoor && !raumMasse(p) && !aufmassText(p) && !p.masseSkip) {
      if (confirm('Noch keine Raummaße eingetragen. Mit Länge, Breite und Höhe hält sich die KI viel besser an die echte Raumgröße.\n\nOK = Maße jetzt eingeben\nAbbrechen = ohne Maße weiter')) {
        $('#masseBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => $('[data-mass="l"]')?.focus(), 300); return;
      }
      p.masseSkip = true; persist();
    }
    if (done.length && !confirm(`${done.map((x) => x.name).join(', ')} ${done.length === 1 ? 'ist' : 'sind'} schon fertig und ${done.length === 1 ? 'wird' : 'werden'} neu erstellt. Weiter?`)) return;
    setTimeout(() => $('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    runAll(p);
  };
  $('#toMappe').onclick = () => w && Projekt.mappeView(w);
  $('#toAngebot').onclick = () => { state.angebotAusProjekt = false; window.Angebot?.ansicht(p); };
  $('#toMarks').onclick = () => window.Baumappe?.markierungen(p);
  // Social Media (social.js) wird nicht gebraucht (Felix, 7.11.2026); Kachel entfernt, Datei bleibt liegen
  if ($('#social')) $('#social').onclick = () => viewSocial(p).catch((e) => toast('Fehler: ' + e.message, 5000));
  $('#del').onclick = async () => {
    if (!loeschFrage(`Raum „${p.room || rt.name}“ mit Fotos und Visualisierungen löschen?`)) return;
    await deleteProject(p.id);
    if (p.wohnungId) await window.Projekt?.raumEntfernt(p);
    backToProject();
  };
  bindResultButtons(p);
  window.Garten?.projektKarte(p, persist);
}

// ---------- Moodboard nur für diesen Raum ----------
const raumEigenes = (p) => (Array.isArray(p.boards) && p.boards.length && p.boardsType === p.roomType ? p.boards : null);
/** Kopie anlegen, sobald im Raum etwas geändert wird (Vorlage: Projekt-Moodboard bzw. allgemeines). */
function raumKopie(p) {
  if (!raumEigenes(p)) { p.boards = JSON.parse(JSON.stringify(packagesFor(p.roomType))); p.boardsType = p.roomType; }
  return p.boards;
}
function viewRaumMoodboard(p) {
  const own = raumEigenes(p), pkgs = roomPackages(p), rn = p.room || roomType(p.roomType).name;
  const kunde = state.wohnung?.customer || p.customer;
  const back = () => { viewProjekt(); window.scrollTo(0, 0); };
  header('Moodboard', [kunde, rn].filter(Boolean).join(' · '), { label: rn, fn: back });
  main().innerHTML = `
    <div class="card intro"><p>${own
      ? `Dieses Moodboard gilt <b>nur für ${esc(rn)}</b>${kunde ? ` bei ${esc(kunde)}` : ''}. Visualisierung, Kundenmappe, Baumappe und Angebot dieses Raums nutzen es.`
      : `Hier steht noch das Moodboard ${state.wohnung?.boards?.[p.roomType]?.length ? 'des Projekts' : 'aus deinen Standard-Moodboards'}. Tippe auf ein Paket und ändere Texte, Bilder oder Produkte. Die Änderung gilt <b>nur für ${esc(rn)}</b>.`}</p></div>
    <div class="pkgs">${pkgs.map((x) => `
      <button class="pkgcard" data-edit="${x.id}" style="--c:${x.color}">
        <span class="pk-thumbs">${x.images.slice(0, 3).map((im) => `<img src="${im.data}" alt="">`).join('') || `<span class="pk-empty">${icon('palette')}</span>`}</span>
        <span class="pk-t"><b><i></i>${esc(x.name)}</b><span>${esc(x.fields.beschreibung || '')}</span>
          <small>${x.images.length} ${x.images.length === 1 ? 'Bild' : 'Bilder'} · ${x.products.length} ${x.products.length === 1 ? 'Produkt' : 'Produkte'}</small></span>
        ${icon('chevron', 'pc-chev')}
      </button>`).join('')}</div>
    ${own ? `<p class="hint">Nach einer Änderung den Raum neu visualisieren, damit die Bilder zum Moodboard passen.</p>
      <button class="link-danger" id="rbReset">${icon('refresh')} Anpassungen dieses Raums verwerfen</button>` : ''}`;
  $$('[data-edit]').forEach((el) => (el.onclick = () => {
    const list = raumKopie(p);
    viewPaketEdit(el.dataset.edit, {
      rt: p.roomType, list, save: () => saveProject(p), saveSoon: debounce(() => saveProject(p), 500),
      sub: `${rn} · nur für diesen Raum`, backLabel: 'Moodboard',
      banner: `<div class="notice" style="margin:0 0 12px">${icon('palette')}<span>Änderungen gelten nur für <b>${esc(rn)}</b>${kunde ? ` bei ${esc(kunde)}` : ''}. Andere Räume und deine Standard-Moodboards bleiben, wie sie sind.</span></div>`,
      back: async () => { await saveProject(p); viewRaumMoodboard(p); window.scrollTo(0, 0); },
    });
    window.scrollTo(0, 0);
  }));
  if ($('#rbReset')) $('#rbReset').onclick = async () => {
    if (!loeschFrage(`Die Moodboard-Anpassungen für ${rn} verwerfen?`)) return;
    delete p.boards; delete p.boardsType; await saveProject(p); viewRaumMoodboard(p);
  };
}

// ---------- Ergebnis-Karten ----------
function resultCard(pkg) {
  const p = state.project;
  const shown = p.photos.map((_, i) => i).filter((i) => p.results[pkg.id]?.[i] || p.status?.[`${pkg.id}:${i}`]?.loading || p.status?.[`${pkg.id}:${i}`]?.error);
  const multi = shown.length > 1 || !!(topOf(p, pkg.id) || p.status?.[`${pkg.id}:top`]);
  const views = shown.map((i) => {
    const key = `${pkg.id}:${i}`;
    const st = p.status?.[key], res = p.results[pkg.id]?.[i];
    const eve = eveningOf(p, pkg.id, i), est = p.status?.[key + ':abend'];
    const mood = moodSel[`${p.id}:${key}`] === 'abend' && (eve || est?.loading || est?.error) ? 'abend' : 'tag';
    let body;
    if (st?.loading) body = `<div class="status"><div class="spinner"></div>KI gestaltet „${esc(pkg.name)}“${multi ? `, Ansicht ${i + 1}` : ''} …</div>`;
    else if (st?.error) body = `<div class="status err">${esc(st.error)}</div>`;
    else if (res) {
      if (mood === 'abend' && est?.loading) body = `<div class="status"><div class="spinner"></div>KI setzt das Licht auf Abend …</div>`;
      else if (mood === 'abend' && est?.error && !eve) body = `<div class="status err">${esc(est.error)}</div>`;
      else body = beforeAfter(p.photos[i], mood === 'abend' ? eve : res, `Nachher ${pkg.name}`);
    } else body = '<div class="status">Noch nicht erstellt</div>';
    const moodBar = res && !st?.loading ? `<div class="mood"><button data-mood="tag" data-pkg="${pkg.id}" data-view="${i}" class="${mood === 'tag' ? 'on' : ''}">${icon('sun')} Tag</button><button data-mood="abend" data-pkg="${pkg.id}" data-view="${i}" class="${mood === 'abend' ? 'on' : ''}">${icon('moon')} Abend${eve || est?.loading ? '' : ' +'}</button></div>` : '<span></span>';
    const actions = [mood === 'abend' && (eve || est?.error) && !est?.loading ? `<button class="mini" data-redoeve="${pkg.id}" data-view="${i}">Abend neu</button>` : '',
      (res || st?.error) && !st?.loading ? `<button class="mini" data-redo="${pkg.id}" data-view="${i}">${icon('refresh')} Neu</button>` : ''].join('');
    return `<div class="rview">${multi ? `<div class="rv-n">Ansicht ${i + 1}</div>` : ''}<div class="rv-body">${body}</div><div class="rv-bar">${moodBar}<span class="rv-act">${actions}</span></div></div>`;
  }).join('') + topCard(p, pkg);
  return `<div class="result" id="res-${pkg.id}" style="--c:${pkg.color}">
    <div class="r-head"><span class="r-name"><i></i>${esc(pkg.name)}</span><span class="r-desc">${esc(pkg.fields?.beschreibung || '')}</span></div>
    ${views}
  </div>`;
}
function topCard(p, pkg) {
  const st = p.status?.[`${pkg.id}:top`], img = topOf(p, pkg.id);
  if (!img && !st?.loading && !st?.error) return '';
  const body = st?.loading ? `<div class="status"><div class="spinner"></div>KI zeichnet die Draufsicht …</div>`
    : st?.error ? `<div class="status err">${esc(st.error)}</div>`
    : `<img class="top-img" src="${img}" alt="Draufsicht ${esc(pkg.name)}">`;
  return `<div class="rview"><div class="rv-n">Draufsicht</div><div class="rv-body">${body}</div><div class="rv-bar"><span></span><span class="rv-act">${st?.loading ? '' : `<button class="mini" data-redotop="${pkg.id}">${icon('refresh')} Neu</button>`}</span></div></div>`;
}
function refreshResult(pkg) {
  const p = state.project;
  if (!$('#results')) return;
  const el = $('#res-' + pkg.id);
  $('.empty-res')?.remove();
  if (!el) {
    // in Paket-Reihenfolge einfügen
    const order = roomPackages(p).map((x) => x.id);
    const next = $$('#results .result').find((r) => order.indexOf(r.id.slice(4)) > order.indexOf(pkg.id));
    if (next) next.insertAdjacentHTML('beforebegin', resultCard(pkg)); else $('#results').insertAdjacentHTML('beforeend', resultCard(pkg));
  } else el.outerHTML = resultCard(pkg);
  bindResultButtons(p);
  const any = hasAnyResult(p);
  if ($('#toMappe')) $('#toMappe').hidden = !any || !state.wohnung;
  for (const id of ['#social', '#toMarks']) if ($(id)) $(id).disabled = !any;
}
function bindResultButtons(p) {
  const pk = (id) => roomPackages(p).find((x) => x.id === id);
  $$('[data-redo]').forEach((b) => (b.onclick = async () => { await window.voiceReady?.(p); runView(p, pk(b.dataset.redo), +b.dataset.view); }));
  $$('[data-mood]').forEach((b) => (b.onclick = () => {
    const pkg = pk(b.dataset.pkg), i = +b.dataset.view;
    moodSel[`${p.id}:${pkg.id}:${i}`] = b.dataset.mood;
    if (b.dataset.mood === 'abend' && !eveningOf(p, pkg.id, i) && !p.status?.[`${pkg.id}:${i}:abend`]?.loading) {
      if (!state.settings.apiKey) return toast('Bitte zuerst in den Einstellungen den API-Schlüssel eintragen.', 4000);
      runEvening(p, pkg, i);
    } else refreshResult(pkg);
  }));
  $$('[data-redotop]').forEach((b) => (b.onclick = async () => { await window.voiceReady?.(p); runTop(p, pk(b.dataset.redotop)); }));
  $$('[data-redoeve]').forEach((b) => (b.onclick = () => runEvening(p, pk(b.dataset.redoeve), +b.dataset.view)));
}

