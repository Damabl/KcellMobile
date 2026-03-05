import Foundation
import WebKit
import AVFoundation
import CoreLocation
import CoreMotion
import UserNotifications
import UIKit

@objc class PermissionBridge: NSObject, WKScriptMessageHandler {
    
    weak var webView: WKWebView?
    private var locationManager: CLLocationManager?
    private var locationPermissionCallback: String?
    private var motionManager: CMMotionManager?
    private var motionQueue: OperationQueue?
    
    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        setupLocationManager()
    }
    
    private func setupLocationManager() {
        locationManager = CLLocationManager()
        locationManager?.delegate = self
        locationManager?.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager?.distanceFilter = 50
        if #available(iOS 9.0, *) {
            locationManager?.allowsBackgroundLocationUpdates = true
        }
    }
    
    // MARK: - WKScriptMessageHandler
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            print("❌ [PERMISSION] Неверный формат сообщения")
            return
        }
        
        print("📱 [PERMISSION] Получено сообщение: \(action)")
        
        switch action {
        case "checkPermissionStatus":
            handleCheckPermissionStatus(body)
        case "requestPermission":
            handleRequestPermission(body)
        case "isLocationEnabled":
            handleIsLocationEnabled()
        case "startMotion":
            handleStartMotion()
        case "stopMotion":
            handleStopMotion()
        case "startBackgroundTracking":
            handleStartBackgroundTracking()
        case "stopBackgroundTracking":
            handleStopBackgroundTracking()
        default:
            print("❌ [PERMISSION] Неизвестное действие: \(action)")
        }
    }
    
    // MARK: - Motion (CoreMotion for Activity Tracker on iOS WebView)
    
    private func handleStartMotion() {
        guard motionManager == nil else {
            print("📱 [MOTION] Already started")
            return
        }
        let manager = CMMotionManager()
        guard manager.isDeviceMotionAvailable else {
            print("❌ [MOTION] Device motion not available")
            injectMotionError("Device motion not available")
            return
        }
        motionManager = manager
        motionQueue = OperationQueue()
        motionQueue?.maxConcurrentOperationCount = 1
        manager.deviceMotionUpdateInterval = 0.1
        manager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: motionQueue!) { [weak self] data, error in
            guard let self = self, let data = data, error == nil else { return }
            let acc = data.userAcceleration
            let grav = data.gravity
            let rot = data.rotationRate
            let json: [String: Any] = [
                "acceleration": ["x": acc.x + grav.x, "y": acc.y + grav.y, "z": acc.z + grav.z],
                "rotationRate": ["alpha": rot.z, "beta": rot.x, "gamma": rot.y],
                "orientation": ["beta": 0, "gamma": 0]
            ]
            guard let jsonData = try? JSONSerialization.data(withJSONObject: json),
                  let jsonString = String(data: jsonData, encoding: .utf8) else { return }
            let escaped = jsonString.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
            let script = "if (typeof window.handleIOSMotionData === 'function') { window.handleIOSMotionData('\(escaped)'); }"
            DispatchQueue.main.async {
                self.webView?.evaluateJavaScript(script, completionHandler: nil)
            }
        }
        print("✅ [MOTION] CoreMotion started for Activity Tracker")
    }
    
    private func handleStopMotion() {
        motionManager?.stopDeviceMotionUpdates()
        motionManager = nil
        motionQueue = nil
        print("✅ [MOTION] CoreMotion stopped")
    }
    
    private func injectMotionError(_ message: String) {
        let escaped = message.replacingOccurrences(of: "'", with: "\\'")
        let script = "if (typeof window.handleIOSMotionData === 'function') { window.handleIOSMotionData(JSON.stringify({ error: '\(escaped)' })); }"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(script, completionHandler: nil)
        }
    }
    
    // MARK: - Background tracking (keep app alive for Activity Tracker)
    
    private func handleStartBackgroundTracking() {
        guard let locationManager = locationManager else { return }
        let status = CLLocationManager.authorizationStatus()
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            print("⚠️ [BACKGROUND] Location not authorized, cannot start background tracking")
            return
        }
        if #available(iOS 9.0, *) {
            locationManager.allowsBackgroundLocationUpdates = true
        }
        locationManager.startUpdatingLocation()
        print("✅ [BACKGROUND] Background location updates started for Activity Tracker")
    }
    
    private func handleStopBackgroundTracking() {
        locationManager?.stopUpdatingLocation()
        if #available(iOS 9.0, *) {
            locationManager?.allowsBackgroundLocationUpdates = false
        }
        print("✅ [BACKGROUND] Background location updates stopped")
    }
    
    // MARK: - Permission Check
    
    private func handleCheckPermissionStatus(_ body: [String: Any]) {
        guard let permission = body["permission"] as? String,
              let callback = body["callback"] as? String else {
            print("❌ [PERMISSION] Неверные параметры для checkPermissionStatus")
            return
        }
        
        let status = checkPermissionStatus(permission: permission)
        sendCallback(callback: callback, result: status)
    }
    
    private func checkPermissionStatus(permission: String) -> String {
        switch permission {
        case "camera":
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            switch status {
            case .authorized:
                return "granted"
            case .denied, .restricted:
                return "denied"
            case .notDetermined:
                return "notDetermined"
            @unknown default:
                return "unknown"
            }
            
        case "location":
            let status = CLLocationManager.authorizationStatus()
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                return "granted"
            case .denied, .restricted:
                return "denied"
            case .notDetermined:
                return "notDetermined"
            @unknown default:
                return "unknown"
            }
            
        case "notifications":
            var statusString = "notDetermined"
            let semaphore = DispatchSemaphore(value: 0)
            
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    statusString = "granted"
                case .denied:
                    statusString = "denied"
                case .notDetermined:
                    statusString = "notDetermined"
                @unknown default:
                    statusString = "unknown"
                }
                semaphore.signal()
            }
            
            semaphore.wait()
            return statusString
            
        case "motion":
            // Core Motion (акселерометр/гироскоп) на iOS не требует системного разрешения — всегда доступен
            return "granted"
            
        default:
            return "unknown"
        }
    }
    
    // MARK: - Permission Request
    
    private func handleRequestPermission(_ body: [String: Any]) {
        guard let permission = body["permission"] as? String else {
            print("❌ [PERMISSION] Неверные параметры для requestPermission")
            return
        }
        
        requestPermission(permission: permission)
    }
    
    private func requestPermission(permission: String) {
        switch permission {
        case "camera":
            requestCameraPermission()
            
        case "location":
            requestLocationPermission()
            
        case "notifications":
            requestNotificationPermission()
            
        default:
            print("❌ [PERMISSION] Неизвестный тип разрешения: \(permission)")
        }
    }
    
    private func requestCameraPermission() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                let status = granted ? "granted" : "denied"
                self.sendPermissionEvent(type: "camera", granted: granted)
                print("📷 [PERMISSION] Камера: \(status)")
            }
        }
    }
    
    private func requestLocationPermission() {
        guard let locationManager = locationManager else {
            print("❌ [PERMISSION] LocationManager не инициализирован")
            return
        }
        
        let status = CLLocationManager.authorizationStatus()
        
        if status == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else {
            // Уже разрешено или отклонено
            let granted = status == .authorizedAlways || status == .authorizedWhenInUse
            sendPermissionEvent(type: "location", granted: granted)
        }
    }
    
    private func requestNotificationPermission() {
        let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
        UNUserNotificationCenter.current().requestAuthorization(options: authOptions) { granted, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("❌ [PERMISSION] Ошибка запроса уведомлений: \(error)")
                    self.sendPermissionEvent(type: "notifications", granted: false)
                } else {
                    self.sendPermissionEvent(type: "notifications", granted: granted)
                    print("🔔 [PERMISSION] Уведомления: \(granted ? "granted" : "denied")")
                    
                    if granted {
                        DispatchQueue.main.async {
                            UIApplication.shared.registerForRemoteNotifications()
                        }
                    }
                }
            }
        }
    }
    
    // MARK: - Location Enabled Check
    
    private func handleIsLocationEnabled() {
        let enabled = CLLocationManager.locationServicesEnabled()
        let script = "if (window.FCM && window.FCM.onLocationEnabledCheck) { window.FCM.onLocationEnabledCheck(\(enabled)); }"
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }
    
    // MARK: - Callbacks
    
    private func sendCallback(callback: String, result: String) {
        let script = "if (window.FCM && window.FCM.\(callback)) { window.FCM.\(callback)('\(result)'); }"
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }
    
    private func sendPermissionEvent(type: String, granted: Bool) {
        let json = """
        {
            "type": "\(type)",
            "granted": \(granted)
        }
        """
        let script = "if (window.onAndroidEvent) { window.onAndroidEvent('permission', \(json)); }"
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }
}

// MARK: - CLLocationManagerDelegate

extension PermissionBridge: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        let granted = status == .authorizedAlways || status == .authorizedWhenInUse
        sendPermissionEvent(type: "location", granted: granted)
        print("📍 [PERMISSION] Статус геолокации изменился: \(status.rawValue), granted: \(granted)")
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // Required so iOS keeps the app alive for background Activity Tracker; locations not used
    }
}
