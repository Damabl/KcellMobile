import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firebase from '@react-native-firebase/app';

const PushNotificationManager = ({ children, onTokenReady, ref }) => {
  const [fcmToken, setFcmToken] = useState(null);

  // Инициализация Firebase
  useEffect(() => {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp();
      }
    } catch (error) {
      // Firebase initialization error
    }
  }, []);

  // Экспортируем функцию через ref
  useEffect(() => {
    if (ref) {
      ref.current = {
        initializePushNotifications: initializePushNotifications
      };
    }
  }, [ref]);

  // Запрос разрешений на уведомления
  const requestUserPermission = async () => {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  // Получение FCM токена
  const getFCMToken = async () => {
    try {
      const token = await messaging().getToken();
      setFcmToken(token);
      
      // Сохраняем токен в AsyncStorage
      await AsyncStorage.setItem('fcmToken', token);
      
      // Отправляем токен на сервер
      await sendTokenToServer(token);
      
      return token;
    } catch (error) {
      return null;
    }
  };

  // Отправка токена на сервер
  const sendTokenToServer = async (token) => {
    try {
      const response = await fetch('http://localhost:3000/api/fcm/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          platform: Platform.OS,
          userId: 'user123', // Замените на реальный ID пользователя
        }),
      });

      if (response.ok) {
        // FCM token sent successfully
      } else {
        // Failed to send FCM token
      }
    } catch (error) {
      // Error sending token
    }
  };

  // Обработка уведомлений в фоне
  const onMessageReceived = async (remoteMessage) => {
    // Уведомления показываются только в терминале
  };

  // Обработка уведомлений когда приложение открыто
  const onForegroundMessage = async (remoteMessage) => {
    // Уведомления показываются только в терминале
  };

  // Обработка нажатия на уведомление
  const onNotificationOpenedApp = (remoteMessage) => {
    // Здесь можно добавить навигацию к определенному экрану
  };

  // Тестовая функция для симуляции push-уведомлений убрана - тестирование доступно только через терминал
  const simulatePushNotification = () => {
    if (Platform.OS === 'ios' && __DEV__) {
      // Push notification simulation disabled - use terminal for testing
    }
  };

  // Состояние для отслеживания инициализации
  const [isInitialized, setIsInitialized] = useState(false);

  // Функция для инициализации push-уведомлений после логина
  const initializePushNotifications = async () => {
    try {
      // Запрашиваем разрешения
      const hasPermission = await requestUserPermission();
      
      if (hasPermission) {
        // Получаем FCM токен
        const token = await getFCMToken();
        
        // Уведомляем App.tsx о готовности токена
        if (onTokenReady) {
          onTokenReady(token);
        }
        
        // Подписываемся на обновления токена
        const unsubscribeToken = messaging().onTokenRefresh(token => {
          setFcmToken(token);
          AsyncStorage.setItem('fcmToken', token);
          sendTokenToServer(token);
          
          // Уведомляем App.tsx об обновлении токена
          if (onTokenReady) {
            onTokenReady(token);
          }
        });

        // Подписываемся на уведомления в фоне
        const unsubscribeBackground = messaging().onMessage(onMessageReceived);

        // Подписываемся на уведомления когда приложение открыто
        const unsubscribeForeground = messaging().onMessage(onForegroundMessage);

        // Подписываемся на нажатие уведомления
        const unsubscribeOpenedApp = messaging().onNotificationOpenedApp(onNotificationOpenedApp);

        // Проверяем, было ли приложение открыто через уведомление
        messaging()
          .getInitialNotification()
          .then(remoteMessage => {
            if (remoteMessage) {
              // App opened from quit state
            }
          });

        setIsInitialized(true);

        return () => {
          unsubscribeToken();
          unsubscribeBackground();
          unsubscribeForeground();
          unsubscribeOpenedApp();
        };
      } else {
        Alert.alert(
          'Уведомления отключены',
          'Для получения важных уведомлений включите разрешение на уведомления в настройках приложения.',
          [
            { text: 'Позже', style: 'cancel' },
            { 
              text: 'Настройки', 
              onPress: () => {
                // Open app settings
              }
            }
          ]
        );
      }
    } catch (error) {
      // Error initializing push notifications
    }
  };

  // Экспортируем функцию для вызова из App.tsx
  useEffect(() => {
    // Делаем функцию доступной глобально
    if (typeof window !== 'undefined') {
      window.initializePushNotifications = initializePushNotifications;
    }
  }, []);

  useEffect(() => {
    // Инициализируем только базовые обработчики при запуске
  }, []);

  return children;
};

export default PushNotificationManager;
