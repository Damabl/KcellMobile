# 🔄 Обновление Bundle ID на com.example.kcell

## ✅ Что было изменено

1. **GoogleService-Info.plist** - обновлен Bundle ID
2. **project.pbxproj** - обновлены обе конфигурации (Debug и Release)
3. **Тестовые скрипты** - добавлен новый Bundle ID

## 🚀 Следующие шаги

### 1. Переустановка зависимостей

```bash
cd ios
pod deintegrate
pod install
cd ..
```

### 2. Очистка и пересборка

```bash
# Очистка кэша
npx react-native start --reset-cache

# В новом терминале
npx react-native run-ios
```

### 3. Проверка в Firebase Console

1. Убедитесь, что в Firebase Console добавлено приложение с Bundle ID: `com.example.kcell`
2. Скачайте новый `GoogleService-Info.plist` если нужно
3. Замените файл в `ios/KcellMobile/GoogleService-Info.plist`

## 🔧 Проверка работы

1. Запустите приложение
2. Проверьте, что FCM токен получается корректно
3. Протестируйте отправку push-уведомлений

## 📱 Важные замечания

- Bundle ID должен совпадать во всех местах
- После изменения Bundle ID нужно переустановить поды
- Для продакшена может потребоваться новый provisioning profile
