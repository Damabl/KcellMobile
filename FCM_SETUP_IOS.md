# 🔥 Firebase Push Notifications для iOS (React Native)

## 📱 Обзор

Этот проект добавляет поддержку Firebase Cloud Messaging (FCM) для push-уведомлений в React Native iOS приложение с WebView.

## 🛠 Настройка Firebase

### 1. Создание проекта в Firebase Console

1. Перейдите в [Firebase Console](https://console.firebase.google.com/)
2. Создайте новый проект или выберите существующий
3. Добавьте iOS приложение:
   - Bundle ID: `com.example.KcellMobile`
   - App nickname: `KcellMobile iOS`
   - App Store ID: (оставьте пустым для разработки)

### 2. Скачивание конфигурации

1. Скачайте `GoogleService-Info.plist`
2. Замените файл `ios/KcellMobile/GoogleService-Info.plist` на скачанный
3. Убедитесь, что файл добавлен в Xcode проект

### 3. Настройка APNs (Apple Push Notification service)

**Для разработки (без Apple Developer аккаунта):**
- Используйте Firebase для отправки уведомлений
- Уведомления будут работать в симуляторе и на устройстве

**Для продакшена (с Apple Developer аккаунтом):**
1. Создайте APNs сертификат в Apple Developer Console
2. Загрузите сертификат в Firebase Console
3. Настройте APNs Authentication Key

## 📦 Установка зависимостей

### 1. Установка npm пакетов

```bash
cd /Users/damirablahat/WebstormProjects/KcellMobile
npm install
```

### 2. Установка iOS зависимостей

```bash
cd ios
pod install
```

## 🔧 Конфигурация

### 1. Обновление GoogleService-Info.plist

Замените значения в `ios/KcellMobile/GoogleService-Info.plist` на ваши из Firebase Console:

```xml
<key>CLIENT_ID</key>
<string>YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com</string>
<key>API_KEY</key>
<string>YOUR_ACTUAL_API_KEY</string>
<key>GCM_SENDER_ID</key>
<string>YOUR_ACTUAL_GCM_SENDER_ID</string>
<key>PROJECT_ID</key>
<string>YOUR_ACTUAL_PROJECT_ID</string>
```

### 2. Проверка Bundle ID

Убедитесь, что Bundle ID в Xcode соответствует тому, что указан в Firebase Console.

## 🚀 Запуск приложения

### 1. Запуск в симуляторе

```bash
# В корне проекта
npx react-native run-ios
```

### 2. Запуск на устройстве

```bash
# Подключите iPhone и запустите
npx react-native run-ios --device
```

## 🧪 Тестирование

### 1. Проверка получения FCM токена

1. Запустите приложение
2. Разрешите уведомления
3. Проверьте консоль Xcode - должен появиться FCM токен
4. Токен автоматически отправится на сервер

### 2. Тестирование push-уведомлений

```bash
# Установите axios если не установлен
npm install axios

# Обновите токен в test-fcm-ios.js
# Запустите тест
node test-fcm-ios.js
```

### 3. Отправка тестового уведомления

```bash
curl -X POST https://kcell-service.vercel.app/api/fcm/send/token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_FCM_TOKEN",
    "title": "Тест iOS",
    "body": "Уведомление работает!",
    "data": {"type": "test"}
  }'
```

## 📋 Структура проекта

```
KcellMobile/
├── src/
│   └── services/
│       └── FCMService.ts          # Сервис для работы с FCM
├── ios/
│   ├── KcellMobile/
│   │   ├── AppDelegate.swift      # Инициализация Firebase
│   │   ├── Info.plist            # Разрешения для уведомлений
│   │   └── GoogleService-Info.plist # Конфигурация Firebase
│   └── Podfile                   # iOS зависимости
├── App.tsx                       # Главный компонент с WebView
├── package.json                  # npm зависимости
└── test-fcm-ios.js              # Тестовый скрипт
```

## 🔄 Как это работает

### 1. Инициализация
- Firebase инициализируется в `AppDelegate.swift`
- FCM сервис запрашивает разрешения на уведомления
- Получает FCM токен и отправляет на сервер

### 2. Получение уведомлений
- Уведомления приходят через Firebase
- Обрабатываются в `FCMService.ts`
- Данные передаются в WebView через JavaScript

### 3. Взаимодействие с WebView
- WebView получает FCM токен через `window.receiveFCMToken()`
- Данные уведомлений приходят через `window.receiveFCMData()`
- WebView может управлять подписками на темы

## 🐛 Отладка

### 1. Проверка логов

```bash
# Логи React Native
npx react-native log-ios

# Логи Xcode
# Откройте Xcode → Window → Devices and Simulators → View Device Logs
```

### 2. Частые проблемы

**Проблема:** FCM токен не получается
**Решение:** Проверьте GoogleService-Info.plist и Bundle ID

**Проблема:** Уведомления не приходят
**Решение:** Убедитесь, что разрешения предоставлены

**Проблема:** Ошибка сборки
**Решение:** Выполните `cd ios && pod install && cd ..`

### 3. Проверка конфигурации

```bash
# Проверка установленных подов
cd ios && pod list | grep Firebase

# Проверка npm пакетов
npm list | grep firebase
```

## 📱 Использование в WebView

### JavaScript API

```javascript
// Получение FCM токена
window.getFCMToken();

// Подписка на тему
window.subscribeToNotifications('general');

// Отписка от темы
window.unsubscribeFromNotifications('general');

// Обработка токена
window.fcmTokenCallback = function(token) {
    console.log('FCM Token:', token);
    // Отправка токена на ваш сервер
};

// Обработка данных уведомлений
window.fcmDataCallback = function(data) {
    console.log('FCM Data:', data);
    // Обработка данных уведомления
};
```

## 🔒 Безопасность

1. **Не коммитьте** `GoogleService-Info.plist` в Git
2. Добавьте в `.gitignore`:
   ```
   ios/KcellMobile/GoogleService-Info.plist
   ```
3. Используйте переменные окружения для API ключей

## 📈 Мониторинг

### Firebase Console
- Отслеживайте доставку уведомлений
- Анализируйте статистику
- Настраивайте A/B тесты

### Логи приложения
```javascript
// В FCMService.ts добавьте логирование
console.log('FCM Token:', token);
console.log('Notification received:', data);
```

## 🎯 Готово к использованию

После настройки:
- ✅ Push-уведомления работают в iOS
- ✅ Интеграция с WebView
- ✅ Автоматическая отправка токенов на сервер
- ✅ Поддержка тем и массовых рассылок
- ✅ Обработка уведомлений в фоне и foreground

## 🚨 Важные замечания

1. **Для тестирования на устройстве** нужен Apple Developer аккаунт
2. **Для симулятора** push-уведомления могут не работать
3. **Для продакшена** обязательно настройте APNs сертификаты
4. **Безопасность** - не публикуйте API ключи

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи в Xcode
2. Убедитесь в правильности конфигурации Firebase
3. Проверьте разрешения на уведомления
4. Переустановите поды: `cd ios && pod deintegrate && pod install`
