import Foundation
import CoreLocation
import React

@objc(LocationPermissionModule)
class LocationPermissionModule: NSObject {
    private var locationManager: CLLocationManager?
    private var requestResolve: RCTPromiseResolveBlock?
    private var requestReject: RCTPromiseRejectBlock?
    
    override init() {
        super.init()
        locationManager = CLLocationManager()
        locationManager?.delegate = self
    }
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}

// MARK: - API
extension LocationPermissionModule {
    @objc
    func getLocationPermissionStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let status = CLLocationManager.authorizationStatus()
            let statusString = self.statusToString(status)
            resolve(statusString)
        }
    }
    
    @objc
    func requestLocationPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let lm = self.locationManager else {
                print("❌ [PERMISSION] LocationManager не найден")
                reject("ERROR", "LocationManager not available", nil)
                return
            }
            let status = CLLocationManager.authorizationStatus()
            print("📍 [PERMISSION] Текущий статус геолокации: \(status.rawValue) (\(self.statusToString(status)))")
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                print("📍 [PERMISSION] Геолокация уже разрешена — диалог не показываем")
                resolve(true)
                return
            case .denied, .restricted:
                print("📍 [PERMISSION] Геолокация запрещена пользователем — нужно открыть Настройки")
                resolve(false)
                // iOS не покажет системный диалог повторно.
                // React Native покажет алерт с кнопкой «Открыть Настройки».
                return
            case .notDetermined:
                print("📍 [PERMISSION] Запрашиваем разрешение (requestWhenInUseAuthorization)...")
                self.requestResolve = nil
                self.requestReject = nil
                self.requestResolve = resolve
                self.requestReject = reject
                lm.requestWhenInUseAuthorization()
                return
            @unknown default:
                resolve(false)
                return
            }
        }
    }
    
    private func statusToString(_ status: CLAuthorizationStatus) -> String {
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
    }
}

// MARK: - CLLocationManagerDelegate
extension LocationPermissionModule: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        print("📍 [PERMISSION] didChangeAuthorization: \(status.rawValue)")
        guard let resolve = requestResolve else { return }
        requestResolve = nil
        requestReject = nil
        let granted = status == .authorizedWhenInUse || status == .authorizedAlways
        print("📍 [PERMISSION] Результат: \(granted ? "granted" : "denied")")
        resolve(granted)
    }
}
