# 🔥 Настройка Firebase для iOS (Без заглушек)

## ✅ Что было исправлено

1. **Убраны заглушки** из всех компонентов
2. **Добавлен firebase.json** для правильной конфигурации
3. **Обновлен AppDelegate.swift** с полноценной поддержкой Firebase Messaging
4. **Исправлен GoogleService-Info.plist** с правильным Bundle ID
5. **Убраны тестовые токены** из кода

## 🚀 Следующие шаги

### 1. Установка зависимостей

```bash
# В корне проекта
npm install

# В папке ios
cd ios
pod install
cd ..
```

### 2. Настройка Firebase Console

1. Перейдите в [Firebase Console](https://console.firebase.google.com/)
2. Выберите проект `kcell-a303e`
3. Добавьте iOS приложение:
   - Bundle ID: `com.example.kcell`
   - App nickname: `KcellMobile iOS`
4. Скачайте новый `GoogleService-Info.plist`
5. Замените файл `ios/KcellMobile/GoogleService-Info.plist`

### 3. Настройка APNs (для продакшена)

**Для разработки:**
- Используйте Firebase для отправки уведомлений
- Работает в симуляторе и на устройстве

**Для продакшена:**
1. Создайте APNs сертификат в Apple Developer Console
2. Загрузите сертификат в Firebase Console
3. Настройте APNs Authentication Key

### 4. Запуск приложения

```bash
# Запуск в симуляторе
npx react-native run-ios

# Запуск на устройстве
npx react-native run-ios --device
```

## 🔧 Проверка работы

### 1. Проверка FCM токена

1. Запустите приложение
2. Разрешите уведомления
3. Проверьте консоль Xcode - должен появиться реальный FCM токен
4. Токен автоматически отправится на сервер

### 2. Тестирование уведомлений

```bash
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
    "token": "YOUR_REAL_FCM_TOKEN",
    "title": "Тест iOS",
    "body": "Уведомление работает!",
    "data": {"type": "test"}
  }'
```

## 📱 Особенности iOS

### 1. Симулятор vs Устройство

- **Симулятор**: FCM токены не работают, но можно тестировать UI
- **Устройство**: Полная поддержка push-уведомлений

### 2. Разрешения

- Приложение автоматически запрашивает разрешения на уведомления
- Пользователь может отключить уведомления в настройках

### 3. Background/Foreground

- **Foreground**: Уведомления показываются как алерты
- **Background**: Уведомления показываются в системном трее

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
**Решение:** 
- Проверьте GoogleService-Info.plist
- Убедитесь, что Bundle ID совпадает
- Проверьте подключение к интернету

**Проблема:** Уведомления не приходят
**Решение:**
- Убедитесь, что разрешения предоставлены
- Проверьте настройки APNs в Firebase Console
- Тестируйте на реальном устройстве

**Проблема:** Ошибка сборки
**Решение:**
```bash
cd ios
pod deintegrate
pod install
cd ..
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
- ✅ Нет заглушек - только реальная функциональность

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
