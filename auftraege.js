'use strict';
/* DOM – Reiter „Aufträge“ (seit Version 75): alles von der Anfrage bis zur Rechnung in einer Liste.
 * Ein Auftrag läuft durch diese Stufen (Status aus projekt.js, Projekt.ALLE):
 *   Angebot (vor Ort, im Büro) › Verschickt › Zugesagt › Baustelle › Abrechnen › Bezahlt  (dazu Abgesagt)
 * Oben stehen die Stufen mit Anzahl, darunter die Aufträge. „Alle offenen“ zeigt alles, was noch läuft, nach Stufe sortiert.
 * Öffnen führt in den Auftrag (Projekt.view): bis zur Zusage die Angebotsseite, danach die Projektmappe.
 * Ersetzt die früheren Reiter „Projekte“ und „Angebote“ (angebote.js bleibt für Angebote.oeffnen). */
window.Auftraege = (() => {
  // [id, Name in der Leiste, Status, Untertitel]
  const STUFEN = [
    ['angebot', 'Angebot', ['besichtigung', 'entwurf'], 'Vor Ort aufnehmen, im Büro ausarbeiten'],
    ['verschickt', 'Verschickt', ['angebot'], 'Beim Kunden, nachfassen'],
    ['zugesagt', 'Zugesagt', ['geplant'], 'Baustart planen'],
    ['baustelle', 'Baustelle', [''], 'Läuft gerade'],
    ['abrechnen', 'Abrechnen', ['fertig', 'rechnung'], 'Fertig gebaut, Rechnung stellen oder offen'],
    ['bezahlt', 'Bezahlt', ['bezahlt'], 'Erledigt'],
    ['abgesagt', 'Abgesagt', ['abgesagt'], 'Nicht beauftragt'],
  ];
  const OFFEN = ['angebot', 'verschickt', 'zugesagt', 'baustelle', 'abrechnen'];
  let stufe = '', suche = '';
  const stufeVon = (st) => (STUFEN.find((s) => s[2].includes(Projekt.norm(st))) || STUFEN[3])[0];
  const eur = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';

  /** Summe brutto der Raum-Angebote (nur für Aufträge vor der Zusage, sonst unnötig langsam). */
  async function summe(x) {
    const w = await kvGet('wohnung:' + x.id);
    if (!w?.rooms?.length) return 0;
    const A = window.Angebot._intern;
    let s = 0;
    for (const id of w.rooms) {
      const r = await kvGet('project:' + id);
      if (r?.angebot?.positionen?.length) { try { s += A.summen(r.angebot.positionen, r.angebot.kalk).brutto; } catch {} }
    }
    return s;
  }

  const karte = (x, sum) => {
    const st = Projekt.norm(x.status), k = Kunden.byId(x.kundeId), wer = Kunden.name(k) || x.customer || '';
    const ort = projektOrt(x);
    const tage = Projekt.seitTagen(x.versendetAm);
    return `<button class="pcard" data-au="${x.id}">
      ${x.thumb ? `<img src="${x.thumb}" alt="">` : `<span class="pc-ph">${icon(['besichtigung', 'entwurf', 'angebot'].includes(st) ? 'euro' : 'home')}</span>`}
      <span class="pc-t"><b>${esc(x.titel || x.room || 'Auftrag')}</b>${Projekt.pill(x.status)}
        ${wer ? `<span class="muted pc-wer">${icon('user')}${esc(wer)}</span>` : ''}
        ${ort ? `<span class="muted pc-wo">${icon('map')}${esc(ort)}</span>` : ''}
        ${st === 'angebot' && tage >= Projekt.nachfassen() ? `<span class="nachfassen">Seit ${tage} Tagen beim Kunden, nachfassen</span>` : ''}
        ${st === 'geplant' ? `<span class="muted">${x.baustart ? `Baustart ${esc(new Date(x.baustart + 'T12:00').toLocaleDateString('de-DE'))}` : 'Baustart noch offen'}</span>` : ''}
        ${x.fort && st === '' ? `<span class="bf-mini">${Fortschritt.balken(x.fort)}</span>` : ''}
        ${x.absage ? `<span class="muted">Grund: ${esc(x.absage)}</span>` : ''}
        ${sum !== undefined ? `<span class="ang-sum">${sum ? eur(sum) + ' brutto' : '<span class="muted">noch keine Positionen</span>'}</span>` : ''}</span>
      ${icon('chevron', 'pc-chev')}</button>`;
  };

  async function view() {
    state.project = null; state.wohnung = null;
    header('Aufträge', state.settings.company || '');
    const alle = await projectIndex();
    try { await window.Angebot._intern.preisliste(); } catch {}
    const reihe = Projekt.ALLE.map((s) => s[0]);
    const q = suche.trim().toLowerCase();
    const hay = (x) => { const k = Kunden.byId(x.kundeId); return `${x.nr || ''} ${x.titel || ''} ${x.customer || ''} ${x.address || ''} ${x.room || ''} ${k ? `${k.nr} ${k.telefon} ${k.email} ${k.privat}` : ''}`.toLowerCase(); };
    const passt = (x) => !q || q.split(/\s+/).every((t) => hay(x).includes(t));
    const anzahl = (id) => alle.filter((x) => stufeVon(x.status) === id).length;
    // Mit Suche: über alle Stufen suchen. Sonst: gewählte Stufe oder alle offenen.
    const sichtbar = alle.filter((x) => passt(x) && (q ? true : stufe ? stufeVon(x.status) === stufe : OFFEN.includes(stufeVon(x.status))))
      .sort((a, b) => reihe.indexOf(Projekt.norm(a.status)) - reihe.indexOf(Projekt.norm(b.status)) || (b.updated || 0) - (a.updated || 0));
    const mitSumme = new Set(['besichtigung', 'entwurf', 'angebot', 'abgesagt']);
    const summen = new Map(await Promise.all(sichtbar.filter((x) => mitSumme.has(Projekt.norm(x.status))).map(async (x) => [x.id, await summe(x)])));
    const gruppen = (stufe && !q ? STUFEN.filter((s) => s[0] === stufe) : STUFEN).map((s) => [s, sichtbar.filter((x) => stufeVon(x.status) === s[0])]).filter(([, l]) => l.length);
    const nOffen = OFFEN.reduce((n, id) => n + anzahl(id), 0);
    main().innerHTML = `
      ${state.settings.apiKey || (window.Sync?.fest() && !window.Sync.active()) ? '' : `<button class="notice" id="toSet">${icon('gear')}<span><b>KI noch nicht eingerichtet.</b> Einmalig den Google-Schlüssel in den Einstellungen eintragen.</span>${icon('chevron')}</button>`}
      <div id="backupHint"></div>
      <label class="search big">${icon('search')}<input type="search" id="auQ" value="${esc(suche)}" placeholder="Kunde, Adresse, Nummer" autocomplete="off"></label>
      <button class="cta slim" id="auNeu"><span class="cta-ico">${icon('plus')}</span><span class="cta-t"><b>Neuer Auftrag</b><span>Anfrage aufnehmen, Angebot machen</span></span>${icon('chevron', 'cta-chev')}</button>
      <div class="au-stufen" role="tablist">
        <button data-aus="" class="${!stufe ? 'on' : ''}"><b>${nOffen}</b><span>Alle offenen</span></button>
        ${STUFEN.map(([id, n]) => `<button data-aus="${id}" class="${stufe === id ? 'on' : ''} ${anzahl(id) ? '' : 'leer'}"><b>${anzahl(id)}</b><span>${n}</span></button>`).join('')}
      </div>
      ${gruppen.length ? gruppen.map(([[id, n, , sub], l]) => `
        ${!stufe || q ? `<div class="sec-h au-h"><h2>${esc(n)}</h2><span class="count">${l.length}</span><small>${esc(sub)}</small></div>` : `<p class="hint" style="margin:4px 0 8px">${esc(sub)}</p>`}
        <div class="plist">${l.map((x) => karte(x, summen.get(x.id))).join('')}</div>`).join('')
      : `<div class="empty-state">${icon('home')}<b>${q ? 'Nichts gefunden' : stufe ? `Nichts unter „${esc(STUFEN.find((s) => s[0] === stufe)[1])}“` : 'Noch keine offenen Aufträge'}</b><span>${q || stufe ? '' : 'Tippe auf „Neuer Auftrag“: Kunde wählen, vor Ort aufnehmen, Angebot machen.'}</span></div>`}`;
    $('#auQ').oninput = debounce((e) => { suche = e.target.value; view().then(() => { const i = $('#auQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 250);
    $$('[data-aus]').forEach((b) => (b.onclick = () => { stufe = b.dataset.aus; view(); }));
    $('#auNeu').onclick = neu;
    if ($('#toSet')) $('#toSet').onclick = () => { switchTab('einstellungen'); einstellungSeite('ki'); };
    $$('[data-au]').forEach((b) => (b.onclick = () => Projekt.oeffnen(b.dataset.au)));
    // Die gewählte Stufe sichtbar halten (die Leiste scrollt seitlich)
    $('.au-stufen .on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    window.Backup?.hinweis($('#backupHint'));
  }

  /** Neuer Auftrag: der normale Weg ist die Anfrage mit Angebot. */
  async function neu() {
    const v = await sheet('Neuer Auftrag', [
      { label: 'Anfrage mit Angebot', sub: 'Kunde wählen, vor Ort aufnehmen, Angebot ausarbeiten und senden', icon: icon('euro'), value: 'anfrage' },
      { label: 'Auftrag ohne Angebot', sub: 'Schon zugesagt, z. B. mündlich. Startet bei „Zugesagt“', icon: icon('check'), value: 'direkt' },
      { label: 'Schnellpreis am Telefon', sub: 'Grober Preis ohne Kunde', icon: icon('phone'), value: 'schnell' },
    ]);
    if (v === 'anfrage') return Projekt.neu();
    if (v === 'direkt') return Projekt.neuDirekt();
    if (v === 'schnell') { Schnell.view(); window.scrollTo(0, 0); }
  }

  return { view, neu, STUFEN, stufeVon };
})();
