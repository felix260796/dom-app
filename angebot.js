// DOM – Aufmaß und Angebot
// Baut auf app.js auf (state, kvGet/kvSet, $, esc, toast, saveProject, viewProjekt, addFit, ...).
// Preise und Kalkulation wie im Excel-Angebotstool (Preisliste + Einstellungen).
'use strict';

const Angebot = (() => {
  // Pakete: Moodboards des Raumtyps im Projekt (IDs basic/standard/premium in allen Raumtypen gleich)
  const PAKETE_STD = () => Object.entries(PKG_META).map(([id, [name, color]]) => ({ id, name, color }));
  const pakete = (p) => (p?.roomType && typeof packagesFor === 'function' ? roomPackages(p) : PAKETE_STD());

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
    gewaehrNeu(PL.einstellungen);
    return PL;
  }
  // Gewährleistung (Wunsch Felix, Version 100): 2 Jahre ab Abnahme statt 5 Jahre (Arbeiten am Bauwerk).
  // Nur der unveränderte alte Standardtext wird ersetzt, selbst geschriebene Texte bleiben.
  const GEW_ALT = 'Es gelten die gesetzlichen Gewährleistungsrechte nach BGB; bei Arbeiten an einem Bauwerk beträgt die Frist 5 Jahre ab Abnahme.';
  const GEW_NEU = 'Es gelten die gesetzlichen Gewährleistungsrechte nach BGB. Die Gewährleistungsfrist beträgt 2 Jahre ab Abnahme.';
  const gewaehrText = (s) => (typeof s === 'string' && s.includes(GEW_ALT) ? s.split(GEW_ALT).join(GEW_NEU) : s);
  function gewaehrNeu(E) {
    if (!E) return;
    E.textGewaehr = gewaehrText(E.textGewaehr);
    for (const b of Array.isArray(E.bausteine) ? E.bausteine : []) b.text = gewaehrText(b.text);
  }
  const pos = (nr) => PL.positionen.find((x) => x.nr === nr);
  /** Einheitspreis Kunde netto wie im Excel (Preisliste Spalte H). */
  // k = Nachkalkulation eines Angebots { aufLohn, aufMat, wagnis } (leer = Standard aus den Einstellungen)
  const satz = (k, n) => (k && k[n] !== null && k[n] !== undefined && k[n] !== '' ? k[n] : PL.einstellungen[n]);
  function ep(it, k) {
    const eigen = it.auf !== null && it.auf !== undefined;
    return r2((it.lohn * (1 + (eigen ? it.auf : satz(k, 'aufLohn'))) + it.mat * (1 + satz(k, 'aufMat'))) * (1 + (eigen ? 0 : satz(k, 'wagnis'))));
  }
  /** Lohnanteil je Einheit netto (Preisliste Spalte L, für § 35a EStG). */
  function lohnEp(it, k) {
    const eigen = it.auf !== null && it.auf !== undefined;
    return r2(it.lohn * (1 + (eigen ? it.auf : satz(k, 'aufLohn'))) * (1 + (eigen ? 0 : satz(k, 'wagnis'))));
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

  /** Summen eines Angebots. k = Nachkalkulation; x.epFix = von Hand gesetzter Einzelpreis (Lohnanteil anteilig). */
  function summen(positionen, k) {
    const S = PL.einstellungen;
    const zeilen = positionen.map((x, i) => {
      // Eigene Position (nicht in der Preisliste): Text, Einheit und Preis stehen in der Position selbst
      const it = pos(x.nr) || (x.frei ? { nr: x.nr, text: x.frei.text || 'Eigene Position', einheit: x.frei.einheit || 'Stück', gewerk: 'Eigene Positionen', lohn: 0, mat: 0, auf: 0 } : null);
      if (!it) return null;
      const std = ep(it, k), e = x.epFix > 0 ? x.epFix : std, l = lohnEp(it, k) * (std ? e / std : 1);
      return { ...x, i, it, ep: e, fix: x.epFix > 0, gp: r2(x.menge * e), lohn: r2(x.menge * l) };
    }).filter(Boolean);
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
    const j = await geminiCall('text', () => body);
    const txt = j.candidates?.[0]?.content?.parts?.map((x) => x.text).filter(Boolean).join('');
    try { return JSON.parse(txt); } catch { throw new Error('Die KI hat keine Maße geliefert. Bitte nochmal versuchen.'); }
  }
  const dez = (x, d = 2) => (x > 0 ? String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',') : '');
  /** LiDAR-Scans, die vor Ort im Projekt gemacht wurden (voice.js, w.vorOrt.scans). */
  const scansVorOrt = (p) => (state.wohnung && (!p.wohnungId || state.wohnung.id === p.wohnungId) ? state.wohnung.vorOrt?.scans || [] : []);
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
    p.angebot ??= { paket: pakete(p)[1]?.id || pakete(p)[0]?.id, positionen: null, nr: '', titel: '', anrede: '', start: '', mitBild: true };
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
      <p class="muted">${raeume.length ? `${raeume.length} Raum/Räume, ${fmtNum(flaeche)} m² Bodenfläche${n ? `, Angebot mit ${n} Positionen` : ''}.` : 'Maße aufnehmen, daraus entsteht das Angebot.'}</p>
      <button class="btn block" id="toAngebot">Aufmaß & Angebot öffnen</button></div>`;
    $('#toAngebot').onclick = () => ansicht(p);
  }

  // ---------- Ansicht: Aufmaß & Angebot ----------
  let tab = 'angebot';
  async function ansicht(p, scrollTop = true) {
    // Verschickte Angebote sind gesperrt (projekt.js): ansehen oder als Kopie mit neuer Nummer ändern
    const W = p.wohnungId && (state.wohnung?.id === p.wohnungId ? state.wohnung : await kvGet('wohnung:' + p.wohnungId));
    if (W && window.Projekt?.gesperrt(W)) return Projekt.gesperrtFrage(W);
    await preisliste(); await vorlagen();
    init(p);
    // Zurück führt immer dorthin, woher man kam: aus dem Angebotsablauf zurück dorthin, sonst in den Raum
    const ausProjekt = state.angebotAusProjekt && state.wohnung;
    const zurueck = () => { if (ausProjekt) { state.angebotAusProjekt = false; state.project = null; return Projekt.view(); } viewProjekt(); };
    header(`Angebot ${p.room || ''}`.trim(), p.customer || '', { label: 'Zurück', fn: zurueck });
    main().innerHTML = `
      <div class="seg">${[['angebot', 'Positionen'], ['aufmass', 'Maße'], ['material', 'Material']].map(([k, l]) => `<button data-atab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="aBody"></div>`;
    
    $$('[data-atab]').forEach((b) => (b.onclick = () => { tab = b.dataset.atab; ansicht(p); }));
    if (tab === 'bauzeit') tab = 'angebot'; // Bauzeitenplan ist seit Version 100 raus (Wunsch Felix)
    ({ aufmass: aufmassView, angebot: angebotTabelle, material: materialView })[tab](p);
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
        ${scansVorOrt(p).length ? `<button class="btn small block" data-vscan style="margin-top:10px">${icon('ruler')} Maße vom Raumscan vor Ort übernehmen</button>` : ''}
        ${scansVorOrt(p).some((x) => x.raumId === p.id) ? `<button class="btn small secondary block" data-vplan style="margin-top:10px">Grundriss und 3D-Modell ansehen</button>` : ''}
        ${window.Geraet?.kann('lidar') ? `<button class="btn small ${scansVorOrt(p).length ? 'secondary ' : ''}block" data-lidar style="margin-top:10px">Raum scannen (LiDAR)</button>` : ''}
        ${p.photos.length ? `<button class="btn small secondary block" data-schaetzen style="margin-top:10px">Maße grob aus den Fotos schätzen (KI)</button>` : ''}
        ${r.schaetzung?.quelle === 'lidar' ? `<p class="muted" style="color:#9a6a12">Mit dem LiDAR-Scanner gemessen. Die Grundfläche ist das Rechteck um den Raum, bei L-Form oder Nischen bitte als Teilflächen nachtragen.${r.schaetzung.text ? `<br><i>${esc(r.schaetzung.text)}</i>` : ''}</p>` : ''}
        ${r.schaetzung && r.schaetzung.quelle !== 'lidar' ? `<p class="muted" style="color:#9a6a12">Geschätzt aus Fotos${r.schaetzung.genau ? `, ca. ±${Math.round(r.schaetzung.genau)} %` : ''}. Bitte mit dem Meterstab prüfen und korrigieren.${r.schaetzung.text ? `<br><i>${esc(r.schaetzung.text)}</i>` : ''}</p>` : ''}
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
      const vs = $('[data-vscan]', card);
      if (vs) vs.onclick = async () => {
        const l = scansVorOrt(p);
        const eigen = l.find((x) => x.raumId === p.id);
        const id = eigen ? eigen.id : l.length === 1 ? l[0].id : await sheet('Welcher Raumscan?', l.map((x) => ({ label: x.name, sub: `${fmtNum(x.laenge, 2)} × ${fmtNum(x.breite, 2)} m${x.flaeche > 0 ? ` · ${fmtNum(x.flaeche, 2)} m²` : ''}`, value: x.id })));
        const m = l.find((x) => x.id === id); if (!m) return;
        if (masse(r).boden && !confirm('Eingetragene Maße durch den Scan ersetzen?')) return;
        const rechteck = m.laenge * m.breite;
        uebernimmSchaetzung(r, { ...m, genauigkeit_prozent: null,
          begruendung: m.flaeche > 0 && rechteck > 0 && m.flaeche < rechteck * 0.92 ? `Gescannte Bodenfläche ${fmtNum(m.flaeche, 2)} m², das Rechteck ist ${fmtNum(rechteck, 2)} m². Der Raum ist also nicht rechteckig.` : '' });
        r.schaetzung.quelle = 'lidar';
        toast(`Maße aus dem Scan „${m.name}“ übernommen`); rerender();
      };
      const vp = $('[data-vplan]', card);
      if (vp) vp.onclick = () => window.Raumscan?.ansehen(state.wohnung, scansVorOrt(p).find((x) => x.raumId === p.id)?.id);
      const lb = $('[data-lidar]', card);
      if (lb) lb.onclick = async () => {
        if (masse(r).boden && !confirm('Eingetragene Maße durch den Scan ersetzen?')) return;
        try {
          const m = await Geraet.raumScannen();
          if (!m) return;
          const rechteck = m.laenge * m.breite;
          uebernimmSchaetzung(r, { ...m, genauigkeit_prozent: null,
            begruendung: m.flaeche > 0 && rechteck > 0 && m.flaeche < rechteck * 0.92 ? `Gescannte Bodenfläche ${fmtNum(m.flaeche, 2)} m², das Rechteck ist ${fmtNum(rechteck, 2)} m². Der Raum ist also nicht rechteckig.` : '' });
          r.schaetzung.quelle = 'lidar';
          toast('Maße aus dem Scan übernommen'); rerender();
        } catch (e) { toast('' + (e.message || e), 6000); }
      };
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
      const del = $('[data-delraum]', card); if (del) del.onclick = () => { if (!loeschFrage(`Raum „${r.name}“ entfernen?`)) return; p.aufmass.raeume.splice(ri, 1); rerender(); };
    });
    $('#addRaum').onclick = () => { p.aufmass.raeume.push(neuerRaum('Wohnzimmer')); rerender(); setTimeout(() => window.scrollTo(0, document.getElementById('main').scrollHeight), 50); };
    $('#zumAngebot').onclick = () => { tab = 'angebot'; ansicht(p); };
  }

  function angebotView(p) {
    const A = p.angebot, body = $('#aBody');
    // Vergleich aller Pakete (Preisrichtung für das Gespräch vor Ort)
    const vergleich = pakete(p).map((pk) => ({ pk, s: summen(erzeuge(p, pk.id).positionen, p.angebot.kalk) }));
    if (!A.positionen || !A.geaendert) { const g = erzeuge(p, A.paket); A.positionen = g.positionen; A.fehler = g.fehler; }
    const S = summen(A.positionen, A.kalk), pk = pakete(p).find((x) => x.id === A.paket) || pakete(p)[0];
    const raeume = [...new Set(A.positionen.map((x) => x.raum))];
    const gewerke = [...new Set(PL.positionen.map((x) => x.gewerk))];
    body.innerHTML = `
      <div class="card asum">
        <div class="asum-k"><span>Paket</span><select id="aPaket">${pakete(p).map((x) => `<option value="${x.id}" ${x.id === A.paket ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="asum-b"><span>Gesamt brutto</span><b>${fmtEur(S.brutto)}</b><small>netto ${fmtEur(S.netto)} · ${S.zeilen.length} Positionen</small></div>
      </div>
      ${p.otherNotes?.trim() || p.wishes?.trim() ? `<details class="more card" open><summary>${icon('mic')}<span>Aus dem Gespräch<small>Wünsche und Notizen zu diesem Raum</small></span>${icon('chevron', 'more-chev')}</summary>
        <p class="muted" style="white-space:pre-line;margin:8px 0 0">${esc([p.wishes?.trim(), p.otherNotes?.trim()].filter(Boolean).join('\n'))}</p>
        ${state.settings.apiKey ? `<button class="btn secondary block" id="aWunsch" style="margin-top:10px">${icon('sparkle')} Fehlende Positionen dazu vorschlagen</button>` : ''}</details>` : ''}
      ${A.fehler?.length ? `<p class="muted" style="color:var(--danger)">${A.fehler.map(esc).join(' · ')}</p>` : ''}
      <div class="card"><h2>Positionen</h2>
        ${raeume.map((rn) => `<h3>${esc(rn || 'Allgemein')}</h3>${S.zeilen.filter((z) => z.raum === rn).map((z) => {
          const i = z.i;
          return `<div class="posrow"><div class="pt"><b>${esc(z.it.text)}</b><span class="muted">${esc(z.nr)}${z.bem ? ' · ' + esc(z.bem) : ''}</span></div>
            <div class="pm">${numIn(`data-menge="${i}"`, z.menge)}<span class="muted">${esc(z.it.einheit)}</span></div>
            <button class="pg" data-epfix="${i}" title="Einzelpreis ändern">${fmtEur(z.gp)}<span class="${z.fix ? 'fixp' : 'muted'}">${fmtEur(z.ep)}${z.fix ? ' fest' : ''}</span></button><button class="x" data-delpos="${i}" aria-label="Entfernen">✕</button></div>`;
        }).join('')}`).join('') || '<p class="hint">Noch keine Positionen. Unten eine Position wählen oder unter „Maße“ den Raum ausmessen, dann kommen die Positionen aus dem Paket.</p>'}
        <h3>Position hinzufügen</h3>
        <select id="aNeu"><option value="">Position aus Preisliste wählen …</option>${gewerke.map((g) => `<optgroup label="${esc(g)}">${PL.positionen.filter((x) => x.gewerk === g).map((x) => `<option value="${esc(x.nr)}">${esc(x.nr)} ${esc(x.text)} (${esc(x.einheit)})</option>`).join('')}</optgroup>`).join('')}</select>
        <div class="row" style="margin-top:8px"><select id="aNeuRaum">${['', ...p.aufmass.raeume.map((r) => r.name)].map((r) => `<option value="${esc(r)}">${esc(r || 'Allgemein')}</option>`).join('')}</select>
          ${numIn('id="aNeuMenge"', '', 'Menge')}<button class="btn small" id="aAdd" style="flex:none">＋</button></div>
        <p class="hint" style="margin:10px 0 0">Preis einer Position ändern: auf den Betrag tippen. Mengen kommen aus den Maßen, bis du sie selbst änderst.</p>
      </div>
      <div class="card">
        <button class="btn big block" id="aPdf" ${S.zeilen.length ? '' : 'disabled'}>${icon('file')} Angebot als PDF senden</button>
        ${A.versionen?.length ? `<p class="muted" style="margin:8px 0 0">${A.versionen.map((v, i) => `${i ? `Änderung ${i}` : 'Erste Fassung'} vom ${fmtDate(new Date(v.t))}: ${fmtEur(v.brutto)}`).join('<br>')}</p>` : ''}
      </div>
      <details class="more card"><summary>${icon('sliders')}<span>Weitere Einstellungen<small>Nummer, Betreff, Anrede, Aufschläge, Preisrichtung, Excel</small></span>${icon('chevron', 'more-chev')}</summary>
        <div class="kform">
        <div class="row"><div><label>Angebotsnummer</label><input type="text" id="aNr" value="${esc(A.nr)}" placeholder="wird beim PDF vergeben"></div>
          <div><label>Ansprechpartner</label><select id="aAnspr">${ansprechpartner().map((x) => `<option ${x === ansprVon(A) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
        <label>Betreff (= Projektname)</label><input type="text" id="aTitel" value="${esc(betreffWert(p))}" placeholder="${esc(titelDefault(p, pk))}">
        <label>Anrede</label><input type="text" id="aAnrede" value="${esc(A.anrede)}" placeholder="${esc(anredeDefault(p))}">
        <label>Aufschläge nur für dieses Angebot (leer = Standard)</label>
        <div class="row">${[['aufLohn', 'Lohn %'], ['aufMat', 'Material %'], ['wagnis', 'Wagnis %']].map(([n, l]) => `<div><label>${l}</label><input type="text" inputmode="decimal" data-nk="${n}" value="${A.kalk?.[n] !== undefined && A.kalk?.[n] !== null && A.kalk?.[n] !== '' ? String(Math.round(A.kalk[n] * 1000) / 10).replace('.', ',') : ''}" placeholder="${String(Math.round(PL.einstellungen[n] * 1000) / 10).replace('.', ',')}"></div>`).join('')}</div>
        ${A.kalk && Object.values(A.kalk).some((v) => v !== null && v !== '') || A.positionen.some((x) => x.epFix > 0) ? '<button class="btn secondary block" id="nkReset" style="margin-top:10px">Alles auf Standard zurück</button>' : ''}
        </div>
        <h3>Preisrichtung je Paket</h3>
        ${vergleich.map(({ pk: x, s }) => `<div class="prow"><span class="swatch" style="background:${x.color};height:22px;width:6px"></span><b style="flex:1">${esc(x.name)}</b><span>${s.brutto ? `${fmtEur(s.von).replace(',00', '')} – ${fmtEur(s.bis).replace(',00', '')}` : '–'}</span></div>`).join('')}
        <div class="tot"><span class="muted">Lohnanteil brutto (§ 35a EStG)</span><span class="muted">${fmtEur(S.lohnBrutto)}</span></div>
        <button class="btn secondary block" id="aNeuBerechnen" style="margin-top:12px">↻ Positionen neu aus den Maßen berechnen</button>
        <button class="btn secondary block" id="aExcel" style="margin-top:10px" ${S.zeilen.length ? '' : 'disabled'}>Positionen fürs Excel-Tool kopieren</button>
        <input type="checkbox" id="aMitBild" hidden>
      </details>`;

    const re = () => { saveProject(p); const y = window.scrollY; angebotView(p); window.scrollTo(0, y); };
    $('#aPaket').onchange = (e) => {
      if (A.geaendert && !confirm('Deine Änderungen an den Positionen werden durch die Vorlage des anderen Pakets ersetzt. Weiter?')) { e.target.value = A.paket; return; }
      A.paket = e.target.value; A.positionen = null; A.geaendert = false; re();
    };
    for (const [id, k] of [['aNr', 'nr'], ['aAnrede', 'anrede']]) $('#' + id).oninput = (e) => { A[k] = e.target.value; persist(p); };
    betreffBinden(p);
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
    if ($('#aWunsch')) $('#aWunsch').onclick = () => wunschVorschlaege(p, re).catch((e) => toast('Vorschläge gingen nicht: ' + e.message, 5000));
    $('#aNeuBerechnen').onclick = () => { if (A.geaendert && !confirm('Eigene Änderungen an den Positionen gehen verloren. Neu berechnen?')) return; A.positionen = null; A.geaendert = false; re(); };
    $$('[data-nk]').forEach((el) => (el.onchange = () => {
      const v = el.value.trim(); A.kalk ??= {};
      if (v === '') delete A.kalk[el.dataset.nk]; else { const n = num(v); if (!Number.isFinite(n)) return toast('Bitte eine Zahl eintragen.'); A.kalk[el.dataset.nk] = n / 100; }
      re();
    }));
    if ($('#nkReset')) $('#nkReset').onclick = () => { delete A.kalk; A.positionen.forEach((x) => delete x.epFix); re(); };
    $$('[data-epfix]').forEach((b) => (b.onclick = async () => {
      const x = A.positionen[+b.dataset.epfix], it = pos(x.nr);
      const std = ep(it, A.kalk);
      const v = await sheet(`Einzelpreis netto: ${it.text}`, [{ label: `Standard verwenden (${fmtEur(std)})`, value: '__std' }], { text: 'Eigener Preis in €', value: x.epFix ? String(x.epFix).replace('.', ',') : '' });
      if (v === null) return;
      if (v === '__std') delete x.epFix;
      else { const n = num(v.text); if (!(n > 0)) return toast('Bitte einen Preis eintragen.'); x.epFix = r2(n); }
      A.geaendert = true; re();
    }));
    $('#aMitBild').onchange = (e) => { A.mitBild = e.target.checked; persist(p); };
    $('#aPdf').onclick = () => teilePdf(p).catch((e) => toast('PDF-Fehler: ' + e.message, 5000));
    $('#aExcel').onclick = async () => {
      const tsv = A.positionen.map((x) => [x.nr, x.raum || 'Allgemein', String(x.menge).replace('.', ','), x.bem].join('\t')).join('\n');
      try { await navigator.clipboard.writeText(tsv); toast('Kopiert. In Excel „Eingabe“ ab B12 einfügen.'); } catch { toast('Kopieren nicht möglich.'); }
    };
  }

  // ---------- Angebot als Tabelle (wie Excel, Wunsch Felix) ----------
  // Alle Positionen der Preisliste untereinander, nach Gewerk. Menge eintippen (0, 1 oder m²), die Summe läuft oben mit.
  // Darunter eigene Positionen mit Text, Einheit, Menge und Preis. Oben die Maße des Raums und „aus Paket vorbelegen“.
  let nurGewaehlt = false, tabSuche = '', plWahl = ''; // plWahl: Partner, dessen Preisliste gerade gezeigt wird ('' = allgemeine)
  function angebotTabelle(p) {
    const A = p.angebot, body = $('#aBody');
    if (!A.positionen) { const g = erzeuge(p, A.paket); A.positionen = g.positionen; A.fehler = g.fehler; }
    const raumName = p.aufmass.raeume[0]?.name || p.room || '';
    const pk = pakete(p).find((x) => x.id === A.paket) || pakete(p)[0];
    const mengeVon = (nr) => A.positionen.filter((x) => x.nr === nr).reduce((s, x) => s + (+x.menge || 0), 0);
    const r0 = p.aufmass.raeume[0], m0 = r0 ? masse(r0) : null;
    const gewerke = [...new Set(PL.positionen.map((x) => x.gewerk))];
    const frei = A.positionen.filter((x) => x.frei);
    // Aus dem Angebotsablauf geöffnet: Nummer, Betreff, Anrede, Aufschläge, Speichern und Senden stehen dort im Büro
    const ausPrj = !!(state.angebotAusProjekt && state.wohnung);
    // Preisliste wählbar (Wunsch Felix): die allgemeine oder die eines Partners. Partnerpreise ohne Zuschlag, kalkuliert wird im Angebot.
    const plPartner = (window.Partner?.liste() || []).filter((x) => x.art !== 'aussen' && ((x.eigenePreise || []).length || Object.keys(x.preise || {}).length));
    const plP = plPartner.find((x) => x.id === plWahl) || null;
    const plZeilen = plP ? [...(plP.eigenePreise || []).map((x) => ({ key: 'e:' + x.id, text: x.text || '', einheit: x.einheit || 'Stück', ep: +x.preis || 0 })),
      ...Object.entries(plP.preise || {}).map(([nr, preis]) => { const it = pos(nr); return it ? { key: 'p:' + nr, text: it.text, einheit: it.einheit, ep: +preis || 0 } : null; }).filter(Boolean)].filter((z) => z.text.trim()) : [];
    const plPos = (key) => A.positionen.find((x) => x.sub && x.sub.partnerId === plP?.id && x.sub.key === key);
    const zeileHtml = (it) => {
      const q = mengeVon(it.nr), x = A.positionen.find((y) => y.nr === it.nr), e = x?.epFix > 0 ? x.epFix : ep(it, A.kalk);
      return `<div class="tb-z ${q ? 'an' : ''}" data-tz="${esc(it.nr)}" data-such="${esc(`${it.nr} ${it.text} ${it.gewerk}`.toLowerCase())}">
        <span class="tb-t"><b>${esc(it.text)}</b><small>${esc(it.nr)} · ${fmtEur(e)} je ${esc(it.einheit)}${x?.epFix > 0 ? ' (eigener Preis)' : ''}${x?.ki?.sicher === 'geschaetzt' ? ' · <span class="wf-b mittel">geschätzt</span>' : ''}</small></span>
        <input type="text" inputmode="decimal" data-q="${esc(it.nr)}" value="${q ? fmtIn(Math.round(q * 100) / 100) : ''}" placeholder="0" aria-label="Menge ${esc(it.text)}">
        <span class="tb-e">${esc(it.einheit)}</span>
        <button type="button" class="tb-gp" data-tp="${esc(it.nr)}" title="Preis ändern">${q ? fmtEur(r2(q * e)) : ''}</button></div>`;
    };
    body.innerHTML = `
      <div class="card asum tb-sum">
        <div class="asum-k"><span>Paket</span><select id="aPaket">${pakete(p).map((x) => `<option value="${x.id}" ${x.id === A.paket ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="asum-b"><span>Gesamt brutto</span><b id="tbBrutto"></b><small id="tbNetto"></small></div>
      </div>

      <div class="card kform">
        <div class="hv-h" style="margin-top:0">${icon('ruler')}<span>Maße ${esc(raumName)}</span></div>
        <div class="row tb-masse"><div><label>Länge m</label><input type="text" inputmode="decimal" data-mass="l" value="${fmtIn(r0?.teile?.[0]?.l)}" placeholder="z. B. 3"></div>
          <div><label>Breite m</label><input type="text" inputmode="decimal" data-mass="b" value="${fmtIn(r0?.teile?.[0]?.b)}" placeholder="z. B. 2"></div>
          <div><label>Höhe m</label><input type="text" inputmode="decimal" data-mass="h" value="${fmtIn(r0?.h)}" placeholder="2,50"></div></div>
        <p class="hint" style="margin:6px 0 0" id="tbMassInfo">${m0?.boden ? `${fmtNum(m0.boden)} m² Boden · ${fmtNum(m0.wand)} m² Wand` : 'Mit den Maßen rechnet „Aus Paket vorbelegen“ die Mengen aus.'}</p>
        <div class="row" style="margin-top:10px">
          ${state.settings.apiKey && (p.otherNotes?.trim() || p.wishes?.trim() || (state.wohnung?.gespraech?.transcript || '').trim()) ? `<button class="btn secondary small" id="tbMassKi">${icon('mic')} Maße aus dem Gespräch</button>` : ''}
          <button class="btn secondary small" id="tbPaket">${icon('clipboard')} Aus Paket „${esc(pk?.name || '')}“ vorbelegen</button>
        </div>
      </div>

      ${p.otherNotes?.trim() || p.wishes?.trim() ? `<details class="more card"><summary>${icon('mic')}<span>Aus dem Gespräch<small>Wünsche und Notizen zu diesem Raum</small></span>${icon('chevron', 'more-chev')}</summary>
        <p class="muted" style="white-space:pre-line;margin:8px 0 0">${esc([p.wishes?.trim(), p.otherNotes?.trim()].filter(Boolean).join('\n'))}</p>
        ${state.settings.apiKey ? `<button class="btn secondary block" id="aWunsch" style="margin-top:10px">${icon('sparkle')} Fehlende Positionen dazu vorschlagen</button>` : ''}</details>` : ''}

      ${plPartner.length ? `<label class="tb-pl"><span>Preisliste</span><select id="tbPL"><option value="">Allgemeine Preisliste</option>${plPartner.map((x) => `<option value="${esc(x.id)}" ${x.id === plP?.id ? 'selected' : ''}>${esc(x.firma || x.inhaber || 'Partner')}</option>`).join('')}</select></label>` : ''}
      <div class="tb-kopf" ${plP ? 'hidden' : ''}>
        <label class="search">${icon('search')}<input type="search" id="tbQ" value="${esc(tabSuche)}" placeholder="Position suchen, z. B. Fliesen" autocomplete="off"></label>
        <button type="button" class="qchip ${nurGewaehlt ? 'on' : ''}" id="tbNur">${icon('check')} Nur gewählte</button>
      </div>
      ${plP ? `<div class="card tb-g tb-plp"><p class="hint" style="margin:0 0 6px">Preise von ${esc(plP.firma || plP.inhaber || 'Partner')}, ohne Zuschlag. Menge eintragen, die Zeile steht dann unten bei „Eigene Positionen“. Dort trägst du deinen Preis für den Kunden ein.</p>${plZeilen.map((z) => { const x = plPos(z.key); return `<div class="tb-z ${x ? 'an' : ''}"><span class="tb-t"><b>${esc(z.text)}</b><small>${fmtEur(z.ep)} je ${esc(z.einheit)}</small></span>
        <input type="text" inputmode="decimal" data-pq="${esc(z.key)}" value="${x ? fmtIn(x.menge) : ''}" placeholder="0" aria-label="Menge ${esc(z.text)}"><span class="tb-e">${esc(z.einheit)}</span><span class="tb-gp"></span></div>`; }).join('')}</div>` : ''}
      <div id="tbListe" ${plP ? 'hidden' : ''}>${gewerke.map((g) => {
        const its = PL.positionen.filter((x) => x.gewerk === g);
        const n = its.filter((it) => mengeVon(it.nr) > 0).length;
        return `<details class="card tb-g" data-gw="${esc(g)}" ${n ? 'open' : ''}><summary><b>${esc(g)}</b><span class="count" data-gn>${n || ''}</span></summary>${its.map(zeileHtml).join('')}</details>`;
      }).join('')}</div>

      <div class="sec-h"><h2>Eigene Positionen</h2>${frei.length ? `<span class="count">${frei.length}</span>` : ''}</div>
      <div class="card tb-frei">${frei.map((x) => `<div class="tb-fz" data-fz="${esc(x.nr)}">
          <input type="text" data-ff="text" value="${esc(x.frei.text || '')}" placeholder="Leistung, z. B. Nische mit LED" autocomplete="off">
          ${x.ki?.partner && !(x.sub?.ep > 0) ? '<small class="tb-sub"><span class="wf-b partner">Preis kommt von Partner</span></small>' : x.ki?.sicher === 'geschaetzt' ? '<small class="tb-sub"><span class="wf-b mittel">Menge geschätzt, bitte prüfen</span></small>' : ''}
          ${x.sub && !(x.ki?.partner && !(x.sub.ep > 0)) ? `<small class="tb-sub">Von ${esc(window.Partner?.byId(x.sub.partnerId)?.firma || x.sub.firma || 'Partner')} · Einkauf ${fmtEur(x.sub.ep)}${x.sub.zuschlag > 0 ? ` + ${fmtNum(x.sub.zuschlag, 0)} %` : ''}</small>` : ''}
          <div class="row"><div><input type="text" inputmode="decimal" data-ff="menge" value="${fmtIn(x.menge)}" placeholder="Menge"></div>
            <div><input type="text" data-ff="einheit" value="${esc(x.frei.einheit || '')}" placeholder="Einheit"></div>
            <div><input type="text" inputmode="decimal" data-ff="preis" value="${fmtIn(x.epFix)}" placeholder="€ netto je Einh."></div>
            <button type="button" class="icon-btn" data-fdel aria-label="Entfernen">${icon('trash')}</button></div></div>`).join('') || '<p class="hint" style="margin:0">Alles, was nicht in der Preisliste steht, mit eigenem Preis.</p>'}
        <button type="button" class="link-add" id="tbFrei" style="margin-top:8px">${icon('plus')} Eigene Position hinzufügen</button>
        <button type="button" class="btn secondary block" id="tbSub" style="margin-top:8px">${icon('wrench')} Partnerangebot übernehmen (Scan, Foto, PDF) oder Preisliste</button>
      </div>

      ${ausPrj ? `<div class="card"><button class="btn big block" id="aFertig">${icon('check')} Fertig</button>
        <p class="hint center" style="margin:6px 0 0">Nummer, Betreff, Texte, Speichern und Senden stehen eine Seite zurück im Büro.</p></div>` : `<div class="card">
        <button class="btn secondary big block" id="aSpeichern">${icon('download')} Speichern und ansehen</button>
        <button class="btn big block" id="aPdf" style="margin-top:8px">${icon('mail')} Senden</button>
        <p class="hint center" style="margin:6px 0 0">Nach dem Senden ist das Angebot gesperrt. Ändern geht dann über eine Kopie mit neuer Nummer.</p>
        ${A.versionen?.length ? `<p class="muted" style="margin:8px 0 0">${A.versionen.map((v, i) => `${i ? `Änderung ${i}` : 'Erste Fassung'} vom ${fmtDate(new Date(v.t))}: ${fmtEur(v.brutto)}`).join('<br>')}</p>` : ''}
      </div>`}
      <details class="more card"><summary>${icon('sliders')}<span>${ausPrj ? 'Mehr<small>Alle Mengen auf 0, Excel</small>' : 'Weitere Einstellungen<small>Nummer, Betreff, Anrede, Aufschläge, Excel</small>'}</span>${icon('chevron', 'more-chev')}</summary>
        ${ausPrj ? '' : `<div class="kform">
        <div class="row"><div><label>Angebotsnummer</label><input type="text" id="aNr" value="${esc(A.nr)}" placeholder="wird beim PDF vergeben"></div>
          <div><label>Ansprechpartner</label><select id="aAnspr">${ansprechpartner().map((x) => `<option ${x === ansprVon(A) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div></div>
        <label>Betreff (= Projektname)</label><input type="text" id="aTitel" value="${esc(betreffWert(p))}" placeholder="${esc(titelDefault(p, pk))}">
        <label>Anrede</label><input type="text" id="aAnrede" value="${esc(A.anrede)}" placeholder="${esc(anredeDefault(p))}">
        <label>Aufschläge nur für dieses Angebot (leer = Standard)</label>
        <div class="row">${[['aufLohn', 'Lohn %'], ['aufMat', 'Material %'], ['wagnis', 'Wagnis %']].map(([n, l]) => `<div><label>${l}</label><input type="text" inputmode="decimal" data-nk="${n}" value="${A.kalk?.[n] !== undefined && A.kalk?.[n] !== null && A.kalk?.[n] !== '' ? String(Math.round(A.kalk[n] * 1000) / 10).replace('.', ',') : ''}" placeholder="${String(Math.round(PL.einstellungen[n] * 1000) / 10).replace('.', ',')}"></div>`).join('')}</div>
        </div>`}
        <button class="btn secondary block" id="tbLeeren" style="margin-top:12px">${icon('x')} Alle Mengen auf 0</button>
        <button class="btn secondary block" id="aExcel" style="margin-top:10px">Positionen fürs Excel-Tool kopieren</button>
      </details>`;

    // ----- Summe oben ohne Neuzeichnen aktualisieren -----
    const summe = () => {
      const S = summen(A.positionen, A.kalk);
      $('#tbBrutto').textContent = fmtEur(S.brutto);
      $('#tbNetto').textContent = `netto ${fmtEur(S.netto)} · ${S.zeilen.length} Positionen`;
      $$('.tb-g', body).forEach((d) => { const n = $$('.tb-z.an', d).length; $('[data-gn]', d).textContent = n || ''; });
    };
    const speichern = debounce(() => saveProject(p), 500);
    const neu = () => { saveProject(p); const y = window.scrollY; angebotTabelle(p); window.scrollTo(0, y); };
    const filtern = () => {
      const w = tabSuche.trim().toLowerCase().split(/\s+/).filter(Boolean);
      $$('.tb-z', body).forEach((z) => { z.hidden = (nurGewaehlt && !z.classList.contains('an')) || (w.length && !w.every((x) => z.dataset.such.includes(x))); });
      $$('.tb-g', body).forEach((d) => { const sicht = $$('.tb-z', d).some((z) => !z.hidden); d.hidden = !sicht; if ((w.length || nurGewaehlt) && sicht) d.open = true; });
    };
    summe(); filtern();
    if ($('#tbPL')) $('#tbPL').onchange = (e) => { plWahl = e.target.value; neu(); };
    // Menge aus der Preisliste eines Partners: wird eine eigene Position zum Einkaufspreis, ohne Zuschlag
    $$('[data-pq]', body).forEach((inp) => (inp.onchange = () => {
      const z = plZeilen.find((y) => y.key === inp.dataset.pq), q = num(inp.value), alt = plPos(z.key);
      if (alt && !(q > 0)) A.positionen = A.positionen.filter((y) => y !== alt);
      else if (alt) alt.menge = q;
      else if (q > 0) A.positionen.push({ nr: 'FREI-' + uid(), frei: { text: z.text, einheit: z.einheit }, raum: raumName, menge: q, bem: '', epFix: r2(z.ep), sub: { partnerId: plP.id, firma: plP.firma || plP.inhaber || '', ep: r2(z.ep), zuschlag: 0, key: z.key } });
      A.geaendert = true; neu();
    }));
    // Menge eintippen: eine Zeile je Position (Raum = dieser Raum, Allgemeines ohne Raum)
    $$('[data-q]', body).forEach((inp) => (inp.oninput = () => {
      const nr = inp.dataset.q, it = pos(nr), q = num(inp.value), alt = A.positionen.find((x) => x.nr === nr);
      A.positionen = A.positionen.filter((x) => x.nr !== nr);
      if (q > 0) A.positionen.push({ nr, raum: it.gewerk === 'Allgemein' ? '' : raumName, menge: q, bem: alt?.bem || '', ...(alt?.epFix > 0 ? { epFix: alt.epFix } : {}) });
      A.geaendert = true;
      const z = inp.closest('.tb-z'), e = alt?.epFix > 0 ? alt.epFix : ep(it, A.kalk);
      z.classList.toggle('an', q > 0); $('.tb-gp', z).textContent = q > 0 ? fmtEur(r2(q * e)) : '';
      summe(); speichern();
    }));
    // Preis einer Zeile ändern
    $$('[data-tp]', body).forEach((b) => (b.onclick = async () => {
      const nr = b.dataset.tp, it = pos(nr), x = A.positionen.find((y) => y.nr === nr);
      if (!x) return toast('Zuerst eine Menge eintragen.');
      const v = await sheet(`Einzelpreis netto: ${it.text}`, [{ label: `Standard verwenden (${fmtEur(ep(it, A.kalk))})`, value: '__std' }], { text: 'Eigener Preis in €', value: x.epFix ? fmtIn(x.epFix) : '' });
      if (v === null) return;
      if (v === '__std') delete x.epFix; else { const n = num(v.text); if (!(n > 0)) return toast('Bitte einen Preis eintragen.'); x.epFix = r2(n); }
      A.geaendert = true; neu();
    }));
    $('#tbQ').oninput = (e) => { tabSuche = e.target.value; filtern(); };
    $('#tbNur').onclick = () => { nurGewaehlt = !nurGewaehlt; $('#tbNur').classList.toggle('on', nurGewaehlt); filtern(); };
    // Maße
    $$('[data-mass]', body).forEach((inp) => (inp.onchange = () => {
      const r = p.aufmass.raeume[0] || (p.aufmass.raeume[0] = neuerRaum(p.room || 'Raum'));
      r.teile ??= [{ l: '', b: '' }]; r.teile[0] ??= { l: '', b: '' };
      if (inp.dataset.mass === 'h') r.h = inp.value.trim(); else r.teile[0][inp.dataset.mass] = inp.value.trim();
      p.masse = { l: r.teile[0].l, b: r.teile[0].b, h: r.h };
      const m = masse(r); $('#tbMassInfo').textContent = m.boden ? `${fmtNum(m.boden)} m² Boden · ${fmtNum(m.wand)} m² Wand` : '';
      speichern();
    }));
    $('#tbPaket').onclick = () => {
      if (!m0?.boden && !(num($('[data-mass="l"]').value) && num($('[data-mass="b"]').value))) return toast('Bitte zuerst Länge und Breite eintragen.');
      if (A.positionen.length && !confirm(`Die Mengen werden aus dem Paket „${pk?.name || ''}“ und den Maßen neu berechnet. Eigene Positionen bleiben. Weiter?`)) return;
      const eigene = A.positionen.filter((x) => x.frei);
      const g = erzeuge(p, A.paket); A.positionen = [...g.positionen, ...eigene]; A.fehler = g.fehler; A.geaendert = true; neu();
    };
    if ($('#tbMassKi')) $('#tbMassKi').onclick = async () => {
      toast('KI sucht die Maße im Gespräch …', 15000);
      try {
        const j = JSON.parse(await geminiText([{ text: `Im Gespräch wurde der Raum „${raumName}“ besprochen. Welche Maße wurden genannt? laenge und breite in Metern (Grundfläche), hoehe in Metern (Raumhöhe). 0, wenn nicht genannt.\n\nNOTIZEN:\n${p.otherNotes || ''}\n${p.wishes || ''}\n\nGESPRÄCH:\n${(state.wohnung?.gespraech?.transcript || '').slice(0, 30000)}` }], true,
          { responseSchema: { type: 'OBJECT', properties: { laenge: { type: 'NUMBER' }, breite: { type: 'NUMBER' }, hoehe: { type: 'NUMBER' } } } }));
        $('#toast').hidden = true;
        if (!(j.laenge > 0 && j.breite > 0)) return toast('Im Gespräch wurden keine Maße für diesen Raum gefunden.', 4000);
        const r = p.aufmass.raeume[0] || (p.aufmass.raeume[0] = neuerRaum(p.room || 'Raum'));
        r.teile = [{ l: fmtIn(j.laenge), b: fmtIn(j.breite) }]; if (j.hoehe > 0) r.h = fmtIn(j.hoehe);
        p.masse = { l: r.teile[0].l, b: r.teile[0].b, h: r.h };
        toast(`Übernommen: ${fmtIn(j.laenge)} × ${fmtIn(j.breite)} m${j.hoehe > 0 ? `, ${fmtIn(j.hoehe)} m hoch` : ''}`, 4000); neu();
      } catch (e) { toast('Maße nicht gefunden: ' + e.message, 5000); }
    };
    // Eigene Positionen
    $('#tbFrei').onclick = () => { A.positionen.push({ nr: 'FREI-' + uid(), frei: { text: '', einheit: 'Stück' }, raum: raumName, menge: 1, bem: '', epFix: 0 }); A.geaendert = true; neu(); setTimeout(() => $$('[data-fz] [data-ff="text"]').pop()?.focus(), 50); };
    $$('[data-fz]', body).forEach((row) => {
      const x = A.positionen.find((y) => y.nr === row.dataset.fz);
      $$('[data-ff]', row).forEach((inp) => (inp.oninput = () => {
        const f = inp.dataset.ff;
        if (f === 'text' || f === 'einheit') x.frei[f] = inp.value; else if (f === 'menge') { x.menge = num(inp.value); if (x.ki) x.ki.sicher = ''; } else x.epFix = r2(num(inp.value));
        A.geaendert = true; summe(); speichern();
      }));
      $('[data-fdel]', row).onclick = () => { if (!loeschFrage('Eigene Position entfernen?')) return; A.positionen = A.positionen.filter((y) => y !== x); neu(); };
    });
    // Rest wie bisher
    $('#aPaket').onchange = (e) => { A.paket = e.target.value; saveProject(p); toast('Paket geändert. Mit „Aus Paket vorbelegen“ werden die Mengen neu berechnet.', 4000); neu(); };
    for (const [id, k] of [['aNr', 'nr'], ['aAnrede', 'anrede']]) if ($('#' + id)) $('#' + id).oninput = (e) => { A[k] = e.target.value; persist(p); };
    betreffBinden(p);
    if ($('#aAnspr')) $('#aAnspr').onchange = (e) => { A.anspr = e.target.value; persist(p); };
    $$('[data-nk]', body).forEach((el) => (el.onchange = () => {
      const v = el.value.trim(); A.kalk ??= {};
      if (v === '') delete A.kalk[el.dataset.nk]; else { const n = num(v); if (!Number.isFinite(n)) return toast('Bitte eine Zahl eintragen.'); A.kalk[el.dataset.nk] = n / 100; }
      neu();
    }));
    $('#tbLeeren').onclick = () => { if (!confirm('Alle Mengen auf 0 setzen? Eigene Positionen bleiben.')) return; A.positionen = A.positionen.filter((x) => x.frei); A.geaendert = true; neu(); };
    if ($('#aWunsch')) $('#aWunsch').onclick = () => wunschVorschlaege(p, neu).catch((e) => toast('Vorschläge gingen nicht: ' + e.message, 5000));
    if ($('#aFertig')) $('#aFertig').onclick = async () => { await saveProject(p); state.angebotAusProjekt = false; state.project = null; Projekt.view(); window.scrollTo(0, 0); };
    if ($('#aPdf')) $('#aPdf').onclick = () => { if (!summen(A.positionen, A.kalk).zeilen.length) return toast('Bitte zuerst Mengen eintragen.'); teilePdf(p).catch((e) => toast('PDF-Fehler: ' + e.message, 5000)); };
    if ($('#aSpeichern')) $('#aSpeichern').onclick = () => { if (!summen(A.positionen, A.kalk).zeilen.length) return toast('Bitte zuerst Mengen eintragen.'); speicherePdf(p).catch((e) => toast('PDF-Fehler: ' + e.message, 5000)); };
    $('#tbSub').onclick = () => subUebernehmen(p, neu).catch((e) => toast('Übernehmen ging nicht: ' + e.message, 5000));
    $('#aExcel').onclick = async () => {
      const tsv = A.positionen.filter((x) => !x.frei).map((x) => [x.nr, x.raum || 'Allgemein', String(x.menge).replace('.', ','), x.bem].join('\t')).join('\n');
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

  // Ansprechpartner (Wunsch Felix, Version 100): immer genau eine Person. Standard im Angebot: Vorgabe ansprechAngebot,
  // im Projekt nach der Zusage: ansprechProjekt. Je Angebot wählbar (A.anspr). Ältere Werte mit zwei Namen gelten als „nicht gewählt“.
  const einePerson = (v) => { const s = String(v || '').trim(); return s && !/\s·\s|,|&|\s+und\s+/.test(s) ? s : ''; };
  const ansprechpartner = () => {
    const team = (window.Kalender?.team() || []).map((x) => x.name);
    const alt = String(PL?.einstellungen?.ansprechpartner || '').split(/\s*[·,&]\s*|\s+und\s+|\s+-\s+/);
    return [...new Set([vorgabe('ansprechAngebot'), vorgabe('ansprechProjekt'), ...team, ...alt].map(einePerson).filter(Boolean))];
  };
  const ansprVon = (A) => einePerson(A?.anspr) || ansprechpartner()[0] || '';
  // Betreff = Projektname (Wunsch Felix, Version 100): ein Feld, steht im Projekt (w.titel). Ohne Projekt bleibt der Betreff im Raum.
  const wVon = (p) => (p?.wohnungId && state.wohnung?.id === p.wohnungId ? state.wohnung : null);
  const betreffWert = (p) => wVon(p)?.titel || p.angebot?.titel || '';
  function betreffBinden(p) {
    const el = $('#aTitel'); if (!el) return;
    const sichern = debounce(async () => { const w = wVon(p); if (w && !w.isNew) await Projekt.save(w); }, 500);
    el.oninput = () => { const w = wVon(p); if (w) { w.titel = el.value.trim(); sichern(); } else { p.angebot.titel = el.value; persist(p); } };
  }
  const titelDefault = (p, pk) => `Sanierung ${[...new Set(p.aufmass.raeume.map((r) => r.name))].join(', ')}, Ausstattung ${pk?.name || ''}`;
  const anredeDefault = (p) => { const k = window.Kunden?.zu(p); return k ? Kunden.briefAnrede(k) : anredeAlt(p); };
  const anredeAlt = (p) => (p.customer ? (/^(familie|herr|frau)\b/i.test(p.customer) ? `Sehr geehrte${/^herr/i.test(p.customer) ? 'r' : ''} ${p.customer},` : `Guten Tag ${p.customer},`) : 'Sehr geehrte Damen und Herren,');

  // ---------- PDF ----------
  // opt.art = 'ab': dasselbe PDF als Auftragsbestätigung (andere Überschrift und Einleitung, ohne „gültig bis“ und ohne Auftragserteilung)
  async function baueAngebotPdf(p, opt = {}) {
    const ab = opt.art === 'ab';
    const A = p.angebot, E = PL.einstellungen, S = summen(A.positionen, A.kalk);
    const pk = pakete(p).find((x) => x.id === A.paket) || pakete(p)[0];
    if (!A.nr) { A.nr = await naechsteNummer(); if (!p._gesamt) await saveProject(p); }
    // Versionen (B8): jede geänderte Fassung bekommt „Änderung n“, damit man sieht, was der Kunde bekommen hat
    const sig = JSON.stringify(A.positionen.map((x) => [x.nr, x.raum, x.menge]));
    A.versionen ??= [];
    if (!ab && A.versionen[A.versionen.length - 1]?.sig !== sig) { A.versionen.push({ t: Date.now(), brutto: S.brutto, sig }); if (!p._gesamt) await saveProject(p); }
    const nrText = A.nr + (A.versionen.length > 1 ? ` (Änderung ${A.versionen.length - 1})` : '');
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
    // Empfänger: Kunde mit Privatanschrift (aus der Kundenkarte), sonst die Objektanschrift
    const kd = window.Kunden?.zu(p);
    const post = window.Kunden?.postanschrift(kd); // bei Hausverwaltung: „WEG …, vertreten durch …“
    const adr = (post || [kd ? Kunden.name(kd) || p.customer : p.customer, ...String(p.address || '').split(/\s*,\s*|\n/)]).map((x) => String(x || '').trim()).filter(Boolean);
    const bauvorhaben = p.address && post && !adr.join(', ').toLowerCase().includes(Kunden.einzeilig(p.address).toLowerCase()) ? Kunden.einzeilig(p.address) : '';
    adr.forEach((l, i) => t(l, M, 55 + i * 5));
    doc.setFontSize(9);
    const meta = [[ab ? 'Zu Angebot Nr.' : 'Angebot Nr.', nrText], ...(kd?.nr ? [['Kunden-Nr.', kd.nr]] : []), ...(p.projektNr ? [['Projekt-Nr.', p.projektNr]] : []), ['Datum', fmtDate(heute)], ...(ab ? [] : [['Gültig bis', fmtDate(gueltig)]]), ['Ansprechpartner', ansprVon(A)], ['Telefon', E.telefon], ['E-Mail', E.email]];
    // Projekt des Angebots (Texte, Betreff = Projektname)
    const WA = p.wohnungId && (state.wohnung?.id === p.wohnungId ? state.wohnung : await kvGet('wohnung:' + p.wohnungId));
    let my = 52;
    for (const [k, v] of meta) { doc.setTextColor(120); t(k, 128, my); doc.setTextColor(30); const lines = doc.splitTextToSize(String(v), R - 158); t(lines, 158, my); my += 4.6 * lines.length; }
    y = Math.max(92, my + 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY);
    const titel = doc.splitTextToSize((ab ? 'Auftragsbestätigung: ' : 'Angebot: ') + (String(WA?.titel || '').trim() || A.titel || titelDefault(p, pk)), R - M); t(titel, M, y); y += 6 * titel.length + 3;
    if (bauvorhaben) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110); t('Bauvorhaben: ' + bauvorhaben, M, y - 1); y += 5; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30);
    t(A.anrede || anredeDefault(p), M, y); y += 5;
    // Textfelder (Wunsch Felix): frei festlegbar in den Einstellungen, je Auftrag anpassbar (w.angebotTexte)
    // Abgewählte Bausteine (b.aus, im Büro abgehakt) stehen nicht im PDF
    const B = texteFuer(WA).filter((b) => !b.aus && (String(b.text || '').trim() || String(b.titel || '').trim()));
    const VOR = ab ? [{ titel: '', text: vorgabe('abEinleitung') }] : B.filter((x) => x.wo === 'vor');
    const platzh = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, n) => ({ zeitraum: zeitraumText(bz), nr: nrText, gueltig: fmtDate(gueltig), datum: fmtDate(heute), kunde: (kd && Kunden.name(kd)) || p.customer || '' })[n] ?? m);
    for (const b of VOR) {
      if (String(b.titel || '').trim()) { doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); t(b.titel, M, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setTextColor(30); }
      for (const abs of platzh(b.text).split(/\n\s*\n/)) { const ls = doc.splitTextToSize(abs.trim(), R - M); t(ls, M, y); y += 4.6 * ls.length + 1.5; }
    }
    y += 3;

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
      if (titelA) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); t(titelA, M, y); y += 5; }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40);
      for (const z of zeilen) { for (const l of z) { await platz(5); t(l, M, y); y += 4.2; } y += 1.2; }
      y += 3;
    };
    const NACH = B.filter((x) => x.wo !== 'vor');
    for (const b of NACH.filter((x) => !x.fest)) await abschnitt(String(b.titel || '').trim(), platzh(b.text).split(/\n\s*\n/).map((s) => s.trim()));
    const fest = (k) => NACH.find((x) => x.fest === k);
    // Auftragserteilung (Baustein, nicht in der Auftragsbestätigung): darunter unterschreibt der Kunde
    if (!ab && fest('auftrag')) {
      const fa = fest('auftrag');
      await platz(44);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); t(String(fa.titel || '').trim() || 'Auftragserteilung', M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40);
      const ls = doc.splitTextToSize(`${platzh(fa.text).trim()} (Angebot Nr. ${nrText} vom ${fmtDate(heute)}, ${fmtEur(S.brutto)} brutto)`.trim(), R - M);
      t(ls, M, y); y += 4.3 * ls.length + 15;
      doc.setDrawColor(120); doc.line(M, y, M + 60, y); doc.line(M + 80, y, R, y);
      doc.setFontSize(8); doc.setTextColor(120); t('Ort, Datum', M, y + 4); t('Unterschrift Auftraggeber', M + 80, y + 4);
      y += 14;
    }
    // Ganz zum Schluss: Gruß, Name des Ansprechpartners, Unterschrift und Stempel (unterschrift.js)
    if (fest('gruss')) {
      const gruss = ab ? vorgabe('abSchluss') : platzh(fest('gruss').text);
      await platz(44); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30);
      if (String(gruss || '').trim()) { const ls = doc.splitTextToSize(String(gruss).trim(), R - M); t(ls, M, y); y += 5 * ls.length + 2; }
      if (window.Unterschrift?.pdf) y = (await window.Unterschrift.pdf(doc, M, y, { firma: E.firma, name: ansprVon(A) })) || y + 12;
      else { t(String(vorgabe('textGruss') || 'Mit freundlichen Grüßen'), M, y); y += 5; t(ansprVon(A), M, y); y += 5; t(E.firma, M, y); y += 5; }
      y += 7;
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

  /** B3: Die KI schlägt aus den Kundenwünschen Positionen der Preisliste vor, die noch fehlen. Du hakst an, was rein soll. */
  async function wunschVorschlaege(p, fertig) {
    const A = p.angebot;
    toast('KI sucht passende Positionen …', 20000);
    const katalog = PL.positionen.map((x) => `${x.nr} | ${x.text} | ${x.einheit}`).join('\n');
    const vorhanden = A.positionen.map((x) => x.nr).join(', ');
    const raeume = p.aufmass.raeume.map((r) => r.name);
    const txt = await geminiText([{ text: `Du kalkulierst ein Sanierungsangebot. Kundenwünsche:\n${p.wishes || ''}\n${p.otherNotes || ''}\n\nRäume im Aufmaß: ${raeume.join(', ') || 'keine'}\nSchon im Angebot: ${vorhanden || 'nichts'}\n\nPreisliste (nr | text | einheit):\n${katalog}\n\nSchlage nur Positionen aus der Preisliste vor, die für die Wünsche nötig sind und noch fehlen. Menge realistisch schätzen. grund = welcher Wunsch, kurz.` }], true, {
      responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { nr: { type: 'STRING' }, menge: { type: 'NUMBER' }, raum: { type: 'STRING' }, grund: { type: 'STRING' } }, required: ['nr', 'menge'] } } });
    $('#toast').hidden = true;
    const vor = (() => { try { const j = JSON.parse(txt); return Array.isArray(j) ? j : []; } catch { return []; } })().map((v) => ({ ...v, it: pos(v.nr) })).filter((v) => v.it && v.menge > 0);
    if (!vor.length) return toast('Keine fehlenden Positionen gefunden.', 4000);
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" style="overflow:auto"><div class="sheet-h"><b>Vorschläge aus den Wünschen</b></div>
      ${vor.map((v, i) => `<label class="check wv"><input type="checkbox" data-wv="${i}" checked><span><b>${esc(v.it.text)}</b><span class="muted">${fmtNum(v.menge, v.menge % 1 ? 1 : 0)} ${esc(v.it.einheit)}${v.grund ? ' · ' + esc(v.grund) : ''}</span></span></label>`).join('')}
      <button class="btn block" data-ok style="margin-top:12px">Ausgewählte übernehmen</button><button class="btn secondary block" data-zu style="margin-top:8px">Abbrechen</button></div>`;
    document.body.appendChild(bg);
    requestAnimationFrame(() => bg.classList.add('on'));
    const zu = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg) zu(); };
    $('[data-zu]', bg).onclick = zu;
    $('[data-ok]', bg).onclick = () => {
      const raumOk = (r) => (raeume.includes(r) ? r : raeume[0] || '');
      for (const el of $$('[data-wv]', bg)) if (el.checked) { const v = vor[+el.dataset.wv]; A.positionen.push({ nr: v.nr, raum: v.it.gewerk === 'Allgemein' ? '' : raumOk(v.raum), menge: STUECK.test(v.it.einheit) ? Math.ceil(v.menge) : Math.round(v.menge * 10) / 10, bem: '' }); }
      A.geaendert = true; zu(); fertig(); toast('Übernommen');
    };
  }
  const mailText = (p) => vorgabeText('mailAngebot', { anrede: p.angebot.anrede || anredeDefault(p), nr: p.angebot.nr, firma: PL.einstellungen.firma || '' });
  async function pdfDatei(p) {
    toast('Angebot wird erstellt …', 8000);
    const doc = await baueAngebotPdf(p);
    const name = `Angebot_${p.angebot.nr}_${(p.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`;
    const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
    $('#toast').hidden = true;
    if ($('#aNr')) $('#aNr').value = p.angebot.nr;
    return { doc, name, file };
  }
  /** Speichern: PDF beim Auftrag unter „Dokumente“ ablegen und ansehen. Nichts wird verschickt. */
  async function speicherePdf(p) {
    const { file } = await pdfDatei(p);
    await saveProject(p);
    if (await dokMerken([file])) toast('Gespeichert beim Kunden unter „Dokumente“. Senden mit „Senden“.', 4500);
    else toast('Ansehen geht, gespeichert wird erst, wenn der Auftrag angelegt ist.', 4500);
    pdfAnsicht(file, file.name);
  }
  async function teilePdf(p) {
    const { doc, name, file } = await pdfDatei(p);
    const blob = file;
    // Erst nach dem Senden: „wie verschickt“ merken und sperren, dann zurück in den Auftrag
    const fertig = async () => {
      await window.Projekt?.angebotMerken?.(p.wohnungId, doc, name);
      await window.Projekt?.angebotVersendet?.(p.wohnungId);
      if (state.wohnung?.id === p.wohnungId) { state.angebotAusProjekt = false; state.project = null; state.wohnung = (await kvGet('wohnung:' + p.wohnungId)) || state.wohnung; state.wohnung.mappe ??= {}; Projekt.view(); window.scrollTo(0, 0); }
    };
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name, text: mailText(p) }); return fertig(); } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    fertig();
  }

  // ---------- Textfelder vor und nach den Positionen (Wunsch Felix) ----------
  // Standard in der Preisliste (PL.einstellungen.bausteine), je Auftrag anpassbar (w.angebotTexte).
  // Ein Textfeld: { id, wo: 'vor'|'nach', titel, text }. Leerer Titel = nur Text. Absätze mit Leerzeile.
  const BAUSTEIN_STD = (E) => [
    { id: 'einl', wo: 'vor', titel: '', text: 'vielen Dank für das angenehme Gespräch. Gerne bieten wir Ihnen folgende Leistungen an:' },
    { id: 'leist', wo: 'nach', titel: 'Ausführung und Leistungsumfang', text: ['Ausführungszeitraum: {zeitraum}.', E.textLeistung, E.textBauseits].filter(Boolean).join('\n\n') },
    { id: 'zahl', wo: 'nach', titel: 'Preis und Zahlung', text: [...(E.hinweise || []).filter((h) => !/freuen uns/i.test(h)), E.textZahlung].filter(Boolean).join('\n\n') },
    { id: 'gew', wo: 'nach', titel: 'Gewährleistung und Widerruf', text: [E.textGewaehr, E.textWiderruf].filter(Boolean).join('\n\n') },
  ];
  // Auftragserteilung und Gruß sind seit Version 100 Bausteine (Wunsch Felix): Text änderbar, abwählbar, stehen immer am Schluss,
  // erst die Auftragserteilung, ganz zuletzt der Gruß mit Name, Unterschrift und Stempel. Kennzeichen b.fest = 'auftrag' | 'gruss'.
  // Vorher hießen sie „feste Zusätze“ (w.angebotOpt.gruss/auftrag); deren An/Aus wird beim ersten Lesen übernommen.
  const FEST = ['auftrag', 'gruss'];
  function festStd(k, opt) {
    const E = PL.einstellungen;
    const aus = opt?.[k] === false || (opt?.[k] === undefined && vorgabe(k === 'gruss' ? 'angebotGruss' : 'angebotAuftragsfeld') === 'nein');
    const b = k === 'auftrag'
      ? { id: 'auftrag', fest: 'auftrag', wo: 'nach', titel: 'Auftragserteilung', text: E.textAuftrag || 'Hiermit erteile ich / erteilen wir den Auftrag zu den Bedingungen dieses Angebots.' }
      : { id: 'gruss', fest: 'gruss', wo: 'nach', titel: 'Gruß mit Unterschrift und Stempel', text: E.textSchluss || (E.hinweise || []).find((h) => /freuen uns/i.test(h)) || 'Wir freuen uns auf Ihren Auftrag.' };
    if (aus) b.aus = true;
    return b;
  }
  /** Fehlende feste Bausteine ergänzen und ans Ende stellen (verändert die Liste). */
  function mitFest(liste, opt) {
    for (const k of FEST) if (!liste.some((b) => b.fest === k)) liste.push(festStd(k, opt));
    const rang = (b) => (b.fest ? 1 + FEST.indexOf(b.fest) : 0);
    liste.sort((a, b) => rang(a) - rang(b));
    for (const b of liste) { if (b.fest) b.wo = 'nach'; b.text = gewaehrText(b.text); }
    return liste;
  }
  const bausteine = () => { const E = PL.einstellungen; return mitFest(Array.isArray(E.bausteine) && E.bausteine.length ? E.bausteine : BAUSTEIN_STD(E)); };
  /** Texte eines Angebots (w): eigene Fassung oder Kopie des Standards. Wird erst beim Ändern als w.angebotTexte gespeichert. */
  function texteFuer(w) {
    if (Array.isArray(w?.angebotTexte) && w.angebotTexte.length) return mitFest(w.angebotTexte, w.angebotOpt);
    const l = bausteine().map((b) => ({ ...b }));
    for (const b of l) if (b.fest && w?.angebotOpt?.[b.fest] !== undefined) { if (w.angebotOpt[b.fest]) delete b.aus; else b.aus = true; }
    return l;
  }
  const kopieB = (l) => l.map((b) => ({ ...b, id: uid() }));

  /** Seite zum Bearbeiten der Textfelder. liste wird direkt verändert, speichern() sichert sie. */
  function textEditor({ titel, sub, liste, speichern, zurueck, std, vorlagen, hinweis }) {
    const sichern = debounce(() => speichern(), 500);
    const rang = (b) => (b.fest === 'auftrag' ? 1 : b.fest === 'gruss' ? 2 : 0); // feste Bausteine (Angebot) immer am Schluss
    const FEST_HINWEIS = { auftrag: 'Steht nach den Schlusstexten. Darunter unterschreibt der Kunde (Ort, Datum, Unterschrift). Nicht in der Auftragsbestätigung.',
      gruss: 'Steht ganz am Schluss. Darunter: Mit freundlichen Grüßen, Name des Ansprechpartners, Unterschrift und Stempel.' };
    const zeichne = () => {
      liste.sort((a, b) => rang(a) - rang(b));
      header(titel, sub, { label: 'Zurück', fn: zurueck });
      // Reihenfolge: am Griff ziehen (nicht mehr mit Pfeil). Ändern erst nach „Bearbeiten“ (data-schutz, core.js textSchutz).
      const karte = (b, i) => b.fest ? `<div class="card kform tx tx-fest" data-tx="${i}" data-wo="fest" data-schutz="tx:${esc(b.id || i)}">
          <div class="tx-k"><b>${esc(b.titel || '')}</b></div>
          <textarea data-txf="text" rows="${Math.min(8, Math.max(2, Math.ceil(String(b.text || '').length / 42)))}" placeholder="Text">${esc(b.text || '')}</textarea>
          <p class="hint" style="margin:6px 0 0">${esc(FEST_HINWEIS[b.fest] || '')}</p></div>` : `<div class="card kform tx" data-tx="${i}" data-wo="${b.wo === 'vor' ? 'vor' : 'nach'}" data-schutz="tx:${esc(b.id || i)}">
          <div class="tx-k">${griffHtml()}<input type="text" data-txf="titel" value="${esc(b.titel || '')}" placeholder="Überschrift, z. B. Gewährleistung" aria-label="Überschrift">
            <button type="button" class="icon-btn" data-txdel="${i}" data-edit-nur aria-label="Entfernen">${icon('trash')}</button></div>
          <textarea data-txf="text" rows="${Math.min(12, Math.max(3, Math.ceil(String(b.text || '').length / 42) + String(b.text || '').split('\n').length - 1))}" placeholder="Text">${esc(b.text || '')}</textarea>
          <select data-txf="wo" aria-label="Wo im Angebot"><option value="vor" ${b.wo === 'vor' ? 'selected' : ''}>Steht vor den Positionen</option><option value="nach" ${b.wo !== 'vor' ? 'selected' : ''}>Steht nach den Positionen</option></select></div>`;
      main().innerHTML = `<p class="hint" style="margin-top:0">${esc(hinweis || 'Jedes Textfeld hat eine Überschrift und einen Text. Ohne Überschrift steht nur der Text da. Eine Leerzeile beginnt einen neuen Absatz. Platzhalter: {zeitraum} Ausführungszeitraum, {gueltig} gültig bis, {nr} Angebotsnummer, {kunde} Kunde.')}</p>
        ${[['vor', 'Vor den Positionen'], ['nach', 'Nach den Positionen']].map(([wo, n]) => `<div class="sec-h"><h2>${n}</h2></div>
          ${liste.map((b, i) => [b, i]).filter(([b]) => (b.wo === 'vor') === (wo === 'vor')).map(([b, i]) => karte(b, i)).join('') || '<p class="hint">Noch kein Textfeld.</p>'}
          <button type="button" class="link-add" data-txneu="${wo}">${icon('plus')} Textfeld ${wo === 'vor' ? 'vor' : 'nach'} den Positionen</button>`).join('')}
        ${std ? `<button class="btn secondary block" id="txStd" style="margin-top:18px">${icon('refresh')} ${esc(std.label)}</button>` : ''}`;
      $$('[data-tx]').forEach((card) => {
        const b = liste[+card.dataset.tx];
        $$('[data-txf]', card).forEach((el) => {
          el.oninput = () => { b[el.dataset.txf] = el.value; sichern(); };
          if (el.dataset.txf === 'wo') el.onchange = async () => { b.wo = el.value; await speichern(); zeichne(); };
        });
      });
      // Ziehen innerhalb von „vor“ bzw. „nach den Positionen“
      for (const wo of ['vor', 'nach']) ziehbar(main(), `.tx[data-wo="${wo}"]`, async (von, nach) => {
        const dabei = (x) => !x.fest && (x.wo === 'vor') === (wo === 'vor');
        const gruppe = liste.filter(dabei);
        gruppe.splice(nach, 0, gruppe.splice(von, 1)[0]);
        let n = 0;
        liste.forEach((x, k) => { if (dabei(x)) liste[k] = gruppe[n++]; });
        const y = window.scrollY; await speichern(); zeichne(); window.scrollTo(0, y);
      });
      $$('[data-txdel]').forEach((btn) => (btn.onclick = async () => {
        const b = liste[+btn.dataset.txdel];
        if (!confirm(`Textfeld „${b.titel || String(b.text || '').slice(0, 40) || 'leer'}“ entfernen?`)) return;
        liste.splice(+btn.dataset.txdel, 1); await speichern(); zeichne();
      }));
      $$('[data-txneu]').forEach((btn) => (btn.onclick = async () => {
        const wo = btn.dataset.txneu;
        const frei = (vorlagen || []).filter((v) => v.titel && !liste.some((x) => x.titel === v.titel));
        let neu = { id: uid(), wo, titel: '', text: '' };
        if (frei.length) {
          const v = await sheet('Welches Textfeld?', [...frei.map((x, i) => ({ label: x.titel, sub: String(x.text || '').slice(0, 80), icon: icon('file'), value: String(i) })), { label: 'Leeres Textfeld', sub: 'Überschrift und Text selbst schreiben', icon: icon('plus'), value: 'leer' }]);
          if (v === null) return;
          if (v !== 'leer') neu = { ...frei[+v], id: uid(), wo };
        }
        liste.push(neu); schutzOffen.add('tx:' + neu.id); await speichern(); zeichne(); // neues Feld ist gleich offen zum Schreiben
        setTimeout(() => $(`[data-tx="${liste.indexOf(neu)}"] [data-txf="${neu.titel ? 'text' : 'titel'}"]`)?.focus(), 60);
      }));
      if ($('#txStd')) $('#txStd').onclick = std.fn;
    };
    zeichne(); window.scrollTo(0, 0);
  }
  /** Texte für dieses eine Angebot (gilt für alle Räume des Auftrags). Erst beim ersten Ändern wird eine eigene Fassung gespeichert. */
  async function texteAuftrag(w, zurueck) {
    await preisliste();
    const eigen = Array.isArray(w.angebotTexte) && w.angebotTexte.length;
    const liste = eigen ? texteFuer(w) : kopieB(texteFuer(w));
    textEditor({ titel: 'Texte im Angebot', sub: w.customer || '', liste, vorlagen: bausteine().filter((b) => !b.fest), zurueck,
      speichern: async () => { w.angebotTexte = liste; if (!w.isNew) await Projekt.save(w); },
      std: eigen ? { label: 'Wieder die Standardtexte aus den Einstellungen', fn: async () => { if (!confirm('Die angepassten Texte dieses Angebots verwerfen und wieder die Standardtexte nehmen?')) return; delete w.angebotTexte; if (!w.isNew) await Projekt.save(w); texteAuftrag(w, zurueck); } } : null });
  }
  /** Standard-Textfelder in den Einstellungen. */
  async function texteEinstellungen(zurueck) {
    await preisliste();
    const E = PL.einstellungen;
    const liste = Array.isArray(E.bausteine) && E.bausteine.length ? mitFest(E.bausteine) : kopieB(mitFest(BAUSTEIN_STD(E)));
    textEditor({ titel: 'Textfelder im Angebot', sub: 'Standard für jedes neue Angebot', liste, zurueck,
      speichern: async () => { E.bausteine = liste; await kvSet('preisliste', PL); },
      std: { label: 'Auf die ursprünglichen Texte zurücksetzen', fn: async () => { if (!confirm('Alle Textfelder auf die ursprünglichen Texte zurücksetzen?')) return; delete E.bausteine; await kvSet('preisliste', PL); texteEinstellungen(zurueck); } } });
  }

  // ---------- Positionen aus dem Angebot eines Partners übernehmen (Wunsch Felix) ----------
  // Kleine Sachen: aus der groben Preisliste des Partners. Größere: Der Partner schickt ein Angebot (Foto, Scan oder PDF),
  // die KI liest die Positionen, du setzt deinen Zuschlag drauf. Die Zeilen landen als eigene Positionen im Angebot
  // (x.frei, x.epFix = Einkauf + Zuschlag, x.sub = { partnerId, ep, zuschlag } für die Kalkulation).
  async function subUebernehmen(p, fertig, vorab = {}) {
    await preisliste();
    init(p);
    const A = p.angebot;
    A.positionen ??= erzeuge(p, A.paket).positionen;
    const raumName = p.aufmass.raeume[0]?.name || p.room || '';
    const P = window.Partner;
    const firmaVon = (x) => x?.firma || x?.inhaber || '';
    let partner = vorab.partnerId ? P?.byId(vorab.partnerId) : null;
    let data = vorab.data, mime = vorab.mime, datei = null;
    if (!partner && !data) {
      const liste = (P?.liste() || []).filter((x) => x.art !== 'aussen');
      const v = await sheet('Von welchem Partner?', [
        ...liste.map((x) => ({ label: firmaVon(x) || 'Ohne Namen', sub: [x.gewerk, (x.eigenePreise || []).length + Object.keys(x.preise || {}).length ? 'mit Preisliste' : ''].filter(Boolean).join(' · '), icon: icon('wrench'), value: x.id })),
        { label: 'Ohne Partner', sub: 'Nur die Positionen übernehmen', icon: icon('file'), value: '__ohne' }]);
      if (!v) return;
      partner = v === '__ohne' ? null : P.byId(v);
    }
    let quelle = data ? 'datei' : '';
    if (!quelle) {
      const hatPreise = partner && ((partner.eigenePreise || []).length || Object.keys(partner.preise || {}).length);
      quelle = await sheet('Woher kommen die Positionen?', [
        ...(window.Geraet?.kann('scanner') ? [{ label: 'Dokument scannen', sub: 'Angebot auf Papier: das iPhone erkennt Ränder und mehrere Seiten', icon: icon('file'), value: 'scan' }] : []),
        { label: 'Foto machen', sub: 'Die KI liest Leistungen, Mengen und Preise', icon: icon('camera'), value: 'foto' },
        { label: 'Screenshot, Bild oder PDF auswählen', sub: 'z. B. aus der Mail oder WhatsApp des Partners', icon: icon('upload'), value: 'datei' },
        ...(hatPreise ? [{ label: 'Aus seiner Preisliste', sub: 'Grobe Preise, die Mengen trägst du ein', icon: icon('list'), value: 'liste' }] : []),
      ]);
      if (!quelle) return;
    }
    let zeilen = [];
    if (quelle === 'liste') {
      zeilen = [...(partner.eigenePreise || []).map((x) => ({ text: x.text || '', einheit: x.einheit || 'Stück', menge: 1, ep: +x.preis || 0, an: false })),
        ...Object.entries(partner.preise || {}).map(([nr, preis]) => { const it = pos(nr); return it ? { text: it.text, einheit: it.einheit, menge: 1, ep: +preis || 0, an: false } : null; }).filter(Boolean)];
    } else {
      if (!data && quelle === 'scan') {
        data = await window.Geraet.scannen().catch(() => '');
        if (!data) return;
        mime = 'image/jpeg';
      }
      if (!data) {
        const [f] = await pickFiles(quelle === 'foto' ? { camera: true, accept: 'image/*' } : { accept: 'application/pdf,image/*' });
        if (!f) return;
        if (f.size > 15e6) return toast('Die Datei ist zu groß (höchstens 15 MB).', 4000);
        mime = f.type || 'application/pdf'; data = await fileToDataUrl(f);
        if (mime.startsWith('image/')) { data = await resize(data, 2200, 'image/jpeg', 0.85); mime = 'image/jpeg'; }
        else datei = f;
      }
      if (!state.settings.apiKey) return toast('Zum Auslesen braucht die App den KI-Schlüssel (Einstellungen › KI).', 5000);
      toast('KI liest das Angebot …', 40000);
      let j = {};
      try {
        j = JSON.parse(await geminiText([{ text: 'Das ist ein Angebot (Kostenvoranschlag) eines Handwerkers oder Lieferanten an eine Sanierungsfirma. Lies alle Leistungspositionen aus. text: die Leistung kurz und vollständig auf Deutsch, ohne Positionsnummer. menge: Menge als Zahl. einheit: z. B. m², Stück, lfm, Std., psch. ep: Einzelpreis netto in Euro. gp: Gesamtpreis netto in Euro. Stehen nur Bruttopreise da, rechne mit 19 % auf netto um. Keine Zwischensummen, keine Mehrwertsteuer, keine Rabatt- oder Summenzeilen als Position. firma: Name der Firma, die das Angebot gemacht hat.' }, { inline_data: { mime_type: mime, data: data.split(',')[1] } }], true, {
          responseSchema: { type: 'OBJECT', properties: { firma: { type: 'STRING' }, positionen: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, menge: { type: 'NUMBER' }, einheit: { type: 'STRING' }, ep: { type: 'NUMBER' }, gp: { type: 'NUMBER' } }, required: ['text'] } } } } }));
      } catch (e) { $('#toast').hidden = true; return toast('Das Angebot konnte nicht gelesen werden: ' + e.message, 5000); }
      $('#toast').hidden = true;
      zeilen = (j.positionen || []).filter((x) => String(x.text || '').trim()).map((x) => ({ text: x.text.trim(), einheit: x.einheit || 'Stück', menge: x.menge > 0 ? x.menge : 1, ep: x.ep > 0 ? x.ep : x.gp > 0 ? r2(x.gp / (x.menge > 0 ? x.menge : 1)) : 0, an: true }));
      if (!partner && j.firma) { const n = j.firma.toLowerCase(); partner = (P?.liste() || []).find((x) => firmaVon(x) && (n.includes(firmaVon(x).toLowerCase()) || firmaVon(x).toLowerCase().includes(n))) || null; }
      if (!partner && j.firma) partner = { id: '', firma: j.firma };
    }
    if (!zeilen.length) return toast('Keine Positionen gefunden.', 4000);
    // Prüfen: anhaken, Menge und Text ändern, Zuschlag setzen
    let z = +vorgabe('subZuschlag') || 0;
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet sub-sheet"><div class="sheet-h"><b>Positionen übernehmen</b><button class="icon-btn" data-zu aria-label="Schließen">${icon('x')}</button></div>
      ${partner ? `<p class="muted" style="margin:0 0 8px">Von <b>${esc(firmaVon(partner))}</b>${partner.id ? '' : ' (nicht in deinen Partnern)'}</p>` : ''}
      <label class="sub-zu">Dein Zuschlag <input type="text" inputmode="decimal" id="suZ" value="${fmtIn(z)}"> %</label>
      <div class="sub-l">${zeilen.map((x, i) => `<div class="sub-r">
        <input type="checkbox" data-su="${i}" ${x.an ? 'checked' : ''} aria-label="Übernehmen">
        <div class="sub-t"><input type="text" data-sut="${i}" value="${esc(x.text)}" aria-label="Leistung">
          <div class="sub-m"><input type="text" inputmode="decimal" data-sum="${i}" value="${fmtIn(x.menge)}" aria-label="Menge"><span>${esc(x.einheit)}</span>
            <span class="muted">EK <input type="text" inputmode="decimal" data-sue="${i}" value="${fmtIn(x.ep)}" aria-label="Einkaufspreis"> €</span></div>
          <small data-suv="${i}"></small></div></div>`).join('')}</div>
      <div class="tot big"><span>Für den Kunden netto</span><b id="suSum"></b></div>
      <button class="btn block" data-ok>Übernehmen</button></div>`;
    document.body.appendChild(bg);
    requestAnimationFrame(() => bg.classList.add('on'));
    const zu = () => bg.remove();
    const rechne = () => {
      z = num($('#suZ', bg).value);
      let s = 0, n = 0;
      zeilen.forEach((x, i) => { const vk = r2(x.ep * (1 + z / 100)); $(`[data-suv="${i}"]`, bg).textContent = `Für den Kunden ${fmtEur(vk)} je ${x.einheit} · zusammen ${fmtEur(r2(vk * x.menge))}`; if (x.an) { s += vk * x.menge; n++; } });
      $('#suSum', bg).textContent = fmtEur(r2(s));
      $('[data-ok]', bg).textContent = n ? `${n} ${n === 1 ? 'Position' : 'Positionen'} übernehmen` : 'Bitte Positionen anhaken';
    };
    rechne();
    $('#suZ', bg).oninput = rechne;
    $$('[data-su]', bg).forEach((c) => (c.onchange = () => { zeilen[+c.dataset.su].an = c.checked; rechne(); }));
    $$('[data-sut]', bg).forEach((c) => (c.oninput = () => { zeilen[+c.dataset.sut].text = c.value; }));
    $$('[data-sum]', bg).forEach((c) => (c.oninput = () => { const x = zeilen[+c.dataset.sum]; x.menge = num(c.value); if (x.menge > 0 && !x.an) { x.an = true; $(`[data-su="${c.dataset.sum}"]`, bg).checked = true; } rechne(); }));
    $$('[data-sue]', bg).forEach((c) => (c.oninput = () => { zeilen[+c.dataset.sue].ep = num(c.value); rechne(); }));
    bg.onclick = (e) => { if (e.target === bg || e.target.closest('[data-zu]')) zu(); };
    $('[data-ok]', bg).onclick = async () => {
      const neu = zeilen.filter((x) => x.an && x.menge > 0 && x.text.trim());
      if (!neu.length) return toast('Bitte mindestens eine Position anhaken.');
      for (const x of neu) A.positionen.push({ nr: 'FREI-' + uid(), frei: { text: x.text.trim(), einheit: x.einheit }, raum: raumName, menge: x.menge, bem: '', epFix: r2(x.ep * (1 + z / 100)), sub: { partnerId: partner?.id || '', firma: firmaVon(partner), ep: r2(x.ep), zuschlag: z } });
      A.geaendert = true;
      zu();
      // Das Original (Scan, Foto, Bild oder PDF) intern beim Angebot ablegen. Es geht nie an den Kunden.
      if (data) { try { await partnerOriginal(p, data, mime, firmaVon(partner)); } catch (e) { console.warn('Partnerangebot nicht abgelegt', e); } }
      await saveProject(p);
      toast(`${neu.length} ${neu.length === 1 ? 'Position' : 'Positionen'} übernommen (+${fmtNum(z, 0)} %)`, 4000);
      fertig?.();
    };
  }

  /** Original eines Partner-Angebots beim Auftrag ablegen (w.dokumente, intern: true, art 'partnerangebot').
   *  Steht unter „Dokumente“ mit dem Zusatz „intern“, ohne Senden-Knopf, und geht in keine Mail an den Kunden. */
  async function partnerOriginal(p, data, mime, firma) {
    if (!p?.wohnungId || !data) return;
    const w = wVon(p) || (await kvGet('wohnung:' + p.wohnungId));
    if (!w?.id) return;
    const pdf = /pdf/.test(mime || '');
    const datum = new Date().toLocaleDateString('de-DE');
    const name = `Partnerangebot (intern) ${firma || 'Partner'} ${datum}.${pdf ? 'pdf' : 'jpg'}`;
    const key = 'wdok:' + w.id + ':partner-' + uid();
    await kvSet(key, data);
    w.dokumente = [...(w.dokumente || []), { key, name, t: Date.now(), typ: pdf ? 'application/pdf' : 'image/jpeg', intern: true, art: 'partnerangebot' }];
    delete w.isNew;
    await Projekt.save(w);
  }

  // ---------- Einstellungen ----------
  async function einstellungenKarte() {
    const el = $('#angebot-settings'); if (!el) return;
    await preisliste();
    const E = PL.einstellungen, pct = (x) => Math.round(x * 100) + ' %';
    el.innerHTML = `<div class="card"><h2>Preisliste & Angebot</h2>
      <p class="muted">Du kannst dein <b>Excel-Angebotstool</b> laden. Einzelne Preise, Aufschläge und Texte änderst du danach direkt in der App (Einstellungen › Preisliste und › Aufschläge & Angebotstexte).</p>
      <div class="tot"><span class="muted">Quelle</span><span>${esc(PL.quelle || '')}</span></div>
      <div class="tot"><span class="muted">Stand</span><span>${esc(PL.stand || '')}</span></div>
      <div class="tot"><span class="muted">Positionen</span><span>${PL.positionen.length}${PL.positionen.some((x) => x.status === 'geschätzt') ? ` (${PL.positionen.filter((x) => x.status === 'geschätzt').length} geschätzt)` : ''}</span></div>
      <div class="tot"><span class="muted">Aufschlag Lohn / Material / Wagnis</span><span>${pct(E.aufLohn)} / ${pct(E.aufMat)} / ${pct(E.wagnis)}</span></div>
      <div class="tot"><span class="muted">Firma</span><span style="text-align:right">${esc(E.firma)}<br>${esc(E.strasse)}, ${esc(E.ort)}</span></div>
      ${/0000|Muster/.test(E.telefon + E.strasse) ? '<p class="muted">Adresse und Telefon sind noch Platzhalter. Unter Einstellungen › Firma & Logo ändern.</p>' : ''}
      <button class="btn block" id="plImport" style="margin-top:10px">Excel-Angebotstool laden</button>
      <div class="row" style="margin-top:10px"><button class="btn secondary" id="plVorl">Paket-Vorlagen</button><button class="btn danger" id="plReset">Standard</button></div>
    </div>`;
    $('#plImport').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      inp.onchange = async () => { try { const r = await importExcel(inp.files[0]); toast(`${r.positionen.length} Positionen übernommen`); einstellungenKarte(); } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 6000); } };
      inp.click();
    };
    $('#plReset').onclick = async () => { if (!loeschFrage('Preisliste auf die Standard-Schätzpreise zurücksetzen?')) return; await kvDel('preisliste'); PL = null; einstellungenKarte(); };
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
    $('#vBack').onclick = () => (window.einstellungSeite ? einstellungSeite('preise') : switchTab('einstellungen'));
    $('#vPkg').onchange = (e) => vorlagenView(e.target.value, grp);
    $('#vGrp').onchange = (e) => vorlagenView(pkgId, e.target.value);
    $$('[data-vm]').forEach((el) => (el.oninput = () => { rows[+el.dataset.vm].menge = el.value; try { rechne(el.value, masse(neuerRaum())); el.style.borderColor = ''; } catch { el.style.borderColor = 'var(--danger)'; } save(); }));
    $$('[data-vb]').forEach((el) => (el.oninput = () => { rows[+el.dataset.vb].bem = el.value; save(); }));
    $$('[data-vdel]').forEach((b) => (b.onclick = async () => { rows.splice(+b.dataset.vdel, 1); await kvSet('angebotVorlagen', VORL); vorlagenView(pkgId, grp); }));
    $$('[data-vup]').forEach((b) => (b.onclick = async () => { const i = +b.dataset.vup; [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; await kvSet('angebotVorlagen', VORL); vorlagenView(pkgId, grp); }));
    $('#vNeu').onchange = async (e) => { if (!e.target.value) return; rows.push({ nr: e.target.value, menge: 'boden', bem: '' }); await kvSet('angebotVorlagen', VORL); vorlagenView(pkgId, grp); };
    $('#vReset').onclick = async () => { if (!loeschFrage('Alle Paket-Vorlagen zurücksetzen?')) return; await kvDel('angebotVorlagen'); VORL = null; vorlagenView(pkgId, grp); };
  }

  return { projektKarte, ansicht, einstellungenKarte, _intern: { init, gruppe, materialliste, uebernimmSchaetzung, masse, rechne, erzeuge, summen, bauzeit, ep, lohnEp, preisliste, vorlagen, neuerRaum, baueAngebotPdf, importExcel, naechsteNummer, mailText, bausteine, textEditor, texteAuftrag, texteEinstellungen, subUebernehmen, ansprechpartner, ansprVon, einePerson, texteFuer, anredeDefault, einstellungen: () => PL.einstellungen } };
})();
window.Angebot = Angebot;
