'use strict';
/* Cloud-Abgleich über Supabase (kostenloser Tarif): alle App-Daten werden automatisch
 * zwischen den Geräten abgeglichen (iPhone, iPad, PC). Jeder Speicher-Eintrag (Projekt,
 * Moodboards, Einstellungen, …) liegt als eigene Datei im privaten Storage-Bucket „dom“
 * unter <Benutzer-ID>/<Schlüssel>.json. Zugriff nur mit Anmeldung (E-Mail + Passwort).
 * Konflikte: der zuletzt geänderte Stand gewinnt; Projektliste wird zusammengeführt.
 * Baut auf app.js auf (db, kvGet, $, esc, toast, state, viewProjektListe). */
window.Sync = (() => {
  const BUCKET = 'dom';
  const LS_CFG = 'dom:syncCfg', LS_META = 'dom:syncMeta';
  const MERGE_KEYS = new Set(['projectIndex', 'projectDeleted']);
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let cfg = lsGet(LS_CFG, null); // { url, key, email, uid, access, refresh, expires, initialized }
  let meta = lsGet(LS_META, {}); // { [key]: { dirty, del, t, seen } }
  let status = { ok: null, msg: '', last: 0 };
  let running = null, again = false;
  const saveCfg = () => lsSet(LS_CFG, cfg);
  const saveMeta = () => lsSet(LS_META, meta);
  const active = () => !!cfg?.refresh;

  // ---------- Speicher direkt (ohne erneute Änderungs-Markierung) ----------
  async function rawPut(k, v) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }
  async function rawDel(k) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }
  async function localKeys() {
    const d = await db();
    return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result.map(String)); q.onerror = () => rej(q.error); });
  }

  // ---------- Supabase (REST, ohne Bibliothek) ----------
  const base = (u) => String(u || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1.*$/, '');
  async function authCall(grant, body) {
    const r = await fetch(`${cfg.url}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `Anmeldung fehlgeschlagen (${r.status})`);
    Object.assign(cfg, { uid: j.user?.id || cfg.uid, access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000 });
    saveCfg();
  }
  async function token() {
    if (!cfg.access || Date.now() > cfg.expires - 120000) await authCall('refresh_token', { refresh_token: cfg.refresh });
    return cfg.access;
  }
  async function api(path, opt = {}, retry = true) {
    const r = await fetch(`${cfg.url}/storage/v1/${path}`, { cache: 'no-store', ...opt, headers: { apikey: cfg.key, Authorization: 'Bearer ' + (await token()), ...(opt.headers || {}) } });
    if ((r.status === 401 || r.status === 403) && retry) { cfg.access = ''; return api(path, opt, false); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || j.error || `Cloud-Fehler ${r.status}`); }
    return r;
  }
  const objPath = (k) => `${cfg.uid}/${encodeURIComponent(k.replace(/:/g, '--'))}.json`;
  const keyOf = (name) => name.replace(/\.json$/, '').replace(/--/g, ':');

  async function listRemote() {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await api(`object/list/${BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: cfg.uid, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) });
      const items = (await r.json()).filter((x) => x.id && x.name.endsWith('.json'));
      out.push(...items);
      if (items.length < 1000) return out;
    }
  }
  const download = async (k) => (await api(`object/authenticated/${BUCKET}/${objPath(k)}?t=${Date.now()}`)).json();
  const upload = (k, payload) => api(`object/${BUCKET}/${objPath(k)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(payload) });
  const remove = (k) => api(`object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [`${cfg.uid}/${k.replace(/:/g, '--')}.json`] }) });

  // ---------- Zusammenführen ----------
  function mergeValue(k, local, remote, tomb) {
    if (k === 'projectDeleted') return [...new Set([...(local || []), ...(remote || [])])];
    const del = new Set(tomb || []);
    const byId = new Map();
    for (const x of [...(local || []), ...(remote || [])]) if (x?.id && !del.has(x.id)) { const o = byId.get(x.id); if (!o || (x.updated || 0) >= (o.updated || 0)) byId.set(x.id, x); }
    return [...byId.values()].sort((a, b) => (b.created || 0) - (a.created || 0));
  }
  // Gelöschte Räume (project:) und Projekte (wohnung:) werden über die Liste „projectDeleted“ auf allen Geräten entfernt
  const delId = (k) => (/^(project|wohnung|kunde):/.test(k) ? k.slice(k.indexOf(':') + 1) : '');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------- Abgleich ----------
  async function syncOnce() {
    const changed = new Set();
    const remote = await listRemote();
    const remoteMap = new Map(remote.map((x) => [keyOf(decodeURIComponent(x.name)), x.updated_at || x.created_at]));
    const firstSync = !cfg.initialized;
    if (firstSync) {
      // Erstes Verbinden: alles Lokale hochladen, was die Cloud noch nicht hat. Bei gleichen Schlüsseln gewinnt die Cloud.
      for (const k of await localKeys()) meta[k] = { ...(meta[k] || {}), dirty: true, t: 0 };
    }
    // 1) Herunterladen, was sich in der Cloud geändert hat
    let tomb = (await kvGet('projectDeleted')) || [];
    const order = [...remoteMap.keys()].sort((a, b) => (a === 'projectDeleted' ? -1 : b === 'projectDeleted' ? 1 : 0));
    for (const k of order) {
      const seen = remoteMap.get(k), m = meta[k] || {};
      if (m.seen === seen && !firstSync) continue;
      const payload = await download(k);
      const local = await kvGet(k);
      let v = payload.v;
      if (MERGE_KEYS.has(k)) {
        v = mergeValue(k, local, payload.v, tomb);
        if (k === 'projectDeleted') tomb = v;
        meta[k] = { seen, dirty: !same(v, payload.v), t: Date.now() };
        if (!same(v, local)) { await rawPut(k, v); changed.add(k); }
      } else if (delId(k) && tomb.includes(delId(k))) {
        meta[k] = { seen, dirty: false, del: true, t: Date.now() };
        if (local !== undefined) { await rawDel(k); changed.add(k); }
      } else if (!m.dirty || (payload.t || 0) >= (m.t || 0)) {
        meta[k] = { seen, dirty: false, t: payload.t || 0 };
        if (!same(v, local)) { await rawPut(k, v); changed.add(k); }
      } else meta[k] = { ...m, seen }; // lokal neuer: wird gleich hochgeladen
    }
    // Auf anderem Gerät gelöschte Projekte auch hier entfernen
    for (const id of tomb) for (const pre of ['project:', 'wohnung:', 'kunde:']) if ((await kvGet(pre + id)) !== undefined) { await rawDel(pre + id); changed.add(pre + id); }
    saveMeta();
    // 2) Hochladen, was lokal geändert wurde
    const uploaded = [];
    for (const [k, m] of Object.entries(meta)) {
      if (!m.dirty) continue;
      if (m.del) { if (remoteMap.has(k)) await remove(k); delete meta[k]; saveMeta(); continue; }
      const v = await kvGet(k);
      if (v === undefined) { delete meta[k]; continue; }
      const t = m.t || Date.now();
      await upload(k, { k, t, v });
      meta[k] = { dirty: false, t, seen: '' };
      uploaded.push(k);
      saveMeta();
    }
    // Server-Zeitstempel der eigenen Uploads merken, damit sie nicht erneut heruntergeladen werden
    if (uploaded.length) {
      const fresh = new Map((await listRemote()).map((x) => [keyOf(decodeURIComponent(x.name)), x.updated_at || x.created_at]));
      for (const k of uploaded) if (meta[k] && !meta[k].dirty) meta[k].seen = fresh.get(k) || '';
      saveMeta();
    }
    if (firstSync) { cfg.initialized = true; saveCfg(); }
    return changed;
  }

  async function run({ quiet = true } = {}) {
    if (!active() || !navigator.onLine) return;
    if (running) { again = true; return running; }
    running = (async () => {
      try {
        const changed = await syncOnce();
        status = { ok: true, msg: '', last: Date.now() };
        if (changed.size) await applyChanged(changed);
        else if (!quiet) toast('Alles abgeglichen');
      } catch (e) {
        status = { ok: false, msg: /fetch|network|load failed/i.test(e.message) ? 'Cloud nicht erreichbar (offline oder Supabase-Projekt pausiert)' : e.message, last: status.last };
        if (!quiet) toast('Abgleich: ' + status.msg, 6000);
      } finally {
        running = null;
        updateCard();
        if (again) { again = false; setTimeout(run, 500); }
      }
    })();
    return running;
  }
  const runSoon = debounce(() => run(), 3000);

  async function applyChanged(changed) {
    if (changed.has('settings')) state.settings = (await kvGet('settings')) || state.settings;
    if (changed.has('boards')) state.boards = (await kvGet('boards')) || state.boards;
    if (changed.has('preisliste') || changed.has('angebotVorlagen')) toast('Preisliste/Vorlagen vom anderen Gerät übernommen. Wirksam nach Neustart der App.', 5000);
    if (changed.has('projectIndex')) await window.Projekt?.migrate();
    if ([...changed].some((k) => k.startsWith('kunde:'))) await window.Kunden?.laden();
    if (changed.has('projectIndex')) await window.Kunden?.migrate();
    for (const k of changed) if (k.startsWith('project:') && state.project?.id !== k.slice(8)) window.Projekt?.forget(k.slice(8));
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (!typing && document.getElementById('new') && state.tab === 'projekt') viewProjektListe();
    if (!typing && document.getElementById('kNew') && state.tab === 'kunden') window.Kunden?.listeView();
    if (state.project && changed.has('project:' + state.project.id)) toast('Dieses Projekt wurde auf einem anderen Gerät geändert. Zum Aktualisieren Projekt neu öffnen.', 5000);
    else toast(`${changed.size} Änderung(en) vom anderen Gerät übernommen`);
  }

  // ---------- Hooks aus app.js ----------
  function changed(k) {
    k = String(k);
    if (!active()) return;
    meta[k] = { ...(meta[k] || {}), dirty: true, del: false, t: Date.now() };
    saveMeta(); runSoon();
  }
  async function deleted(k) {
    k = String(k);
    if (!active()) return;
    meta[k] = { ...(meta[k] || {}), dirty: true, del: true, t: Date.now() };
    if (delId(k)) {
      const tomb = (await kvGet('projectDeleted')) || [];
      if (!tomb.includes(delId(k))) { tomb.push(delId(k)); await rawPut('projectDeleted', tomb); meta.projectDeleted = { ...(meta.projectDeleted || {}), dirty: true, t: Date.now() }; }
    }
    saveMeta(); runSoon();
  }

  // ---------- Verbinden / Trennen ----------
  async function connect({ url, key, email, password }) {
    cfg = { url: base(url), key: String(key).trim(), email: String(email).trim(), initialized: false };
    if (!/^https?:\/\/.+/.test(cfg.url) || !cfg.key) throw new Error('Bitte Projekt-URL und Schlüssel eintragen.');
    try { await authCall('password', { email: cfg.email, password }); }
    catch (e) { cfg = null; localStorage.removeItem(LS_CFG); throw e; }
    meta = {}; saveMeta();
    await run({ quiet: false });
    if (status.ok === false) throw new Error(status.msg);
  }
  function disconnect() {
    cfg = null; meta = {};
    try { localStorage.removeItem(LS_CFG); localStorage.removeItem(LS_META); } catch {}
    status = { ok: null, msg: '', last: 0 };
  }
  const pending = () => Object.values(meta).filter((m) => m.dirty).length;

  // ---------- Einstellungs-Karte ----------
  let cardEl = null;
  function updateCard() { if (cardEl?.isConnected) einstellungenKarte(cardEl); }
  function einstellungenKarte(el) {
    cardEl = el; if (!el) return;
    if (el.dataset.active !== String(active())) { el.dataset.active = String(active()); window.Backup?.einstellungenKarte(document.getElementById('backup-settings')); }
    if (active()) {
      const last = status.last ? new Date(status.last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
      el.innerHTML = `
        <div class="card">
          <h2>Cloud-Abgleich</h2>
          <p class="muted">Verbunden als <b>${esc(cfg.email)}</b>. Projekte, Moodboards, Vorlagen und Einstellungen werden automatisch mit deinen anderen Geräten abgeglichen.</p>
          <p class="muted">${status.ok === false ? `<span style="color:var(--danger)">${esc(status.msg)}</span>` : `Zuletzt abgeglichen: <b>${last}</b>`}${pending() ? ` · ${pending()} Änderung(en) warten` : ''}</p>
          <div class="row"><button class="btn secondary" id="syNow">Jetzt abgleichen</button><button class="btn danger" id="syOff">Abmelden</button></div>
        </div>`;
      $('#syNow', el).onclick = () => run({ quiet: false });
      $('#syOff', el).onclick = () => { if (confirm('Cloud-Abgleich auf diesem Gerät beenden? Die Daten bleiben auf dem Gerät und in der Cloud.')) { disconnect(); einstellungenKarte(el); } };
      return;
    }
    const old = lsGet(LS_CFG + ':last', {});
    el.innerHTML = `
      <div class="card">
        <h2>Cloud-Abgleich</h2>
        <p class="muted">Damit iPhone und iPad automatisch dieselben Projekte haben. Benötigt ein kostenloses Supabase-Konto (einmalig einrichten, <a href="https://github.com/felix260796/dom-app/blob/main/SUPABASE_EINRICHTEN.md" target="_blank" rel="noopener">Anleitung</a>). Auf jedem Gerät hier dieselben Daten eintragen.</p>
        <label>Projekt-URL</label><input type="url" id="syUrl" value="${esc(old.url || '')}" placeholder="https://xxxx.supabase.co" autocomplete="off">
        <label>Publishable bzw. anon key</label><input type="text" id="syKey" value="${esc(old.key || '')}" placeholder="sb_publishable_… oder eyJ…" autocomplete="off">
        <label>E-Mail</label><input type="text" id="syMail" value="${esc(old.email || '')}" inputmode="email" autocomplete="username">
        <label>Passwort</label><input type="password" id="syPw" autocomplete="current-password">
        <button class="btn block" id="syGo" style="margin-top:12px">Verbinden</button>
      </div>`;
    $('#syGo', el).onclick = async (e) => {
      const v = { url: $('#syUrl', el).value, key: $('#syKey', el).value, email: $('#syMail', el).value, password: $('#syPw', el).value };
      lsSet(LS_CFG + ':last', { url: v.url, key: v.key, email: v.email });
      e.target.disabled = true; e.target.textContent = 'Verbinde …';
      try { await connect(v); toast('Cloud-Abgleich aktiv', 4000); }
      catch (err) { toast('' + err.message, 7000); }
      einstellungenKarte(el);
    };
  }

  // ---------- Automatik ----------
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  window.addEventListener('online', () => run());
  setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60000);
  setTimeout(() => run(), 1500);

  return { changed, deleted, run, active, pending, einstellungenKarte, status: () => status };
})();
