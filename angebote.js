'use strict';
/* DOM – Reiter „Angebote“: alle Angebote auf einen Blick, dazu das Schnellangebot.
 * Ein richtiges Angebot gehört immer zu einem Projekt (Positionen je Raum, siehe angebot.js).
 * Offen = Besichtigung, in Arbeit, versendet. Dazu Zugesagt und Abgesagt.
 * Baut auf app.js, projekt.js, kunden.js, angebot.js und schnell.js auf. */
window.Angebote = (() => {
  const GRUPPEN = [
    ['offen', 'Offen', ['besichtigung', 'entwurf', 'angebot']],
    ['zugesagt', 'Zugesagt', ['geplant', '', 'fertig', 'rechnung', 'bezahlt']],
    ['abgesagt', 'Abgesagt', ['abgesagt']],
  ];
  let gruppe = 'offen';
  const eur = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
  const gruppeVon = (st) => GRUPPEN.find((g) => g[2].includes(Projekt.norm(st)))[0];

  /** Summe brutto aller Raum-Angebote eines Projekts (0, wenn noch keine Positionen). */
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

  async function view() {
    state.project = null; state.wohnung = null;
    header('Angebote', state.settings.company || '');
    const alle = await projectIndex();
    try { await window.Angebot._intern.preisliste(); } catch {}
    const reihe = Projekt.ALLE.map((s) => s[0]);
    const liste = alle.filter((x) => gruppeVon(x.status) === gruppe)
      .sort((a, b) => reihe.indexOf(Projekt.norm(a.status)) - reihe.indexOf(Projekt.norm(b.status)) || (b.updated || 0) - (a.updated || 0));
    const summen = await Promise.all(liste.map(summe));
    main().innerHTML = `
      <button class="cta slim" id="aNeu"><span class="cta-ico">${icon('plus')}</span><span class="cta-t"><b>Neues Angebot</b></span>${icon('chevron', 'cta-chev')}</button>
      <button class="notice plain" id="aSchnell">${icon('euro')}<span><b>Schnellangebot</b> · grober Preis ohne Kunde, z. B. am Telefon</span>${icon('chevron')}</button>
      ${alle.length ? `<div class="phasen drei">${GRUPPEN.map(([id, n]) => `<button data-ag="${id}" class="${gruppe === id ? 'on' : ''}"><b>${alle.filter((x) => gruppeVon(x.status) === id).length}</b><span>${n}</span></button>`).join('')}</div>` : ''}
      ${liste.length ? `<div class="plist">${liste.map((x, i) => `
        <button class="pcard" data-ang="${x.id}">
          ${x.thumb ? `<img src="${x.thumb}" alt="">` : `<span class="pc-ph">${icon('euro')}</span>`}
          <span class="pc-t"><b>${esc(x.titel || x.room || 'Projekt')}</b>${Projekt.pill(x.status)}
            ${Kunden.name(Kunden.byId(x.kundeId)) || x.customer ? `<span class="muted pc-wer">${icon('user')}${esc(Kunden.name(Kunden.byId(x.kundeId)) || x.customer)}</span>` : ''}
            ${Projekt.norm(x.status) === 'angebot' && Projekt.seitTagen(x.versendetAm) >= Projekt.nachfassen() ? `<span class="nachfassen">Seit ${Projekt.seitTagen(x.versendetAm)} Tagen beim Kunden, nachfassen</span>` : ''}
            ${x.absage ? `<span class="muted">Grund: ${esc(x.absage)}</span>` : ''}
            <span class="ang-sum">${summen[i] ? eur(summen[i]) + ' brutto' : '<span class="muted">noch keine Positionen</span>'}</span></span>
          ${icon('chevron', 'pc-chev')}
        </button>`).join('')}</div>`
        : `<div class="empty-state">${icon('euro')}<b>${{ offen: 'Keine offenen Angebote', zugesagt: 'Noch keine Zusage', abgesagt: 'Keine Absagen' }[gruppe]}</b><span>${gruppe === 'offen' ? 'Tippe auf „Neues Angebot“. Ein Angebot gehört immer zu einem Kunden und seinem Projekt.' : ''}</span></div>`}`;
    $$('[data-ag]').forEach((b) => (b.onclick = () => { gruppe = b.dataset.ag; view(); }));
    $('#aSchnell').onclick = () => { Schnell.view(); window.scrollTo(0, 0); };
    $('#aNeu').onclick = () => neu(alle);
    $$('[data-ang]').forEach((b) => (b.onclick = () => oeffnen(b.dataset.ang)));
  }

  /** Neues Angebot: für ein Projekt in der Angebotsphase oder ein neues Projekt. */
  async function neu(alle) {
    const offen = alle.filter((x) => ['besichtigung', 'entwurf'].includes(Projekt.norm(x.status)));
    const v = offen.length ? await sheet('Angebot für welches Projekt?', [
      { label: 'Neues Projekt anlegen', sub: 'Kunde wählen, dann Räume aufnehmen', icon: icon('plus'), value: '__neu' },
      ...offen.map((x) => ({ label: x.titel || x.room || 'Projekt', sub: [Kunden.name(Kunden.byId(x.kundeId)) || x.customer, Projekt.statusKurz(x.status)].filter(Boolean).join(' · '), icon: icon('home'), value: x.id })),
    ]) : '__neu';
    if (!v) return;
    if (v === '__neu') return Projekt.neu();
    oeffnen(v);
  }

  /** Angebot eines Projekts öffnen: bei einem Raum direkt, sonst Raum wählen. Ohne Raum: das Projekt. */
  async function oeffnen(id) {
    const w = await kvGet('wohnung:' + id);
    if (!w) return toast('Projekt nicht gefunden.');
    w.mappe ??= {};
    state.project = null; state.wohnung = w;
    const raeume = (await Promise.all((w.rooms || []).map((rid) => Projekt.raum(rid)))).filter(Boolean);
    if (!raeume.length) { Projekt.view(); window.scrollTo(0, 0); toast('Zuerst einen Raum aufnehmen, dann das Angebot erstellen.', 4000); return; }
    let r = raeume[0];
    if (raeume.length > 1) {
      const rid = await sheet('Angebot für welchen Raum?', raeume.map((x) => ({ label: x.room || roomType(x.roomType).name, sub: x.angebot?.nr ? `Angebot Nr. ${x.angebot.nr}` : roomType(x.roomType).name, icon: roomIcon(x.roomType), value: x.id })));
      if (!rid) { state.wohnung = null; return; }
      r = raeume.find((x) => x.id === rid);
    }
    Projekt.raumAngebot(r, w);
  }

  return { view, oeffnen };
})();
