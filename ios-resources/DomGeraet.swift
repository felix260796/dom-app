// DOM – iPhone-Funktionen für die App aus TestFlight (wird nur beim Bau in GitHub Actions ins Xcode-Projekt kopiert).
// Gegenstück in der App: geraet.js (window.Geraet). Jede Funktion lässt sich dort je Gerät ein- und ausschalten.
//   scannen         Apples Dokumentenscanner (Ränder erkennen, gerade ziehen, mehrere Seiten)
//   raumScannen     Raum mit LiDAR scannen (RoomPlan), liefert Länge, Breite, Höhe, Türen und Fenster
//   entsperren      Face ID bzw. Gerätecode beim Öffnen
//   kalender…       Termine in einen eigenen Kalender „DOM“ auf dem iPhone schreiben
//   kontakt…        Kontakt aus dem Adressbuch wählen, Kunden als Kontakt speichern
//   geteilteHolen   Dateien, die über „Teilen“ an DOM geschickt wurden (PDF, Bilder)
//   aufnahme…       Gespräch vor Ort aufnehmen, läuft auch bei Sperre, in anderen Apps und nach Unterbrechungen weiter

import Foundation
import UIKit
import Capacitor
import VisionKit
import LocalAuthentication
import EventKit
import Contacts
import ContactsUI
import UniformTypeIdentifiers
import RoomPlan
import simd
import AVFoundation

/// Nicht in Gebrauch: Das Plugin wird über packageClassList in capacitor.config.json angemeldet (siehe Bau). Bleibt als Rückweg.
class DomBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DomGeraetPlugin())
    }
}

/// Merkt sich Dateien, die über „Teilen“ bzw. „Öffnen in DOM“ ankommen (AppDelegate ruft merken auf).
enum DomAblage {
    static var offen: [URL] = []
    static func merken(_ url: URL) {
        guard url.isFileURL else { return }
        offen.append(url)
        NotificationCenter.default.post(name: Notification.Name("domDateiGeteilt"), object: nil)
    }
}

