'use strict';
/* DOM – Mitdenken vor Ort und Angebotsentwurf im Büro.
 * Vor Ort:  „Was fehlt noch?“ Die KI liest, was schon da ist (Gespräch, Fotos, Maße, Scans), und stellt die Fragen,
 *           die fürs Angebot noch offen sind, solange man beim Kunden ist. Gespeichert in w.vorOrt.fragen.
 * Im Büro:  „Angebotsentwurf erstellen“. Die KI schlägt je Bereich Positionen vor (aus der Preisliste, sonst frei),
 *           die Mengen kommen aus dem Aufmaß, wo es eines gibt. Prüfen, dann in die Angebote der Räume übernehmen.
 *           Was noch fehlt, steht in w.entwurf.offen.
 * Nicht auf Bäder beschränkt: jede Arbeit (Rollläden, Steckdosen, Türgriffe …) ist möglich.
 * Alle Annahmen (Prüfliste, Anzahl Fragen und Fotos, Hinweise, Prompts) stehen in den Vorgaben (vorgaben.js). */
window.VorOrt = (() => {
  const A = () => window.Angebot._intern;
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const fmtIn = (x) => (x || x === 0 ? String(Math.round(x * 100) / 100).replace('.', ',') : '');
  const STUECK = /^(stück|stk|pauschal|psch|tag|std\.?|h)$/i;
  const raumName = (r) => r.room || roomType(r.roomType).name;
  const gleich = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const MASSE = ['boden', 'decke', 'wand', 'umfang', 'sockel', 'tueren', 'fenster'];
  const json = (txt, leer) => { try { return JSON.parse(txt); } catch { return leer; } };

  // ---------- Was ist schon da? ----------
  /** Maße eines Raums aus dem Aufmaß: { werte, quelle } oder null, wenn noch nichts gemessen ist. */
  function masseVon(r) {
    const a = r.aufmass?.raeume?.[0];
    if (!a) return null;
    let m;
    try { m = A().masse(a); } catch { return null; }
    if (!(m.boden > 0)) return null;
    const quelle = a.schaetzung ? (a.schaetzung.quelle === 'lidar' ? 'gemessen' : 'geschaetzt') : 'gemessen';
    return { werte: Object.fromEntries(MASSE.map((k) => [k, Math.round(m[k] * 100) / 100])), hoehe: m.hoehe, quelle };
  }
  /** Fotos fürs Mitdenken: die aus den Räumen und die Doku-Fotos des Projekts, verkleinert, höchstens n. */
  async function fotos(w, list, n) {
    const out = [];
    for (const r of list) for (const ph of r.photos || []) out.push({ label: raumName(r), data: ph });
    if (w.kundeId) {
      const d = await kvGet(`bilder:${w.kundeId}:${w.objektId || 'ohne'}`);
      const ordner = Object.fromEntries((d?.ordner || []).map((o) => [o.id, o.name]));
      for (const b of (d?.bilder || []).filter((x) => x.projektId === w.id)) out.push({ label: ordner[b.ordner] || 'Foto', id: b.id });
    }
    // Gleichmäßig auswählen, wenn es mehr sind als erlaubt
    const wahl = out.length <= n ? out : Array.from({ length: n }, (_, i) => out[Math.floor((i * out.length) / n)]);
    const parts = [];
    for (const [i, f] of wahl.entries()) {
      try {
        const data = f.data || (await kvGet('bild:' + f.id));
        if (!data) continue;
        const klein = await resize(data, 1024, 'image/jpeg', 0.7);
        parts.push({ text: `Photo ${i + 1} (${f.label}):` }, { inline_data: { mime_type: 'image/jpeg', data: klein.split(',')[1] } });
      } catch (e) { console.warn('Foto nicht lesbar', e); }
    }
    return { parts, anzahl: out.length };
  }
  /** Alles, was zum Projekt vorliegt, als Text für die KI. */
  function lage(w, list) {
    const g = w.gespraech || {}, z = [];
    z.push(`PROJECT: ${w.titel || 'ohne Namen'}${w.address ? ' · ' + w.address : ''}`);
    if (g.dabei) z.push(`ON SITE: ${Array.isArray(g.dabei) ? g.dabei.join(', ') : typeof g.dabei === 'string' ? g.dabei : JSON.stringify(g.dabei)}`);
    const partner = (window.Partner?.liste?.() || []).filter((x) => x.art !== 'aussen').map((x) => `${x.firma || x.inhaber || ''}${x.gewerk ? ' (' + x.gewerk + ')' : ''}`).filter((s) => s.trim());
    if (partner.length) z.push(`SUBCONTRACTORS OF THE COMPANY: ${partner.join('; ')}`);
    z.push('AREAS SO FAR:');
    if (!list.length) z.push('- none yet');
    for (const r of list) {
      const m = masseVon(r);
      z.push(`- ${raumName(r)} [type ${r.roomType}] · photos: ${(r.photos || []).length} · measurements: ${m ? `${m.quelle === 'gemessen' ? 'measured' : 'estimated from photos'}: floor ${m.werte.boden} m², walls ${m.werte.wand} m², perimeter ${m.werte.umfang} m, height ${m.hoehe} m, doors ${m.werte.tueren}, windows ${m.werte.fenster}` : 'NONE'}`);
      for (const t of [r.wishes, r.otherNotes]) if (t?.trim()) z.push(t.trim().split('\n').map((l) => '    ' + l).join('\n'));
    }
    if (w.vorOrt?.scans?.length) z.push(`ROOM SCANS (LiDAR): ${w.vorOrt.scans.map((s) => s.name || s.raum || 'Scan').join(', ')}`);
    const allg = [...(g.allgemein?.bild || []), ...(g.allgemein?.sonstiges || [])];
    if (allg.length) z.push('FOR ALL AREAS: ' + allg.join(' · '));
    if (g.zus) z.push('SUMMARY OF THE CONVERSATION:\n' + (typeof g.zus === 'string' ? g.zus : JSON.stringify(g.zus)));
    if (g.transcript) z.push('CONVERSATION (transcript, may be long):\n' + g.transcript.slice(-(+vorgabe('vorortZeichen') || 30000)));
    const beantwortet = (w.vorOrt?.fragen || []).filter((f) => f.antwort?.trim());
    if (beantwortet.length) z.push('ALREADY ANSWERED ON SITE:\n' + beantwortet.map((f) => `- ${f.bereich ? f.bereich + ': ' : ''}${f.frage} → ${f.antwort.trim()}`).join('\n'));
    const erledigt = (w.vorOrt?.fragen || []).filter((f) => f.erledigt && !f.antwort?.trim());
    if (erledigt.length) z.push('ALREADY DONE (do not ask again):\n' + erledigt.map((f) => `- ${f.frage}`).join('\n'));
    if (w.vorOrt?.notiz?.trim()) z.push('OWN NOTES:\n' + w.vorOrt.notiz.trim());
    return z.join('\n');
  }
  const hatStoff = (w, list) => !!(w.gespraech?.transcript || w.vorOrt?.notiz?.trim() || list.some((r) => (r.photos || []).length || r.wishes?.trim() || r.otherNotes?.trim()));

  // ---------- Vor Ort: Was fehlt noch? ----------
  async function fragenHolen(w, list) {
    const f = await fotos(w, list, +vorgabe('vorortFotos') || 8);
    const txt = await geminiText([{ text: vorgabeText('promptVorOrt', { max: +vorgabe('vorortFragenMax') || 8, pruefliste: vorgabe('vorortPruefliste') || '' }) + '\n\n' + lage(w, list) + `\n\nPHOTOS IN THE PROJECT: ${f.anzahl}${f.parts.length ? ` (${f.parts.length / 2} attached)` : ''}` }, ...f.parts], true, {
      responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { bereich: { type: 'STRING' }, frage: { type: 'STRING' }, art: { type: 'STRING', enum: ['mass', 'foto', 'kunde', 'info'] } }, required: ['frage'] } } });
    const neu = json(txt, []);
    if (!Array.isArray(neu)) throw new Error('Die KI hat keine Liste geliefert.');
    w.vorOrt ??= {};
    // Beantwortetes und Abgehaktes bleibt stehen, offene Fragen werden durch die neuen ersetzt
    const alt = (w.vorOrt.fragen || []).filter((x) => x.erledigt || x.antwort?.trim());
    w.vorOrt.fragen = [...alt, ...neu.filter((x) => String(x.frage || '').trim() && !alt.some((a) => gleich(a.frage, x.frage))).map((x) => ({ id: uid(), bereich: String(x.bereich || '').trim(), frage: String(x.frage).trim(), art: x.art || 'info', antwort: '', erledigt: false }))];
    w.vorOrt.geprueft = Date.now();
    await Projekt.save(w);
  }
  const ART = { mass: 'Maß', foto: 'Foto', kunde: 'Kunden fragen', info: 'Klären' };
  function karte(w, list) {
    const fr = w.vorOrt?.fragen || [], offen = fr.filter((f) => !f.erledigt).length;
    const ki = !!state.settings.apiKey;
    return `<div class="sec-h"><h2>Was fehlt noch?</h2>${fr.length ? `<span class="count" id="voZahl">${offen ? offen + ' offen' : 'alles geklärt'}</span>` : ''}</div>
      <div class="card wf-card">
        ${fr.length ? `<div class="wf-l">${fr.map((f) => `<div class="wf-f ${f.erledigt ? 'ok' : ''}" data-vof="${f.id}">
            <label class="wf-k"><input type="checkbox" data-voc="${f.id}" ${f.erledigt ? 'checked' : ''}><span><b>${esc(f.frage)}</b><small>${esc([f.bereich, ART[f.art] || ''].filter(Boolean).join(' · '))}</small></span></label>
            <input type="text" data-voa="${f.id}" value="${esc(f.antwort || '')}" placeholder="${f.art === 'foto' ? 'Foto gemacht? Dann abhaken' : 'Antwort tippen oder diktieren'}" aria-label="Antwort"></div>`).join('')}</div>`
        : `<p class="hint" style="margin-top:0">Bevor du gehst: Die App schaut, was für das Angebot noch fehlt, und fragt nach. Zum Beispiel Maße, Deckenhöhe, Anzahl, Fabrikat oder ein Foto. Egal, um welche Arbeit es geht.</p>`}
        <textarea id="voNotiz" placeholder="Eigene Notizen: was gemacht werden soll, Maße, Besonderheiten" style="min-height:64px;margin-top:8px">${esc(w.vorOrt?.notiz || '')}</textarea>
        <button class="btn ${fr.length ? 'secondary' : ''} block" id="voPruefen" style="margin-top:8px" ${ki ? '' : 'disabled'}>${icon('sparkle')} ${fr.length ? 'Nochmal prüfen, was fehlt' : 'Prüfen, was noch fehlt'}</button>
        ${ki ? '' : '<p class="hint center">Dafür braucht die App den KI-Schlüssel (Einstellungen › KI).</p>'}
      </div>`;
  }
  let laeuft = false;
  async function pruefen(w, list, neuZeichnen) {
    if (laeuft) return;
    if (!hatStoff(w, list)) return toast('Noch nichts da zum Prüfen. Erst Gespräch aufnehmen, Fotos machen oder Notizen eintragen.', 5000);
    laeuft = true;
    const b = $('#voPruefen');
    if (b) { b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Die KI denkt mit …'; }
    try {
      await fragenHolen(w, list);
      const n = (w.vorOrt.fragen || []).filter((f) => !f.erledigt).length;
      toast(n ? `Bevor du gehst: ${n} ${n === 1 ? 'Punkt' : 'Punkte'} offen` : 'Für das Angebot ist alles da.', 5000);
    } catch (e) { console.error(e); toast('Prüfen ging nicht: ' + e.message, 6000); }
    laeuft = false;
    neuZeichnen?.();
  }
  function bind(w, list, neuZeichnen) {
    const sichern = debounce(() => { Projekt.save(w); const n = (w.vorOrt?.fragen || []).filter((f) => !f.erledigt).length; if ($('#voZahl')) $('#voZahl').textContent = n ? n + ' offen' : 'alles geklärt'; }, 500);
    const finde = (id) => (w.vorOrt?.fragen || []).find((f) => f.id === id);
    if ($('#voPruefen')) $('#voPruefen').onclick = () => pruefen(w, list, neuZeichnen);
    if ($('#voNotiz')) $('#voNotiz').oninput = (e) => { (w.vorOrt ??= {}).notiz = e.target.value; sichern(); };
    $$('[data-voc]').forEach((c) => (c.onchange = () => { const f = finde(c.dataset.voc); if (!f) return; f.erledigt = c.checked; c.closest('.wf-f').classList.toggle('ok', c.checked); sichern(); }));
    $$('[data-voa]').forEach((i) => (i.oninput = () => {
      const f = finde(i.dataset.voa); if (!f) return;
      f.antwort = i.value;
      // Wer antwortet, hat die Frage geklärt
      if (i.value.trim() && !f.erledigt) { f.erledigt = true; const row = i.closest('.wf-f'); row.classList.add('ok'); $('[data-voc]', row).checked = true; }
      sichern();
    }));
  }
  /** Nach dem Ende einer Aufnahme: gleich prüfen, was fehlt (Vorgabe vorortAuto). */
  async function nachAufnahme(w) {
    if (vorgabe('vorortAuto') !== 'ja' || !state.settings.apiKey || !w) return;
    const list = await Projekt.raeume(w);
    await pruefen(w, list, () => { if (state.wohnung?.id === w.id && $('#voPruefen')) Projekt.view(); });
  }

  // ---------- Im Büro: Angebotsentwurf ----------
  async function entwurfHolen(w, list) {
    const PL = await A().preisliste();
    const katalog = PL.positionen.map((x) => `${x.nr} | ${x.text} | ${x.einheit} | ${x.gewerk}`).join('\n');
    const f = await fotos(w, list, +vorgabe('entwurfFotos') || 12);
    const schon = list.map((r) => (r.angebot?.positionen?.length ? `${raumName(r)}: ${r.angebot.positionen.map((x) => x.frei?.text || x.nr).join(', ')}` : '')).filter(Boolean);
    const txt = await geminiText([{ text: vorgabeText('promptEntwurf', { hinweise: vorgabe('entwurfHinweise') || '', raumtypen: ROOM_TYPES.map((r) => r.id).join(', ') }) + '\n\n' + lage(w, list) + (schon.length ? '\n\nALREADY IN THE OFFER (do not repeat):\n' + schon.join('\n') : '') + `\n\nPRICE LIST (nr | text | unit | trade):\n${katalog}` }, ...f.parts], true, {
      responseSchema: { type: 'OBJECT', properties: {
        bereiche: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, raumtyp: { type: 'STRING' },
          positionen: { type: 'ARRAY', items: { type: 'OBJECT', properties: { nr: { type: 'STRING' }, text: { type: 'STRING' }, einheit: { type: 'STRING' }, menge: { type: 'NUMBER' }, mengeAus: { type: 'STRING' }, partner: { type: 'BOOLEAN' }, grund: { type: 'STRING' } }, required: ['text'] } } }, required: ['name', 'positionen'] } },
        offen: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['bereiche'] } });
    const j = json(txt, null);
    if (!j?.bereiche) throw new Error('Die KI hat keinen Entwurf geliefert.');
    const pos = (nr) => PL.positionen.find((x) => x.nr === nr);
    // Mengen: aus dem Aufmaß, wo die KI ein Maß nennt und es eines gibt (gemessen); sonst ihre Schätzung; sonst fehlt
    const bereiche = j.bereiche.map((b) => {
      const raum = list.find((r) => gleich(raumName(r), b.name));
      const m = raum ? masseVon(raum) : null;
      return { name: String(b.name || 'Leistungen').trim(), raumtyp: ROOM_TYPES.some((r) => r.id === b.raumtyp) ? b.raumtyp : raum?.roomType || 'sonstiges', raumId: raum?.id || '',
        zeilen: (b.positionen || []).map((x) => {
          const it = x.nr ? pos(x.nr) : null;
          const einheit = it?.einheit || x.einheit || 'Stück';
          let menge = +x.menge > 0 ? +x.menge : 0, sicher = menge ? 'geschaetzt' : 'fehlt';
          if (m && MASSE.includes(x.mengeAus) && m.werte[x.mengeAus] > 0) { menge = m.werte[x.mengeAus]; sicher = m.quelle; }
          menge = STUECK.test(einheit) ? Math.ceil(menge - 1e-9) : Math.round(menge * 10) / 10;
          return { nr: it ? it.nr : '', text: it ? it.text : String(x.text || '').trim(), einheit, menge, sicher, partner: !!x.partner, grund: String(x.grund || '').trim(), allgemein: it?.gewerk === 'Allgemein', preis: 0, an: true };
        }).filter((x) => x.text) };
    }).filter((b) => b.zeilen.length);
    return { bereiche, offen: (j.offen || []).map((s) => String(s).trim()).filter(Boolean) };
  }
  const SICHER = { gemessen: ['gemessen', 'gut'], geschaetzt: ['geschätzt', 'mittel'], fehlt: ['Menge fehlt', 'schlecht'] };
  /** Seite zum Prüfen des Entwurfs. Erst „Übernehmen“ schreibt etwas in die Angebote. */
  function entwurfView(w, list, E) {
    const zurueck = () => Projekt.view();
    header('Angebotsentwurf', w.customer || '', { label: 'Zurück', fn: zurueck });
    const n = E.bereiche.reduce((s, b) => s + b.zeilen.length, 0);
    main().innerHTML = `
      <p class="hint" style="margin-top:0">Vorschlag der KI aus Gespräch, Fotos und Maßen. Hake ab, was nicht hinein soll, und prüfe die Mengen. <span class="wf-b mittel">geschätzt</span> bitte prüfen, <span class="wf-b schlecht">Menge fehlt</span> bitte eintragen. Preise aus deiner Preisliste rechnet die App wie immer.</p>
      ${E.bereiche.map((b, bi) => `<div class="sec-h"><h2>${esc(b.name)}</h2><span class="count">${b.raumId ? '' : 'neu · '}${b.zeilen.length}</span></div>
        <div class="card wf-e">${b.zeilen.map((x, i) => `<div class="wf-z" data-vz="${bi}:${i}">
          <input type="checkbox" data-van="${bi}:${i}" checked aria-label="Übernehmen">
          <div class="wf-t">${x.nr ? `<b>${esc(x.text)}</b>` : `<input type="text" data-vtx="${bi}:${i}" value="${esc(x.text)}" aria-label="Leistung">`}
            <small>${esc([x.nr || 'Eigene Position', x.grund].filter(Boolean).join(' · '))}</small>
            <div class="wf-m"><input type="text" inputmode="decimal" data-vme="${bi}:${i}" value="${x.menge ? fmtIn(x.menge) : ''}" placeholder="Menge" aria-label="Menge"><span>${esc(x.einheit)}</span>
              ${x.nr ? '' : `<input type="text" inputmode="decimal" data-vpr="${bi}:${i}" value="" placeholder="${x.partner ? 'Preis folgt' : 'Preis'}" aria-label="Preis je Einheit netto"><span>€</span>`}
              <span class="wf-b ${SICHER[x.sicher][1]}" data-vsi="${bi}:${i}">${SICHER[x.sicher][0]}</span>${x.partner ? '<span class="wf-b partner">Preis kommt von Partner</span>' : ''}</div></div></div>`).join('')}</div>`).join('')}
      ${E.offen.length ? `<div class="sec-h"><h2>Noch offen</h2><span class="count">${E.offen.length}</span></div><div class="card"><ul class="wf-o">${E.offen.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
      <button class="btn big block" id="voOk" style="margin-top:16px">${n} Positionen ins Angebot übernehmen</button>
      <button class="btn secondary block" id="voAb" style="margin-top:8px">Verwerfen</button>`;
    const z = (k) => { const [bi, i] = k.split(':'); return E.bereiche[+bi].zeilen[+i]; };
    const zaehle = () => { const k = E.bereiche.reduce((s, b) => s + b.zeilen.filter((x) => x.an && x.menge > 0).length, 0); $('#voOk').textContent = k ? `${k} ${k === 1 ? 'Position' : 'Positionen'} ins Angebot übernehmen` : 'Bitte Positionen anhaken'; };
    $$('[data-van]').forEach((c) => (c.onchange = () => { z(c.dataset.van).an = c.checked; c.closest('.wf-z').classList.toggle('aus', !c.checked); zaehle(); }));
    $$('[data-vtx]').forEach((c) => (c.oninput = () => { z(c.dataset.vtx).text = c.value; }));
    $$('[data-vpr]').forEach((c) => (c.oninput = () => { z(c.dataset.vpr).preis = num(c.value); }));
    $$('[data-vme]').forEach((c) => (c.oninput = () => {
      const x = z(c.dataset.vme); x.menge = num(c.value);
      // Von Hand eingetragen oder bestätigt: gilt als geprüft
      x.sicher = x.menge > 0 ? 'gemessen' : 'fehlt';
      const b = $(`[data-vsi="${c.dataset.vme}"]`); b.className = 'wf-b ' + SICHER[x.sicher][1]; b.textContent = x.menge > 0 ? 'geprüft' : SICHER.fehlt[0];
      zaehle();
    }));
    zaehle();
    $('#voAb').onclick = zurueck;
    $('#voOk').onclick = async () => {
      const b = $('#voOk'); b.disabled = true;
      try { const k = await uebernehmen(w, list, E); toast(`${k} ${k === 1 ? 'Position' : 'Positionen'} übernommen`, 4000); Projekt.view(); }
      catch (e) { console.error(e); b.disabled = false; toast('Übernehmen ging nicht: ' + e.message, 6000); }
    };
    window.scrollTo(0, 0);
  }
  /** Schreibt die angehakten Zeilen in die Angebote der Räume. Bereiche ohne Raum werden als „Sonstiger Raum“ angelegt. */
  async function uebernehmen(w, list, E) {
    let k = 0;
    const offen = [...E.offen];
    for (const b of E.bereiche) {
      const zeilen = b.zeilen.filter((x) => x.an && x.text.trim());
      for (const x of zeilen.filter((y) => !(y.menge > 0))) offen.push(`Menge fehlt: ${b.name} – ${x.text} (${x.einheit})`);
      const rein = zeilen.filter((x) => x.menge > 0);
      if (!rein.length) continue;
      let r = list.find((y) => y.id === b.raumId) || list.find((y) => gleich(raumName(y), b.name));
      if (!r) {
        r = { id: uid(), created: Date.now(), wohnungId: w.id, kundeId: w.kundeId || '', customer: w.customer, address: w.address, roomType: b.raumtyp, room: b.name, note: '', photos: [], thumb: '', results: {}, selected: packagesFor(b.raumtyp).map((y) => y.id), pdfProducts: true, pdfPrices: false, nurAngebot: true };
        w.rooms.push(r.id); delete w.isNew; list.push(r);
      }
      A().init(r);
      r.angebot.positionen ??= [];
      const raum = r.aufmass.raeume[0]?.name || r.room || '';
      for (const x of rein) {
        const ki = { sicher: x.sicher === 'gemessen' ? '' : x.sicher, ...(x.partner ? { partner: true } : {}), ...(x.grund ? { grund: x.grund } : {}) };
        if (x.nr) {
          if (r.angebot.positionen.some((y) => y.nr === x.nr)) continue;
          r.angebot.positionen.push({ nr: x.nr, raum: x.allgemein ? '' : raum, menge: x.menge, bem: '', ki });
        } else {
          if (r.angebot.positionen.some((y) => y.frei && gleich(y.frei.text, x.text))) continue;
          r.angebot.positionen.push({ nr: 'FREI-' + uid(), frei: { text: x.text.trim(), einheit: x.einheit }, raum, menge: x.menge, bem: '', epFix: x.preis > 0 ? x.preis : 0, ki,
            ...(x.partner ? { sub: { partnerId: '', firma: '', ep: 0, zuschlag: +vorgabe('subZuschlag') || 0 } } : {}) });
        }
        k++;
      }
      r.angebot.geaendert = true;
      await kvSet('project:' + r.id, r);
    }
    w.entwurf = { t: Date.now(), offen: offen.map((text) => ({ id: uid(), text, erledigt: false })) };
    await Projekt.save(w);
    return k;
  }
  /** Was im Angebot noch geklärt werden muss: Punkte aus dem Entwurf und Positionen ohne Preis. */
  function offenListe(w, list) {
    const out = (w.entwurf?.offen || []).filter((o) => !o.erledigt).map((o) => ({ id: o.id, text: o.text }));
    for (const r of list) for (const x of r.angebot?.positionen || []) {
      if (x.frei && !(x.epFix > 0)) out.push({ text: `Preis fehlt: ${raumName(r)} – ${x.frei.text}${x.ki?.partner ? ' (kommt von Partner)' : ''}` });
      else if (x.ki?.sicher === 'geschaetzt') out.push({ text: `Menge geschätzt: ${raumName(r)} – ${x.frei?.text || x.nr}, bitte prüfen` });
    }
    return out;
  }
  function bueroKarte(w, list) {
    const ki = !!state.settings.apiKey, offen = offenListe(w, list);
    return `<button class="btn block" id="voEntwurf" ${ki ? '' : 'disabled'}>${icon('sparkle')} ${w.entwurf ? 'Entwurf ergänzen lassen' : 'Angebotsentwurf erstellen'}</button>
      <p class="hint center">${ki ? 'Die KI schlägt aus Gespräch, Fotos und Maßen die Positionen vor. Du prüfst, bevor etwas übernommen wird.' : 'Dafür braucht die App den KI-Schlüssel (Einstellungen › KI).'}</p>
      ${offen.length ? `<div class="card wf-offen"><b>Noch offen (${offen.length})</b><ul class="wf-o">${offen.map((o) => `<li>${o.id ? `<label><input type="checkbox" data-voo="${o.id}"> ${esc(o.text)}</label>` : esc(o.text)}</li>`).join('')}</ul></div>` : ''}`;
  }
  function bueroBind(w, list) {
    const b = $('#voEntwurf');
    if (b) b.onclick = async () => {
      if (!hatStoff(w, list)) return toast('Noch nichts da für einen Entwurf. Erst Gespräch, Fotos oder Notizen vor Ort aufnehmen.', 5000);
      b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Entwurf wird erstellt (bis zu 1 Minute) …';
      try {
        const E = await entwurfHolen(w, list);
        if (!E.bereiche.length) { toast('Die KI hat keine Positionen gefunden.', 5000); return Projekt.view(); }
        entwurfView(w, list, E);
      } catch (e) { console.error(e); toast('Entwurf ging nicht: ' + e.message, 6000); Projekt.view(); }
    };
    $$('[data-voo]').forEach((c) => (c.onchange = async () => { const o = (w.entwurf?.offen || []).find((x) => x.id === c.dataset.voo); if (o) { o.erledigt = c.checked; await Projekt.save(w); c.closest('li').classList.toggle('ok', c.checked); } }));
  }

  return { karte, bind, nachAufnahme, bueroKarte, bueroBind, offenListe, _intern: { lage, masseVon, entwurfHolen, uebernehmen, fragenHolen } };
})();
