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

  // ---------- Nachricht an Kunde, Partner oder Person: Mail, WhatsApp, SMS, Brief als PDF oder kopieren (Felix tippt nur noch „Senden“) ----------
  const istIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function oeffnen(url) {
    if (/^https?:/.test(url)) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    else location.href = url;
  }
  // ---------- Versandweg für jede Nachricht (v143, GRUNDREGEL: nichts geht ohne Tipp raus) ----------
  // an = Kunde, Partner oder Person ({ telefon, telArt, email, mailArt, weitere }); Kontakt.nummernVon liest alle gleich.
  // opt: { mail: bevorzugte Adresse (z. B. Kunden.angebotMail), kurz: kürzerer Text für SMS/WhatsApp, anschrift: [Zeilen] für den Brief,
  //        datei: Name des PDF }. Rückgabe: gewählter Weg 'sms' | 'whatsapp' | 'mail' | 'pdf' | 'kopie' oder false.
  const WEG_NAME = { sms: 'SMS', whatsapp: 'WhatsApp', mail: 'E-Mail', pdf: 'Brief (PDF)', kopie: 'Text kopiert' };
  const mailOk = (s) => /.+@.+\..+/.test(String(s || '').trim());
  function anschriftVon(an) {
    if (!an) return [];
    if (Array.isArray(an.objekte) && window.Kunden) return Kunden.postanschrift(an) || [Kunden.name(an)].filter(Boolean);
    if (an.kind === 'partner') return [window.Partner?.titel?.(an) || an.firma || '', ...(window.Kunden ? Kunden.zeilen(an.anschrift) : [])].filter(Boolean);
    return [[an.anrede === 'Herr' || an.anrede === 'Frau' ? an.anrede : '', an.vorname, an.name].filter(Boolean).join(' ')].filter(Boolean);
  }
  /** Einfacher Brief mit Briefkopf wie im Angebot (Logo oder Firmenname, Absenderzeile, Anschrift, Datum, Betreff, Text). */
  async function brief({ anschrift = [], betreff = '', text: inhalt = '', datei = 'Brief' } = {}) {
    let E = {}; try { E = (await window.Angebot._intern.preisliste()).einstellungen || {}; } catch {}
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 20, R = 192, H = 297, NAVY = [30, 53, 80];
    const logo = state.settings.logo;
    const kopf = async () => {
      if (logo) { try { await addFit(doc, logo, R - 55, 10, 55, 22, mimeOf(logo) === 'image/png' ? 'PNG' : 'JPEG'); } catch (e) { console.warn('Logo', e); } }
      else { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); doc.text(String(E.firma || firma()), R, 20, { align: 'right' }); }
      doc.setFont('helvetica', 'normal');
    };
    await kopf();
    doc.setFontSize(7.5); doc.setTextColor(120); doc.text([E.firma || firma(), E.strasse, E.ort].filter(Boolean).join(' · '), M, 47);
    doc.setDrawColor(200); doc.line(M, 48.5, M + 85, 48.5);
    doc.setFontSize(10.5); doc.setTextColor(30);
    anschrift.forEach((l, i) => doc.text(String(l), M, 55 + i * 5));
    doc.setFontSize(9);
    const meta = [['Datum', new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })], ['Telefon', E.telefon], ['E-Mail', E.email]].filter((x) => x[1]);
    meta.forEach(([k, v], i) => { doc.setTextColor(120); doc.text(k, 128, 52 + i * 4.6); doc.setTextColor(30); doc.text(String(v), 158, 52 + i * 4.6); });
    let y = Math.max(92, 55 + anschrift.length * 5 + 12);
    if (betreff) { doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); const b = doc.splitTextToSize(betreff, R - M); doc.text(b, M, y); y += 6 * b.length + 4; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(30);
    for (const z of String(inhalt).split('\n')) {
      const ls = z.trim() ? doc.splitTextToSize(z, R - M) : [''];
      for (const l of ls) { if (y > H - 25) { doc.addPage(); await kopf(); doc.setFontSize(10.5); doc.setTextColor(30); y = 34; } doc.text(l, M, y); y += 5; }
    }
    const name = String(datei || 'Brief').replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.pdf';
    return new File([doc.output('blob')], name, { type: 'application/pdf' });
  }
  async function nachricht(an, titel, inhalt, betreff = '', opt = {}) {
    const tels = an ? Kontakt.nummernVon(an, 'tel').filter((x) => String(x.wert || '').trim()) : [];
    let mails = an ? Kontakt.nummernVon(an, 'mail').filter((x) => mailOk(x.wert)) : [];
    if (mailOk(opt.mail)) mails = [{ label: opt.mailLabel || 'bevorzugt', wert: String(opt.mail).trim() }, ...mails.filter((x) => x.wert.trim().toLowerCase() !== String(opt.mail).trim().toLowerCase())];
    const kurz = opt.kurz || inhalt;
    const items = [
      ...mails.map((x, i) => ({ label: 'E-Mail an ' + x.wert, sub: x.label, icon: icon('mail'), value: 'mail:' + i })),
      ...tels.map((x, i) => ({ label: 'WhatsApp an ' + x.wert, sub: x.label, icon: icon('phone'), value: 'wa:' + i })),
      ...tels.map((x, i) => ({ label: 'SMS an ' + x.wert, sub: x.label, icon: icon('phone'), value: 'sms:' + i })),
      { label: 'Als PDF (Drucken oder Post)', sub: 'Brief mit Briefkopf zum Ausdrucken, Speichern oder Teilen', icon: icon('file'), value: 'pdf' },
      { label: 'Text kopieren', sub: 'selbst einfügen, wo du willst', icon: icon('file'), value: 'kopie' },
    ];
    const v = await sheet(titel, [{ label: inhalt, sub: kurz !== inhalt ? 'So geht die Mail bzw. der Brief raus, per WhatsApp und SMS kürzer. Tippen zum Ändern.' : 'So geht die Nachricht raus. Tippen zum Ändern.', icon: icon('edit'), value: 'text' }, ...items]);
    if (!v) return false;
    if (v === 'text') { const t = prompt('Nachricht', inhalt); return t === null ? false : nachricht(an, titel, t.trim() || inhalt, betreff, { ...opt, kurz: t.trim() ? t.trim() : opt.kurz }); }
    const [art, i] = v.split(':');
    const nr = (x) => telLink(x).slice(4); // +49…
    if (art === 'sms') { oeffnen(`sms:${nr(tels[+i].wert)}${istIos() ? '&' : '?'}body=${encodeURIComponent(kurz)}`); return 'sms'; }
    if (art === 'wa') { oeffnen(`https://wa.me/${nr(tels[+i].wert).replace('+', '')}?text=${encodeURIComponent(kurz)}`); return 'whatsapp'; }
    if (art === 'mail') { oeffnen(`mailto:${mails[+i].wert.trim()}?subject=${encodeURIComponent(betreff || titel)}&body=${encodeURIComponent(inhalt)}`); return 'mail'; }
    if (art === 'pdf') {
      try { const f = await brief({ anschrift: opt.anschrift || anschriftVon(an), betreff: betreff || titel, text: inhalt, datei: opt.datei || titel }); await pdfAnsicht(f, f.name); return 'pdf'; }
      catch (e) { console.error(e); toast('Der Brief ging nicht: ' + e.message, 5000); return false; }
    }
    try { await navigator.clipboard.writeText(inhalt); toast('Text kopiert'); } catch { prompt('Text zum Kopieren', inhalt); }
    return 'kopie';
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

  // ---------- Fahrzeit mit Verkehr von hier (Runde 15, B7; nur in der App, Apple Karten) ----------
  async function fahrtZeigen(w) {
    const el = $('#beFahrt'); if (!el || !window.Geraet?.nativ?.() || w.vorOrt?.abschluss) return;
    const k = kundeVon(w), o = objektVon(w, k), adr = (o ? Kunden.objektText(o) : w.address) || '';
    if (!adr.trim()) return;
    try {
      const r = await Geraet.fahrzeit(adr); if (!r || !el.isConnected) return;
      el.innerHTML = `${icon('pin')} ${r.min} Min. Fahrt von hier mit aktuellem Verkehr (${String(r.km).replace('.', ',')} km) · <a href="${esc(routeLink(adr))}" target="_blank" rel="noopener">Route</a>`;
      el.hidden = false;
    } catch (e) { console.warn('Fahrzeit', e); }
  }

  // ---------- Reiter „Vor Ort“: Bausteine und Bindung ----------
  function leiste(w) {
    return `<div class="be-leiste">
      <button type="button" class="qchip" id="beBrief">${icon('mic')}<span>Briefing anhören</span></button>
      <button type="button" class="qchip" id="beSpaet">${icon('calendar')}<span>Ich komme später</span></button>
      ${String(vorgabe('soArbeitenWir') || '').trim() ? `<button type="button" class="qchip" id="beSo">${icon('book')}<span>So arbeiten wir</span></button>` : ''}
    </div><p class="hint be-fahrt" id="beFahrt" hidden></p>${abgleichZeile()}`;
  }
  function bind(w, neu) {
    const speichern = async () => { if (w.isNew) delete w.isNew; await window.Projekt.save(w); };
    if ($('#beBrief')) $('#beBrief').onclick = () => briefing(w);
    if ($('#beSpaet')) $('#beSpaet').onclick = () => spaeter(w);
    if ($('#beSo')) $('#beSo').onclick = () => soArbeiten();
    fahrtZeigen(w);
    $$('[data-verk]').forEach((i) => (i.onchange = async () => { const f = verkaufFelder()[+i.dataset.verk]; w.verkauf = { ...(w.verkauf || {}), [f]: i.value.trim() }; await speichern(); }));
    const vd = $('.be-verk'); if (vd) vd.ontoggle = () => (vd.open ? verkOffen.add(w.id) : verkOffen.delete(w.id));
    if ($('#beAb')) $('#beAb').onclick = async () => { await abschliessen(w, speichern); neu?.(); };
    if ($('#beAus')) $('#beAus').onclick = async () => { await ausgefallen(w, speichern); neu?.(); };
    if ($('#beDanke')) $('#beDanke').onclick = () => danke(w);
    if ($('#beAbAuf')) $('#beAbAuf').onclick = async () => { if (w.vorOrt) delete w.vorOrt.abschluss; await speichern(); neu?.(); };
  }
  return { leiste, verkaufHtml, abschlussHtml, bind, einverstanden, einverstandenText, briefingText, nachricht, brief, anschriftVon, WEG_NAME, werktage, soArbeiten };
})();