@objc(DomGeraetPlugin)
public class DomGeraetPlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate, CNContactPickerDelegate, CNContactViewControllerDelegate {
    public let identifier = "DomGeraetPlugin"
    public let jsName = "DomGeraet"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "faehigkeiten", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scannen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "raumScannen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entsperren", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kalenderErlaubnis", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kalenderSchreiben", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kalenderLoeschen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kalenderAus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kontaktWaehlen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kontaktSpeichern", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geteilteHolen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "aufnahmeStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "aufnahmePause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "aufnahmeWeiter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "aufnahmeStopp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "aufnahmeLesen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "aufnahmeStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "aufnahmeAbbrechen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "audioFreigeben", returnType: CAPPluginReturnPromise),
    ]

    private var scanCall: CAPPluginCall?
    private var kontaktCall: CAPPluginCall?
    private var speichernCall: CAPPluginCall?
    private let store = EKEventStore()

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(geteilt), name: Notification.Name("domDateiGeteilt"), object: nil)
    }

    @objc private func geteilt() {
        notifyListeners("geteilt", data: ["anzahl": DomAblage.offen.count], retainUntilConsumed: true)
    }

    private func zeigen(_ vc: UIViewController) {
        guard let oben = bridge?.viewController else { return }
        var top: UIViewController = oben
        while let p = top.presentedViewController { top = p }
        // iPad: Fenster, die als Sprechblase aufgehen, brauchen einen Ankerpunkt, sonst stürzt die App ab
        if let pop = vc.popoverPresentationController, pop.sourceView == nil, pop.barButtonItem == nil {
            pop.sourceView = top.view
            pop.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        top.present(vc, animated: true)
    }

    // MARK: Was kann dieses Gerät?

    @objc func faehigkeiten(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var fehler: NSError?
        let bio = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &fehler)
        let art: String
        switch ctx.biometryType {
        case .faceID: art = "Face ID"
        case .touchID: art = "Touch ID"
        default: art = ""
        }
        DispatchQueue.main.async {
            call.resolve([
                "scanner": VNDocumentCameraViewController.isSupported,
                "lidar": RoomCaptureSession.isSupported,
                "wohnungScan": DomRaumScan.wohnungMoeglich,
                "biometrie": bio,
                "biometrieArt": art,
            ])
        }
    }

    // MARK: Dokumentenscanner

    @objc func scannen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard VNDocumentCameraViewController.isSupported else {
                call.reject("Der Scanner geht auf diesem Gerät nicht.")
                return
            }
            self.scanCall = call
            let vc = VNDocumentCameraViewController()
            vc.delegate = self
            self.zeigen(vc)
        }
    }

    private func verkleinern(_ bild: UIImage, _ maxSeite: CGFloat) -> UIImage {
        let s = bild.size
        let f = min(1, maxSeite / max(s.width, s.height))
        if f >= 1 { return bild }
        let neu = CGSize(width: floor(s.width * f), height: floor(s.height * f))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: neu, format: format).image { _ in bild.draw(in: CGRect(origin: .zero, size: neu)) }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        var seiten: [String] = []
        for i in 0..<scan.pageCount {
            if let d = verkleinern(scan.imageOfPage(at: i), 2000).jpegData(compressionQuality: 0.85) {
                seiten.append("data:image/jpeg;base64," + d.base64EncodedString())
            }
        }
        let call = scanCall
        scanCall = nil
        controller.dismiss(animated: true) { call?.resolve(["seiten": seiten]) }
    }

    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        let call = scanCall
        scanCall = nil
        controller.dismiss(animated: true) { call?.resolve(["seiten": []]) }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        let call = scanCall
        scanCall = nil
        controller.dismiss(animated: true) { call?.reject("Scannen ging nicht: " + error.localizedDescription) }
    }

    // MARK: Raum mit LiDAR scannen

    @objc func raumScannen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard RoomCaptureSession.isSupported else {
                call.reject("Dieses Gerät hat keinen LiDAR-Scanner.")
                return
            }
            let vc = DomRaumScan()
            vc.modalPresentationStyle = .fullScreen
            vc.wohnung = (call.getBool("wohnung") ?? false) && DomRaumScan.wohnungMoeglich
            vc.fertigWohnung = { raeume, gesamt, fehler in
                if let fehler = fehler { call.reject("Der Scan hat nicht geklappt: " + fehler); return }
                if raeume.isEmpty { call.resolve(["abgebrochen": true]); return }
                var r: [String: Any] = ["wohnung": true, "raeume": raeume.map { DomRaumScan.masse($0) }]
                if let gesamt = gesamt { r["gesamt"] = gesamt }
                call.resolve(r)
            }
            vc.fertig = { raum, fehler in
                if let raum = raum {
                    call.resolve(DomRaumScan.masse(raum))
                } else if let fehler = fehler {
                    call.reject("Der Scan hat nicht geklappt: " + fehler)
                } else {
                    call.resolve(["abgebrochen": true])
                }
            }
            self.zeigen(vc)
        }
    }

    // MARK: Face ID beim Öffnen

    @objc func entsperren(_ call: CAPPluginCall) {
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Abbrechen"
        var fehler: NSError?
        // Ohne Gerätecode lässt sich nichts prüfen: dann nicht aussperren
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &fehler) else {
            call.resolve(["ok": true, "ohneSperre": true])
            return
        }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: call.getString("grund") ?? "DOM entsperren") { ok, _ in
            call.resolve(["ok": ok])
        }
    }

    // MARK: Kalender

    private func kalenderErlaubt() -> Bool {
        let s = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) { return s == .fullAccess }
        return s.rawValue == 3 // .authorized
    }

    @objc func kalenderErlaubnis(_ call: CAPPluginCall) {
        if kalenderErlaubt() { call.resolve(["ok": true]); return }
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents { ok, _ in call.resolve(["ok": ok]) }
        } else {
            store.requestAccess(to: .event) { ok, _ in call.resolve(["ok": ok]) }
        }
    }

    /// Eigener Kalender „DOM“: lässt sich in der Kalender-App ausblenden und beim Ausschalten ganz entfernen.
    private func domKalender() throws -> EKCalendar {
        let ud = UserDefaults.standard
        if let id = ud.string(forKey: "domKalender"), let k = store.calendar(withIdentifier: id) { return k }
        let k = EKCalendar(for: .event, eventStore: store)
        k.title = "DOM"
        k.cgColor = UIColor(red: 0.118, green: 0.208, blue: 0.314, alpha: 1).cgColor
        let quellen = [store.defaultCalendarForNewEvents?.source] + store.sources.filter { $0.sourceType == .calDAV || $0.sourceType == .local }.map { Optional($0) }
        var letzter: Error?
        for q in quellen.compactMap({ $0 }) {
            k.source = q
            do {
                try store.saveCalendar(k, commit: true)
                ud.set(k.calendarIdentifier, forKey: "domKalender")
                return k
            } catch { letzter = error }
        }
        throw letzter ?? NSError(domain: "DOM", code: 1, userInfo: [NSLocalizedDescriptionKey: "Kein Kalender auf dem iPhone gefunden."])
    }

    private func zahl(_ v: JSValue?) -> Double? { (v as? NSNumber)?.doubleValue ?? (v as? Double) }

    @objc func kalenderSchreiben(_ call: CAPPluginCall) {
        guard kalenderErlaubt() else { call.reject("Kein Zugriff auf den Kalender."); return }
        let liste = (call.getArray("eintraege") ?? []).compactMap { $0 as? JSObject }
        do {
            let kal = try domKalender()
            var ids: [String] = []
            for o in liste {
                var ev: EKEvent? = nil
                if let id = o["eventId"] as? String, !id.isEmpty { ev = store.event(withIdentifier: id) }
                let e = ev ?? EKEvent(eventStore: store)
                if ev == nil { e.calendar = kal }
                e.title = o["titel"] as? String ?? "Termin"
                e.location = o["ort"] as? String
                e.notes = o["notiz"] as? String
                e.isAllDay = o["ganztag"] as? Bool ?? false
                e.startDate = Date(timeIntervalSince1970: (zahl(o["start"]) ?? 0) / 1000)
                e.endDate = Date(timeIntervalSince1970: (zahl(o["ende"]) ?? zahl(o["start"]) ?? 0) / 1000)
                e.alarms = nil
                if let min = zahl(o["erinnerung"]), min > 0 { e.addAlarm(EKAlarm(relativeOffset: -min * 60)) }
                try store.save(e, span: .thisEvent, commit: false)
                ids.append(e.eventIdentifier ?? "")
            }
            try store.commit()
            call.resolve(["ids": ids])
        } catch {
            store.reset()
            call.reject("Kalender: " + error.localizedDescription)
        }
    }

    @objc func kalenderLoeschen(_ call: CAPPluginCall) {
        guard kalenderErlaubt() else { call.resolve(); return }
        let ids = (call.getArray("ids") ?? []).compactMap { $0 as? String }
        for id in ids {
            if let e = store.event(withIdentifier: id) { try? store.remove(e, span: .thisEvent, commit: false) }
        }
        try? store.commit()
        call.resolve()
    }

    /// Ausgeschaltet: den ganzen Kalender „DOM“ vom iPhone nehmen.
    @objc func kalenderAus(_ call: CAPPluginCall) {
        let ud = UserDefaults.standard
        if kalenderErlaubt(), let id = ud.string(forKey: "domKalender"), let k = store.calendar(withIdentifier: id) {
            try? store.removeCalendar(k, commit: true)
        }
        ud.removeObject(forKey: "domKalender")
        call.resolve()
    }

    // MARK: Kontakte

    @objc func kontaktWaehlen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.kontaktCall = call
            let vc = CNContactPickerViewController()
            vc.delegate = self
            self.zeigen(vc)
        }
    }

    public func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        var adresse = ""
        if let a = contact.postalAddresses.first?.value {
            adresse = [a.street.replacingOccurrences(of: "\n", with: " "), [a.postalCode, a.city].filter { !$0.isEmpty }.joined(separator: " ")].filter { !$0.isEmpty }.joined(separator: ", ")
        }
        var geburtstag = ""
        if let g = contact.birthday, let j = g.year, let m = g.month, let t = g.day { geburtstag = String(format: "%04d-%02d-%02d", j, m, t) }
        kontaktCall?.resolve([
            "vorname": contact.givenName,
            "name": contact.familyName,
            "firma": contact.organizationName,
            "telefon": contact.phoneNumbers.first?.value.stringValue ?? "",
            "email": (contact.emailAddresses.first?.value as String?) ?? "",
            "adresse": adresse,
            "geburtstag": geburtstag,
        ])
        kontaktCall = nil
    }

    public func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        kontaktCall?.resolve([:])
        kontaktCall = nil
    }

    /// Zeigt den neuen Kontakt vorausgefüllt an, gespeichert wird erst mit „Fertig“ (keine Erlaubnis nötig).
    @objc func kontaktSpeichern(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let c = CNMutableContact()
            c.givenName = call.getString("vorname") ?? ""
            c.familyName = call.getString("name") ?? ""
            c.organizationName = call.getString("firma") ?? ""
            if let t = call.getString("telefon"), !t.isEmpty { c.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: t))] }
            if let m = call.getString("email"), !m.isEmpty { c.emailAddresses = [CNLabeledValue(label: CNLabelWork, value: m as NSString)] }
            if let a = call.getString("adresse"), !a.isEmpty {
                let p = CNMutablePostalAddress()
                let teile = a.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
                p.street = teile.first ?? a
                if teile.count > 1 {
                    let ort = teile[1]
                    if let r = ort.range(of: #"^\d{4,5}\s+"#, options: .regularExpression) {
                        p.postalCode = String(ort[r]).trimmingCharacters(in: .whitespaces)
                        p.city = String(ort[r.upperBound...])
                    } else { p.city = ort }
                }
                c.postalAddresses = [CNLabeledValue(label: CNLabelHome, value: p)]
            }
            if let n = call.getString("notiz"), !n.isEmpty { c.note = n }
            self.speichernCall = call
            let vc = CNContactViewController(forNewContact: c)
            vc.delegate = self
            self.zeigen(UINavigationController(rootViewController: vc))
        }
    }

    public func contactViewController(_ viewController: CNContactViewController, didCompleteWith contact: CNContact?) {
        let call = speichernCall
        speichernCall = nil
        viewController.dismiss(animated: true) { call?.resolve(["gespeichert": contact != nil]) }
    }

    // MARK: Über „Teilen“ geschickte Dateien

    @objc func geteilteHolen(_ call: CAPPluginCall) {
        let urls = DomAblage.offen
        DomAblage.offen = []
        var dateien: [[String: Any]] = []
        for url in urls {
            let zugriff = url.startAccessingSecurityScopedResource()
            defer { if zugriff { url.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: url) else { continue }
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            dateien.append(["name": url.lastPathComponent, "mime": mime, "data": "data:\(mime);base64," + d.base64EncodedString()])
            if url.path.contains("/Inbox/") { try? FileManager.default.removeItem(at: url) }
        }
        call.resolve(["dateien": dateien])
    }

    // MARK: Gesprächsaufnahme (läuft durch)

    @objc func aufnahmeStart(_ call: CAPPluginCall) {
        let los = {
            DispatchQueue.main.async {
                do { try DomAufnahme.shared.start(); call.resolve(DomAufnahme.shared.status()) }
                catch { call.reject("Aufnahme ging nicht: " + error.localizedDescription) }
            }
        }
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: los()
        case .denied: call.reject("Kein Zugriff aufs Mikrofon. Bitte in den iPhone-Einstellungen bei DOM das Mikrofon erlauben.")
        default:
            AVAudioSession.sharedInstance().requestRecordPermission { ok in
                if ok { los() } else { call.reject("Kein Zugriff aufs Mikrofon. Bitte in den iPhone-Einstellungen bei DOM das Mikrofon erlauben.") }
            }
        }
    }

    @objc func aufnahmePause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { DomAufnahme.shared.pause(); call.resolve(DomAufnahme.shared.status()) }
    }

    @objc func aufnahmeWeiter(_ call: CAPPluginCall) {
        DispatchQueue.main.async { DomAufnahme.shared.weiter(); call.resolve(DomAufnahme.shared.status()) }
    }

    @objc func aufnahmeStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(DomAufnahme.shared.status()) }
    }

    /// Beenden. Liefert den Pfad der fertigen Datei; die App holt sie über convertFileSrc oder aufnahmeLesen.
    @objc func aufnahmeStopp(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let n = DomAufnahme.shared.unterbrechungen
            DomAufnahme.shared.stopp { url, fehler in
                if let url = url { call.resolve(["pfad": url.path, "unterbrechungen": n]) }
                else { call.reject(fehler ?? "Die Aufnahme ist leer.") }
            }
        }
    }

    /// Aufnahme verwerfen (z. B. „Zurück“ beim Sprechen) und das Mikrofon freigeben.
    @objc func aufnahmeAbbrechen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            DomAufnahme.shared.abbrechen()
            DomAufnahme.freigeben()
            call.resolve()
        }
    }

    /// Audio der App abgeben, damit vorher laufende Musik (Spotify, Apple Music, Podcast) von selbst weiterspielt.
    /// Nach jeder Aufnahme aufrufen, auch nach einer Aufnahme über das Web-Mikrofon (getUserMedia).
    @objc func audioFreigeben(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            DomAufnahme.freigeben()
            call.resolve()
        }
    }

    /// Ersatzweg: fertige Datei als Base64 (falls die App die Datei nicht direkt laden kann).
    @objc func aufnahmeLesen(_ call: CAPPluginCall) {
        let pfad = call.getString("pfad") ?? ""
        guard pfad.contains("/dom-aufnahme/"), let d = FileManager.default.contents(atPath: pfad) else {
            call.reject("Aufnahme-Datei nicht gefunden.")
            return
        }
        call.resolve(["data": "data:audio/mp4;base64," + d.base64EncodedString()])
    }
}

