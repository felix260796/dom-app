'use strict';
/* DOM – Gerät einrichten (Wunsch Felix 14.11.): Beim Start fragt DOM auf jedem Gerät (iPhone, iPad, Windows)
 * der Reihe nach alles ab, was hier noch fehlt. Was schon da ist, wird übersprungen. Fehlt noch etwas,
 * fragt DOM beim nächsten Start wieder. Von Hand: Einstellungen › Gerät einrichten.
 * Schritte: Cloud-Abgleich (holt alle Daten, auch den KI-Schlüssel), wem das Gerät gehört, KI-Schlüssel,
 * nur in der App aus TestFlight noch Mitteilungen und die Geräte-Funktionen (Face ID, Kalender, Kontakte).
 * Was je Gerät schon gefragt wurde: localStorage 'dom:einrichten' (wird nicht abgeglichen).
 * Schlüssel und Passwörter landen nur auf dem Gerät bzw. in Supabase, nie im Code. */
window.Einrichten = (() => {
  const LS = 'dom:einrichten';
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
  const lsSet = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} };
  const gefragt = (k) => !!lsGet()[k];
  const merken = (k) => lsSet({ ...lsGet(), [k]: Date.now() });
  const nativ = () => !!window.Geraet?.nativ?.();
  const werGewaehlt = () => { try { return localStorage.getItem('dom.kal.wer') !== null; } catch { return true; } };

  // [id, Titel, fehlt noch?, nur in der App aus TestFlight]
  const SCHRITTE = [
    ['cloud', 'Anmelden', () => !window.Sync?.active()],
    ['wer', 'Wem gehört dieses Gerät?', () => !werGewaehlt()],
    ['ki', 'KI-Schlüssel', () => !state.settings.apiKey],
    ['push', 'Mitteilungen', () => !gefragt('push'), true],
    ['geraet', 'Funktionen dieses Geräts', () => !gefragt('geraet'), true],
  ];
  const offen = () => SCHRITTE.filter(([, , fehlt, nurApp]) => (!nurApp || nativ()) && fehlt());

  let el = null;
  function zu() { el?.remove(); el = null; document.documentElement.classList.remove('einr-offen'); }

  /** Zeigt die Schritte, die noch fehlen. alle = true: jeden Schritt zeigen (von Hand aus den Einstellungen). */
  function oeffnen({ alle = false } = {}) {
    const liste = alle ? SCHRITTE.filter(([, , , nurApp]) => !nurApp || nativ()) : offen();
    if (!liste.length) { if (alle) toast('Auf diesem Gerät ist alles eingerichtet.'); return; }
    zu();
    el = document.createElement('div');
    el.className = 'einr';
    document.body.appendChild(el);
    document.documentElement.classList.add('einr-offen');
    let i = 0;
    const weiter = () => { merken(liste[i][0]); i++; if (i >= liste.length) return fertig(); zeigen(); };
    const fertig = () => {
      const rest = offen();
      zu();
      toast(rest.length ? `Noch offen: ${rest.map((s) => s[1]).join(', ')}. DOM fragt beim nächsten Start wieder.` : 'Dieses Gerät ist eingerichtet.', 6000);
      if (window.appGestartet) switchTab(state.tab || 'heute');
    };
    function zeigen() {
      const [id, titel] = liste[i];
      el.innerHTML = `<div class="einr-k">
        <div class="einr-kopf"><img src="assets/dom_logo.png" alt="DOM"><span class="muted">Gerät einrichten · ${i + 1} von ${liste.length}</span></div>
        <h2>${esc(titel)}</h2><div id="einrInhalt"></div>
        <div class="einr-fuss"><button class="btn secondary" id="einrSpaeter">${i + 1 < liste.length ? 'Überspringen' : 'Später'}</button><button class="btn" id="einrWeiter">${i + 1 < liste.length ? 'Weiter' : 'Fertig'}</button></div></div>`;
      const box = $('#einrInhalt', el);
      $('#einrSpaeter', el).onclick = () => { if (liste[i][3]) merken(liste[i][0]); i++; if (i >= liste.length) return fertig(); zeigen(); };
      $('#einrWeiter', el).onclick = weiter;
      el.scrollTop = 0;
      if (id === 'cloud') {
        box.innerHTML = '<div id="einrSync"></div>';
        window.Sync?.einstellungenKarte($('#einrSync', box));
        // Nach dem Anmelden von selbst weiter
        const warte = setInterval(() => { if (!el || liste[i]?.[0] !== 'cloud') return clearInterval(warte); if (window.Sync?.active() && window.Sync.status().last) { clearInterval(warte); weiter(); } }, 800);
      } else if (id === 'wer') {
        const team = window.Kalender?.team() || [];
        box.innerHTML = `<p class="muted">Danach richten sich Kalender, „Heute“ und Mitteilungen. Unterschrieben wird mit der Unterschrift dieser Person.</p>
          <div class="einr-wahl">${[...team.map((p) => [p.id, p.name]), ['', 'Beide (gemeinsames Gerät)']].map(([pid, n]) => `<button class="btn secondary block" data-ew="${esc(pid)}">${esc(n)}</button>`).join('')}</div>`;
        $$('[data-ew]', box).forEach((b) => (b.onclick = () => { Kalender.werSetzen(b.dataset.ew); window.Push?.abgleich(); Kalender.punkt?.(); weiter(); }));
      } else if (id === 'ki') {
        box.innerHTML = `<p class="muted">Für Bilder, Vorschläge und das Vorlesen von Belegen. Ist der Cloud-Abgleich eingerichtet, kommt der Schlüssel meist von selbst. Sonst hier eintragen: kostenlos erstellen unter <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.</p>
          <label>API-Schlüssel</label><input type="password" id="einrKey" placeholder="AIza…" autocomplete="off">`;
        $('#einrWeiter', el).onclick = async () => {
          const v = $('#einrKey', box).value.trim();
          if (v) { state.settings.apiKey = v; await saveSettings(); }
          weiter();
        };
      } else if (id === 'push') {
        box.innerHTML = '<p class="muted">Morgens eine Übersicht, Erinnerungen vor Terminen und an Anrufe. Einmal erlauben, die Uhrzeiten stellst du später in den Einstellungen ein.</p><div id="einrPush"></div>';
        window.Push?.karte($('#einrPush', box));
      } else if (id === 'geraet') {
        box.innerHTML = '<div id="einrGeraet"></div>';
        window.Geraet?.karte($('#einrGeraet', box));
      }
    }
    zeigen();
  }

  /** Beim Start: nur wenn etwas fehlt. */
  function start() { if (offen().length) oeffnen(); }

  return { start, oeffnen, offen };
})();
