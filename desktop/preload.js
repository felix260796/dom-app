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
  /** Per E-Mail senden: dateien [{ name, daten: ArrayBuffer }], Empfänger, Betreff, Text. Öffnet Outlook mit Anhang oder das Mailprogramm. */
  mail: (dateien, an, betreff, text) => ipcRenderer.invoke('dom:mail', dateien, an, betreff, text),
  /** Neue Fassung geladen: fn(version). Auch wenn sie schon vor dem Laden der Seite bereitlag. */
  updateBereit: (fn) => { ipcRenderer.on('dom:updateBereit', (e, v) => fn(v)); ipcRenderer.invoke('dom:updateBereit').then((v) => v && fn(v)); },
  /** Neue Fassung einspielen: DOM schließt sich, spielt sie ein und startet von selbst wieder. */
  jetztUpdaten: () => ipcRenderer.invoke('dom:jetztUpdaten'),
  /** Fehler der Seite ins Protokoll (fehler.log im Benutzerordner). */
  fehler: (text) => ipcRenderer.send('dom:fehler', text),
});
