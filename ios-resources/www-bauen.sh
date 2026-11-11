#!/bin/sh
# Kopiert die App-Dateien nach www/ (für die iPhone-Hülle). Läuft nur in GitHub Actions.
set -e
rm -rf www && mkdir www
rsync -a ./ www/ \
  --exclude '.git' --exclude '.github' --exclude 'node_modules' --exclude 'www' --exclude 'ios' \
  --exclude 'ios-resources' --exclude 'supabase' --exclude 'docs' --exclude '*.md' \
  --exclude 'package.json' --exclude 'package-lock.json' --exclude 'capacitor.config.json' \
  --exclude '.gitignore' --exclude '.nojekyll' --exclude 'diag.html' --exclude 'social.js'
test -f www/index.html
