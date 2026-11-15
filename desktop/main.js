'use strict';
/* DOM als Programm für Windows (Electron). Lädt dieselben App-Dateien wie die iPhone-App (Ordner app/, beim Bau kopiert)
 * über die eigene Adresse app://dom/, damit der Speicher (IndexedDB) immer am selben Ort bleibt. Daten kommen wie
 * überall über den Cloud-Abgleich (sync.js). Neue Fassungen holt sich das Programm selbst von GitHub (electron-updater). */
const { app, BrowserWindow, protocol, net, shell, session, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Nur ein Fenster: zweiter Start holt das offene Fenster nach vorn
if (!app.requestSingleInstanceLock()) app.quit();

const ORDNER = path.join(__dirname, 'app');
let fenster = null;

function oeffnen() {
  fenster = new BrowserWindow({
    width: 1400, height: 900, minWidth: 420, minHeight: 600,
    backgroundColor: '#14263b', title: 'DOM', autoHideMenuBar: false, show: false,
    icon: path.join(ORDNER, 'icons', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  fenster.maximize();
  fenster.once('ready-to-show', () => fenster.show());
  // Links nach draußen (Route, Anrufen, Mail, Webseiten) im Standardprogramm öffnen, nicht im DOM-Fenster
  fenster.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith('app:')) shell.openExternal(url); return { action: 'deny' }; });
  fenster.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app:')) { e.preventDefault(); shell.openExternal(url); } });
  // Rechtschreibung: Deutsch
  fenster.webContents.session.setSpellCheckerLanguages(['de-DE']);
  fenster.loadURL('app://dom/index.html');
  // Absturz der Seite (z. B. zu wenig Speicher): nicht weiß stehen lassen, sondern neu laden und im Protokoll vermerken
  fenster.webContents.on('render-process-gone', (e, d) => { protokoll(`Seite abgestürzt: ${d.reason} (${d.exitCode})`); if (d.reason !== 'clean-exit' && fenster && !fenster.isDestroyed()) setTimeout(() => fenster.loadURL('app://dom/index.html'), 500); });
  fenster.webContents.on('unresponsive', () => protokoll('Seite reagiert nicht'));
}
/** Pfad zu Outlook (klassisch), falls installiert. Das neue Outlook kann keine Anhänge von außen übernehmen. */
let outlookGefunden;
function outlookPfad() {
  if (outlookGefunden !== undefined) return Promise.resolve(outlookGefunden);
  return new Promise((fertig) => {
    if (process.platform !== 'win32') return fertig((outlookGefunden = null));
    require('child_process').execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE', '/ve'], { windowsHide: true }, (err, out) => {
      const m = !err && /REG_SZ\s+(.+\.exe)/i.exec(String(out));
      outlookGefunden = m && fs.existsSync(m[1].trim()) ? m[1].trim() : null;
      fertig(outlookGefunden);
    });
  });
}
/** Fehlerprotokoll im Benutzerordner (%APPDATA%/DOM/fehler.log), damit Abstürze nachvollziehbar sind. */
function protokoll(text) { try { fs.appendFileSync(path.join(app.getPath('userData'), 'fehler.log'), `${new Date().toISOString()} v${app.getVersion()} ${text}\n`); } catch {} }
process.on('uncaughtException', (e) => protokoll('Fehler im Programm: ' + (e?.stack || e)));

