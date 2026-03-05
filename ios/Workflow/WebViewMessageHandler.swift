import Foundation
import WebKit
import UIKit

class WebViewMessageHandler: NSObject, WKScriptMessageHandler {
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        
        switch message.name {
        case "saveFile":
            handleSaveFile(message.body)
        default:
            print("📱 [WEBVIEW] Неизвестное сообщение:", message.name)
        }
    }
    
    private func handleSaveFile(_ messageBody: Any) {
        print("📁 [FILE] Получено сообщение saveFile:", messageBody)
        
        guard let body = messageBody as? [String: Any],
              let filename = body["filename"] as? String,
              let base64Data = body["base64Data"] as? String,
              let mimeType = body["mimeType"] as? String else {
            print("❌ [FILE] Неверный формат сообщения saveFile")
            return
        }
        
        print("📁 [FILE] Сохранение файла:", filename)
        print("📏 [FILE] Размер данных:", base64Data.count)
        print("🔧 [FILE] MIME тип:", mimeType)
        
        DispatchQueue.main.async {
            self.saveFileToDocuments(filename: filename, base64Data: base64Data, mimeType: mimeType)
        }
    }
    
    private func saveFileToDocuments(filename: String, base64Data: String, mimeType: String) {
        do {
            // Декодируем base64 данные
            guard let data = Data(base64Encoded: base64Data) else {
                print("❌ [FILE] Неверные base64 данные")
                return
            }
            
            // Получаем путь к папке документов
            let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let fileURL = documentsPath.appendingPathComponent(filename)
            
            // Записываем файл
            try data.write(to: fileURL)
            print("✅ [FILE] Файл сохранен в:", fileURL.path)
            
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
                    print("📁 [FILE] Диалог сохранения файла показан для:", filename)
                }
                
            } else {
                print("❌ [FILE] Не удалось получить root view controller")
            }
            
        } catch {
            print("❌ [FILE] Ошибка сохранения файла:", error.localizedDescription)
        }
    }
}




