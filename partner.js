'use strict';
/* DOM – Subunternehmer und Lieferanten (Reiter „Subunternehmer“).
 * Speicher: 'partner:<id>' { id, kind:'partner', art:'sub'|'lief'|'sonst', firma, gewerk, inhaber, telefon, email,
 *   weitere:[…], anschrift, web, konditionen, notiz, geburtstage:[{ id, name, bez, datum }],
 *   dokumente:[{ id, name, typ, groesse, t }], created, updated }
 * Jedes abgelegte Dokument (Rahmenvertrag, Preisliste, PDF oder Foto) liegt einzeln als 'pdok:<id>'.
 * Die Geburtstage erscheinen im Kalender („Geburtstage Subunternehmer“). */
window.Partner = (() => {
  const alle = new Map();
  const key = (id) => 'partner:' + id;
  const ARTEN = [['sub', 'Subunternehmer'], ['lief', 'Lieferant'], ['aussen', 'Außendienst'], ['sonst', 'Sonstige']];
  // Eigene Einstufung wie beim Moodboard (Basic, Standard, Premium)
  const STUFEN = [['', 'Keine Einstufung'], ['basic', 'Basic'], ['standard', 'Standard'], ['premium', 'Premium']];
  const MAX_MB = 15;

  const norm = (p) => {
    for (const f of ['firma', 'gewerk', 'inhaber', 'telefon', 'email', 'anschrift', 'web', 'konditionen', 'notiz', 'stufe', 'kdnr']) p[f] = String(p[f] ?? '');
    p.art = ARTEN.some((a) => a[0] === p.art) ? p.art : 'sub';
    p.weitere = Kontakt.norm(p.weitere);
    p.geburtstage = (Array.isArray(p.geburtstage) ? p.geburtstage : []).filter(Boolean).map((g) => ({ id: g.id || uid(), name: String(g.name ?? ''), bez: String(g.bez ?? ''), datum: String(g.datum ?? ''), art: String(g.art ?? '') }));
    p.dokumente = (Array.isArray(p.dokumente) ? p.dokumente : []).filter(Boolean);
    return p;
  };
  async function laden() {
    const d = await db();
    const list = await new Promise((res, rej) => {
      const q = d.transaction('kv').objectStore('kv').getAll(IDBKeyRange.bound('partner:', 'partner:￿'));
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const offen = state.partner, tippt = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    alle.clear();
    for (const p of list) if (p?.id) alle.set(p.id, norm(p));
    if (offen && !offen.isNew) {
      if (!alle.has(offen.id)) state.partner = null;
      else if (tippt) alle.set(offen.id, offen);
      else state.partner = alle.get(offen.id);
    }
  }
  const byId = (id) => (id ? alle.get(id) : null) || null;
  const liste = () => [...alle.values()].sort((a, b) => (a.firma || a.inhaber || '~').localeCompare(b.firma || b.inhaber || '~', 'de'));
  const titel = (p) => p.firma.trim() || p.inhaber.trim();
  const initialen = (p) => (titel(p).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
  async function speichern(p) { delete p.isNew; p.updated = Date.now(); alle.set(p.id, p); await kvSet(key(p.id), p); }
  /** Für den Kalender: [{ datum, titel, sub, partnerId }] */
  const geburtstage = () => liste().flatMap((p) => p.geburtstage.filter((g) => g.datum).map((g) => ({ datum: g.datum, wer: g.name || 'ohne Namen', gebArt: g.art, titel: `Geburtstag ${g.name || 'ohne Namen'}`, sub: [g.bez, titel(p)].filter(Boolean).join(' · '), partnerId: p.id })));

  async function waehlen() {
    const v = await sheet('Welcher Subunternehmer?', liste().map((p) => ({ label: titel(p) || 'Ohne Namen', sub: [p.gewerk, p.inhaber].filter(Boolean).join(' · '), icon: `<span class="av sm">${esc(initialen(p))}</span>`, value: p.id })), { text: 'Neu, z. B. Fliesen Kaya GmbH' });
    if (!v) return null;
    if (v.text) { const p = norm({ id: uid(), kind: 'partner', created: Date.now(), firma: v.text }); await speichern(p); return p.id; }
    return v;
  }

  // ---------- Liste ----------
  let filter = '', artFilter = '';
  async function start() { if (!alle.size) await laden(); return state.partner ? detail(state.partner) : listeView(); }
  function listeView() {
    state.partner = null;
    header('Partner', 'Subunternehmer, Lieferanten, Außendienst');
    const all = liste();
    main().innerHTML = `
      <label class="search big">${icon('search')}<input type="search" id="pq" value="${esc(filter)}" placeholder="Firma, Gewerk, Name oder Telefon" autocomplete="off"></label>
      <button class="cta slim" id="pNew"><span class="cta-ico">${icon('plus')}</span>
        <span class="cta-t"><b>Neuer Partner</b></span>${icon('chevron', 'cta-chev')}</button>
      ${all.length ? `<div class="chips gfilter">${[['', 'Alle'], ...ARTEN].map(([id, n]) => `<button class="qchip ${artFilter === id ? 'on' : ''}" data-pa="${id}">${n} ${id ? all.filter((p) => p.art === id).length : all.length}</button>`).join('')}</div>
        <div class="plist" id="plist" style="margin-top:12px"></div>`
        : `<div class="empty-state">${icon('wrench')}<b>Noch keine Partner</b><span>Lege Subunternehmer, Lieferanten und Außendienstler mit ihren Konditionen an. Rahmenverträge kannst du als PDF oder Foto ablegen.</span></div>`}`;
    const render = () => {
      const el = $('#plist'); if (!el) return;
      const q = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const hay = (p) => `${p.firma} ${p.gewerk} ${p.inhaber} ${p.telefon} ${p.email} ${p.anschrift} ${p.notiz} ${p.konditionen} ${p.weitere.map((x) => x.wert).join(' ')}`.toLowerCase();
      const shown = all.filter((p) => (!artFilter || p.art === artFilter) && q.every((w) => hay(p).includes(w)));
      el.innerHTML = shown.map((p) => {
        const g = p.geburtstage.map((x) => ({ x, n: Kontakt.bisTag(x.datum) })).filter((y) => y.n !== null && y.n <= 14).sort((a, b) => a.n - b.n)[0];
        return `<button class="pcard kcard" data-p="${p.id}"><span class="av">${esc(initialen(p))}</span>
          <span class="pc-t"><b>${esc(titel(p) || 'Ohne Namen')}</b><span class="muted">${esc([p.gewerk, p.inhaber].filter(Boolean).join(' · ') || ARTEN.find((a) => a[0] === p.art)[1])}</span>
            <span class="pc-meta">${esc(ARTEN.find((a) => a[0] === p.art)[1])}${p.stufe ? ' · ' + esc(STUFEN.find((s) => s[0] === p.stufe)?.[1] || '') : ''}${p.dokumente.length ? ` · ${p.dokumente.length} ${p.dokumente.length === 1 ? 'Dokument' : 'Dokumente'}` : ''}${g ? ` · <span class="geb">${esc(g.x.name || 'Geburtstag')} ${Kontakt.tageText(g.n)}</span>` : ''}</span></span>
          ${icon('chevron', 'pc-chev')}</button>`;
      }).join('') || '<p class="empty">Nichts gefunden.</p>';
      $$('[data-p]', el).forEach((b) => (b.onclick = () => { detail(byId(b.dataset.p)); window.scrollTo(0, 0); }));
    };
    render();
    $('#pq').oninput = (e) => { filter = e.target.value; render(); };
    $$('[data-pa]').forEach((b) => (b.onclick = () => { artFilter = b.dataset.pa; listeView(); }));
    $('#pNew').onclick = () => { filter = ''; detail(norm({ id: uid(), kind: 'partner', created: Date.now(), isNew: true })); window.scrollTo(0, 0); };
  }

  // ---------- Karte ----------
  function detail(p) {
    if (!p) return listeView();
    state.partner = p;
    const back = () => { state.partner = null; listeView(); window.scrollTo(0, 0); };
    header(titel(p) || 'Neuer Partner', p.gewerk || (p.isNew ? 'Kontaktdaten eintragen' : ''), { label: 'Partner', fn: back });
    main().innerHTML = `
      <div class="kd-actions" id="pAct"></div>
      <div class="card kform">
        <div class="seg2 full" id="pArt">${ARTEN.map(([id, n]) => `<button type="button" data-art="${id}" class="${p.art === id ? 'on' : ''}">${n}</button>`).join('')}</div>
        <label>Firma</label><input type="text" id="pFirma" value="${esc(p.firma)}" autocomplete="off" placeholder="z. B. Fliesen Kaya GmbH">
        <label>Gewerk bzw. Sortiment</label><input type="text" id="pGewerk" value="${esc(p.gewerk)}" autocomplete="off" placeholder="z. B. Fliesen, Sanitär, Elektro">
        <label>Inhaber bzw. Ansprechpartner</label><input type="text" id="pInhaber" value="${esc(p.inhaber)}" autocomplete="off" placeholder="z. B. Mehmet Kaya">
        <label>Telefon</label><input type="tel" id="pTel" value="${esc(p.telefon)}" autocomplete="off" placeholder="0711 …">
        <label>E-Mail</label><input type="email" id="pMail" value="${esc(p.email)}" autocomplete="off" inputmode="email" placeholder="info@…">
        <div id="pWeitere">${Kontakt.weitereHtml()}</div>
        <label>Anschrift</label><div class="adr"><input type="text" id="pAdr" value="${esc(p.anschrift)}" autocomplete="off" placeholder="Straße Nr., der Ort wird ergänzt"></div>
        <label>Webseite</label><input type="url" id="pWeb" value="${esc(p.web)}" autocomplete="off" inputmode="url" placeholder="www.…">
        <div id="pLiefBox" ${p.art === 'lief' ? '' : 'hidden'}><label>Unsere Kundennummer bei dieser Firma</label><input type="text" id="pKdnr" value="${esc(p.kdnr)}" autocomplete="off" placeholder="z. B. 204711"></div>
        <label>Einstufung</label><div class="seg2 full" id="pStufe">${STUFEN.map(([id, n]) => `<button type="button" data-stufe="${id}" class="${(p.stufe || '') === id ? 'on' : ''}">${id ? n : '–'}</button>`).join('')}</div>
      </div>
      ${p.isNew ? '' : `<button class="notice plain" id="pRech">${icon('euro')}<span><b>Rechnungen dieser Firma</b> · Eingangsrechnungen ansehen</span>${icon('chevron')}</button>`}

      <div class="sec-h"><h2>Konditionen und Verträge</h2></div>
      <div class="card kform">
        <label style="margin-top:0">Verhandelte Konditionen</label><textarea id="pKond" rows="4" placeholder="z. B. 8 % auf Listenpreis, Stundensatz 58 €, Zahlungsziel 14 Tage, 2 % Skonto">${esc(p.konditionen)}</textarea>
        <div class="dlist" id="pDocs"></div>
        <button type="button" class="add-room" id="pDocAdd" style="margin-top:10px">${icon('upload')} Vertrag oder Dokument ablegen</button>
        <p class="hint" style="margin-bottom:0">PDF oder Foto, z. B. Rahmenvertrag, Preisliste, Versicherungsnachweis.</p>
      </div>

      <div class="sec-h"><h2>Geburtstage und Persönliches</h2></div>
      <div class="card kform">
        <div id="pGeb"></div>
        <button type="button" class="link-add" id="pGebAdd">${icon('cake')} Geburtstag hinzufügen</button>
        <label>Notizen</label><textarea id="pNotiz" placeholder="z. B. Sohn Emre spielt Fußball, mag Rotwein, zuverlässig bei Kleinaufträgen">${esc(p.notiz)}</textarea>
      </div>
      ${p.isNew ? '' : '<div id="pBelege"></div>'}
      ${p.isNew ? '' : `<button class="link-danger" id="pDel">${icon('trash')} Löschen</button>`}`;

    const persist = debounce(() => speichern(p), 400);
    const actions = () => {
      const A = Kontakt.aktionen({ tels: [{ label: 'Telefon', wert: p.telefon }, ...p.weitere.filter((x) => x.art === 'tel')], mails: [{ label: 'E-Mail', wert: p.email }, ...p.weitere.filter((x) => x.art === 'mail')], adresse: p.anschrift });
      $('#pAct').innerHTML = A.html; A.binden($('#pAct'));
    };
    actions();
    const felder = { pFirma: 'firma', pGewerk: 'gewerk', pInhaber: 'inhaber', pTel: 'telefon', pMail: 'email', pAdr: 'anschrift', pWeb: 'web', pKond: 'konditionen', pNotiz: 'notiz', pKdnr: 'kdnr' };
    for (const [id, f] of Object.entries(felder)) $('#' + id).oninput = (e) => {
      p[f] = e.target.value; persist(); actions();
      $('#title').textContent = titel(p) || 'Neuer Subunternehmer';
      const s = $('#subtitle'); s.textContent = p.gewerk; s.hidden = !p.gewerk;
    };
    $$('#pArt [data-art]').forEach((b) => (b.onclick = () => { p.art = b.dataset.art; persist(); $$('#pArt [data-art]').forEach((x) => x.classList.toggle('on', x === b)); $('#pLiefBox').hidden = p.art !== 'lief'; }));
    $$('#pStufe [data-stufe]').forEach((b) => (b.onclick = () => { p.stufe = b.dataset.stufe; persist(); $$('#pStufe [data-stufe]').forEach((x) => x.classList.toggle('on', x === b)); }));
    if ($('#pRech')) $('#pRech').onclick = () => { const z = $('#pBelege'); if (z) window.scrollTo({ top: z.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' }); };
    Kontakt.weitereBinden($('#pWeitere'), p.weitere, () => { persist(); actions(); });
    Kunden.adressVorschlaege($('#pAdr'));
    if (p.isNew) setTimeout(() => $('#pFirma')?.focus(), 50);
    if ($('#pBelege')) window.Finanzen?.partnerAbschnitt($('#pBelege'), p);

    // Geburtstage
    const gebRender = () => {
      $('#pGeb').innerHTML = p.geburtstage.map((g) => `<div class="grow" data-g="${g.id}">
        <input type="text" data-gf="name" value="${esc(g.name)}" placeholder="Name, z. B. Mehmet" autocomplete="off">
        <input type="text" data-gf="bez" value="${esc(g.bez)}" placeholder="z. B. Inhaber, Sohn" autocomplete="off">
        ${Kontakt.datumInput('g-' + g.id, g.datum)}
        <button type="button" class="icon-btn" data-gdel aria-label="Entfernen">${icon('x')}</button>
        ${Kontakt.gebArtSelect(g.art)}</div>`).join('');
      $$('[data-g]').forEach((row) => {
        const g = p.geburtstage.find((x) => x.id === row.dataset.g);
        $$('[data-gf]', row).forEach((inp) => (inp.oninput = () => { g[inp.dataset.gf] = inp.value; persist(); }));
        Kontakt.datumFeld($('#g-' + g.id), (v) => { g.datum = v; persist(); });
        $('[data-gebart]', row).onchange = (e) => { g.art = e.target.value; persist(); };
        $('[data-gdel]', row).onclick = () => { p.geburtstage = p.geburtstage.filter((x) => x !== g); persist(); gebRender(); };
      });
    };
    gebRender();
    $('#pGebAdd').onclick = () => {
      p.geburtstage.push({ id: uid(), name: p.geburtstage.length ? '' : p.inhaber, bez: p.geburtstage.length ? '' : 'Inhaber', datum: '' });
      persist(); gebRender(); $$('#pGeb .grow').pop()?.querySelector('input[inputmode]')?.focus();
    };

    // Dokumente
    const groesse = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
    const docRender = () => {
      $('#pDocs').innerHTML = p.dokumente.map((d) => `<div class="drow"><button type="button" class="drow-b" data-dopen="${d.id}">
          <span class="d-ico ${d.typ === 'application/pdf' ? 'navy' : 'brass'}">${icon(d.typ === 'application/pdf' ? 'file' : 'image')}</span>
          <span class="d-t"><b>${esc(d.name)}</b><span>${esc(new Date(d.t).toLocaleDateString('de-DE'))} · ${groesse(d.groesse || 0)}</span></span></button>
        <button type="button" class="icon-btn" data-dren="${d.id}" aria-label="Umbenennen">${icon('edit')}</button>
        <button type="button" class="icon-btn" data-ddel="${d.id}" aria-label="Löschen">${icon('trash')}</button></div>`).join('');
      $$('[data-dopen]').forEach((b) => (b.onclick = async () => {
        const d = p.dokumente.find((x) => x.id === b.dataset.dopen);
        const data = await kvGet('pdok:' + d.id);
        if (!data) { toast('Dokument ist auf diesem Gerät noch nicht da. Bitte kurz warten (Cloud-Abgleich).', 4000); return; }
        const blob = await (await fetch(data)).blob();
        const file = new File([blob], d.name, { type: d.typ });
        if (d.typ !== 'application/pdf' && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
        const url = URL.createObjectURL(file);
        const w = window.open(url, '_blank');
        if (!w) { const a = document.createElement('a'); a.href = url; a.download = d.name; a.click(); }
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      }));
      $$('[data-dren]').forEach((b) => (b.onclick = async () => {
        const d = p.dokumente.find((x) => x.id === b.dataset.dren);
        const v = await sheet('Dokument umbenennen', [], { text: 'Name', value: d.name });
        if (v?.text) { d.name = v.text; await speichern(p); docRender(); }
      }));
      $$('[data-ddel]').forEach((b) => (b.onclick = async () => {
        const d = p.dokumente.find((x) => x.id === b.dataset.ddel);
        if (!loeschFrage(`„${d.name}“ löschen?`)) return;
        p.dokumente = p.dokumente.filter((x) => x !== d); await speichern(p); await kvDel('pdok:' + d.id); docRender();
      }));
    };
    docRender();
    $('#pDocAdd').onclick = async () => {
      const files = await pickFiles({ multiple: true, accept: 'application/pdf,image/*' });
      for (const f of files) {
        if (f.size > MAX_MB * 1e6) { toast(`„${f.name}“ ist zu groß (höchstens ${MAX_MB} MB).`, 4000); continue; }
        let data = await fileToDataUrl(f), typ = f.type || 'application/pdf', size = f.size;
        if (typ.startsWith('image/')) { data = await resize(data, 2200, 'image/jpeg', 0.85); typ = 'image/jpeg'; size = Math.round(data.length * 0.75); }
        const id = uid();
        await kvSet('pdok:' + id, data);
        p.dokumente.push({ id, name: f.name.replace(/\.[^.]+$/, '') || 'Dokument', typ, groesse: size, t: Date.now() });
      }
      if (files.length) { await speichern(p); docRender(); toast(files.length === 1 ? 'Dokument abgelegt' : `${files.length} Dokumente abgelegt`); }
    };
    if ($('#pDel')) $('#pDel').onclick = async () => {
      if (!loeschFrage(`„${titel(p) || 'Ohne Namen'}“ mit allen Dokumenten löschen?`)) return;
      for (const d of p.dokumente) await kvDel('pdok:' + d.id);
      alle.delete(p.id); await kvDel(key(p.id)); back();
    };
  }

  function oeffnen(id) { const p = byId(id); if (!p) return toast('Nicht gefunden.'); window.openTab('partner', { partner: p }); }

  return { laden, start, listeView, detail, byId, liste, geburtstage, waehlen, oeffnen };
})();
