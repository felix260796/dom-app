'use strict';
/* DOM – Finanzen (€-Symbol oben neben dem Kalender): alles Finanzielle an einem Ort.
 * Stand jetzt: Überblick, was abzurechnen ist und welche Rechnungen offen sind (aus dem Projektstatus).
 * Geplant (eigener Ausbau): Eingangsrechnungen von Subunternehmern und Lieferanten je Projekt,
 * Rechnungen an Kunden, Abschläge, Zahlungseingang, Kalkulation Soll/Ist je Projekt.
 * Legt sich wie der Kalender über den aktuellen Reiter; „Zurück“ führt dorthin, wo man war.
 * Baut auf app.js (state, header, main, icon, switchTab), projekt.js und kunden.js auf. */
window.Finanzen = (() => {
  let vorher = null;

  async function view() {
    if (!state.finanzen) vorher = { tab: state.tab, s: { project: state.project, wohnung: state.wohnung, kunde: state.kunde, objekt: state.objekt, partner: state.partner } };
    state.kalender = false; state.finanzen = true;
    const zurueck = () => { state.finanzen = false; const v = vorher || { tab: state.tab, s: {} }; vorher = null; switchTab(v.tab, v.s); };
    header('Finanzen', 'Rechnungen, Zahlungen, Kalkulation', { label: 'Zurück', fn: zurueck });
    const idx = await projectIndex();
    if (!state.finanzen) return;
    const abrechnen = idx.filter((x) => Projekt.norm(x.status) === 'fertig');
    const offen = idx.filter((x) => Projekt.norm(x.status) === 'rechnung');
    const zeile = (x) => `<button class="pcard" data-fp="${x.id}">
        <span class="pc-ph">${icon('euro')}</span>
        <span class="pc-t"><b>${esc(x.titel || x.room || 'Projekt')}</b>${Projekt.pill(x.status)}
          <span class="muted pc-wer">${icon('user')}${esc(Kunden.name(Kunden.byId(x.kundeId)) || x.customer || '')}</span></span>
        ${icon('chevron', 'pc-chev')}</button>`;
    main().innerHTML = `
      <div class="phasen zwei">
        <div class="fz"><b>${abrechnen.length}</b><span>Abzurechnen</span></div>
        <div class="fz"><b>${offen.length}</b><span>Rechnung offen</span></div>
      </div>
      ${abrechnen.length ? `<div class="sec-h"><h2>Abgeschlossen, noch keine Rechnung</h2></div><div class="plist">${abrechnen.map(zeile).join('')}</div>` : ''}
      ${offen.length ? `<div class="sec-h"><h2>Rechnung gestellt, Zahlung offen</h2></div><div class="plist">${offen.map(zeile).join('')}</div>` : ''}
      ${!abrechnen.length && !offen.length ? `<div class="empty-state">${icon('euro')}<b>Gerade nichts offen</b><span>Sobald ein Projekt abgeschlossen ist, steht es hier zum Abrechnen.</span></div>` : ''}
      <div class="sec-h"><h2>Kommt als Nächstes</h2></div>
      <div class="docs">
        <div class="doc off"><span class="d-ico grey">${icon('upload')}</span><span class="d-t"><b>Eingangsrechnungen</b><span>Rechnung von Subunternehmer oder Lieferant fotografieren und dem Projekt zuordnen</span></span></div>
        <div class="doc off"><span class="d-ico grey">${icon('euro')}</span><span class="d-t"><b>Rechnungen an Kunden</b><span>Aus dem Angebot erzeugen, Abschläge, Zahlungseingang</span></span></div>
        <div class="doc off"><span class="d-ico grey">${icon('clipboard')}</span><span class="d-t"><b>Kalkulation je Projekt</b><span>Angebot gegen echte Kosten, Marge je Gewerk</span></span></div>
      </div>`;
    $$('[data-fp]').forEach((b) => (b.onclick = () => { state.finanzen = false; vorher = null; switchTab('projekt', { wohnung: null }); Projekt.oeffnen(b.dataset.fp); }));
  }

  return { view };
})();
