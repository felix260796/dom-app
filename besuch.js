'use strict';
/* DOM – Vor-Ort-Termin rund um das Gespräch (seit v117, Runde 13, P4 Teil 1).
 * Im Reiter „Vor Ort“ des Angebotsablaufs:
 *  - oben eine Zeile mit „Briefing anhören“ (Apple-Stimme, offline, ohne KI), „Ich komme später“ (SMS/WhatsApp/Mail mit fertigem Text),
 *    „So arbeiten wir“ (Seite zum Zeigen, Text aus Vorgabe 'soArbeitenWir') und dem Stand des Abgleichs („alles auf dem Gerät“);
 *  - „Verkaufsinfos (intern)“: Felder aus Vorgabe 'verkaufFelder', gespeichert in w.verkauf = { Feldname: Text };
 *  - „Termin abschließen“: Frist fürs Angebot (Vorgabe 'angebotFristTage' Werktage) → To-do, danach Danke-Nachricht (Vorgabe 'textDanke').
 *    w.vorOrt.abschluss = { t, wer, frist } bzw. { t, wer, ausgefallen: true }.
 *  - Einverständnis zur Aufnahme (Vorgabe 'aufnahmeEinverstaendnis'): Besuch.einverstanden(w) vor dem Start in voice.js,
 *    vermerkt in w.gespraech.einverstanden = { t, wer }. */
