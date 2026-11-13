#!/usr/bin/env python3
"""Signatur für den iPhone-Bau über die App-Store-Connect-API. Läuft nur in GitHub Actions.

  signatur.py <ordner>   Verteilungszertifikat und Profil erzeugen, Dateien in <ordner> ablegen

Jeder Lauf erzeugt ein eigenes Zertifikat. Das Profil heißt "DOM CI <Zertifikat-ID>", daran erkennt ein
späterer Lauf die eigenen Zertifikate und löscht sie samt Profil, sobald sie älter als 24 Stunden sind
(vorher könnte Apple den damit signierten Bau noch verarbeiten). Andere Zertifikate werden nicht angefasst.
"""
import base64, calendar, json, os, subprocess, sys, time, urllib.request, urllib.error, urllib.parse
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


# Ein Zertifikat darf erst weg, wenn Apple den damit signierten Bau sicher fertig verarbeitet hat.
# Wird es vorher gelöscht, bleibt der Bau bei Apple für immer auf "wird verarbeitet" hängen
# (so geschehen am 12.11.2026: mehrere Bauten kurz hintereinander, jeder löschte das Zertifikat des vorigen).
SCHONFRIST_STUNDEN = float(os.environ.get('SIGNATUR_SCHONFRIST_STUNDEN', '24'))
NOTFALL_STUNDEN = float(os.environ.get('SIGNATUR_NOTFALL_STUNDEN', '3'))


def _alter_stunden(cert):
    """Alter eines Zertifikats in Stunden. Verteilungszertifikate gelten genau ein Jahr ab Anlage."""
    ablauf = cert['attributes'].get('expirationDate') or ''
    try:
        t = calendar.timegm(time.strptime(ablauf[:19], '%Y-%m-%dT%H:%M:%S'))
    except ValueError:
        return 1e9  # unbekannt: wie alt behandeln
    angelegt = t - 365 * 86400
    return (time.time() - angelegt) / 3600


def eigene():
    """Unsere Zertifikate aus früheren Läufen (Profil "DOM CI <id>"), älteste zuerst: [(alter_h, cert_id, profil_id)]."""
    profile = api('GET', '/profiles?limit=200&fields[profiles]=name')['data']
    certs = {c['id']: c for c in api('GET', '/certificates?limit=200&filter[certificateType]=DISTRIBUTION')['data']}
    liste = []
    for p in profile:
        name = p['attributes']['name']
        if name.startswith(PRAEFIX):
            cid = name[len(PRAEFIX):]
            liste.append((_alter_stunden(certs[cid]) if cid in certs else 1e9, cid, p['id']))
    return sorted(liste, reverse=True)


def entfernen(alter, cid, pid):
    print(f'Entferne altes Zertifikat {cid} ({alter:.1f} h alt)')
    api('DELETE', '/certificates/' + cid, fehler_ok=True)
    api('DELETE', '/profiles/' + pid, fehler_ok=True)


def reste_entfernen():
    """Nur Zertifikate löschen, die älter als die Schonfrist sind. Jüngere gehören zu Bauten, die Apple evtl. noch verarbeitet."""
    for alter, cid, pid in eigene():
        if alter >= SCHONFRIST_STUNDEN:
            entfernen(alter, cid, pid)
        else:
            print(f'Behalte Zertifikat {cid} ({alter:.1f} h alt, Apple verarbeitet den Bau evtl. noch)')


def zertifikat_anlegen(csr):
    daten = {'data': {'type': 'certificates', 'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': csr}}}
    cert = api('POST', '/certificates', daten, fehler_ok=True)
    if cert:
        return cert['data']
    # Grenze der Verteilungszertifikate erreicht: das älteste eigene löschen, aber nie eines, das jünger als die Notfallfrist ist
    for alter, cid, pid in eigene():
        if alter >= NOTFALL_STUNDEN:
            print('Apple erlaubt kein weiteres Zertifikat.')
            entfernen(alter, cid, pid)
            return api('POST', '/certificates', daten)['data']
        break
    sys.exit('Apple erlaubt gerade kein weiteres Verteilungszertifikat, und alle eigenen sind jünger als '
             f'{NOTFALL_STUNDEN:g} Stunden (deren Bauten verarbeitet Apple evtl. noch). Bitte später erneut bauen.')


def anlegen(ordner):
    os.makedirs(ordner, exist_ok=True)
    bundle = os.environ['BUNDLE_ID']
    reste_entfernen()

    key, csr = os.path.join(ordner, 'dist.key'), os.path.join(ordner, 'dist.csr')
    subprocess.run(['openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr,
                    '-subj', '/CN=DOM CI/C=DE'], check=True, capture_output=True)
    cert = zertifikat_anlegen(open(csr).read())
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
