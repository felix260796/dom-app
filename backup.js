'use strict';
/* Datensicherung: komplette Sicherung aller App-Daten (Projekte mit Fotos und
 * Visualisierungen, Moodboards, Angebots-Vorlagen, Preisliste, Einstellungen)
 * in EINE Datei – z. B. in iCloud Drive („In Dateien sichern“) – und Wiederherstellung.
 * Hintergrund: Auf dem iPhone hat jede Homebildschirm-App ihren eigenen Speicher.
 * Wird das Symbol gelöscht und neu angelegt, ist dieser Speicher leer.
 * Baut auf app.js auf (db, kvGet, kvSet, $, esc, toast, state). */
window.Backup = (() => {
  const LS_CHANGE = 'dom:lastChange', LS_BACKUP = 'dom:lastBackup';
  const ls = {
    get: (k) => { try { return +localStorage.getItem(k) || 0; } catch { return 0; } },
    set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} },
  };

  async function allEntries() {
    const d = await db();
    return new Promise((res, rej) => {
      const out = [];
      const q = d.transaction('kv').objectStore('kv').openCursor();
      q.onsuccess = () => { const c = q.result; if (!c) return res(out); out.push([c.key, c.value]); c.continue(); };
      q.onerror = () => rej(q.error);
    });
  }

  const stamp = () => new Date().toISOString().slice(0, 10);
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  function ago(t) {
    if (!t) return 'noch nie';
    const d = Math.floor((Date.now() - t) / 86400000);
    const when = new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    return d === 0 ? `heute (${when})` : d === 1 ? `gestern (${when})` : `vor ${d} Tagen (${when})`;
  }

  /** Erstellt die Sicherungsdatei und bietet sie zum Speichern an (iPhone: Teilen → „In Dateien sichern“). */
  async function create({ withKey = true } = {}) {
    toast('Sicherung wird erstellt …', 8000);
    const entries = await allEntries();
    if (!withKey) for (const e of entries) if (e[0] === 'settings' && e[1]) e[1] = { ...e[1], apiKey: '' };
    const projects = entries.filter(([k]) => String(k).startsWith('project:')).length;
    const data = { app: 'DOM', type: 'komplettsicherung', version: 1, created: new Date().toISOString(), projects, entries };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `DOM_Sicherung_${stamp()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    let saved = false;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); saved = true; }
      catch (e) { if (e.name === 'AbortError') { toast('Sicherung abgebrochen'); return false; } }
    }
    if (!saved) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    ls.set(LS_BACKUP, Date.now());
    toast(`Sicherung erstellt: ${projects} Projekt(e), ${fmtSize(blob.size)}`, 4000);
    return true;
  }

  /** Liest eine Sicherungsdatei ein. Vorhandene Projekte bleiben erhalten, gleiche Projekte werden überschrieben. */
  async function restore() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    const f = await new Promise((res) => { inp.onchange = () => res(inp.files[0]); inp.click(); });
    if (!f) return false;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast('Datei ist keine gültige Sicherung.', 4000); return false; }
    if (data?.boards && !data.entries) { toast('Das ist eine reine Moodboard-Datei. Bitte unter „Moodboards → Importieren“ einlesen.', 6000); return false; }
    if (data?.type !== 'komplettsicherung' || !Array.isArray(data.entries)) { toast('Datei ist keine DOM-Sicherung.', 4000); return false; }
    const when = new Date(data.created).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    if (!confirm(`Sicherung vom ${when} mit ${data.projects ?? '?'} Projekt(en) wiederherstellen?\n\nProjekte, die schon auf diesem Gerät sind, bleiben erhalten. Moodboards, Vorlagen und Einstellungen werden durch die aus der Sicherung ersetzt.`)) return false;
    const cur = (await kvGet('projectIndex')) || [];
    const curSettings = (await kvGet('settings')) || {};
    for (const [k, v] of data.entries) {
      if (k === 'projectIndex') {
        const ids = new Set(v.map((x) => x.id));
        const merged = [...v, ...cur.filter((x) => !ids.has(x.id))].sort((a, b) => (b.created || 0) - (a.created || 0));
        await kvSet(k, merged);
      } else if (k === 'settings') {
        // Schlüssel nicht mit leerem Wert überschreiben, falls ohne Schlüssel gesichert wurde
        await kvSet(k, { ...v, apiKey: v.apiKey || curSettings.apiKey || '' });
      } else await kvSet(k, v);
    }
    ls.set(LS_BACKUP, Date.now());
    toast('Sicherung wiederhergestellt. App wird neu geladen …', 3000);
    setTimeout(() => location.reload(), 1200);
    return true;
  }

  // ---------- Excel-Sicherung (Wunsch Felix) ----------
  // Alle wichtigen Daten als eine Excel-Datei mit einem Blatt je Bereich: Kunden, Objekte, Partner, Aufträge,
  // Angebotspositionen, Rechnungen, Eingangsrechnungen, Termine. Lesbar ohne die App, z. B. im OneDrive-Ordner am PC.
  const LS_EXCEL = 'dom:lastExcel';
  async function xlsxLaden() {
    if (window.XLSX) return window.XLSX;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = res; s.onerror = () => rej(new Error('Excel-Baustein nicht geladen')); document.head.appendChild(s); });
    return window.XLSX;
  }
  const dt = (s) => (s ? new Date(String(s).length === 10 ? s + 'T12:00' : s).toLocaleDateString('de-DE') : '');
  async function excel() {
    toast('Excel-Sicherung wird erstellt …', 10000);
    const X = await xlsxLaden();
    const entries = await allEntries();
    const alleK = (p) => entries.filter(([k]) => String(k).startsWith(p)).map(([, v]) => v).filter(Boolean);
    const kunden = alleK('kunde:'), partner = alleK('partner:'), projekte = alleK('wohnung:'), raeume = new Map(alleK('project:').map((r) => [r.id, r]));
    const kname = (id) => { const k = kunden.find((x) => x.id === id); return k ? [k.anrede, k.vorname, k.name].filter(Boolean).join(' ') : ''; };
    const A = window.Angebot?._intern; try { await A?.preisliste(); } catch {}
    const blaetter = {
      Kunden: kunden.map((k) => ({ 'Kunden-Nr.': k.nr, Anrede: k.anrede, Vorname: k.vorname, 'Name / Firma': k.name, Telefon: k.telefon, 'E-Mail': k.email, Anschrift: k.privat, Geburtstag: dt(k.geburtstag), Quelle: k.quelle, Notiz: k.notiz,
        'Weitere Kontakte': (k.weitere || []).map((x) => `${x.label || ''} ${x.wert}`.trim()).join('; '), Hausverwaltung: k.hv?.firma || '', 'Angelegt am': dt(k.created && new Date(k.created).toISOString()) })),
      Objekte: kunden.flatMap((k) => (k.objekte || []).map((o) => ({ 'Kunden-Nr.': k.nr, Kunde: kname(k.id), Bezeichnung: o.name, Anschrift: o.adresse, Schlüssel: o.schluessel, Notiz: o.notiz,
        'Ansprechpartner vor Ort': (o.kontakte || []).map((x) => [x.name, x.telefon, x.email].filter(Boolean).join(' ')).join('; ') }))),
      Partner: partner.map((p) => ({ Art: { sub: 'Subunternehmer', lief: 'Lieferant', aussen: 'Außendienst', sonst: 'Sonstige' }[p.art] || p.art, Firma: p.firma, Gewerk: p.gewerk, Ansprechpartner: p.inhaber, Telefon: p.telefon, 'E-Mail': p.email,
        Anschrift: p.anschrift, Webseite: p.web, 'Unsere Kunden-Nr.': p.kdnr, Qualität: (p.stufen || []).join(', '), Konditionen: p.konditionen, Notiz: p.notiz })),
      'Preise Partner': [],
      Aufträge: projekte.map((w) => ({ 'Projekt-Nr.': w.nr, Kunde: kname(w.kundeId) || w.customer, Titel: w.titel, Anschrift: w.address, Status: window.Projekt?.statusName(w.status) || w.status, 'Versendet am': dt(w.versendetAm), Baustart: dt(w.baustart),
        'Absagegrund': w.absage?.grund || '', Räume: (w.rooms || []).map((id) => raeume.get(id)?.room).filter(Boolean).join(', '), 'Angelegt am': dt(w.created && new Date(w.created).toISOString()) })),
      Angebotspositionen: projekte.flatMap((w) => (w.rooms || []).map((id) => raeume.get(id)).filter((r) => r?.angebot?.positionen?.length).flatMap((r) => {
        let z = []; try { z = A.summen(r.angebot.positionen, r.angebot.kalk).zeilen; } catch {}
        return z.map((x) => ({ 'Projekt-Nr.': w.nr, Kunde: kname(w.kundeId) || w.customer, Raum: r.room, 'Angebot-Nr.': r.angebot.nr, Position: x.nr, Leistung: x.it.text, Menge: x.menge, Einheit: x.it.einheit, 'EP netto': x.ep, 'GP netto': x.gp }));
      })),
      Rechnungen: alleK('rechnung:').map((r) => ({ 'Rechnung-Nr.': r.nr, Art: r.art, Titel: r.titel, Kunde: kname(projekte.find((w) => w.id === r.projektId)?.kundeId), 'Projekt-Nr.': projekte.find((w) => w.id === r.projektId)?.nr || '',
        Datum: dt(r.datum), 'Fällig': dt(r.faellig), 'Netto': r.netto, 'Bezahlt am': dt(r.bezahlt), Mahnungen: (r.mahnungen || []).length })),
      Eingangsrechnungen: alleK('beleg:').map((b) => ({ Von: partner.find((p) => p.id === b.partnerId)?.firma || b.von, 'Rechnung-Nr.': b.nr, Datum: dt(b.datum), Netto: b.netto, 'USt %': b.satz, Gewerk: b.gewerk,
        'Projekt-Nr.': projekte.find((w) => w.id === b.projektId)?.nr || '', 'Fällig': dt(b.faellig), 'Bezahlt am': dt(b.bezahlt), Notiz: b.notiz })),
      Termine: alleK('termin:').sort((a, b) => String(a.datum).localeCompare(b.datum)).map((t) => ({ Datum: dt(t.datum), Von: t.ganztag ? 'ganztags' : t.von, Bis: t.bis, Titel: t.titel, Art: t.art, Kunde: kname(t.kundeId), Ort: t.ort, Notiz: t.notiz })),
    };
    let PL = null; try { PL = await A?.preisliste(); } catch {}
    const posText = (nr) => PL?.positionen?.find((x) => x.nr === nr)?.text || '';
    blaetter['Preise Partner'] = partner.flatMap((p) => [
      ...Object.entries(p.preise || {}).map(([nr, preis]) => ({ Firma: p.firma, Gewerk: p.gewerk, Position: nr, Leistung: posText(nr), 'Preis netto': preis })),
      ...(p.eigenePreise || []).map((x) => ({ Firma: p.firma, Gewerk: p.gewerk, Position: 'eigen', Leistung: x.text, Einheit: x.einheit, 'Preis netto': x.preis }))]);
    const wb = X.utils.book_new();
    for (const [name, zeilen] of Object.entries(blaetter)) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(zeilen.length ? zeilen : [{ Hinweis: 'noch keine Einträge' }]), name.slice(0, 31));
    const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const name = `DOM_Daten_${stamp()}.xlsx`;
    const file = new File([out], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    $('#toast').hidden = true;
    let ok = false;
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); ok = true; } catch (e) { if (e.name === 'AbortError') return false; } }
    if (!ok) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
    ls.set(LS_EXCEL, Date.now());
    toast(`Excel-Sicherung erstellt: ${kunden.length} Kunden, ${partner.length} Partner, ${projekte.length} Aufträge`, 4500);
    return true;
  }
  const excelFaellig = () => { const t = vorgabe('excelSicherungTage'); return +t > 0 && Date.now() - ls.get(LS_EXCEL) > +t * 864e5; };

  const lastBackup = () => ls.get(LS_BACKUP);
  const needsBackup = () => ls.get(LS_CHANGE) > lastBackup();
  const markChange = () => ls.set(LS_CHANGE, Date.now());

  /** Karte für die Einstellungen. */
  const excelKarte = () => `<div class="card">
        <h2>Excel-Sicherung</h2>
        <p class="muted">Alle Kunden, Objekte, Partner, Preise, Aufträge, Angebotspositionen, Rechnungen, Eingangsrechnungen und Termine als <b>eine Excel-Datei</b>, ein Blatt je Bereich. Lesbar ohne die App.</p>
        <p class="muted">Tipp: Im Teilen-Menü „In Dateien sichern“ wählen und den <b>OneDrive</b>-Ordner nehmen. Dann liegt die Datei automatisch auf deinem PC.</p>
        <p class="muted">Letzte Excel-Sicherung: <b>${esc(ago(ls.get(LS_EXCEL)))}</b></p>
        <button class="btn block" id="bkExcel">${icon('download')} Excel-Sicherung erstellen</button>
      </div>`;
  function einstellungenKarte(el) {
    if (!el) return;
    const xl = () => { const b = $('#bkExcel', el); if (b) b.onclick = async () => { if (await excel()) einstellungenKarte(el); }; };
    if (window.Sync?.active()) {
      // Mit Cloud-Abgleich nur noch als Notfall-Export, zugeklappt
      el.innerHTML = excelKarte() + `
        <details class="card">
          <summary class="muted" style="cursor:pointer">Notfall-Export (Datei)</summary>
          <p class="muted" style="margin-top:10px">Deine Daten werden automatisch über den Cloud-Abgleich gesichert. Hier kannst du zusätzlich eine Datei erstellen, z. B. für OneDrive, oder eine Datei zurückholen.</p>
          <button class="btn secondary block" id="bkCreate">Datei erstellen</button>
          <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="bkKey" checked> API-Schlüssel mitsichern</label>
          <button class="btn secondary block" id="bkRestore" style="margin-top:10px">Datei wiederherstellen</button>
        </details>`;
      $('#bkCreate', el).onclick = () => create({ withKey: $('#bkKey', el).checked });
      $('#bkRestore', el).onclick = restore;
      xl();
      return;
    }
    el.innerHTML = excelKarte() + `
      <div class="card">
        <h2>Datensicherung</h2>
        <p class="muted">Alles liegt nur auf diesem Gerät. Sichere regelmäßig: „In Dateien sichern“ wählen und <b>iCloud Drive</b> als Ort nehmen.</p>
        <p class="muted">Letzte Sicherung: <b>${esc(ago(lastBackup()))}</b>${needsBackup() ? ' · <span style="color:var(--danger)">seitdem geändert</span>' : ''}</p>
        <button class="btn block" id="bkCreate">Jetzt alles sichern</button>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="bkKey" checked> API-Schlüssel mitsichern</label>
        <button class="btn secondary block" id="bkRestore" style="margin-top:10px">Sicherung wiederherstellen</button>
      </div>`;
    $('#bkCreate', el).onclick = async () => { if (await create({ withKey: $('#bkKey', el).checked })) einstellungenKarte(el); };
    $('#bkRestore', el).onclick = restore;
    xl();
  }

  /** Hinweis in der Projektliste, wenn seit der letzten Sicherung etwas geändert wurde. */
  async function hinweis(el) {
    if (!el) return;
    const idx = (await kvGet('projectIndex')) || [];
    if (!idx.length && window.Sync?.fest() && !window.Sync.active()) {
      el.innerHTML = `<button class="notice" id="bhCloud">${icon('refresh')}<span><b>Neues Gerät?</b> Einmal mit E-Mail und Passwort anmelden, dann sind alle Daten und Einstellungen wieder da.</span>${icon('chevron', 'pc-chev')}</button>`;
      $('#bhCloud', el).onclick = () => { switchTab('einstellungen'); einstellungSeite('cloud'); };
      return;
    }
    if (!idx.length) {
      el.innerHTML = `<button class="notice" id="bhRestore">${icon('upload')}<span><b>Neues Gerät?</b> ${window.Sync?.active() ? 'Der Cloud-Abgleich holt deine Projekte gleich. Oder hier' : 'Hier'} eine Sicherung zurückholen.</span>${icon('chevron', 'pc-chev')}</button>`;
      $('#bhRestore', el).onclick = restore;
      return;
    }
    if (!needsBackup() || window.Sync?.active()) { el.innerHTML = ''; return; }
    el.innerHTML = `<button class="notice" id="bhCreate">${icon('download')}<span><b>Jetzt sichern</b> · letzte Sicherung: ${esc(ago(lastBackup()))}</span>${icon('chevron', 'pc-chev')}</button>`;
    $('#bhCreate', el).onclick = async () => { if (await create()) hinweis(el); };
  }

  return { create, restore, excel, excelFaellig, einstellungenKarte, hinweis, markChange };
})();
