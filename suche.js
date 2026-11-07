'use strict';
/* DOM – Suche über alles (im Menü hinter dem DOM-Logo, state.tab = 'suche').
 * Sucht in Kunden (Name, Nummer, Telefon, E-Mail, Anschriften), Projekten (Titel, Nummer, Kunde, Anschrift; der Status
 * zeigt, ob es ein Angebot ist), Rechnungen an Kunden, Eingangsrechnungen, Terminen und Subunternehmern.
 * Mehrere Wörter = alle müssen vorkommen. Die Diktiertaste der iPhone-Tastatur funktioniert im Suchfeld. */
window.Suche = (() => {
  let q = '';
  const eur = (x) => (x || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
  const tag = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const passt = (text, woerter) => { const t = text.toLowerCase(); return woerter.every((w) => t.includes(w)); };

  async function view() {
    header('Suche', 'Über alles in der App');
    main().innerHTML = `<label class="search su-feld">${icon('search')}<input type="search" id="suQ" value="${esc(q)}" placeholder="Name, Straße, Nummer, Telefon …" autocomplete="off" enterkeyhint="search"></label><div id="suErg"></div>`;
    await Promise.all([window.Rechnung?.laden(), window.Finanzen?.laden()]);
    const inp = $('#suQ');
    inp.oninput = debounce(() => { q = inp.value; zeigen(); }, 150);
    if (!q) inp.focus();
    zeigen();
  }

  async function zeigen() {
    const el = $('#suErg'); if (!el) return;
    const woerter = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!woerter.length) { el.innerHTML = '<p class="hint">Tippe einen Namen, eine Straße, eine Projekt- oder Rechnungsnummer. Auch Telefonnummern und E-Mails werden gefunden.</p>'; return; }
    const idx = await projectIndex();
    const pName = (id) => { const x = idx.find((y) => y.id === id); return x ? [x.titel || x.room || 'Projekt', Kunden.name(Kunden.byId(x.kundeId)) || x.customer].filter(Boolean).join(' · ') : ''; };
    const gruppen = [];
    const zeile = (ziel, ic, titel, sub, extra = '') => `<button class="pcard" data-su="${esc(ziel)}"><span class="pc-ph">${icon(ic)}</span><span class="pc-t"><b>${esc(titel)}</b>${extra}<span class="muted">${esc(sub)}</span></span>${icon('chevron', 'pc-chev')}</button>`;
    const gruppe = (titel, z) => { if (z.length) gruppen.push(`<div class="sec-h"><h2>${titel}</h2><span class="count">${z.length}</span></div><div class="plist">${z.slice(0, 20).join('')}</div>`); };

    gruppe('Kunden', Kunden.liste().filter((k) => passt(`${Kunden.name(k)} ${k.nr} ${k.telefon} ${k.email} ${k.privat} ${k.objekte.map((o) => `${o.name} ${o.adresse}`).join(' ')} ${k.hv?.firma || ''}`, woerter))
      .map((k) => zeile('k:' + k.id, 'user', Kunden.name(k) || 'Ohne Namen', [k.nr && `Nr. ${k.nr}`, Kunden.ort(k)].filter(Boolean).join(' · '))));
    gruppe('Projekte und Angebote', idx.filter((x) => passt(`${x.titel || ''} ${x.room || ''} ${x.nr || ''} ${x.customer || ''} ${x.address || ''} ${Kunden.name(Kunden.byId(x.kundeId)) || ''}`, woerter))
      .map((x) => zeile('p:' + x.id, 'home', x.titel || x.room || 'Projekt', [x.nr, Kunden.name(Kunden.byId(x.kundeId)) || x.customer, x.address].filter(Boolean).join(' · '), Projekt.pill(x.status))));
    gruppe('Rechnungen an Kunden', (window.Rechnung?.liste() || []).filter((r) => passt(`${r.nr} ${r.titel || ''} ${pName(r.projektId)}`, woerter))
      .map((r) => zeile('r:' + r.id, 'euro', `${r.nr} · ${eur(Rechnung.zahlbetrag(r))}`, [pName(r.projektId), r.bezahlt ? 'bezahlt' : `fällig ${tag(r.faellig)}`].filter(Boolean).join(' · '))));
    const vonText = (b) => window.Partner?.byId(b.partnerId)?.firma || window.Partner?.byId(b.partnerId)?.inhaber || b.von || 'Eingangsrechnung';
    gruppe('Eingangsrechnungen', (window.Finanzen?.liste() || []).filter((b) => passt(`${vonText(b)} ${b.nr || ''} ${b.gewerk || ''} ${pName(b.projektId)}`, woerter))
      .map((b) => zeile('b:' + b.id, 'file', `${vonText(b)} · ${eur(b.netto)} netto`, [b.nr && `Nr. ${b.nr}`, pName(b.projektId), b.bezahlt ? 'bezahlt' : 'offen'].filter(Boolean).join(' · '))));
    const termine = [];
    const d = await db();
    await new Promise((res) => { const rq = d.transaction('kv').objectStore('kv').openCursor(IDBKeyRange.bound('termin:', 'termin:￿')); rq.onsuccess = () => { const c = rq.result; if (!c) return res(); termine.push(c.value); c.continue(); }; rq.onerror = () => res(); });
    gruppe('Termine', termine.filter((t) => t && passt(`${t.titel || ''} ${t.ort || ''} ${t.notiz || ''} ${Kunden.name(Kunden.byId(t.kundeId)) || ''}`, woerter)).sort((a, b) => b.datum.localeCompare(a.datum))
      .map((t) => zeile('t:' + t.id, 'calendar', t.titel || 'Termin', [tag(t.datum), t.von && !t.ganztag ? t.von + ' Uhr' : '', t.ort].filter(Boolean).join(' · '))));
    gruppe('Subunternehmer und Lieferanten', (window.Partner?.liste() || []).filter((p) => passt(`${p.firma || ''} ${p.inhaber || ''} ${p.gewerk || ''} ${p.telefon || ''} ${p.email || ''}`, woerter))
      .map((p) => zeile('s:' + p.id, 'wrench', p.firma || p.inhaber || 'Subunternehmer', [p.gewerk, p.telefon].filter(Boolean).join(' · '))));

    el.innerHTML = gruppen.join('') || '<p class="hint">Nichts gefunden.</p>';
    $$('[data-su]', el).forEach((b) => (b.onclick = () => oeffnen(b.dataset.su)));
  }

  async function oeffnen(z) {
    const i = z.indexOf(':'), art = z.slice(0, i), id = z.slice(i + 1);
    const zurueck = () => switchTab('suche');
    if (art === 'k') return Kunden.oeffnen(id);
    if (art === 'p') { switchTab('projekt', { wohnung: null }); return Projekt.oeffnen(id); }
    if (art === 's') return Partner.oeffnen(id);
    if (art === 'r') return Rechnung.detail(Rechnung.liste().find((r) => r.id === id), zurueck);
    if (art === 'b') return Finanzen.erfassen(Finanzen.liste().find((b) => b.id === id), zurueck);
    if (art === 't') { const t = await kvGet('termin:' + id); if (t) Kalender.bearbeiten(t, zurueck); }
  }

  return { view };
})();