app.whenReady().then(() => {
  Menu.setApplicationMenu(menue());
  protocol.handle('app', (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const datei = path.normalize(path.join(ORDNER, p));
    if (!datei.startsWith(ORDNER)) return new Response('nicht gefunden', { status: 404 });
    return net.fetch(pathToFileURL(datei).toString());
  });
  // Kamera und Mikrofon (Fotos, Sprachaufnahme) erlauben, Windows fragt selbst noch einmal
  session.defaultSession.setPermissionRequestHandler((wc, art, ok) => ok(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications'].includes(art)));
  // Kartenkacheln von OpenStreetMap brauchen eine Herkunft
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://tile.openstreetmap.org/*'] }, (d, cb) => {
    d.requestHeaders.Referer = 'https://felix260796.github.io/dom-app/';
    cb({ requestHeaders: d.requestHeaders });
  });
  // Herunterladen (Excel-Sicherung, Bilder …): „Speichern unter“ im zuletzt gewählten Ordner
  session.defaultSession.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: 'Speichern unter', defaultPath: path.join(einst().ordner || app.getPath('documents'), item.getFilename()) });
    item.once('done', (ev, stand) => { if (stand === 'completed' && item.getSavePath()) einstSetzen({ ordner: path.dirname(item.getSavePath()) }); });
  });
  ipcMain.handle('dom:version', () => app.getVersion());
  ipcMain.handle('dom:update', () => updaten(true));
  // Neue Fassung ist geladen: Felix entscheidet in DOM selbst „Jetzt neu starten“ (kein heimliches Einspielen beim Schließen)
  ipcMain.handle('dom:jetztUpdaten', () => { const { autoUpdater } = require('electron-updater'); autoUpdater.quitAndInstall(true, true); });
  ipcMain.handle('dom:updateBereit', () => updateBereit);
  ipcMain.on('dom:fehler', (e, text) => protokoll('Seite: ' + String(text).slice(0, 2000)));
  ipcMain.handle('dom:speichern', async (e, name, daten) => {
    const ziel = await dialog.showSaveDialog(fenster, { title: 'Speichern unter', defaultPath: path.join(einst().ordner || app.getPath('documents'), sauber(name)), filters: filter(name) });
    if (ziel.canceled || !ziel.filePath) return null;
    fs.writeFileSync(ziel.filePath, Buffer.from(daten));
    einstSetzen({ ordner: path.dirname(ziel.filePath) });
    return ziel.filePath;
  });
  ipcMain.handle('dom:oeffnen', async (e, name, daten) => {
    const ordner = path.join(app.getPath('temp'), 'DOM');
    fs.mkdirSync(ordner, { recursive: true });
    const datei = path.join(ordner, sauber(name));
    fs.writeFileSync(datei, Buffer.from(daten));
    const fehler = await shell.openPath(datei);
    return fehler ? { ok: false, fehler } : { ok: true, pfad: datei };
  });
  // Per E-Mail senden: Dateien in Dokumente\DOM\Versand ablegen, dann Outlook (klassisch) mit Anhang öffnen.
  // Ohne Outlook: Mailprogramm über mailto: öffnen und die Datei im Explorer zeigen (zum Hineinziehen).
  ipcMain.handle('dom:mail', async (e, dateien, an, betreff, text) => {
    const ordner = path.join(app.getPath('documents'), 'DOM', 'Versand');
    fs.mkdirSync(ordner, { recursive: true });
    const pfade = (dateien || []).map((d) => { const p = path.join(ordner, sauber(d.name)); fs.writeFileSync(p, Buffer.from(d.daten)); return p; });
    const q = [betreff && 'subject=' + encodeURIComponent(betreff), text && 'body=' + encodeURIComponent(text)].filter(Boolean).join('&');
    const outlook = await outlookPfad();
    if (outlook && pfade.length === 1) {
      try {
        const { spawn } = require('child_process');
        spawn(outlook, ['/c', 'ipm.note', '/m', `${an || ''}${q ? '?' + q : ''}`, '/a', pfade[0]], { detached: true, stdio: 'ignore' }).unref();
        return { weg: 'outlook', pfade };
      } catch (err) { protokoll('Outlook: ' + err.message); }
    }
    await shell.openExternal(`mailto:${encodeURIComponent(an || '').replace(/%40/g, '@')}${q ? '?' + q : ''}`);
    if (pfade[0]) shell.showItemInFolder(pfade[0]);
    return { weg: 'mailto', pfade };
  });
  ipcMain.handle('dom:zeigen', (e, pfad) => { if (typeof pfad === 'string' && fs.existsSync(pfad)) shell.showItemInFolder(pfad); });
  oeffnen();
  updaten(false);
  setInterval(() => updaten(false), 4 * 60 * 60 * 1000);
});

app.on('second-instance', () => { if (fenster) { if (fenster.isMinimized()) fenster.restore(); fenster.focus(); } });
app.on('window-all-closed', () => app.quit());

// Neue Fassung: im Hintergrund laden, dann in DOM fragen „Jetzt neu starten“. Das Einspielen startet DOM danach selbst wieder.
// Nicht mehr beim Schließen einspielen (bis v104): Wer DOM gleich wieder öffnete, während das Setup im Hintergrund lief,
// wurde vom Setup hinausgeworfen und die Verknüpfung zeigte kurz „DOM.exe wurde verändert oder verschoben“ (Felix, 14.11.).
let updateBereit = null, updateHorcht = false;
async function updaten(sofort) {
  if (!app.isPackaged) return { ok: false, grund: 'nicht installiert' };
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoInstallOnAppQuit = false;
    if (!updateHorcht) {
      updateHorcht = true;
      autoUpdater.on('update-downloaded', (info) => { updateBereit = info?.version || 'neu'; fenster?.webContents.send('dom:updateBereit', updateBereit); });
      autoUpdater.on('error', (e) => protokoll('Update: ' + (e?.message || e)));
    }
    const r = await autoUpdater.checkForUpdates();
    if (sofort && r?.downloadPromise) { await r.downloadPromise; autoUpdater.quitAndInstall(true, true); }
    return { ok: true, neu: r?.updateInfo?.version || null };
  } catch (e) {
    return { ok: false, grund: String(e?.message || e) };
  }
}

