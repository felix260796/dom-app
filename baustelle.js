'use strict';
/* DOM – Baustelle: Bestellungen beim Lieferanten (B13) und Abnahmeprotokoll mit Unterschrift (B18).
 * Bestellungen: w.bestellungen [{ id, partnerId, von, was, datum, liefertermin, status: 'bestellt'|'geliefert', notiz }]
 * Abnahme: w.abnahme { datum, anwesend, raeume: [Name], maengel: [{ id, text, frist, erledigt }], vorbehalt, unterschriftKunde, unterschriftWir, t }
 * Beides hängt im Projekt (projekt.js ruft Baustelle.abschnitt auf). Baut auf app.js, core.js, projekt.js, kunden.js, partner.js auf. */
window.Baustelle = (() => {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const heute = () => iso(new Date());
  const tag = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const vonText = (b) => { const p = window.Partner?.byId(b.partnerId); return p ? p.firma || p.inhaber || 'Lieferant' : b.von || 'Lieferant'; };

  /** Abschnitt im Projekt: Bestellungen und Abnahme. */
  function abschnitt(el, w, list) {
    if (!el) return;
    const best = w.bestellungen || [];
    const offen = best.filter((b) => b.status !== 'geliefert');
    const ab = w.abnahme;
    const maengelOffen = (ab?.maengel || []).filter((m) => !m.erledigt).length;
    el.innerHTML = `<div class="sec-h"><h2>Bestellungen</h2>${best.length ? `<span class="count">${offen.length ? `${offen.length} offen` : 'alles geliefert'}</span>` : ''}</div>
      <div class="plist">${best.map((b) => `<button class="pcard" data-best="${b.id}"><span class="pc-ph">${icon('clipboard')}</span>
        <span class="pc-t"><b>${esc(b.was || 'Bestellung')}</b>
          <span class="pills"><span class="st-pill" style="--c:${b.status === 'geliefert' ? '#2f8a57' : b.liefertermin && b.liefertermin < heute() ? '#c0392b' : '#3b6ea8'}">${b.status === 'geliefert' ? 'Geliefert' : 'Bestellt'}</span><span class="muted">${esc(vonText(b))}</span></span>
          ${b.status !== 'geliefert' && b.liefertermin ? `<span class="muted">Liefertermin ${esc(tag(b.liefertermin))}</span>` : ''}</span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>
      <button class="add-room" id="bstNeu" style="width:100%;margin-top:8px">${icon('plus')} Bestellung eintragen</button>
      <div class="docs" style="margin-top:14px"><button class="doc" id="abnahme"><span class="d-ico ${ab?.unterschriftKunde ? 'navy' : 'brass'}">${icon('check')}</span>
        <span class="d-t"><b>Abnahmeprotokoll</b><span>${ab?.unterschriftKunde ? `Abgenommen am ${esc(tag(ab.datum))}${maengelOffen ? ` · ${maengelOffen} ${maengelOffen === 1 ? 'Mangel' : 'Mängel'} offen` : ''}` : 'Mit dem Kunden durchgehen und auf dem Handy unterschreiben lassen'}</span></span>${icon('chevron', 'pc-chev')}</button></div>`;
    const zurueck = () => Projekt.view();
    $('#bstNeu', el).onclick = () => bestellung(w, null, zurueck);
    $$('[data-best]', el).forEach((b) => (b.onclick = () => bestellung(w, best.find((x) => x.id === b.dataset.best), zurueck)));
    $('#abnahme', el).onclick = () => abnahme(w, list, zurueck);
  }

  // ---------- Bestellung ----------
  function bestellung(w, b, fertig) {
    const neu = !b;
    b = b ? { ...b } : { id: uid(), partnerId: '', von: '', was: '', datum: heute(), liefertermin: '', status: 'bestellt', notiz: '' };
    const partner = (window.Partner?.liste() || []).slice().sort((x, y) => (x.firma || '').localeCompare(y.firma || ''));
    header(neu ? 'Bestellung' : b.was || 'Bestellung', w.titel || '', { label: 'Zurück', fn: fertig });
    main().innerHTML = `<div class="card kform">
        <label style="margin-top:0">Was wurde bestellt?</label><textarea id="bWas" placeholder="z. B. Fliesen 60×60 grau, 24 m², Duschrinne 80 cm">${esc(b.was)}</textarea>
        <label>Bei wem?</label>
        <select id="bPart"><option value="">Anderer Lieferant, Name eintragen</option>${partner.map((p) => `<option value="${p.id}" ${p.id === b.partnerId ? 'selected' : ''}>${esc(p.firma || p.inhaber || 'Ohne Namen')}</option>`).join('')}</select>
        <input type="text" id="bVon" value="${esc(b.von)}" placeholder="z. B. Baustoffhandel Müller" ${b.partnerId ? 'hidden' : ''} style="margin-top:6px">
        <div class="row"><div><label>Bestellt am</label><input type="date" id="bDat" value="${esc(b.datum)}"></div>
          <div><label>Liefertermin</label><input type="date" id="bLief" value="${esc(b.liefertermin)}"></div></div>
        <label>Stand</label>
        <div class="seg2 full"><button type="button" data-bs="bestellt" class="${b.status === 'bestellt' ? 'on' : ''}" style="--c:#3b6ea8">Bestellt</button><button type="button" data-bs="geliefert" class="${b.status === 'geliefert' ? 'on' : ''}" style="--c:#2f8a57">Geliefert</button></div>
        <label>Notiz</label><textarea id="bNot" placeholder="z. B. Lieferung an die Baustelle, Kunde informiert">${esc(b.notiz)}</textarea>
      </div>
      <button class="btn big block" id="bOk">${icon('check')} Speichern</button>
      ${neu ? '' : `<button class="link-danger" id="bDel">${icon('trash')} Bestellung löschen</button>`}`;
    $('#bPart').onchange = (e) => { $('#bVon').hidden = !!e.target.value; };
    $$('[data-bs]').forEach((x) => (x.onclick = () => { b.status = x.dataset.bs; $$('[data-bs]').forEach((y) => y.classList.toggle('on', y === x)); }));
    $('#bOk').onclick = async () => {
      Object.assign(b, { was: $('#bWas').value.trim(), partnerId: $('#bPart').value, von: $('#bVon').value.trim(), datum: $('#bDat').value, liefertermin: $('#bLief').value, notiz: $('#bNot').value.trim() });
      if (!b.was) return toast('Bitte eintragen, was bestellt wurde.');
      w.bestellungen = (w.bestellungen || []).filter((x) => x.id !== b.id).concat(b);
      await Projekt.save(w); toast('Gespeichert'); fertig();
    };
    if ($('#bDel')) $('#bDel').onclick = async () => { if (!confirm('Bestellung löschen?')) return; w.bestellungen = w.bestellungen.filter((x) => x.id !== b.id); await Projekt.save(w); fertig(); };
    window.scrollTo(0, 0);
  }

  // ---------- Unterschriftenfeld ----------
  function unterschrift(canvas, start) {
    const ctx = canvas.getContext('2d');
    const fit = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width * 2; canvas.height = r.height * 2; ctx.scale(2, 2); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b2533'; };
    fit();
    let leer = true, zeichnet = false;
    if (start) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, canvas.width / 2, canvas.height / 2); img.src = start; leer = false; }
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.onpointerdown = (e) => { zeichnet = true; leer = false; canvas.setPointerCapture(e.pointerId); const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); e.preventDefault(); };
    canvas.onpointermove = (e) => { if (!zeichnet) return; const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); e.preventDefault(); };
    canvas.onpointerup = canvas.onpointercancel = () => { zeichnet = false; };
    return { leeren: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); leer = true; }, bild: () => (leer ? '' : canvas.toDataURL('image/png')) };
  }

  // ---------- Abnahme ----------
  function abnahme(w, list, fertig) {
    const k = Kunden.byId(w.kundeId);
    const a = structuredClone(w.abnahme || { datum: heute(), anwesend: [Kunden.name(k) || w.customer, ...(window.Kalender?.team() || []).map((p) => p.name)].filter(Boolean).join(', '), raeume: list.map((r) => r.room || 'Raum'), maengel: [], vorbehalt: '', unterschriftKunde: '', unterschriftWir: '' });
    header('Abnahmeprotokoll', w.titel || Kunden.name(k) || '', { label: 'Zurück', fn: fertig });
    const render = () => {
      main().innerHTML = `<div class="card kform">
          <div class="row"><div><label style="margin-top:0">Datum der Abnahme</label><input type="date" id="aDat" value="${esc(a.datum)}"></div></div>
          <label>Anwesend</label><input type="text" id="aAnw" value="${esc(a.anwesend)}">
          <label>Abgenommene Leistungen</label>
          ${list.map((r) => `<label class="chk"><input type="checkbox" data-ar="${esc(r.room || 'Raum')}" ${a.raeume.includes(r.room || 'Raum') ? 'checked' : ''}> ${esc(r.room || 'Raum')}</label>`).join('')}
        </div>
        <div class="sec-h"><h2>Mängel</h2>${a.maengel.length ? `<span class="count">${a.maengel.filter((m) => !m.erledigt).length} offen</span>` : ''}</div>
        <div class="card kform">${a.maengel.map((m, i) => `<div class="mangel"><label class="chk"><input type="checkbox" data-merl="${i}" ${m.erledigt ? 'checked' : ''}> erledigt</label>
            <textarea data-mtext="${i}" placeholder="z. B. Silikonfuge an der Wanne nacharbeiten">${esc(m.text)}</textarea>
            <div class="row"><div><label>Frist</label><input type="date" data-mfrist="${i}" value="${esc(m.frist)}"></div><button class="icon-btn" data-mdel="${i}" aria-label="Löschen" style="align-self:flex-end">${icon('trash')}</button></div></div>`).join('') || '<p class="hint" style="margin:0">Keine Mängel. Gut so.</p>'}
          <button type="button" class="link-add" id="mNeu">${icon('plus')} Mangel hinzufügen</button></div>
        <div class="card kform">
          <label style="margin-top:0">Vorbehalte oder Hinweise (optional)</label><textarea id="aVor">${esc(a.vorbehalt)}</textarea>
          <label>Unterschrift Kunde</label><canvas class="sig" id="sigK"></canvas><button type="button" class="link-add" id="sigKx">Neu unterschreiben</button>
          <label>Unterschrift ${esc(state.settings.company || 'Auftragnehmer')}</label><canvas class="sig" id="sigW"></canvas><button type="button" class="link-add" id="sigWx">Neu unterschreiben</button>
        </div>
        <button class="btn big block" id="aOk">${icon('check')} Speichern und PDF senden</button>
        <button class="btn secondary block" id="aNur" style="margin-top:8px">Nur speichern</button>`;
      const sK = unterschrift($('#sigK'), a.unterschriftKunde), sW = unterschrift($('#sigW'), a.unterschriftWir);
      $('#sigKx').onclick = () => { sK.leeren(); a.unterschriftKunde = ''; };
      $('#sigWx').onclick = () => { sW.leeren(); a.unterschriftWir = ''; };
      const lesen = () => {
        a.datum = $('#aDat').value || heute(); a.anwesend = $('#aAnw').value.trim(); a.vorbehalt = $('#aVor').value.trim();
        a.raeume = $$('[data-ar]').filter((x) => x.checked).map((x) => x.dataset.ar);
        $$('[data-mtext]').forEach((x) => (a.maengel[+x.dataset.mtext].text = x.value.trim()));
        $$('[data-mfrist]').forEach((x) => (a.maengel[+x.dataset.mfrist].frist = x.value));
        $$('[data-merl]').forEach((x) => (a.maengel[+x.dataset.merl].erledigt = x.checked));
        a.unterschriftKunde = sK.bild() || a.unterschriftKunde; a.unterschriftWir = sW.bild() || a.unterschriftWir;
      };
      $('#mNeu').onclick = () => { lesen(); a.maengel.push({ id: uid(), text: '', frist: '', erledigt: false }); render(); };
      $$('[data-mdel]').forEach((x) => (x.onclick = () => { lesen(); a.maengel.splice(+x.dataset.mdel, 1); render(); }));
      const speichern = async () => {
        lesen(); a.maengel = a.maengel.filter((m) => m.text);
        a.t = Date.now(); w.abnahme = a;
        // Abnahme mit Unterschrift und ohne offene Mängel: Baustelle abschließen
        if (a.unterschriftKunde && !a.maengel.some((m) => !m.erledigt) && Projekt.norm(w.status) === '') { w.status = 'fertig'; (w.verlauf ??= []).push({ st: 'fertig', t: Date.now() }); toast('Abgenommen. Baustelle ist abgeschlossen.', 4000); }
        await Projekt.save(w);
      };
      $('#aNur').onclick = async () => { await speichern(); fertig(); };
      $('#aOk').onclick = async () => {
        await speichern();
        if (!a.unterschriftKunde) return toast('Bitte zuerst den Kunden unterschreiben lassen.', 4000);
        try { await teilen(w, a); } catch (e) { toast('PDF ging nicht: ' + e.message, 5000); }
        fertig();
      };
    };
    render(); window.scrollTo(0, 0);
  }

  async function teilen(w, a) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 20, R = W - 18, NAVY = [30, 53, 80], BRASS = [184, 134, 47];
    const t = (s, x, y, o) => doc.text(Array.isArray(s) ? s : String(s ?? ''), x, y, o);
    const logo = state.settings.logo;
    if (logo) await addFit(doc, logo, R - 55, 10, 55, 22, mimeOf(logo) === 'image/png' ? 'PNG' : 'JPEG');
    const k = Kunden.byId(w.kundeId), o = k && w.objektId ? Kunden.objekt(k, w.objektId) : null;
    let y = 46;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY); t('Abnahmeprotokoll', M, y); y += 9;
    doc.setFontSize(10);
    const z = (l, v) => { if (!v) return; doc.setFont('helvetica', 'normal'); doc.setTextColor(110); t(l, M, y); doc.setTextColor(30); const lines = doc.splitTextToSize(String(v), R - M - 45); t(lines, M + 45, y); y += 5.5 * lines.length; };
    z('Auftraggeber', Kunden.name(k) || w.customer);
    z('Bauvorhaben', o ? Kunden.einzeilig(o.adresse) : w.address);
    z('Projekt', [w.titel, w.nr && `Nr. ${w.nr}`].filter(Boolean).join(' · '));
    z('Auftragnehmer', E.firma);
    z('Datum der Abnahme', tag(a.datum));
    z('Anwesend', a.anwesend);
    y += 4;
    const ueber = (s) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY); t(s, M, y); y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30); };
    ueber('Abgenommene Leistungen');
    for (const r of a.raeume) { t('• ' + r, M + 2, y); y += 5.2; }
    y += 3;
    ueber('Mängel');
    if (!a.maengel.length) { t('Keine Mängel festgestellt.', M + 2, y); y += 6; }
    a.maengel.forEach((m, i) => { const l = doc.splitTextToSize(`${i + 1}. ${m.text}${m.frist ? ` (Beseitigung bis ${tag(m.frist)})` : ''}${m.erledigt ? ' – erledigt' : ''}`, R - M - 4); t(l, M + 2, y); y += 5.2 * l.length; });
    y += 3;
    if (a.vorbehalt) { ueber('Vorbehalte und Hinweise'); const l = doc.splitTextToSize(a.vorbehalt, R - M); t(l, M, y); y += 5.2 * l.length + 3; }
    doc.setFontSize(9.5); doc.setTextColor(60);
    const txt = doc.splitTextToSize(`Die oben genannten Leistungen wurden am ${tag(a.datum)} gemeinsam begangen und ${a.maengel.some((m) => !m.erledigt) ? 'mit den aufgeführten Mängeln' : 'ohne Mängel'} abgenommen. Mit der Abnahme beginnt die Gewährleistungsfrist. Aufgeführte Mängel beseitigt der Auftragnehmer innerhalb der genannten Fristen.`, R - M);
    t(txt, M, y); y += 5 * txt.length + 10;
    if (y > H - 70) { doc.addPage(); y = 30; }
    const sig = async (img, x, label) => { if (img) await addFit(doc, img, x, y, 70, 26, 'PNG'); doc.setDrawColor(120); doc.line(x, y + 28, x + 70, y + 28); doc.setFontSize(8); doc.setTextColor(110); t(label, x, y + 32); };
    await sig(a.unterschriftKunde, M, `Auftraggeber (${Kunden.name(k) || w.customer || ''})`);
    await sig(a.unterschriftWir, M + 90, `Auftragnehmer (${E.firma})`);
    doc.setDrawColor(...BRASS); doc.setLineWidth(0.4); doc.line(M, H - 20, R, H - 20);
    doc.setFontSize(6.8); doc.setTextColor(120); t([E.firma, E.strasse, E.ort, `Tel. ${E.telefon}`, E.email].filter(Boolean).join(' · '), M, H - 16);
    const name = `Abnahmeprotokoll_${(Kunden.name(k) || w.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
    const blob = doc.output('blob'), file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = name; el.click();
    setTimeout(() => URL.revokeObjectURL(el.href), 60000);
  }

  return { abschnitt };
})();
