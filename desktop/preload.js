// Sagt der App, dass sie als Programm am Computer läuft (core.js/app.js: Oberfläche für Maus und Tastatur).
// Dazu: Befehle aus der Menüleiste (Datei, Bearbeiten, Ansicht …) und Dateien speichern oder im Standardprogramm öffnen.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('DomDesktop', {
  version: () => ipcRenderer.invoke('dom:version'),
  update: () => ipcRenderer.invoke('dom:update'),
  /** Menüleiste: fn(befehl) wird bei jedem Menüpunkt bzw. Tastenkürzel aufgerufen. */
  befehle: (fn) => ipcRenderer.on('dom:befehl', (e, b) => fn(b)),
  /** „Speichern unter …“: name, Inhalt als ArrayBuffer. Gibt den Pfad zurück oder null (abgebrochen). */
  speichern: (name, daten) => ipcRenderer.invoke('dom:speichern', name, daten),
  /** Datei im Standardprogramm öffnen (PDF-Programm, Excel …), zum Ansehen oder Drucken. */
  oeffnen: (name, daten) => ipcRenderer.invoke('dom:oeffnen', name, daten),
  /** Gespeicherte Datei im Explorer zeigen. */
  zeigen: (pfad) => ipcRenderer.invoke('dom:zeigen', pfad),
});
