'use strict';
/* DOM – Kalkulation im Angebot (P8, Runde 14, Entscheidungen Felix 20.11.).
 * Rechnet aus den Positionen des aktiven Angebots die Kennzahlen: Einkauf (Lohn, Material, Pauschal), Verkauf netto und brutto,
 * Nachlass, Rohertrag, Aufschlag % (Rohertrag vom Einkauf) und Marge % (Rohertrag vom Verkauf), dazu Rohertrag nach Kunden-Skonto
 * und mit Sub-Skonto, je Gewerk und je Titel (Bereich). Bedarf und Alternative zählen nicht, „kostenlos“ = Kosten ohne Erlös.
 * Zuschläge: Angebot (Lohn, Material, Pauschal) → Gewerk → Zeile, je in % oder €; die tiefere Ebene gewinnt (angebot.js vkVon).
 * €-Werte (Angebot: kalk.eur[n], Gewerk: kalk.gewerke[g] = { art: '€', wert }) rechnet abgleichen() in einen Satz p um.
 * Der Kunde sieht nichts davon: Die Karte steht nur im Büro, das PDF zeigt nur Verkaufspreise (und den Nachlass). */
window.Kalk = (() => {
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const I = () => window.Angebot._intern;
  const eur = (x) => (+x || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const pz = (x) => (Number.isFinite(x) ? x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '–');
  const zahlIn = (x) => (x === '' || x === null || x === undefined ? '' : String(Math.round(+x * 100) / 100).replace('.', ','));
  const titelVon = (r) => r.room || r.aufmass?.raeume?.[0]?.name || 'Bereich';
  const mitPos = (list) => list.filter((r) => r.angebot?.positionen?.length);

  /** Das Angebot (Eintrag angebot:<id>) zu den Räumen. */
  const angebotVon = (w, list = []) => list.find((r) => r?.[window.AngebotDaten?.REF])?.[window.AngebotDaten.REF] || window.AngebotDaten?.aktivSync?.(w) || null;
  /** Aufschläge des Angebots (stehen in jedem Bereich gleich, der erste zählt). */
  const kalkVon = (list) => I().kalkNorm(list.find((r) => r.angebot?.kalk)?.angebot?.kalk) || {};

  /** Kunden-Nachlass am Angebot: a.nachlass = { art: '%' | '€', wert } → Betrag netto. */
  function nachlassVon(a, netto) {
    const n = a?.nachlass;
    if (!n || !(+n.wert > 0) || !(netto > 0)) return 0;
    return r2(Math.min(netto, n.art === '€' ? +n.wert : netto * +n.wert / 100));
  }

  /** Summen des Angebots für den Kunden: Positionen netto, Nachlass, netto, MwSt., brutto. */
  function gesamt(w, list) {
    const A = I(), E = A.einstellungen(); let vor = 0;
    for (const r of mitPos(list)) { try { vor += A.summen(r.angebot.positionen, r.angebot.kalk).netto || 0; } catch {} }
    vor = r2(vor);
    const nachlass = nachlassVon(angebotVon(w, list), vor), netto = r2(vor - nachlass), mwst = r2(netto * (E.mwst ?? 0.19));
    return { vor, nachlass, netto, mwst, brutto: r2(netto + mwst) };
  }
  /** Text für den Nachlass im PDF, z. B. „Nachlass 5 %“. */
  const nachlassText = (a) => (a?.nachlass?.art === '€' || !a?.nachlass ? 'Nachlass' : `Nachlass ${String(a.nachlass.wert).replace('.', ',')} %`);
  /** Alle Kennzahlen des Angebots. */
  function kennzahlen(w, list) {
    const A = I(), E = A.einstellungen(), a = angebotVon(w, list), min = +vorgabe('mindestMarge') || 0;
    const leer = () => ({ ek: 0, vk: 0, lohn: 0, mat: 0, pausch: 0, subSkonto: 0, zeilen: 0 });
    const K = { ...leer(), gewerke: {}, titel: {}, vorl: 0, ohne: 0, kostenlos: 0 };
    // Gewerke, bei denen ein Sub angefragt ist, aber noch kein Angebot übernommen wurde: Preise vorläufig
    const angefragt = new Set((w?.subAnfragen || []).filter((q) => q.art === 'angebot').flatMap((q) => q.bereiche || []));
    for (const r of mitPos(list)) {
      const S = A.summen(r.angebot.positionen, r.angebot.kalk), tn = titelVon(r);
      for (const z of S.zeilen) {
        if (z.zaehlt === false) continue; // Bedarf, Alternative: nicht in der Marge
        const m = +z.menge || 0, e = z.kalk || {};
        const ek = r2(m * (e.ekEp || 0)), vk = z.gp || 0;
        const p = z.sub?.partnerId ? window.Partner?.byId?.(z.sub.partnerId) : null;
        const ss = p && +p.skonto > 0 && e.quelle !== 'vorlage' ? r2(ek * +p.skonto / 100) : 0;
        const add = (o) => { o.ek += ek; o.vk += vk; o.lohn += m * (e.lohn || 0); o.mat += m * (e.mat || 0); o.pausch += m * (e.pausch || 0); o.subSkonto += ss; o.zeilen++; };
        add(K); add(K.gewerke[e.g || 'Sonstiges'] ??= leer()); add(K.titel[tn] ??= leer());
        if (e.vorl || (angefragt.has(r.id) && !z.sub && e.quelle === 'vorlage')) K.vorl++;
        if (e.ohne && vk > 0) K.ohne++;
        if (z.art === 'kostenlos') K.kostenlos++;
      }
    }
    const fertig = (o) => {
      for (const f of ['ek', 'vk', 'lohn', 'mat', 'pausch', 'subSkonto']) o[f] = r2(o[f]);
      o.re = r2(o.vk - o.ek);
      o.aufschlag = o.ek > 0 ? (o.re / o.ek) * 100 : NaN;
      o.marge = o.vk > 0 ? (o.re / o.vk) * 100 : NaN;
      o.unter = o.vk > 0 && min > 0 && o.marge < min;
      return o;
    };
    Object.values(K.gewerke).forEach(fertig); Object.values(K.titel).forEach(fertig);
    fertig(K);
    // Nachlass senkt Verkauf und Rohertrag; Kunden-Skonto vom Brutto nach Nachlass, als netto abgezogen
    K.nachlass = nachlassVon(a, K.vk);
    K.netto = r2(K.vk - K.nachlass);
    K.mwst = r2(K.netto * (E.mwst ?? 0.19));
    K.brutto = r2(K.netto + K.mwst);
    K.re = r2(K.netto - K.ek);
    K.aufschlag = K.ek > 0 ? (K.re / K.ek) * 100 : NaN;
    K.marge = K.netto > 0 ? (K.re / K.netto) * 100 : NaN;
    K.unter = K.netto > 0 && min > 0 && K.marge < min;
    const SK = A.skontoVon(w, K.brutto);
    K.skonto = SK ? { ...SK, netto: r2(SK.betrag / (1 + (E.mwst ?? 0.19))) } : null;
    K.reSkonto = K.skonto ? r2(K.re - K.skonto.netto) : K.re;
    K.reSubSkonto = r2(K.re + K.subSkonto);
    K.min = min;
    return K;
  }

  // ---------- Zuschläge setzen (schreibt in alle Bereiche des Angebots) ----------
  async function kalkAendern(list, fn) {
    const A = I();
    for (const r of list) { A.init?.(r); const k = { ...(A.kalkNorm(r.angebot.kalk) || {}), v: 2 }; fn(k); r.angebot.kalk = k; await saveProject(r); }
  }
  /** Angebot: Lohn, Material oder Pauschal in % (wert in Prozent) oder € (Gesamtbetrag). wert '' = Standard. */
  async function angebotSetzen(w, list, n, art, wert) {
    await kalkAendern(list, (k) => {
      k.eur = { ...(k.eur || {}) };
      if (wert === '' || wert === null) { delete k[n]; delete k.eur[n]; }
      else if (art === '€') k.eur[n] = +wert;
      else { k[n] = +wert / 100; delete k.eur[n]; }
    });
    await abgleichen(w, list);
  }
  /** Gewerk: ein Zuschlag in % oder € (Gesamtbetrag für das Gewerk im ganzen Angebot). wert '' = kein eigener Zuschlag. */
  async function gewerkSetzen(w, list, g, art, wert) {
    await kalkAendern(list, (k) => {
      k.gewerke = { ...(k.gewerke || {}) };
      if (wert === '' || wert === null) delete k.gewerke[g];
      else k.gewerke[g] = { art, wert: +wert, p: art === '€' ? undefined : +wert / 100 };
    });
    await abgleichen(w, list);
  }
  /** Material vom Sub (true) oder von uns (false) je Gewerk. */
  async function matSubSetzen(w, list, g, an) {
    await kalkAendern(list, (k) => { k.matSub = { ...(k.matSub || {}), [g]: !!an }; });
    await abgleichen(w, list);
  }
  /** €-Zuschläge in Sätze umrechnen. Gibt true zurück, wenn sich etwas geändert hat (dann gespeichert). */
  async function abgleichen(w, list) {
    const A = I(), k = kalkVon(list), eurA = k.eur || {}, gew = k.gewerke || {};
    const gEur = Object.entries(gew).filter(([, v]) => v?.art === '€');
    const aEur = Object.entries(eurA).filter(([, v]) => Number.isFinite(+v));
    if (!gEur.length && !aEur.length) return false;
    // Einkauf der Zeilen, auf die der Zuschlag wirkt (ohne eigenen Preis, ohne Zeilen-Zuschlag)
    const ekG = {}, ekA = { aufLohn: 0, aufMat: 0, aufPausch: 0 };
    for (const r of mitPos(list)) {
      for (const z of A.summen(r.angebot.positionen, r.angebot.kalk).zeilen) {
        if (z.zaehlt === false || z.art === 'kostenlos' || z.epFix > 0 || (z.zu && z.zu.wert !== '' && z.zu.wert != null)) continue;
        const m = +z.menge || 0, e = z.kalk || {};
        if (gew[e.g]) ekG[e.g] = (ekG[e.g] || 0) + m * (e.ekEp || 0);
        else { ekA.aufLohn += m * (e.lohn || 0); ekA.aufMat += m * (e.mat || 0); ekA.aufPausch += m * (e.pausch || 0); }
      }
    }
    const neu = {};
    for (const [g, v] of gEur) neu['g:' + g] = ekG[g] > 0 ? Math.round((+v.wert / ekG[g]) * 1e6) / 1e6 : 0;
    for (const [n, v] of aEur) neu['a:' + n] = ekA[n] > 0 ? Math.round((+v / ekA[n]) * 1e6) / 1e6 : 0;
    const alt = (key) => (key.startsWith('g:') ? gew[key.slice(2)]?.p : k[key.slice(2)]);
    if (Object.keys(neu).every((key) => alt(key) === neu[key])) return false;
    await kalkAendern(list, (kk) => {
      kk.gewerke = { ...(kk.gewerke || {}) };
      for (const [key, p] of Object.entries(neu)) {
        if (key.startsWith('g:')) { const g = key.slice(2); if (kk.gewerke[g]) kk.gewerke[g] = { ...kk.gewerke[g], p }; }
        else kk[key.slice(2)] = p;
      }
    });
    return true;
  }
  async function nachlassSetzen(w, list, art, wert) {
    const a = angebotVon(w, list); if (!a) return;
    if (wert === '' || wert === null || !(+wert > 0)) delete a.nachlass; else a.nachlass = { art, wert: +wert };
    await window.AngebotDaten.speichern(a);
  }

  // ---------- Karte „Kalkulation“ (nur intern, im Büro) ----------
  const artWahl = (attr, art) => `<select ${attr} class="kz-art" aria-label="Prozent oder Euro"><option value="%" ${art !== '€' ? 'selected' : ''}>%</option><option value="€" ${art === '€' ? 'selected' : ''}>€</option></select>`;
  const z = (l, v, cls = '') => `<div class="kz-z ${cls}"><span>${l}</span><b>${v}</b></div>`;
  /** HTML der Karte. opt.offen: aufgeklappt (PC), sonst zu (iPhone/iPad). */
  function karte(w, list, opt = {}) {
    if (!mitPos(list).length) return '';
    let K; try { K = kennzahlen(w, list); } catch (e) { console.warn(e); return ''; }
    const a = angebotVon(w, list), k = kalkVon(list), gesp = !!opt.gesperrt;
    const n = a?.nachlass || {};
    const hinweise = [
      K.unter ? `Marge ${pz(K.marge)} liegt unter der Mindestmarge von ${pz(K.min)}.` : '',
      ...Object.entries(K.gewerke).filter(([, g]) => g.unter).map(([name, g]) => `${name}: Marge ${pz(g.marge)} unter ${pz(K.min)}.`),
      K.vorl ? `${K.vorl} ${K.vorl === 1 ? 'Position ist' : 'Positionen sind'} vorläufig (Sub angefragt, Preis kommt noch).` : '',
      K.ohne ? `${K.ohne} ${K.ohne === 1 ? 'Position hat' : 'Positionen haben'} keinen Einkauf. Ihr Preis zählt ganz als Rohertrag.` : '',
      K.kostenlos ? `${K.kostenlos} kostenlose ${K.kostenlos === 1 ? 'Position kostet' : 'Positionen kosten'} uns den Einkauf ohne Erlös.` : '',
    ].filter(Boolean);
    const gewerke = Object.entries(K.gewerke).sort((x, y) => y[1].vk - x[1].vk);
    const titel = Object.entries(K.titel);
    return `<details class="more card kz" id="kalkKarte" ${opt.offen ? 'open' : ''}>
      <summary>${icon('euro')}<span>Kalkulation<small>Rohertrag ${eur(K.re)} · Marge ${pz(K.marge)}${K.unter ? ' · unter Mindestmarge' : ''}</small></span>${icon('chevron', 'more-chev')}</summary>
      <p class="hint" style="margin:0 0 8px">Nur für dich. Der Kunde sieht nur die Verkaufspreise.</p>
      ${hinweise.length ? `<ul class="kz-hinw">${hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      <div class="kz-zahlen">
        ${z('Einkauf netto', eur(K.ek))}
        ${z('<small>davon Lohn / Material / Pauschal</small>', `<small>${eur(K.lohn)} / ${eur(K.mat)} / ${eur(K.pausch)}</small>`, 'kz-klein')}
        ${z('Verkauf netto', eur(K.vk))}
        <div class="kz-z kz-nl"><span>Nachlass</span><span class="kz-in"><input type="text" inputmode="decimal" data-kzn value="${esc(zahlIn(n.wert))}" placeholder="0" ${gesp ? 'disabled' : ''} aria-label="Nachlass">${artWahl(`data-kzna ${gesp ? 'disabled' : ''}`, n.art)}<b>${K.nachlass ? '- ' + eur(K.nachlass) : ''}</b></span></div>
        ${K.nachlass ? z('Verkauf netto nach Nachlass', eur(K.netto)) : ''}
        ${z('Verkauf brutto', eur(K.brutto))}
        ${z('Rohertrag', eur(K.re), 'kz-gross' + (K.unter ? ' warn' : ''))}
        ${z('Aufschlag (vom Einkauf)', pz(K.aufschlag))}
        ${z('Marge (vom Verkauf)', pz(K.marge), K.unter ? 'warn' : '')}
        ${K.skonto ? z(`Rohertrag nach Kunden-Skonto (${String(K.skonto.p).replace('.', ',')} %)`, eur(K.reSkonto)) : ''}
        ${K.subSkonto ? z('Rohertrag mit Sub-Skonto', eur(K.reSubSkonto)) : ''}
      </div>
      <div class="kz-auf"><b>Zuschläge im Angebot</b><small>leer = Standard aus den Einstellungen</small>
        ${[['aufLohn', 'Lohn'], ['aufMat', 'Material'], ['aufPausch', 'Pauschal']].map(([nn, l]) => {
          const istEur = Number.isFinite(+k.eur?.[nn]); const wert = istEur ? k.eur[nn] : I().kalkFeld(k, nn) !== '' ? r2(k[nn] * 100) : '';
          return `<label class="kz-r ${wert !== '' ? 'eigen' : ''}"><span>${l}</span><input type="text" inputmode="decimal" data-kza="${nn}" value="${esc(zahlIn(wert))}" placeholder="${esc(zahlIn(r2((I().einstellungen()[nn] || 0) * 100)))}" ${gesp ? 'disabled' : ''}>${artWahl(`data-kzaa="${nn}" ${gesp ? 'disabled' : ''}`, istEur ? '€' : '%')}</label>`;
        }).join('')}</div>
      <div class="kz-tw"><table class="kz-t"><thead><tr><th>Gewerk</th><th class="r">Einkauf</th><th class="r">Verkauf</th><th class="r">Marge</th><th>Zuschlag</th></tr></thead>
        <tbody>${gewerke.map(([g, o]) => { const gz = k.gewerke?.[g]; return `<tr class="${o.unter ? 'warn' : ''}"><td>${esc(g)}
          ${o.mat > 0 || k.matSub?.[g] ? `<label class="kz-ms" title="Liefert der Sub das Material, zählt es als sein Lohn"><input type="checkbox" data-kzms="${esc(g)}" ${k.matSub?.[g] ? 'checked' : ''} ${gesp ? 'disabled' : ''}> Material vom Sub</label>` : ''}</td>
          <td class="r">${eur(o.ek)}</td><td class="r">${eur(o.vk)}</td><td class="r">${pz(o.marge)}</td>
          <td><span class="kz-in ${gz ? 'eigen' : ''}"><input type="text" inputmode="decimal" data-kzg="${esc(g)}" value="${esc(zahlIn(gz?.wert ?? ''))}" placeholder="–" ${gesp ? 'disabled' : ''} aria-label="Zuschlag ${esc(g)}">${artWahl(`data-kzga="${esc(g)}" ${gesp ? 'disabled' : ''}`, gz?.art)}</span></td></tr>`; }).join('')}</tbody></table></div>
      ${titel.length > 1 ? `<div class="kz-tw"><table class="kz-t"><thead><tr><th>Titel</th><th class="r">Einkauf</th><th class="r">Verkauf</th><th class="r">Rohertrag</th><th class="r">Marge</th></tr></thead>
        <tbody>${titel.map(([t, o]) => `<tr class="${o.unter ? 'warn' : ''}"><td>${esc(t)}</td><td class="r">${eur(o.ek)}</td><td class="r">${eur(o.vk)}</td><td class="r">${eur(o.re)}</td><td class="r">${pz(o.marge)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="hint" style="margin:8px 0 0">Ein Zuschlag am Gewerk gilt für alle Positionen dieses Gewerks, ein eigener Preis oder Zuschlag an der Position geht vor (farbig). € am Gewerk ist der Betrag für das ganze Gewerk.</p>
    </details>`;
  }
  /** Eingaben der Karte binden. neu() zeichnet die Seite neu. */
  function binden(w, list, neu) {
    const box = $('#kalkKarte'); if (!box) return;
    const wert = (el) => { const s = String(el.value || '').trim(); if (s === '') return ''; const v = parseFloat(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
    const nach = async () => { const y = window.scrollY; await neu?.(); window.scrollTo(0, y); };
    const fehler = () => toast('Bitte eine Zahl eintragen.');
    const nachlass = async () => { const v = wert($('[data-kzn]', box)); if (v === null) return fehler(); await nachlassSetzen(w, list, $('[data-kzna]', box).value, v); nach(); };
    $('[data-kzn]', box).onchange = nachlass; $('[data-kzna]', box).onchange = nachlass;
    $$('[data-kza]', box).forEach((el) => { const n = el.dataset.kza; const f = async () => { const v = wert(el); if (v === null) return fehler(); await angebotSetzen(w, list, n, $(`[data-kzaa="${n}"]`, box).value, v); nach(); }; el.onchange = f; $(`[data-kzaa="${n}"]`, box).onchange = f; });
    $$('[data-kzg]', box).forEach((el) => { const g = el.dataset.kzg; const f = async () => { const v = wert(el); if (v === null) return fehler(); await gewerkSetzen(w, list, g, $(`[data-kzga="${CSS.escape(g)}"]`, box).value, v); nach(); }; el.onchange = f; $(`[data-kzga="${CSS.escape(g)}"]`, box).onchange = f; });
    $$('[data-kzms]', box).forEach((el) => (el.onchange = async () => { await matSubSetzen(w, list, el.dataset.kzms, el.checked); nach(); }));
  }
  return { gesamt, nachlassText, kennzahlen, karte, binden, abgleichen, angebotSetzen, gewerkSetzen, matSubSetzen, nachlassSetzen, nachlassVon, angebotVon };
})();
