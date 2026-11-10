'use strict';
/* DOM – Reiter „Angebote“: alle Angebote auf einen Blick, dazu das Schnellangebot.
 * Ein richtiges Angebot gehört immer zu einem Projekt (Positionen je Raum, siehe angebot.js).
 * Offen = Besichtigung, in Arbeit, versendet. Dazu Zugesagt und Abgesagt.
 * Baut auf app.js, projekt.js, kunden.js, angebot.js und schnell.js auf. */
window.Angebote = (() => {
  const GRUPPEN = [
    ['arbeit', 'In Arbeit', ['besichtigung', 'entwurf']],
    ['verschickt', 'Verschickt', ['angebot']],
    ['zugesagt', 'Zugesagt', ['geplant', '', 'fertig', 'rechnung', 'bezahlt']],
    ['abgesagt', 'Abgesagt', ['abgesagt']],
  ];
  let gruppe = 'arbeit', suche = '';
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
    const q = suche.trim().toLowerCase();
    const hay = (x) => { const k = Kunden.byId(x.kundeId); return `${x.nr || ''} ${x.titel || ''} ${x.customer || ''} ${x.address || ''} ${x.room || ''} ${k ? `${k.nr} ${k.telefon} ${k.email} ${k.privat}` : ''}`.toLowerCase(); };
    const passt = (x) => !q || q.split(/\s+/).every((t) => hay(x).includes(t));
    const liste = alle.filter((x) => gruppeVon(x.status) === gruppe && passt(x))
      .sort((a, b) => reihe.indexOf(Projekt.norm(a.status)) - reihe.indexOf(Projekt.norm(b.status)) || (b.updated || 0) - (a.updated || 0));
    const summen = await Promise.all(liste.map(summe));
    main().innerHTML = `
      <label class="search big">${icon('search')}<input type="search" id="aq" value="${esc(suche)}" placeholder="Kunde, Adresse, Raum oder Nummer" autocomplete="off"></label>
      <button class="cta slim" id="aNeu"><span class="cta-ico">${icon('plus')}</span><span class="cta-t"><b>Neues Angebot</b></span>${icon('chevron', 'cta-chev')}</button>
      <button class="notice plain" id="aSchnell">${icon('euro')}<span><b>Schnellangebot</b> · grober Preis ohne Kunde, z. B. am Telefon</span>${icon('chevron')}</button>
      ${alle.length ? `<div class="phasen">${GRUPPEN.map(([id, n]) => `<button data-ag="${id}" class="${gruppe === id ? 'on' : ''}"><b>${alle.filter((x) => gruppeVon(x.status) === id).length}</b><span>${n}</span></button>`).join('')}</div>` : ''}
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
        : `<div class="empty-state">${icon('euro')}<b>${q ? 'Nichts gefunden' : { arbeit: 'Nichts in Arbeit', verschickt: 'Nichts verschickt', zugesagt: 'Noch keine Zusage', abgesagt: 'Keine Absagen' }[gruppe]}</b><span>${gruppe === 'arbeit' && !q ? 'Tippe auf „Neues Angebot“ und wähle den Kunden.' : ''}</span></div>`}`;
    $('#aq').oninput = debounce((e) => { suche = e.target.value; view().then(() => { const i = $('#aq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 250);
    $$('[data-ag]').forEach((b) => (b.onclick = () => { gruppe = b.dataset.ag; view(); }));
    $('#aSchnell').onclick = () => { Schnell.view(); window.scrollTo(0, 0); };
    $('#aNeu').onclick = () => neu(alle);
    $$('[data-ang]').forEach((b) => (b.onclick = () => oeffnen(b.dataset.ang)));
  }

  /** Neues Angebot: für ein Projekt in der Angebotsphase oder ein neues Projekt. */
  async function neu() { return Projekt.neu(); } // Kunde wählen, dann Objekt; Projekt entsteht erst mit der Zusage

  /** Angebot öffnen: immer die Angebotsseite mit den 4 Schritten (Zurück führt wieder hierher). */
  async function oeffnen(id) {
    const w = await kvGet('wohnung:' + id);
    if (!w) return toast('Projekt nicht gefunden.');
    w.mappe ??= {};
    state.project = null; state.wohnung = w;
    Projekt.view(); window.scrollTo(0, 0);
  }

  return { view, oeffnen };
})();
