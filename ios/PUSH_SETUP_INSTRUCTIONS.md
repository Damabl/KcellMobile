# Инструкция по настройке Push-уведомлений в Xcode

## 🔍 Предварительная проверка файлов

Перед началом настройки убедитесь, что у вас есть все необходимые файлы:

### ✅ Обязательные файлы:
- `ios/Workflow/GoogleService-Info.plist` - конфигурация Firebase
- `ios/Workflow/Workflow.entitlements` - настройки push-уведомлений
- `ios/Workflow/Info.plist` - основные настройки приложения

### ⚠️ Важно! Bundle ID должен совпадать:
- В Xcode проекте: `com.workflow.kz`
- В GoogleService-Info.plist: `com.workflow.kz`
- В Firebase Console: `com.workflow.kz`

### 📁 Структура папок:
```
ios/
├── Workflow/
│   ├── GoogleService-Info.plist    ← Должен быть здесь
│   ├── Workflow.entitlements   ← Должен быть здесь
│   ├── Info.plist                  ← Должен быть здесь
│   └── AppDelegate.swift           ← Обновлен с логами
├── Workflow.xcodeproj/
└── Workflow.xcworkspace/
```

## ✅ Что уже исправлено автоматически:

### 🔧 Bundle ID:
- ✅ Исправлен с `com.example.kcell` на `com.workflow.kz`
- ✅ Теперь совпадает с GoogleService-Info.plist

### 📁 Файл entitlements:
- ✅ Создан файл `Workflow.entitlements`
- ✅ Добавлен в проект Xcode
- ✅ Настроен в build settings

## Шаг 1: Проверить настройки в Xcode

1. Откройте проект в Xcode
2. Убедитесь, что файл `Workflow.entitlements` отображается в проекте
3. Проверьте, что в build settings указан `CODE_SIGN_ENTITLEMENTS = Workflow/Workflow.entitlements`

## Шаг 2: Настроить Code Signing & Entitlements

1. Выберите target Workflow
2. Перейдите в "Signing & Capabilities"
3. Нажмите "+ Capability"
4. Добавьте "Push Notifications"
5. В поле "Entitlements File" укажите `Workflow.entitlements`

## Шаг 3: Проверить Bundle Identifier

1. Убедитесь, что Bundle Identifier соответствует настройкам в Firebase Console
2. Проверьте, что используется правильный Team ID для подписи

## Шаг 4: Настроить APNs сертификат

1. В Firebase Console перейдите в Project Settings → Cloud Messaging
2. Загрузите APNs Authentication Key или сертификат
3. Убедитесь, что Bundle ID совпадает

## Шаг 5: Проверить настройки

После настройки в логах должно появиться:
```
🚀 [PUSH] Приложение запускается...
🔥 [PUSH] Инициализация Firebase...
✅ [PUSH] Firebase инициализирован успешно
📱 [PUSH] Настройка Firebase Messaging...
✅ [PUSH] Firebase Messaging настроен
🔔 [PUSH] Запрос разрешений на уведомления...
✅ [PUSH] Разрешения на уведомления получены
📱 [PUSH] Регистрация для push-уведомлений...
🍎 [PUSH] APNs device token получен: <...>
🔗 [PUSH] Устанавливаем APNs токен для Firebase...
✅ [PUSH] APNs токен успешно установлен для Firebase
🔑 [PUSH] APNs токен (читаемый): <...>
🔥 [PUSH] Firebase registration token получен: <...>
✅ [PUSH] FCM токен успешно получен: <...>
📢 [PUSH] FCM токен отправлен в NotificationCenter
```

## Важные моменты:

- Файл entitlements должен содержать `aps-environment` с значением `development` для debug и `production` для release
- Приложение должно быть подписано правильным сертификатом
- Bundle ID должен совпадать в Xcode, Firebase Console и APNs
- Для тестирования используйте реальное устройство (не симулятор)

## Устранение ошибок:

### Ошибка "no valid aps-environment entitlement":
1. Проверьте, что entitlements файл добавлен в проект
2. Убедитесь, что в "Signing & Capabilities" указан правильный файл entitlements
3. Очистите проект (Product → Clean Build Folder)
4. Перезапустите Xcode

