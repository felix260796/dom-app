'use strict';
/* DOM – Zugang über den Link im Browser (Wunsch Felix 14.11.): Am eigenen PC läuft das Windows-Programm, am iPhone/iPad
 * die App aus TestFlight. Für fremde Rechner gibt es zusätzlich den Link (felix260796.github.io/dom-app).
 * Dort gilt:
 *  - Ohne Anmeldung ist nichts zu sehen (app.js zeigt erst das Anmeldefenster, Zugang.anmelden).
 *  - Jede neue Browser-Sitzung beginnt leer: Beim ersten Öffnen in einem Fenster werden alle Daten im Browser gelöscht.
 *  - Abmelden (Knopf unten in der Leiste bzw. im Menü) und automatisches Abmelden nach Vorgabe browserAbmeldenMin
 *    Minuten ohne Bedienung: noch nicht Hochgeladenes abgleichen, dann alles im Browser löschen.
 *  - Die Anmeldung (Sync) liegt nur im sessionStorage, nicht dauerhaft (sync.js).
 * Muss als erstes Skript geladen werden (vor core.js und sync.js). Windows-Programm, TestFlight-App und localhost bleiben wie bisher. */
window.Zugang = (() => {
  const fluechtig = /\.github\.io$/i.test(location.hostname) && !window.DomDesktop && !window.Capacitor?.isNativePlatform?.();
  const SITZUNG = 'dom:sitzung';
  const DATENBANKEN = ['sanierung', 'dom-sync', 'dom-audio'];

  /** Alles löschen, was DOM in diesem Browser gespeichert hat. */
  function allesLoeschen() {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    for (const n of DATENBANKEN) { try { indexedDB.deleteDatabase(n); } catch {} }
  }
  // Neue Sitzung (Fenster neu geöffnet): leer beginnen, auch wenn beim letzten Mal das Abmelden vergessen wurde
  if (fluechtig) {
    let neu = true;
    try { neu = !sessionStorage.getItem(SITZUNG); } catch {}
    if (neu) {
      let h = ''; try { h = sessionStorage.getItem('dom:abgemeldet') || ''; } catch {}
      allesLoeschen();
      try { sessionStorage.setItem(SITZUNG, String(Date.now())); if (h) sessionStorage.setItem('dom:abgemeldet', h); } catch {}
    }
  }

  /** Anmeldefenster. Erst danach lädt die App Daten. Löst auf, wenn der erste Abgleich durch ist. */
  function anmelden() {
    return new Promise((fertig) => {
      document.documentElement.classList.add('einr-offen', 'zugang-offen');
      const el = document.createElement('div');
      el.className = 'einr';
      el.innerHTML = `<div class="einr-k"><div class="einr-kopf"><img src="assets/dom_logo.png" alt="DOM"><span class="muted">Zugang im Browser</span></div>
        <h2>Anmelden</h2>${(() => { const h = hinweis(); return h ? `<p class="notice plain" style="margin:0 0 12px">${h.replace(/[<>&]/g, '')}</p>` : ''; })()}
        <p class="muted">Hier siehst du DOM über den Link, z. B. an einem fremden Rechner. Daten erscheinen erst nach der Anmeldung. Beim Abmelden oder Schließen des Fensters wird alles im Browser wieder gelöscht. Am besten ein privates Fenster verwenden.</p>
        <div id="zgSync"></div></div>`;
      document.body.appendChild(el);
      window.Sync.einstellungenKarte(el.querySelector('#zgSync'));
      const warte = setInterval(() => {
        if (!(window.Sync.active() && window.Sync.status().last)) return;
        clearInterval(warte); el.remove();
        document.documentElement.classList.remove('einr-offen', 'zugang-offen');
        fertig();
      }, 500);
    });
  }

  /** Abmelden: erst hochladen, was noch fehlt, dann alles im Browser löschen und neu laden. */
  async function abmelden(grund = '') {
    if (!fluechtig) return;
    try { if (window.Sync?.pending()) { toast('Letzte Änderungen werden noch hochgeladen …', 8000); await window.Sync.run(); } } catch {}
    if (window.Sync?.pending() && !grund && !confirm('Einige Änderungen konnten nicht hochgeladen werden (keine Verbindung?). Trotzdem abmelden? Sie gehen dann verloren.')) return;
    allesLoeschen();
    try { if (grund) sessionStorage.setItem('dom:abgemeldet', grund); } catch {}
    location.replace(location.pathname);
  }

  // Automatisch abmelden nach einiger Zeit ohne Bedienung (Vorgabe browserAbmeldenMin, 0 = nie)
  let zuletzt = Date.now();
  if (fluechtig) {
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { zuletzt = Date.now(); }, { passive: true, capture: true });
    setInterval(() => {
      if (!window.Sync?.active()) return;
      const min = +(typeof vorgabe === 'function' ? vorgabe('browserAbmeldenMin') : 30) || 0;
      if (min > 0 && Date.now() - zuletzt > min * 60000) abmelden(`Automatisch abgemeldet nach ${min} Minuten ohne Bedienung.`);
    }, 30000);
  }
  /** Hinweis nach automatischem Abmelden (steht im Anmeldefenster). */
  function hinweis() { try { const g = sessionStorage.getItem('dom:abgemeldet'); sessionStorage.removeItem('dom:abgemeldet'); return g || ''; } catch { return ''; } }

  return { fluechtig, anmelden, abmelden, hinweis };
})();
