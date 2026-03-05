import Foundation
import React
import UIKit

@objc(FileDownloadBridge)
class FileDownloadBridge: NSObject {
  
  @objc
  func saveFileBase64(_ fileName: String, base64Data: String, mimeType: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      do {
        // Декодируем base64 данные
        guard let data = Data(base64Encoded: base64Data) else {
          reject("INVALID_DATA", "Неверные base64 данные", nil)
          return
        }
        
        // Получаем путь к папке документов
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileURL = documentsPath.appendingPathComponent(fileName)
        
        // Записываем файл
        try data.write(to: fileURL)
        
        // Показываем системный диалог для сохранения файла
        let activityViewController = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        
        // Получаем root view controller
        if let rootViewController = UIApplication.shared.windows.first?.rootViewController {
          // Настройки для iPad
          if let popover = activityViewController.popoverPresentationController {
            popover.sourceView = rootViewController.view
            popover.sourceRect = CGRect(x: rootViewController.view.bounds.midX, y: rootViewController.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
          }
          
          // Показываем диалог
          rootViewController.present(activityViewController, animated: true) {
            print("📁 [FILE] Диалог сохранения файла показан для:", fileName)
          }
          
          // Уведомляем об успехе
          resolve(true)
        } else {
          reject("NO_VIEW_CONTROLLER", "Не удалось получить view controller", nil)
        }
        
      } catch {
        reject("SAVE_ERROR", "Ошибка сохранения файла: \(error.localizedDescription)", error)
      }
    }
  }
  
  @objc
  func getDocumentsDirectory(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    resolve(documentsPath.path)
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
