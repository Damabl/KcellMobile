import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import Firebase
import FirebaseMessaging
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    
    print("🚀 [PUSH] Приложение запускается...")
    
    // Инициализация Firebase
    print("🔥 [PUSH] Инициализация Firebase...")
    FirebaseApp.configure()
    print("✅ [PUSH] Firebase инициализирован успешно")
    
    // Настройка Firebase Messaging
    print("📱 [PUSH] Настройка Firebase Messaging...")
    Messaging.messaging().delegate = self
    print("✅ [PUSH] Firebase Messaging настроен")
    
    // Запрос разрешений на уведомления
    print("🔔 [PUSH] Запрос разрешений на уведомления...")
    UNUserNotificationCenter.current().delegate = self
    
    let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
    UNUserNotificationCenter.current().requestAuthorization(
      options: authOptions,
      completionHandler: { granted, error in
        if granted {
          print("✅ [PUSH] Разрешения на уведомления получены")
        } else {
          print("❌ [PUSH] Разрешения на уведомления отклонены: \(String(describing: error))")
        }
      }
    )
    
    print("📱 [PUSH] Регистрация для push-уведомлений...")
    application.registerForRemoteNotifications()
    
    // Проверяем текущий статус разрешений
    checkNotificationStatus()
    
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "Workflow",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

// MARK: - MessagingDelegate
extension AppDelegate: MessagingDelegate {
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    print("🔥 [PUSH] Firebase registration token получен: \(String(describing: fcmToken))")
    
    if let token = fcmToken {
      print("✅ [PUSH] FCM токен успешно получен: \(token)")
      
      // Сохраняем FCM токен в UserDefaults для доступа из React Native
      UserDefaults.standard.set(token, forKey: "fcmToken")
      print("💾 [PUSH] FCM токен сохранен в UserDefaults")
      
      // Пытаемся отправить токен на сервер (если есть auth token)
      sendFCMTokenToServer(fcmToken: token)
      
    } else {
      print("⚠️ [PUSH] FCM токен пустой")
    }
    
    let dataDict: [String: String] = ["token": fcmToken ?? ""]
    NotificationCenter.default.post(
      name: Notification.Name("FCMToken"),
      object: nil,
      userInfo: dataDict
    )
    print("📢 [PUSH] FCM токен отправлен в NotificationCenter")
  }
  
  /// Последний auth token, с которым FCM уже успешно отправлен (чтобы не слать повторно)
  private static var lastSuccessfullySentAuthToken: String?

  // MARK: - Отправка FCM токена на сервер
  private func sendFCMTokenToServer(fcmToken: String) {
    guard let authToken = UserDefaults.standard.string(forKey: "authToken"), !authToken.isEmpty else {
      print("⏳ [PUSH] Auth token не найден или пустой, ждем логина пользователя...")
      return
    }

    // Не отправлять повторно с тем же auth token (избегаем 400 от бэкенда)
    if let last = AppDelegate.lastSuccessfullySentAuthToken, last == authToken {
      print("⏭️ [PUSH] FCM уже отправлен с этим auth token, пропуск")
      return
    }

    print("🚀 [PUSH] Попытка отправки FCM токена на сервер...")
    print("🔐 [PUSH] Auth token найден, отправляем FCM токен на сервер...")
    
    // URL вашего backend API
    let apiUrl = "https://workflow-back-zpk4.onrender.com/api/fcm/token"
    
    // Создаем URL request
    guard let url = URL(string: apiUrl) else {
      print("❌ [PUSH] Неверный URL API")
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
    
    // Генерируем deviceId (используем часть FCM токена)
    let deviceId = String(fcmToken.prefix(20))
    
    // Тело запроса (формат должен совпадать с Android версией)
    let requestBody: [String: Any] = [
      "token": fcmToken,
      "authToken": authToken, // Добавляем authToken в тело запроса как в Android
      "platform": "ios",
      "deviceId": deviceId
    ]
    
    do {
      request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
    } catch {
      print("❌ [PUSH] Ошибка создания JSON: \(error)")
      return
    }
    
    print("📤 [PUSH] Отправляем запрос на сервер...")
    print("🔑 [PUSH] FCM токен: \(fcmToken)")
    print("🔐 [PUSH] Auth token (первые 20 символов): \(String(authToken.prefix(20)))...")
    print("📱 [PUSH] Платформа: ios")
    print("🆔 [PUSH] Device ID: \(deviceId)")
    
    // Выполняем запрос
    let task = URLSession.shared.dataTask(with: request) { data, response, error in
      DispatchQueue.main.async {
        if let error = error {
          print("❌ [PUSH] Ошибка отправки на сервер: \(error)")
          return
        }
        
        if let httpResponse = response as? HTTPURLResponse {
          print("📊 [PUSH] HTTP статус: \(httpResponse.statusCode)")
          
          if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
            print("✅ [PUSH] FCM токен успешно отправлен на сервер!")
            AppDelegate.lastSuccessfullySentAuthToken = UserDefaults.standard.string(forKey: "authToken")
          } else if httpResponse.statusCode == 401 {
            // Auth token истёк — очищаем, чтобы при новом логине отправился свежий
            print("⚠️ [PUSH] Auth token истёк (401), очищаем. FCM токен будет отправлен после нового логина.")
            UserDefaults.standard.removeObject(forKey: "authToken")
            AppDelegate.lastSuccessfullySentAuthToken = nil
          } else {
            let errorText = String(data: data ?? Data(), encoding: .utf8) ?? "No error details"
            print("⚠️ [PUSH] Сервер вернул ошибку: \(httpResponse.statusCode), Error: \(errorText)")
          }
        }
        
        if let data = data {
          do {
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
              print("📋 [PUSH] Ответ сервера: \(json)")
            }
          } catch {
            print("❌ [PUSH] Ошибка парсинга ответа: \(error)")
          }
        }
      }
    }
    
    task.resume()
  }
}

