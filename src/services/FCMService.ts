import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

class FCMService {
  private static instance: FCMService;
  private fcmToken: string | null = null;

  private constructor() {}

  static getInstance(): FCMService {
    if (!FCMService.instance) {
      FCMService.instance = new FCMService();
    }
    return FCMService.instance;
  }

  // Запрос разрешений на уведомления
  async requestUserPermission(): Promise<boolean> {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      console.log('FCM Permission status:', authStatus);
      return enabled;
    } catch (error) {
      console.error('Error requesting FCM permission:', error);
      return false;
    }
  }

  // Получение FCM токена
  async getFCMToken(): Promise<string | null> {
    try {
      // Запрашиваем новый токен
      const token = await messaging().getToken();
      if (token) {
        this.fcmToken = token;
        await this.saveToken(token);
        console.log('FCM Token generated:', token);
        return token;
      }

      return null;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  // Сохранение токена в AsyncStorage
  private async saveToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem('fcm_token', token);
      console.log('FCM Token saved to storage');
    } catch (error) {
      console.error('Error saving FCM token:', error);
    }
  }

  // Получение сохраненного токена
  private async getStoredToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('fcm_token');
    } catch (error) {
      console.error('Error getting stored FCM token:', error);
      return null;
    }
  }

  // Удаление токена
  async deleteToken(): Promise<void> {
    try {
      await messaging().deleteToken();
      await AsyncStorage.removeItem('fcm_token');
      this.fcmToken = null;
      console.log('FCM Token deleted');
    } catch (error) {
      console.error('Error deleting FCM token:', error);
    }
  }

  // Подписка на тему
  async subscribeToTopic(topic: string): Promise<void> {
    try {
      await messaging().subscribeToTopic(topic);
      console.log('Subscribed to topic:', topic);
    } catch (error) {
      console.error('Error subscribing to topic:', error);
    }
  }

  // Отписка от темы
  async unsubscribeFromTopic(topic: string): Promise<void> {
    try {
      await messaging().unsubscribeFromTopic(topic);
      console.log('Unsubscribed from topic:', topic);
    } catch (error) {
      console.error('Error unsubscribing from topic:', error);
    }
  }

  // Отправка токена на сервер
  async sendTokenToServer(token: string, userId?: string): Promise<boolean> {
    try {
      const response = await fetch('https://kcell-service.vercel.app/api/fcm/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
        body: JSON.stringify({
          token: token,
          platform: Platform.OS,
          deviceId: await this.getDeviceId(),
        }),
      });

      if (response.ok) {
        console.log('FCM Token sent to server successfully');
        return true;
      } else {
        console.error('Failed to send FCM token to server:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Error sending FCM token to server:', error);
      return false;
    }
  }

  // Получение JWT токена из AsyncStorage
  private async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('auth_token');
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  // Получение ID устройства
  private async getDeviceId(): Promise<string> {
    try {
      const deviceId = await AsyncStorage.getItem('device_id');
      if (deviceId) {
        return deviceId;
      }
      
      // Генерируем новый ID устройства
      const newDeviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('device_id', newDeviceId);
      return newDeviceId;
    } catch (error) {
      console.error('Error getting device ID:', error);
      return `device_${Date.now()}`;
    }
  }

  // Настройка обработчиков сообщений
  setupMessageHandlers(): void {
    // Обработка сообщений когда приложение в фоне
    messaging().onMessage(async remoteMessage => {
      console.log('FCM Message received in foreground:', remoteMessage);
      this.handleForegroundMessage(remoteMessage);
    });

    // Обработка нажатия на уведомление
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('FCM Notification opened app:', remoteMessage);
      this.handleNotificationOpened(remoteMessage);
    });

    // Проверяем, было ли приложение открыто через уведомление
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          console.log('FCM App opened from notification:', remoteMessage);
          this.handleNotificationOpened(remoteMessage);
        }
      });
  }

  // Обработка сообщений в foreground
  private handleForegroundMessage(remoteMessage: any): void {
    // Здесь можно показать локальное уведомление
    console.log('Handling foreground message:', remoteMessage);
    
    // Отправляем данные в WebView
    this.sendDataToWebView(remoteMessage.data);
  }

  // Обработка нажатия на уведомление
  private handleNotificationOpened(remoteMessage: any): void {
    console.log('Handling notification opened:', remoteMessage);
    
    // Отправляем данные в WebView
    this.sendDataToWebView(remoteMessage.data);
  }

  // Отправка данных в WebView
  private sendDataToWebView(data: any): void {
    // Этот метод будет переопределен в App.tsx
    console.log('Sending data to WebView:', data);
  }

  // Установка callback для отправки данных в WebView
  setWebViewCallback(callback: (data: any) => void): void {
    this.sendDataToWebView = callback;
  }

  // Получение текущего токена
  getCurrentToken(): string | null {
    return this.fcmToken;
  }
}

export default FCMService;
