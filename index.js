/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Обработчик фоновых/завершённых сообщений (ОБЯЗАТЕЛЬНО до registerComponent)
setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  console.log('[PUSH] Background message received:', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