// MARK: - UNUserNotificationCenterDelegate
extension AppDelegate: UNUserNotificationCenterDelegate {
  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    let userInfo = notification.request.content.userInfo
    print("🔔 [PUSH] Уведомление получено в foreground: \(userInfo)")
    
    // Показываем уведомление даже когда приложение в foreground
    completionHandler([[.alert, .sound]])
    print("✅ [PUSH] Уведомление показано в foreground")
  }
  
  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              didReceive response: UNNotificationResponse,
                              withCompletionHandler completionHandler: @escaping () -> Void) {
    let userInfo = response.notification.request.content.userInfo
    print("👆 [PUSH] Уведомление нажато: \(userInfo)")
    
    completionHandler()
    print("✅ [PUSH] Обработка нажатия завершена")
  }
}

// MARK: - Remote Notifications
extension AppDelegate {
  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    print("🍎 [PUSH] APNs device token получен: \(deviceToken)")
    
    // Устанавливаем APNs токен для Firebase
    print("🔗 [PUSH] Устанавливаем APNs токен для Firebase...")
    Messaging.messaging().apnsToken = deviceToken
    print("✅ [PUSH] APNs токен успешно установлен для Firebase")
    
    // Логируем токен в читаемом виде
    let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
    let token = tokenParts.joined()
    print("🔑 [PUSH] APNs токен (читаемый): \(token)")
  }
  
  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    print("❌ [PUSH] Ошибка регистрации для push-уведомлений: \(error)")
    print("🔍 [PUSH] Детали ошибки: \(error.localizedDescription)")
    
    // Проверяем тип ошибки
    if let nsError = error as NSError? {
      print("📊 [PUSH] Код ошибки: \(nsError.code)")
      print("📋 [PUSH] Домен ошибки: \(nsError.domain)")
    }
  }
  
  func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                   fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    print("📨 [PUSH] Remote notification получено: \(userInfo)")
    
    // Обрабатываем уведомление от Firebase
    if let messageID = userInfo["gcm.message_id"] {
      print("🆔 [PUSH] Firebase Message ID: \(messageID)")
    }
    
    // Логируем дополнительные данные
    if let aps = userInfo["aps"] as? [String: Any] {
      print("📱 [PUSH] APS данные: \(aps)")
    }
    
    if let customData = userInfo["custom_data"] {
      print("🔧 [PUSH] Кастомные данные: \(customData)")
    }
    
    completionHandler(.newData)
    print("✅ [PUSH] Remote notification обработано")
  }
  
  // MARK: - Helper Methods
  private func checkNotificationStatus() {
    print("🔍 [PUSH] Проверка статуса уведомлений...")
    
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      DispatchQueue.main.async {
        print("📊 [PUSH] Статус разрешений:")
        print("   - Authorization Status: \(settings.authorizationStatus.rawValue)")
        print("   - Alert Setting: \(settings.alertSetting.rawValue)")
        print("   - Badge Setting: \(settings.badgeSetting.rawValue)")
        print("   - Sound Setting: \(settings.soundSetting.rawValue)")
        print("   - Notification Center Setting: \(settings.notificationCenterSetting.rawValue)")
        print("   - Lock Screen Setting: \(settings.lockScreenSetting.rawValue)")
        
        switch settings.authorizationStatus {
        case .authorized:
          print("✅ [PUSH] Уведомления разрешены")
        case .denied:
          print("❌ [PUSH] Уведомления запрещены")
        case .notDetermined:
          print("⏳ [PUSH] Статус уведомлений не определен")
        case .provisional:
          print("⚠️ [PUSH] Уведомления разрешены временно")
        case .ephemeral:
          print("🔄 [PUSH] Уведомления разрешены эпизодически")
        @unknown default:
          print("❓ [PUSH] Неизвестный статус уведомлений")
        }
      }
    }
  }
  
  // MARK: - Сохранение auth token (вызывается из React Native)
  @objc func saveAuthToken(_ authToken: String) {
    let prefix = String(authToken.prefix(20))
    print("🔐 [PUSH] Сохраняем auth token в UserDefaults: \(prefix)...")
    
    let previousAuthToken = UserDefaults.standard.string(forKey: "authToken")
    
    if authToken.isEmpty {
      // Logout — очищаем auth token и сбрасываем флаги
      print("🚪 [PUSH] Auth token пустой — пользователь вышел, очищаем")
      UserDefaults.standard.removeObject(forKey: "authToken")
      AppDelegate.lastSuccessfullySentAuthToken = nil
    } else {
      UserDefaults.standard.set(authToken, forKey: "authToken")

      // При смене пользователя — удаляем старый FCM токен и получаем новый
      let isAccountSwitch = previousAuthToken != nil && !previousAuthToken!.isEmpty && previousAuthToken != authToken
      if isAccountSwitch {
        print("🔄 [PUSH] Обнаружена смена аккаунта, сбрасываем флаг отправки FCM")
        AppDelegate.lastSuccessfullySentAuthToken = nil

        // Удаляем старый FCM токен и получаем новый для чистой ассоциации
        print("🗑️ [PUSH] Удаляем старый FCM токен и запрашиваем новый...")
        Messaging.messaging().deleteToken { error in
          if let error = error {
            print("⚠️ [PUSH] Ошибка удаления FCM токена: \(error). Отправляем текущий.")
            // Fallback — отправляем текущий токен с новым auth
            if let existing = UserDefaults.standard.string(forKey: "fcmToken") {
              self.sendFCMTokenToServer(fcmToken: existing)
            }
          } else {
            print("✅ [PUSH] Старый FCM токен удалён. Запрашиваем новый...")
            // Firebase выдаст новый токен через messaging:didReceiveRegistrationToken
            Messaging.messaging().token { newToken, error in
              if let newToken = newToken {
                print("✅ [PUSH] Новый FCM токен получен: \(newToken)")
                UserDefaults.standard.set(newToken, forKey: "fcmToken")
                self.sendFCMTokenToServer(fcmToken: newToken)
              } else {
                print("⚠️ [PUSH] Не удалось получить новый FCM токен: \(String(describing: error))")
                // Fallback — отправляем старый
                if let existing = UserDefaults.standard.string(forKey: "fcmToken") {
                  self.sendFCMTokenToServer(fcmToken: existing)
                }
              }
            }
          }
        }
      } else {
        // Тот же аккаунт или первый логин — просто отправляем существующий FCM
        if let fcmToken = UserDefaults.standard.string(forKey: "fcmToken") {
          print("🔄 [PUSH] FCM токен найден, отправляем на сервер с новым auth token")
          sendFCMTokenToServer(fcmToken: fcmToken)
        } else {
          print("⏳ [PUSH] FCM токен еще не получен, ждем...")
        }
      }
    }
    
    // Уведомляем React Native об обновлении auth token
    NotificationCenter.default.post(
      name: Notification.Name("AuthTokenUpdated"),
      object: nil,
      userInfo: ["authToken": authToken]
    )
    print("📢 [PUSH] Уведомление об обновлении auth token отправлено")
  }
  
  // MARK: - WebKit Message Handler для файлов
  @objc func setupWebKitMessageHandler(_ webView: WKWebView) {
    print("📱 [WEBVIEW] Настройка WebKit message handler для файлов")
    
    let messageHandler = WebViewMessageHandler()
    webView.configuration.userContentController.add(messageHandler, name: "saveFile")
    
    print("✅ [WEBVIEW] WebKit message handler 'saveFile' добавлен")
  }
  
  // MARK: - Permission Bridge Setup
  @objc func setupPermissionBridge(_ webView: WKWebView) {
    print("📱 [PERMISSION] Настройка Permission Bridge")
    
    let permissionBridge = PermissionBridge(webView: webView)
    webView.configuration.userContentController.add(permissionBridge, name: "permissionBridge")
    
    // Инжектируем JavaScript интерфейс для работы с разрешениями
    let permissionScript = """
    (function() {
        if (!window.FCM) {
            window.FCM = {};
        }
        
        // Проверка статуса разрешения
        window.FCM.checkPermissionStatus = function(permission, callback) {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                window.webkit.messageHandlers.permissionBridge.postMessage({
                    action: 'checkPermissionStatus',
                    permission: permission,
                    callback: callback || 'onPermissionStatusChecked'
                });
            } else if (window.ReactNativeWebView) {
                // Для React Native WebView используем postMessage
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'checkPermissionStatus',
                    permission: permission,
                    callback: callback || 'onPermissionStatusChecked'
                }));
            }
        };
        
        // Запрос разрешения
        window.FCM.requestPermission = function(permission) {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                window.webkit.messageHandlers.permissionBridge.postMessage({
                    action: 'requestPermission',
                    permission: permission
                });
            } else if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'requestPermission',
                    permission: permission
                }));
            }
        };
        
        // Проверка включенности GPS
        window.FCM.isLocationEnabled = function() {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                window.webkit.messageHandlers.permissionBridge.postMessage({
                    action: 'isLocationEnabled'
                });
            } else if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'isLocationEnabled'
                }));
            }
            return false; // По умолчанию возвращаем false, реальное значение придет через callback
        };
        
        // Callback для проверки статуса разрешения
        window.FCM.onPermissionStatusChecked = function(status) {
            console.log('Permission status checked:', status);
        };
        
        // Callback для проверки включенности GPS
        window.FCM.onLocationEnabledCheck = function(enabled) {
            console.log('Location enabled:', enabled);
        };
        
        // Activity Tracker: датчики движения (CoreMotion) — в WebView на iOS DeviceMotionEvent не приходит
        window.FCM.startMotionUpdates = function() {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                window.webkit.messageHandlers.permissionBridge.postMessage({ action: 'startMotion' });
            }
        };
        window.FCM.stopMotionUpdates = function() {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                window.webkit.messageHandlers.permissionBridge.postMessage({ action: 'stopMotion' });
            }
        };
        
        // Activity Tracker: фоновый режим — держим приложение активным через обновления геолокации
        window.FCM.startBackgroundTracking = function() {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                window.webkit.messageHandlers.permissionBridge.postMessage({ action: 'startBackgroundTracking' });
            }
        };
        window.FCM.stopBackgroundTracking = function() {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                window.webkit.messageHandlers.permissionBridge.postMessage({ action: 'stopBackgroundTracking' });
            }
        };
        
        console.log('✅ iOS Permission Bridge initialized');
    })();
    """
    
    let script = WKUserScript(source: permissionScript, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
    webView.configuration.userContentController.addUserScript(script)
    
    print("✅ [PERMISSION] Permission Bridge настроен")
  }
  
  // MARK: - Переотправка FCM токена при обновлении auth token
  @objc func retryFCMTokenSend() {
    print("🔄 [PUSH] Попытка переотправки FCM токена с новым auth token...")
    
    // Проверяем, есть ли FCM токен и auth token
    if let fcmToken = UserDefaults.standard.string(forKey: "fcmToken"),
       let authToken = UserDefaults.standard.string(forKey: "authToken") {
      print("✅ [PUSH] Оба токена найдены, переотправляем FCM токен на сервер")
      sendFCMTokenToServer(fcmToken: fcmToken)
    } else {
      print("⚠️ [PUSH] Не все токены найдены для переотправки")
      if let fcmToken = UserDefaults.standard.string(forKey: "fcmToken") {
        print("🔑 [PUSH] FCM токен есть, но нет auth token")
      } else {
        print("🔑 [PUSH] FCM токен не найден")
      }
      if let authToken = UserDefaults.standard.string(forKey: "authToken") {
        print("🔐 [PUSH] Auth token есть, но нет FCM токена")
      } else {
        print("🔐 [PUSH] Auth token не найден")
      }
    }
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