window.Besuch = (() => {
  const team = () => window.Kalender?.team?.() || [];
  const ich = () => team().find((p) => p.id === window.Kalender?.wer?.()) || null;
  const meinName = () => ich()?.name || '';
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deDatum = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
  /** n Werktage (Mo–Fr) ab heute. */
  function werktage(n) { const d = new Date(); let r = Math.max(0, +n || 0); while (r > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) r--; } return iso(d); }
  const kundeVon = (w) => (w?.kundeId && window.Kunden?.byId(w.kundeId)) || null;
  const objektVon = (w, k) => (k && w.objektId && Kunden.objekt(k, w.objektId)) || null;
  const anrede = (k) => (k ? Kunden.briefAnrede(k) : 'Guten Tag,');
  const firma = () => String(window.PL?.einstellungen?.firma || 'Dom Projektmanagement GmbH').split('\n')[0];
  const text = (key, werte) => vorgabeText(key, { anrede: '', name: meinName(), firma: firma(), ...werte }).replace(/\n\s*\n/g, '\n').trim();

  // ---------- Nachricht an den Kunden: SMS, WhatsApp oder Mail (Felix tippt nur noch „Senden“) ----------
  const istIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function oeffnen(url) {
    if (/^https?:/.test(url)) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    else location.href = url;
  }
  async function nachricht(k, titel, inhalt, betreff = '') {
    const tels = k ? Kontakt.nummernVon(k, 'tel').filter((x) => String(x.wert).trim()) : [];
    const mails = k ? Kontakt.nummernVon(k, 'mail').filter((x) => /.+@.+\..+/.test(x.wert)) : [];
    const items = [
      ...tels.map((x, i) => ({ label: 'SMS an ' + x.wert, sub: x.label, icon: icon('phone'), value: 'sms:' + i })),
      ...tels.map((x, i) => ({ label: 'WhatsApp an ' + x.wert, sub: x.label, icon: icon('phone'), value: 'wa:' + i })),
      ...mails.map((x, i) => ({ label: 'E-Mail an ' + x.wert, sub: x.label, icon: icon('mail'), value: 'mail:' + i })),
      { label: 'Text kopieren', sub: 'selbst einfügen, wo du willst', icon: icon('file'), value: 'kopie' },
    ];
    const v = await sheet(titel, [{ label: inhalt, sub: 'So geht die Nachricht raus. Tippen zum Ändern.', icon: icon('edit'), value: 'text' }, ...items]);
    if (!v) return false;
    if (v === 'text') { const t = prompt('Nachricht', inhalt); return t === null ? false : nachricht(k, titel, t.trim() || inhalt, betreff); }
    const [art, i] = v.split(':');
    const nr = (x) => telLink(x).slice(4); // +49…
    if (art === 'sms') oeffnen(`sms:${nr(tels[+i].wert)}${istIos() ? '&' : '?'}body=${encodeURIComponent(inhalt)}`);
    else if (art === 'wa') oeffnen(`https://wa.me/${nr(tels[+i].wert).replace('+', '')}?text=${encodeURIComponent(inhalt)}`);
    else if (art === 'mail') oeffnen(`mailto:${mails[+i].wert.trim()}?subject=${encodeURIComponent(betreff || titel)}&body=${encodeURIComponent(inhalt)}`);
    else { try { await navigator.clipboard.writeText(inhalt); toast('Text kopiert'); } catch { prompt('Text zum Kopieren', inhalt); } }
    return true;
  }

  // ---------- Ich komme später ----------
  async function spaeter(w) {
    const k = kundeVon(w); if (!k) return toast('Bitte zuerst einen Kunden zuordnen.');
    const min = (vorgabe('spaeterMinuten') || ['10', '15', '30']).map((x) => String(x).trim()).filter(Boolean);
    const v = await sheet('Wie viel später?', min.map((m) => ({ label: `etwa ${m} Minuten`, value: m })), { text: 'Andere Zeit in Minuten' });
    const m = typeof v === 'string' ? v : String(v?.text || '').replace(/\D/g, '');
    if (!m) return;
    await nachricht(k, 'Ich komme später', text('textSpaeter', { anrede: anrede(k), minuten: m }), 'Kleine Verspätung');
  }

  // ---------- Briefing anhören (eingebaute Stimme, offline, ohne KI) ----------
  /** Nummern Ziffer für Ziffer, damit „1001-01-01A“ nicht als Zahl gelesen wird. */
  const ZIFFER = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
  const ziffern = (s) => String(s || '').split(/[-./]/).map((t) => t.split('').map((c) => (/\d/.test(c) ? ZIFFER[+c] : c.toUpperCase())).join(' ')).join(', ');
  function naechsterTermin(w) {
    if (!window.Kalender?.eintraege) return null;
    const heute = iso(new Date()), bis = iso(new Date(Date.now() + 60 * 864e5));
    return Kalender.eintraege(heute, bis, { filter: false }).filter((t) => t.typ === 'termin' && (t.projektId === w.id || (!t.projektId && w.kundeId && t.kundeId === w.kundeId)))
      .sort((a, b) => (a.datum + (a.von || '')).localeCompare(b.datum + (b.von || '')))[0] || null;
  }
  async function briefingText(w) {
    const k = kundeVon(w), o = objektVon(w, k), t = naechsterTermin(w);
    const s = [];
    if (t) s.push(`Termin ${t.datum === iso(new Date()) ? 'heute' : deDatum(t.datum)}${t.von ? ` um ${t.von} Uhr` : ''}${t.titel ? `: ${t.titel}` : ''}.`);
    if (k) s.push(`Kunde: ${Kunden.name(k)}${k.nr ? `, Kundennummer ${ziffern(k.nr)}` : ''}.`);
    if (k?.art === 'weg' && window.Kunden.hvVon?.(k)) s.push(`Eigentümergemeinschaft, Verwaltung ${Kunden.name(Kunden.hvVon(k))}.`);
    if (w.nr) s.push(`Vorgang ${ziffern(w.nr)}.`);
    if (w.titel) s.push(`Es geht um: ${w.titel}.`);
    const adr = o ? Kunden.objektText(o) : w.address;
    if (adr) s.push(`Adresse: ${adr}.`);
    if (o) {
      const an = [o.klingel && `Klingel ${o.klingel}`, o.etage && `Etage ${o.etage}`, o.aufzug && `Aufzug ${o.aufzug}`, o.parken && `Parken: ${o.parken}`, o.schluessel && `Schlüssel: ${o.schluessel}`].filter(Boolean);
      if (an.length) s.push(an.join('. ') + '.');
      const vo = (o.kontakte || []).filter((c) => c.name).map((c) => `${c.name}${c.rolle ? ` (${c.rolle})` : ''}`);
      if (vo.length) s.push(`Vor Ort: ${vo.join(', ')}.`);
    }
    const anl = String(w.vorOrt?.notiz || '').trim() || String(k?.notiz || '').trim().split('\n').filter(Boolean).slice(-2).join(' ');
    if (anl) s.push(`Anliegen: ${anl}${/[.!?]$/.test(anl) ? '' : '.'}`);
    if (k) {
      const ang = (await projectIndex().catch(() => [])).filter((x) => x.kind === 'wohnung' && x.kundeId === k.id).length;
      if (ang > 1) s.push(`Mit diesem Kunden gibt es schon ${ang} Vorgänge.`);
      const pers = (k.personen || []).filter((p) => p.rolle || p.notiz).map((p) => [Kunden.personName(p) || p.vorname, p.rolle, p.notiz].filter(Boolean).join(', '));
      if (pers.length) s.push(`Persönliches: ${pers.join('. ')}.`);
      if (k.empfohlenVon) s.push('Kam auf Empfehlung.');
    }
    const subs = (t?.partnerIds || [t?.partnerId]).filter(Boolean).map((id) => window.Partner?.byId(id)).filter(Boolean).map((p) => Partner.titel(p));
    if (subs.length) s.push(`Mit dabei: ${subs.join(', ')}.`);
    const v = verkaufListe(w).filter(([, x]) => x);
    if (v.length) s.push(v.map(([f, x]) => `${f}: ${x}`).join('. ') + '.');
    return s.join(' ');
  }
  let spricht = false;
  function vorlesen(txt) {
    const S = window.speechSynthesis;
    if (!S || !window.SpeechSynthesisUtterance) return false;
    S.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = 'de-DE'; u.rate = +vorgabe('briefingTempo') || 1;
    const stimme = S.getVoices().find((v) => /^de/i.test(v.lang) && /enhanced|premium|Anna|Helena|Markus/i.test(v.name)) || S.getVoices().find((v) => /^de/i.test(v.lang));
    if (stimme) u.voice = stimme;
    u.onend = u.onerror = () => { spricht = false; const b = $('#beBrief'); if (b) b.querySelector('span').textContent = 'Briefing anhören'; };
    spricht = true; S.speak(u);
    return true;
  }
  async function briefing(w) {
    const txt = await briefingText(w);
    if (!txt) return toast('Zu diesem Termin ist noch nichts eingetragen.');
    if (spricht) { window.speechSynthesis?.cancel(); spricht = false; return; }
    const ok = vorlesen(txt);
    const b = $('#beBrief'); if (ok && b) b.querySelector('span').textContent = 'Stopp';
    const v = await sheet('Briefing', [{ label: txt, sub: ok ? 'Wird vorgelesen' : 'Vorlesen geht auf diesem Gerät nicht', icon: icon('mic'), value: 'x' }, ...(ok ? [{ label: 'Vorlesen beenden', icon: icon('x'), value: 'stop' }] : [])]);
    if (v === 'stop' || v === null) { window.speechSynthesis?.cancel(); spricht = false; if (b) b.querySelector('span').textContent = 'Briefing anhören'; }
  }

  // ---------- So arbeiten wir (Seite zum Zeigen beim Kunden) ----------
  function soArbeiten() {
    const roh = String(vorgabeText('soArbeitenWir') || '').trim();
    if (!roh) return toast('Der Text steht noch nicht in den Einstellungen (Abläufe & Listen).');
    // Absätze durch Leerzeile; die erste Zeile eines Absatzes ist die Überschrift
    const teile = roh.split(/\n\s*\n/).map((a) => a.split('\n')).map(([h, ...r]) => `<section><h3>${esc(h)}</h3>${r.length ? `<p>${esc(r.join(' '))}</p>` : ''}</section>`).join('');
    const bg = document.createElement('div');
    bg.className = 'so-voll';
    bg.innerHTML = `<div class="so-kopf"><b>So arbeiten wir</b><button type="button" class="icon-btn" data-x aria-label="Schließen">${icon('x')}</button></div><div class="so-inhalt"><p class="so-firma">${esc(firma())}</p>${teile}</div>`;
    document.body.appendChild(bg);
    $('[data-x]', bg).onclick = () => bg.remove();
  }

  // ---------- Stand des Abgleichs: Ist alles für den Termin auf dem Gerät? ----------
  function abgleichZeile() {
    const S = window.Sync;
    if (!S?.active?.()) return '';
    const n = S.pending?.() || 0, st = S.status?.() || {};
    if (st.ok === false) return `<p class="hint be-sync warn">${icon('cloud')} Abgleich gerade nicht möglich. Was du hier machst, bleibt auf dem Gerät und geht später hoch.</p>`;
    return `<p class="hint be-sync">${icon('cloud')} ${n ? `${n} Änderung${n === 1 ? '' : 'en'} noch nicht abgeglichen. Alles Gespeicherte liegt auf dem Gerät.` : 'Alles abgeglichen und auf dem Gerät, geht auch ohne Netz.'}</p>`;
  }

  // ---------- Verkaufsinfos (intern) ----------
  const verkaufFelder = () => (vorgabe('verkaufFelder') || []).map((x) => String(x).trim()).filter(Boolean);
  const verkaufListe = (w) => verkaufFelder().map((f) => [f, String(w.verkauf?.[f] || '').trim()]);
  function verkaufHtml(w) {
    const f = verkaufListe(w); if (!f.length) return '';
    const n = f.filter(([, x]) => x).length, z = w.gespraech?.zus;
    return `<details class="more card be-verk" ${verkOffen.has(w.id) ? 'open' : ''}><summary>${icon('user')}<span>Verkaufsinfos (intern)<small>${n ? `${n} von ${f.length} eingetragen` : 'Wer entscheidet, Budget, Zeitrahmen … nur für euch'}</small></span>${icon('chevron', 'more-chev')}</summary>
      ${f.map(([name, x], i) => `<label>${esc(name)}</label><input type="text" data-verk="${i}" value="${esc(x)}" autocomplete="off">`).join('')}
      ${z?.budget_termin ? `<p class="hint">Aus dem Gespräch: ${esc(z.budget_termin)}</p>` : ''}
      <p class="hint">Steht nie im Angebot. Die Felder stellst du unter Einstellungen › Abläufe & Listen ein.</p></details>`;
  }
  const verkOffen = new Set();

  // ---------- Termin abschließen ----------
  function abschlussHtml(w) {
    const a = w.vorOrt?.abschluss;
    if (a) return `<div class="card be-ab fertig"><p>${icon('check')}<span><b>${a.ausgefallen ? 'Termin hat nicht stattgefunden' : 'Termin abgeschlossen'}</b> am ${esc(new Date(a.t).toLocaleDateString('de-DE'))}${a.wer ? ` (${esc(a.wer)})` : ''}${a.frist ? `. Angebot kommt bis ${esc(deDatum(a.frist))}.` : '.'}</span></p>
      <div class="be-ab-k"><button type="button" class="btn secondary small" id="beDanke">${icon('mail')} Danke-Nachricht</button><button type="button" class="btn secondary small" id="beAbAuf">Wieder öffnen</button></div></div>`;
    return `<div class="card be-ab"><b>Termin abschließen</b><span class="muted">Legt fest, bis wann das Angebot kommt, und erinnert daran. Danach Danke-Nachricht mit einem Tipp.</span>
      <button type="button" class="btn block" id="beAb">${icon('check')} Termin abschließen</button>
      <button type="button" class="link-add" id="beAus">Termin hat nicht stattgefunden</button></div>`;
  }
  async function abschliessen(w, speichern) {
    const k = kundeVon(w), n = +vorgabe('angebotFristTage') || 5;
    const opts = [n, n + 5, Math.max(1, n - 2)].filter((x, i, a) => a.indexOf(x) === i).map((x) => ({ label: `bis ${deDatum(werktage(x))}`, sub: `${x} Werktage`, value: werktage(x) }));
    const v = await sheet('Bis wann kommt das Angebot?', opts, { text: 'Anderes Datum, z. B. 28.11.' });
    let frist = typeof v === 'string' ? v : '';
    if (v && typeof v === 'object') { const m = String(v.text || '').match(/(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/); if (m) { const j = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear()); frist = `${j}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; } }
    if (!frist) return;
    w.vorOrt = { ...(w.vorOrt || {}), abschluss: { t: Date.now(), wer: meinName().split(' ')[0], frist } };
    await speichern();
    await window.Todos?.anlegen({ text: `Angebot an ${k ? Kunden.name(k) : w.customer || 'Kunde'} schicken${w.titel ? ` (${w.titel})` : ''}`, faellig: frist, prio: 'hoch', wer: window.Kalender?.wer?.() || '', bezug: { kundeId: w.kundeId || '', vorgangId: w.id }, art: 'angebotFrist', schluessel: `angebotFrist:${w.id}:${frist}` });
    toast('Termin abgeschlossen, To-do fürs Angebot angelegt');
    if (k && vorgabe('dankeFragen') !== 'nein') await danke(w);
  }
  async function ausgefallen(w, speichern) {
    const k = kundeVon(w);
    if (!confirm('Termin hat nicht stattgefunden? DOM legt ein To-do an, einen neuen Termin zu vereinbaren.')) return;
    w.vorOrt = { ...(w.vorOrt || {}), abschluss: { t: Date.now(), wer: meinName().split(' ')[0], ausgefallen: true } };
    await speichern();
    await window.Todos?.anlegen({ text: `Neuen Termin mit ${k ? Kunden.name(k) : w.customer || 'Kunde'} vereinbaren`, faellig: werktage(1), prio: 'hoch', wer: window.Kalender?.wer?.() || '', bezug: { kundeId: w.kundeId || '', vorgangId: w.id }, art: 'terminNeu', schluessel: `terminNeu:${w.id}:${iso(new Date())}` });
    toast('To-do angelegt: neuen Termin vereinbaren');
  }
  async function danke(w) {
    const k = kundeVon(w); if (!k) return;
    const f = w.vorOrt?.abschluss?.frist;
    await nachricht(k, 'Danke-Nachricht', text('textDanke', { anrede: anrede(k), frist: f ? deDatum(f) : 'in den nächsten Tagen' }), 'Vielen Dank für Ihre Zeit');
  }

  // ---------- Einverständnis zur Aufnahme ----------
  /** Vor dem Start: true = darf aufnehmen. Einmal je Vorgang gefragt, vermerkt mit Zeit und Person. */
  async function einverstanden(w) {
    if (!w || vorgabe('aufnahmeEinverstaendnis') === 'nein') return true;
    if (w.gespraech?.einverstanden?.t) return true;
    const v = await sheet('Ist der Kunde mit der Aufnahme einverstanden?', [
      { label: 'Ja, einverstanden', sub: 'Wird mit Uhrzeit und deinem Namen vermerkt', icon: icon('check'), value: 'ja' },
      { label: 'Nein, nicht aufnehmen', icon: icon('x'), value: 'nein' },
    ]);
    if (v !== 'ja') { if (v === 'nein') toast('Keine Aufnahme. Notizen gehen über „Was soll gemacht werden?“ oder das Mikrofon der Tastatur.', 5000); return false; }
    w.gespraech = { ...(w.gespraech || {}), einverstanden: { t: Date.now(), wer: meinName().split(' ')[0] } };
    await window.Projekt.save(w);
    return true;
  }
  const einverstandenText = (w) => { const e = w.gespraech?.einverstanden; return e?.t ? `Kunde mit Aufnahme einverstanden: ${new Date(e.t).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}${e.wer ? ` (gefragt von ${e.wer})` : ''}` : ''; };

  // ---------- Reiter „Vor Ort“: Bausteine und Bindung ----------
  function leiste(w) {
    return `<div class="be-leiste">
      <button type="button" class="qchip" id="beBrief">${icon('mic')}<span>Briefing anhören</span></button>
      <button type="button" class="qchip" id="beSpaet">${icon('calendar')}<span>Ich komme später</span></button>
      ${String(vorgabe('soArbeitenWir') || '').trim() ? `<button type="button" class="qchip" id="beSo">${icon('book')}<span>So arbeiten wir</span></button>` : ''}
    </div>${abgleichZeile()}`;
  }
  function bind(w, neu) {
    const speichern = async () => { if (w.isNew) delete w.isNew; await window.Projekt.save(w); };
    if ($('#beBrief')) $('#beBrief').onclick = () => briefing(w);
    if ($('#beSpaet')) $('#beSpaet').onclick = () => spaeter(w);
    if ($('#beSo')) $('#beSo').onclick = () => soArbeiten();
    $$('[data-verk]').forEach((i) => (i.onchange = async () => { const f = verkaufFelder()[+i.dataset.verk]; w.verkauf = { ...(w.verkauf || {}), [f]: i.value.trim() }; await speichern(); }));
    const vd = $('.be-verk'); if (vd) vd.ontoggle = () => (vd.open ? verkOffen.add(w.id) : verkOffen.delete(w.id));
    if ($('#beAb')) $('#beAb').onclick = async () => { await abschliessen(w, speichern); neu?.(); };
    if ($('#beAus')) $('#beAus').onclick = async () => { await ausgefallen(w, speichern); neu?.(); };
    if ($('#beDanke')) $('#beDanke').onclick = () => danke(w);
    if ($('#beAbAuf')) $('#beAbAuf').onclick = async () => { if (w.vorOrt) delete w.vorOrt.abschluss; await speichern(); neu?.(); };
  }
  return { leiste, verkaufHtml, abschlussHtml, bind, einverstanden, einverstandenText, briefingText, nachricht, werktage, soArbeiten };
})();