### Ошибка "Build input file cannot be found: GoogleService-Info.plist":
1. Убедитесь, что файл `GoogleService-Info.plist` находится в папке `ios/Workflow/`
2. Проверьте, что файл добавлен в проект в Xcode
3. Убедитесь, что путь в проекте указан как `Workflow/GoogleService-Info.plist`
4. Если файл отсутствует, скачайте его из Firebase Console

## 📋 Отслеживание прогресса через логи:

Приложение теперь выводит подробные логи с эмодзи для отслеживания процесса:

### 🚀 Запуск приложения:
- `🚀 [PUSH] Приложение запускается...`

### 🔥 Firebase:
- `🔥 [PUSH] Инициализация Firebase...`
- `✅ [PUSH] Firebase инициализирован успешно`
- `📱 [PUSH] Настройка Firebase Messaging...`
- `✅ [PUSH] Firebase Messaging настроен`

### 🔔 Разрешения:
- `🔔 [PUSH] Запрос разрешений на уведомления...`
- `✅ [PUSH] Разрешения на уведомления получены` или `❌ [PUSH] Разрешения отклонены`

### 📱 Регистрация:
- `📱 [PUSH] Регистрация для push-уведомлений...`
- `🍎 [PUSH] APNs device token получен: <...>`
- `🔗 [PUSH] Устанавливаем APNs токен для Firebase...`
- `✅ [PUSH] APNs токен успешно установлен для Firebase`

### 🔑 Токены:
- `🔑 [PUSH] APNs токен (читаемый): <...>`
- `🔥 [PUSH] Firebase registration token получен: <...>`
- `✅ [PUSH] FCM токен успешно получен: <...>`

### 🔍 Статус:
- `🔍 [PUSH] Проверка статуса уведомлений...`
- `📊 [PUSH] Статус разрешений:` с детальной информацией

### ❌ Ошибки:
- `❌ [PUSH] Ошибка регистрации для push-уведомлений: <...>`
- `🔍 [PUSH] Детали ошибки: <...>`
- `📊 [PUSH] Код ошибки: <...>`

Если какой-то этап не проходит, вы увидите соответствующий лог с ❌ или ⚠️.

## 🌐 Настройка Backend API:

### 📡 Endpoint для регистрации FCM токена:

Ваш backend имеет endpoint для регистрации FCM токена:

```
POST https://workflow-back-zpk4.onrender.com/api/fcm/token
```

### 📋 Формат запроса:

```json
{
  "token": "f_ZPib4M2UqCkMrct1x6qT:APA91bFfMtrk8zD32PRsfVCyUKh2Cx5VwcNFYPEaUX3jpWTm0E79pIIt4MSK7ENgRVVV5pvhs1FbM-mlQiMpZxpixiyxZ9sJG5BQpYPV_RmiLRWafivtnXM",
  "platform": "ios",
  "deviceId": "device_1705312200000"
}
```

### 🔐 Headers:

```
Content-Type: application/json
Accept: application/json
Authorization: Bearer your-auth-token-here
```

### 📝 Что делать в backend:

1. **Создайте таблицу** для хранения FCM токенов пользователей
2. **Сохраните токен** в базу данных с привязкой к пользователю и deviceId
3. **Верните ответ** с подтверждением регистрации
4. **Используйте токен** для отправки push-уведомлений

### 🔍 Описание полей:

- **`token`** - FCM токен для отправки push-уведомлений
- **`platform`** - платформа: 'ios' или 'android'
- **`deviceId`** - уникальный идентификатор устройства
- **`userId`** - ID пользователя (извлекается из auth токена в middleware)

### 🚀 Отправка push-уведомлений:

После регистрации токена вы сможете отправлять уведомления через Firebase Console или ваш backend API.

### 📱 DeviceId:

Приложение автоматически генерирует уникальный `deviceId` для каждого устройства:
- Использует существующий `deviceId` из AsyncStorage если есть
- Или использует `fcmToken` как `deviceId`
- Или генерирует новый: `device_${timestamp}`

Это позволяет:
- Отслеживать несколько устройств одного пользователя
- Обновлять токены при переустановке приложения
- Управлять подписками на темы по устройствам
