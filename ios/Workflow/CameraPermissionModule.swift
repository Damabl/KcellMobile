import Foundation
import AVFoundation
import React

@objc(CameraPermissionModule)
class CameraPermissionModule: NSObject {

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}

// MARK: - API
extension CameraPermissionModule {
    @objc
    func getCameraPermissionStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            let statusString = self.statusToString(status)
            resolve(statusString)
        }
    }

    @objc
    func requestCameraPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                resolve(granted)
            }
        }
    }

    private func statusToString(_ status: AVAuthorizationStatus) -> String {
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
    }
}
