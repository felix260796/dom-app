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
    toast(`✅ Sicherung erstellt: ${projects} Projekt(e), ${fmtSize(blob.size)}`, 4000);
    return true;
  }

  /** Liest eine Sicherungsdatei ein. Vorhandene Projekte bleiben erhalten, gleiche Projekte werden überschrieben. */
  async function restore() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    const f = await new Promise((res) => { inp.onchange = () => res(inp.files[0]); inp.click(); });
    if (!f) return false;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast('❌ Datei ist keine gültige Sicherung.', 4000); return false; }
    if (data?.boards && !data.entries) { toast('Das ist eine reine Moodboard-Datei. Bitte unter „Moodboards → Importieren“ einlesen.', 6000); return false; }
    if (data?.type !== 'komplettsicherung' || !Array.isArray(data.entries)) { toast('❌ Datei ist keine DOM-Sicherung.', 4000); return false; }
    const when = new Date(data.created).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    if (!confirm(`Sicherung vom ${when} mit ${data.projects ?? '?'} Projekt(en) wiederherstellen?\n\nProjekte, die schon auf diesem Gerät sind, bleiben erhalten. Moodboards, Vorlagen und Einstellungen werden durch die aus der Sicherung ersetzt.`)) return false;
    const cur = (await kvGet('projectIndex')) || [];
    const curSettings = (await kvGet('settings')) || {};
    for (const [k, v] of data.entries) {
      if (k === 'projectIndex') {
        const ids = new Set(v.map((x) => x.id));
        const merged = [...v, ...cur.filter((x) => !ids.has(x.id))].sort((a, b) => (b.created || 0) - (a.created || 0));
        await kvSet(k, merged.slice(0, 100));
      } else if (k === 'settings') {
        // Schlüssel nicht mit leerem Wert überschreiben, falls ohne Schlüssel gesichert wurde
        await kvSet(k, { ...v, apiKey: v.apiKey || curSettings.apiKey || '' });
      } else await kvSet(k, v);
    }
    ls.set(LS_BACKUP, Date.now());
    toast('✅ Sicherung wiederhergestellt. App wird neu geladen …', 3000);
    setTimeout(() => location.reload(), 1200);
    return true;
  }

  const lastBackup = () => ls.get(LS_BACKUP);
  const needsBackup = () => ls.get(LS_CHANGE) > lastBackup();
  const markChange = () => ls.set(LS_CHANGE, Date.now());

  /** Karte für die Einstellungen. */
  function einstellungenKarte(el) {
    if (!el) return;
    el.innerHTML = `
      <div class="card">
        <h2>💾 Datensicherung</h2>
        <p class="muted">Alle Daten (Projekte mit Fotos und Visualisierungen, Moodboards, Angebots-Vorlagen, Einstellungen) liegen nur in dieser App auf diesem Gerät. Wird das App-Symbol gelöscht, sind sie weg. Sichere deshalb regelmäßig: Auf dem iPhone „In Dateien sichern“ wählen und als Ort <b>iCloud Drive</b> nehmen. Dann ist die Sicherung auch auf dem iPad und am PC verfügbar.</p>
        <p class="muted">Letzte Sicherung: <b>${esc(ago(lastBackup()))}</b>${needsBackup() ? ' · <span style="color:var(--danger)">seitdem geändert</span>' : ''}</p>
        <button class="btn block" id="bkCreate">⬇️ Jetzt alles sichern</button>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="bkKey" checked> API-Schlüssel mitsichern</label>
        <button class="btn secondary block" id="bkRestore" style="margin-top:10px">⬆️ Sicherung wiederherstellen</button>
        <p class="muted" style="margin-top:10px">Neues Gerät oder App neu installiert? Einfach „Sicherung wiederherstellen“ tippen und die Datei aus iCloud Drive wählen.</p>
      </div>`;
    $('#bkCreate', el).onclick = async () => { if (await create({ withKey: $('#bkKey', el).checked })) einstellungenKarte(el); };
    $('#bkRestore', el).onclick = restore;
  }

  /** Hinweis in der Projektliste, wenn seit der letzten Sicherung etwas geändert wurde. */
  async function hinweis(el) {
    if (!el) return;
    const idx = (await kvGet('projectIndex')) || [];
    if (!idx.length) {
      el.innerHTML = `<div class="card backup-hint"><b>Neues Gerät oder App neu installiert?</b><p class="muted">Projekte aus einer Sicherungsdatei zurückholen.</p><button class="btn secondary block" id="bhRestore">⬆️ Sicherung wiederherstellen</button></div>`;
      $('#bhRestore', el).onclick = restore;
      return;
    }
    if (!needsBackup()) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card backup-hint warn"><b>💾 Nicht gesicherte Änderungen</b><p class="muted">Letzte Sicherung: ${esc(ago(lastBackup()))}. Sichere jetzt, damit keine Projekte verloren gehen (z. B. in iCloud Drive).</p><button class="btn block" id="bhCreate">Jetzt sichern</button></div>`;
    $('#bhCreate', el).onclick = async () => { if (await create()) hinweis(el); };
  }

  return { create, restore, einstellungenKarte, hinweis, markChange };
})();
