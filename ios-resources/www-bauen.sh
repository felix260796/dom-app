#!/bin/sh
# Kopiert die App-Dateien nach www/ (für die iPhone-Hülle). Läuft nur in GitHub Actions.
set -e
rm -rf www && mkdir www
rsync -a ./ www/ \
  --exclude '.git' --exclude '.github' --exclude 'node_modules' --exclude 'www' --exclude 'ios' --exclude 'desktop' \
  --exclude 'ios-resources' --exclude 'supabase' --exclude 'docs' --exclude '*.md' \
  --exclude 'package.json' --exclude 'package-lock.json' --exclude 'capacitor.config.json' \
  --exclude '.gitignore' --exclude '.nojekyll' --exclude 'diag.html' --exclude 'social.js'
test -f www/index.html
# Brücke zur iPhone-Hülle (für Mitteilungen, push.js): nur in der App aus TestFlight, nicht auf der Webseite
cp node_modules/@capacitor/core/dist/capacitor.js www/capacitor.js
sed -i.bak 's#<script src="vendor/jspdf.umd.min.js"></script>#<script src="capacitor.js"></script>\
  <script src="vendor/jspdf.umd.min.js"></script>#' www/index.html && rm www/index.html.bak
grep -q 'capacitor.js' www/index.html
