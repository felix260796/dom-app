'use strict';
/* DOM – Angebot als Tabelle wie in Excel (Wunsch Felix 14.11.: „am Computer eine richtige Bearbeitungssoftware“).
 * Nur am Computer (Windows-Programm oder breiter Bildschirm mit Maus), im Büro Schritt 3 „Positionen“ (projekt.js).
 * Alle Bereiche des Angebots in einer Tabelle: Pos., Bereich, Leistung, Menge, Einheit, EP netto, GP netto.
 * Tastatur wie in Excel: Pfeiltasten, Enter (nach unten), Tab (nach rechts), Strg+Enter neue Zeile, Strg+Entf Zeile löschen.
 * Zeilen aus Excel einfügen (Strg+V, Spalten Leistung, Menge, Einheit, Preis), als Excel-Datei speichern oder eine einlesen.
 * Daten bleiben dieselben wie am iPhone/iPad: r.angebot.positionen je Raum (Preisliste: nr, eigene Zeile: x.frei, eigener Preis: x.epFix). */
window.Tabelle = (() => {
  const num = (v) => { const s = String(v ?? '').replace(/\s|€/g, ''); const n = parseFloat(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : 0; };
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const zahl = (x, d = 2) => (+x || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const mengeText = (x) => (x || x === 0 ? (+x).toLocaleString('de-DE', { maximumFractionDigits: 3 }) : '');
  const SPALTEN = ['bereich', 'text', 'menge', 'einheit', 'ep'];

  /** Am Computer? (Windows-Programm, oder breiter Bildschirm mit Maus; nicht am iPad mit Finger oder Stift) */
  const istBuero = () => document.documentElement.classList.contains('desktop') || matchMedia('(min-width: 1100px) and (pointer: fine)').matches;

  let letzteZelle = null; // nach dem Neuzeichnen wieder dorthin

  async function angebot(box, w, list, neuZeichnen) {
    if (!box) return;
    const A = window.Angebot._intern, PL = await A.preisliste();
    const kat = (nr) => PL.positionen.find((x) => x.nr === nr);
    const raumName = (r) => r.aufmass?.raeume?.[0]?.name || r.room || '';
    const titel = (r) => r.room || r.aufmass?.raeume?.[0]?.name || 'Bereich';
    list.forEach((r) => A.init(r));
    const sichern = async (r) => { await saveProject(r); if (w.isNew) { delete w.isNew; await Projekt.save(w); } };

    function zeichnen() {
      const zeilen = [];
      let gesNetto = 0;
      list.forEach((r, ri) => {
        const P = r.angebot.positionen || [];
        const S = A.summen(P, r.angebot.kalk);
        gesNetto += S.netto;
        P.forEach((x, i) => {
          const z = S.zeilen.find((y) => y.i === i);
          zeilen.push({ r, ri, x, i, text: z?.it.text || x.frei?.text || '', einheit: z?.it.einheit || x.frei?.einheit || '', ep: z?.ep || 0, gp: z?.gp || 0, fix: !!z?.fix });
        });
      });
      const mwst = r2(gesNetto * (A.einstellungen().mwst || 0.19));
      const nrIn = {}, gNr = {}; let g = 0;
      list.forEach((r, ri) => { if ((r.angebot.positionen || []).length) gNr[ri] = ++g; });
      const marke = (x) => x.ki?.partner && !(x.sub?.ep > 0) ? '<span class="xt-m p" title="Preis kommt vom Partner">P</span>' : x.ki?.sicher === 'geschaetzt' ? '<span class="xt-m g" title="Menge geschätzt, bitte prüfen">?</span>' : x.sub ? '<span class="xt-m s" title="Vom Partner übernommen">S</span>' : '';
      const sel = (wahl) => `<select data-c="bereich" aria-label="Bereich">${list.map((r) => `<option value="${r.id}" ${r.id === wahl ? 'selected' : ''}>${esc(titel(r))}</option>`).join('')}</select>`;
      box.innerHTML = `
        <div class="xt-leiste">
          <button type="button" class="btn secondary small" data-xa="neu">${icon('plus')} Zeile</button>
          <button type="button" class="btn secondary small" data-xa="weg">${icon('trash')} Zeile löschen</button>
          <span class="xt-sp"></span>
          <button type="button" class="btn secondary small" data-xa="xlsein">${icon('upload')} Excel einlesen</button>
          <button type="button" class="btn secondary small" data-xa="xlsaus">${icon('download')} Als Excel speichern</button>
        </div>
        <div class="xt-wrap"><table class="xtab">
          <colgroup><col class="c-nr"><col class="c-b"><col class="c-t"><col class="c-m"><col class="c-e"><col class="c-ep"><col class="c-gp"></colgroup>
          <thead><tr><th>Pos.</th><th>Bereich</th><th>Leistung</th><th class="r">Menge</th><th>Einheit</th><th class="r">EP netto</th><th class="r">GP netto</th></tr></thead>
          <tbody>${zeilen.map((z) => { nrIn[z.ri] = (nrIn[z.ri] || 0) + 1; return `<tr data-r="${z.r.id}" data-i="${z.i}" class="${z.x.frei ? 'frei' : ''}">
            <td class="xt-nr">${g > 1 ? `${gNr[z.ri]}.` : ''}${nrIn[z.ri]}${marke(z.x)}</td>
            <td>${sel(z.r.id)}</td>
            <td><input data-c="text" value="${esc(z.text)}" list="xtPL" title="${esc(z.x.frei ? 'Eigene Position' : `${z.x.nr} aus der Preisliste`)}" autocomplete="off"></td>
            <td><input data-c="menge" class="r" value="${esc(mengeText(z.x.menge))}" autocomplete="off"></td>
            <td><input data-c="einheit" value="${esc(z.einheit)}" list="xtEh" autocomplete="off"></td>
            <td><input data-c="ep" class="r ${z.fix ? 'fix' : ''}" value="${esc(zahl(z.ep))}" title="${z.fix ? 'Eigener Preis' : 'Preis aus der Preisliste'}" autocomplete="off"></td>
            <td class="r xt-gp">${zahl(z.gp)}</td></tr>`; }).join('')}
            <tr class="xt-neu" data-neu><td class="xt-nr">${icon('plus')}</td><td>${sel(letzteZelle?.r || list[list.length - 1]?.id)}</td>
              <td><input data-c="text" list="xtPL" placeholder="Neue Position: Leistung eintippen oder aus der Preisliste wählen" autocomplete="off"></td>
              <td><input data-c="menge" class="r" placeholder="1" autocomplete="off"></td><td><input data-c="einheit" list="xtEh" autocomplete="off"></td><td><input data-c="ep" class="r" autocomplete="off"></td><td></td></tr>
          </tbody>
          <tfoot><tr><td colspan="6">Summe netto</td><td class="r">${zahl(gesNetto)}</td></tr>
            <tr><td colspan="6">MwSt.</td><td class="r">${zahl(mwst)}</td></tr>
            <tr class="xt-brutto"><td colspan="6">Gesamt brutto</td><td class="r">${zahl(r2(gesNetto + mwst))} €</td></tr></tfoot>
        </table></div>
        <p class="hint xt-hilfe">Pfeiltasten, Tab und Enter wie in Excel. Strg+Enter neue Zeile, Strg+Entf Zeile löschen. Zeilen aus Excel markieren, kopieren und hier mit Strg+V einfügen (Spalten Leistung, Menge, Einheit, Preis).</p>
        <datalist id="xtPL">${PL.positionen.map((it) => `<option value="${esc(it.text)}">${esc(it.nr)} · ${esc(it.gewerk)} · ${zahl(A.ep(it, list[0]?.angebot?.kalk))} € je ${esc(it.einheit)}</option>`).join('')}</datalist>
        <datalist id="xtEh">${[...new Set(['Stück', 'm²', 'lfm', 'Std.', 'pauschal', 'Tag', ...PL.positionen.map((x) => x.einheit)])].map((e) => `<option value="${esc(e)}">`).join('')}</datalist>`;
      binden();
      // Fokus wiederherstellen (nach Hinzufügen, Löschen, Verschieben)
      if (letzteZelle) {
        const { r, i, c, neu } = letzteZelle;
        const tr = neu ? $('[data-neu]', box) : $(`tr[data-r="${r}"][data-i="${i}"]`, box) || $$('tbody tr', box).filter((t) => !t.dataset.neu).pop();
        const el = tr && $(`[data-c="${c}"]`, tr);
        if (el) { el.focus(); el.select?.(); }
      }
    }

    const zeileVon = (el) => { const tr = el.closest('tr'); if (!tr || tr.dataset.neu) return null; const r = list.find((x) => x.id === tr.dataset.r); return r ? { tr, r, x: r.angebot.positionen[+tr.dataset.i], i: +tr.dataset.i } : null; };
    /** Text aus der Preisliste? Dann deren Nummer. Auch „FL-03“ direkt. */
    const ausKatalog = (t) => { const s = String(t || '').trim().toLowerCase(); return s ? PL.positionen.find((it) => it.text.toLowerCase() === s || it.nr.toLowerCase() === s) : null; };
    /** Neue Position in Raum r. Gibt den Index zurück. */
    function anlegen(r, { text, menge, einheit, ep }) {
      r.angebot.positionen ??= [];
      const it = ausKatalog(text), m = menge > 0 ? menge : 1;
      if (it) {
        const x = { nr: it.nr, raum: it.gewerk === 'Allgemein' ? '' : raumName(r), menge: m, bem: '' };
        if (ep > 0 && Math.abs(ep - A.ep(it, r.angebot.kalk)) > 0.005) x.epFix = r2(ep);
        r.angebot.positionen.push(x);
      } else r.angebot.positionen.push({ nr: 'FREI-' + uid(), frei: { text: String(text || '').trim(), einheit: einheit || 'Stück' }, raum: raumName(r), menge: m, bem: '', epFix: ep > 0 ? r2(ep) : 0 });
      r.angebot.geaendert = true;
      return r.angebot.positionen.length - 1;
    }
    /** Nur Summen und GP neu, ohne neu zu zeichnen (Fokus bleibt). */
    function rechnen() {
      let ges = 0;
      list.forEach((r) => {
        const P = r.angebot.positionen || [], S = A.summen(P, r.angebot.kalk); ges += S.netto;
        S.zeilen.forEach((z) => { const tr = $(`tr[data-r="${r.id}"][data-i="${z.i}"]`, box); if (!tr) return; $('.xt-gp', tr).textContent = zahl(z.gp); const e = $('[data-c="ep"]', tr); if (document.activeElement !== e) { e.value = zahl(z.ep); e.classList.toggle('fix', z.fix); } });
      });
      const mwst = r2(ges * (A.einstellungen().mwst || 0.19)), f = $$('tfoot td.r', box);
      f[0].textContent = zahl(ges); f[1].textContent = zahl(mwst); f[2].textContent = zahl(r2(ges + mwst)) + ' €';
    }

    async function aendern(el) {
      const c = el.dataset.c;
      if (el.closest('[data-neu]')) {
        if (c !== 'text' || !el.value.trim()) return;
        const tr = el.closest('tr'), r = list.find((x) => x.id === $('[data-c="bereich"]', tr).value) || list[0];
        const it = ausKatalog(el.value);
        if (it && (r.angebot.positionen || []).some((x) => x.nr === it.nr)) {
          const i = r.angebot.positionen.findIndex((x) => x.nr === it.nr);
          toast('Steht in diesem Bereich schon drin. Menge dort ändern.', 3500);
          letzteZelle = { r: r.id, i, c: 'menge' }; el.value = ''; return zeichnen();
        }
        const i = anlegen(r, { text: el.value, menge: num($('[data-c="menge"]', tr).value), einheit: $('[data-c="einheit"]', tr).value.trim(), ep: num($('[data-c="ep"]', tr).value) });
        await sichern(r);
        letzteZelle = { r: r.id, i, c: 'menge' };
        return zeichnen();
      }
      const z = zeileVon(el); if (!z) return;
      const { r, x } = z, kalk = r.angebot.kalk;
      if (c === 'bereich') {
        const ziel = list.find((y) => y.id === el.value); if (!ziel || ziel === r) return;
        if (!x.frei && (ziel.angebot.positionen || []).some((y) => y.nr === x.nr)) { toast('Diese Position steht im anderen Bereich schon drin.', 3500); el.value = r.id; return; }
        r.angebot.positionen.splice(z.i, 1); ziel.angebot.positionen ??= [];
        if (x.raum) x.raum = raumName(ziel);
        ziel.angebot.positionen.push(x); r.angebot.geaendert = ziel.angebot.geaendert = true;
        await sichern(r); await sichern(ziel);
        letzteZelle = { r: ziel.id, i: ziel.angebot.positionen.length - 1, c: 'bereich' };
        return zeichnen();
      }
      if (c === 'menge') { x.menge = num(el.value); if (x.ki) x.ki.sicher = ''; el.value = mengeText(x.menge); }
      if (c === 'ep') {
        const v = el.value.trim(), it = !x.frei && kat(x.nr);
        if (v === '' && it) delete x.epFix; // leer = wieder Preis aus der Preisliste
        else { const n = r2(num(v)); if (it && Math.abs(n - A.ep(it, kalk)) < 0.005) delete x.epFix; else x.epFix = n; }
      }
      if (c === 'text' || c === 'einheit') {
        const v = el.value.trim();
        if (c === 'text') {
          const it = ausKatalog(v);
          if (it && !x.frei && it.nr === x.nr) return;
          if (it && !(r.angebot.positionen.some((y) => y !== x && y.nr === it.nr))) { // andere Position aus der Preisliste gewählt
            const alt = x.frei ? null : kat(x.nr);
            delete x.frei; x.nr = it.nr; if (!alt) delete x.epFix;
            x.raum = it.gewerk === 'Allgemein' ? '' : raumName(r);
          } else if (x.frei) x.frei.text = v;
          else { // Text einer Preislisten-Position geändert: wird eine eigene Position mit dem bisherigen Preis
            const it0 = kat(x.nr); x.frei = { text: v, einheit: it0?.einheit || 'Stück' }; x.epFix = x.epFix > 0 ? x.epFix : r2(A.ep(it0, kalk)); x.nr = 'FREI-' + uid();
          }
        } else if (x.frei) x.frei.einheit = v;
        else { const it0 = kat(x.nr); if (v !== it0?.einheit) { x.frei = { text: it0?.text || '', einheit: v }; x.epFix = x.epFix > 0 ? x.epFix : r2(A.ep(it0, kalk)); x.nr = 'FREI-' + uid(); } }
        r.angebot.geaendert = true; await sichern(r);
        letzteZelle = null; const akt = document.activeElement; const pos = akt && $$('input, select', box).indexOf(akt);
        zeichnen(); if (pos >= 0) $$('input, select', box)[pos]?.focus();
        return;
      }
      r.angebot.geaendert = true; rechnen(); await sichern(r);
    }

    async function loeschen(el) {
      const z = el && zeileVon(el);
      if (!z) return toast('Zuerst in die Zeile klicken, die weg soll.');
      const [x] = z.r.angebot.positionen.splice(z.i, 1); z.r.angebot.geaendert = true; await sichern(z.r);
      letzteZelle = { r: z.r.id, i: Math.max(0, z.i - 1), c: el.dataset.c || 'text' };
      zeichnen();
      toast('Zeile gelöscht', 6000, { label: 'Rückgängig', fn: async () => { z.r.angebot.positionen.splice(z.i, 0, x); await sichern(z.r); letzteZelle = { r: z.r.id, i: z.i, c: 'text' }; zeichnen(); } });
    }

    /** Zeilen aus Excel (Tabulator-getrennt) oder einer Excel-Datei übernehmen. Erkennt Leistung, Menge, Einheit, Preis. */
    async function zeilenUebernehmen(reihen, r) {
      let n = 0;
      for (const roh of reihen) {
        let z = roh.map((v) => String(v ?? '').trim());
        if (!z.some(Boolean)) continue;
        if (z.length > 2 && /^\d+([.,]\d+)*\.?$/.test(z[0]) && z[1] && !/^[\d.,\s€]+$/.test(z[1])) z = z.slice(1); // Pos.-Spalte vorne weg
        const ti = z.findIndex((v) => v && !/^[-\d.,\s€%]+$/.test(v)); if (ti < 0) continue;
        const text = z[ti], rest = z.slice(ti + 1).filter((v) => v !== '');
        const zahlen = rest.filter((v) => /^[-\d.,\s€]+$/.test(v)).map(num);
        const einheit = rest.find((v) => !/^[-\d.,\s€]+$/.test(v)) || '';
        if (/^(summe|gesamt|netto|brutto|mwst)/i.test(text)) continue;
        if (/^(leistung|bezeichnung|text|position)$/i.test(text)) continue; // Kopfzeile
        anlegen(r, { text, menge: zahlen[0], einheit, ep: zahlen[1] });
        n++;
      }
      if (n) { await sichern(r); letzteZelle = { neu: true, c: 'text' }; zeichnen(); toast(`${n} ${n === 1 ? 'Zeile' : 'Zeilen'} übernommen in „${titel(r)}“. Bitte Preise prüfen.`, 5000); }
      else toast('Keine Zeilen erkannt. Erwartet: Leistung, Menge, Einheit, Preis.', 5000);
    }

    async function excelSpeichern() {
      await ladeXlsx();
      const K = w.angebotKopf || {}, k = window.Kunden?.byId(w.kundeId);
      const aoa = [['Angebot' + (K.nr ? ' Nr. ' + K.nr : '')], ['Kunde', k ? Kunden.name(k) : w.customer || ''], ['Objekt', w.address || ''], ['Betreff', w.titel || ''], [],
        ['Pos.', 'Bereich', 'Nr.', 'Leistung', 'Menge', 'Einheit', 'EP netto', 'GP netto']];
      let ges = 0;
      list.forEach((r, ri) => {
        const S = A.summen(r.angebot.positionen || [], r.angebot.kalk); ges += S.netto;
        S.zeilen.forEach((z, j) => aoa.push([list.length > 1 ? `${ri + 1}.${j + 1}` : String(j + 1), titel(r), z.frei ? '' : z.nr, z.it.text, +z.menge || 0, z.it.einheit, z.ep, z.gp]));
      });
      const mwst = r2(ges * (A.einstellungen().mwst || 0.19));
      aoa.push([], ['', '', '', 'Summe netto', '', '', '', r2(ges)], ['', '', '', 'MwSt.', '', '', '', mwst], ['', '', '', 'Gesamt brutto', '', '', '', r2(ges + mwst)]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 8 }, { wch: 60 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Angebot');
      const name = `Angebot_${(K.nr || w.titel || 'Entwurf').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.xlsx`;
      const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (window.DomDesktop) return desktopSpeichern(blob, name);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    async function excelEinlesen(r) {
      const [f] = await pickFiles({ accept: '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); if (!f) return;
      await ladeXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const reihen = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      await zeilenUebernehmen(reihen, r);
    }

    function binden() {
      box.oninput = (e) => { if (e.target.matches('input')) e.target.dataset.getippt = '1'; };
      box.onfocusout = (e) => { if (e.target.dataset) delete e.target.dataset.getippt; };
      box.onchange = (e) => { if (e.target.matches('[data-c]')) aendern(e.target).catch((err) => toast('Ging nicht: ' + err.message, 5000)); };
      box.onfocusin = (e) => { const tr = e.target.closest('tbody tr'); $$('tbody tr.akt', box).forEach((t) => t !== tr && t.classList.remove('akt')); tr?.classList.add('akt'); if (e.target.matches('input') && !tr?.dataset.neu) e.target.select(); };
      box.onkeydown = (e) => {
        const el = e.target; if (!el.matches?.('[data-c]')) return;
        const tr = el.closest('tr'), zeilen = $$('tbody tr', box), zi = zeilen.indexOf(tr), c = el.dataset.c, ci = SPALTEN.indexOf(c);
        const geh = (z, s) => { const t = zeilen[z]; const ziel = t && $(`[data-c="${SPALTEN[s]}"]`, t); if (ziel) { e.preventDefault(); el.blur(); ziel.focus(); } };
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); el.blur(); const n = $('[data-neu] [data-c="text"]', box); n?.focus(); return; }
        if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace') && !tr.dataset.neu) { e.preventDefault(); return loeschen(el); }
        if (e.key === 'Enter') { if (tr.dataset.neu && c === 'text') return; return geh(zi + 1, ci); }
        // Pfeil hoch/runter wechselt die Zeile. In Leistung/Einheit nicht, solange man tippt (dann wählt der Pfeil aus der Preisliste).
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && el.tagName === 'INPUT' && !((c === 'text' || c === 'einheit') && el.dataset.getippt)) return geh(zi + (e.key === 'ArrowDown' ? 1 : -1), ci);
        if (e.key === 'ArrowLeft' && el.tagName === 'INPUT' && el.selectionStart === 0 && el.selectionEnd === 0) return geh(zi, ci - 1);
        if (e.key === 'ArrowRight' && el.tagName === 'INPUT' && el.selectionStart === el.value.length) return geh(zi, ci + 1);
        if (e.key === 'Escape' && el.tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); el.blur(); }
      };
      // Mehrere Zeilen aus Excel einfügen
      box.onpaste = (e) => {
        const t = e.clipboardData?.getData('text/plain') || '';
        if (!/\t|\n./.test(t.trim())) return;
        e.preventDefault();
        const tr = e.target.closest('tr'), r = list.find((x) => x.id === (tr?.dataset.r || $('[data-c="bereich"]', tr || box)?.value)) || list[list.length - 1];
        zeilenUebernehmen(t.replace(/\r/g, '').split('\n').map((z) => z.split('\t')), r).catch((err) => toast('Einfügen ging nicht: ' + err.message, 5000));
      };
      $$('[data-xa]', box).forEach((b) => (b.onclick = () => {
        const akt = $('tbody tr.akt [data-c="text"]', box);
        ({ neu: () => $('[data-neu] [data-c="text"]', box).focus(),
          weg: () => loeschen(akt),
          xlsaus: () => excelSpeichern().catch((err) => toast('Excel ging nicht: ' + err.message, 5000)),
          xlsein: async () => { const tr = $('tbody tr.akt', box), r = list.find((x) => x.id === tr?.dataset.r) || list[list.length - 1]; excelEinlesen(r).catch((err) => toast('Excel lesen ging nicht: ' + err.message, 5000)); },
        })[b.dataset.xa]();
      }));
    }
    letzteZelle = null;
    zeichnen();
  }

  function ladeXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = ok; s.onerror = () => fail(new Error('Excel-Leser konnte nicht geladen werden')); document.head.appendChild(s); });
  }

  return { istBuero, angebot };
})();
