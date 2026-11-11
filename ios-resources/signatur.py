#!/usr/bin/env python3
"""Signatur für den iPhone-Bau über die App-Store-Connect-API. Läuft nur in GitHub Actions.

  signatur.py <ordner>   Verteilungszertifikat und Profil erzeugen, Dateien in <ordner> ablegen

Jeder Lauf erzeugt ein eigenes Zertifikat. Das Profil heißt "DOM CI <Zertifikat-ID>", daran erkennt der
nächste Lauf das Zertifikat des vorigen und löscht beides, bevor er neu anlegt. So liegt immer höchstens
ein solches Zertifikat im Konto. Andere Zertifikate werden nicht angefasst.
"""
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error, urllib.parse
import jwt  # pyjwt

API = 'https://api.appstoreconnect.apple.com/v1'
PRAEFIX = 'DOM CI '


def token():
    return jwt.encode({'iss': os.environ['ASC_ISSUER_ID'], 'iat': int(time.time()), 'exp': int(time.time()) + 900,
                       'aud': 'appstoreconnect-v1'}, open(os.environ['ASC_KEY_FILE']).read(), algorithm='ES256',
                      headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'})


def api(methode, pfad, daten=None, fehler_ok=False):
    req = urllib.request.Request(API + pfad, method=methode, data=json.dumps(daten).encode() if daten else None,
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        if fehler_ok:
            print(f'  (übergangen: {methode} {pfad} -> {e.code})')
            return None
        sys.exit(f'Apple-API-Fehler {e.code} bei {methode} {pfad}:\n{text}')


def reste_entfernen():
    """Profile "DOM CI <id>" aus früheren Läufen samt ihrem Zertifikat löschen."""
    profile = api('GET', '/profiles?limit=200&fields[profiles]=name')['data']
    for p in profile:
        name = p['attributes']['name']
        if name.startswith(PRAEFIX):
            print('Entferne Rest:', name)
            api('DELETE', '/certificates/' + name[len(PRAEFIX):], fehler_ok=True)
            api('DELETE', '/profiles/' + p['id'], fehler_ok=True)


def anlegen(ordner):
    os.makedirs(ordner, exist_ok=True)
    bundle = os.environ['BUNDLE_ID']
    reste_entfernen()

    key, csr = os.path.join(ordner, 'dist.key'), os.path.join(ordner, 'dist.csr')
    subprocess.run(['openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr,
                    '-subj', '/CN=DOM CI/C=DE'], check=True, capture_output=True)
    cert = api('POST', '/certificates', {'data': {'type': 'certificates', 'attributes': {
        'certificateType': 'DISTRIBUTION', 'csrContent': open(csr).read()}}})['data']
    cert_id = cert['id']
    open(os.path.join(ordner, 'dist.cer'), 'wb').write(base64.b64decode(cert['attributes']['certificateContent']))
    print('Zertifikat angelegt:', cert['attributes'].get('name'))

    ids = api('GET', '/bundleIds?limit=200&filter[identifier]=' + urllib.parse.quote(bundle))['data']
    ids = [b for b in ids if b['attributes']['identifier'] == bundle]
    if not ids:
        sys.exit(f'Die Bundle-ID {bundle} ist bei Apple nicht angelegt.')

    # Mitteilungen (Push) für die App freischalten, falls noch nicht geschehen. Muss vor dem Profil passieren.
    api('POST', '/bundleIdCapabilities', {'data': {'type': 'bundleIdCapabilities', 'attributes': {'capabilityType': 'PUSH_NOTIFICATIONS'},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': ids[0]['id']}}}}}, fehler_ok=True)

    name = PRAEFIX + cert_id
    prof = api('POST', '/profiles', {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': 'IOS_APP_STORE'},
        'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': ids[0]['id']}},
                          'certificates': {'data': [{'type': 'certificates', 'id': cert_id}]}}}})['data']
    uuid = prof['attributes']['uuid']
    inhalt = base64.b64decode(prof['attributes']['profileContent'])
    for ziel in ('~/Library/MobileDevice/Provisioning Profiles', '~/Library/Developer/Xcode/UserData/Provisioning Profiles'):
        ziel = os.path.expanduser(ziel)
        os.makedirs(ziel, exist_ok=True)
        open(os.path.join(ziel, uuid + '.mobileprovision'), 'wb').write(inhalt)
    with open(os.environ['GITHUB_ENV'], 'a') as f:
        f.write(f'SIGN_PROFILE_NAME={name}\n')
    print('Profil angelegt:', name)


if __name__ == '__main__':
    anlegen(sys.argv[1])