/// Gesprächsaufnahme vor Ort, die durchläuft (Wunsch Felix): bei Bildschirmsperre, in anderen Apps, beim Fotografieren.
/// Nimmt iOS das Mikrofon kurz weg (Video in der Kamera-App, Anruf, Sprachmemo), endet nur das laufende Teilstück.
/// Danach geht es von selbst mit einem neuen Teil weiter (Unterbrechung vorbei, App wieder vorne, Wächter alle 3 Sekunden).
/// „Beenden“ fügt alle Teile zu einer m4a-Datei zusammen. Braucht UIBackgroundModes „audio“ (info-zusatz.plist).
final class DomAufnahme: NSObject, AVAudioRecorderDelegate {
    static let shared = DomAufnahme()
    private var recorder: AVAudioRecorder?
    private var teile: [URL] = []
    private var waechter: Timer?
    private(set) var aktiv = false
    private(set) var pausiert = false
    private(set) var unterbrechungen = 0
    private var ordner: URL { FileManager.default.temporaryDirectory.appendingPathComponent("dom-aufnahme", isDirectory: true) }

    override init() {
        super.init()
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(unterbrochen(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(nachholen), name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(nachholen), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
    }

    private func sitzung() throws {
        let s = AVAudioSession.sharedInstance()
        try s.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .defaultToSpeaker])
        try s.setActive(true)
    }

