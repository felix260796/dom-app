'use strict';
/* DOM – To-dos (seit v111, Umbau Runde 13, P2): ein eigener Bereich mit allen offenen Aufgaben, am PC und am iPhone.
 * Speicher: 'todo:<id>' { id, text, prio: 'hoch' | 'mittel' | 'niedrig', faellig (JJJJ-MM-TT oder ''), wer (Team-ID aus Kalender.team(), '' = beide),
 *   bezug: { kundeId, partnerId, vorgangId }, art ('frei' | 'dank' | …), schluessel (gegen doppelte automatische To-dos),
 *   erledigt (Zeitpunkt oder 0), von (wer angelegt hat), created }.
 * Andere Bereiche legen To-dos still an (keine Pop-ups): Todos.anlegen({ text, … , schluessel }).
 * Seite: Menü › To-dos (state.tab = 'todos'). „Heute“ zeigt die To-dos für heute, morgen und diese Woche (heute.js). */
window.Todos = (() => {
  const alle = new Map();
  const key = (id) => 'todo:' + id;
  const PRIO = [['hoch', 'Hoch'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']];
  const PRANG = { hoch: 0, mittel: 1, niedrig: 2 };
  let filter = null; // Person (Team-ID) oder '' = alle; Standard: wem das Gerät gehört
  let zeigeErledigt = false;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  /** Letzter Tag dieser Woche (Sonntag). */
  const wochenEnde = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return iso(d); };
  const tag = (s) => new Date(s + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const team = () => window.Kalender?.team() || [];
  const werName = (id) => (id ? team().find((p) => p.id === id)?.name.split(' ')[0] || id : 'Beide');
  const ich = () => window.Kalender?.wer() || '';

  async function laden() {
    const d = await db();
    const list = await new Promise((res) => { const q = d.transaction('kv').objectStore('kv').getAll(IDBKeyRange.bound('todo:', 'todo:￿')); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    alle.clear();
    for (const t of list) if (t?.id) alle.set(t.id, norm(t));
  }
  const norm = (t) => { t.text = String(t.text || ''); t.prio = PRANG[t.prio] !== undefined ? t.prio : 'mittel'; t.faellig = String(t.faellig || ''); t.wer = String(t.wer || ''); t.bezug ??= {}; t.erledigt = +t.erledigt || 0; return t; };
  async function speichern(t) { t.updated = Date.now(); alle.set(t.id, t); await kvSet(key(t.id), t); }
  /** Neues To-do. Mit schluessel wird ein schon vorhandenes (auch erledigtes) nicht doppelt angelegt. */
  async function anlegen(f) {
    if (!alle.size) await laden();
    if (f.schluessel && [...alle.values()].some((t) => t.schluessel === f.schluessel)) return null;
    const t = norm({ id: uid(), prio: 'mittel', faellig: '', wer: ich(), bezug: {}, art: 'frei', erledigt: 0, von: ich(), created: Date.now(), ...f });
    await speichern(t);
    return t;
  }
  /** Sortierung: Überfälliges zuerst, dann nach Datum, innerhalb eines Tages nach Priorität; ohne Datum ans Ende. */
  const reihe = (a, b) => (a.faellig || '9999').localeCompare(b.faellig || '9999') || PRANG[a.prio] - PRANG[b.prio] || (a.created || 0) - (b.created || 0);
  const fuer = (t, wer) => !wer || !t.wer || t.wer === wer;
  /** Offene To-dos, optional nur für eine Person (To-dos für beide zählen immer mit). */
  const offen = (wer = '') => [...alle.values()].filter((t) => !t.erledigt && fuer(t, wer)).sort(reihe);
  /** Für „Heute“: { heute (überfällig + heute), morgen, woche } für die Person, der das Gerät gehört. */
  function zeitraeume() {
    const h = plus(0), m = plus(1), we = wochenEnde();
    const l = offen(ich());
    return {
      heute: l.filter((t) => t.faellig && t.faellig <= h),
      morgen: l.filter((t) => t.faellig === m),
      woche: l.filter((t) => t.faellig && t.faellig > h && t.faellig <= (we < m ? m : we)),
      ohne: l.filter((t) => !t.faellig),
    };
  }

  // ---------- Darstellung ----------
  const PFARBE = { hoch: '#c0392b', mittel: '#b7791f', niedrig: '#8a94a3' };
  function bezugText(t) {
    const b = t.bezug || {};
    const k = b.kundeId && window.Kunden?.byId(b.kundeId), p = b.partnerId && window.Partner?.byId?.(b.partnerId);
    return [k && Kunden.name(k), p && p.firma].filter(Boolean).join(' · ');
  }
  /** Eine Zeile mit Haken zum Erledigen. */
  function zeile(t) {
    const h = plus(0);
    const wann = !t.faellig ? '' : t.faellig < h ? `überfällig seit ${tag(t.faellig)}` : t.faellig === h ? 'heute' : t.faellig === plus(1) ? 'morgen' : tag(t.faellig);
    return `<div class="td-z${t.erledigt ? ' erl' : ''}" data-td="${t.id}">
      <button type="button" class="td-haken" data-tdok="${t.id}" aria-label="${t.erledigt ? 'Wieder öffnen' : 'Erledigt'}">${t.erledigt ? icon('check') : ''}</button>
      <button type="button" class="td-t" data-tdedit="${t.id}"><b>${esc(t.text || 'Ohne Text')}</b>
        <span class="muted"><i class="td-prio" style="background:${PFARBE[t.prio]}"></i>${esc([PRIO.find((p) => p[0] === t.prio)[1], wann, werName(t.wer), bezugText(t)].filter(Boolean).join(' · '))}</span></button></div>`;
  }
  /** Zeilen in einem Container binden (Erledigt-Haken, Bearbeiten). */
  function binden(el, neu) {
    $$('[data-tdok]', el).forEach((b) => (b.onclick = async () => {
      const t = alle.get(b.dataset.tdok); if (!t) return;
      t.erledigt = t.erledigt ? 0 : Date.now(); await speichern(t);
      if (t.erledigt) toast('Erledigt', 4000, { label: 'Rückgängig', fn: async () => { t.erledigt = 0; await speichern(t); neu?.(); } });
      neu?.();
    }));
    $$('[data-tdedit]', el).forEach((b) => (b.onclick = () => bearbeiten(alle.get(b.dataset.tdedit), neu)));
  }

  /** Bearbeiten oder neu anlegen (t = null): Text, Priorität, Datum, für wen. */
  function bearbeiten(t, fertig, vor = {}) {
    const neu = !t;
    t ??= norm({ id: uid(), prio: 'mittel', faellig: '', wer: ich(), bezug: {}, art: 'frei', erledigt: 0, von: ich(), created: Date.now(), ...vor });
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    const knopf = (name, wert, l, an) => `<button type="button" data-${name}="${esc(wert)}" class="${an ? 'on' : ''}">${esc(l)}</button>`;
    bg.innerHTML = `<div class="sheet" role="dialog" aria-label="To-do"><div class="sheet-h"><b>${neu ? 'Neues To-do' : 'To-do'}</b><button class="icon-btn" data-zu aria-label="Schließen">${icon('x')}</button></div>
      <div class="kform" style="padding:0 16px 16px">
        <label style="margin-top:0">Was ist zu tun?</label><textarea id="tdText" data-frei placeholder="z. B. Frau Müller wegen Fliesenfarbe anrufen">${esc(t.text)}</textarea>
        <label>Priorität</label><div class="seg2 full" id="tdPrio">${PRIO.map(([v, l]) => knopf('p', v, l, t.prio === v)).join('')}</div>
        <label>Bis wann?</label><div class="seg2 full" id="tdSchnell">${[['', 'Ohne'], [plus(0), 'Heute'], [plus(1), 'Morgen'], [wochenEnde(), 'Diese Woche']].map(([v, l]) => knopf('d', v, l, t.faellig === v)).join('')}</div>
        <input type="date" id="tdDatum" value="${esc(t.faellig)}" style="margin-top:8px">
        <label>Für wen?</label><div class="seg2 full" id="tdWer">${[...team().map((p) => [p.id, p.name.split(' ')[0]]), ['', 'Beide']].map(([v, l]) => knopf('w', v, l, t.wer === v)).join('')}</div>
        ${bezugText(t) ? `<p class="hint">Gehört zu: ${esc(bezugText(t))}</p>` : ''}
        <button class="btn block" id="tdOk" style="margin-top:14px">${icon('check')} Speichern</button>
        ${neu ? '' : `<button class="link-danger" id="tdDel">${icon('trash')} To-do löschen</button>`}
      </div></div>`;
    document.body.appendChild(bg);
    requestAnimationFrame(() => bg.classList.add('on'));
    const zu = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg || e.target.closest('[data-zu]')) zu(); };
    const wahl = (box, attr, set) => $$(`[data-${attr}]`, box).forEach((b) => (b.onclick = () => { $$(`[data-${attr}]`, box).forEach((x) => x.classList.toggle('on', x === b)); set(b.dataset[attr]); }));
    wahl($('#tdPrio', bg), 'p', (v) => (t.prio = v));
    wahl($('#tdSchnell', bg), 'd', (v) => { t.faellig = v; $('#tdDatum', bg).value = v; });
    wahl($('#tdWer', bg), 'w', (v) => (t.wer = v));
    $('#tdDatum', bg).onchange = (e) => { t.faellig = e.target.value; $$('[data-d]', bg).forEach((x) => x.classList.toggle('on', x.dataset.d === t.faellig)); };
    $('#tdOk', bg).onclick = async () => {
      t.text = $('#tdText', bg).value.trim();
      if (!t.text) { toast('Bitte eintragen, was zu tun ist.'); return; }
      await speichern(t); zu(); fertig?.();
    };
    if ($('#tdDel', bg)) $('#tdDel', bg).onclick = async () => {
      if (!loeschFrage(`To-do „${t.text}“ löschen?`)) return;
      alle.delete(t.id); await kvDel(key(t.id)); zu(); fertig?.();
    };
    if (neu) setTimeout(() => $('#tdText', bg)?.focus(), 80);
  }

  async function view() {
    header('To-dos', 'Alles, was noch offen ist');
    await laden();
    if (state.tab !== 'todos') return;
    if (filter === null) filter = ich();
    const h = plus(0), m = plus(1), we = wochenEnde();
    const l = offen(filter);
    const gruppen = [
      ['Überfällig', l.filter((t) => t.faellig && t.faellig < h)],
      ['Heute', l.filter((t) => t.faellig === h)],
      ['Morgen', l.filter((t) => t.faellig === m)],
      ['Diese Woche', l.filter((t) => t.faellig > m && t.faellig <= we)],
      ['Später', l.filter((t) => t.faellig > we && t.faellig > m)],
      ['Ohne Datum', l.filter((t) => !t.faellig)],
    ].filter(([, xs]) => xs.length);
    const erl = [...alle.values()].filter((t) => t.erledigt && fuer(t, filter)).sort((a, b) => b.erledigt - a.erledigt).slice(0, 50);
    main().innerHTML = `
      <button class="cta slim" id="tdNeu"><span class="cta-ico">${icon('plus')}</span><span class="cta-t"><b>Neues To-do</b></span>${icon('chevron', 'cta-chev')}</button>
      <div id="tdNotiz" style="margin-top:12px"></div>
      <div class="seg2 full" style="margin-top:12px">${[...team().map((p) => [p.id, p.name.split(' ')[0]]), ['', 'Alle']].map(([id, n]) => `<button data-tdf="${esc(id)}" class="${filter === id ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>
      ${gruppen.map(([titel, xs]) => `<div class="sec-h"><h2>${esc(titel)}</h2><span class="count">${xs.length}</span></div><div class="card td-liste">${xs.map(zeile).join('')}</div>`).join('')
        || `<div class="empty-state">${icon('check')}<b>Nichts offen</b><span>Neue To-dos legst du oben an. Andere entstehen von selbst, zum Beispiel „Bei … bedanken“ nach einer Empfehlung.</span></div>`}
      ${erl.length ? `<button type="button" class="link-add" id="tdErl" style="margin-top:14px">${icon('check')} ${zeigeErledigt ? 'Erledigte ausblenden' : `Erledigte zeigen (${erl.length})`}</button>
        ${zeigeErledigt ? `<div class="card td-liste">${erl.map(zeile).join('')}</div>` : ''}` : ''}`;
    $('#tdNeu').onclick = () => bearbeiten(null, view);
    window.Notiz?.karte($('#tdNotiz'), view); // Kurz notieren: KI erkennt Kontakt, Info, Erinnerung
    $$('[data-tdf]').forEach((b) => (b.onclick = () => { filter = b.dataset.tdf; view(); }));
    if ($('#tdErl')) $('#tdErl').onclick = () => { zeigeErledigt = !zeigeErledigt; view(); };
    binden(main(), view);
  }

  /** To-do still erledigen (z. B. das alte Nachfass-To-do nach „Nachgefasst“, v142). */
  async function erledigen(id) { const t = alle.get(id); if (!t || t.erledigt) return; t.erledigt = Date.now(); await speichern(t); }
  return { laden, anlegen, erledigen, offen, zeitraeume, zeile, binden, bearbeiten, view, liste: () => [...alle.values()] };
})();
