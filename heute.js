'use strict';
/* DOM – Startseite „Heute“: alles, was heute dran ist, auf einen Blick.
 * Termine heute und morgen, Angebote zum Nachfassen, überfällige Rechnungen (Kunden und Eingang), Abzurechnen,
 * Lieferungen, Mängel mit Frist, bevorstehende Baustarts, laufende Baustellen.
 * Öffnet beim Start (einstellbar) und über das Menü (DOM-Logo). Eigener Zustand state.tab = 'heute' (kein Reiter unten).
 * Vorlauf in Tagen und Start-Verhalten: Vorgaben 'heuteStart', 'heuteVorlauf' (vorgaben.js). */
window.Heute = (() => {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const tag = (s) => new Date(s + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const eur = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';

  async function view() {
    const h = plus(0), morgen = plus(1), vor = plus(+vorgabe('heuteVorlauf') || 3);
    header('Heute', new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }));
    const idx = await projectIndex();
    const name = (x) => [x.titel || x.room || 'Projekt', Kunden.name(Kunden.byId(x.kundeId)) || x.customer].filter(Boolean).join(' · ');
    const ws = (await Promise.all(idx.map((x) => kvGet('wohnung:' + x.id)))).filter(Boolean);
    await Promise.all([window.Rechnung?.laden(), window.Finanzen?.laden()]);
    if (state.tab !== 'heute') return;
    const bloecke = [];
    const zeile = (ziel, ic, titel, sub, farbe = '') => `<button class="pcard hz" data-hz="${esc(ziel)}"><span class="pc-ph" ${farbe ? `style="color:${farbe}"` : ''}>${icon(ic)}</span><span class="pc-t"><b>${esc(titel)}</b><span class="muted">${esc(sub)}</span></span>${icon('chevron', 'pc-chev')}</button>`;
    const block = (titel, zeilen) => { if (zeilen.length) bloecke.push(`<div class="sec-h"><h2>${esc(titel)}</h2><span class="count">${zeilen.length}</span></div><div class="plist">${zeilen.join('')}</div>`); };

    // Termine
    const termine = (window.Kalender?.eintraege(h, morgen) || []).filter((t) => t.typ === 'termin' || t.art?.startsWith('geb')).sort((a, b) => (a.datum + (a.von || '')).localeCompare(b.datum + (b.von || '')));
    block('Termine heute und morgen', termine.map((t) => zeile(`kal:${t.datum}`, t.art?.startsWith('geb') ? 'cake' : 'calendar', t.titel || 'Termin', `${t.datum === h ? 'Heute' : 'Morgen'}${t.ganztag || !t.von ? '' : `, ${t.von} Uhr`}${t.ort ? ' · ' + t.ort : ''}`)));
    // Nachfassen
    block('Angebote nachfassen', idx.filter((x) => Projekt.norm(x.status) === 'angebot' && Projekt.seitTagen(x.versendetAm) >= Projekt.nachfassen())
      .map((x) => zeile('p:' + x.id, 'phone', name(x), `Seit ${Projekt.seitTagen(x.versendetAm)} Tagen beim Kunden`, '#b7791f')));
    // Geld
    const geld = [];
    for (const r of window.Rechnung?.liste() || []) if (!r.bezahlt && r.faellig && r.faellig < h) { const x = idx.find((y) => y.id === r.projektId); geld.push(zeile('r:' + r.id, 'euro', `Kunde zahlt nicht: ${x ? name(x) : r.nr}`, `${r.nr} · ${eur(Rechnung.zahlbetrag(r))} · fällig seit ${tag(r.faellig)}`, '#c0392b')); }
    for (const b of window.Finanzen?.liste() || []) if (!b.bezahlt && b.faellig && b.faellig <= vor) geld.push(zeile('b:' + b.id, 'euro', `Wir zahlen: ${window.Partner?.byId(b.partnerId)?.firma || b.von || 'Rechnung'}`, `${eur(b.netto)} netto · fällig ${tag(b.faellig)}`, b.faellig < h ? '#c0392b' : '#d2691e'));
    for (const x of idx) if (Projekt.norm(x.status) === 'fertig') geld.push(zeile('p:' + x.id, 'file', `Abrechnen: ${name(x)}`, 'Baustelle abgeschlossen, Schlussrechnung fehlt'));
    block('Geld', geld);
    // Baustellen
    const bau = [];
    for (const w of ws) {
      for (const b of w.bestellungen || []) if (b.status !== 'geliefert' && b.liefertermin && b.liefertermin <= vor) bau.push(zeile('p:' + w.id, 'clipboard', `Lieferung: ${b.was}`, `${w.titel || w.customer || ''} · ${b.liefertermin < h ? 'überfällig seit ' : ''}${tag(b.liefertermin)}`, b.liefertermin < h ? '#c0392b' : ''));
      for (const m of w.abnahme?.maengel || []) if (!m.erledigt && m.frist && m.frist <= vor) bau.push(zeile('p:' + w.id, 'x', `Mangel: ${m.text}`, `${w.titel || w.customer || ''} · Frist ${tag(m.frist)}`, m.frist < h ? '#c0392b' : '#d2691e'));
      if (Projekt.norm(w.status) === 'geplant' && w.baustart && w.baustart <= plus(7)) bau.push(zeile('p:' + w.id, 'calendar', `Baustart: ${w.titel || w.customer || 'Projekt'}`, tag(w.baustart)));
    }
    block('Baustellen: zu erledigen', bau);
    // Laufende Baustellen
    block('Laufende Baustellen', idx.filter((x) => Projekt.norm(x.status) === '').map((x) => zeile('p:' + x.id, 'home', name(x), x.fort ? `${x.fort.fertig} von ${x.fort.n} Schritten${x.fort.naechster ? ' · als Nächstes: ' + x.fort.naechster : ''}` : 'Noch keine Arbeitsschritte')));

    main().innerHTML = (bloecke.join('') || `<div class="empty-state">${icon('check')}<b>Heute ist nichts offen</b><span>Termine, Nachfassen, Rechnungen und Baustellen erscheinen hier, sobald etwas ansteht.</span></div>`);
    $$('[data-hz]').forEach((b) => (b.onclick = () => oeffnen(b.dataset.hz)));
  }

  async function oeffnen(z) {
    const [art, id] = [z.slice(0, z.indexOf(':')), z.slice(z.indexOf(':') + 1)];
    if (art === 'p') { switchTab('projekt', { wohnung: null }); return Projekt.oeffnen(id); }
    if (art === 'kal') { Kalender.view(); return; }
    if (art === 'r') { switchTab('rechnungen'); await Rechnung.laden(); return Rechnung.detail(Rechnung.liste().find((r) => r.id === id), () => switchTab('rechnungen')); }
    if (art === 'b') { switchTab('rechnungen'); await Finanzen.laden(); return Finanzen.erfassen(Finanzen.liste().find((b) => b.id === id), () => switchTab('rechnungen')); }
  }

  return { view };
})();