    private func neuesTeil() throws {
        try sitzung()
        try FileManager.default.createDirectory(at: ordner, withIntermediateDirectories: true)
        let url = ordner.appendingPathComponent("teil-\(teile.count + 1)-\(Int(Date().timeIntervalSince1970)).m4a")
        let einst: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 22050,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32000,
        ]
        let r = try AVAudioRecorder(url: url, settings: einst)
        r.delegate = self
        guard r.record() else { throw NSError(domain: "DOM", code: 1, userInfo: [NSLocalizedDescriptionKey: "Das Mikrofon ist gerade belegt."]) }
        recorder = r
        teile.append(url)
    }

    func start() throws {
        abbrechen()
        try? FileManager.default.removeItem(at: ordner)
        teile = []
        pausiert = false
        unterbrechungen = 0
        try neuesTeil()
        aktiv = true
        waechter = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.nachholen() }
    }

    func pause() {
        guard aktiv, !pausiert else { return }
        pausiert = true
        recorder?.pause()
    }

    func weiter() {
        guard aktiv, pausiert else { return }
        pausiert = false
        if recorder?.record() != true { recorder?.stop(); try? neuesTeil() }
    }

    /// Läuft die Aufnahme, obwohl sie laufen sollte? Sonst neues Teilstück beginnen.
    @objc private func nachholen() {
        guard aktiv, !pausiert, recorder?.isRecording != true else { return }
        recorder?.stop()
        try? neuesTeil()
    }

    @objc private func unterbrochen(_ n: Notification) {
        guard aktiv, let wert = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let typ = AVAudioSession.InterruptionType(rawValue: wert) else { return }
        if typ == .began {
            unterbrechungen += 1
            recorder?.stop() // Teilstück bleibt erhalten
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.nachholen() }
        }
    }

    func abbrechen() {
        waechter?.invalidate(); waechter = nil
        recorder?.stop(); recorder = nil
        aktiv = false; pausiert = false
    }

    /// Beenden: alle Teile zu einer Datei zusammenfügen. fertig(Datei, Fehler)
    func stopp(_ fertig: @escaping (URL?, String?) -> Void) {
        let liste = teile
        abbrechen()
        DomAufnahme.freigeben()
        let da = liste.filter { (try? $0.checkResourceIsReachable()) == true && ((try? FileManager.default.attributesOfItem(atPath: $0.path)[.size] as? Int) ?? 0) > 0 }
        guard !da.isEmpty else { return fertig(nil, "Die Aufnahme ist leer.") }
        if da.count == 1 { return fertig(da[0], nil) }
        let comp = AVMutableComposition()
        guard let spur = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { return fertig(da.last, nil) }
        var zeit = CMTime.zero
        for url in da {
            let a = AVURLAsset(url: url)
            guard let s = a.tracks(withMediaType: .audio).first else { continue }
            let bereich = CMTimeRange(start: .zero, duration: a.duration)
            if (try? spur.insertTimeRange(bereich, of: s, at: zeit)) != nil { zeit = CMTimeAdd(zeit, a.duration) }
        }
        let ziel = ordner.appendingPathComponent("gespraech-\(Int(Date().timeIntervalSince1970)).m4a")
        guard let exp = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetAppleM4A) else { return fertig(da.last, nil) }
        exp.outputURL = ziel
        exp.outputFileType = .m4a
        exp.exportAsynchronously {
            DispatchQueue.main.async {
                if exp.status == .completed { fertig(ziel, nil) } else { fertig(nil, "Zusammenfügen ging nicht: " + (exp.error?.localizedDescription ?? "")) }
            }
        }
    }

    /// Audio-Sitzung beenden und andere Apps benachrichtigen („notifyOthersOnDeactivation“): Dann spielt die Musik,
    /// die beim Start der Aufnahme angehalten wurde, von selbst weiter (Wunsch Felix). Kurz verzögert und einmal
    /// wiederholt, weil iOS das Abgeben verweigert, solange das Mikrofon noch nicht ganz zu ist.
    static func freigeben() {
        let s = AVAudioSession.sharedInstance()
        let los = {
            guard !DomAufnahme.shared.aktiv else { return }
            do {
                try s.setActive(false, options: .notifyOthersOnDeactivation)
                try? s.setCategory(.ambient)
            } catch {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    guard !DomAufnahme.shared.aktiv else { return }
                    try? s.setActive(false, options: .notifyOthersOnDeactivation)
                    try? s.setCategory(.ambient)
                }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: los)
    }

    func status() -> [String: Any] {
        ["aktiv": aktiv, "pausiert": pausiert, "laeuft": recorder?.isRecording == true, "teile": teile.count, "unterbrechungen": unterbrechungen]
    }
}

