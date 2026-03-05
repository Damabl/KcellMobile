import Foundation
import CoreMotion
import HealthKit
import React

@objc(StepCounterBridge)
class StepCounterBridge: RCTEventEmitter {
    private let pedometer = CMPedometer()
    private let healthStore = HKHealthStore()
    private var isObservingSteps = false

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return ["onStepCount"]
    }

    override func startObserving() {
        isObservingSteps = true
    }

    override func stopObserving() {
        isObservingSteps = false
        stopStepUpdates()
    }

    // MARK: - HealthKit Authorization

    @objc
    func requestAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
        guard HKHealthStore.isHealthDataAvailable() else {
            resolve(false)
            return
        }

        let stepType = HKObjectType.quantityType(forIdentifier: .stepCount)!
        let readTypes: Set<HKObjectType> = [stepType]

        healthStore.requestAuthorization(toShare: [], read: readTypes) { success, error in
            if let error = error {
                reject("healthkit_auth_error", error.localizedDescription, error)
            } else {
                resolve(success)
            }
        }
    }

    // MARK: - Today steps via HealthKit

    @objc
    func getTodaySteps(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            // Fallback: if HealthKit недоступен — вернём -1, чтобы JS мог понять
            resolve(-1)
            return
        }

        let calendar = Calendar.current
        let now = Date()
        guard let startOfDay = calendar.date(bySettingHour: 0, minute: 0, second: 0, of: now) else {
            resolve(0)
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: stepType,
                                      quantitySamplePredicate: predicate,
                                      options: .cumulativeSum) { [weak self] _, statistics, error in
            guard self != nil else { return }

            if let error = error {
                reject("healthkit_steps_error", error.localizedDescription, error)
                return
            }

            let sum = statistics?.sumQuantity()
            let value = sum?.doubleValue(for: HKUnit.count()) ?? 0
            resolve(Int(value))
        }

        healthStore.execute(query)
    }

    @objc
    func startStepUpdates() {
        guard CMPedometer.isStepCountingAvailable() else {
            sendEvent(withName: "onStepCount", body: ["error": "Step counting not available on this device"])
            return
        }

        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)

        pedometer.startUpdates(from: startOfDay) { [weak self] data, error in
            guard let self = self else { return }

            if let error = error {
                self.sendEvent(withName: "onStepCount", body: ["error": error.localizedDescription])
                return
            }

            guard let data = data else { return }

            let steps = data.numberOfSteps.intValue
            if self.isObservingSteps {
                self.sendEvent(withName: "onStepCount", body: ["steps": steps])
            }
        }
    }

    @objc
    func stopStepUpdates() {
        pedometer.stopUpdates()
    }
}

