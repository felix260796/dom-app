'use strict';
/* DOM – Kurz notieren (seit v115, Runde 13, P2 Kontaktpflege). Ein freies Feld (tippen oder über das Mikrofon der Tastatur sprechen):
 * Die KI erkennt Kontakt (Kunde oder Partner), Info und Erinnerung, DOM zeigt eine Prüfzeile, „Übernehmen“ legt mit einem Tipp
 * einen Eintrag in der Zeitleiste des Kontakts (x.zeitleiste, art 'notiz') und bei einer Erinnerung ein To-do an.
 * Nach „Kontakt halten → erledigt“ fragt DOM still „Was gab's Neues?“ (Notiz.fragen(c)). Ohne KI-Schlüssel: Kontakt wählen, Text als Notiz.
 * Prompt: Vorgabe 'promptNotiz' (Englisch, Antwort Deutsch). */
window.Notiz = (() => {
  const heute = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tag = (iso) => (iso ? new Date(iso + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '');
  const kontakte = () => [
    ...(window.Kunden?.liste() || []).map((k) => ({ id: 'k:' + k.id, name: Kunden.name(k) || 'Kunde ohne Namen', x: k, typ: 'kunde', extra: [k.nr, ...(k.personen || []).map(Kunden.personName)].filter(Boolean).join(', ') })),
    ...(window.Partner?.liste() || []).map((p) => ({ id: 'p:' + p.id, name: Partner.titel(p) || 'Partner ohne Namen', x: p, typ: 'partner', extra: [p.inhaber, p.gewerk].filter(Boolean).join(', ') })),
  ];
  const finde = (id) => kontakte().find((c) => c.id === id) || null;
  const werName = () => (window.Kalender?.team?.() || []).find((p) => p.id === window.Kalender?.wer())?.name?.split(' ')[0] || '';

  /** KI: { kontakt: 'k:…'|'p:…'|'', info, erinnerung: { text, datum } | null } */
  async function erkennen(text, festId) {
    const liste = festId ? [finde(festId)].filter(Boolean) : kontakte();
    if (!state.settings.apiKey || typeof geminiText !== 'function') return { kontakt: festId || '', info: text, erinnerung: null };
    const prompt = `${vorgabe('promptNotiz')}\n\nToday is ${heute()} (${new Date().toLocaleDateString('en-GB', { weekday: 'long' })}).\nContacts (id | name | details):\n${liste.slice(0, 600).map((c) => `${c.id} | ${c.name} | ${c.extra}`).join('\n')}\n\nNote:\n${text}`;
    try {
      const j = JSON.parse(await geminiText([{ text: prompt }], true));
      const kontakt = festId || (liste.some((c) => c.id === j.kontakt) ? j.kontakt : '');
      const e = j.erinnerung && String(j.erinnerung.text || '').trim() ? { text: String(j.erinnerung.text).trim(), datum: /^\d{4}-\d\d-\d\d$/.test(j.erinnerung.datum || '') ? j.erinnerung.datum : '' } : null;
      return { kontakt, info: String(j.info || text).trim(), erinnerung: e };
    } catch (e) { console.warn('Notiz', e); return { kontakt: festId || '', info: text, erinnerung: null }; }
  }
  /** Übernehmen: Zeitleiste und To-do. */
  async function uebernehmen(r) {
    const c = finde(r.kontakt); if (!c) return false;
    const x = c.x;
    if (r.info) x.zeitleiste = [...(Array.isArray(x.zeitleiste) ? x.zeitleiste : []), { id: uid(), t: Date.now(), art: 'notiz', text: r.info, wer: werName() }];
    if (c.typ === 'kunde') await Kunden.speichern(x); else await Partner.speichern(x);
    if (r.erinnerung) await window.Todos?.anlegen({ text: `${r.erinnerung.text} (${c.name})`, faellig: r.erinnerung.datum || '', prio: 'mittel', wer: window.Pflege?.werVon?.(x) ?? '', bezug: c.typ === 'kunde' ? { kundeId: x.id } : { partnerId: x.id }, art: 'notiz' });
    return true;
  }
  /** Prüfzeile als Auswahlfenster: Übernehmen, Kontakt ändern, Verwerfen. */
  async function pruefen(r) {
    for (;;) {
      const c = finde(r.kontakt);
      const v = await sheet('Stimmt das so?', [
        { label: c ? c.name : 'Kontakt wählen', sub: c ? (c.typ === 'kunde' ? 'Kunde · tippen zum Ändern' : 'Partner · tippen zum Ändern') : 'Die KI hat keinen Kontakt erkannt', icon: icon('user'), value: 'kontakt' },
        ...(r.info ? [{ label: r.info, sub: 'kommt in die Zeitleiste', icon: icon('edit'), value: 'info' }] : []),
        ...(r.erinnerung ? [{ label: r.erinnerung.text, sub: `Erinnerung als To-do${r.erinnerung.datum ? ' am ' + tag(r.erinnerung.datum) : ' ohne Datum'} · tippen zum Weglassen`, icon: icon('bell'), value: 'erin' }] : []),
        ...(c ? [{ label: 'Übernehmen', icon: icon('check'), value: 'ok' }] : []),
      ], { suche: '' });
      if (!v) return false;
      if (v === 'ok') { await uebernehmen(r); toast(r.erinnerung ? 'Notiz und To-do angelegt' : 'Notiz eingetragen'); return true; }
      if (v === 'erin') r.erinnerung = null;
      if (v === 'info') { const t = prompt('Info', r.info); if (t !== null) r.info = t.trim(); }
      if (v === 'kontakt') {
        const id = await sheet('Zu wem gehört die Notiz?', kontakte().map((k) => ({ label: k.name, sub: [k.typ === 'kunde' ? 'Kunde' : 'Partner', k.extra].filter(Boolean).join(' · '), icon: icon(k.typ === 'kunde' ? 'user' : 'wrench'), value: k.id, such: k.extra })));
        if (id) r.kontakt = id;
      }
    }
  }
  async function verarbeiten(text, festId) {
    text = String(text || '').trim(); if (!text) return false;
    toast('Wird gelesen …', 2500);
    return pruefen(await erkennen(text, festId));
  }
  /** Karte „Kurz notieren“ (To-dos, Heute). neu: nach dem Übernehmen neu zeichnen. */
  function karte(el, neu) {
    if (!el) return;
    el.innerHTML = `<div class="card nz-karte"><b>Kurz notieren</b><span class="muted">z. B. „Herr Müller hat angerufen, Tochter heiratet im Mai, nächste Woche wegen Küche melden“. Tippen oder das Mikrofon der Tastatur nehmen.</span>
      <textarea id="nzText" rows="2" data-frei placeholder="Was gibt's Neues?"></textarea>
      <button type="button" class="btn small" id="nzGo">${icon('check')} Erkennen und prüfen</button></div>`;
    $('#nzGo', el).onclick = async () => { const t = $('#nzText', el).value; if (!t.trim()) return $('#nzText', el).focus(); if (await verarbeiten(t)) { $('#nzText', el).value = ''; neu?.(); } };
  }
  /** Nach „Kontakt halten → erledigt“: still fragen, was es Neues gab (leer lassen = nichts). */
  async function fragen(c) {
    const v = await sheet(`Was gab's Neues bei ${c.name}?`, [], { text: 'z. B. Sohn studiert jetzt, im Frühjahr Bad', suche: '' });
    if (v?.text) await verarbeiten(v.text, (c.typ === 'kunde' ? 'k:' : 'p:') + c.x.id);
  }
  return { karte, fragen, verarbeiten, erkennen, uebernehmen };
})();
