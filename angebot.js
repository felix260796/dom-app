// DOM – Aufmaß, Angebot und Bauzeitenplan
// Baut auf app.js auf (state, kvGet/kvSet, $, esc, toast, saveProject, viewProjekt, addFit, ...).
// Preise und Kalkulation wie im Excel-Angebotstool (Preisliste + Einstellungen).
'use strict';

const Angebot = (() => {
  // Pakete: Moodboards des Raumtyps im Projekt (IDs basic/standard/premium in allen Raumtypen gleich)
  const PAKETE_STD = () => Object.entries(PKG_META).map(([id, [name, color]]) => ({ id, name, color }));
  const pakete = (p) => (p?.roomType && typeof packagesFor === 'function' ? packagesFor(p.roomType) : PAKETE_STD());

  // ---------- Zahlen ----------
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const fmtEur = (x) => x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const fmtNum = (x, d = 1) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtIn = (x) => (x || x === 0 ? String(x).replace('.', ',') : '');
  const fmtDate = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const STUECK = /^(stück|stk|pauschal|psch|tag|std\.?|h)$/i;

  // ---------- Preisliste ----------
  let PL = null; // { quelle, stand, einstellungen, positionen }
  async function preisliste() {
    if (PL) return PL;
    PL = await kvGet('preisliste');
    if (!PL) { PL = await (await fetch('data/preisliste.json')).json(); PL.stand = 'Standard (Schätzpreise)'; }
    else {
      // Eigene (Excel-)Preisliste: neue Standard-Positionen (z. B. Wärmepumpe WP-…, HZ-…) ergänzen, wenn sie fehlen
      try {
        const std = await (await fetch('data/preisliste.json')).json();
        const have = new Set(PL.positionen.map((x) => x.nr));
        for (const x of std.positionen) if (/^(WP|HZ)-/.test(x.nr) && !have.has(x.nr)) PL.positionen.push({ ...x, status: x.status || 'geschätzt' });
      } catch {}
    }
    return PL;
  }
  const pos = (nr) => PL.positionen.find((x) => x.nr === nr);
  /** Einheitspreis Kunde netto wie im Excel (Preisliste Spalte H). */
  function ep(it) {
    const S = PL.einstellungen, eigen = it.auf !== null && it.auf !== undefined;
    return r2((it.lohn * (1 + (eigen ? it.auf : S.aufLohn)) + it.mat * (1 + S.aufMat)) * (1 + (eigen ? 0 : S.wagnis)));
  }
  /** Lohnanteil je Einheit netto (Preisliste Spalte L, für § 35a EStG). */
  function lohnEp(it) {
    const S = PL.einstellungen, eigen = it.auf !== null && it.auf !== undefined;
    return r2(it.lohn * (1 + (eigen ? it.auf : S.aufLohn)) * (1 + (eigen ? 0 : S.wagnis)));
  }

  // Excel-Angebotstool einlesen (Blätter „Preisliste“ und „Einstellungen“)
  function loadXlsxLib() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = ok; s.onerror = () => fail(new Error('Excel-Leser konnte nicht geladen werden')); document.head.appendChild(s); });
  }
  async function importExcel(file) {
    await loadXlsxLib();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = (name) => { const ws = wb.Sheets[name]; if (!ws) throw new Error(`Blatt „${name}“ fehlt`); return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }); };
    // Preisliste
    const pr = rows('Preisliste');
    const hi = pr.findIndex((r) => r.some((c) => c === 'Nr') && r.some((c) => c === 'Einheit'));
    if (hi < 0) throw new Error('Kopfzeile der Preisliste nicht gefunden');
    const H = pr[hi].map((c) => String(c ?? ''));
    const col = (re) => H.findIndex((h) => re.test(h));
    const c = { nr: col(/^Nr$/), gewerk: col(/^Gewerk/), text: col(/^Arbeitsschritt/), einheit: col(/^Einheit/), lohn: col(/Sub-Lohn/), mat: col(/^Material/), auf: col(/^Aufschlag/), richtwert: col(/^Richtwert/), status: col(/^Status/) };
    const positionen = [];
    for (const r of pr.slice(hi + 1)) {
      const nr = String(r[c.nr] ?? '').trim(), text = String(r[c.text] ?? '').trim();
      if (!nr || !text || !r[c.einheit] || nr.length > 12) continue;
      const auf = c.auf >= 0 && r[c.auf] !== null && r[c.auf] !== '' ? num(r[c.auf]) : null;
      positionen.push({ nr, gewerk: String(r[c.gewerk] ?? '').trim(), text, einheit: String(r[c.einheit]).trim(), lohn: num(r[c.lohn]), mat: num(r[c.mat]), auf, richtwert: c.richtwert >= 0 ? r[c.richtwert] : null, status: c.status >= 0 ? r[c.status] : null });
    }
    if (positionen.length < 5) throw new Error('Zu wenige Positionen in der Preisliste gefunden');
    // Einstellungen (Beschriftung in Spalte A, Wert in Spalte B)
    const L = Object.fromEntries(rows('Einstellungen').filter((r) => r[0]).map((r) => [String(r[0]).trim(), r[1]]));
    const g = (k, d) => (L[k] ?? '') === '' ? d : L[k];
    const D = (await (await fetch('data/preisliste.json')).json()).einstellungen;
    const einstellungen = {
      firma: g('Firmenname', D.firma), strasse: g('Straße', D.strasse), ort: g('PLZ Ort', D.ort), telefon: String(g('Telefon', D.telefon)), email: g('E-Mail', D.email),
      ansprechpartner: g('Ansprechpartner (Standard)', D.ansprechpartner), ustid: g('USt-IdNr.', D.ustid), bank: g('Bank / IBAN', D.bank),
      aufLohn: num(g('Aufschlag auf Sub-Lohn', D.aufLohn)), aufMat: num(g('Aufschlag auf Material', D.aufMat)), wagnis: num(g('Wagnis / Unvorhergesehenes', D.wagnis)),
      mwst: num(g('Mehrwertsteuer', D.mwst)), spanne: num(g('Spanne für mündliche Preisrichtung ±', D.spanne)), gueltig: num(g('Angebot gültig (Tage)', D.gueltig)),
      hinweise: [1, 2, 3, 4].map((i) => g(`Hinweis ${i}`, '')).filter(Boolean),
      sitz: g('Sitz der Gesellschaft', D.sitz), hrb: g('Registergericht / HRB', D.hrb), gf: g('Geschäftsführer', D.gf),
      textLeistung: g('Text Leistungsumfang', D.textLeistung), textBauseits: g('Text bauseitige Leistungen', D.textBauseits), textZahlung: g('Text Zahlungsziel', D.textZahlung),
      textGewaehr: g('Text Gewährleistung', D.textGewaehr), textWiderruf: g('Text Widerruf', D.textWiderruf), textAuftrag: g('Text Auftragserteilung', D.textAuftrag),
    };
    PL = { quelle: file.name, stand: new Date().toLocaleString('de-DE'), einstellungen, positionen };
    await kvSet('preisliste', PL);
    return PL;
  }

  // ---------- Aufmaß ----------
  const BRUESTUNG = 0.9; // Standard-Brüstungshöhe Fenster
  const neuerRaum = (name = 'Badezimmer') => ({ id: uid(), name, typ: name, teile: [{ l: '', b: '' }], h: '2,50', oeff: [{ art: 'Tür', n: 1, b: '0,885', h: '2,01' }, { art: 'Fenster', n: 1, b: '1,0', h: '1,2' }], dusche: /bad/i.test(name), duschwand: /bad/i.test(name) ? '1,8' : '', umfang: '', notiz: '', skizze: '' });
  const gruppe = (typ) => (/bad|wc|dusch/i.test(typ) ? 'nass' : /k(ü|ue)che/i.test(typ) ? 'kueche' : /garten/i.test(typ) ? 'garten' : /heiz|technik/i.test(typ) ? 'technik' : /fassade|au(ß|ss)en/i.test(typ) ? 'aussen' : 'wohn');

  /** Flächen und Längen eines Raums. Zusatzflächen werden als an der kürzeren Seite angesetzt gerechnet. */
  function masse(r) {
    const teile = r.teile.map((t) => ({ l: num(t.l), b: num(t.b) })).filter((t) => t.l > 0 && t.b > 0);
    const h = num(r.h);
    const boden = teile.reduce((s, t) => s + t.l * t.b, 0);
    let umfang = teile.reduce((s, t, i) => s + 2 * (t.l + t.b) - (i ? 2 * Math.min(t.l, t.b) : 0), 0);
    if (num(r.umfang) > 0) umfang = num(r.umfang);
    const oeff = r.oeff.map((o) => ({ art: o.art, n: num(o.n), b: num(o.b), h: num(o.h), br: o.art === 'Fenster' ? BRUESTUNG : 0 })).filter((o) => o.n > 0 && o.b > 0);
    const wandbis = (x) => Math.max(0, umfang * Math.min(x, h) - oeff.reduce((s, o) => s + o.n * o.b * Math.max(0, Math.min(x, o.br + o.h) - o.br), 0));
    const tuerbreite = oeff.filter((o) => o.art === 'Tür').reduce((s, o) => s + o.n * o.b, 0);
    const duschwand = Math.min(num(r.duschwand), umfang);
    return {
      boden, decke: boden, umfang, hoehe: h, wand: wandbis(h), wandbis,
      oeffnungen: oeff.reduce((s, o) => s + o.n * o.b * o.h, 0),
      tueren: oeff.filter((o) => o.art === 'Tür').reduce((s, o) => s + o.n, 0),
      fenster: oeff.filter((o) => o.art === 'Fenster').reduce((s, o) => s + o.n, 0),
      tuerbreite, sockel: Math.max(0, umfang - tuerbreite), duschwand, dusche: r.dusche ? 1 : 0,
      // Garten mit Wärmepumpe (garten.js überträgt die Werte ins Aufmaß)
      wp: r.wp ? 1 : 0, fundament: r.wp ? Math.max(num(r.fl), 0) * Math.max(num(r.fb), 0) : 0, leitung: r.wp ? num(r.leitung) : 0,
    };
  }

  // Mengenformeln: Zahlen, Variablen aus masse(), + - * / ( ), Funktionen wandbis(x), aufrunden(x), max(a; b), min(a; b)
  const VARS = ['boden', 'decke', 'umfang', 'hoehe', 'wand', 'oeffnungen', 'tueren', 'fenster', 'tuerbreite', 'sockel', 'duschwand', 'dusche', 'wp', 'fundament', 'leitung'];
  const FUNCS = ['wandbis', 'aufrunden', 'max', 'min'];
  function rechne(formel, m) {
    const src = String(formel ?? '').trim().replace(/(\d),(\d)/g, '$1.$2').replace(/;/g, ',');
    if (!src) return 0;
    const toks = src.match(/\d+(?:\.\d+)?|[a-zA-ZäöüÄÖÜß_]+|[-+*/(),]|\S/g) || [];
    for (const t of toks) if (/[a-zäöüß_]/i.test(t) && !VARS.includes(t) && !FUNCS.includes(t)) throw new Error(`Unbekannt: „${t}“`);
    else if (!/[a-zäöüß_]/i.test(t) && !/^(\d+(\.\d+)?|[-+*/(),])$/.test(t)) throw new Error(`Zeichen „${t}“ nicht erlaubt`);
    const fn = new Function(...VARS, 'wandbis', 'aufrunden', 'max', 'min', `return (${toks.join(' ')});`);
    const v = fn(...VARS.map((k) => m[k]), m.wandbis, Math.ceil, Math.max, Math.min);
    return Number.isFinite(v) ? v : 0;
  }

  // ---------- Paket-Vorlagen ----------
  // Je Paket und Raumgruppe: Positionen der Preisliste mit Mengenformel.
  const FL_HALB = 'wandbis(1.2) + duschwand*(hoehe-1.2)'; // halbhoch, Dusche raumhoch
  const DEFAULT_VORLAGEN = {
    basic: {
      garten: [['AL-01', '1'], ['GA-03', 'boden*0.1', 'Bodenaushub'], ['GA-04', 'boden*0.3', 'Terrasse / Wege'], ['GA-05', 'umfang*0.3'], ['GA-06', 'boden*0.5'], ['WP-01', 'fundament', 'Fundament Wärmepumpe'], ['WP-02', 'wp'], ['WP-03', 'leitung'], ['WP-04', 'wp']],
      technik: [['AL-01', '1'], ['HZ-01', '1'], ['MA-02', 'wand + decke'], ['MA-03', 'wand + decke'], ['RE-01', 'boden']],
      aussen: [['AL-01', '1'], ['GA-08', 'wand + 10', 'Fassadenfläche + Überstand'], ['MA-01', 'umfang*2', 'Abdecken Fenster/Boden'], ['MA-02', 'wand'], ['MA-03', 'wand', 'Fassadenfarbe 2×'], ['RE-01', 'umfang*2']],
      nass: [['AL-01', '1'], ['RB-01', FL_HALB, 'Bestandsfliesen'], ['RB-02', 'boden'], ['EN-03', `aufrunden((${FL_HALB} + boden)/8)`], ['ST-01', '4', 'für Leitungen'],
        ['AB-01', 'boden + duschwand*2', 'Boden + Duschbereich'], ['AB-02', 'umfang + 4'], ['AB-03', '4'], ['FL-01', FL_HALB, 'halbhoch, Dusche raumhoch'], ['FL-02', 'boden'],
        ['MT-01', `(${FL_HALB} + boden)*1.1`, 'inkl. 10 % Verschnitt'], ['FL-07', 'sockel'], ['FL-08', 'umfang + 4'], ['MA-03', `wand - (${FL_HALB})`, 'Wand über den Fliesen'], ['MA-04', 'decke'], ['RE-01', 'boden']],
      kueche: [['AL-01', '1'], ['MA-01', 'boden'], ['RB-06', 'wand'], ['RB-02', 'boden'], ['EN-03', 'aufrunden(boden/8)'], ['FL-02', 'boden'], ['FL-01', '3', 'Fliesenspiegel'],
        ['MT-01', '(boden + 3)*1.1', 'inkl. 10 % Verschnitt'], ['FL-06', 'sockel'], ['MA-02', 'wand + decke'], ['MA-03', 'wand + decke'], ['RE-01', 'boden']],
      wohn: [['AL-01', '1'], ['MA-01', 'boden'], ['RB-06', 'wand'], ['RB-04', 'boden'], ['EN-03', 'aufrunden(boden/15)'], ['MA-02', 'wand + decke'], ['MA-07', 'wand + decke'],
        ['MA-03', 'wand + decke'], ['BO-01', 'boden'], ['MT-03', 'boden*1.08', 'inkl. 8 % Verschnitt'], ['BO-08', 'sockel'], ['RE-01', 'boden']],
    },
    standard: {
      garten: [['AL-01', '1'], ['GA-03', 'boden*0.15', 'Bodenaushub'], ['GA-04', 'boden*0.35', 'Terrasse / Wege'], ['GA-05', 'umfang*0.4'], ['GA-06', 'boden*0.45'], ['GA-07', 'umfang*0.5'], ['WP-01', 'fundament', 'Fundament Wärmepumpe'], ['WP-02', 'wp'], ['WP-03', 'leitung'], ['WP-04', 'wp'], ['WP-05', 'wp']],
      technik: [['AL-01', '1'], ['HZ-01', '1'], ['EN-02', '1'], ['MA-02', 'wand + decke'], ['MA-05', 'wand + decke'], ['MA-03', 'wand + decke'], ['RE-01', 'boden']],
      aussen: [['AL-01', '1'], ['GA-08', 'wand + 10', 'Fassadenfläche + Überstand'], ['MA-01', 'umfang*2', 'Abdecken Fenster/Boden'], ['PE-01', 'wand*0.15', 'Putzausbesserung ca. 15 %'], ['MA-02', 'wand'], ['MA-03', 'wand', 'Silikonharz-Fassadenfarbe 2×'], ['RE-01', 'umfang*2']],
      nass: [['AL-01', '1'], ['AL-03', '1'], ['RB-01', FL_HALB, 'Bestandsfliesen'], ['RB-02', 'boden'], ['EN-03', `aufrunden((${FL_HALB} + boden)/8)`], ['ST-01', '6', 'für Leitungen'], ['ST-03', '6'],
        ['PE-03', 'boden'], ['PE-05', 'dusche'], ['AB-01', 'boden + duschwand*2', 'Boden + Duschbereich'], ['AB-02', 'umfang + 4'], ['AB-03', '4'], ['FL-03', `${FL_HALB} + boden`, 'Großformat 60×120, Nassbereich raumhoch'],
        ['FL-10', 'dusche'], ['MT-02', `(${FL_HALB} + boden)*1.1`, 'inkl. 10 % Verschnitt'], ['FL-07', 'sockel'], ['FL-08', 'umfang + 4'], ['MA-05', `wand - (${FL_HALB}) + decke`, 'Wand über den Fliesen + Decke'],
        ['MA-03', `wand - (${FL_HALB})`], ['MA-04', 'decke'], ['RE-01', 'boden']],
      kueche: [['AL-01', '1'], ['MA-01', 'boden'], ['RB-06', 'wand'], ['RB-02', 'boden'], ['EN-03', 'aufrunden(boden/8)'], ['PE-03', 'boden'], ['FL-03', 'boden', 'Großformat 60×120'], ['FL-01', '4', 'Fliesenspiegel'],
        ['MT-02', '(boden + 4)*1.1', 'inkl. 10 % Verschnitt'], ['FL-06', 'sockel'], ['MA-05', 'wand + decke'], ['MA-03', 'wand + decke'], ['MA-10', 'tueren'], ['RE-01', 'boden']],
      wohn: [['AL-01', '1'], ['MA-01', 'boden'], ['RB-06', 'wand'], ['RB-04', 'boden'], ['EN-03', 'aufrunden(boden/15)'], ['MA-05', 'wand + decke'], ['MA-03', 'wand + decke'],
        ['PE-03', 'boden'], ['BO-02', 'boden'], ['MT-04', 'boden*1.08', 'inkl. 8 % Verschnitt'], ['BO-08', 'sockel'], ['MA-10', 'tueren'], ['RE-01', 'boden']],
    },
    premium: {
      garten: [['AL-01', '1'], ['GA-01', 'umfang*0.3', 'Leitungen / Drainage'], ['GA-03', 'boden*0.2', 'Bodenaushub'], ['GA-04', 'boden*0.4', 'Terrasse / Wege'], ['GA-05', 'umfang*0.5'], ['GA-06', 'boden*0.4'], ['GA-07', 'umfang*0.6'], ['WP-01', 'fundament', 'Fundament Wärmepumpe'], ['WP-02', 'wp'], ['WP-03', 'leitung'], ['WP-04', 'wp'], ['WP-05', 'wp']],
      technik: [['AL-01', '1'], ['HZ-01', '1'], ['EN-02', '1'], ['MA-02', 'wand + decke'], ['MA-06', 'wand + decke'], ['MA-03', 'wand + decke'], ['RE-01', 'boden']],
      aussen: [['AL-01', '1'], ['GA-08', 'wand + 10', 'Fassadenfläche + Überstand'], ['MA-01', 'umfang*2', 'Abdecken Fenster/Boden'], ['PE-01', 'wand', 'neuer Oberputz'], ['MA-02', 'wand'], ['MA-03', 'wand', 'Silikonharz-Fassadenfarbe 2×'], ['MA-03', 'umfang*0.5', 'Sockel / Faschen farbig abgesetzt'], ['RE-01', 'umfang*2']],
      nass: [['AL-01', '1'], ['AL-03', '1'], ['RB-01', 'wand', 'Bestandsfliesen'], ['RB-02', 'boden'], ['EN-03', 'aufrunden((wand + boden)/8)'], ['ST-01', '8', 'für Leitungen'], ['ST-03', '8'],
        ['TB-03', 'duschwand*hoehe', 'Vorwand Dusche / WC'], ['PE-03', 'boden'], ['PE-05', 'dusche'], ['AB-01', 'boden + duschwand*2', 'Boden + Duschbereich'], ['AB-02', 'umfang + 4'], ['AB-03', '6'],
        ['FL-03', 'wand + boden', 'Großformat, raumhoch'], ['FL-10', 'dusche'], ['MT-02', '(wand + boden)*1.12', 'inkl. 12 % Verschnitt (Großformat)'], ['FL-09', '2', 'Ablage / Nische'], ['FL-08', 'umfang + 6'],
        ['TB-05', 'decke', 'für indirekte LED-Beleuchtung'], ['MA-06', 'decke', 'Decke'], ['MA-04', 'decke'], ['RE-01', 'boden']],
      kueche: [['AL-01', '1'], ['AL-03', '1'], ['MA-01', 'boden'], ['RB-06', 'wand'], ['RB-02', 'boden'], ['EN-03', 'aufrunden(boden/8)'], ['PE-03', 'boden'], ['FL-03', 'boden + 5', 'Großformat, inkl. Rückwand'],
        ['MT-02', '(boden + 5)*1.12', 'inkl. 12 % Verschnitt'], ['FL-06', 'sockel'], ['MA-06', 'wand + decke'], ['MA-03', 'wand + decke'], ['RB-08', 'tueren'], ['TU-01', 'tueren'], ['MT-06', 'tueren'], ['RE-01', 'boden']],
      wohn: [['AL-01', '1'], ['AL-03', '1'], ['MA-01', 'boden'], ['RB-06', 'wand'], ['RB-04', 'boden'], ['EN-03', 'aufrunden(boden/10)'], ['MA-06', 'wand + decke', 'Q4 vollflächig'], ['MA-03', 'wand + decke'],
        ['PE-03', 'boden'], ['BO-05', 'boden'], ['MT-05', 'boden*1.1', 'Eiche, inkl. 10 % Verschnitt'], ['BO-08', 'sockel'], ['RB-08', 'tueren'], ['TU-01', 'tueren'], ['MT-06', 'tueren'], ['RE-01', 'boden']],
    },
  };
  const toObj = (rows) => rows.map(([nr, menge, bem = '']) => ({ nr, menge, bem }));
  let VORL = null;
  async function vorlagen() {
    if (VORL) return VORL;
    VORL = (await kvGet('angebotVorlagen')) || Object.fromEntries(Object.entries(DEFAULT_VORLAGEN).map(([k, g]) => [k, Object.fromEntries(Object.entries(g).map(([gk, rows]) => [gk, toObj(rows)]))]));
    for (const [k, g] of Object.entries(DEFAULT_VORLAGEN)) for (const [gk, rows] of Object.entries(g)) { VORL[k] ??= {}; VORL[k][gk] ??= toObj(rows); }
    return VORL;
  }
  const vorlageFuer = (pkgId, grp) => (VORL[pkgId] || VORL.standard)[grp] || [];
  const GRUPPEN = { nass: 'Bad / WC', kueche: 'Küche', wohn: 'Wohnräume, Flur, Treppenhaus & Sonstige', aussen: 'Fassade / Außen', garten: 'Garten (inkl. Wärmepumpe)', technik: 'Heizraum / Technik' };

  /** Positionen eines Pakets aus dem Aufmaß aller Räume erzeugen. Allgemeine Positionen (AL) nur einmal. */
  function erzeuge(p, pkgId) {
    const out = [], fehler = [], einmal = new Set();
    for (const r of p.aufmass.raeume) {
      const m = masse(r);
      if (!m.boden && !m.wp) continue;
      for (const v of vorlageFuer(pkgId, gruppe(r.typ))) {
        const it = pos(v.nr);
        if (!it) { fehler.push(`${v.nr} nicht in der Preisliste`); continue; }
        if (it.gewerk === 'Allgemein') { if (einmal.has(v.nr)) continue; einmal.add(v.nr); }
        let menge;
        try { menge = rechne(v.menge, m); } catch (e) { fehler.push(`${v.nr}: ${e.message}`); continue; }
        menge = STUECK.test(it.einheit) ? Math.ceil(menge - 1e-9) : Math.round(menge * 10) / 10;
        if (menge > 0) out.push({ nr: v.nr, raum: it.gewerk === 'Allgemein' ? '' : r.name, menge, bem: v.bem || '' });
      }
    }
    return { positionen: out, fehler };
  }

  function summen(positionen) {
    const S = PL.einstellungen;
    const zeilen = positionen.map((x, i) => { const it = pos(x.nr); if (!it) return null; const e = ep(it); return { ...x, i, it, ep: e, gp: r2(x.menge * e), lohn: r2(x.menge * lohnEp(it)) }; }).filter(Boolean);
    const netto = r2(zeilen.reduce((s, z) => s + z.gp, 0));
    const mwst = r2(netto * S.mwst), brutto = r2(netto + mwst);
    return { zeilen, netto, mwst, brutto, lohnBrutto: r2(zeilen.reduce((s, z) => s + z.lohn, 0) * (1 + S.mwst)),
      von: Math.round(brutto * (1 - S.spanne) / 100) * 100, bis: Math.round(brutto * (1 + S.spanne) / 100) * 100 };
  }

  // ---------- Bauzeitenplan ----------
  // Richtwerte: Menge pro Arbeitstag einer Kolonne (2 Personen). Einzelne Nummern überschreiben den Gewerk-Wert.
  const PHASEN = [
    { name: 'Baustelleneinrichtung & Schutz', gewerke: ['Allgemein'], rate: { pauschal: 2, Stück: 4, Tag: Infinity } },
    { name: 'Rückbau & Entsorgung', gewerke: ['Rückbau', 'Entsorgung'], rate: { 'm²': 20, Stück: 6, 'Std.': 8, lfm: 20 }, nr: { 'RB-03': 10, 'RB-04': 60, 'RB-05': 50, 'RB-06': 40, 'RB-09': 16 }, ohne: ['Entsorgung'] },
    { name: 'Stemmarbeiten', gewerke: ['Stemmarbeiten'], rate: { lfm: 20, Stück: 4 } },
    { name: 'Rohinstallation Sanitär & Elektro (Fachbetrieb)', fachbetrieb: 3 },
    { name: 'Trockenbau', gewerke: ['Trockenbau'], rate: { 'm²': 12, lfm: 10 }, nr: { 'TB-06': 40 } },
    { name: 'Putz & Estrich', gewerke: ['Putz und Estrich'], rate: { 'm²': 25, Stück: 2 }, nr: { 'PE-02': 40, 'PE-03': 50, 'PE-04': 150 }, trocknung: { 'PE-02': 10, 'PE-01': 5, 'PE-03': 1 } },
    { name: 'Abdichtung', gewerke: ['Abdichtung'], rate: { 'm²': 20, lfm: 60, Stück: 20 }, trocknungFix: 1 },
    { name: 'Fliesen', gewerke: ['Fliesen'], rate: { 'm²': 8, lfm: 25, Stück: 2 }, nr: { 'FL-03': 5, 'FL-04': 3, 'FL-08': 40 } },
    { name: 'Maler & Spachtel', gewerke: ['Maler'], rate: { 'm²': 40, 'm² Grundfl.': 200, Stück: 3 }, nr: { 'MA-02': 150, 'MA-05': 25, 'MA-06': 15, 'MA-07': 30, 'MA-08': 25 } },
    { name: 'Bodenbeläge', gewerke: ['Bodenbeläge'], rate: { 'm²': 25, lfm: 40, Stück: 10 }, nr: { 'BO-05': 15, 'BO-06': 20 } },
    { name: 'Türen', gewerke: ['Türen'], rate: { Stück: 3 } },
    { name: 'Endmontage Sanitär & Elektro (Fachbetrieb)', fachbetrieb: 2 },
    { name: 'Wärmepumpe: Fundament & Leitungsweg', gewerke: ['Wärmepumpe'], rate: { 'm²': 1, Stück: 2, lfm: 12, pauschal: 2 }, trocknung: { 'WP-01': 5 } },
    { name: 'Außenarbeiten', gewerke: ['Garten und Außen'], rate: { 'm²': 15, lfm: 20, 'm³': 15 } },
    { name: 'Endreinigung & Abnahme', gewerke: ['Reinigung'], rate: { 'm²': 80 }, min: 0.5 },
  ];
  const halbe = (x) => Math.ceil(x * 2 - 1e-9) / 2;
  function addArbeitstage(d, n) { const x = new Date(d); let k = 0; while (k < n) { x.setDate(x.getDate() + 1); if (x.getDay() % 6) k++; } return x; }
  function naechsterArbeitstag(d) { const x = new Date(d); while (!(x.getDay() % 6)) x.setDate(x.getDate() + 1); return x; }

  function bauzeit(positionen, start, mitInstallation) {
    const balken = [];
    let t = 0; // in Arbeitstagen ab Start
    for (const ph of PHASEN) {
      let tage = 0, trocknung = 0;
      if (ph.fachbetrieb) { if (!mitInstallation) continue; tage = ph.fachbetrieb; }
      else {
        const zeilen = positionen.filter((x) => { const it = pos(x.nr); return it && ph.gewerke.includes(it.gewerk); });
        if (!zeilen.length) continue;
        for (const x of zeilen) {
          const it = pos(x.nr);
          if (ph.ohne?.includes(it.gewerk)) continue;
          const rate = ph.nr?.[x.nr] ?? ph.rate[it.einheit] ?? Infinity;
          tage += x.menge / rate;
          trocknung = Math.max(trocknung, ph.trocknung?.[x.nr] || 0);
        }
        if (ph.trocknungFix) trocknung = Math.max(trocknung, ph.trocknungFix);
        tage = Math.max(halbe(tage), ph.min || 0.5);
      }
      balken.push({ name: ph.name, von: t, dauer: tage, fachbetrieb: !!ph.fachbetrieb });
      t += tage;
      if (trocknung) { balken.push({ name: 'Trocknung', von: t, dauer: trocknung, trocknung: true }); t += trocknung; }
    }
    const s = naechsterArbeitstag(start);
    for (const b of balken) { b.start = addArbeitstage(s, Math.floor(b.von)); b.ende = addArbeitstage(s, Math.max(Math.ceil(b.von + b.dauer) - 1, Math.floor(b.von))); }
    const gesamt = Math.ceil(t);
    return { balken, gesamt, start: s, ende: addArbeitstage(s, Math.max(gesamt - 1, 0)), wochen: Math.max(1, Math.ceil(gesamt / 5)) };
  }
  const zeitraumText = (bz) => {
    const w = bz.wochen;
    return `voraussichtlich ${w === 1 ? '1 Woche' : `${w} Wochen`} (ca. ${bz.gesamt} Arbeitstage inkl. Trocknungszeiten), Beginn nach Absprache`;
  };

  // ---------- Material- und Mengenliste ----------
  // Verbrauchswerte sind Richtwerte (Herstellerangaben schwanken). Gebinde zum Aufrunden.
  const stufe = (pkgId) => { const k = ['basic', 'standard', 'premium'].indexOf(pkgId); return k >= 0 ? k : Math.min(2, Math.max(0, PAKETE_STD().findIndex((x) => x.id === pkgId))); };
  const ELEKTRO = {
    nass: { steckdosen: [2, 3, 4], licht: [2, 2, 3], schalter: [1, 2, 2] },
    kueche: { steckdosen: [5, 8, 10], licht: [2, 3, 4], schalter: [1, 2, 2] },
  };
  function materialliste(p, pkgId, positionen) {
    const lvl = stufe(pkgId);
    const out = []; // { raum, gruppe, text, menge, einheit, hinweis }
    const add = (raum, gr, text, menge, einheit, hinweis = '') => { if (menge > 0) out.push({ raum, gruppe: gr, text, menge, einheit, hinweis }); };
    const geb = (menge, groesse, name) => `${Math.ceil(menge / groesse - 1e-9)} × ${name}`;
    const raeume = p.aufmass.raeume.filter((r) => masse(r).boden > 0);
    for (const r of raeume) {
      const m = masse(r), g = gruppe(r.typ), rn = r.name;
      const q = (nr) => positionen.filter((x) => x.raum === rn && x.nr === nr).reduce((s, x) => s + x.menge, 0);
      const qs = (re) => positionen.filter((x) => x.raum === rn && re.test(x.nr)).reduce((s, x) => s + x.menge, 0);
      // Fliesen
      const fl = { 'FL-01': 'Wandfliesen bis 30×60', 'FL-02': 'Bodenfliesen bis 60×60', 'FL-03': 'Großformat-Fliesen ab 60×120', 'FL-04': 'Mosaik' };
      let fliese = 0, gross = 0;
      for (const [nr, name] of Object.entries(fl)) {
        const a = q(nr); if (!a) continue;
        const v = nr === 'FL-03' ? 1.12 : 1.1; fliese += a; if (nr === 'FL-03') gross += a;
        add(rn, 'Fliesen & Abdichtung', name, Math.ceil(a * v * 10) / 10, 'm²', `${fmtNum(a)} m² + ${Math.round((v - 1) * 100)} % Verschnitt`);
      }
      if (fliese) {
        const kleber = (fliese - gross) * 4 + gross * 6;
        add(rn, 'Fliesen & Abdichtung', 'Fliesenkleber (flexibel)', Math.ceil(kleber), 'kg', geb(kleber, 25, 'Sack 25 kg'));
        add(rn, 'Fliesen & Abdichtung', 'Fugenmörtel', Math.ceil(fliese * 0.5), 'kg', geb(fliese * 0.5, 5, 'Eimer 5 kg'));
      }
      const abd = q('AB-01'); if (abd) add(rn, 'Fliesen & Abdichtung', 'Flüssigabdichtung, 2 Lagen', Math.ceil(abd * 1.5), 'kg', geb(abd * 1.5, 15, 'Eimer 15 kg'));
      const band = q('AB-02'); if (band) add(rn, 'Fliesen & Abdichtung', 'Dichtband', Math.ceil(band * 1.1), 'lfm', geb(band * 1.1, 10, 'Rolle 10 m'));
      const man = q('AB-03'); if (man) add(rn, 'Fliesen & Abdichtung', 'Dichtmanschetten Rohr/Wand', man, 'Stück');
      const sil = q('FL-08'); if (sil) add(rn, 'Fliesen & Abdichtung', 'Sanitär-Silikon', Math.ceil(sil / 8), 'Kartuschen', `für ${fmtNum(sil)} lfm`);
      const sch = q('FL-07'); if (sch) add(rn, 'Fliesen & Abdichtung', 'Abschlussschiene', Math.ceil(sch * 1.1 / 2.5), 'Stück à 2,5 m', `${fmtNum(sch)} lfm`);
      const nivel = q('PE-03'); if (nivel) add(rn, 'Untergrund', 'Ausgleichsmasse (ca. 5 mm)', Math.ceil(nivel * 7.5), 'kg', geb(nivel * 7.5, 25, 'Sack 25 kg'));
      const grund = q('PE-04') + q('MA-02'); if (grund) add(rn, 'Untergrund', 'Tiefgrund / Grundierung', Math.ceil(grund * 0.15), 'l', geb(grund * 0.15, 10, 'Kanister 10 l'));
      // Maler
      const farbe = q('MA-03') + q('MA-04'); if (farbe) add(rn, 'Maler', g === 'aussen' ? 'Fassadenfarbe (2 Anstriche)' : 'Dispersionsfarbe (2 Anstriche)', Math.ceil(farbe * 0.3), 'l', geb(farbe * 0.3, 12.5, 'Eimer 12,5 l'));
      const sp = q('MA-05') * 0.5 + q('MA-06') * 1.2; if (sp) add(rn, 'Maler', 'Spachtelmasse (Q3/Q4)', Math.ceil(sp), 'kg', geb(sp, 20, 'Eimer 20 kg'));
      const rf = q('MA-07'); if (rf) add(rn, 'Maler', 'Raufaser', Math.ceil(rf * 1.1 / 9), 'Rollen', `${fmtNum(rf)} m², Rolle ca. 9 m²`);
      const vl = q('MA-08'); if (vl) add(rn, 'Maler', 'Vliestapete', Math.ceil(vl * 1.1 / 13), 'Rollen', `${fmtNum(vl)} m², Rolle ca. 13 m²`);
      if (q('MA-01')) add(rn, 'Maler', 'Abdeckfolie / Malervlies', Math.ceil(q('MA-01') * 1.2), 'm²');
      // Boden
      const bo = { 'BO-01': ['Laminat', 2.2], 'BO-02': ['Vinyl Klick', 2.2], 'BO-03': ['Vinyl zum Kleben', 3.3], 'BO-04': ['Parkett schwimmend', 2], 'BO-05': ['Parkett zum Kleben', 2], 'BO-07': ['Teppich', 4] };
      for (const [nr, [name, pk]] of Object.entries(bo)) {
        const a = q(nr); if (!a) continue;
        add(rn, 'Boden', name, Math.ceil(a * 1.08 * 10) / 10, 'm²', `${fmtNum(a)} m² + 8 %, ca. ${Math.ceil(a * 1.08 / pk)} Pakete à ${fmtNum(pk)} m²`);
        if (/BO-0[124]/.test(nr)) add(rn, 'Boden', 'Trittschalldämmung', Math.ceil(a * 1.05), 'm²');
        if (/BO-0[35]/.test(nr)) add(rn, 'Boden', 'Parkett-/Vinylkleber', Math.ceil(a * 1.1), 'kg');
      }
      const sock = q('BO-08'); if (sock) add(rn, 'Boden', 'Sockelleisten', Math.ceil(sock * 1.1 / 2.4), 'Stück à 2,4 m', `${fmtNum(sock)} lfm`);
      const tu = q('TU-01'); if (tu) add(rn, 'Türen', 'Innentür mit Zarge und Drücker', tu, 'Stück', 'Maß und Anschlag vor Ort prüfen');
      // Sanitär-Objekte
      if (g === 'nass') {
        const gaeste = /wc/i.test(r.typ) && !/bad/i.test(r.typ);
        const becken = gaeste ? 1 : lvl >= 2 ? 2 : 1;
        add(rn, 'Sanitär (Fachbetrieb)', 'Wand-WC mit Vorwandelement und Betätigungsplatte', 1, 'Stück');
        add(rn, 'Sanitär (Fachbetrieb)', gaeste ? 'Handwaschbecken' : becken > 1 ? 'Doppelwaschtisch' : 'Waschtisch', 1, 'Stück', becken > 1 ? '2 Becken' : '');
        add(rn, 'Sanitär (Fachbetrieb)', 'Waschtischarmatur', becken, 'Stück');
        if (!gaeste) {
          if (r.dusche) { add(rn, 'Sanitär (Fachbetrieb)', 'Duschrinne mit Ablauf', 1, 'Stück'); add(rn, 'Sanitär (Fachbetrieb)', lvl ? 'Glaswand Walk-In / rahmenlos' : 'Duschabtrennung', 1, 'Stück'); }
          else add(rn, 'Sanitär (Fachbetrieb)', 'Duschtasse flach mit Ablauf', 1, 'Stück');
          add(rn, 'Sanitär (Fachbetrieb)', lvl ? 'Duschsystem mit Thermostat (Regenbrause)' : 'Brausegarnitur mit Einhebelmischer', 1, 'Stück');
          add(rn, 'Sanitär (Fachbetrieb)', lvl ? 'Designheizkörper' : 'Badheizkörper', 1, 'Stück');
        }
        add(rn, 'Sanitär (Fachbetrieb)', lvl ? 'Spiegel mit LED-Beleuchtung' : 'Spiegel', 1, 'Stück');
      }
      // Elektro (Richtwerte, an DIN 18015-2 angelehnt)
      if (g === 'aussen') continue;
      const e = ELEKTRO[g];
      const steck = e ? e.steckdosen[lvl] : Math.ceil(m.boden / 5) + [1, 2, 4][lvl];
      const licht = e ? e.licht[lvl] : [1, 2, 3][lvl] + (m.boden > 20 ? 1 : 0);
      const schalter = e ? e.schalter[lvl] : Math.max(1, m.tueren) * (lvl >= 2 ? 2 : 1);
      add(rn, 'Elektro (Fachbetrieb)', 'Steckdosen', steck, 'Stück', 'Richtwert');
      add(rn, 'Elektro (Fachbetrieb)', 'Licht-Auslässe', licht, 'Stück', lvl >= 2 && g !== 'wohn' ? 'z. B. Spots / LED-Profil' : '');
      add(rn, 'Elektro (Fachbetrieb)', 'Lichtschalter', schalter, 'Stück');
      if (g === 'kueche') add(rn, 'Elektro (Fachbetrieb)', 'Geräteanschlüsse (Herd, Spüle, Kühlschrank …)', 3 + lvl, 'Stück');
      if (g === 'wohn' && lvl) add(rn, 'Elektro (Fachbetrieb)', 'Netzwerk-/TV-Dosen', lvl, 'Stück');
      if (g === 'nass') add(rn, 'Elektro (Fachbetrieb)', 'Lüfter-Anschluss', 1, 'Stück', 'bei innenliegendem Bad Pflicht');
    }
    return out;
  }
  const listeText = (p, pk, liste) => {
    const zeilen = [`Materialliste ${p.customer || ''} · Paket ${pk.name}`.trim(), 'Richtwerte aus Aufmaß und Angebot, vor Bestellung prüfen.', ''];
    for (const rn of [...new Set(liste.map((x) => x.raum))]) {
      zeilen.push(`== ${rn} ==`);
      for (const gr of [...new Set(liste.filter((x) => x.raum === rn).map((x) => x.gruppe))]) {
        zeilen.push(`${gr}:`);
        for (const x of liste.filter((y) => y.raum === rn && y.gruppe === gr)) zeilen.push(`- ${x.text}: ${fmtNum(x.menge, x.menge % 1 ? 1 : 0)} ${x.einheit}${x.hinweis ? ` (${x.hinweis})` : ''}`);
      }
      zeilen.push('');
    }
    return zeilen.join('\n');
  };

  // ---------- Maße aus Fotos schätzen (Gemini) ----------
  async function masseAusFotos(p) {
    const key = state.settings.apiKey;
    if (!key) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen).');
    if (!p.photos.length) throw new Error('Bitte zuerst Fotos vom Raum aufnehmen.');
    const prompt = `Du bist ein erfahrener Bauleiter. Schätze aus den Fotos die Innenmaße dieses Raums (${p.room || 'Raum'}) in Metern.
Nutze bekannte Bezugsgrößen: Innentür ca. 2,01 m hoch und 0,885 m breit (Rohbaumaß), Türklinke ca. 1,05 m, Steckdosen ca. 0,30 m, Lichtschalter ca. 1,05 m, WC-Sitz ca. 0,40 m hoch, Waschtisch ca. 0,85 m hoch, Fliesenformate und Fugen zählen.
Gib Länge (längere Seite) und Breite der Grundfläche, Raumhöhe, Anzahl und Größe von Türen und Fenstern und ob eine bodengleiche Dusche sinnvoll ist. Sei ehrlich bei der Unsicherheit.`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }, ...p.photos.map((d) => ({ inline_data: { mime_type: mimeOf(d), data: b64(d) } }))] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: {
          laenge: { type: 'NUMBER' }, breite: { type: 'NUMBER' }, hoehe: { type: 'NUMBER' },
          tueren: { type: 'ARRAY', items: { type: 'OBJECT', properties: { breite: { type: 'NUMBER' }, hoehe: { type: 'NUMBER' } } } },
          fenster: { type: 'ARRAY', items: { type: 'OBJECT', properties: { breite: { type: 'NUMBER' }, hoehe: { type: 'NUMBER' } } } },
          duschwand: { type: 'NUMBER', description: 'Wandlänge im Duschbereich in m, 0 wenn keine Dusche' },
          genauigkeit_prozent: { type: 'NUMBER', description: 'geschätzte Abweichung in Prozent' },
          begruendung: { type: 'STRING' } }, required: ['laenge', 'breite', 'hoehe'] },
      },
    };
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || `Fehler ${r.status}`);
    const txt = j.candidates?.[0]?.content?.parts?.map((x) => x.text).filter(Boolean).join('');
    try { return JSON.parse(txt); } catch { throw new Error('Die KI hat keine Maße geliefert. Bitte nochmal versuchen.'); }
  }
  const dez = (x, d = 2) => (x > 0 ? String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',') : '');
  function uebernimmSchaetzung(r, s) {
    r.teile = [{ l: dez(s.laenge), b: dez(s.breite) }];
    if (s.hoehe > 0) r.h = dez(s.hoehe);
    const oe = [...(s.tueren || []).map((o) => ({ art: 'Tür', n: 1, b: dez(o.breite, 3), h: dez(o.hoehe) })), ...(s.fenster || []).map((o) => ({ art: 'Fenster', n: 1, b: dez(o.breite), h: dez(o.hoehe) }))].filter((o) => o.b && o.h);
    if (oe.length) r.oeff = oe;
    if (gruppe(r.typ) === 'nass' && s.duschwand > 0) { r.duschwand = dez(s.duschwand); r.dusche = true; }
    r.schaetzung = { genau: s.genauigkeit_prozent || null, text: s.begruendung || '', zeit: Date.now() };
  }

  // ---------- Projektdaten ----------
  function init(p) {
    p.aufmass ??= { raeume: [] };
    if (!p.aufmass.raeume.length) { const r = neuerRaum(typeof roomType === 'function' && p.roomType ? roomType(p.roomType).name : p.room || 'Badezimmer'); if (p.room) r.name = p.room; p.aufmass.raeume.push(r); }
    p.angebot ??= { paket: pakete(p)[1]?.id || pakete(p)[0]?.id, positionen: null, nr: '', titel: '', anrede: '', start: '', mitBauzeit: true, mitBild: true };
    return p;
  }
  async function naechsteNummer() {
    const jahr = new Date().getFullYear();
    const z = (await kvGet('angebotZaehler')) || {};
    z[jahr] = (z[jahr] || 0) + 1;
    await kvSet('angebotZaehler', z);
    return `${jahr}-${String(z[jahr]).padStart(3, '0')}`;
  }
  const mitInst = (p) => p.aufmass.raeume.some((r) => gruppe(r.typ) !== 'wohn');
  const startDatum = (p) => (p.angebot.start ? new Date(p.angebot.start + 'T08:00') : addArbeitstage(new Date(), 15));

  // ---------- Ansicht: Karte im Projekt ----------
  async function projektKarte(p) {
    const el = $('#angebot-card'); if (!el) return;
    await preisliste(); await vorlagen();
    const raeume = p.aufmass?.raeume || [];
    const flaeche = raeume.reduce((s, r) => s + masse(r).boden, 0);
    const n = p.angebot?.positionen?.length || 0;
    el.innerHTML = `<div class="card">
      <h2>4. Aufmaß & Angebot</h2>
      <p class="muted">${raeume.length ? `${raeume.length} Raum/Räume, ${fmtNum(flaeche)} m² Bodenfläche${n ? `, Angebot mit ${n} Positionen` : ''}.` : 'Maße aufnehmen, daraus entstehen Angebot und Bauzeitenplan pro Paket.'}</p>
      <button class="btn block" id="toAngebot">Aufmaß & Angebot öffnen</button></div>`;
    $('#toAngebot').onclick = () => ansicht(p);
  }

  // ---------- Ansicht: Aufmaß & Angebot ----------
  let tab = 'aufmass';
  async function ansicht(p, scrollTop = true) {
    await preisliste(); await vorlagen();
    init(p);
    const zurueck = () => { if (state.angebotAusProjekt && state.wohnung) { state.angebotAusProjekt = false; state.project = null; return Projekt.view(); } viewProjekt(); };
    header('Angebot', [p.customer, p.room].filter(Boolean).join(' · '), { label: state.angebotAusProjekt ? 'Projekt' : p.room || 'Raum', fn: zurueck });
    main().innerHTML = `
      <div class="seg">${[['aufmass', 'Aufmaß'], ['angebot', 'Angebot'], ['material', 'Material'], ['bauzeit', 'Bauzeit']].map(([k, l]) => `<button data-atab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="aBody"></div>`;
    
    $$('[data-atab]').forEach((b) => (b.onclick = () => { tab = b.dataset.atab; ansicht(p); }));
    ({ aufmass: aufmassView, angebot: angebotView, material: materialView, bauzeit: bauzeitView })[tab](p);
    if (scrollTop) window.scrollTo(0, 0);
  }
  const persist = debounce((p) => saveProject(p), 400);
  const numIn = (attr, v, ph = '') => `<input type="text" inputmode="decimal" ${attr} value="${esc(fmtIn(v))}" placeholder="${ph}">`;

  function aufmassView(p) {
    const body = $('#aBody');
    const typen = [...new Set([...ROOM_TYPES.map((r) => r.name), ...p.aufmass.raeume.map((r) => r.typ)])];
    body.innerHTML = `
      <div class="card"><p class="muted" style="margin:0">Maße in Metern (Komma oder Punkt). Für rechteckige Räume reichen Länge, Breite und Höhe. L-förmige Räume oder Nischen als <b>zweite Teilfläche</b> eintragen. Ein Grundriss ist nicht nötig, ein Foto davon oder von einer Skizze kannst du als Beleg anhängen.</p></div>
      ${p.aufmass.raeume.map((r, ri) => {
        const m = masse(r);
        return `<div class="card" data-raum="${ri}">
        <div class="row" style="align-items:flex-end"><div style="flex:2"><label>Raum</label><input type="text" data-rf="name" value="${esc(r.name)}"></div>
          <div style="flex:2"><label>Raumtyp</label><select data-rf="typ">${typen.map((t) => `<option ${t === r.typ ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div></div>
        ${p.photos.length ? `<button class="btn small secondary block" data-schaetzen style="margin-top:10px">Maße grob aus den Fotos schätzen (KI)</button>` : ''}
        ${r.schaetzung ? `<p class="muted" style="color:#9a6a12">Geschätzt aus Fotos${r.schaetzung.genau ? `, ca. ±${Math.round(r.schaetzung.genau)} %` : ''}. Bitte mit dem Meterstab prüfen und korrigieren.${r.schaetzung.text ? `<br><i>${esc(r.schaetzung.text)}</i>` : ''}</p>` : ''}
        <h3>Grundfläche</h3>
        ${r.teile.map((t, ti) => `<div class="mrow"><span class="muted">${ti ? 'Teilfl. ' + (ti + 1) : 'Länge × Breite'}</span>${numIn(`data-teil="${ti}" data-k="l"`, t.l, 'Länge')}<span>×</span>${numIn(`data-teil="${ti}" data-k="b"`, t.b, 'Breite')}${ti ? `<button class="x" data-delteil="${ti}" aria-label="Entfernen">✕</button>` : '<span class="x"></span>'}</div>`).join('')}
        <button class="btn small secondary" data-addteil>＋ Teilfläche (L-Form, Nische)</button>
        <div class="row"><div><label>Raumhöhe</label>${numIn('data-rf="h"', r.h, 'z. B. 2,50')}</div><div><label>Umfang (leer = berechnet)</label>${numIn('data-rf="umfang"', r.umfang, fmtNum(m.umfang, 2))}</div></div>
        <h3>Türen & Fenster</h3>
        ${r.oeff.map((o, oi) => `<div class="mrow"><select data-oe="${oi}" data-k="art"><option ${o.art === 'Tür' ? 'selected' : ''}>Tür</option><option ${o.art === 'Fenster' ? 'selected' : ''}>Fenster</option></select>${numIn(`data-oe="${oi}" data-k="n" style="max-width:52px"`, o.n, 'Anz.')}${numIn(`data-oe="${oi}" data-k="b"`, o.b, 'Breite')}<span>×</span>${numIn(`data-oe="${oi}" data-k="h"`, o.h, 'Höhe')}<button class="x" data-deloe="${oi}" aria-label="Entfernen">✕</button></div>`).join('')}
        <button class="btn small secondary" data-addoe>＋ Tür / Fenster</button>
        ${gruppe(r.typ) === 'nass' ? `<h3>Duschbereich</h3>
          <label class="check"><input type="checkbox" data-rf="dusche" ${r.dusche ? 'checked' : ''}>Bodengleiche Dusche</label>
          <label>Wandlänge im Duschbereich (raumhoch gefliest, abgedichtet)</label>${numIn('data-rf="duschwand"', r.duschwand, 'z. B. 1,80')}` : ''}
        <label>Notiz zum Raum</label><textarea data-rf="notiz" rows="2" placeholder="z. B. Wand zum Flur feucht, Steigleitung in der Ecke">${esc(r.notiz)}</textarea>
        <div class="row" style="margin-top:8px;align-items:center">${r.skizze ? `<img src="${r.skizze}" alt="Skizze" style="max-width:90px;border-radius:8px;flex:none">` : ''}
          <button class="btn small secondary" data-skizze>${r.skizze ? '↻ Skizze/Plan ersetzen' : 'Foto von Plan / Skizze'}</button></div>
        <div class="sum">Boden/Decke <b>${fmtNum(m.boden, 2)} m²</b> · Umfang <b>${fmtNum(m.umfang, 2)} m</b> · Wand netto <b>${fmtNum(m.wand, 2)} m²</b> · Öffnungen ${fmtNum(m.oeffnungen, 2)} m²</div>
        ${p.aufmass.raeume.length > 1 ? '<button class="btn small danger" data-delraum style="margin-top:8px">Raum entfernen</button>' : ''}
      </div>`;
      }).join('')}
      <button class="btn secondary block" id="addRaum">＋ Weiteren Raum aufmessen</button>
      <button class="btn block" id="zumAngebot" style="margin-top:10px">Weiter zum Angebot →</button>`;

    const rerender = () => { saveProject(p); const y = window.scrollY; aufmassView(p); window.scrollTo(0, y); };
    const updSum = (ri) => {
      const m = masse(p.aufmass.raeume[ri]);
      const c = $(`[data-raum="${ri}"] .sum`);
      if (c) c.innerHTML = `Boden/Decke <b>${fmtNum(m.boden, 2)} m²</b> · Umfang <b>${fmtNum(m.umfang, 2)} m</b> · Wand netto <b>${fmtNum(m.wand, 2)} m²</b> · Öffnungen ${fmtNum(m.oeffnungen, 2)} m²`;
      const u = $(`[data-raum="${ri}"] [data-rf="umfang"]`); if (u) u.placeholder = fmtNum(m.umfang, 2);
    };
    $$('[data-raum]').forEach((card) => {
      const ri = +card.dataset.raum, r = p.aufmass.raeume[ri];
      $$('[data-rf]', card).forEach((el) => {
        const k = el.dataset.rf;
        el.oninput = el.onchange = () => {
          r[k] = el.type === 'checkbox' ? el.checked : el.value;
          if (k === 'typ') { if (gruppe(r.typ) === 'nass' && !r.duschwand) { r.duschwand = '1,8'; r.dusche = true; } return rerender(); }
          updSum(ri); persist(p);
        };
      });
      $$('[data-teil]', card).forEach((el) => (el.oninput = () => { r.teile[+el.dataset.teil][el.dataset.k] = el.value; if (r.schaetzung) r.schaetzung.bearbeitet = true; updSum(ri); persist(p); }));
      $$('[data-oe]', card).forEach((el) => (el.oninput = el.onchange = () => { r.oeff[+el.dataset.oe][el.dataset.k] = el.value; updSum(ri); persist(p); }));
      const sb = $('[data-schaetzen]', card);
      if (sb) sb.onclick = async () => {
        if (masse(r).boden && !confirm('Eingetragene Maße durch die KI-Schätzung ersetzen?')) return;
        sb.disabled = true; sb.textContent = 'KI schätzt die Maße …';
        try { uebernimmSchaetzung(r, await masseAusFotos(p)); toast('Maße geschätzt. Bitte nachmessen.'); rerender(); }
        catch (e) { toast('' + e.message, 6000); sb.disabled = false; sb.textContent = 'Maße grob aus den Fotos schätzen (KI)'; }
      };
      $('[data-addteil]', card).onclick = () => { r.teile.push({ l: '', b: '' }); rerender(); };
      $$('[data-delteil]', card).forEach((b) => (b.onclick = () => { r.teile.splice(+b.dataset.delteil, 1); rerender(); }));
      $('[data-addoe]', card).onclick = () => { r.oeff.push({ art: 'Fenster', n: 1, b: '', h: '' }); rerender(); };
      $$('[data-deloe]', card).forEach((b) => (b.onclick = () => { r.oeff.splice(+b.dataset.deloe, 1); rerender(); }));
      $('[data-skizze]', card).onclick = async () => { const [f] = await pickFiles(); if (!f) return; r.skizze = await resize(await fileToDataUrl(f), 1400); rerender(); };
      const del = $('[data-delraum]', card); if (del) del.onclick = () => { if (!confirm(`Raum „${r.name}“ entfernen?`)) return; p.aufmass.raeume.splice(ri, 1); rerender(); };
    });
    $('#addRaum').onclick = () => { p.aufmass.raeume.push(neuerRaum('Wohnzimmer')); rerender(); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50); };
    $('#zumAngebot').onclick = () => { tab = 'angebot'; ansicht(p); };
  }

  function angebotView(p) {
    const A = p.angebot, body = $('#aBody');
    // Vergleich aller Pakete (Preisrichtung für das Gespräch vor Ort)
    const vergleich = pakete(p).map((pk) => ({ pk, s: summen(erzeuge(p, pk.id).positionen) }));
    if (!A.positionen || !A.geaendert) { const g = erzeuge(p, A.paket); A.positionen = g.positionen; A.fehler = g.fehler; }
    const S = summen(A.positionen), pk = pakete(p).find((x) => x.id === A.paket) || pakete(p)[0];
    const raeume = [...new Set(A.positionen.map((x) => x.raum))];
    const gewerke = [...new Set(PL.positionen.map((x) => x.gewerk))];
    body.innerHTML = `
      <div class="card"><h2>Preisrichtung vor Ort</h2>
        <p class="muted">Brutto, aus dem Aufmaß und den Paket-Vorlagen, ±${Math.round(PL.einstellungen.spanne * 100)} %.</p>
        ${vergleich.map(({ pk: x, s }) => `<div class="prow"><span class="swatch" style="background:${x.color};height:22px;width:6px"></span><b style="flex:1">${esc(x.name)}</b><span>${s.brutto ? `${fmtEur(s.von).replace(',00', '')} – ${fmtEur(s.bis).replace(',00', '')}` : '–'}</span></div>`).join('')}
      </div>
      <div class="card"><h2>Angebot</h2>
        <label>Paket</label><select id="aPaket">${pakete(p).map((x) => `<option value="${x.id}" ${x.id === A.paket ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <div class="row"><div><label>Angebotsnummer</label><input type="text" id="aNr" value="${esc(A.nr)}" placeholder="wird beim PDF vergeben"></div>
          <div><label>Ansprechpartner</label><select id="aAnspr">${ansprechpartner().map((x) => `<option ${x === (A.anspr || ansprechpartner()[0]) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
        <label>Betreff</label><input type="text" id="aTitel" value="${esc(A.titel)}" placeholder="${esc(titelDefault(p, pk))}">
        <label>Anrede</label><input type="text" id="aAnrede" value="${esc(A.anrede)}" placeholder="${esc(anredeDefault(p))}">
        ${p.otherNotes?.trim() ? `<h3>Notizen aus dem Gespräch</h3><p class="muted" style="white-space:pre-line">${esc(p.otherNotes.trim())}</p>` : ''}
        ${A.fehler?.length ? `<p class="muted" style="color:var(--danger)">${A.fehler.map(esc).join(' · ')}</p>` : ''}
      </div>
      <div class="card"><h2>Positionen</h2>
        <p class="muted">Mengen kommen aus dem Aufmaß und passen sich an, solange du hier nichts änderst. Nach eigenen Änderungen übernimmt „Neu berechnen“ das Aufmaß wieder.</p>
        ${raeume.map((rn) => `<h3>${esc(rn || 'Allgemein')}</h3>${S.zeilen.filter((z) => z.raum === rn).map((z) => {
          const i = z.i;
          return `<div class="posrow"><div class="pt"><b>${esc(z.it.text)}</b><span class="muted">${esc(z.nr)}${z.bem ? ' · ' + esc(z.bem) : ''}</span></div>
            <div class="pm">${numIn(`data-menge="${i}"`, z.menge)}<span class="muted">${esc(z.it.einheit)}</span></div>
            <div class="pg">${fmtEur(z.gp)}<span class="muted">${fmtEur(z.ep)}</span></div><button class="x" data-delpos="${i}" aria-label="Entfernen">✕</button></div>`;
        }).join('')}`).join('')}
        <h3>Position hinzufügen</h3>
        <select id="aNeu"><option value="">Position aus Preisliste wählen …</option>${gewerke.map((g) => `<optgroup label="${esc(g)}">${PL.positionen.filter((x) => x.gewerk === g).map((x) => `<option value="${esc(x.nr)}">${esc(x.nr)} ${esc(x.text)} (${esc(x.einheit)})</option>`).join('')}</optgroup>`).join('')}</select>
        <div class="row" style="margin-top:8px"><select id="aNeuRaum">${['', ...p.aufmass.raeume.map((r) => r.name)].map((r) => `<option value="${esc(r)}">${esc(r || 'Allgemein')}</option>`).join('')}</select>
          ${numIn('id="aNeuMenge"', '', 'Menge')}<button class="btn small" id="aAdd" style="flex:none">＋</button></div>
        <button class="btn secondary block" id="aNeuBerechnen" style="margin-top:12px">↻ Neu berechnen aus Aufmaß</button>
      </div>
      <div class="card"><h2>Summe</h2>
        <div class="tot"><span>Summe netto</span><b>${fmtEur(S.netto)}</b></div>
        <div class="tot"><span>zzgl. ${Math.round(PL.einstellungen.mwst * 100)} % MwSt.</span><span>${fmtEur(S.mwst)}</span></div>
        <div class="tot big"><span>Gesamt brutto</span><b>${fmtEur(S.brutto)}</b></div>
        <div class="tot"><span class="muted">Lohnanteil brutto (§ 35a EStG)</span><span class="muted">${fmtEur(S.lohnBrutto)}</span></div>
        <div class="tot"><span class="muted">Preisrichtung</span><span class="muted">${fmtEur(S.von)} – ${fmtEur(S.bis)}</span></div>
      </div>
      <div class="card">
        <label class="check"><input type="checkbox" id="aMitBz" ${A.mitBauzeit ? 'checked' : ''}>Bauzeitenplan anhängen</label>
        <label class="check"><input type="checkbox" id="aMitBild" ${A.mitBild ? 'checked' : ''} ${firstResult(p, A.paket) ? '' : 'disabled'}>Visualisierung „${esc(pk.name)}“ anhängen${firstResult(p, A.paket) ? '' : ' (noch nicht erstellt)'}</label>
        <button class="btn block" id="aPdf" ${S.zeilen.length ? '' : 'disabled'}>Angebot als PDF</button>
        <button class="btn secondary block" id="aExcel" style="margin-top:10px" ${S.zeilen.length ? '' : 'disabled'}>Positionen fürs Excel-Tool kopieren</button>
        <p class="muted">Kopiert Nr, Raum, Menge und Bemerkung. In Excel im Blatt „Eingabe“ ab Zelle B12 einfügen.</p>
      </div>`;

    const re = () => { saveProject(p); const y = window.scrollY; angebotView(p); window.scrollTo(0, y); };
    $('#aPaket').onchange = (e) => {
      if (A.geaendert && !confirm('Deine Änderungen an den Positionen werden durch die Vorlage des anderen Pakets ersetzt. Weiter?')) { e.target.value = A.paket; return; }
      A.paket = e.target.value; A.positionen = null; A.geaendert = false; re();
    };
    for (const [id, k] of [['aNr', 'nr'], ['aTitel', 'titel'], ['aAnrede', 'anrede']]) $('#' + id).oninput = (e) => { A[k] = e.target.value; persist(p); };
    $('#aAnspr').onchange = (e) => { A.anspr = e.target.value; persist(p); };
    const totals = debounce(re, 900);
    $$('[data-menge]').forEach((el) => (el.oninput = () => { A.positionen[+el.dataset.menge].menge = num(el.value); A.geaendert = true; persist(p); totals(); }));
    $$('[data-delpos]').forEach((b) => (b.onclick = () => { A.positionen.splice(+b.dataset.delpos, 1); A.geaendert = true; re(); }));
    $('#aAdd').onclick = () => {
      const nr = $('#aNeu').value, menge = num($('#aNeuMenge').value);
      if (!nr) return toast('Bitte eine Position wählen.');
      if (!(menge > 0)) return toast('Bitte eine Menge eintragen.');
      A.positionen.push({ nr, raum: $('#aNeuRaum').value, menge, bem: '' }); A.geaendert = true; re();
    };
    $('#aNeuBerechnen').onclick = () => { if (A.geaendert && !confirm('Eigene Änderungen an den Positionen gehen verloren. Neu berechnen?')) return; A.positionen = null; A.geaendert = false; re(); };
    $('#aMitBz').onchange = (e) => { A.mitBauzeit = e.target.checked; persist(p); };
    $('#aMitBild').onchange = (e) => { A.mitBild = e.target.checked; persist(p); };
    $('#aPdf').onclick = () => teilePdf(p).catch((e) => toast('PDF-Fehler: ' + e.message, 5000));
    $('#aExcel').onclick = async () => {
      const tsv = A.positionen.map((x) => [x.nr, x.raum || 'Allgemein', String(x.menge).replace('.', ','), x.bem].join('\t')).join('\n');
      try { await navigator.clipboard.writeText(tsv); toast('Kopiert. In Excel „Eingabe“ ab B12 einfügen.'); } catch { toast('Kopieren nicht möglich.'); }
    };
  }

  function materialView(p) {
    const A = p.angebot;
    if (!A.positionen || !A.geaendert) A.positionen = erzeuge(p, A.paket).positionen;
    const pk = pakete(p).find((x) => x.id === A.paket) || pakete(p)[0];
    const liste = materialliste(p, pk.id, A.positionen);
    const raeume = [...new Set(liste.map((x) => x.raum))];
    $('#aBody').innerHTML = `
      <div class="card"><h2>Material- und Mengenliste</h2>
        <p class="muted">Aus Aufmaß und Angebot (Paket „${esc(pk.name)}“), inklusive Verschnitt und Gebinden. Sanitär- und Elektro-Mengen sind Richtwerte für das Gespräch mit dem Fachbetrieb. Paket wechseln im Tab „Angebot“.</p>
        <div class="row"><button class="btn" id="mShare">Liste teilen</button><button class="btn secondary" id="mCopy">Kopieren</button></div>
      </div>
      ${raeume.map((rn) => `<div class="card"><h2>${esc(rn)}</h2>${[...new Set(liste.filter((x) => x.raum === rn).map((x) => x.gruppe))].map((gr) => `<h3>${esc(gr)}</h3>
        ${liste.filter((x) => x.raum === rn && x.gruppe === gr).map((x) => `<div class="mat"><div><b>${esc(x.text)}</b>${x.hinweis ? `<span class="muted">${esc(x.hinweis)}</span>` : ''}</div><div class="mq">${fmtNum(x.menge, x.menge % 1 ? 1 : 0)} ${esc(x.einheit)}</div></div>`).join('')}`).join('')}</div>`).join('') || '<div class="card"><p class="muted">Noch kein Aufmaß eingetragen.</p></div>'}`;
    const text = listeText(p, pk, liste);
    $('#mCopy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Liste kopiert'); } catch { toast('Kopieren nicht möglich.'); } };
    $('#mShare').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'Materialliste', text }); return; } catch (e) { if (e.name === 'AbortError') return; } } try { await navigator.clipboard.writeText(text); toast('Liste kopiert'); } catch { toast('Teilen nicht möglich.'); } };
  }

  function bauzeitView(p) {
    const A = p.angebot;
    if (!A.positionen || !A.geaendert) A.positionen = erzeuge(p, A.paket).positionen;
    const bz = bauzeit(A.positionen, startDatum(p), mitInst(p));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const tot = Math.max(bz.gesamt, 1);
    $('#aBody').innerHTML = `
      <div class="card"><h2>Bauzeitenplan</h2>
        <p class="muted">Aus den Mengen des Angebots (Paket „${esc((pakete(p).find((x) => x.id === A.paket) || {}).name || '')}“) und Richtwerten pro Gewerk für eine Kolonne, Montag bis Freitag. Feiertage und Lieferzeiten sind nicht berücksichtigt.</p>
        <label>Geplanter Beginn</label><input type="date" id="bzStart" value="${iso(bz.start)}">
        <div class="tot big" style="margin-top:12px"><span>Dauer</span><b>${bz.wochen} ${bz.wochen === 1 ? 'Woche' : 'Wochen'} · ${bz.gesamt} Arbeitstage</b></div>
        <div class="tot"><span class="muted">Zeitraum</span><span class="muted">${fmtDate(bz.start)} – ${fmtDate(bz.ende)}</span></div>
      </div>
      <div class="card gantt">${bz.balken.map((b) => `<div class="gr"><div class="gl"><b>${esc(b.name)}</b><span class="muted">${fmtDate(b.start)}${b.dauer > 1 ? ' – ' + fmtDate(b.ende) : ''} · ${fmtNum(b.dauer, b.dauer % 1 ? 1 : 0)} AT</span></div>
        <div class="gb"><span class="${b.trocknung ? 'tr' : b.fachbetrieb ? 'fb' : ''}" style="left:${(b.von / tot) * 100}%;width:${Math.max((b.dauer / tot) * 100, 1.5)}%"></span></div></div>`).join('')}
        <p class="muted" style="margin-top:10px"><span class="lg"></span> eigene Gewerke · <span class="lg fb"></span> Fachbetrieb · <span class="lg tr"></span> Trocknung</p>
      </div>`;
    $('#bzStart').onchange = (e) => { A.start = e.target.value; saveProject(p); bauzeitView(p); };
  }

  const ansprechpartner = () => {
    const a = String(PL.einstellungen.ansprechpartner || '');
    const teile = a.split(/\s*[·,&]\s*|\s+und\s+/).filter(Boolean);
    return teile.length === 2 ? [a, `${teile[1]} · ${teile[0]}`] : [a];
  };
  const titelDefault = (p, pk) => `Sanierung ${[...new Set(p.aufmass.raeume.map((r) => r.name))].join(', ')}, Ausstattung ${pk?.name || ''}`;
  const anredeDefault = (p) => (p.customer ? (/^(familie|herr|frau)\b/i.test(p.customer) ? `Sehr geehrte${/^herr/i.test(p.customer) ? 'r' : ''} ${p.customer},` : `Guten Tag ${p.customer},`) : 'Sehr geehrte Damen und Herren,');

  // ---------- PDF ----------
  async function baueAngebotPdf(p) {
    const A = p.angebot, E = PL.einstellungen, S = summen(A.positionen);
    const pk = pakete(p).find((x) => x.id === A.paket) || pakete(p)[0];
    if (!A.nr) { A.nr = await naechsteNummer(); await saveProject(p); }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 20, R = W - 18;
    const NAVY = [30, 53, 80], BRASS = [184, 134, 47];
    const logo = state.settings.logo, logoFmt = logo ? (mimeOf(logo) === 'image/png' ? 'PNG' : 'JPEG') : null;
    const heute = new Date(), gueltig = new Date(heute); gueltig.setDate(gueltig.getDate() + (E.gueltig || 30));
    const bz = bauzeit(A.positionen, startDatum(p), mitInst(p));
    const t = (s, x, y, o) => doc.text(Array.isArray(s) ? s : String(s ?? ''), x, y, o);

    const kopf = async (erste) => {
      if (logo) await addFit(doc, logo, R - 55, 10, 55, erste ? 22 : 14, logoFmt);
      else { doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); t(E.firma, R, 20, { align: 'right' }); }
      doc.setFont('helvetica', 'normal');
    };
    let y;
    // Seite 1: Briefkopf
    await kopf(true);
    doc.setFontSize(7.5); doc.setTextColor(120); t([E.firma, E.strasse, E.ort].filter(Boolean).join(' · '), M, 47);
    doc.setDrawColor(200); doc.line(M, 48.5, M + 85, 48.5);
    doc.setFontSize(10.5); doc.setTextColor(30);
    const adr = [p.customer, ...String(p.address || '').split(/\s*,\s*|\n/)].filter(Boolean);
    adr.forEach((l, i) => t(l, M, 55 + i * 5));
    doc.setFontSize(9);
    const meta = [['Angebot Nr.', A.nr], ['Datum', fmtDate(heute)], ['Gültig bis', fmtDate(gueltig)], ['Ansprechpartner', A.anspr || ansprechpartner()[0]], ['Telefon', E.telefon], ['E-Mail', E.email]];
    let my = 52;
    for (const [k, v] of meta) { doc.setTextColor(120); t(k, 128, my); doc.setTextColor(30); const lines = doc.splitTextToSize(String(v), R - 158); t(lines, 158, my); my += 4.6 * lines.length; }
    y = Math.max(92, my + 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY);
    const titel = doc.splitTextToSize('Angebot: ' + (A.titel || titelDefault(p, pk)), R - M); t(titel, M, y); y += 6 * titel.length + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30);
    t(A.anrede || anredeDefault(p), M, y); y += 5;
    t('vielen Dank für das angenehme Gespräch. Gerne bieten wir Ihnen folgende Leistungen an:', M, y); y += 9;

    // Tabelle
    const C = { pos: M, txt: M + 11, menge: 136, einh: 139, ep: 172, gp: R };
    const tabKopf = () => {
      doc.setFillColor(...NAVY); doc.rect(M - 1, y - 4.2, R - M + 2, 6.2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255);
      t('Pos.', C.pos, y); t('Leistung', C.txt, y); t('Menge', C.menge, y, { align: 'right' }); t('Einheit', C.einh, y); t('EP netto', C.ep, y, { align: 'right' }); t('GP netto', C.gp, y, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30); y += 6;
    };
    const neueSeite = async () => { doc.addPage(); await kopf(false); y = 34; };
    const platz = async (h, mitKopf) => { if (y + h > H - 28) { await neueSeite(); if (mitKopf) tabKopf(); } };
    tabKopf();
    const raeume = [...new Set(S.zeilen.map((z) => z.raum))];
    let n = 0;
    for (const rn of raeume) {
      if (raeume.length > 1) { await platz(12, true); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BRASS); t(rn || 'Allgemein', C.txt, y + 1); doc.setFont('helvetica', 'normal'); doc.setTextColor(30); y += 6; }
      for (const z of S.zeilen.filter((x) => x.raum === rn)) {
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(z.it.text + (z.bem ? ' – ' + z.bem : ''), C.menge - C.txt - 14);
        const h = 4.3 * lines.length + 1.6;
        await platz(h, true);
        n++;
        t(String(n), C.pos + 3, y, { align: 'center' }); t(lines, C.txt, y);
        t(fmtNum(z.menge, STUECK.test(z.it.einheit) ? 0 : 1), C.menge, y, { align: 'right' }); t(z.it.einheit, C.einh, y);
        t(fmtEur(z.ep), C.ep, y, { align: 'right' }); t(fmtEur(z.gp), C.gp, y, { align: 'right' });
        y += h; doc.setDrawColor(230); doc.line(M - 1, y - 3.2, R + 1, y - 3.2);
      }
    }
    // Summen
    await platz(30);
    y += 3; doc.setFontSize(10);
    const sumZ = (k, v, fett) => { doc.setFont('helvetica', fett ? 'bold' : 'normal'); t(k, C.txt, y); t(v, C.gp, y, { align: 'right' }); y += 5.5; };
    sumZ('Summe netto', fmtEur(S.netto));
    sumZ(`zzgl. ${Math.round(E.mwst * 100)} % MwSt.`, fmtEur(S.mwst));
    doc.setDrawColor(...NAVY); doc.line(C.txt, y - 3.8, R, y - 3.8);
    doc.setTextColor(...NAVY); sumZ('Gesamtsumme brutto', fmtEur(S.brutto), true); doc.setTextColor(90);
    doc.setFontSize(8.5); sumZ('Darin enthaltener Lohnanteil brutto (§ 35a EStG)', fmtEur(S.lohnBrutto)); doc.setTextColor(30);
    y += 4;

    // Texte
    const abschnitt = async (titelA, absaetze) => {
      const zeilen = absaetze.filter(Boolean).map((a) => doc.splitTextToSize(String(a), R - M));
      await platz(10 + 4.2 * Math.min(zeilen.flat().length, 6));
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); t(titelA, M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40);
      for (const z of zeilen) { for (const l of z) { await platz(5); t(l, M, y); y += 4.2; } y += 1.2; }
      y += 3;
    };
    await abschnitt('Ausführung und Leistungsumfang', [`Ausführungszeitraum: ${zeitraumText(bz)}${A.mitBauzeit ? ', siehe Bauzeitenplan.' : '.'}`, E.textLeistung, E.textBauseits]);
    await abschnitt('Preise und Zahlung', [...(E.hinweise || []).filter((h) => !/freuen uns/i.test(h)), E.textZahlung]);
    await abschnitt('Gewährleistung und Widerruf', [E.textGewaehr, E.textWiderruf]);
    const gruss = (E.hinweise || []).find((h) => /freuen uns/i.test(h)) || 'Wir freuen uns auf Ihren Auftrag.';
    await platz(16); doc.setFontSize(10); doc.setTextColor(30); t(gruss, M, y); y += 5; t('Mit freundlichen Grüßen', M, y); y += 5; t(E.firma, M, y); y += 12;
    // Auftragserteilung
    await platz(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); t('Auftragserteilung', M, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40);
    t(doc.splitTextToSize(`${E.textAuftrag} (Angebot Nr. ${A.nr} vom ${fmtDate(heute)}, ${fmtEur(S.brutto)} brutto)`, R - M), M, y); y += 20;
    doc.setDrawColor(120); doc.line(M, y, M + 60, y); doc.line(M + 80, y, R, y);
    doc.setFontSize(8); doc.setTextColor(120); t('Ort, Datum', M, y + 4); t('Unterschrift Auftraggeber', M + 80, y + 4);

    // Bauzeitenplan
    if (A.mitBauzeit) {
      await neueSeite();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); t('Bauzeitenplan', M, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
      t(`Angebot Nr. ${A.nr} · ${A.titel || titelDefault(p, pk)}`, M, y); y += 4.5;
      t(`Voraussichtlich ${fmtDate(bz.start)} bis ${fmtDate(bz.ende)}: ${bz.gesamt} Arbeitstage (${bz.wochen} ${bz.wochen === 1 ? 'Woche' : 'Wochen'}), Montag bis Freitag.`, M, y); y += 9;
      const gx = 92, gw = R - gx, wochen = bz.wochen, tw = gw / (wochen * 5);
      // Wochenraster
      doc.setFontSize(7.5);
      for (let w = 0; w < wochen; w++) {
        const d = addArbeitstage(bz.start, w * 5);
        const kw = isoKw(d);
        doc.setFillColor(w % 2 ? 248 : 240, w % 2 ? 249 : 242, w % 2 ? 250 : 245); doc.rect(gx + w * 5 * tw, y - 4, 5 * tw, 7 + bz.balken.length * 8, 'F');
        doc.setTextColor(90); t(`KW ${kw}`, gx + w * 5 * tw + 1, y);
      }
      y += 6;
      for (const b of bz.balken) {
        doc.setFontSize(8.5); doc.setTextColor(30); t(doc.splitTextToSize(b.name, gx - M - 4)[0], M, y + 1);
        doc.setFontSize(7); doc.setTextColor(120); t(`${fmtDate(b.start)}${b.dauer > 1 ? ' – ' + fmtDate(b.ende) : ''}`, M, y + 4.4);
        doc.setFillColor(...(b.trocknung ? [205, 211, 220] : b.fachbetrieb ? [184, 134, 47] : NAVY));
        doc.roundedRect(gx + b.von * tw, y - 2.2, Math.max(b.dauer * tw, 1.5), 5, 1, 1, 'F');
        y += 8;
      }
      y += 4; doc.setFontSize(8); doc.setTextColor(110);
      t(doc.splitTextToSize('Richtwerte aus den Angebotsmengen. Feiertage, Lieferzeiten und Termine der Fachbetriebe (Sanitär, Elektro) werden bei der Auftragsplanung abgestimmt. Trocknungszeiten (Estrich, Putz, Abdichtung) sind eingeplant.', R - M), M, y);
    }

    // Visualisierung
    const res = firstResult(p, pk.id);
    if (A.mitBild && res) {
      await neueSeite();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); t(`So könnte es aussehen: Paket ${pk.name}`, M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110); t('KI-Visualisierung, unverbindliche Darstellung.', M, y); y += 6;
      doc.setFontSize(9); doc.setTextColor(90); t('VORHER', M, y); y += 2;
      const i = (p.results[pk.id] || []).findIndex(Boolean);
      const b1 = await addFit(doc, p.photos[i], M, y, R - M, 100); y = b1.y + b1.h + 7;
      doc.setTextColor(...BRASS); t(`NACHHER – ${pk.name.toUpperCase()}`, M, y); y += 2;
      await addFit(doc, res, M, y, R - M, 100);
    }

    // Fußzeile auf allen Seiten
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...BRASS); doc.setLineWidth(0.4); doc.line(M, H - 20, R, H - 20); doc.setLineWidth(0.2);
      doc.setFontSize(6.8); doc.setTextColor(120);
      t([E.firma, E.strasse, E.ort, `Tel. ${E.telefon}`, E.email].filter(Boolean).join(' · '), M, H - 16);
      t([`Sitz: ${E.sitz}`, E.hrb, `Geschäftsführer: ${E.gf}`, `USt-IdNr. ${E.ustid}`].join(' · '), M, H - 12.8);
      t(E.bank, M, H - 9.6);
      t(`Seite ${i} von ${pages}`, R, H - 9.6, { align: 'right' });
    }
    return doc;
  }
  function isoKw(d) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 864e5 + 1) / 7); }

  async function teilePdf(p) {
    toast('Angebot wird erstellt …', 8000);
    const doc = await baueAngebotPdf(p);
    const name = `Angebot_${p.angebot.nr}_${(p.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    $('#toast').hidden = true;
    if ($('#aNr')) $('#aNr').value = p.angebot.nr;
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---------- Einstellungen ----------
  async function einstellungenKarte() {
    const el = $('#angebot-settings'); if (!el) return;
    await preisliste();
    const E = PL.einstellungen, pct = (x) => Math.round(x * 100) + ' %';
    el.innerHTML = `<div class="card"><h2>Preisliste & Angebot</h2>
      <p class="muted">Preise, Aufschläge und Texte kommen aus deinem <b>Excel-Angebotstool</b>. Lade die Datei hier hoch, wenn sich etwas ändert. Die Preise bleiben nur auf diesem Gerät.</p>
      <div class="tot"><span class="muted">Quelle</span><span>${esc(PL.quelle || '')}</span></div>
      <div class="tot"><span class="muted">Stand</span><span>${esc(PL.stand || '')}</span></div>
      <div class="tot"><span class="muted">Positionen</span><span>${PL.positionen.length}${PL.positionen.some((x) => x.status === 'geschätzt') ? ` (${PL.positionen.filter((x) => x.status === 'geschätzt').length} geschätzt)` : ''}</span></div>
      <div class="tot"><span class="muted">Aufschlag Lohn / Material / Wagnis</span><span>${pct(E.aufLohn)} / ${pct(E.aufMat)} / ${pct(E.wagnis)}</span></div>
      <div class="tot"><span class="muted">Firma</span><span style="text-align:right">${esc(E.firma)}<br>${esc(E.strasse)}, ${esc(E.ort)}</span></div>
      ${/0000|Muster/.test(E.telefon + E.strasse) ? '<p class="muted">Adresse und Telefon sind noch Platzhalter. Im Excel-Blatt „Einstellungen“ ändern und neu laden.</p>' : ''}
      <button class="btn block" id="plImport" style="margin-top:10px">Excel-Angebotstool laden</button>
      <div class="row" style="margin-top:10px"><button class="btn secondary" id="plVorl">Paket-Vorlagen</button><button class="btn danger" id="plReset">Standard</button></div>
    </div>`;
    $('#plImport').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      inp.onchange = async () => { try { const r = await importExcel(inp.files[0]); toast(`${r.positionen.length} Positionen übernommen`); einstellungenKarte(); } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 6000); } };
      inp.click();
    };
    $('#plReset').onclick = async () => { if (!confirm('Preisliste auf die Standard-Schätzpreise zurücksetzen?')) return; await kvDel('preisliste'); PL = null; einstellungenKarte(); };
    $('#plVorl').onclick = () => vorlagenView();
  }

  async function vorlagenView(pkgId = 'basic', grp = 'nass') {
    await preisliste(); await vorlagen();
    setTitle('Paket-Vorlagen');
    VORL[pkgId] ??= structuredClone(VORL.standard || { nass: [], kueche: [], wohn: [] });
    VORL[pkgId][grp] ??= [];
    const rows = VORL[pkgId][grp];
    main().innerHTML = `
      <button class="btn secondary small" id="vBack" style="margin-bottom:12px">← Einstellungen</button>
      <div class="card"><h2>Was gehört in welches Paket?</h2>
        <p class="muted">Pro Paket und Raumgruppe die Positionen aus der Preisliste mit einer Mengenformel. Erlaubt: Zahlen, + − * / ( ) und
        <b>boden, decke, wand, umfang, hoehe, sockel, tueren, fenster, tuerbreite, duschwand, dusche</b> (1 = bodengleich), <b>wandbis(1.2)</b> = Wandfläche bis 1,20 m Höhe, <b>aufrunden(…)</b>.</p>
        <div class="row"><select id="vPkg">${PAKETE_STD().map((x) => `<option value="${x.id}" ${x.id === pkgId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <select id="vGrp">${Object.entries(GRUPPEN).map(([k, l]) => `<option value="${k}" ${k === grp ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="card">${rows.map((v, i) => { const it = pos(v.nr); return `<div class="vrow">
        <div class="vt"><b>${esc(v.nr)}</b> ${it ? esc(it.text) + ` <span class="muted">(${esc(it.einheit)})</span>` : '<span style="color:var(--danger)">nicht in Preisliste</span>'}</div>
        <input type="text" data-vm="${i}" value="${esc(v.menge)}" placeholder="Menge/Formel" autocapitalize="off" autocorrect="off" spellcheck="false">
        <input type="text" data-vb="${i}" value="${esc(v.bem)}" placeholder="Bemerkung im Angebot (optional)">
        <div class="row"><button class="btn small secondary" data-vup="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn small danger" data-vdel="${i}">Entfernen</button></div></div>`; }).join('') || '<p class="muted">Noch keine Positionen.</p>'}
        <h3>Position hinzufügen</h3>
        <select id="vNeu"><option value="">Position wählen …</option>${PL.positionen.map((x) => `<option value="${esc(x.nr)}">${esc(x.nr)} ${esc(x.text)}</option>`).join('')}</select>
      </div>
      <div class="card"><button class="btn danger block" id="vReset">Alle Vorlagen auf Standard zurücksetzen</button></div>`;
    const save = debounce(() => kvSet('angebotVorlagen', VORL), 300);
    $('#vBack').onclick = () => switchTab('einstellungen');
    $('#vPkg').onchange = (e) => vorlagenView(e.target.value, grp);
    $('#vGrp').onchange = (e) => vorlagenView(pkgId, e.target.value);
    $$('[data-vm]').forEach((el) => (el.oninput = () => { rows[+el.dataset.vm].menge = el.value; try { rechne(el.value, masse(neuerRaum())); el.style.borderColor = ''; } catch { el.style.borderColor = 'var(--danger)'; } save(); }));
    $$('[data-vb]').forEach((el) => (el.oninput = () => { rows[+el.dataset.vb].bem = el.value; save(); }));
    $$('[data-vdel]').forEach((b) => (b.onclick = async () => { rows.splice(+b.dataset.vdel, 1); await kvSet('angebotVorlagen', VORL); vorlagenView(pkgId, grp); }));
    $$('[data-vup]').forEach((b) => (b.onclick = async () => { const i = +b.dataset.vup; [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; await kvSet('angebotVorlagen', VORL); vorlagenView(pkgId, grp); }));
    $('#vNeu').onchange = async (e) => { if (!e.target.value) return; rows.push({ nr: e.target.value, menge: 'boden', bem: '' }); await kvSet('angebotVorlagen', VORL); vorlagenView(pkgId, grp); };
    $('#vReset').onclick = async () => { if (!confirm('Alle Paket-Vorlagen zurücksetzen?')) return; await kvDel('angebotVorlagen'); VORL = null; vorlagenView(pkgId, grp); };
  }

  return { projektKarte, ansicht, einstellungenKarte, _intern: { gruppe, materialliste, uebernimmSchaetzung, masse, rechne, erzeuge, summen, bauzeit, ep, lohnEp, preisliste, vorlagen, neuerRaum, baueAngebotPdf, importExcel } };
})();
window.Angebot = Angebot;
