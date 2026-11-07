'use strict';
/* DOM – Unterlagen (Menü › Unterlagen, state.tab = 'unterlagen'): alles an einem Ort.
 * Firmenordner: Gewerbeanmeldung, Handelsregister, Versicherung, Freistellungsbescheinigung … als PDF oder Foto,
 *   mit „gültig bis“. Tippen = teilen (WhatsApp, Mail, …). Läuft etwas bald ab, steht es auf „Heute“.
 *   Speicher: 'firmadok:<id>' { id, name, art, gueltig, typ, groesse, t }, Datei in 'fdatei:<id>' (Data-URL).
 * Projekte: Rechnungen an Kunden, unterschriebene Angebote, Abnahmeprotokolle, Eingangsrechnungen, neueste zuerst.
 * Vorgaben: 'firmaDokArten' (Auswahlliste), 'firmaDokWarnTage' (so viele Tage vor Ablauf warnen). */
window.Unterlagen = (() => {
  const MAX_MB = 15;
  const alle = new Map();
  let reiter = 'firma';
  const heuteIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tag = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('de-DE') : '');
  const groesse = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const eur = (x) => (x || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';

  async function laden() {
    const d = await db();
    const list = await new Promise((res) => { const out = []; const q = d.transaction('kv').objectStore('kv').openCursor(IDBKeyRange.bound('firmadok:', 'firmadok:￿')); q.onsuccess = () => { const c = q.result; if (!c) return res(out); out.push(c.value); c.continue(); }; q.onerror = () => res(out); });
    alle.clear(); for (const x of list) if (x?.id) alle.set(x.id, x);
  }
  const liste = () => [...alle.values()].sort((a, b) => (a.art || '').localeCompare(b.art || '', 'de') || (b.t || 0) - (a.t || 0));
  /** Firmendokumente, die bald ablaufen oder abgelaufen sind (für „Heute“). */
  const ablaufend = () => { const bis = plus(+vorgabe('firmaDokWarnTage') || 30); return liste().filter((x) => x.gueltig && x.gueltig <= bis); };

  async function view() {
    header('Unterlagen', reiter === 'firma' ? 'Firmenordner' : 'aus den Projekten');
    await laden();
    main().innerHTML = `<div class="seg2 full"><button data-ur="firma" class="${reiter === 'firma' ? 'on' : ''}">Firma</button><button data-ur="projekte" class="${reiter === 'projekte' ? 'on' : ''}">Projekte</button></div><div id="uInhalt"></div>`;
    $$('[data-ur]').forEach((b) => (b.onclick = () => { reiter = b.dataset.ur; view(); }));
    reiter === 'firma' ? firma() : projekte();
  }

  // ---------- Firmenordner ----------
  function firma() {
    const h = heuteIso(), warn = plus(+vorgabe('firmaDokWarnTage') || 30);
    const gruppen = {};
    for (const x of liste()) (gruppen[x.art || 'Sonstiges'] ??= []).push(x);
    $('#uInhalt').innerHTML = `
      <button class="cta slim" id="uNeu" style="margin-top:12px"><span class="cta-ico">${icon('plus')}</span><span class="cta-t"><b>Dokument ablegen</b></span>${icon('chevron', 'cta-chev')}</button>
      ${Object.entries(gruppen).map(([art, xs]) => `<div class="sec-h"><h2>${esc(art)}</h2></div><div class="docs">${xs.map((x) => {
        const st = !x.gueltig ? '' : x.gueltig < h ? `<span class="u-warn" style="color:#c0392b">abgelaufen, bitte erneuern</span>` : x.gueltig <= warn ? `<span class="u-warn" style="color:#d2691e">läuft bald ab, bitte erneuern</span>` : '';
        return `<div class="drow"><button type="button" class="drow-b" data-uteil="${x.id}"><span class="d-ico ${x.typ === 'application/pdf' ? 'navy' : 'brass'}">${icon(x.typ === 'application/pdf' ? 'file' : 'image')}</span>
          <span class="d-t"><b>${esc(x.name)}</b>${st}<span>${esc([x.gueltig && `gültig bis ${tag(x.gueltig)}`, groesse(x.groesse || 0)].filter(Boolean).join(' · '))}</span></span></button>
          <button type="button" class="icon-btn" data-uedit="${x.id}" aria-label="Bearbeiten">${icon('edit')}</button></div>`;
      }).join('')}</div>`).join('') || `<div class="empty-state">${icon('file')}<b>Noch keine Firmendokumente</b><span>Lege Gewerbeanmeldung, Versicherungsnachweis, Freistellungsbescheinigung und Co. einmal ab. Danach schickst du sie mit einem Tipp an Kunden und Hausverwaltungen.</span></div>`}
      <p class="hint">Tippen zum Teilen (WhatsApp, Mail, Dateien). Die Liste der Arten und die Vorwarnzeit stellst du unter Einstellungen › Abläufe & Listen ein.</p>`;
    $('#uNeu').onclick = neu;
    $$('[data-uteil]').forEach((b) => (b.onclick = () => teilen(alle.get(b.dataset.uteil))));
    $$('[data-uedit]').forEach((b) => (b.onclick = () => bearbeiten(alle.get(b.dataset.uedit))));
  }

  async function datei(x) {
    const data = await kvGet('fdatei:' + x.id);
    if (!data) { toast('Die Datei ist auf diesem Gerät noch nicht da. Bitte kurz warten (Cloud-Abgleich).', 4000); return null; }
    const blob = await (await fetch(data)).blob();
    return new File([blob], `${x.name}.${x.typ === 'application/pdf' ? 'pdf' : 'jpg'}`, { type: x.typ });
  }
  async function teilen(x) {
    const f = await datei(x); if (!f) return;
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: x.name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    ansehen(f);
  }
  function ansehen(f) {
    const url = URL.createObjectURL(f);
    const w = window.open(url, '_blank');
    if (!w) { const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  async function neu() {
    const [f] = await pickFiles({ accept: 'application/pdf,image/*' });
    if (!f) return;
    if (f.size > MAX_MB * 1e6) return toast(`Die Datei ist zu groß (höchstens ${MAX_MB} MB).`, 4000);
    let data = await fileToDataUrl(f), typ = f.type || 'application/pdf', size = f.size;
    if (typ.startsWith('image/')) { data = await resize(data, 2200, 'image/jpeg', 0.85); typ = 'image/jpeg'; size = Math.round(data.length * 0.75); }
    const art = await sheet('Was ist das?', vorgabe('firmaDokArten').map((a) => ({ label: a, value: a })));
    if (!art) return;
    const x = { id: uid(), kind: 'firmadok', name: art, art, gueltig: '', typ, groesse: size, t: Date.now() };
    await kvSet('fdatei:' + x.id, data);
    await kvSet('firmadok:' + x.id, x); alle.set(x.id, x);
    toast('Abgelegt');
    bearbeiten(x);
  }

  /** Name, Art, gültig bis, ansehen, löschen. */
  function bearbeiten(x) {
    header(x.name, 'Firmendokument', { label: 'Unterlagen', fn: view });
    main().innerHTML = `<div class="card kform">
        <label style="margin-top:0">Name</label><input type="text" id="ufName" value="${esc(x.name)}" autocomplete="off">
        <label>Art</label><select id="ufArt">${[...new Set([...vorgabe('firmaDokArten'), x.art])].map((a) => `<option ${a === x.art ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <label>Gültig bis (leer = unbegrenzt)</label><input type="date" id="ufBis" value="${esc(x.gueltig || '')}">
      </div>
      <div class="row" style="gap:8px"><button class="btn secondary" id="ufZeigen" style="flex:1">Ansehen</button><button class="btn" id="ufTeilen" style="flex:1">Teilen</button></div>
      <button class="btn danger block" id="ufDel" style="margin-top:18px">Löschen</button>`;
    const sichern = async () => { x.name = $('#ufName').value.trim() || x.art; x.art = $('#ufArt').value; x.gueltig = $('#ufBis').value; x.updated = Date.now(); await kvSet('firmadok:' + x.id, x); alle.set(x.id, x); };
    $('#ufName').onchange = sichern; $('#ufArt').onchange = sichern; $('#ufBis').onchange = async () => { await sichern(); toast('Gespeichert'); };
    $('#ufZeigen').onclick = async () => { const f = await datei(x); if (f) ansehen(f); };
    $('#ufTeilen').onclick = () => teilen(x);
    $('#ufDel').onclick = async () => {
      if (!confirm(`„${x.name}“ löschen?`)) return;
      await kvDel('fdatei:' + x.id); await kvDel('firmadok:' + x.id); alle.delete(x.id); view();
    };
  }

  // ---------- Unterlagen aus den Projekten ----------
  async function projekte() {
    const idx = await projectIndex();
    await Promise.all([window.Rechnung?.laden(), window.Finanzen?.laden()]);
    const ws = (await Promise.all(idx.map((x) => kvGet('wohnung:' + x.id)))).filter(Boolean);
    const pName = (id) => { const x = idx.find((y) => y.id === id); return x ? [x.titel || x.room || 'Projekt', Kunden.name(Kunden.byId(x.kundeId)) || x.customer].filter(Boolean).join(' · ') : ''; };
    const eintr = [];
    for (const r of window.Rechnung?.liste() || []) eintr.push({ t: r.datum || '', ziel: 'r:' + r.id, ic: 'euro', titel: `Rechnung ${r.nr}`, sub: `${pName(r.projektId)} · ${eur(Rechnung.zahlbetrag(r))}${r.bezahlt ? ' · bezahlt' : ''}` });
    for (const w of ws) {
      if (w.auftrag) eintr.push({ t: new Date(w.auftrag.t || 0).toISOString().slice(0, 10), ziel: 'a:' + w.id, ic: 'check', titel: 'Angebot unterschrieben', sub: pName(w.id) });
      if (w.abnahme?.unterschriftKunde || w.abnahme?.t) eintr.push({ t: w.abnahme.datum || '', ziel: 'p:' + w.id, ic: 'clipboard', titel: 'Abnahmeprotokoll', sub: pName(w.id) });
      if (w.versendetAm) eintr.push({ t: w.versendetAm, ziel: 'p:' + w.id, ic: 'file', titel: 'Angebot', sub: `${pName(w.id)} · versendet ${tag(w.versendetAm)}` });
    }
    for (const b of window.Finanzen?.liste() || []) if (b.datei) eintr.push({ t: b.datum || '', ziel: 'b:' + b.id, ic: 'file', titel: `Eingangsrechnung ${window.Partner?.byId(b.partnerId)?.firma || b.von || ''}`.trim(), sub: [pName(b.projektId), eur(b.netto) + ' netto'].filter(Boolean).join(' · ') });
    eintr.sort((a, b) => b.t.localeCompare(a.t));
    $('#uInhalt').innerHTML = eintr.length ? `<div class="plist" style="margin-top:12px">${eintr.map((e) => `<button class="pcard" data-uz="${esc(e.ziel)}"><span class="pc-ph">${icon(e.ic)}</span><span class="pc-t"><b>${esc(e.titel)}</b><span class="muted">${esc([e.t && tag(e.t), e.sub].filter(Boolean).join(' · '))}</span></span>${icon('chevron', 'pc-chev')}</button>`).join('')}</div>`
      : `<div class="empty-state">${icon('file')}<b>Noch keine Unterlagen</b><span>Rechnungen, unterschriebene Angebote und Abnahmeprotokolle erscheinen hier automatisch.</span></div>`;
    $$('[data-uz]').forEach((b) => (b.onclick = () => oeffnen(b.dataset.uz)));
  }
  async function oeffnen(z) {
    const i = z.indexOf(':'), art = z.slice(0, i), id = z.slice(i + 1);
    const zurueck = () => switchTab('unterlagen');
    if (art === 'r') return Rechnung.detail(Rechnung.liste().find((r) => r.id === id), zurueck);
    if (art === 'b') return Finanzen.erfassen(Finanzen.liste().find((b) => b.id === id), zurueck);
    if (art === 'p') { switchTab('projekt', { wohnung: null }); return Projekt.oeffnen(id); }
    if (art === 'a') {
      const w = await kvGet('wohnung:' + id), data = await kvGet('auftrag:' + id);
      if (!data) return toast('Die Datei ist auf diesem Gerät noch nicht da. Bitte kurz warten (Cloud-Abgleich).', 4000);
      const blob = await (await fetch(data)).blob();
      const f = new File([blob], (w?.auftrag?.name || 'Angebot unterschrieben').replace(/\.(pdf|jpe?g|png)$/i, '') + (w?.auftrag?.typ === 'application/pdf' ? '.pdf' : '.jpg'), { type: w?.auftrag?.typ || 'application/pdf' });
      if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      ansehen(f);
    }
  }

  return { view, laden, liste, ablaufend };
})();
