'use strict';
/* DOM – Mitteilungen aufs iPhone (Web-Push) und Zahl am App-Symbol.
 * Gerät anmelden: Einstellungen › Mitteilungen › „Mitteilungen erlauben“. Das iPhone gibt eine Push-Adresse heraus,
 * die Supabase-Funktion „push“ speichert sie mit den Einstellungen dieses Geräts (prefs) und schickt per Zeitplan
 * die Morgenübersicht und Terminerinnerungen. Geht nur in der App auf dem Home-Bildschirm (iOS 16.4 oder neuer)
 * und mit eingerichtetem Cloud-Abgleich. Ändern sich die Einstellungen, meldet abgleich() das Gerät neu an.
 * Vorgaben: pushMorgen, pushTermin, pushNachfassen, pushGeld, pushBaustelle, appBadge (vorgaben.js, Seite 'push').
 * Gegenstück: supabase/functions/push/index.ts, Empfang in sw.js ('push', 'notificationclick'). */
window.Push = (() => {
  const LS = 'dom:push';
  const unterstuetzt = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const homescreen = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const prefs = () => ({
    morgen: String(vorgabe('pushMorgen') || '').trim(), termin: +vorgabe('pushTermin') || 0,
    nachfassen: vorgabe('pushNachfassen') !== 'nein', nachfassenTage: +vorgabe('nachfassenTage') || 7,
    geld: vorgabe('pushGeld') !== 'nein', baustelle: vorgabe('pushBaustelle') !== 'nein', vorlauf: +vorgabe('heuteVorlauf') || 3,
    badge: vorgabe('appBadge') !== 'nein', wer: window.Kalender?.wer() || '',
  });
  const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
  const geraetName = () => { const w = window.Kalender?.team().find((p) => p.id === window.Kalender.wer()); return `${/iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : 'Gerät'}${w ? ' von ' + w.name.split(' ')[0] : ''}`; };
  async function abo() { if (!unterstuetzt()) return null; const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null; }

  /** 'kein-geraet' | 'kein-homescreen' | 'keine-cloud' | 'blockiert' | 'aus' | 'an' */
  async function status() {
    if (!unterstuetzt()) return homescreen() || !/iPhone|iPad/.test(navigator.userAgent) ? 'kein-geraet' : 'kein-homescreen';
    if (!window.Sync?.active()) return 'keine-cloud';
    if (Notification.permission === 'denied') return 'blockiert';
    return Notification.permission === 'granted' && (await abo()) ? 'an' : 'aus';
  }

  async function melden(s) {
    const p = prefs();
    await Sync.funktion('push', { aktion: 'anmelden', sub: s.toJSON(), prefs: p, name: geraetName() });
    try { localStorage.setItem(LS, JSON.stringify(p)); } catch {}
  }
  async function einschalten() {
    const erlaubt = await Notification.requestPermission(); // muss direkt nach dem Tippen passieren
    if (erlaubt !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt. Das lässt sich in den iPhone-Einstellungen unter Mitteilungen › DOM ändern.');
    const reg = await navigator.serviceWorker.ready;
    let s = await reg.pushManager.getSubscription();
    if (!s) { const { publicKey } = await Sync.funktion('push', { aktion: 'schluessel' }); s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }); }
    await melden(s);
  }
  async function ausschalten() {
    const s = await abo(); if (!s) return;
    try { await Sync.funktion('push', { aktion: 'abmelden', sub: s.toJSON() }); } catch {}
    await s.unsubscribe().catch(() => {});
    try { localStorage.removeItem(LS); } catch {}
  }
  /** Nach Änderungen der Einstellungen (oder beim Start): angemeldetes Gerät mit den neuen Werten neu melden. */
  async function abgleich() {
    try {
      if (!unterstuetzt() || Notification.permission !== 'granted' || !window.Sync?.active()) return;
      const s = await abo(); if (!s) return;
      let alt = ''; try { alt = localStorage.getItem(LS) || ''; } catch {}
      if (alt !== JSON.stringify(prefs())) await melden(s);
    } catch (e) { console.warn('Push', e); }
  }
  /** Zahl am App-Symbol (offene Punkte von „Heute“). */
  function badge(n) {
    try { if (vorgabe('appBadge') === 'nein' || !n) navigator.clearAppBadge?.(); else navigator.setAppBadge?.(n); } catch {}
  }

  /** Karte oben auf der Einstellungsseite „Mitteilungen“. */
  async function karte(el) {
    const st = await status();
    const T = {
      'kein-geraet': ['Auf diesem Gerät nicht möglich', 'Mitteilungen gehen auf dem iPhone ab iOS 16.4, wenn DOM über „Zum Home-Bildschirm“ installiert ist.'],
      'kein-homescreen': ['Nur in der App auf dem Home-Bildschirm', 'Öffne DOM über das Symbol auf dem Home-Bildschirm, nicht im Safari-Fenster. Dann hier „Mitteilungen erlauben“ tippen.'],
      'keine-cloud': ['Erst den Cloud-Abgleich einrichten', 'Die Mitteilungen kommen über Supabase. Melde dich unter Einstellungen › Cloud-Abgleich an.'],
      blockiert: ['Mitteilungen sind blockiert', 'In den iPhone-Einstellungen unter Mitteilungen › DOM wieder erlauben, dann hier nochmal tippen.'],
      aus: ['Mitteilungen sind aus', 'Einmal tippen, dann fragt das iPhone, ob DOM Mitteilungen schicken darf.'],
      an: ['Mitteilungen sind an', `Dieses Gerät bekommt die Morgenübersicht${prefs().morgen ? ' um ' + prefs().morgen + ' Uhr' : ' (ausgeschaltet)'}${prefs().termin ? ` und ${prefs().termin} Minuten vor jedem Termin eine Erinnerung` : ''}.`],
    }[st];
    el.innerHTML = `<div class="card push-k ${st === 'an' ? 'an' : ''}"><b>${esc(T[0])}</b><p class="muted">${esc(T[1])}</p>
      ${st === 'aus' || st === 'blockiert' ? '<button class="btn" id="puAn" style="width:100%">Mitteilungen erlauben</button>' : ''}
      ${st === 'keine-cloud' ? '<button class="btn" id="puCloud" style="width:100%">Cloud-Abgleich einrichten</button>' : ''}
      ${st === 'an' ? `<div class="row"><button class="btn secondary" id="puTest">Test senden</button><button class="btn secondary" id="puVor">Übersicht jetzt</button></div><button class="btn secondary block push-aus" id="puAus">Auf diesem Gerät ausschalten</button>` : ''}</div>
      <p class="hint">Einmalig in Supabase einrichten: Anleitung „PUSH_EINRICHTEN.md“ im App-Ordner.</p>`;
    const lauf = (id, fn, ok) => { const b = $('#' + id, el); if (b) b.onclick = async () => { b.disabled = true; try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, 6000); } karte(el); }; };
    lauf('puAn', einschalten, 'Mitteilungen eingeschaltet');
    lauf('puTest', async () => { const s = await abo(); await Sync.funktion('push', { aktion: 'test', sub: s.toJSON() }); }, 'Test gesendet');
    lauf('puVor', async () => { const s = await abo(); await Sync.funktion('push', { aktion: 'test', vorschau: true, sub: s.toJSON() }); }, 'Übersicht gesendet');
    lauf('puAus', ausschalten, 'Mitteilungen ausgeschaltet');
    if ($('#puCloud', el)) $('#puCloud', el).onclick = () => einstellungSeite('cloud');
  }

  return { status, einschalten, ausschalten, abgleich, badge, karte, prefs };
})();
