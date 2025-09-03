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
        console.log('🔥 Initializing Firebase...');
        firebase.initializeApp();
        console.log('✅ Firebase initialized successfully');
      } else {
        console.log('✅ Firebase already initialized');
      }
    } catch (error) {
      console.error('❌ Error initializing Firebase:', error);
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
        console.log('Authorization status:', authStatus);
        return true;
      } else {
        console.log('Permission denied');
        return false;
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  };

  // Получение FCM токена
  const getFCMToken = async () => {
    try {
      const token = await messaging().getToken();
      console.log('FCM Token:', token);
      setFcmToken(token);
      
      // Сохраняем токен в AsyncStorage
      await AsyncStorage.setItem('fcmToken', token);
      
      // Отправляем токен на сервер
      await sendTokenToServer(token);
      
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
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
        console.log('FCM token sent to server successfully');
      } else {
        console.error('Failed to send FCM token to server');
      }
    } catch (error) {
      console.error('Error sending FCM token to server:', error);
    }
  };

  // Обработка уведомлений в фоне
  const onMessageReceived = async (remoteMessage) => {
    console.log('📱 Received background message:', remoteMessage);
    // Уведомления показываются только в терминале
  };

  // Обработка уведомлений когда приложение открыто
  const onForegroundMessage = async (remoteMessage) => {
    console.log('📱 Received foreground message:', remoteMessage);
    // Уведомления показываются только в терминале
  };

  // Обработка нажатия на уведомление
  const onNotificationOpenedApp = (remoteMessage) => {
    console.log('Notification opened app:', remoteMessage);
    // Здесь можно добавить навигацию к определенному экрану
  };

  // Тестовая функция для симуляции push-уведомлений убрана - тестирование доступно только через терминал
  const simulatePushNotification = () => {
    if (Platform.OS === 'ios' && __DEV__) {
      console.log('🧪 Push notification simulation disabled - use terminal for testing');
    }
  };

  // Состояние для отслеживания инициализации
  const [isInitialized, setIsInitialized] = useState(false);

  // Функция для инициализации push-уведомлений после логина
  const initializePushNotifications = async () => {
    try {
      console.log('🔔 Initializing push notifications after login...');
      
      // Запрашиваем разрешения
      const hasPermission = await requestUserPermission();
      
      if (hasPermission) {
        console.log('✅ FCM permission granted, initializing...');
        
        // Получаем FCM токен
        const token = await getFCMToken();
        console.log('🔑 FCM token obtained:', token);
        
        // Уведомляем App.tsx о готовности токена
        if (onTokenReady) {
          onTokenReady(token);
        }
        
        // Подписываемся на обновления токена
        const unsubscribeToken = messaging().onTokenRefresh(token => {
          console.log('🔄 FCM token refreshed:', token);
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
              console.log('📱 App opened from quit state:', remoteMessage);
            }
          });

        setIsInitialized(true);
        console.log('✅ Push notifications initialized successfully');

        return () => {
          unsubscribeToken();
          unsubscribeBackground();
          unsubscribeForeground();
          unsubscribeOpenedApp();
        };
      } else {
        console.log('❌ FCM permission denied');
        Alert.alert(
          'Уведомления отключены',
          'Для получения важных уведомлений включите разрешение на уведомления в настройках приложения.',
          [
            { text: 'Позже', style: 'cancel' },
            { 
              text: 'Настройки', 
              onPress: () => {
                console.log('Open app settings');
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('❌ Error initializing push notifications:', error);
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
    console.log('🚀 PushNotificationManager mounted - waiting for login...');
  }, []);

  return children;
};

export default PushNotificationManager;
