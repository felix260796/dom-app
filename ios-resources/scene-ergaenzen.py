# Lässt den SceneDelegate der Capacitor-Vorlage geteilte Dateien an DomAblage (DomGeraet.swift) melden.
# Läuft nur in GitHub Actions. Bricht ab, wenn die Vorlage anders aussieht, damit es auffällt.
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
if 'DomAblage.merken' in s:
    sys.exit(0)
ersetzen = [
    ('        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)',
     '        connectionOptions.urlContexts.forEach { DomAblage.merken($0.url) }\n'),
    ('        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)',
     '        URLContexts.forEach { DomAblage.merken($0.url) }\n'),
]
for alt, davor in ersetzen:
    if alt not in s:
        print(open(p, encoding='utf-8').read())
        sys.exit('SceneDelegate sieht anders aus als erwartet: ' + alt.strip())
    s = s.replace(alt, davor + alt, 1)
open(p, 'w', encoding='utf-8').write(s)
print('SceneDelegate ergänzt')
