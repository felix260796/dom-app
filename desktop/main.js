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
}

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
  ipcMain.handle('dom:zeigen', (e, pfad) => { if (typeof pfad === 'string' && fs.existsSync(pfad)) shell.showItemInFolder(pfad); });
  oeffnen();
  updaten(false);
  setInterval(() => updaten(false), 4 * 60 * 60 * 1000);
});

app.on('second-instance', () => { if (fenster) { if (fenster.isMinimized()) fenster.restore(); fenster.focus(); } });
app.on('window-all-closed', () => app.quit());

// Neue Fassung: im Hintergrund laden, beim nächsten Schließen einspielen
async function updaten(sofort) {
  if (!app.isPackaged) return { ok: false, grund: 'nicht installiert' };
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoInstallOnAppQuit = true;
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
      p('Kalender', 'kalender', 'CmdOrCtrl+K'),
      p('Auswertung', 'auswertung'),
      p('Preisliste', 'preisliste'),
      { type: 'separator' },
      p('Zurück', 'zurueck', 'Alt+Left'),
      { type: 'separator' },
      { label: 'Größer', role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' }, { label: 'Kleiner', role: 'zoomOut' }, { label: 'Normale Größe', role: 'resetZoom' },
      { label: 'Vollbild', role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'Neu laden', role: 'reload' },
    ] },
    { label: 'Hilfe', submenu: [
      p('Wie geht das?', 'hilfe', 'F1'),
      p('Tastenkürzel', 'kuerzel'),
      { type: 'separator' },
      { label: 'Nach neuer Fassung suchen', click: async () => {
        const r = await updaten(false);
        dialog.showMessageBox(fenster, { type: 'info', title: 'DOM', message: !r.ok ? 'Konnte nicht nachsehen: ' + r.grund : r.neu && r.neu !== app.getVersion() ? `Fassung ${r.neu} wird geladen und beim Schließen eingespielt.` : `DOM ist aktuell (${app.getVersion()}).` });
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
