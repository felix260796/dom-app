'use strict';
/* DOM – Bausteine für Kontaktkarten (Kunden und Subunternehmer):
 * Datum zum Eintippen (TT.MM.JJJJ statt Kalender-Auswahl), weitere Telefonnummern/E-Mails bei Bedarf,
 * Schnellknöpfe Anrufen / E-Mail / Karte (bei mehreren Nummern mit Auswahl), Geburtstage rechnen. */
window.Kontakt = (() => {
  // ---------- Datum ----------
  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  /** '1970-11-10' → '10.11.1970' */
  const de = (iso) => { const m = ISO.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
  const gueltig = (j, m, t) => { const d = new Date(j, m - 1, t); return d.getFullYear() === j && d.getMonth() === m - 1 && d.getDate() === t; };
  /** Eingabe → ISO oder '' (leer) oder null (noch unvollständig/ungültig). Versteht 10.11.1970, 10.11.70, 10111970. */
  function lesen(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s) || /^(\d{2})(\d{2})(\d{4})$/.exec(s);
    if (!m) return null;
    let j = +m[3];
    if (m[3].length === 2) { const jj = new Date().getFullYear() % 100; j += j > jj ? 1900 : 2000; }
    if (!gueltig(j, +m[2], +m[1])) return null;
    return `${j}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  /** Feld zum Eintippen: Punkte werden automatisch gesetzt, set(iso) wird bei gültigem Datum oder leerem Feld gerufen. */
  function datumFeld(inp, set) {
    inp.value = de(inp.dataset.iso || inp.value);
    inp.addEventListener('input', (e) => {
      // Punkte selbst setzen, solange im Schema TT.MM.JJJJ getippt wird (eigene Punkte wie 1.1.70 bleiben)
      if (!String(e.inputType).startsWith('delete') && /^(\d{0,2}|\d{2}\.\d{0,2}|\d{2}\.\d{2}\.?\d{0,4}|\d{3,8})$/.test(inp.value)) {
        const d = inp.value.replace(/\D/g, '').slice(0, 8);
        inp.value = d.length >= 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : d.length >= 2 ? `${d.slice(0, 2)}.${d.slice(2)}` : d;
      }
      const v = lesen(inp.value);
      inp.classList.toggle('bad', v === null && inp.value.replace(/\D/g, '').length >= 8);
      if (v !== null && (v === '' || inp.value.replace(/\D/g, '').length >= 8)) set(v);
    });
    inp.addEventListener('blur', () => {
      const v = lesen(inp.value);
      if (v === null) { inp.classList.toggle('bad', !!inp.value.trim()); return; }
      inp.classList.remove('bad'); inp.value = de(v); set(v);
    });
  }
  // ---------- Telefon mit Ländervorwahl (Standard +49) ----------
  const VORWAHLEN = [['+49', 'DE +49'], ['+43', 'AT +43'], ['+41', 'CH +41'], ['+39', 'IT +39'], ['+33', 'FR +33'], ['+31', 'NL +31'], ['+32', 'BE +32'], ['+48', 'PL +48'], ['+420', 'CZ +420'], ['+36', 'HU +36'], ['+40', 'RO +40'], ['+385', 'HR +385'], ['+381', 'RS +381'], ['+387', 'BA +387'], ['+90', 'TR +90'], ['+30', 'GR +30'], ['+34', 'ES +34'], ['+44', 'GB +44']];
  /** Gespeicherte Nummer in Vorwahl und Rest teilen. Ohne + gilt +49 (alte Einträge wie „0711 …“ bleiben, wie sie sind). */
  const telTeilen = (s) => { const t = String(s || '').trim(); const v = VORWAHLEN.map((x) => x[0]).sort((a, b) => b.length - a.length).find((x) => t.startsWith(x)); return v ? [v, t.slice(v.length).trim()] : ['+49', t]; };
  const telInput = (id, wert) => { const [v, r] = telTeilen(wert); return `<div class="tel-in" id="${id}"><select data-tv aria-label="Ländervorwahl">${VORWAHLEN.map(([x, l]) => `<option value="${x}" ${x === v ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="tel" data-tn value="${esc(r)}" autocomplete="off" placeholder="711 123456"></div>`; };
  /** Ergebnis z. B. „+49 711 123456“; die führende 0 fällt weg. Leeres Feld = leer. */
  function telBinden(el, set) {
    if (!el) return;
    const lesen = () => { const n = $('[data-tn]', el).value.trim().replace(/^0+/, ''); return n ? `${$('[data-tv]', el).value} ${n}` : ''; };
    $('[data-tn]', el).oninput = () => set(lesen());
    $('[data-tv]', el).onchange = () => set(lesen());
  }
  const datumInput = (id, iso, ph = 'TT.MM.JJJJ') => `<input type="text" id="${id}" data-iso="${esc(iso || '')}" inputmode="numeric" autocomplete="off" placeholder="${ph}" maxlength="10">`;

  /** Tage bis zum nächsten Jahrestag (0 = heute) oder null. */
  function bisTag(iso) {
    const m = ISO.exec(iso || ''); if (!m) return null;
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    let g = new Date(heute.getFullYear(), +m[2] - 1, +m[3]);
    if (g < heute) g = new Date(heute.getFullYear() + 1, +m[2] - 1, +m[3]);
    return Math.round((g - heute) / 864e5);
  }
  /** Alter heute. */
  function alter(iso) {
    const m = ISO.exec(iso || ''); if (!m) return null;
    const h = new Date(); let a = h.getFullYear() - +m[1];
    if (h.getMonth() + 1 < +m[2] || (h.getMonth() + 1 === +m[2] && h.getDate() < +m[3])) a--;
    return a >= 0 && a < 130 ? a : null;
  }
  const tageText = (n) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

  // ---------- Weitere Telefonnummern und E-Mails ----------
  // Liste [{ id, art: 'tel'|'mail', label, wert }]. Ohne Einträge sieht man nur den kleinen Knopf.
  // Bleibt dieselbe Liste mit denselben Einträgen (die Eingabefelder halten Verweise darauf)
  function norm(list) {
    if (!Array.isArray(list)) return [];
    for (let i = list.length - 1; i >= 0; i--) if (!list[i] || typeof list[i] !== 'object') list.splice(i, 1);
    for (const x of list) { x.id ||= uid(); x.art = x.art === 'mail' ? 'mail' : 'tel'; x.label = String(x.label ?? ''); x.wert = String(x.wert ?? ''); }
    return list;
  }
  const weitereHtml = () => `<div class="wlist" data-wlist></div><button type="button" class="link-add" data-wadd>${icon('plus')} Weitere Nummer oder E-Mail</button>`;
  /** box = Element mit weitereHtml(); list wird direkt verändert; persist() nach jeder Änderung. */
  function weitereBinden(box, list, persist) {
    const el = $('[data-wlist]', box);
    const render = () => {
      el.innerHTML = list.map((x) => `<div class="wrow" data-wid="${x.id}">
        <select data-w="art" aria-label="Art"><option value="tel" ${x.art === 'tel' ? 'selected' : ''}>Telefon</option><option value="mail" ${x.art === 'mail' ? 'selected' : ''}>E-Mail</option></select>
        <input type="text" data-w="label" value="${esc(x.label)}" placeholder="z. B. Mobil, Büro, Frau" autocomplete="off">
        <input type="${x.art === 'mail' ? 'email' : 'tel'}" data-w="wert" value="${esc(x.wert)}" placeholder="${x.art === 'mail' ? 'name@beispiel.de' : '0171 …'}" autocomplete="off">
        <button type="button" class="icon-btn" data-wdel aria-label="Entfernen">${icon('x')}</button></div>`).join('');
      $$('[data-wid]', el).forEach((row) => {
        const x = list.find((y) => y.id === row.dataset.wid);
        $$('[data-w]', row).forEach((inp) => (inp[inp.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => {
          x[inp.dataset.w] = inp.value; persist();
          if (inp.dataset.w === 'art') render();
        }));
        $('[data-wdel]', row).onclick = () => { list.splice(list.indexOf(x), 1); persist(); render(); };
      });
    };
    render();
    $('[data-wadd]', box).onclick = () => {
      const art = list.length && list[list.length - 1].art === 'tel' && list.filter((x) => x.art === 'tel').length > list.filter((x) => x.art === 'mail').length ? 'mail' : 'tel';
      list.push({ id: uid(), art, label: '', wert: '' }); persist(); render();
      $$('[data-w="wert"]', el).pop()?.focus();
    };
  }

  // ---------- Weitere Nummern direkt am Feld (Wunsch Felix): kleines Plus neben „Telefon“ bzw. „E-Mail“ ----------
  // Gleiche Liste wie oben (k.weitere). Bezeichnungen zur Wahl aus den Vorgaben 'telArten' / 'mailArten'.
  /** Überschrift mit kleinem Plus rechts. art: 'tel' | 'mail' */
  const mehrLabel = (text, art) => `<label class="lab-plus"><span>${esc(text)}</span><button type="button" class="plus-mini" data-mehr="${art}" aria-label="${art === 'tel' ? 'Weitere Telefonnummer' : 'Weitere E-Mail'}">+</button></label>`;
  /** box: leeres Element unter dem Hauptfeld · plus: der Knopf aus mehrLabel · list wird direkt verändert. */
  function mehrBinden(box, plus, list, art, persist) {
    if (!box) return;
    const arten = () => vorgabe(art === 'tel' ? 'telArten' : 'mailArten') || [];
    const render = () => {
      const eigene = list.filter((x) => x.art === art);
      box.innerHTML = eigene.map((x) => `<div class="mehr-z" data-wid="${x.id}">
        <select data-w="label" aria-label="Bezeichnung">${[...new Set([...arten(), ...(x.label ? [x.label] : [])])].map((a) => `<option ${a === x.label ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <input type="${art === 'mail' ? 'email' : 'tel'}" data-w="wert" value="${esc(x.wert)}" placeholder="${art === 'mail' ? 'name@beispiel.de' : '0171 1234567'}" autocomplete="off" ${art === 'mail' ? 'inputmode="email"' : ''}>
        <button type="button" class="icon-btn" data-wdel aria-label="Entfernen">${icon('x')}</button></div>`).join('');
      $$('[data-wid]', box).forEach((row) => {
        const x = list.find((y) => y.id === row.dataset.wid);
        $('[data-w="label"]', row).onchange = (e) => { x.label = e.target.value; persist(); };
        $('[data-w="wert"]', row).oninput = (e) => { x.wert = e.target.value; persist(); };
        $('[data-wdel]', row).onclick = () => { if (x.wert.trim() && !confirm(`„${x.label}: ${x.wert}“ entfernen?`)) return; list.splice(list.indexOf(x), 1); persist(); render(); };
      });
    };
    render();
    if (plus) plus.onclick = () => {
      const benutzt = list.filter((x) => x.art === art).map((x) => x.label);
      list.push({ id: uid(), art, label: arten().find((a) => !benutzt.includes(a)) || arten()[0] || '', wert: '' });
      persist(); render();
      $$('[data-w="wert"]', box).pop()?.focus();
    };
  }

  // ---------- Schnellknöpfe ----------
  const mapLink = (a) => 'https://maps.apple.com/?q=' + encodeURIComponent(String(a || '').split(/\s*,\s*|\n/).filter(Boolean).join(', '));
  /** tels/mails: [{ label, wert }] – bei mehr als einem Eintrag fragt der Knopf, welcher. */
  function aktionen({ tels = [], mails = [], adresse = '' }) {
    tels = tels.filter((x) => x.wert.trim()); mails = mails.filter((x) => x.wert.trim());
    const b = [
      tels.length && `<button type="button" class="kd-a" data-ka="tel">${icon('phone')}<span>Anrufen${tels.length > 1 ? ` (${tels.length})` : ''}</span></button>`,
      mails.length && `<button type="button" class="kd-a" data-ka="mail">${icon('mail')}<span>E-Mail${mails.length > 1 ? ` (${mails.length})` : ''}</span></button>`,
      adresse.trim() && `<a class="kd-a" href="${esc(mapLink(adresse))}" target="_blank" rel="noopener">${icon('map')}<span>Karte</span></a>`,
    ].filter(Boolean);
    return { html: b.length ? `<div class="kd-row">${b.join('')}</div>` : '', binden: (el) => {
      const los = async (list, pre, ic) => {
        let x = list[0];
        if (list.length > 1) { const v = await sheet(pre === 'tel' ? 'Welche Nummer?' : 'Welche E-Mail?', list.map((y, i) => ({ label: y.wert, sub: y.label, icon: icon(ic), value: String(i) }))); if (v === null) return; x = list[+v]; }
        location.href = pre === 'tel' ? telLink(x.wert) : 'mailto:' + x.wert.trim();
      };
      if ($('[data-ka="tel"]', el)) $('[data-ka="tel"]', el).onclick = () => los(tels, 'tel', 'phone');
      if ($('[data-ka="mail"]', el)) $('[data-ka="mail"]', el).onclick = () => los(mails, 'mail', 'mail');
    } };
  }

  /** Auswahl „Nur gratulieren“ / „Mit Geschenk“ für einen Geburtstag. Leer = Standard aus den Einstellungen. */
  const gebArt = (v) => v || vorgabe('gebArtStandard') || 'gratulieren';
  const gebArtSelect = (v, id = '') => `<select data-gebart ${id ? `id="${id}"` : ''}>${[['gratulieren', 'Nur gratulieren'], ['geschenk', 'Mit Geschenk (Erinnerung vorher)']].map(([x, n]) => `<option value="${x}" ${gebArt(v) === x ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  return { mehrLabel, mehrBinden, telInput, telBinden, gebArt, gebArtSelect, de, lesen, datumFeld, datumInput, bisTag, alter, tageText, norm, weitereHtml, weitereBinden, aktionen, telLink, mapLink };
})();
