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
      // Nach Räumen aufgeteilt wie im Angebot: Überschrift, sobald es mehr als einen Raum gibt
      const mehrRaeume = new Set(s.map((x) => x.raum || '')).size > 1;
      const raumKopf = (x, i) => (mehrRaeume && (i === 0 || (s[i - 1].raum || '') !== (x.raum || '')) ? `<div class="bf-raum">${esc(x.raum || 'Allgemein')}</div>` : '');
      el.innerHTML = `<div class="sec-h"><h2>Leistungen und Baufortschritt</h2>${f ? `<span class="count">${f.fertig}/${f.n}</span>` : ''}</div>
        ${f ? `<div class="bf-kopf">${balken(f)}</div>` : ''}
        <div class="card bf">
          ${s.length ? s.map((x, i) => `${raumKopf(x, i)}<div class="bf-z ${x.fertig ? 'ok' : ''}" data-i="${i}">
              <button class="bf-ck" data-ck aria-label="${x.fertig ? 'Nicht erledigt' : 'Erledigt'}">${x.fertig ? icon('check') : ''}</button>
              <button class="bf-t" data-ed><b><span class="bf-nr">${esc(x.nr || String(i + 1))}${/[.)]$/.test(x.nr || '') ? '' : '.'}</span> ${esc(x.name)}</b>${x.fertig || x.notiz ? `<small>${[x.fertig && `erledigt ${tag(x.fertig)}${x.wer ? ' · ' + esc(x.wer) : ''}`, x.notiz && esc(x.notiz)].filter(Boolean).join(' · ')}</small>` : ''}</button>
              ${s.length > 1 ? `<span class="bf-grip" data-grip aria-label="Zum Verschieben ziehen">${icon('list')}</span>` : ''}
            </div>`).join('')
            : `<p class="hint" style="margin:0 0 10px">Hake jede Leistung ab, sobald sie erledigt ist. Am einfachsten übernimmst du die Leistungen aus dem Angebot (ohne Preise, nach Räumen), oder eine Vorlage:</p>
              ${window.Rechnung ? `<button class="btn block" data-vl="angebot" style="margin-bottom:8px">${icon('clipboard')} Leistungen aus dem Angebot übernehmen</button>` : ''}
              <div class="chips">${arten.map((a) => `<button class="qchip" data-vl="${a}">${icon('plus')} Vorlage ${esc(NAMEN[a].replace(' (alle anderen Räume)', ''))}</button>`).join('')}</div>`}
          <div class="bf-neu"><input type="text" id="bfNeu" placeholder="Neuer Schritt, z. B. Elektro-Abnahme" autocomplete="off"><button class="btn small" id="bfAdd" aria-label="Schritt hinzufügen">${icon('plus')}</button></div>
        </div>`;
      const sichern = async () => { await speichern(); render(); };
      $$('[data-vl]', el).forEach((b) => (b.onclick = async () => {
        if (b.dataset.vl === 'angebot') {
          const a = await window.Rechnung.auftrag(w);
          const l = [...a.zeilen.map((z) => ({ name: z.text, raum: z.raum || '', menge: z.menge, einheit: z.einheit })), ...a.nachtraege.map((n) => ({ name: n.text || 'Nachtrag', raum: 'Nachträge', menge: n.menge, einheit: n.einheit }))];
          if (!l.length) return toast('Im Angebot stehen noch keine Positionen.');
          const mengeText = (x) => (x.menge && !(x.menge === 1 && /pausch/i.test(x.einheit || '')) ? `${String(x.menge).replace('.', ',')} ${x.einheit || ''}`.trim() : '');
          w.schritte = l.map((x) => ({ id: uid(), name: x.name, raum: x.raum, fertig: 0, wer: '', notiz: mengeText(x) }));
        } else w.schritte = vorlage(b.dataset.vl).map((name) => ({ id: uid(), name, fertig: 0, wer: '', notiz: '' }));
        await sichern();
      }));
      const add = async () => { const v = $('#bfNeu', el).value.trim(); if (!v) return; (w.schritte ||= []).push({ id: uid(), name: v, raum: w.schritte.at(-1)?.raum || '', fertig: 0, wer: '', notiz: '' }); await sichern(); $('#bfNeu', el)?.focus(); };
      $('#bfAdd', el).onclick = add;
      // Ziehen am Griff rechts: Schritt verschieben. Danach werden die Nummern der Reihe nach neu gezählt.
      $$('[data-grip]', el).forEach((g) => (g.onpointerdown = (e) => {
        e.preventDefault();
        const zeile = g.closest('[data-i]'), von = +zeile.dataset.i, rows = $$('[data-i]', el);
        const hoehe = zeile.getBoundingClientRect().height, y0 = e.clientY;
        let nach = von;
        zeile.classList.add('zieht');
        try { g.setPointerCapture(e.pointerId); } catch {}
        const bewegen = (m) => {
          const dy = m.clientY - y0;
          zeile.style.transform = `translateY(${dy}px)`;
          nach = Math.max(0, Math.min(rows.length - 1, von + Math.round(dy / hoehe)));
          rows.forEach((r, j) => { if (r === zeile) return; r.style.transform = j > von && j <= nach ? `translateY(${-hoehe}px)` : j < von && j >= nach ? `translateY(${hoehe}px)` : ''; });
        };
        // An window hängen, damit das Ziehen auch klappt, wenn der Finger den Griff verlässt
        window.addEventListener('pointermove', bewegen);
        const ende = async () => {
          window.removeEventListener('pointermove', bewegen); window.removeEventListener('pointerup', ende); window.removeEventListener('pointercancel', ende);
          rows.forEach((r) => (r.style.transform = '')); zeile.classList.remove('zieht');
          if (nach === von) return;
          w.schritte.splice(nach, 0, w.schritte.splice(von, 1)[0]);
          w.schritte.forEach((y) => delete y.nr);
          await sichern();
        };
        window.addEventListener('pointerup', ende); window.addEventListener('pointercancel', ende);
      }));
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
            { label: 'Nummer ändern', sub: `Jetzt Nummer ${x.nr || i + 1}. Eigene Nummer eintippen, z. B. 3, 2.1 oder 4a`, icon: icon('list'), value: 'nr' },
            { label: 'Löschen', icon: icon('trash'), value: 'weg' },
          ], { text: 'Umbenennen', value: x.name });
          if (!v) return;
          if (typeof v === 'object') x.name = v.text;
          else if (v === 'notiz') { const n = prompt('Notiz zu diesem Schritt', x.notiz || ''); if (n === null) return; x.notiz = n.trim(); }
          else if (v === 'nr') {
            // Freie Nummer eintippen; die Liste sortiert sich danach (1, 2, 2.1, 2a, 3, 10 …)
            const n = await sheet(`${x.name}: welche Nummer?`, [{ label: 'Nummer entfernen', sub: 'Schritt wieder automatisch zählen', icon: icon('x'), value: '__weg' }], { text: 'Nummer eintippen, z. B. 3 oder 2.1', value: x.nr || String(i + 1) });
            if (n == null) return;
            // Alle Schritte bekommen ihre bisherige Nummer fest, damit sich nur der geänderte verschiebt
            w.schritte.forEach((y, j) => { if (!y.nr) y.nr = String(j + 1); });
            if (n === '__weg') delete x.nr; else if (n.text?.trim()) x.nr = n.text.trim().replace(/\.$/, '');
            const key = (y) => String(y.nr || '9999').split(/[.\s]+/).map((t) => t.replace(/\d+/, (d) => d.padStart(5, '0'))).join('.');
            w.schritte.sort((a, b) => key(a).localeCompare(key(b), 'de'));
          }
          else if (v === 'weg') { if (!loeschFrage(`„${x.name}“ löschen?`)) return; w.schritte.splice(i, 1); }
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
    main().innerHTML = `<p class="hint" style="margin-top:0">Diese Schritte übernimmst du im Projekt mit einem Tipp und kannst sie dort je Auftrag anpassen. Von oben nach unten in der Reihenfolge, in der gearbeitet wird. Mit dem Pfeil schiebst du einen Schritt nach oben.</p>
      ${Object.keys(VORLAGEN).map((a) => `<div class="card kform"><label style="margin-top:0">${esc(NAMEN[a])}</label>
        ${listenFeld(a, vorlage(a), 'Neuer Arbeitsschritt')}
        <button class="link-danger" data-bvr="${a}" style="margin-top:6px">Auf Standard zurücksetzen</button></div>`).join('')}`;
    $$('[data-lf]').forEach((box) => listenBinden(box, vorlage(box.dataset.lf), async (l) => {
      S.bauVorlagen ??= {}; S.bauVorlagen[box.dataset.lf] = l; await saveSettings(); toast('Gespeichert');
      const y = window.scrollY; einstellungen(); window.scrollTo(0, y);
    }));
    $$('[data-bvr]').forEach((b) => (b.onclick = async () => { if (S.bauVorlagen) delete S.bauVorlagen[b.dataset.bvr]; await saveSettings(); einstellungen(); }));
  }

  return { abschnitt, kurz, balken, einstellungen, VORLAGEN };
})();
