'use strict';
/* DOM – Sperre für Kunden und Subunternehmer (seit v113, Runde 13, P2). Intern, der Kunde sieht davon nichts.
 * x.sperre = { an, grund (aus Vorgabe 'sperrGruende'), text, t, wer, log: [{ was: 'gesperrt' | 'entsperrt' | 'ausnahme', grund, text, t, wer, wofuer }] }
 * Gesperrte sind in Listen ausgegraut, die Akte zeigt ein rotes Banner. Beim Anlegen von Termin oder Angebot und bei der Auswahl
 * eines Subs geht es nur mit „Trotzdem fortfahren“ und Begründung weiter (einmalige Ausnahme) oder nach dem Entsperren.
 * Laufende Projekte gesperrter Subs laufen weiter. Felix und Deniel dürfen sperren und entsperren, alles wird protokolliert. */
window.Sperre = (() => {
  const ist = (x) => !!x?.sperre?.an;
  const wer = () => { const id = window.Kalender?.wer() || ''; return id ? (window.Kalender.team().find((p) => p.id === id)?.name.split(' ')[0] || id) : 'Felix oder Deniel'; };
  const datum = (t) => (t ? new Date(t).toLocaleDateString('de-DE') : '');
  const log = (x, e) => { x.sperre ??= { an: false, log: [] }; (x.sperre.log ??= []).push({ t: Date.now(), wer: wer(), ...e }); };

  /** Rotes Banner für die Akte (leer, wenn nicht gesperrt). */
  const banner = (x) => (ist(x) ? `<div class="sperre-banner" role="alert">${icon('x')}<span><b>Gesperrt${x.sperre.grund ? ': ' + esc(x.sperre.grund) : ''}</b>${x.sperre.text ? ` · ${esc(x.sperre.text)}` : ''}<small>seit ${esc(datum(x.sperre.t))}${x.sperre.wer ? ` · von ${esc(x.sperre.wer)}` : ''}</small></span></div>` : '');

  /** Sperren: Grund aus der Liste, dazu Freitext. true, wenn gesperrt wurde. */
  async function sperren(x) {
    const g = await sheet('Warum sperren?', (vorgabe('sperrGruende') || []).map((v) => ({ label: v, value: v })), { text: 'Oder eigener Grund', suche: '' });
    if (g === null || g === undefined) return false;
    const grund = typeof g === 'object' ? String(g.text || '').trim() : g;
    if (!grund) return false;
    const text = prompt('Was genau ist passiert? (optional, nur intern)', '') ?? '';
    x.sperre = { ...(x.sperre || { log: [] }), an: true, grund, text: text.trim(), t: Date.now(), wer: wer() };
    log(x, { was: 'gesperrt', grund, text: text.trim() });
    return true;
  }
  function entsperren(x) {
    if (!ist(x)) return false;
    const text = prompt('Warum entsperren? (wird protokolliert)', '');
    if (text === null) return false;
    x.sperre.an = false;
    log(x, { was: 'entsperrt', text: text.trim() });
    return true;
  }
  /** Vor dem Anlegen eines Termins oder Angebots bzw. der Auswahl eines Subs. persist(x) speichert. true = weitermachen. */
  async function pruefen(x, wofuer, persist) {
    if (!ist(x)) return true;
    const nm = x.firma || window.Kunden?.name(x) || 'Dieser Eintrag';
    const v = await sheet(`${nm} ist gesperrt`, [
      { label: 'Abbrechen', icon: icon('x'), value: 'nein' },
      { label: 'Trotzdem fortfahren', sub: 'Einmalige Ausnahme mit Begründung, wird protokolliert', icon: icon('check'), value: 'ausnahme' },
      { label: 'Entsperren', sub: 'Sperre aufheben, wird protokolliert', icon: icon('refresh'), value: 'frei' },
    ], { text: '' }).catch(() => null);
    if (v === 'ausnahme') {
      const text = prompt(`Begründung für die Ausnahme (${x.sperre.grund || 'gesperrt'}):`, '');
      if (!text?.trim()) { toast('Ohne Begründung geht es nicht weiter.'); return false; }
      log(x, { was: 'ausnahme', text: text.trim(), wofuer });
      await persist?.(x);
      return true;
    }
    if (v === 'frei') { if (!entsperren(x)) return false; await persist?.(x); toast('Entsperrt'); return true; }
    return false;
  }
  /** Abschnitt in der Akte: Sperren-Knopf bzw. Entsperren und Protokoll. */
  function abschnitt(el, x, persist, neu) {
    if (!el) return;
    const l = (x.sperre?.log || []).slice().reverse();
    el.innerHTML = `<details class="sperre-box"${ist(x) ? ' open' : ''}><summary>${icon('x')}<span>${ist(x) ? 'Gesperrt' : 'Sperren'}</span>${l.length ? `<small class="muted">${l.length} ${l.length === 1 ? 'Eintrag' : 'Einträge'}</small>` : ''}</summary>
      ${ist(x) ? `<button type="button" class="btn secondary small" data-sp="frei">${icon('refresh')} Entsperren</button>` : `<p class="hint">Gesperrt heißt: in Listen ausgegraut, rotes Banner, beim Anlegen von Termin oder Angebot und bei der Auswahl als Sub nur mit Begründung weiter. Laufende Projekte laufen weiter.</p><button type="button" class="btn secondary small" data-sp="an">${icon('x')} Sperren</button>`}
      ${l.length ? `<div class="sperre-log">${l.map((e) => `<div><b>${esc({ gesperrt: 'Gesperrt', entsperrt: 'Entsperrt', ausnahme: 'Ausnahme' }[e.was] || e.was)}</b> ${esc(datum(e.t))} · ${esc(e.wer || '')}${e.grund ? ` · ${esc(e.grund)}` : ''}${e.text ? ` · ${esc(e.text)}` : ''}${e.wofuer ? ` · ${esc(e.wofuer)}` : ''}</div>`).join('')}</div>` : ''}</details>`;
    const b = $('[data-sp]', el);
    b.onclick = async () => {
      const ok = b.dataset.sp === 'an' ? await sperren(x) : entsperren(x);
      if (!ok) return;
      await persist(x); neu?.();
    };
  }
  return { ist, banner, sperren, entsperren, pruefen, abschnitt };
})();
