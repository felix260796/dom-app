// Sagt der App, dass sie als Programm am Computer läuft (core.js/app.js: Oberfläche für Maus und Tastatur).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('DomDesktop', {
  version: () => ipcRenderer.invoke('dom:version'),
  update: () => ipcRenderer.invoke('dom:update'),
});
