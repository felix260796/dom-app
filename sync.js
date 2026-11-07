'use strict';
/* Cloud-Abgleich über Supabase (kostenloser Tarif): alle App-Daten werden automatisch
 * zwischen den Geräten abgeglichen (iPhone, iPad, PC). Jeder Speicher-Eintrag (Projekt,
 * Moodboards, Einstellungen, …) liegt als eigene Datei im privaten Storage-Bucket „dom“
 * unter <Benutzer-ID>/<Schlüssel>.json. Zugriff nur mit Anmeldung (E-Mail + Passwort).
 * Konflikte: Änderungen werden feldweise zusammengeführt (Drei-Wege-Abgleich gegen den zuletzt
 * abgeglichenen Stand). Nur wenn dasselbe Feld auf zwei Geräten geändert wurde, gewinnt die neuere Eingabe.
 * Projektliste und Löschliste werden zusammengeführt.
 * Baut auf app.js auf (db, kvGet, $, esc, toast, state, viewProjektListe). */
window.Sync = (() => {
  const BUCKET = 'dom';
  const LS_CFG = 'dom:syncCfg', LS_META = 'dom:syncMeta';
  const MERGE_KEYS = new Set(['projectIndex', 'projectDeleted']);
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Gemeinsamer Firmenspeicher: alle Benutzer des Supabase-Projekts teilen den Ordner „team“.
  // (Bis 6.11.2026 hatte jeder Benutzer einen eigenen Ordner <uid>; der bleibt als Altbestand liegen.)
  const SPACE = 'team';
  // Fest hinterlegt (öffentliche Werte, kein Geheimnis; geschützt wird alles über die Anmeldung)
  const FEST = { url: 'https://flqjnhetnqdcgskjsgkv.supabase.co', key: 'sb_publishable_pw5SIPuEKUS22hU9qzQbOQ_wF_VTLrU' };
  const fest = () => !!FEST.key;
  let cfg = lsGet(LS_CFG, null); // { url, key, email, uid, access, refresh, expires, initialized, space }
  let meta = lsGet(LS_META, {}); // { [key]: { dirty, del, t, seen } }
  // Umstellung auf den gemeinsamen Ordner: wie ein erstes Verbinden behandeln, damit alles Lokale hochgeladen bzw. zusammengeführt wird
  if (cfg && cfg.space !== SPACE) { cfg.space = SPACE; cfg.initialized = false; meta = {}; lsSet(LS_CFG, cfg); lsSet(LS_META, meta); }
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
  // Zuletzt abgeglichener Stand je Schlüssel (Basis für das feldweise Zusammenführen), eigene Datenbank
  let _bdb;
  const bdb = () => (_bdb ??= new Promise((res, rej) => {
    const q = indexedDB.open('dom-sync', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('base');
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  }));
  const BASE_MAX = 3e6; // sehr große Einträge (z. B. Räume mit vielen Fotos) ohne Basis: dann gewinnt die neuere Eingabe
  async function baseGet(k) {
    try { const d = await bdb(); return await new Promise((res) => { const q = d.transaction('base').objectStore('base').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch { return undefined; }
  }
  async function baseSet(k, v) {
    try {
      const keep = v !== undefined && v !== null && typeof v === 'object' && JSON.stringify(v).length < BASE_MAX;
      const d = await bdb();
      await new Promise((res) => { const tx = d.transaction('base', 'readwrite'); keep ? tx.objectStore('base').put(v, k) : tx.objectStore('base').delete(k); tx.oncomplete = res; tx.onerror = res; });
    } catch {}
  }
  async function localKeys() {
    const d = await db();
    return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result.map(String)); q.onerror = () => rej(q.error); });
  }

  // MD5 (für den Vergleich mit dem eTag der Cloud-Datei: war die Datei danach noch unsere?)
  function md5(bytes) {
    const K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
    const n = bytes.length, len = ((n + 8) >> 6) + 1 << 4, w = new Uint32Array(len);
    for (let i = 0; i < n; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
    w[n >> 2] |= 0x80 << ((n % 4) * 8);
    w[len - 2] = (n * 8) >>> 0; w[len - 1] = Math.floor(n / 2 ** 29);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let j = 0; j < len; j += 16) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const tmp = D; D = C; C = B;
        const x = (A + F + K[i] + w[j + g]) >>> 0, sh = S[(i >> 4) * 4 + (i % 4)];
        B = (B + ((x << sh) | (x >>> (32 - sh)))) >>> 0; A = tmp;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  const etagOf = (x) => String(x?.metadata?.eTag || x?.metadata?.etag || '').replace(/"/g, '').toLowerCase();

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
    if (!r.ok) { const j = await r.json().catch(() => ({})); const m = j.message || j.error || `Cloud-Fehler ${r.status}`; throw new Error(/row-level security|unauthorized/i.test(m) ? 'Kein Zugriff auf den gemeinsamen Speicher. Bitte in Supabase den SQL-Block „Gemeinsamer Firmenspeicher“ aus der Anleitung ausführen.' : m); }
    return r;
  }
  const objPath = (k) => `${SPACE}/${encodeURIComponent(k.replace(/:/g, '--'))}.json`;
  const keyOf = (name) => name.replace(/\.json$/, '').replace(/--/g, ':');

  async function listRemote() {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await api(`object/list/${BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: SPACE, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) });
      const items = (await r.json()).filter((x) => x.id && x.name.endsWith('.json'));
      out.push(...items);
      if (items.length < 1000) return out;
    }
  }
  const download = async (k) => (await api(`object/authenticated/${BUCKET}/${objPath(k)}?t=${Date.now()}`)).json();
  /** Lädt hoch und liefert den MD5 des Inhalts (zum späteren Vergleich mit dem eTag). */
  async function upload(k, payload) {
    const body = new TextEncoder().encode(JSON.stringify(payload));
    await api(`object/${BUCKET}/${objPath(k)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body });
    return md5(body);
  }
  const remove = (k) => api(`object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [`${SPACE}/${k.replace(/:/g, '--')}.json`] }) });

  // ---------- Zusammenführen ----------
  function mergeValue(k, local, remote, tomb) {
    if (k === 'projectDeleted') return [...new Set([...(local || []), ...(remote || [])])];
    const del = new Set(tomb || []);
    const byId = new Map();
    for (const x of [...(local || []), ...(remote || [])]) if (x?.id && !del.has(x.id)) { const o = byId.get(x.id); if (!o || (x.updated || 0) >= (o.updated || 0)) byId.set(x.id, x); }
    return [...byId.values()].sort((a, b) => (b.created || 0) - (a.created || 0));
  }
  // Gelöschte Räume (project:) und Projekte (wohnung:) werden über die Liste „projectDeleted“ auf allen Geräten entfernt
  const delId = (k) => (/^(project|wohnung|kunde|bild|termin|partner|pdok|beleg|bdatei|auftrag):/.test(k) ? k.slice(k.indexOf(':') + 1) : '');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const hasIds = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => isObj(x) && x.id != null);
  /** Drei-Wege-Zusammenführung: b = zuletzt abgeglichener Stand, l = lokal, r = Cloud.
   * Was nur auf einer Seite geändert wurde, bleibt erhalten; echter Konflikt im selben Feld: localWins entscheidet. */
  function merge3(b, l, r, localWins) {
    if (same(l, r)) return l;
    if (same(l, b)) return r;
    if (same(r, b)) return l;
    if (isObj(l) && isObj(r)) {
      const bb = isObj(b) ? b : {}, out = {};
      for (const key of new Set([...Object.keys(r), ...Object.keys(l)])) {
        const v = merge3(bb[key], l[key], r[key], localWins);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    if ((hasIds(l) || l?.length === 0) && (hasIds(r) || r?.length === 0) && (hasIds(l) || hasIds(r))) {
      // Listen mit IDs (z. B. Objekte eines Kunden): Eintrag für Eintrag
      const bm = new Map((Array.isArray(b) ? b : []).filter(isObj).map((x) => [x.id, x]));
      const lm = new Map(l.map((x) => [x.id, x])), rm = new Map(r.map((x) => [x.id, x]));
      const ids = [...new Set([...r.map((x) => x.id), ...l.map((x) => x.id)])];
      const out = [];
      for (const id of ids) {
        const inL = lm.has(id), inR = rm.has(id), bx = bm.get(id);
        if (inL && inR) out.push(merge3(bx, lm.get(id), rm.get(id), localWins));
        else if (inL) { if (!bx || !same(lm.get(id), bx)) out.push(lm.get(id)); } // in der Cloud gelöscht und hier unverändert: weg
        else if (inR) { if (!bx || !same(rm.get(id), bx)) out.push(rm.get(id)); }
      }
      return out;
    }
    if (Array.isArray(l) && Array.isArray(r) && [...l, ...r].every((x) => typeof x !== 'object')) {
      // Listen einfacher Werte (z. B. Raum-IDs): Hinzugefügtes beider Seiten behalten, Entferntes entfernen
      const bs = new Set(Array.isArray(b) ? b : []), ls = new Set(l), rs = new Set(r);
      return [...new Set([...r, ...l])].filter((x) => (ls.has(x) && rs.has(x)) || (ls.has(x) && !bs.has(x)) || (rs.has(x) && !bs.has(x)));
    }
    return localWins ? l : r;
  }

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
      const mNow = meta[k] || {}; // erneut lesen: während des Downloads kann getippt worden sein
      let v = payload.v;
      if (MERGE_KEYS.has(k)) {
        v = mergeValue(k, local, payload.v, tomb);
        if (k === 'projectDeleted') tomb = v;
        meta[k] = { seen, dirty: !same(v, payload.v), t: Date.now() };
        if (!same(v, local)) { await rawPut(k, v); changed.add(k); }
      } else if (delId(k) && tomb.includes(delId(k))) {
        meta[k] = { seen, dirty: false, del: true, t: Date.now() };
        if (local !== undefined) { await rawDel(k); changed.add(k); }
      } else if (mNow.dirty && mNow.del) {
        meta[k] = { ...mNow, seen }; // hier gelöscht: Löschung wird gleich übertragen
      } else if (!mNow.dirty || local === undefined) {
        meta[k] = { seen, dirty: false, t: payload.t || 0 };
        if (!same(v, local)) { await rawPut(k, v); changed.add(k); }
        await baseSet(k, v);
      } else {
        // Auf beiden Seiten geändert: feldweise zusammenführen, nichts geht verloren
        const b = firstSync ? undefined : await baseGet(k);
        const localWins = (mNow.t || 0) > (payload.t || 0);
        const merged = b === undefined && !(isObj(local) && isObj(v)) ? (localWins ? local : v) : merge3(b, local, v, localWins);
        if ((meta[k] || {}).t !== mNow.t) { meta[k] = { ...meta[k], seen }; continue; } // inzwischen erneut geändert: nächster Durchlauf
        const t = Math.max(mNow.t || 0, payload.t || 0);
        if (!same(merged, local)) { await rawPut(k, merged); changed.add(k); }
        await baseSet(k, v);
        meta[k] = { seen, dirty: !same(merged, v), t };
      }
    }
    // Auf anderem Gerät gelöschte Projekte auch hier entfernen
    for (const id of tomb) for (const pre of ['project:', 'wohnung:', 'kunde:', 'bild:', 'termin:', 'partner:', 'pdok:']) if ((await kvGet(pre + id)) !== undefined) { await rawDel(pre + id); changed.add(pre + id); }
    saveMeta();
    // 2) Hochladen, was lokal geändert wurde
    const uploaded = [];
    // Kurz vorher noch einmal nachsehen: Hat ein anderes Gerät inzwischen dieselbe Datei geändert, erst zusammenführen (nächster Durchlauf)
    const dirtyKeys = Object.entries(meta).filter(([, m]) => m.dirty && !m.del).map(([k]) => k);
    const before = dirtyKeys.length ? new Map((await listRemote()).map((x) => [keyOf(decodeURIComponent(x.name)), x.updated_at || x.created_at])) : remoteMap;
    for (const [k, m] of Object.entries(meta)) {
      if (!m.dirty) continue;
      if (m.del) { if (remoteMap.has(k)) await remove(k); delete meta[k]; saveMeta(); continue; }
      if (before.has(k) && before.get(k) !== m.seen && m.seen !== '' && !(firstSync && !remoteMap.has(k))) { again = true; continue; }
      if (before.has(k) && !remoteMap.has(k)) { again = true; continue; } // neu von einem anderen Gerät: erst holen
      const v = await kvGet(k);
      if (v === undefined) { delete meta[k]; continue; }
      const t = m.t || Date.now();
      const hash = await upload(k, { k, t, v });
      uploaded.push({ k, t, v, hash, mt: m.t });
    }
    // Prüfen, ob die Cloud-Datei danach noch unsere ist. Hat ein anderes Gerät im selben Moment überschrieben,
    // bleibt die Änderung offen und wird im nächsten Durchlauf mit dessen Stand zusammengeführt.
    if (uploaded.length) {
      const fresh = new Map((await listRemote()).map((x) => [keyOf(decodeURIComponent(x.name)), x]));
      for (const u of uploaded) {
        const f = fresh.get(u.k), cur = meta[u.k] || {};
        const ours = f && etagOf(f) === u.hash;
        if (ours) await baseSet(u.k, u.v);
        const still = cur.t === u.mt; // während des Hochladens nicht erneut geändert
        meta[u.k] = { ...cur, dirty: !(ours && still), t: still ? u.t : cur.t, seen: ours ? (f.updated_at || f.created_at) : '' };
        if (!ours) again = true;
      }
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
  const runSoon = debounce(() => run(), 1500);

  async function applyChanged(changed) {
    if (changed.has('settings')) state.settings = (await kvGet('settings')) || state.settings;
    if (changed.has('boards')) state.boards = (await kvGet('boards')) || state.boards;
    if (changed.has('preisliste') || changed.has('angebotVorlagen')) toast('Preisliste/Vorlagen vom anderen Gerät übernommen. Wirksam nach Neustart der App.', 5000);
    if (changed.has('projectIndex')) await window.Projekt?.migrate();
    if ([...changed].some((k) => k.startsWith('kunde:'))) await window.Kunden?.laden();
    if ([...changed].some((k) => k.startsWith('partner:'))) await window.Partner?.laden();
    if ([...changed].some((k) => k.startsWith('termin:'))) { await window.Kalender?.laden(); window.Kalender?.punkt(); }
    if (changed.has('projectIndex')) await window.Kunden?.migrate();
    if (changed.has('projectIndex') || [...changed].some((k) => k.startsWith('kunde:'))) await window.Kunden?.nummern();
    for (const k of changed) if (k.startsWith('project:') && state.project?.id !== k.slice(8)) window.Projekt?.forget(k.slice(8));
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (!typing && document.getElementById('new') && state.tab === 'projekt') viewProjektListe();
    if (!typing && document.getElementById('kNew') && state.tab === 'kunden') window.Kunden?.listeView();
    // Offene Kundenkarte bzw. offenes Objekt mit dem neuen Stand neu zeichnen, damit nicht mit altem Stand weitergearbeitet wird
    // (nur wenn Kundenkarte bzw. Objektseite wirklich zu sehen ist, nicht unter Kalender, Bildern oder einem Projekt)
    else if (!typing && state.tab === 'kunden' && state.kunde && !state.kalender && !state.finanzen && !state.wohnung && (document.getElementById('kAct') || document.getElementById('oAct')) && changed.has('kunde:' + state.kunde.id)) {
      const k = window.Kunden?.byId(state.kunde.id), y = window.scrollY;
      if (k) { const o = state.objekt && window.Kunden.objekt(k, state.objekt); await (o ? window.Kunden.objektView(k, o) : window.Kunden.detail(k)); window.scrollTo(0, y); }
    }
    // Subunternehmer: Liste bzw. offene Karte neu zeichnen (die Karte hält sonst den alten Stand und würde ihn zurückschreiben)
    if (!typing && !state.kalender && !state.finanzen && state.tab === 'partner' && [...changed].some((k) => k.startsWith('partner:'))) {
      const y = window.scrollY;
      if (state.partner && document.getElementById('pAct')) { const p = window.Partner?.byId(state.partner.id); if (p) { window.Partner.detail(p); window.scrollTo(0, y); } }
      else if (document.getElementById('pNew')) window.Partner?.listeView();
    }
    // Finanzen-Übersicht mit neuen Eingangsrechnungen neu zeichnen
    if (!typing && state.finanzen && !state.beleg && document.getElementById('fNeu') && [...changed].some((k) => k.startsWith('beleg:'))) window.Finanzen?.view();
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
    if (fest()) { url = url || FEST.url; key = key || FEST.key; }
    cfg = { url: base(url), key: String(key).trim(), email: String(email).trim(), initialized: false, space: SPACE };
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
        ${fest() ? `<p class="muted">Mit deinem Firmenkonto anmelden. Danach kommen alle Kunden, Projekte und Einstellungen (auch der KI-Schlüssel) automatisch auf dieses Gerät.</p>`
          : `<p class="muted">Damit iPhone und iPad automatisch dieselben Projekte haben. Benötigt ein kostenloses Supabase-Konto (einmalig einrichten, <a href="https://github.com/felix260796/dom-app/blob/main/SUPABASE_EINRICHTEN.md" target="_blank" rel="noopener">Anleitung</a>). Auf jedem Gerät hier dieselben Daten eintragen.</p>
        <label>Projekt-URL</label><input type="url" id="syUrl" value="${esc(old.url || '')}" placeholder="https://xxxx.supabase.co" autocomplete="off">
        <label>Publishable bzw. anon key</label><input type="text" id="syKey" value="${esc(old.key || '')}" placeholder="sb_publishable_… oder eyJ…" autocomplete="off">`}
        <label>E-Mail</label><input type="text" id="syMail" value="${esc(old.email || '')}" inputmode="email" autocomplete="username">
        <label>Passwort</label><input type="password" id="syPw" autocomplete="current-password">
        <button class="btn block" id="syGo" style="margin-top:12px">Verbinden</button>
      </div>`;
    $('#syGo', el).onclick = async (e) => {
      const v = { url: $('#syUrl', el)?.value || '', key: $('#syKey', el)?.value || '', email: $('#syMail', el).value, password: $('#syPw', el).value };
      lsSet(LS_CFG + ':last', { url: v.url, key: v.key, email: v.email });
      e.target.disabled = true; e.target.textContent = 'Verbinde …';
      try { await connect(v); toast('Cloud-Abgleich aktiv', 4000); }
      catch (err) { toast('' + err.message, 7000); }
      einstellungenKarte(el);
    };
  }

  // ---------- Automatik ----------
  // Beim Wechsel aus der App sofort hochladen (iOS hält die App im Hintergrund an)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' || pending()) run(); });
  window.addEventListener('pagehide', () => { if (pending()) run(); });
  window.addEventListener('online', () => run());
  setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60000);
  setTimeout(() => run(), 1500);

  /** Supabase Edge Function aufrufen (z. B. 'termin-mail'), angemeldet als der App-Benutzer. */
  async function funktion(name, body) {
    if (!active()) throw new Error('Bitte zuerst den Cloud-Abgleich einrichten.');
    let r;
    try {
      r = await fetch(`${cfg.url}/functions/v1/${name}`, { method: 'POST', headers: { apikey: cfg.key, Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new Error('Keine Verbindung. Bitte später nochmal versuchen.'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error('Die Funktion „' + name + '“ ist in Supabase noch nicht angelegt (siehe Anleitung Terminmails).');
    if (!r.ok) throw new Error(j.fehler || j.message || j.msg || `Fehler ${r.status}`);
    return j;
  }
  return { changed, deleted, run, active, pending, einstellungenKarte, funktion, fest, status: () => status };
})();