/// Vollbild mit Apples Raumscan. „Fertig“ beendet den Scan, danach werden die Maße zurückgegeben.
final class DomRaumScan: UIViewController, RoomCaptureViewDelegate {
    var fertig: ((CapturedRoom?, String?) -> Void)?
    /// Ganze Wohnung: Raum für Raum in derselben AR-Sitzung, am Ende ein gemeinsamer Grundriss (ab iOS 17).
    var wohnung = false
    var fertigWohnung: (([CapturedRoom], [String: Any]?, String?) -> Void)?
    static var wohnungMoeglich: Bool { if #available(iOS 17.0, *) { return RoomCaptureSession.isSupported } else { return false } }
    private var scanView: RoomCaptureView!
    private var erledigt = false
    private let knopf = UIButton(type: .system)
    private let weiterKnopf = UIButton(type: .system)
    private let hinweis = UILabel()
    private var bauen: [Task<CapturedRoom?, Never>] = []
    private var naechster = false
    private var ende = false

    init() { super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { super.init(coder: coder) }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        scanView = RoomCaptureView(frame: view.bounds)
        scanView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scanView.delegate = self
        view.addSubview(scanView)

        let abbrechen = UIButton(type: .system)
        abbrechen.setTitle("Abbrechen", for: .normal)
        abbrechen.addTarget(self, action: #selector(abbrechenTippen), for: .touchUpInside)
        knopf.setTitle("Fertig", for: .normal)
        knopf.addTarget(self, action: #selector(fertigTippen), for: .touchUpInside)
        for b in [abbrechen, knopf] {
            b.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
            b.setTitleColor(.white, for: .normal)
            b.backgroundColor = UIColor(red: 0.118, green: 0.208, blue: 0.314, alpha: 0.9)
            b.layer.cornerRadius = 12
            b.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(b)
        }
        let g = view.safeAreaLayoutGuide
        if wohnung {
            weiterKnopf.setTitle("Nächster Raum", for: .normal)
            weiterKnopf.addTarget(self, action: #selector(weiterTippen), for: .touchUpInside)
            weiterKnopf.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
            weiterKnopf.setTitleColor(.white, for: .normal)
            weiterKnopf.backgroundColor = UIColor(red: 0.69, green: 0.553, blue: 0.341, alpha: 0.95)
            weiterKnopf.layer.cornerRadius = 12
            weiterKnopf.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(weiterKnopf)
            hinweis.text = "Raum 1. Danach „Nächster Raum“, durch die Tür gehen, weiter scannen."
            hinweis.textColor = .white
            hinweis.numberOfLines = 0
            hinweis.textAlignment = .center
            hinweis.font = .systemFont(ofSize: 15, weight: .semibold)
            hinweis.backgroundColor = UIColor(red: 0.118, green: 0.208, blue: 0.314, alpha: 0.85)
            hinweis.layer.cornerRadius = 10
            hinweis.clipsToBounds = true
            hinweis.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(hinweis)
            knopf.setTitle("Fertig", for: .normal)
            NSLayoutConstraint.activate([
                weiterKnopf.centerXAnchor.constraint(equalTo: g.centerXAnchor),
                weiterKnopf.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
                weiterKnopf.heightAnchor.constraint(equalToConstant: 48),
                weiterKnopf.widthAnchor.constraint(equalToConstant: 170),
                hinweis.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
                hinweis.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
                hinweis.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
                hinweis.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            ])
        }
        NSLayoutConstraint.activate([
            abbrechen.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            abbrechen.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
            abbrechen.heightAnchor.constraint(equalToConstant: 48),
            abbrechen.widthAnchor.constraint(equalToConstant: 130),
            knopf.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            knopf.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
            knopf.heightAnchor.constraint(equalToConstant: 48),
            knopf.widthAnchor.constraint(equalToConstant: 130),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        scanView.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    @objc private func fertigTippen() {
        knopf.isEnabled = false
        weiterKnopf.isEnabled = false
        knopf.setTitle("Wird berechnet …", for: .normal)
        ende = true
        scanView.captureSession.stop()
    }

    @objc private func weiterTippen() {
        guard #available(iOS 17.0, *) else { return }
        weiterKnopf.isEnabled = false
        naechster = true
        scanView.captureSession.stop(pauseARSession: false)
    }

    /// Alle Räume fertig berechnen, gemeinsamen Grundriss bauen, zurückgeben.
    private func abschliessen() {
        guard #available(iOS 17.0, *) else { return }
        let aufgaben = bauen
        Task { @MainActor in
            var raeume: [CapturedRoom] = []
            for t in aufgaben { if let r = await t.value, !r.walls.isEmpty { raeume.append(r) } }
            var gesamt: [String: Any]? = nil
            if raeume.count > 1, let s = try? await StructureBuilder(options: [.beautifyObjects]).capturedStructure(from: raeume) {
                gesamt = DomRaumScan.geoTeile(walls: s.walls, doors: s.doors, windows: s.windows, openings: s.openings, objects: s.objects, floors: s.floors)
            }
            self.erledigt = true
            let fehler = raeume.isEmpty ? "Keine Wände erkannt. Bitte langsam alle Wände abfahren." : nil
            self.dismiss(animated: true) { self.fertigWohnung?(raeume, gesamt, fehler) }
        }
    }

    @objc private func abbrechenTippen() {
        guard !erledigt else { return }
        erledigt = true
        scanView.captureSession.stop()
        dismiss(animated: true) { if self.wohnung { self.fertigWohnung?([], nil, nil) } else { self.fertig?(nil, nil) } }
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        guard wohnung else { return !erledigt }
        if #available(iOS 17.0, *) {
            bauen.append(Task { try? await RoomBuilder(options: [.beautifyObjects]).capturedRoom(from: roomDataForProcessing) })
            if naechster {
                naechster = false
                DispatchQueue.main.async {
                    self.hinweis.text = "Raum \(self.bauen.count + 1). Langsam alle Wände abfahren."
                    self.weiterKnopf.isEnabled = true
                    self.scanView.captureSession.run(configuration: RoomCaptureSession.Configuration())
                }
            } else if ende {
                DispatchQueue.main.async { self.abschliessen() }
            }
        }
        return false
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !erledigt, !wohnung else { return }
        erledigt = true
        let fehler = processedResult.walls.isEmpty ? (error?.localizedDescription ?? "Keine Wände erkannt. Bitte langsam alle Wände abfahren.") : nil
        dismiss(animated: true) { self.fertig?(fehler == nil ? processedResult : nil, fehler) }
    }

    /// Grundfläche als Rechteck entlang der längsten Wand, Höhe der höchsten Wand, Türen und Fenster einzeln.
    static func masse(_ r: CapturedRoom) -> [String: Any] {
        var punkte: [SIMD2<Float>] = []
        var hoehe: Float = 0
        var achse = SIMD2<Float>(1, 0)
        var laengste: Float = 0
        for w in r.walls {
            let t = w.transform
            let mitte = SIMD2<Float>(t.columns.3.x, t.columns.3.z)
            let richtung = simd_normalize(SIMD2<Float>(t.columns.0.x, t.columns.0.z))
            let l = w.dimensions.x
            hoehe = max(hoehe, w.dimensions.y)
            punkte.append(mitte + richtung * (l / 2))
            punkte.append(mitte - richtung * (l / 2))
            if l > laengste { laengste = l; achse = richtung }
        }
        let quer = SIMD2<Float>(-achse.y, achse.x)
        let a = punkte.map { simd_dot($0, achse) }
        let b = punkte.map { simd_dot($0, quer) }
        let l1 = (a.max() ?? 0) - (a.min() ?? 0)
        let l2 = (b.max() ?? 0) - (b.min() ?? 0)
        let rund = { (x: Float) -> Double in (Double(x) * 100).rounded() / 100 }
        var flaeche: Double = 0
        if #available(iOS 17.0, *), let boden = r.floors.first {
            let c = boden.polygonCorners
            if c.count >= 3 {
                var s: Float = 0
                for i in 0..<c.count { let p = c[i], q = c[(i + 1) % c.count]; s += p.x * q.y - q.x * p.y }
                flaeche = rund(abs(s) / 2)
            }
        }
        return [
            "laenge": rund(max(l1, l2)),
            "breite": rund(min(l1, l2)),
            "hoehe": rund(hoehe),
            "flaeche": flaeche,
            "waende": r.walls.count,
            "tueren": r.doors.map { ["breite": rund($0.dimensions.x), "hoehe": rund($0.dimensions.y)] },
            "fenster": r.windows.map { ["breite": rund($0.dimensions.x), "hoehe": rund($0.dimensions.y)] },
            "geo": geo(r),
            "art": raumArt(r),
        ]
    }

    /// Ganzer Raum für Grundriss und 3D-Ansicht: Wände, Türen, Fenster, Durchgänge, Möbel, Boden.
    /// Alles in Metern, von oben gesehen (x, z), Höhen ab Fußboden (y).
    static func raumArt(_ r: CapturedRoom) -> String {
        if #available(iOS 17.0, *), let s = r.sections.first { return "\(s.label)" }
        return ""
    }

    static func geo(_ r: CapturedRoom) -> [String: Any] {
        var floors: [CapturedRoom.Surface] = []
        if #available(iOS 17.0, *) { floors = r.floors }
        return geoTeile(walls: r.walls, doors: r.doors, windows: r.windows, openings: r.openings, objects: r.objects, floors: floors)
    }

    static func geoTeile(walls: [CapturedRoom.Surface], doors: [CapturedRoom.Surface], windows: [CapturedRoom.Surface], openings: [CapturedRoom.Surface], objects: [CapturedRoom.Object], floors: [CapturedRoom.Surface]) -> [String: Any] {
        let cm = { (x: Float) -> Double in (Double(x) * 100).rounded() / 100 }
        var boden: Float = .greatestFiniteMagnitude
        for w in walls { boden = min(boden, w.transform.columns.3.y - w.dimensions.y / 2) }
        if boden == .greatestFiniteMagnitude { boden = 0 }
        let waende: [[String: Any]] = walls.map { w in
            let t = w.transform
            let m = SIMD2<Float>(t.columns.3.x, t.columns.3.z)
            let d = simd_normalize(SIMD2<Float>(t.columns.0.x, t.columns.0.z)) * (w.dimensions.x / 2)
            return ["x1": cm(m.x - d.x), "z1": cm(m.y - d.y), "x2": cm(m.x + d.x), "z2": cm(m.y + d.y), "h": cm(w.dimensions.y)]
        }
        func oeffnung(_ s: CapturedRoom.Surface, _ art: String) -> [String: Any] {
            let t = s.transform
            return ["art": art, "x": cm(t.columns.3.x), "z": cm(t.columns.3.z), "a": Double(atan2(t.columns.0.z, t.columns.0.x)),
                    "b": cm(s.dimensions.x), "h": cm(s.dimensions.y), "u": cm(max(0, t.columns.3.y - s.dimensions.y / 2 - boden))]
        }
        let oeffnungen = doors.map { oeffnung($0, "tuer") } + windows.map { oeffnung($0, "fenster") } + openings.map { oeffnung($0, "durchgang") }
        let objekte: [[String: Any]] = objects.map { o in
            let t = o.transform
            return ["k": "\(o.category)", "x": cm(t.columns.3.x), "z": cm(t.columns.3.z), "a": Double(atan2(t.columns.0.z, t.columns.0.x)),
                    "b": cm(o.dimensions.x), "h": cm(o.dimensions.y), "t": cm(o.dimensions.z), "u": cm(max(0, t.columns.3.y - o.dimensions.y / 2 - boden))]
        }
        var boeden: [[[Double]]] = []
        if #available(iOS 17.0, *) {
            for f in floors {
                var ecken: [[Double]] = []
                for c in f.polygonCorners {
                    let p = f.transform * SIMD4<Float>(c.x, c.y, c.z, 1)
                    ecken.append([cm(p.x), cm(p.z)])
                }
                if ecken.count >= 3 { boeden.append(ecken) }
            }
        }
        return ["waende": waende, "oeffnungen": oeffnungen, "objekte": objekte, "boden": boeden.first ?? [], "boeden": boeden]
    }
}
