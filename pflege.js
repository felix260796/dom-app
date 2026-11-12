'use strict';
/* DOM – Kontakt halten (Wunsch Felix, v92): Kunden und Partner regelmäßig anrufen bzw. zum Mittagessen treffen.
 * Je Kontakt in der Kundenkarte bzw. beim Partner: „Regelmäßig anrufen“ und „Mittagessen vereinbaren“ mit Rhythmus
 * (wöchentlich, monatlich, vierteljährlich, halbjährlich, jährlich) und dem Tag fürs nächste Mal.
 * Daten am Kontakt: x.pflege = { anruf: { r, faellig, zuletzt, spaeter, verschoben, wer }, essen: { … } }.
 *   r = Rhythmus ('' = nie), faellig = nächstes Mal (ISO), zuletzt = zuletzt erledigt (ISO), spaeter = Zeitpunkt (ms)
 *   für „In 2 Stunden erinnern“, verschoben = Tag, an dem auf morgen verschoben wurde (zählt für diesen Tag mit),
 *   wer = Person (Team-Id), die erinnert wird ('' = alle). x.pflege fehlt = noch nicht gefragt (Karte fragt nach).
 * Pro Tag höchstens pflegeAnrufeMax Anrufe und pflegeEssenMax Mittagessen (die ältesten zuerst, der Rest rutscht weiter).
 * Erscheint auf „Heute“ (Anrufen, Treffen vereinbaren; kleines Telefon rechts), im Kalender (Arten 'pflegeAnruf', 'pflegeTreffen') und als
 * Mitteilung ab pflegeAb, alle pflegeAlle Minuten bis pflegeBis, bis erledigt (supabase/functions/push, gleiche Auswahl).
 * „Mittagessen“ heißt seit v94 „Treffen vereinbaren“ (intern weiter Art 'essen'). Namen: Vorgaben pflegeNameAnruf, pflegeNameTreffen.
 * Vorgaben: pflegeAnrufeMax, pflegeEssenMax, pflegeAb, pflegeBis, pflegeAlle, pflegeSpaeter, pflegeWochenende, pushPflege. */
