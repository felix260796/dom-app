'use strict';
/* DOM – QR-Codes. Vor allem der GiroCode (EPC-QR) auf Rechnungen und Mahnungen:
 * Der Kunde scannt ihn mit seiner Banking-App, Empfänger, IBAN, Betrag und Verwendungszweck sind dann ausgefüllt.
 * Kodierung: vendor/qrcode-generator.js (MIT, Kazuhiko Arase). Bild als PNG (jsPDF kann PNG ohne Zusatz).
 *   QR.bild(text, { px })                              → PNG-DataURL
 *   QR.giroText({ iban, bic, name, betrag, zweck })    → Text nach EPC069-12, Version 002, oder '' wenn unvollständig
 *   QR.giroCode({ iban, bic, name, betrag, zweck })    → PNG-DataURL oder '' (dann im PDF einfach weglassen)
 *   QR.ibanOk(iban)                                    → Prüfziffer stimmt */
window.QR = (() => {
  /** Quadratisches PNG; px = Kantenlänge, Ruhezone 4 Module (Pflicht für sicheres Scannen). */
  function bild(text, { px = 600, fehler = 'M' } = {}) {
    const q = qrcode(0, fehler);
    // Die Bibliothek liest die Umwandlung global; UTF-8, damit Umlaute (Müller) richtig ankommen
    const vorher = qrcode.stringToBytes;
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    try { q.addData(text, 'Byte'); q.make(); } finally { qrcode.stringToBytes = vorher; }
    const n = q.getModuleCount(), rand = 4, zellen = n + 2 * rand;
    const z = Math.max(1, Math.floor(px / zellen));
    const c = document.createElement('canvas');
    c.width = c.height = z * zellen;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let s = 0; s < n; s++) if (q.isDark(r, s)) x.fillRect((s + rand) * z, (r + rand) * z, z, z);
    return c.toDataURL('image/png');
  }

  const ibanSauber = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  /** IBAN-Prüfziffer (Modulo 97). */
  function ibanOk(iban) {
    const s = ibanSauber(iban);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    const ziffern = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (b) => b.charCodeAt(0) - 55);
    let rest = 0;
    for (const d of ziffern) rest = (rest * 10 + Number(d)) % 97;
    return rest === 1;
  }

  /** Text nach EPC069-12 (Version 002: BIC freiwillig, Zeichensatz UTF-8). */
  function giroText({ iban, bic = '', name, betrag, zweck = '' } = {}) {
    const i = ibanSauber(iban), b = Math.round(Number(betrag) * 100) / 100;
    if (!ibanOk(i) || !String(name || '').trim() || !(b >= 0.01 && b <= 999999999.99)) return '';
    const eine = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
    return ['BCD', '002', '1', 'SCT', ibanSauber(bic), eine(name, 70), i, 'EUR' + b.toFixed(2), '', '', eine(zweck, 140)].join('\n');
  }

  function giroCode(daten) {
    const t = giroText(daten);
    return t ? bild(t) : '';
  }

  return { bild, giroText, giroCode, ibanOk };
})();