// ---------- Menüleiste wie bei einem Windows-Programm ----------
// Die Menüpunkte schicken einen Befehl an die App (app.js, desktopBefehl). Bearbeiten und Ansicht nutzen die eingebauten Rollen.
function befehl(b) { return () => fenster?.webContents.send('dom:befehl', b); }
function menue() {
  const p = (label, b, accelerator) => ({ label, accelerator, click: befehl(b) });
  return Menu.buildFromTemplate([
    { label: 'Datei', submenu: [
      p('Neues Angebot', 'neuAngebot', 'CmdOrCtrl+N'),
      p('Neuer Kunde', 'neuKunde', 'CmdOrCtrl+Shift+K'),
      p('Neue Rechnung', 'neuRechnung', 'CmdOrCtrl+Shift+R'),
      p('Neuer Partner', 'neuPartner'),
      { type: 'separator' },
      p('Speichern', 'speichern', 'CmdOrCtrl+S'),
      p('PDF speichern unter …', 'pdfSpeichern', 'CmdOrCtrl+Shift+S'),
      p('Drucken (im PDF-Programm öffnen)', 'drucken', 'CmdOrCtrl+P'),
      { type: 'separator' },
      p('Einstellungen', 'einstellungen', 'CmdOrCtrl+,'),
      { type: 'separator' },
      { label: 'Beenden', role: 'quit' },
    ] },
    { label: 'Bearbeiten', submenu: [
      { label: 'Rückgängig', role: 'undo' }, { label: 'Wiederholen', role: 'redo' }, { type: 'separator' },
      { label: 'Ausschneiden', role: 'cut' }, { label: 'Kopieren', role: 'copy' }, { label: 'Einfügen', role: 'paste' },
      { label: 'Alles auswählen', role: 'selectAll' }, { type: 'separator' },
      p('Suchen', 'suche', 'CmdOrCtrl+F'),
    ] },
    { label: 'Ansicht', submenu: [
      p('Heute', 'heute', 'CmdOrCtrl+0'),
      p('Kunden', 'kunden', 'CmdOrCtrl+1'),
      p('Partner', 'partner', 'CmdOrCtrl+2'),
      p('Angebote', 'angebote', 'CmdOrCtrl+3'),
      p('Projekte', 'projekt', 'CmdOrCtrl+4'),
      p('Rechnungen', 'rechnungen', 'CmdOrCtrl+5'),
      { type: 'separator' },
      p('Zurück', 'zurueck', 'Alt+Left'),
      { type: 'separator' },
      { label: 'Größer', role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' }, { label: 'Kleiner', role: 'zoomOut' }, { label: 'Normale Größe', role: 'resetZoom' },
      { label: 'Vollbild', role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'Neu laden', role: 'reload' },
    ] },
    { label: 'Extras', submenu: [
      p('Kalender', 'kalender', 'CmdOrCtrl+K'),
      p('Karte der Baustellen', 'karte'),
      p('Auswertung', 'auswertung'),
      { type: 'separator' },
      p('Preisliste', 'preisliste'),
      p('Preislisten der Partner', 'ppreise'),
      p('Unterlagen und Vorlagen', 'unterlagen'),
      { type: 'separator' },
      p('Excel-Sicherung machen', 'sicherung'),
      p('Einstellungen', 'einstellungen'),
    ] },
    { label: 'Hilfe', submenu: [
      p('Wie geht das?', 'hilfe', 'F1'),
      p('Tastenkürzel', 'kuerzel'),
      { type: 'separator' },
      { label: 'Nach neuer Fassung suchen', click: async () => {
        const r = await updaten(false);
        dialog.showMessageBox(fenster, { type: 'info', title: 'DOM', message: !r.ok ? 'Konnte nicht nachsehen: ' + r.grund : r.neu && r.neu !== app.getVersion() ? `Fassung ${r.neu} wird geladen. Danach fragt DOM, ob jetzt neu gestartet werden soll.` : `DOM ist aktuell (${app.getVersion()}).` });
      } },
      { label: 'Über DOM', click: () => dialog.showMessageBox(fenster, { type: 'info', title: 'DOM', message: `DOM Projektmanagement\nFassung ${app.getVersion()}` }) },
    ] },
  ]);
}

// Kleine Merkliste des Programms (z. B. zuletzt gewählter Ordner zum Speichern)
const EINST = () => path.join(app.getPath('userData'), 'programm.json');
function einst() { try { return JSON.parse(fs.readFileSync(EINST(), 'utf8')); } catch { return {}; } }
function einstSetzen(neu) { try { fs.writeFileSync(EINST(), JSON.stringify({ ...einst(), ...neu })); } catch {} }
function sauber(name) { return String(name || 'Dokument').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150); }
function filter(name) {
  const e = path.extname(String(name)).slice(1).toLowerCase();
  const n = { pdf: 'PDF-Dokument', xlsx: 'Excel-Mappe', csv: 'CSV', jpg: 'Bild', png: 'Bild' }[e];
  return n ? [{ name: n, extensions: [e] }, { name: 'Alle Dateien', extensions: ['*'] }] : [];
}
