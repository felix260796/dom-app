'use strict';
/* DOM – PDFs aus dem Gespräch vor Ort und aus den Fotos (Wunsch Felix):
 * 1. Zusammenfassung mit Maßen, Wünschen je Raum, Aufgaben und offenen Fragen (KI fasst das Transkript zusammen)
 * 2. Transkript (das ganze Gespräch, Wort für Wort)
 * 3. Fotos (alle Bilder des Projekts, zwei je Seite mit Beschriftung)
 * Jedes PDF wird beim Projekt bzw. Kunden gespeichert ('gpdf:<projektId>:<art>', Liste in w.gespraechPdfs)
 * und kann sofort geteilt werden (mit Vorschau). Baut auf core.js, voice.js (geminiText), bilder.js, projekt.js auf. */
window.GesprPdf = (() => {
  const NAMEN = { zus: 'Zusammenfassung', trans: 'Transkript', fotos: 'Fotos' };
  const NAVY = [30, 53, 80], GREY = [110, 110, 110];

  /** Einfaches A4-Gerüst mit Logo, Titel und Kopfdaten. */
  async function geruest(w, titel) {
    const PL = await window.Angebot._intern.preisliste();
    const E = PL.einstellungen;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const M = 18, R = 192, H = 297;
    const logo = state.settings.logo;
    const kopf = async () => {
      if (logo) await addFit(doc, logo, R - 45, 10, 45, 16, mimeOf(logo) === 'image/png' ? 'PNG' : 'JPEG');
      else { doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); doc.text(E.firma || '', R, 18, { align: 'right' }); }
    };
    await kopf();
    const k = Kunden.byId(w.kundeId);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY); doc.text(titel, M, 36);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY);
    const meta = [Kunden.name(k) || w.customer, k?.nr && `Kunden-Nr. ${k.nr}`, w.nr && `Projekt-Nr. ${w.nr}`, w.address, new Date().toLocaleDateString('de-DE')].filter(Boolean).join(' · ');
    doc.text(doc.splitTextToSize(meta, R - M), M, 42);
    let y = 52;
    const platz = async (h) => { if (y + h > H - 16) { doc.addPage(); await kopf(); y = 30; } };
    const absatz = async (text, { groesse = 10, fett = false, farbe = [30, 30, 30], abstand = 1.5 } = {}) => {
      doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(groesse); doc.setTextColor(...farbe);
      for (const z of doc.splitTextToSize(String(text || ''), R - M)) { await platz(groesse * 0.45); doc.text(z, M, y); y += groesse * 0.45; }
      y += abstand;
    };
    const ueber = async (t) => { await platz(14); y += 3; await absatz(t, { groesse: 12, fett: true, farbe: NAVY, abstand: 1 }); };
    return { doc, M, R, H, platz, absatz, ueber, kopf, get y() { return y; }, set y(v) { y = v; } };
  }

  /** KI: Transkript zusammenfassen. */
  async function zusammenfassen(w, list) {
    const txt = await geminiText([{ text: `Fasse dieses Vor-Ort-Gespräch einer Sanierungsfirma mit dem Kunden zusammen. Auf Deutsch, sachlich, kurz. Räume in der App: ${list.map((r) => r.room || roomType(r.roomType).name).join(', ') || 'keine'}.
kurz: 3–5 Sätze, worum es geht.
masse: alle genannten Maße, je Eintrag „Raum: Länge × Breite × Höhe“ oder wie gesagt (z. B. „Bad: 2 × 3 m, 2,50 m hoch“).
raeume: je Raum die Wünsche als Stichpunkte.
aufgaben: konkrete Aufgaben für die Firma (z. B. „Angebot Bad bis Freitag“, „Fliesenmuster mitbringen“).
fragen: offene Fragen und Entscheidungen, die der Kunde noch treffen muss.
budget_termin: genanntes Budget und gewünschte Termine, falls genannt.

TRANSKRIPT:
${w.gespraech?.transcript || ''}` }], true, { responseSchema: { type: 'OBJECT', properties: {
      kurz: { type: 'STRING' }, masse: { type: 'ARRAY', items: { type: 'STRING' } },
      raeume: { type: 'ARRAY', items: { type: 'OBJECT', properties: { raum: { type: 'STRING' }, wuensche: { type: 'ARRAY', items: { type: 'STRING' } } } } },
      aufgaben: { type: 'ARRAY', items: { type: 'STRING' } }, fragen: { type: 'ARRAY', items: { type: 'STRING' } }, budget_termin: { type: 'STRING' } } } });
    return JSON.parse(txt);
  }

  async function bauen(w, list, art) {
    if (art === 'zus') {
      if (!state.settings.apiKey) throw new Error('Für die Zusammenfassung wird der KI-Schlüssel gebraucht (Einstellungen › KI).');
      toast('KI fasst das Gespräch zusammen …', 20000);
      const z = await zusammenfassen(w, list);
      const P = await geruest(w, 'Zusammenfassung Vor-Ort-Gespräch');
      if (z.kurz) await P.absatz(z.kurz, { abstand: 3 });
      if (z.masse?.length) { await P.ueber('Maße'); for (const m of z.masse) await P.absatz('• ' + m, { abstand: 0.5 }); }
      if (z.raeume?.length) for (const r of z.raeume) { await P.ueber(r.raum || 'Raum'); for (const x of r.wuensche || []) await P.absatz('• ' + x, { abstand: 0.5 }); }
      if (z.aufgaben?.length) { await P.ueber('Aufgaben für uns'); for (const a of z.aufgaben) await P.absatz('[  ] ' + a.replace(/^[-•]\s*/, ''), { abstand: 0.8 }); }
      if (z.fragen?.length) { await P.ueber('Offene Fragen'); for (const f of z.fragen) await P.absatz('• ' + f, { abstand: 0.5 }); }
      if (z.budget_termin) { await P.ueber('Budget und Termine'); await P.absatz(z.budget_termin); }
      $('#toast').hidden = true;
      return P.doc;
    }
    if (art === 'trans') {
      const P = await geruest(w, 'Transkript Gespräch');
      for (const abs of String(w.gespraech?.transcript || '').split(/\n+/)) {
        if (/^---.*---$/.test(abs.trim())) await P.ueber(abs.replace(/-/g, '').trim());
        else if (abs.trim()) await P.absatz(abs.trim(), { groesse: 9.5, abstand: 1.2 });
      }
      return P.doc;
    }
    // Fotos: Bilder des Projekts (Bilder & Dokumentation) und die Fotos der Räume, zwei je Seite
    const bilder = [];
    const d = await kvGet(`bilder:${w.kundeId}:${w.objektId || 'ohne'}`);
    const ordner = Object.fromEntries((d?.ordner || []).map((o) => [o.id, o.name]));
    for (const b of (d?.bilder || []).filter((b) => !b.projektId || b.projektId === w.id).sort((a, c) => a.t - c.t)) {
      const data = await kvGet('bild:' + b.id);
      if (data) bilder.push({ data, text: [ordner[b.ordner], new Date(b.t).toLocaleDateString('de-DE'), b.text].filter(Boolean).join(' · ') });
    }
    for (const r of list) r.photos.forEach((ph, i) => bilder.push({ data: ph, text: `${r.room || roomType(r.roomType).name} · Foto ${i + 1}` }));
    if (!bilder.length) throw new Error('Noch keine Fotos in diesem Projekt.');
    const P = await geruest(w, `Fotodokumentation (${bilder.length} ${bilder.length === 1 ? 'Bild' : 'Bilder'})`);
    const hoehe = 110;
    for (const [i, b] of bilder.entries()) {
      if (i && i % 2 === 0) { P.doc.addPage(); await P.kopf(); P.y = 30; }
      try { await addFit(P.doc, b.data, P.M, P.y, P.R - P.M, hoehe, 'JPEG'); } catch {}
      P.y += hoehe + 4;
      await P.absatz(b.text, { groesse: 8.5, farbe: GREY, abstand: 6 });
    }
    return P.doc;
  }

  const dateiName = (w, art) => `${NAMEN[art]}_${(w.customer || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

  /** Erstellen, beim Projekt speichern, teilen. */
  async function erstellen(w, list, art) {
    const doc = await bauen(w, list, art);
    const name = dateiName(w, art);
    await kvSet(`gpdf:${w.id}:${art}`, doc.output('datauristring'));
    w.gespraechPdfs = [...(w.gespraechPdfs || []).filter((x) => x.art !== art), { art, name, t: Date.now() }];
    await Projekt.save(w);
    await Mappe.teilen(doc, name);
    Projekt.view();
  }
  async function oeffnen(w, art) {
    const data = await kvGet(`gpdf:${w.id}:${art}`);
    if (!data) return toast('Das PDF ist auf diesem Gerät noch nicht da. Bitte kurz warten (Cloud-Abgleich).', 4000);
    const blob = await (await fetch(data)).blob();
    const name = (w.gespraechPdfs || []).find((x) => x.art === art)?.name || 'Gespräch.pdf';
    pdfAnsicht(new File([blob], name, { type: 'application/pdf' }), name);
  }
  return { erstellen, oeffnen };
})();
