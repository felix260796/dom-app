// Kopiert die App-Dateien nach desktop/app/ (für das Windows-Programm). Läuft nur in GitHub Actions: node desktop/app-bauen.js
const fs = require('fs'), path = require('path');
const quelle = path.join(__dirname, '..'), ziel = path.join(__dirname, 'app');
const WEG = new Set(['.git', '.github', 'node_modules', 'www', 'ios', 'desktop', 'ios-resources', 'supabase', 'docs',
  'package.json', 'package-lock.json', 'capacitor.config.json', '.gitignore', '.nojekyll', 'diag.html', 'social.js', 'w3.png', '__pycache__']);
fs.rmSync(ziel, { recursive: true, force: true });
fs.mkdirSync(ziel, { recursive: true });
for (const name of fs.readdirSync(quelle)) {
  if (WEG.has(name) || name.endsWith('.md')) continue;
  fs.cpSync(path.join(quelle, name), path.join(ziel, name), { recursive: true, filter: (q) => !q.endsWith('.DS_Store') && !q.endsWith('.md') });
}
if (!fs.existsSync(path.join(ziel, 'index.html'))) throw new Error('index.html fehlt');
console.log('App-Dateien kopiert nach', ziel);
