import Foundation
import CoreMotion
import React

@objc(MotionBridge)
class MotionBridge: RCTEventEmitter {
    private var motionManager: CMMotionManager?
    private var motionQueue: OperationQueue?

    override init() {
        super.init()
    }

    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return ["onMotionData"]
    }

    override func startObserving() {
        // Listener added
    }

    override func stopObserving() {
        // Listener removed
    }

    @objc
    func startMotionUpdates() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.motionManager != nil {
                print("📱 [MotionBridge] Already started")
                return
            }
            let manager = CMMotionManager()
            guard manager.isDeviceMotionAvailable else {
                print("❌ [MotionBridge] Device motion not available (use a real device, not Simulator)")
                self.sendEvent(withName: "onMotionData", body: ["error": "Device motion not available"])
                return
            }
            self.motionManager = manager
            self.motionQueue = OperationQueue()
            self.motionQueue?.maxConcurrentOperationCount = 1
            manager.deviceMotionUpdateInterval = 0.1
            manager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: self.motionQueue!) { [weak self] data, error in
                guard let self = self, let data = data, error == nil else { return }
                let acc = data.userAcceleration
                let grav = data.gravity
                let rot = data.rotationRate
                let att = data.attitude
                // Ориентация в градусах (как DeviceOrientationEvent: beta — наклон вперёд/назад, gamma — влево/вправо)
                let betaDeg = att.pitch * 180 / .pi
                let gammaDeg = att.roll * 180 / .pi
                let json: [String: Any] = [
                    "acceleration": ["x": acc.x + grav.x, "y": acc.y + grav.y, "z": acc.z + grav.z],
                    "rotationRate": ["alpha": rot.z, "beta": rot.x, "gamma": rot.y],
                    "orientation": ["beta": betaDeg, "gamma": gammaDeg]
                ]
                guard let jsonData = try? JSONSerialization.data(withJSONObject: json),
                      let jsonString = String(data: jsonData, encoding: .utf8) else { return }
                self.sendEvent(withName: "onMotionData", body: ["data": jsonString])
            }
            print("✅ [MotionBridge] CoreMotion started for Activity Tracker")
        }
    }

    @objc
    func stopMotionUpdates() {
        DispatchQueue.main.async { [weak self] in
            self?.motionManager?.stopDeviceMotionUpdates()
            self?.motionManager = nil
            self?.motionQueue = nil
            print("✅ [MotionBridge] CoreMotion stopped")
        }
    }
}
