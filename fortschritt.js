'use strict';
/* Baufortschritt je Projekt: Arbeitsschritte zum Abhaken (z. B. Demontage, Rohinstallation, Fliesen).
 * Gespeichert im Projekt: w.schritte = [{ id, name, fertig (Zeitpunkt oder 0), wer, notiz }]
 * Vorlagen je Art (Bad, Küche, Allgemein) in Einstellungen → Baufortschritt, gespeichert in state.settings.bauVorlagen.
 * Baut auf app.js auf ($, $$, esc, icon, sheet, toast, state, uid, saveSettings). */
window.Fortschritt = (() => {
  const VORLAGEN = {
    bad: ['Demontage', 'Rohinstallation Sanitär', 'Elektro', 'Trockenbau / Vorwand', 'Verputz', 'Estrich', 'Abdichtung', 'Fliesen', 'Endmontage Sanitär', 'Malerarbeiten', 'Reinigung', 'Abnahme'],
    kueche: ['Demontage', 'Elektro', 'Wasser- und Abwasseranschlüsse', 'Verputz', 'Boden', 'Fliesenspiegel', 'Malerarbeiten', 'Küchenmontage', 'Abnahme'],
    allgemein: ['Demontage', 'Rohinstallation', 'Elektro', 'Verputz', 'Boden', 'Malerarbeiten', 'Endmontage', 'Reinigung', 'Abnahme'],
  };
  const NAMEN = { bad: 'Bad / WC', kueche: 'Küche', allgemein: 'Allgemein (alle anderen Räume)' };
  const artVon = (rt) => (rt === 'bad' || rt === 'gaeste-wc' ? 'bad' : rt === 'kueche' ? 'kueche' : 'allgemein');
  const vorlage = (a) => { const v = state.settings.bauVorlagen?.[a]; return Array.isArray(v) && v.length ? v : VORLAGEN[a]; };
  const tag = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

  /** Kurzfassung für die Projektliste: { n, fertig, naechster } oder null */
  function kurz(w) {
    const s = Array.isArray(w.schritte) ? w.schritte : [];
    if (!s.length) return null;
    return { n: s.length, fertig: s.filter((x) => x.fertig).length, naechster: s.find((x) => !x.fertig)?.name || '' };
  }
  /** Balken für eine Karte in der Projektliste */
  function balken(f) {
    if (!f?.n) return '';
    const p = Math.round((f.fertig / f.n) * 100);
    return `<span class="bf-bar"><i style="width:${p}%"></i></span><span class="bf-txt">${f.fertig} von ${f.n}${f.fertig === f.n ? ' · alles erledigt' : f.naechster ? ` · als Nächstes ${esc(f.naechster)}` : ''}</span>`;
  }

  /** Abschnitt im Projekt. raeume = Räume des Projekts (für die passende Vorlage), speichern = async () => … */
  function abschnitt(el, w, raeume, speichern) {
    if (!el) return;
    const render = () => {
      const s = Array.isArray(w.schritte) ? w.schritte : [];
      const f = kurz(w);
      const arten = [...new Set((raeume || []).map((r) => artVon(r.roomType)))];
      if (!arten.length) arten.push('allgemein');
      el.innerHTML = `<div class="sec-h"><h2>Baufortschritt</h2>${f ? `<span class="count">${f.fertig}/${f.n}</span>` : ''}</div>
        ${f ? `<div class="bf-kopf">${balken(f)}</div>` : ''}
        <div class="card bf">
          ${s.length ? s.map((x, i) => `<div class="bf-z ${x.fertig ? 'ok' : ''}" data-i="${i}">
              <button class="bf-ck" data-ck aria-label="${x.fertig ? 'Nicht erledigt' : 'Erledigt'}">${x.fertig ? icon('check') : ''}</button>
              <button class="bf-t" data-ed><b>${esc(x.name)}</b>${x.fertig || x.notiz ? `<small>${[x.fertig && `erledigt ${tag(x.fertig)}${x.wer ? ' · ' + esc(x.wer) : ''}`, x.notiz && esc(x.notiz)].filter(Boolean).join(' · ')}</small>` : ''}</button>
            </div>`).join('')
            : `<p class="hint" style="margin:0 0 10px">Lege die Arbeitsschritte an und hake sie ab, sobald sie erledigt sind. Zum Start eine Vorlage übernehmen:</p>
              <div class="chips">${arten.map((a) => `<button class="qchip" data-vl="${a}">${icon('plus')} Vorlage ${esc(NAMEN[a].replace(' (alle anderen Räume)', ''))}</button>`).join('')}</div>`}
          <div class="bf-neu"><input type="text" id="bfNeu" placeholder="Neuer Schritt, z. B. Elektro-Abnahme" autocomplete="off"><button class="btn small" id="bfAdd" aria-label="Schritt hinzufügen">${icon('plus')}</button></div>
        </div>`;
      const sichern = async () => { await speichern(); render(); };
      $$('[data-vl]', el).forEach((b) => (b.onclick = async () => { w.schritte = vorlage(b.dataset.vl).map((name) => ({ id: uid(), name, fertig: 0, wer: '', notiz: '' })); await sichern(); }));
      const add = async () => { const v = $('#bfNeu', el).value.trim(); if (!v) return; (w.schritte ||= []).push({ id: uid(), name: v, fertig: 0, wer: '', notiz: '' }); await sichern(); $('#bfNeu', el)?.focus(); };
      $('#bfAdd', el).onclick = add;
      $('#bfNeu', el).onkeydown = (e) => { if (e.key === 'Enter') add(); };
      $$('[data-i]', el).forEach((z) => {
        const i = +z.dataset.i, x = w.schritte[i];
        $('[data-ck]', z).onclick = async () => {
          x.fertig = x.fertig ? 0 : Date.now();
          x.wer = x.fertig ? wer() : '';
          await sichern();
          if (x.fertig) toast(w.schritte.every((y) => y.fertig) ? 'Alle Schritte erledigt. Oben im Status kannst du die Baustelle abschließen.' : `${x.name} erledigt`, 4000);
        };
        $('[data-ed]', z).onclick = async () => {
          const v = await sheet(x.name, [
            { label: 'Notiz', sub: x.notiz || 'z. B. Fliesenleger Kaya, Nacharbeit Ecke', icon: icon('edit'), value: 'notiz' },
            ...(i > 0 ? [{ label: 'Nach oben', icon: icon('up'), value: 'hoch' }] : []),
            ...(i < w.schritte.length - 1 ? [{ label: 'Nach unten', icon: icon('down'), value: 'runter' }] : []),
            { label: 'Löschen', icon: icon('trash'), value: 'weg' },
          ], { text: 'Umbenennen', value: x.name });
          if (!v) return;
          if (typeof v === 'object') x.name = v.text;
          else if (v === 'notiz') { const n = prompt('Notiz zu diesem Schritt', x.notiz || ''); if (n === null) return; x.notiz = n.trim(); }
          else if (v === 'hoch') w.schritte.splice(i - 1, 0, w.schritte.splice(i, 1)[0]);
          else if (v === 'runter') w.schritte.splice(i + 1, 0, w.schritte.splice(i, 1)[0]);
          else if (v === 'weg') { if (!confirm(`„${x.name}“ löschen?`)) return; w.schritte.splice(i, 1); }
          await sichern();
        };
      });
    };
    render();
  }

  /** Wer gerade abhakt: Team-Person passend zur Anmeldung im Cloud-Abgleich, sonst leer */
  function wer() {
    try {
      const mail = (JSON.parse(localStorage.getItem('dom:syncCfg') || 'null')?.email || '').toLowerCase();
      const p = mail && (window.Kalender?.team() || []).find((x) => (x.email || '').toLowerCase() === mail);
      return p ? p.name.split(/\s+/)[0] : '';
    } catch { return ''; }
  }

  /** Einstellungen → Baufortschritt: Vorlagen bearbeiten (ein Schritt pro Zeile) */
  function einstellungen() {
    const S = state.settings;
    main().innerHTML = `<p class="hint" style="margin-top:0">Diese Schritte übernimmst du im Projekt mit einem Tipp und kannst sie dort je Auftrag anpassen. Ein Schritt pro Zeile.</p>
      ${Object.keys(VORLAGEN).map((a) => `<div class="card kform"><label style="margin-top:0">${esc(NAMEN[a])}</label>
        <textarea data-bv="${a}" rows="${Math.min(14, vorlage(a).length + 1)}">${esc(vorlage(a).join('\n'))}</textarea>
        <button class="link-danger" data-bvr="${a}" style="margin-top:6px">Auf Standard zurücksetzen</button></div>`).join('')}`;
    const save = debounce(saveSettings, 400);
    $$('[data-bv]').forEach((ta) => (ta.oninput = () => { S.bauVorlagen ??= {}; S.bauVorlagen[ta.dataset.bv] = ta.value.split('\n').map((x) => x.trim()).filter(Boolean); save(); }));
    $$('[data-bvr]').forEach((b) => (b.onclick = async () => { if (S.bauVorlagen) delete S.bauVorlagen[b.dataset.bvr]; await saveSettings(); einstellungen(); }));
  }

  return { abschnitt, kurz, balken, einstellungen, VORLAGEN };
})();