window.Pflege = (() => {
  const ARTEN = {
    anruf: { get label() { return this.titel; }, get titel() { return String(vorgabe('pflegeNameAnruf') || 'Anrufen'); }, kal: 'pflegeAnruf', max: () => +vorgabe('pflegeAnrufeMax') },
    essen: { get label() { return this.titel; }, get titel() { return String(vorgabe('pflegeNameTreffen') || 'Treffen vereinbaren'); }, kal: 'pflegeTreffen', max: () => +vorgabe('pflegeEssenMax') },
  };
  const RHYTHMEN = [['', 'Nie'], ['woche', 'Wöchentlich'], ['monat', 'Monatlich'], ['quartal', 'Vierteljährlich'], ['halbjahr', 'Halbjährlich'], ['jahr', 'Jährlich']];
  const MONATE = { monat: 1, quartal: 3, halbjahr: 6, jahr: 12 };
  const rName = (r) => (RHYTHMEN.find((x) => x[0] === r) || RHYTHMEN[0])[1];

  // ---------- Datum ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ausIso = (s) => { const [j, m, t] = s.split('-').map(Number); return new Date(j, m - 1, t, 12); };
  const heute = () => iso(new Date());
  const plusTage = (s, n) => { const d = ausIso(s); d.setDate(d.getDate() + n); return iso(d); };
  /** Nächstes Mal nach dem Rhythmus (Monatsende bleibt Monatsende: 31.01. + 1 Monat = 28./29.02.). */
  function plusRhythmus(s, r) {
    if (r === 'woche') return plusTage(s, 7);
    const n = MONATE[r]; if (!n) return '';
    const d = ausIso(s), tag = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(tag, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return iso(d);
  }
  const frei = (s) => vorgabe('pflegeWochenende') !== 'nein' || ![0, 6].includes(ausIso(s).getDay());
  /** Nächster Tag, an dem erinnert wird (ohne Wochenende, wenn so eingestellt). */
  const werktag = (s) => { let d = s; for (let i = 0; i < 7 && !frei(d); i++) d = plusTage(d, 1); return d; };

  // ---------- Daten ----------
  /** Bringt x.pflege in Form (lässt es weg, wenn nie gefragt wurde). */
  function norm(x) {
    if (!x || x.pflege === undefined || x.pflege === null) return x;
    if (typeof x.pflege !== 'object') x.pflege = {};
    for (const a of Object.keys(ARTEN)) {
      const o = x.pflege[a] && typeof x.pflege[a] === 'object' ? x.pflege[a] : {};
      o.r = RHYTHMEN.some((y) => y[0] === o.r) ? o.r : '';
      for (const f of ['faellig', 'zuletzt', 'verschoben', 'wer']) o[f] = String(o[f] ?? '');
      o.spaeter = +o.spaeter || 0;
      x.pflege[a] = o;
    }
    return x;
  }
  const kontakte = () => [
    ...(window.Kunden?.liste() || []).map((k) => ({ x: k, typ: 'kunde', name: Kunden.name(k) || 'Kunde ohne Namen' })),
    ...(window.Partner?.liste() || []).map((p) => ({ x: p, typ: 'partner', name: [p.firma.trim(), p.inhaber.trim()].filter(Boolean).join(' · ') || 'Partner ohne Namen' })),
  ];
  const gilt = (o, wer) => !!o?.r && (!o.wer || !wer || o.wer === wer);
  const sortieren = (a, b) => a.o.faellig.localeCompare(b.o.faellig) || a.name.localeCompare(b.name, 'de');

  /** Was ist heute dran? [{ x, typ, name, art, o }] höchstens so viele wie eingestellt, die ältesten zuerst. */
  function heuteListe(art, wer = window.Kalender?.wer() || '') {
    const h = heute();
    if (!frei(h)) return [];
    const alle = kontakte().map((c) => ({ ...c, art, o: norm(c.x).pflege?.[art] })).filter((c) => gilt(c.o, wer));
    const verbraucht = alle.filter((c) => c.o.zuletzt === h || c.o.verschoben === h).length;
    const offen = alle.filter((c) => c.o.faellig && c.o.faellig <= h && c.o.zuletzt !== h && c.o.verschoben !== h).sort(sortieren);
    return offen.slice(0, Math.max(0, ARTEN[art].max() - verbraucht));
  }

  /** Für den Kalender: voraussichtliche Tage (heute bis bis), mit Tagesgrenze und Rhythmus vorausgerechnet. */
  function eintraege(von, bis, wer = '') {
    const h = heute();
    if (bis < h) return [];
    const out = [];
    for (const art of Object.keys(ARTEN)) {
      const max = ARTEN[art].max();
      const sim = kontakte().map((c) => ({ ...c, o: norm(c.x).pflege?.[art] })).filter((c) => gilt(c.o, wer) && c.o.faellig).map((c) => ({ ...c, f: c.o.faellig }));
      if (!sim.length) continue;
      const rein = (c, d) => { if (d >= von) out.push({ typ: 'pflege', art: ARTEN[art].kal, pflegeArt: art, id: `pf-${art}-${c.x.id}-${d}`, datum: d, ganztag: true, [c.typ === 'kunde' ? 'kundeId' : 'partnerId']: c.x.id,
        titel: `${ARTEN[art].titel}: ${c.name}`, sub: [rName(c.o.r), c.o.zuletzt && `zuletzt ${Kontakt.de(c.o.zuletzt)}`].filter(Boolean).join(' · ') }); };
      // heute: genau wie auf „Heute“
      const heutige = heuteListe(art, wer);
      for (const c of heutige) { rein(c, h); const s = sim.find((y) => y.x === c.x); if (s) s.f = plusRhythmus(h, c.o.r); }
      for (const s of sim) if (s.f <= h) s.f = plusTage(h, 1); // heute nicht mehr dran (Tagesgrenze, verschoben) → ab morgen
      for (let d = plusTage(h, 1), n = 0; d <= bis && n < 450; d = plusTage(d, 1), n++) {
        if (!frei(d)) continue;
        const dran = sim.filter((s) => s.f <= d).sort((a, b) => a.f.localeCompare(b.f) || a.name.localeCompare(b.name, 'de')).slice(0, max);
        for (const s of dran) { rein(s, d); s.f = plusRhythmus(d, s.o.r); }
      }
    }
    return out;
  }

  // ---------- Erledigt, später, morgen ----------
  async function sichern(c) {
    if (c.typ === 'kunde') await Kunden.speichern(c.x); else await Partner.speichern(c.x);
  }
  async function erledigt(c) {
    const o = c.x.pflege[c.art], h = heute();
    o.zuletzt = h; o.faellig = plusRhythmus(h, o.r) || ''; o.spaeter = 0; o.verschoben = '';
    await sichern(c);
    toast(`Erledigt. Nächstes Mal am ${Kontakt.de(o.faellig)}`);
  }
  const spaeterMin = () => Math.max(5, +vorgabe('pflegeSpaeter') || 120);
  const spaeterText = () => { const m = spaeterMin(); return m % 60 ? `In ${m} Minuten erinnern` : `In ${m / 60} ${m === 60 ? 'Stunde' : 'Stunden'} erinnern`; };
  async function spaeter(c) {
    c.x.pflege[c.art].spaeter = Date.now() + spaeterMin() * 60000;
    await sichern(c);
    toast(`Ich erinnere dich um ${uhr(c.x.pflege[c.art].spaeter)} Uhr`);
  }
  async function morgen(c) {
    const o = c.x.pflege[c.art], h = heute();
    o.faellig = werktag(plusTage(h, 1)); o.verschoben = h; o.spaeter = 0;
    await sichern(c);
    toast(`Verschoben auf ${Kontakt.de(o.faellig)}`);
  }
  const uhr = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  /** Telefonnummern des Kontakts (Haupt, weitere, Hausverwaltung). */
  function nummern(c) {
    const x = c.x;
    const l = [{ label: 'Telefon', wert: x.telefon || '' }, ...(x.weitere || []).filter((y) => y.art === 'tel')];
    if (c.typ === 'kunde' && Kunden.istHv(x)) l.push({ label: 'Hausverwaltung', wert: x.hv?.telefon || '' });
    return l.filter((y) => String(y.wert).trim());
  }

  // Nach dem Anruf zurück in der App: gleich fragen, ob es geklappt hat
  let offenerAnruf = null;
  /** Ruft direkt die Hauptnummer an (Wunsch Felix: ein Tipp, gleich anrufen). Ohne Nummer öffnet sich der Kontakt. */
  function anrufen(c, nachher) {
    const n = nummern(c)[0];
    if (!n) { toast('Keine Telefonnummer eingetragen.'); return oeffnen(c); }
    offenerAnruf = { c, t: Date.now(), nachher };
    location.href = telLink(n.wert);
  }
  /** Für den Kalender: Kontakt zu einem Eintrag ({ kundeId | partnerId, pflegeArt }) anrufen. */
  function anrufenEintrag(e, nachher) {
    const c = kontakte().find((y) => y.x.id === (e.kundeId || e.partnerId));
    if (c) anrufen({ ...c, art: e.pflegeArt }, nachher);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !offenerAnruf) return;
    const a = offenerAnruf; offenerAnruf = null;
    if (Date.now() - a.t < 3000 || Date.now() - a.t > 3 * 3600e3) return; // nicht wirklich telefoniert bzw. zu lange her
    setTimeout(() => nachfrage(a.c, a.nachher), 400);
  });

  /** Auswahl zu einem Eintrag: erledigt, später, morgen, Kontakt öffnen. */
  async function nachfrage(c, nachher, frage) {
    const essen = c.art === 'essen';
    const v = await sheet(frage || (essen ? `Treffen mit ${c.name} vereinbart?` : `Anruf bei ${c.name} erledigt?`), [
      { label: essen ? 'Ja, vereinbart' : 'Ja, erledigt', sub: `Nächstes Mal ${rName(c.x.pflege[c.art].r).toLowerCase()}`, icon: icon('check'), value: 'ok' },
      ...(essen ? [{ label: 'Vereinbart, Termin eintragen', sub: 'Öffnet einen neuen Termin im Kalender', icon: icon('calendar'), value: 'termin' }] : []),
      { label: spaeterText(), sub: 'Kommt dann wieder als Mitteilung', icon: icon('refresh'), value: 'spaeter' },
      { label: 'Morgen erinnern', icon: icon('calendar'), value: 'morgen' },
      { label: c.typ === 'kunde' ? 'Kunde öffnen' : 'Partner öffnen', icon: icon('user'), value: 'oeffnen' },
    ], { suche: '' });
    if (v === 'ok' || v === 'termin') await erledigt(c);
    if (v === 'spaeter') await spaeter(c);
    if (v === 'morgen') await morgen(c);
    if (v === 'termin') return window.Kalender?.bearbeiten({ titel: `Treffen ${c.name}`, art: 'buero', [c.typ === 'kunde' ? 'kundeId' : 'partnerId']: c.x.id }, () => switchTab('heute'));
    if (v === 'oeffnen') return oeffnen(c);
    if (v) nachher?.();
  }
  const oeffnen = (c) => (c.typ === 'kunde' ? Kunden.oeffnen(c.x.id) : Partner.oeffnen(c.x.id));

  // ---------- Startseite „Heute“ ----------
  /** Blöcke „Anrufen“ und „Treffen vereinbaren“. Gibt { html, anzahl, binden(el, neu) } zurück.
   * Zeile = weißes Feld über die ganze Breite mit kleinem runden Telefon rechts (ruft direkt an). */
  function heute_() {
    const bloecke = [], alle = [];
    for (const art of Object.keys(ARTEN)) {
      const l = heuteListe(art);
      if (!l.length) continue;
      const zeilen = l.map((c) => {
        const i = alle.push(c) - 1, sp = c.o.spaeter > Date.now();
        const seit = c.o.faellig < heute() ? `fällig seit ${Kontakt.de(c.o.faellig)}` : rName(c.o.r);
        return `<div class="pcard pf-z"><button type="button" class="pf-main" data-pfz="${i}"><span class="pc-t"><b>${esc(c.name)}</b><span class="muted">${esc(sp ? `Erinnert wieder um ${uhr(c.o.spaeter)} Uhr` : seit)}</span></span></button>
          <button type="button" class="pf-tel" data-pftel="${i}" aria-label="${esc(c.name)} anrufen">${icon('phone')}</button></div>`;
      });
      bloecke.push(`<div class="sec-h"><h2>${esc(ARTEN[art].titel)}</h2><span class="count">${l.length}</span></div><div class="plist">${zeilen.join('')}</div>`);
    }
    return {
      html: bloecke.join(''), anzahl: alle.length,
      binden(el, neu) {
        $$('[data-pfz]', el).forEach((b) => (b.onclick = () => nachfrage(alle[+b.dataset.pfz], neu, `${ARTEN[alle[+b.dataset.pfz].art].titel}: ${alle[+b.dataset.pfz].name}`)));
        $$('[data-pftel]', el).forEach((b) => (b.onclick = () => anrufen(alle[+b.dataset.pftel], neu)));
      },
    };
  }

  // ---------- Abschnitt in der Kundenkarte bzw. beim Partner ----------
  /** el: leeres Element · x: Kunde oder Partner · persist: speichern · neu: Kontakt eben erst angelegt (heute) */
  function abschnitt(el, x, persist) {
    if (!el) return;
    norm(x);
    const p = x.pflege || {};
    const team = window.Kalender?.team() || [];
    const wer = (o) => (o.wer && team.length > 1 ? team.find((t) => t.id === o.wer)?.name.split(' ')[0] : '');
    // Klein und zugeklappt (Wunsch Felix); ist etwas eingetragen, bleibt es offen
    const gesetzt = Object.keys(ARTEN).filter((a) => p[a]?.r);
    const offen = gesetzt.length > 0 || el.dataset.offen === '1';
    el.innerHTML = `<details class="pf-box" ${offen ? 'open' : ''}><summary>${icon('phone')}<span><b>Kontakt halten</b><span class="muted">${esc(gesetzt.length ? gesetzt.map((a) => `${ARTEN[a].titel} ${rName(p[a].r).toLowerCase()}`).join(' · ') : 'Regelmäßig anrufen oder treffen')}</span></span>${icon('down', 'pf-pfeil')}</summary>
      <div class="kform pf-inhalt">
        ${Object.entries(ARTEN).map(([a, A]) => { const o = p[a] || { r: '' }; return `
          <label ${a === 'anruf' ? 'style="margin-top:0"' : ''}>${esc(A.label)}</label>
          <select data-pfr="${a}">${RHYTHMEN.map(([v, n]) => `<option value="${v}" ${v === o.r ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
          <div class="pf-tag" ${o.r ? '' : 'hidden'}><span>Nächstes Mal am</span>${Kontakt.datumInput('pf-' + a, o.faellig)}</div>
          <p class="hint pf-info" ${o.r && (o.zuletzt || wer(o)) ? '' : 'hidden'}>${esc([o.zuletzt && `Zuletzt erledigt am ${Kontakt.de(o.zuletzt)}`, wer(o) && `Erinnert wird ${wer(o)}`].filter(Boolean).join(' · '))}</p>`; }).join('')}
      </div></details>`;
    $('details', el).ontoggle = (e) => { el.dataset.offen = e.target.open ? '1' : ''; };
    const bestaetigt = () => { if (!x.pflege || typeof x.pflege !== 'object') x.pflege = {}; norm(x); };
    $$('[data-pfr]', el).forEach((s) => (s.onchange = () => {
      bestaetigt();
      const a = s.dataset.pfr, o = x.pflege[a], alt = o.r;
      o.r = s.value;
      if (o.r && !alt) {
        // Neuer Kontakt (heute angelegt): erst im nächsten Rhythmus. Bestehender: ab heute, die Tagesgrenze verteilt.
        const neuHeute = !x.created || iso(new Date(x.created)) === heute();
        o.faellig = werktag(neuHeute ? plusRhythmus(heute(), o.r) : heute());
        o.wer = window.Kalender?.wer() || '';
      }
      if (!o.r) { o.faellig = ''; o.spaeter = 0; }
      persist();
      el.dataset.offen = '1';
      abschnitt(el, x, persist);
    }));
    for (const a of Object.keys(ARTEN)) { const inp = $('#pf-' + a, el); if (inp) Kontakt.datumFeld(inp, (v) => { bestaetigt(); if (v && v !== x.pflege[a].faellig) { x.pflege[a].faellig = v; x.pflege[a].verschoben = ''; persist(); } }); }
  }

  /** Für die Mitteilungen (push.js): Einstellungen, die die Supabase-Funktion braucht. */
  const prefs = () => ({
    an: vorgabe('pushPflege') !== 'nein', ab: String(vorgabe('pflegeAb') || '09:00'), bis: String(vorgabe('pflegeBis') || '18:00'),
    alle: Math.max(15, +vorgabe('pflegeAlle') || 60), anrufe: +vorgabe('pflegeAnrufeMax') || 0, essen: +vorgabe('pflegeEssenMax') || 0,
    wochenende: vorgabe('pflegeWochenende') !== 'nein',
    namen: { anruf: ARTEN.anruf.titel, essen: ARTEN.essen.titel }, // Wörter in der Mitteilung
  });

  return { ARTEN, RHYTHMEN, norm, heuteListe, eintraege, heute: heute_, abschnitt, nachfrage, anrufen, anrufenEintrag, erledigt, spaeter, morgen, prefs, plusRhythmus, _intern: { werktag, frei, kontakte } };
})();
