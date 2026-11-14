'use strict';
/* DOM als Programm für Windows (Electron). Lädt dieselben App-Dateien wie die iPhone-App (Ordner app/, beim Bau kopiert)
 * über die eigene Adresse app://dom/, damit der Speicher (IndexedDB) immer am selben Ort bleibt. Daten kommen wie
 * überall über den Cloud-Abgleich (sync.js). Neue Fassungen holt sich das Programm selbst von GitHub (electron-updater). */
const { app, BrowserWindow, protocol, net, shell, session, ipcMain, Menu } = require('electron');
const path = require('path');
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
    backgroundColor: '#14263b', title: 'DOM', autoHideMenuBar: true, show: false,
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
  Menu.setApplicationMenu(null);
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
  ipcMain.handle('dom:version', () => app.getVersion());
  ipcMain.handle('dom:update', () => updaten(true));
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
