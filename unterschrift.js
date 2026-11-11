'use strict';
/* DOM – Unterschrift unter Angeboten, Rechnungen und Auftragsbestätigungen.
 * Je Person im Team (Kalender.team) eine gezeichnete Unterschrift: state.settings.unterschriften = { <personId>: 'data:image/png…' }.
 * Wer unterschreibt: die Person, der das Gerät gehört (Menü unten: Felix, Deniel oder beide), bei „beide“ die erste im Team.
 * Unterschrift.pdf(doc, x, y) setzt Grußformel, Bild und Namen ins PDF und gibt die neue y-Position zurück.
 * Einstellungen: Firmendaten (vorgaben.js firmaKarte ruft Unterschrift.karte auf). */
window.Unterschrift = (() => {
  const team = () => window.Kalender?.team() || [];
  /** Person, die auf diesem Gerät unterschreibt. */
  function person() {
    const t = team(), id = window.Kalender?.wer() || '';
    return t.find((p) => p.id === id) || t[0] || null;
  }
  const bild = (p = person()) => (p && state.settings.unterschriften?.[p.id]) || '';

  /** Grußformel, Unterschrift und Name ins PDF. Gibt die y-Position unter dem Namen zurück. */
  async function pdf(doc, x, y, { gruss = vorgabeText('textGruss'), firma = '' } = {}) {
    const p = person(), b = bild(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30);
    doc.text(gruss, x, y); y += 3;
    if (b) { try { await addFit(doc, b, x, y, 50, 16, 'PNG'); } catch (e) { console.warn('Unterschrift nicht gedruckt', e); } y += 19; }
    else y += 4;
    if (p?.name) { doc.text(p.name, x, y); y += 4.6; }
    if (firma) { doc.setFontSize(9); doc.setTextColor(110); doc.text(firma, x, y); doc.setTextColor(30); doc.setFontSize(10); y += 4.6; }
    return y;
  }

  /** Zeichenfeld (wie beim Abnahmeprotokoll). */
  function feld(canvas, start) {
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect(); canvas.width = r.width * 2; canvas.height = r.height * 2; ctx.scale(2, 2);
    Object.assign(ctx, { lineWidth: 2.2, lineCap: 'round', lineJoin: 'round', strokeStyle: '#1b2533' });
    let leer = !start, zieht = false;
    if (start) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = start; }
    const pt = (e) => { const q = canvas.getBoundingClientRect(); return [e.clientX - q.left, e.clientY - q.top]; };
    canvas.onpointerdown = (e) => { zieht = true; leer = false; canvas.setPointerCapture(e.pointerId); const [a, b] = pt(e); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + 0.1, b + 0.1); ctx.stroke(); e.preventDefault(); };
    canvas.onpointermove = (e) => { if (!zieht) return; const [a, b] = pt(e); ctx.lineTo(a, b); ctx.stroke(); e.preventDefault(); };
    canvas.onpointerup = canvas.onpointercancel = () => { zieht = false; };
    return { leeren: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); leer = true; }, bild: () => (leer ? '' : canvas.toDataURL('image/png')) };
  }

  /** Karte in den Einstellungen (Firmendaten): je Person Unterschrift zeichnen. */
  function karte(box) {
    if (!box) return;
    const t = team();
    box.innerHTML = `<div class="sec-h"><h2>Unterschrift</h2></div>
      <div class="card kform vg">
        <p class="hint" style="margin-top:0">Steht unter Angebot, Rechnung und Auftragsbestätigung: „${esc(vorgabeText('textGruss'))}“, darunter die Unterschrift und der Name. Es unterschreibt, wem das Gerät gehört (unten im Menü), bei „beide“ ${esc(t[0]?.name || 'die erste Person')}.</p>
        ${t.map((p) => `<label>${esc(p.name || 'Ohne Namen')}</label>
          ${bild(p) ? `<img class="sig-zeig" src="${bild(p)}" alt="Unterschrift ${esc(p.name)}">` : '<p class="hint" style="margin:0">Noch keine Unterschrift</p>'}
          <button type="button" class="link-add" data-sig="${esc(p.id)}">${icon('edit')} ${bild(p) ? 'Neu unterschreiben' : 'Unterschrift zeichnen'}</button>`).join('')}
      </div>`;
    $$('[data-sig]', box).forEach((b) => (b.onclick = () => zeichnen(t.find((p) => p.id === b.dataset.sig), () => karte(box))));
  }
  function zeichnen(p, fertig) {
    if (!p) return;
    const el = document.createElement('div');
    el.className = 'sheet-bg fest on';
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="Unterschrift"><div class="sheet-h"><b>Unterschrift ${esc(p.name || '')}</b><button class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div>
      <div style="padding:0 16px 16px"><p class="hint" style="margin-top:0">Mit dem Finger ins Feld unterschreiben.</p>
        <canvas class="sig" id="sigF" style="width:100%;height:150px"></canvas>
        <div class="row" style="margin-top:10px"><button class="btn secondary" id="sigL">${icon('x')} Leeren</button>${bild(p) ? `<button class="btn secondary" id="sigWeg">${icon('trash')} Entfernen</button>` : ''}<button class="btn" id="sigOk">${icon('check')} Speichern</button></div></div></div>`;
    document.body.appendChild(el);
    const f = feld($('#sigF', el), '');
    const zu = () => { el.remove(); fertig?.(); };
    el.onclick = (e) => { if (e.target === el || e.target.closest('[data-x]')) zu(); };
    $('#sigL', el).onclick = () => f.leeren();
    if ($('#sigWeg', el)) $('#sigWeg', el).onclick = async () => { delete state.settings.unterschriften?.[p.id]; await saveSettings(); toast('Unterschrift entfernt'); zu(); };
    $('#sigOk', el).onclick = async () => {
      const b = f.bild();
      if (!b) return toast('Bitte zuerst unterschreiben.');
      state.settings.unterschriften = { ...(state.settings.unterschriften || {}), [p.id]: b };
      await saveSettings(); toast('Unterschrift gespeichert'); zu();
    };
  }

  return { person, bild, pdf, karte };
})();
