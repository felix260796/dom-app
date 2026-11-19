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
  const SPALTEN = ['text', 'menge', 'einheit', 'ep'];

  /** Am Computer? (Windows-Programm, oder breiter Bildschirm mit Maus; nicht am iPad mit Finger oder Stift) */
  // iPad nie Büro-Ansicht, auch nicht mit Tastatur und Trackpad (Runde 13: drei Ansichten iPhone, iPad, PC)
  const istIpad = () => /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || !!window.Capacitor?.isNativePlatform?.();
  const istBuero = () => document.documentElement.classList.contains('desktop') || (!istIpad() && matchMedia('(min-width: 1100px) and (pointer: fine)').matches);
  // Klasse buero an <html>: dichte Büro-Optik (css, html.buero) nur im Windows-Programm bzw. breit mit Maus; iPhone und iPad nie.
  const bueroKlasse = () => document.documentElement.classList.toggle('buero', istBuero());
  bueroKlasse(); try { matchMedia('(min-width: 1100px) and (pointer: fine)').addEventListener('change', bueroKlasse); } catch {}
  window.addEventListener('load', bueroKlasse);

  let letzteZelle = null; // nach dem Neuzeichnen wieder dorthin

  /* opt (Angebots-Editor am PC, projekt.js angebotPc): titelNeu(name) → neuer Bereich (Raum), titelLoeschen(r) → true/false.
   * Dann sind die Titelzeilen bearbeitbar (Name, Länge/Breite/Höhe, Löschen), unten steht „Neuer Titel“, und ohne Titel
   * legt die erste Position von selbst den Titel „Leistungen“ (Vorgabe kleinName) an. */
  async function angebot(box, w, list, neuZeichnen, opt = {}) {
    if (!box) return;
    const A = window.Angebot._intern, PL = await A.preisliste();
    const kat = (nr) => PL.positionen.find((x) => x.nr === nr);
    const raumName = (r) => r.aufmass?.raeume?.[0]?.name || r.room || '';
    const titel = (r) => r.room || r.aufmass?.raeume?.[0]?.name || 'Bereich';
    list.forEach((r) => A.init(r));
    const masse = (r) => { const q = r.aufmass?.raeume?.[0]; return { l: q?.teile?.[0]?.l || '', b: q?.teile?.[0]?.b || '', h: q?.h || '' }; };
    const ohneMasse = (r) => !!r.nurAngebot && r.roomType === 'sonstiges';
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
          zeilen.push({ r, ri, x, i, text: z?.it.text || x.frei?.text || '', einheit: z?.it.einheit || x.frei?.einheit || '', ep: z?.ep || 0, gp: z?.gp || 0, gpA: z?.gpAnzeige || 0, zaehlt: z?.zaehlt !== false, fix: !!z?.fix, ph: A.preisHinweis(x, r.angebot.kalk) });
        });
      });
      const mwst = r2(gesNetto * (A.einstellungen().mwst || 0.19));
      const nrIn = {}, gNr = {}; let g = 0;
      list.forEach((r, ri) => { if ((r.angebot.positionen || []).length) gNr[ri] = ++g; });
      const marke = (x) => x.ki?.partner && !(x.sub?.ep > 0) ? '<span class="xt-m p" title="Preis kommt vom Partner">P</span>' : x.ki?.sicher === 'geschaetzt' ? '<span class="xt-m g" title="Menge geschätzt, bitte prüfen">?</span>' : x.sub ? '<span class="xt-m s" title="Vom Partner übernommen">S</span>' : '';
      box.innerHTML = `
        <div class="xt-leiste">
          <button type="button" class="btn secondary small" data-xa="neu">${icon('plus')} Zeile</button>
          <button type="button" class="btn secondary small" data-xa="weg">${icon('trash')} Zeile löschen</button>
          ${opt.mehrere ? `<button type="button" class="btn secondary small" data-xa="mehr">${icon('list')} Räume übernehmen</button>` : ''}
          <span class="xt-sp"></span>
          <button type="button" class="btn secondary small" data-xa="xlsein">${icon('upload')} Excel einlesen</button>
          <button type="button" class="btn secondary small" data-xa="xlsaus">${icon('download')} Als Excel speichern</button>
        </div>
        <div class="xt-wrap"><table class="xtab">
          <colgroup><col class="c-nr"><col class="c-t"><col class="c-m"><col class="c-e"><col class="c-ep"><col class="c-gp"></colgroup>
          <thead><tr><th>Pos.</th><th>Leistung</th><th class="r">Menge</th><th>Einheit</th><th class="r">EP netto</th><th class="r">GP netto</th></tr></thead>
          <tbody>${list.map((r, ri) => {
            const zs = zeilen.filter((z) => z.r === r), tn = gNr[ri] || '';
            const m = masse(r);
            return (opt.titelNeu ? `<tr class="xt-titel ed" data-tr="${r.id}"><td class="xt-nr">${g > 1 && tn ? tn : ''}</td>
              <td colspan="4"><div class="xt-tn"><input data-t="name" value="${esc(titel(r))}" title="Titel (Bereich) umbenennen" autocomplete="off">
                ${ohneMasse(r) ? '' : `<span class="xt-masse" title="Raummaße in Metern, für Mengen aus dem Aufmaß. Dürfen leer bleiben.">${[['l', 'L'], ['b', 'B'], ['h', 'H']].map(([f, k]) => `<label>${k}<input data-t="${f}" class="r xt-mass" value="${esc(m[f])}" placeholder="–" autocomplete="off" aria-label="${{ l: 'Länge', b: 'Breite', h: 'Höhe' }[f]} in m"></label>`).join('')}<span>m</span></span>`}
                <button type="button" class="xt-tdel" data-t="del" title="Titel mit seinen Positionen löschen" aria-label="Titel löschen">${icon('trash')}</button></div></td>
              <td class="r" data-zs="${r.id}">${zs.length ? zahl(zs.reduce((a, z) => a + z.gp, 0)) : ''}</td></tr>`
              : `<tr class="xt-titel"><td class="xt-nr">${g > 1 && tn ? tn : ''}</td><td colspan="4"><b>${esc(titel(r))}</b></td><td class="r" data-zs="${r.id}">${zs.length ? zahl(zs.reduce((a, z) => a + z.gp, 0)) : ''}</td></tr>`)
            + `
            ${zs.map((z) => { nrIn[z.ri] = (nrIn[z.ri] || 0) + 1; return `<tr data-r="${z.r.id}" data-i="${z.i}" class="${z.x.frei ? 'frei' : ''} ${z.zaehlt ? '' : 'nz'} ${z.x.art === 'kostenlos' ? 'kl' : ''}">
            <td class="xt-nr">${g > 1 ? `${gNr[z.ri]}.` : ''}${nrIn[z.ri]}${marke(z.x)}${{ bedarf: '<span class="xt-m b" title="Bedarfsposition, nicht in der Summe">B</span>', alternativ: '<span class="xt-m a" title="Alternativposition, nicht in der Summe">A</span>', kostenlos: '<span class="xt-m k" title="Kostenlos">0</span>' }[z.x.art] || ''}<button type="button" class="xt-d ${z.x.lang || z.x.notiz ? 'hat' : ''}" data-xd title="${esc(z.x.notiz ? 'Notiz: ' + z.x.notiz : 'Art, Langtext, interne Notiz')}" aria-label="Details">…</button></td>
            <td><input data-c="text" value="${esc(z.text)}" list="xtPL" title="${esc(z.x.frei ? 'Eigene Position' : `${z.x.nr} aus der Preisliste`)}" autocomplete="off"></td>
            <td><input data-c="menge" class="r" value="${esc(mengeText(z.x.menge))}" autocomplete="off"></td>
            <td><input data-c="einheit" value="${esc(z.einheit)}" list="xtEh" autocomplete="off"></td>
            <td><input data-c="ep" class="r ${z.fix ? 'fix' : ''} ${z.ph ? 'warn' : ''}" value="${esc(zahl(z.ep))}" title="${esc(z.ph ? 'Hinweis: ' + z.ph : z.fix ? 'Eigener Preis' : 'Preis aus der Preisliste')}" autocomplete="off"></td>
            <td class="r xt-gp">${z.x.art === 'kostenlos' ? 'kostenlos' : z.zaehlt ? zahl(z.gp) : `(${zahl(z.gpA)})`}</td></tr>`; }).join('')}
            <tr class="xt-neu" data-neu="1" data-nr="${r.id}"><td class="xt-nr">${icon('plus')}</td>
              <td><input data-c="text" list="xtPL" placeholder="Neue Position in „${esc(titel(r))}“: eintippen oder aus der Preisliste wählen" autocomplete="off"></td>
              <td><input data-c="menge" class="r" placeholder="1" autocomplete="off"></td><td><input data-c="einheit" list="xtEh" autocomplete="off"></td><td><input data-c="ep" class="r" autocomplete="off"></td><td></td></tr>`;
          }).join('')}
          ${opt.titelNeu && !list.length ? `<tr class="xt-neu" data-neu="1" data-nr="__auto"><td class="xt-nr">${icon('plus')}</td>
              <td><input data-c="text" list="xtPL" placeholder="Erste Position: eintippen oder aus der Preisliste wählen" autocomplete="off"></td>
              <td><input data-c="menge" class="r" placeholder="1" autocomplete="off"></td><td><input data-c="einheit" list="xtEh" autocomplete="off"></td><td><input data-c="ep" class="r" autocomplete="off"></td><td></td></tr>` : ''}
          ${opt.titelNeu ? `<tr class="xt-titelneu"><td class="xt-nr">${icon('plus')}</td><td colspan="5"><input data-t="neu" placeholder="Neuer Titel, z. B. Bad, Küche, Malerarbeiten, Elektro (Enter)" autocomplete="off"></td></tr>` : ''}
          </tbody>
          <tfoot><tr><td colspan="5">Summe netto</td><td class="r">${zahl(gesNetto)}</td></tr>
            <tr><td colspan="5">MwSt.</td><td class="r">${zahl(mwst)}</td></tr>
            <tr class="xt-brutto"><td colspan="5">Gesamt brutto</td><td class="r">${zahl(r2(gesNetto + mwst))} €</td></tr></tfoot>
        </table></div>
        <p class="hint xt-hilfe">Pfeiltasten, Tab und Enter wie in Excel. Strg+Enter neue Zeile, Strg+Entf Zeile löschen. Zeilen aus Excel markieren, kopieren und hier mit Strg+V einfügen (Spalten Leistung, Menge, Einheit, Preis).</p>
        <datalist id="xtPL">${PL.positionen.map((it) => `<option value="${esc(it.text)}">${esc(it.nr)} · ${esc(it.gewerk)} · ${zahl(A.ep(it, list[0]?.angebot?.kalk))} € je ${esc(it.einheit)}</option>`).join('')}</datalist>
        <datalist id="xtEh">${[...new Set(['Stück', 'm²', 'lfm', 'Std.', 'pauschal', 'Tag', ...PL.positionen.map((x) => x.einheit)])].map((e) => `<option value="${esc(e)}">`).join('')}</datalist>`;
      binden();
      // Fokus wiederherstellen (nach Hinzufügen, Löschen, Verschieben)
      if (letzteZelle) {
        const { r, i, c, neu } = letzteZelle;
        const tr = neu ? $(`[data-nr="${neu}"]`, box) || $('[data-neu]', box) : $(`tr[data-r="${r}"][data-i="${i}"]`, box) || $$('tbody tr', box).filter((t) => !t.dataset.neu).pop();
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
        const zsEl = $(`[data-zs="${r.id}"]`, box); if (zsEl) zsEl.textContent = S.zeilen.length ? zahl(S.netto) : '';
        S.zeilen.forEach((z) => { const tr = $(`tr[data-r="${r.id}"][data-i="${z.i}"]`, box); if (!tr) return; $('.xt-gp', tr).textContent = z.art === 'kostenlos' ? 'kostenlos' : z.zaehlt === false ? `(${zahl(z.gpAnzeige)})` : zahl(z.gp); const e = $('[data-c="ep"]', tr); if (document.activeElement !== e) { e.value = zahl(z.ep); e.classList.toggle('fix', z.fix); } });
      });
      const mwst = r2(ges * (A.einstellungen().mwst || 0.19)), f = $$('tfoot td.r', box);
      f[0].textContent = zahl(ges); f[1].textContent = zahl(mwst); f[2].textContent = zahl(r2(ges + mwst)) + ' €';
      opt.geaendert?.(list.some((r) => (r.angebot.positionen || []).length));
    }

    async function aendern(el) {
      const c = el.dataset.c;
      if (el.closest('[data-neu]')) {
        if (c !== 'text' || !el.value.trim()) return;
        const tr = el.closest('tr');
        let r = list.find((x) => x.id === tr.dataset.nr) || list[0];
        if (!r && opt.titelNeu) { r = await opt.titelNeu(String(vorgabe('kleinName') || 'Leistungen'), { klein: true }); if (!r) return; A.init(r); list.push(r); }
        if (!r) return;
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

    /** Position von außen (Seitenleiste Preislisten): { text, einheit, ep } in den Titel tid, sonst in den zuletzt benutzten. */
    async function einfuegen(pos, tid) {
      let r = list.find((x) => x.id === tid) || list.find((x) => x.id === box.dataset.aktTitel) || list[list.length - 1];
      if (!r && opt.titelNeu) { r = await opt.titelNeu(String(vorgabe('kleinName') || 'Leistungen'), { klein: true }); if (!r) return; A.init(r); list.push(r); }
      if (!r) return;
      const it = !pos.ep && ausKatalog(pos.text);
      if (it && (r.angebot.positionen || []).some((x) => x.nr === it.nr)) return toast(`Steht in „${titel(r)}“ schon drin.`, 3500);
      const i = anlegen(r, { text: pos.text, menge: 0, einheit: pos.einheit || '', ep: +pos.ep || 0 });
      await sichern(r);
      box.dataset.aktTitel = r.id; letzteZelle = { r: r.id, i, c: 'menge' };
      zeichnen(); toast(`In „${titel(r)}“ übernommen. Menge eintragen.`, 2500);
    }
    box.__einfuegen = (pos, tid) => einfuegen(pos, tid);

    /** Titel (Bereich): neu anlegen, umbenennen, Maße, löschen. */
    async function titelAendern(el) {
      const t = el.dataset.t, v = el.value.trim();
      if (t === 'neu') {
        if (!v) return;
        el.value = '';
        const r = await opt.titelNeu(v); if (!r) return;
        A.init(r); if (!list.includes(r)) list.push(r);
        letzteZelle = { neu: r.id, c: 'text' }; return zeichnen();
      }
      const r = list.find((x) => x.id === el.closest('tr')?.dataset.tr); if (!r) return;
      if (t === 'name') { if (!v) { el.value = titel(r); return; } r.room = v; if (r.aufmass?.raeume?.[0]) r.aufmass.raeume[0].name = v; await sichern(r); return; }
      if (['l', 'b', 'h'].includes(t)) {
        A.init(r);
        const q = r.aufmass.raeume[0]; q.teile ??= [{ l: '', b: '' }]; q.teile[0] ??= { l: '', b: '' };
        if (t === 'h') q.h = v; else q.teile[0][t] = v;
        r.masse = { l: q.teile[0].l, b: q.teile[0].b, h: q.h };
        await sichern(r); rechnen();
      }
    }
    async function titelLoeschen(b) {
      const r = list.find((x) => x.id === b.closest('tr')?.dataset.tr); if (!r) return;
      if (!(await opt.titelLoeschen(r))) return;
      list.splice(list.indexOf(r), 1); letzteZelle = null; zeichnen();
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
      if (n) { await sichern(r); letzteZelle = { neu: r.id, c: 'text' }; zeichnen(); toast(`${n} ${n === 1 ? 'Zeile' : 'Zeilen'} übernommen in „${titel(r)}“. Bitte Preise prüfen.`, 5000); }
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
      box.onchange = (e) => {
        if (e.target.matches('[data-c]')) aendern(e.target).catch((err) => toast('Ging nicht: ' + err.message, 5000));
        else if (e.target.matches('[data-t]')) titelAendern(e.target).catch((err) => toast('Ging nicht: ' + err.message, 5000));
      };
      box.onclick = async (e) => {
        const b = e.target.closest('[data-t="del"]'); if (b) return titelLoeschen(b).catch((err) => toast('Ging nicht: ' + err.message, 5000));
        const d = e.target.closest('[data-xd]'); const z = d && zeileVon(d);
        if (z && (await A.posDetails(z.x))) { z.r.angebot.geaendert = true; await sichern(z.r); letzteZelle = null; zeichnen(); }
      };
      box.onfocusin = (e) => {
        const tr = e.target.closest('tbody tr'); $$('tbody tr.akt', box).forEach((t) => t !== tr && t.classList.remove('akt')); tr?.classList.add('akt');
        const tid = tr?.dataset.r || tr?.dataset.tr || (tr?.dataset.nr !== '__auto' && tr?.dataset.nr); if (tid) box.dataset.aktTitel = tid; // für „Übernehmen“ aus der Seitenleiste
        if (e.target.matches('input') && !tr?.dataset.neu) e.target.select();
      };
      // Positionen aus der Seitenleiste (Preislisten) hineinziehen: landet im Titel der Zeile, auf die man loslässt
      box.ondragover = (e) => { if (e.dataTransfer?.types?.includes('application/x-dom-pos')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; $$('tr.drop', box).forEach((t) => t.classList.remove('drop')); e.target.closest?.('tbody tr')?.classList.add('drop'); } };
      box.ondragleave = (e) => { if (!box.contains(e.relatedTarget)) $$('tr.drop', box).forEach((t) => t.classList.remove('drop')); };
      box.ondrop = (e) => {
        const d = e.dataTransfer?.getData('application/x-dom-pos'); if (!d) return;
        e.preventDefault(); e.stopPropagation(); $$('tr.drop', box).forEach((t) => t.classList.remove('drop'));
        const tr = e.target.closest?.('tbody tr');
        einfuegen(JSON.parse(d), tr?.dataset.r || tr?.dataset.tr || tr?.dataset.nr).catch((err) => toast('Ging nicht: ' + err.message, 5000));
      };
      box.onkeydown = (e) => {
        const el = e.target;
        if (el.matches?.('[data-t]') && e.key === 'Enter') { e.preventDefault(); el.blur(); return; } // Titel: Enter übernimmt (change)
        if (!el.matches?.('[data-c]')) return;
        const tr = el.closest('tr'), zeilen = $$('tbody tr:not(.xt-titel)', box), zi = zeilen.indexOf(tr), c = el.dataset.c, ci = SPALTEN.indexOf(c);
        const geh = (z, s) => { const t = zeilen[z]; const ziel = t && $(`[data-c="${SPALTEN[s]}"]`, t); if (ziel) { e.preventDefault(); el.blur(); ziel.focus(); } };
        if (e.ctrlKey && (e.key === 'Enter' || e.key === 'Insert')) { e.preventDefault(); el.blur(); const n = $(`[data-nr="${tr.dataset.r || tr.dataset.nr}"] [data-c="text"]`, box) || $('[data-neu] [data-c="text"]', box); n?.focus(); return; }
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
        const tr = e.target.closest('tr'), r = list.find((x) => x.id === (tr?.dataset.r || tr?.dataset.nr)) || list[list.length - 1];
        zeilenUebernehmen(t.replace(/\r/g, '').split('\n').map((z) => z.split('\t')), r).catch((err) => toast('Einfügen ging nicht: ' + err.message, 5000));
      };
      $$('[data-xa]', box).forEach((b) => (b.onclick = () => {
        const akt = $('tbody tr.akt [data-c="text"]', box);
        const aktTr = $('tbody tr.akt', box);
        ({ neu: () => ($(`[data-nr="${aktTr?.dataset.r || aktTr?.dataset.nr}"] [data-c="text"]`, box) || $('[data-neu] [data-c="text"]', box)).focus(),
          weg: () => loeschen(akt),
          mehr: () => opt.mehrere?.(),
          xlsaus: () => excelSpeichern().catch((err) => toast('Excel ging nicht: ' + err.message, 5000)),
          xlsein: async () => { const tr = $('tbody tr.akt', box), r = list.find((x) => x.id === (tr?.dataset.r || tr?.dataset.nr)) || list[list.length - 1]; excelEinlesen(r).catch((err) => toast('Excel lesen ging nicht: ' + err.message, 5000)); },
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

  // ---------- Listen als Tabelle (wie Listenseiten in ERP-Programmen) ----------
  // Am Computer statt Karten untereinander: Spalten, Klick auf den Spaltenkopf sortiert, Klick/Enter auf eine Zeile öffnet.
  // spalten: [{ k, t, r (rechtsbündig), b (Breite in px) }], zeilen: [{ id, werte: { k: text | { text, html, sort } } }]
  const sortWahl = {}; // je Liste: { k, ab }
  function liste(box, { id, spalten, zeilen, leer = 'Nichts gefunden.', oeffnen }) {
    if (!box) return;
    const wert = (z, k) => { const v = z.werte[k]; return v && typeof v === 'object' ? v : { text: v ?? '' }; };
    const s = sortWahl[id];
    const reihe = s ? [...zeilen].sort((a, b) => {
      const x = wert(a, s.k), y = wert(b, s.k), xa = x.sort ?? x.text, ya = y.sort ?? y.text;
      const c = typeof xa === 'number' && typeof ya === 'number' ? xa - ya : String(xa).localeCompare(String(ya), 'de', { numeric: true, sensitivity: 'base' });
      return s.ab ? -c : c;
    }) : zeilen;
    box.innerHTML = zeilen.length ? `<div class="ltab-wrap"><table class="ltab"><colgroup>${spalten.map((c) => `<col${c.b ? ` style="width:${c.b}px"` : ''}>`).join('')}</colgroup>
      <thead><tr>${spalten.map((c) => `<th class="${c.r ? 'r' : ''}" data-sk="${c.k}" title="Sortieren">${esc(c.t)}${s?.k === c.k ? `<i class="ltab-s">${s.ab ? '▼' : '▲'}</i>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${reihe.map((z) => `<tr data-lz="${esc(z.id)}" tabindex="0"${z.klasse ? ` class="${esc(z.klasse)}"` : ''}>${spalten.map((c) => { const v = wert(z, c.k); return `<td class="${c.r ? 'r' : ''}">${v.html ?? esc(v.text)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`
      : `<p class="empty">${esc(leer)}</p>`;
    $$('[data-sk]', box).forEach((th) => (th.onclick = () => { const alt = sortWahl[id]; sortWahl[id] = { k: th.dataset.sk, ab: alt?.k === th.dataset.sk ? !alt.ab : false }; liste(box, { id, spalten, zeilen, leer, oeffnen }); }));
    $$('[data-lz]', box).forEach((tr) => {
      tr.onclick = () => oeffnen(tr.dataset.lz);
      tr.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); oeffnen(tr.dataset.lz); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling)?.focus(); }
      };
    });
    window.Buero?.listeExtras(box, { id, spalten, reihe, oeffnen }); // Rechtsklick-Menü, Excel
  }

  return { istBuero, angebot, liste };
})();
