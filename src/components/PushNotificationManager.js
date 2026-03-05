import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { getMessaging, getToken, onMessage, onNotificationOpenedApp, getInitialNotification, requestPermission, onTokenRefresh, AuthorizationStatus } from '@react-native-firebase/messaging';
import { getApp, getApps } from '@react-native-firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PushNotificationManager = ({ children, onTokenReady, ref }) => {
  const [fcmToken, setFcmToken] = useState(null);

  // Инициализация Firebase
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        if (!getApps().length) {
          console.log('🔥 [PUSH] Инициализируем Firebase...');
          // Firebase авто-инициализируется через GoogleService-Info.plist / google-services.json
          console.log('✅ [PUSH] Firebase инициализирован');
        } else {
          console.log('✅ [PUSH] Firebase уже инициализирован');
        }
        
        // Ждем немного для полной инициализации Firebase
        console.log('⏳ [PUSH] Ждем полной инициализации Firebase...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ [PUSH] Firebase готов к использованию');
        
        // Автоматически получаем FCM токен при инициализации
        console.log('🔄 [PUSH] Автоматически получаем FCM токен...');
        getFCMToken();
        
      } catch (error) {
        console.error('❌ [PUSH] Ошибка инициализации Firebase:', error);
      }
    };

    initializeFirebase();
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
      const messaging = getMessaging();
      const authStatus = await requestPermission(messaging);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      return enabled;
    } catch (error) {
      return false;
    }
  };

  // Получение FCM токена
  const getFCMToken = async () => {
    try {
      console.log('🔍 [PUSH] Запрашиваем FCM токен у Firebase...');
      
      // Проверяем, что Firebase инициализирован
      if (!getApps().length) {
        console.log('⚠️ [PUSH] Firebase еще не инициализирован, ждем...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!getApps().length) {
          console.log('❌ [PUSH] Firebase все еще не инициализирован, пропускаем получение токена');
          return null;
        }
      }
      
      console.log('✅ [PUSH] Firebase готов, запрашиваем FCM токен...');
      const messaging = getMessaging();
      const token = await getToken(messaging);
      
      if (token) {
        setFcmToken(token);
        console.log('✅ [PUSH] FCM токен получен от Firebase:', token);
        
        await AsyncStorage.setItem('fcmToken', token);
        console.log('💾 [PUSH] FCM токен сохранен в AsyncStorage');
        
        console.log('⏳ [PUSH] FCM токен готов, ждем auth token для отправки на сервер');
        
        return token;
      } else {
        console.log('⚠️ [PUSH] FCM токен не получен от Firebase');
        return null;
      }
    } catch (error) {
      console.error('❌ [PUSH] Ошибка получения FCM токена:', error);
      return null;
    }
  };

  // Отправка токена на сервер
  const sendTokenToServer = async (token) => {
    try {
      console.log('🚀 [PUSH] Отправка FCM токена на сервер...');
      console.log('🔑 [PUSH] Токен:', token);
      console.log('📱 [PUSH] Платформа:', Platform.OS);
      
      let authToken = null;
      try {
        authToken = await AsyncStorage.getItem('token') || 
                   await AsyncStorage.getItem('authToken') || 
                   await AsyncStorage.getItem('accessToken');
      } catch (e) {
        console.log('⚠️ [PUSH] Не удалось получить auth token из AsyncStorage');
      }
      
      if (authToken) {
        console.log('🔐 [PUSH] Auth token найден');
      } else {
        console.log('❌ [PUSH] Auth token не найден');
      }
      
      const apiUrl = 'https://workflow-back-zpk4.onrender.com/api/fcm/token';
      
      const deviceId = await AsyncStorage.getItem('deviceId') || 
                      await AsyncStorage.getItem('fcmToken') || 
                      `device_${Date.now()}`;
      
      if (!await AsyncStorage.getItem('deviceId')) {
        await AsyncStorage.setItem('deviceId', deviceId);
      }
      
      const requestBody = {
        token: token,
        platform: Platform.OS,
        deviceId: deviceId,
      };
      
      console.log('📤 [PUSH] Отправляем данные на сервер:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ [PUSH] FCM токен успешно отправлен на сервер');
        
        await AsyncStorage.setItem('fcmTokenSent', 'true');
        await AsyncStorage.setItem('fcmTokenSentAt', new Date().toISOString());
        
      } else {
        const errorText = await response.text();
        console.error('❌ [PUSH] Ошибка отправки FCM токена:', response.status, errorText);
        
        await AsyncStorage.setItem('fcmTokenSent', 'false');
        await AsyncStorage.setItem('fcmTokenError', errorText);
      }
    } catch (error) {
      console.error('❌ [PUSH] Ошибка при отправке FCM токена:', error);
      
      await AsyncStorage.setItem('fcmTokenSent', 'false');
      await AsyncStorage.setItem('fcmTokenError', error.message);
    }
  };

  // Обработка уведомлений в фоне
  const onMessageReceivedHandler = async (remoteMessage) => {
    console.log('[PUSH] Background message:', remoteMessage);
  };

  // Обработка уведомлений когда приложение открыто (foreground)
  const onForegroundMessageHandler = async (remoteMessage) => {
    console.log('[PUSH] Foreground message received:', JSON.stringify(remoteMessage));
    
    if (remoteMessage.data) {
      console.log('[PUSH] Foreground message data:', remoteMessage.data);
    }
  };

  // Обработка нажатия на уведомление
  const onNotificationOpenedAppHandler = (remoteMessage) => {
    console.log('[PUSH] Notification opened app:', JSON.stringify(remoteMessage));
  };

  // Состояние для отслеживания инициализации
  const [isInitialized, setIsInitialized] = useState(false);

  // Функция для инициализации push-уведомлений после логина
  const initializePushNotifications = async () => {
    try {
      console.log('🔄 [PUSH] Инициализация push-уведомлений в React Native...');
      
      console.log('✅ [PUSH] Разрешения уже получены нативно, пропускаем запрос');
      
      const token = await getFCMToken();
      
      if (token) {
        if (onTokenReady) {
          onTokenReady(token);
        }
        
        const messaging = getMessaging();
        
        // Подписываемся на обновления токена
        const unsubscribeToken = onTokenRefresh(messaging, newToken => {
          setFcmToken(newToken);
          AsyncStorage.setItem('fcmToken', newToken);
          
          console.log('🔄 [PUSH] FCM токен обновлен, ждем auth token для отправки на сервер');
          
          if (onTokenReady) {
            onTokenReady(newToken);
          }
        });

        // Подписываемся на уведомления когда приложение открыто
        const unsubscribeForeground = onMessage(messaging, onForegroundMessageHandler);

        // Подписываемся на нажатие уведомления
        const unsubscribeOpenedApp = onNotificationOpenedApp(messaging, onNotificationOpenedAppHandler);

        // Проверяем, было ли приложение открыто через уведомление
        getInitialNotification(messaging)
          .then(remoteMessage => {
            if (remoteMessage) {
              console.log('[PUSH] App opened from quit state via notification:', remoteMessage);
            }
          });

        setIsInitialized(true);
        console.log('✅ [PUSH] Push-уведомления инициализированы в React Native');

        return () => {
          unsubscribeToken();
          unsubscribeForeground();
          unsubscribeOpenedApp();
        };
      } else {
        console.log('⚠️ [PUSH] FCM токен не получен, но разрешения есть');
      }
    } catch (error) {
      console.error('❌ [PUSH] Ошибка инициализации push-уведомлений:', error);
    }
  };

  // Экспортируем функцию для вызова из App.tsx
  useEffect(() => {
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
