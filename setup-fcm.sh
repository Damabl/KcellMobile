#!/bin/bash

echo "🔥 Настройка Firebase Push Notifications для iOS..."
echo ""

# Проверяем, что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo "❌ Ошибка: package.json не найден. Убедитесь, что вы в корне проекта Workflow"
    exit 1
fi

echo "📦 Установка npm зависимостей..."
npm install

echo ""
echo "🍎 Установка iOS зависимостей..."
cd ios
pod install
cd ..

echo ""
echo "✅ Зависимости установлены!"
echo ""
echo "🔧 Следующие шаги:"
echo "1. Создайте проект в Firebase Console"
echo "2. Добавьте iOS приложение с Bundle ID: com.workflow.kz"
echo "3. Скачайте GoogleService-Info.plist"
echo "4. Замените ios/Workflow/GoogleService-Info.plist"
echo "5. Запустите: npx react-native run-ios"
echo ""
echo "📖 Подробные инструкции в FCM_SETUP_IOS.md"
