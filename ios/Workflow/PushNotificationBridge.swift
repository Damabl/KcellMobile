import Foundation
import React

@objc(PushNotificationBridge)
class PushNotificationBridge: NSObject {
  
  @objc
  func saveAuthToken(_ authToken: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      // Получаем AppDelegate
      if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
        // Вызываем метод сохранения auth token
        appDelegate.saveAuthToken(authToken)
        resolve(true)
      } else {
        reject("ERROR", "Не удалось получить AppDelegate", nil)
      }
    }
  }
  
  @objc
  func getFCMToken(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      // Получаем FCM токен из UserDefaults
      if let fcmToken = UserDefaults.standard.string(forKey: "fcmToken") {
        resolve(fcmToken)
      } else {
        reject("NOT_FOUND", "FCM токен не найден", nil)
      }
    }
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}




