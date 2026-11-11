// DOM – iPhone-Funktionen für die App aus TestFlight (wird nur beim Bau in GitHub Actions ins Xcode-Projekt kopiert).
// Gegenstück in der App: geraet.js (window.Geraet). Jede Funktion lässt sich dort je Gerät ein- und ausschalten.
//   scannen         Apples Dokumentenscanner (Ränder erkennen, gerade ziehen, mehrere Seiten)
//   raumScannen     Raum mit LiDAR scannen (RoomPlan), liefert Länge, Breite, Höhe, Türen und Fenster
//   entsperren      Face ID bzw. Gerätecode beim Öffnen
//   kalender…       Termine in einen eigenen Kalender „DOM“ auf dem iPhone schreiben
//   kontakt…        Kontakt aus dem Adressbuch wählen, Kunden als Kontakt speichern
//   geteilteHolen   Dateien, die über „Teilen“ an DOM geschickt wurden (PDF, Bilder)

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

/// Startet die App wie bisher und meldet zusätzlich das DOM-Plugin an (Main.storyboard zeigt beim Bau hierher).
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
}

/// Vollbild mit Apples Raumscan. „Fertig“ beendet den Scan, danach werden die Maße zurückgegeben.
final class DomRaumScan: UIViewController, RoomCaptureViewDelegate {
    var fertig: ((CapturedRoom?, String?) -> Void)?
    private var scanView: RoomCaptureView!
    private var erledigt = false
    private let knopf = UIButton(type: .system)

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
        knopf.setTitle("Wird berechnet …", for: .normal)
        scanView.captureSession.stop()
    }

    @objc private func abbrechenTippen() {
        guard !erledigt else { return }
        erledigt = true
        scanView.captureSession.stop()
        dismiss(animated: true) { self.fertig?(nil, nil) }
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { !erledigt }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !erledigt else { return }
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
        ]
    }
}
