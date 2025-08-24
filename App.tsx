import React, { useEffect, useState, useRef } from 'react';
import { SafeAreaView, StyleSheet, View, ActivityIndicator, Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import PushNotificationManager from './src/components/PushNotificationManager';

export default function App() {
    const [loading, setLoading] = useState(true);
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [pushDialogShown, setPushDialogShown] = useState(false);
    const webviewRef = useRef<WebView>(null);
    const pushNotificationManagerRef = useRef<any>(null);

    // Обработчик готовности FCM токена
    const handleTokenReady = (token: string) => {
        console.log('🎯 FCM token ready in App.tsx:', token);
        setFcmToken(token);
        
        // Отправляем токен в WebView
        sendTokenToWebView(token);
    };

    // Функция для вызова инициализации FCM
    const callFCMInitialization = () => {
        console.log('🔔 Calling real FCM initialization...');
        if (pushNotificationManagerRef.current && pushNotificationManagerRef.current.initializePushNotifications) {
            pushNotificationManagerRef.current.initializePushNotifications();
        } else {
            console.log('❌ FCM initialization function not found, using fallback...');
            // Fallback: отправляем команду в WebView
            if (webviewRef.current) {
                const script = `
                    if (window.initializePushNotifications) {
                        window.initializePushNotifications();
                    }
                `;
                webviewRef.current.injectJavaScript(script);
            }
        }
    };

    const sendTokenToWebView = (token: string) => {
        if (webviewRef.current) {
            // Проверяем auth token и отправляем FCM токен только если пользователь залогинен
            const script = `
                (function() {
                    console.log('🔍 Checking auth token for FCM registration...');
                    
                    // Полная диагностика localStorage (как в Android)
                    var debug = {
                        'origin': location.origin,
                        'url': location.href,
                        'auth-storage': localStorage.getItem('auth-storage'),
                        'token': localStorage.getItem('token'),
                        'authToken': localStorage.getItem('authToken'),
                        'accessToken': localStorage.getItem('accessToken'),
                        'session-token': sessionStorage.getItem('token'),
                        'all-keys': Object.keys(localStorage)
                    };
                    
                    console.log('=== FCM TOKEN CHECK DEBUG ===');
                    console.log('Origin:', debug.origin);
                    console.log('URL:', debug.url);
                    console.log('auth-storage:', debug['auth-storage']);
                    console.log('token:', debug['token']);
                    console.log('authToken:', debug['authToken']);
                    console.log('accessToken:', debug['accessToken']);
                    console.log('session-token:', debug['session-token']);
                    console.log('All localStorage keys:', debug['all-keys']);
                    
                    var authToken = null;
                    
                    // 1. Попробуем auth-storage (Zustand)
                    if (debug['auth-storage']) {
                        try {
                            var authData = JSON.parse(debug['auth-storage']);
                            // Zustand с persist сохраняет данные в state
                            authToken = authData.state?.token || authData.token || null;
                            console.log('✅ Token from Zustand storage:', authToken ? authToken.substring(0, 20) + '...' : 'null');
                        } catch (e) {
                            console.log('❌ Error parsing auth-storage:', e);
                        }
                    }
                    
                    // 2. Fallback к простым ключам
                    if (!authToken) {
                        authToken = debug['token'] || debug['authToken'] || debug['accessToken'] || debug['session-token'] || null;
                        console.log('✅ Token from legacy storage:', authToken ? authToken.substring(0, 20) + '...' : 'null');
                    }
                    
                    if (authToken) {
                        console.log('🎯 Auth token found, length:', authToken.length);
                        
                        // Проверяем формат JWT токена
                        var parts = authToken.split('.');
                        if (parts.length === 3) {
                            console.log('✅ JWT token format looks valid (3 parts)');
                        } else {
                            console.log('⚠️ JWT token format invalid - expected 3 parts, got ' + parts.length);
                        }
                        
                        // Отправляем оба токена в React Native
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'authAndFCMTokens',
                            authToken: authToken,
                            fcmToken: '${token}',
                            success: true
                        }));
                        
                        // Также вызываем callback если есть
                        if (window.receiveFCMToken) { 
                            window.receiveFCMToken('${token}', authToken); 
                        }
                    } else {
                        console.log('❌ No auth token found - user not logged in');
                        
                        // Отправляем сообщение что токен не найден
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'authAndFCMTokens',
                            authToken: null,
                            fcmToken: '${token}',
                            success: false,
                            error: 'No auth token found - user not logged in'
                        }));
                        
                        // Сохраняем FCM токен для отправки позже
                        if (window.receiveFCMToken) { 
                            window.receiveFCMToken('${token}', null); 
                        }
                    }
                })();
            `;
            webviewRef.current.injectJavaScript(script);
        }
    };

    const sendDataToWebView = (data: any) => {
        if (webviewRef.current) {
            const dataJson = JSON.stringify(data);
            const script = `if (window.receiveFCMData) { window.receiveFCMData(${dataJson}); }`;
            webviewRef.current.injectJavaScript(script);
        }
    };

    const sendTokensToServer = async (fcmToken: string, authToken: string) => {
        try {
            console.log('Sending tokens to server...');
            const response = await fetch('http://localhost:3000/api/fcm/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    fcmToken: fcmToken,
                    platform: Platform.OS,
                    userId: 'user123', // Можно получить из auth token
                }),
            });

            if (response.ok) {
                console.log('Tokens sent to server successfully');
                const result = await response.json();
                console.log('Server response:', result);
            } else {
                console.error('Failed to send tokens to server:', response.status);
            }
        } catch (error) {
            console.error('Error sending tokens to server:', error);
        }
    };

    const onWebViewMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log('Message from WebView:', data);

            switch (data.type) {
                case 'getFCMToken':
                    if (fcmToken) {
                        sendTokenToWebView(fcmToken);
                    } else {
                        // Если токен еще не готов, сохраняем запрос
                        console.log('FCM token not ready yet, will send when available');
                        // Можно добавить очередь запросов здесь
                    }
                    break;
                case 'authAndFCMTokens':
                    // Получаем оба токена от WebView
                    const { authToken, fcmToken: webviewFcmToken, success, error } = data;
                    console.log('Received auth token:', authToken ? authToken.substring(0, 20) + '...' : 'null');
                    console.log('Received FCM token from WebView:', webviewFcmToken);
                    console.log('Success:', success);
                    console.log('Error:', error);
                    
                    if (success && authToken && webviewFcmToken) {
                        console.log('✅ User is logged in, sending tokens to server...');
                        sendTokensToServer(webviewFcmToken, authToken);
                    } else {
                        console.log('⚠️ User not logged in, FCM token saved for later');
                        // Сохраняем FCM токен для отправки после логина
                        setFcmToken(webviewFcmToken);
                    }
                    break;
                case 'subscribeToTopic':
                    console.log('Subscribe to topic:', data.topic);
                    // TODO: Implement topic subscription
                    break;
                case 'unsubscribeFromTopic':
                    console.log('Unsubscribe from topic:', data.topic);
                    // TODO: Implement topic unsubscription
                    break;
                case 'sendTokenToServer':
                    if (fcmToken) {
                        console.log('Sending token to server:', fcmToken);
                        // TODO: Implement token sending
                    }
                    break;
                case 'userLoggedIn':
                    // Пользователь залогинился, отправляем сохраненный FCM токен
                    const { authToken: loginAuthToken, success: loginSuccess } = data;
                    console.log('User logged in, auth token:', loginAuthToken ? loginAuthToken.substring(0, 20) + '...' : 'null');
                    
                    if (loginSuccess && loginAuthToken) {
                        console.log('✅ User logged in, requesting push notification permission...');
                        
                        // Отправляем команду в WebView для инициализации push-уведомлений
                        if (webviewRef.current) {
                            const script = `
                                if (window.initializePushNotifications) {
                                    window.initializePushNotifications();
                                } else {
                                    console.log('Push notifications initialization function not found');
                                }
                            `;
                            webviewRef.current.injectJavaScript(script);
                        }
                        
                        // Отправляем токены на сервер
                        if (fcmToken) {
                            console.log('✅ User logged in, sending FCM token to server...');
                            sendTokensToServer(fcmToken, loginAuthToken);
                        }
                    }
                    break;
                case 'testPushNotification':
                    // Тестирование push-уведомлений на симуляторе
                    console.log('Testing push notification...');
                    // Показываем тестовое уведомление
                    Alert.alert(
                        'Тестовое уведомление',
                        'Это тестовое push-уведомление с симулятора',
                        [
                            { text: 'OK', onPress: () => console.log('Test notification OK pressed') }
                        ]
                    );
                    break;
                case 'initializePushNotifications':
                    // Инициализация push-уведомлений после логина
                    console.log('🔔 Initializing push notifications after login...');
                    
                    // Проверяем, не показывали ли мы уже диалог
                    if (!pushDialogShown) {
                        setPushDialogShown(true);
                        
                        // Вызываем инициализацию через PushNotificationManager
                        Alert.alert(
                            'Разрешение на уведомления',
                            'Хотите получать push-уведомления?',
                            [
                                { text: 'Нет', style: 'cancel' },
                                { 
                                    text: 'Да', 
                                                                    onPress: () => {
                                    console.log('User agreed to push notifications');
                                    // Вызываем реальную инициализацию FCM
                                    callFCMInitialization();
                                }
                                }
                            ]
                        );
                    } else {
                        console.log('🔔 Push notification dialog already shown, skipping...');
                    }
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error parsing WebView message:', error);
        }
    };

    const injectedJavaScript = `
        // Глобальные функции для FCM
        window.receiveFCMToken = function(token, authToken) {
            console.log('FCM Token received from native:', token);
            console.log('Auth Token received from native:', authToken);
            // Здесь можно обработать токены в веб-приложении
            if (window.fcmTokenCallback) {
                window.fcmTokenCallback(token, authToken);
            }
        };

        window.receiveFCMData = function(data) {
            console.log('FCM Data received from native:', data);
            // Здесь можно обработать данные уведомления
            if (window.fcmDataCallback) {
                window.fcmDataCallback(data);
            }
        };

        // Функции для отправки сообщений в нативное приложение
        window.getFCMToken = function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'getFCMToken'
            }));
        };

        window.subscribeToNotifications = function(topic) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'subscribeToTopic',
                topic: topic
            }));
        };

        window.unsubscribeFromNotifications = function(topic) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'unsubscribeFromTopic',
                topic: topic
            }));
        };

        window.sendTokenToServer = function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'sendTokenToServer'
            }));
        };

        window.getAuthToken = function() {
            const authToken = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('accessToken');
            console.log('Auth token from localStorage:', authToken);
            return authToken;
        };

        window.sendAuthAndFCMTokens = function(fcmToken) {
            const authToken = window.getAuthToken();
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'authAndFCMTokens',
                authToken: authToken,
                fcmToken: fcmToken
            }));
        };

        // Функция для тестирования push-уведомлений на симуляторе
        window.testPushNotification = function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'testPushNotification'
            }));
        };

        // Функция для инициализации push-уведомлений после логина
        window.initializePushNotifications = function() {
            console.log('🔔 Initializing push notifications after login...');
            
            // Проверяем, не вызывали ли мы уже инициализацию
            if (!window.pushNotificationsInitialized) {
                window.pushNotificationsInitialized = true;
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'initializePushNotifications'
                }));
            } else {
                console.log('🔔 Push notifications already initialized, skipping...');
            }
        };

        // Функция для проверки токена после логина (как в Android)
        window.checkTokenAfterLogin = function() {
            console.log('🔍 Checking token after login...');
            
            // Полная диагностика localStorage
            var debug = {
                'origin': location.origin,
                'url': location.href,
                'auth-storage': localStorage.getItem('auth-storage'),
                'token': localStorage.getItem('token'),
                'authToken': localStorage.getItem('authToken'),
                'accessToken': localStorage.getItem('accessToken'),
                'session-token': sessionStorage.getItem('token'),
                'all-keys': Object.keys(localStorage)
            };
            
            console.log('=== LOGIN CHECK DEBUG ===');
            console.log('Origin:', debug.origin);
            console.log('URL:', debug.url);
            console.log('auth-storage:', debug['auth-storage']);
            console.log('token:', debug['token']);
            console.log('authToken:', debug['authToken']);
            console.log('accessToken:', debug['accessToken']);
            console.log('session-token:', debug['session-token']);
            console.log('All localStorage keys:', debug['all-keys']);
            
            var authToken = null;
            
            // 1. Попробуем auth-storage (Zustand)
            if (debug['auth-storage']) {
                try {
                    var authData = JSON.parse(debug['auth-storage']);
                    authToken = authData.state?.token || authData.token || null;
                    console.log('✅ Token from Zustand storage:', authToken ? authToken.substring(0, 20) + '...' : 'null');
                } catch (e) {
                    console.log('❌ Error parsing auth-storage:', e);
                }
            }
            
            // 2. Fallback к простым ключам
            if (!authToken) {
                authToken = debug['token'] || debug['authToken'] || debug['accessToken'] || debug['session-token'] || null;
                console.log('✅ Token from legacy storage:', authToken ? authToken.substring(0, 20) + '...' : 'null');
            }
            
            if (authToken) {
                console.log('🎯 Auth token found after login, length:', authToken.length);
                
                // Отправляем сообщение в React Native
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'userLoggedIn',
                    authToken: authToken,
                    success: true
                }));
            } else {
                console.log('❌ No auth token found after login');
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'userLoggedIn',
                    authToken: null,
                    success: false,
                    error: 'No auth token found after login'
                }));
            }
        };

        // Автоматически запрашиваем токен при загрузке страницы
        setTimeout(() => {
            console.log('Requesting FCM token...');
            window.getFCMToken();
        }, 1000);

        // 7. Проверка токена при загрузке страницы с разными задержками
        var delays = [3000, 5000, 8000, 12000, 15000]; // Проверяем через 3, 5, 8, 12, 15 секунд
        delays.forEach((delay) => {
            setTimeout(() => {
                if (!window.loginDetected) {
                    var token = localStorage.getItem('auth-storage') || 
                               localStorage.getItem('token') || 
                               localStorage.getItem('authToken') || 
                               localStorage.getItem('accessToken') ||
                               sessionStorage.getItem('token');
                    
                    if (token) {
                        console.log('🔍 Delayed check (' + delay + 'ms) found token:', token.substring(0, 20) + '...');
                        window.loginDetected = true;
                        window.checkTokenAfterLogin();
                    }
                }
            }, delay);
        });

        // Добавляем кнопки для тестирования (только в dev режиме)
        if (window.location.hostname === 'localhost' || window.location.hostname.includes('vercel.app')) {
            setTimeout(() => {
                // Создаем кнопку для тестирования push-уведомлений
                var testButton = document.createElement('button');
                testButton.textContent = '🧪 Test Push Notification';
                testButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background: #007aff; color: white; border: none; padding: 10px; border-radius: 5px; font-size: 12px;';
                testButton.onclick = function() {
                    window.testPushNotification();
                };
                document.body.appendChild(testButton);
                
                // Создаем кнопку для ручного тестирования логина
                var loginTestButton = document.createElement('button');
                loginTestButton.textContent = '🔐 Test Login Detection';
                loginTestButton.style.cssText = 'position: fixed; top: 50px; right: 10px; z-index: 9999; background: #ff6b35; color: white; border: none; padding: 10px; border-radius: 5px; font-size: 12px;';
                loginTestButton.onclick = function() {
                    console.log('🔐 Manual login test triggered');
                    window.checkTokenAfterLogin();
                };
                document.body.appendChild(loginTestButton);
                
                console.log('Test buttons added to page');
            }, 2000);
        }

        // Мониторинг изменений localStorage для обнаружения логина
        var originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
            originalSetItem.apply(this, arguments);
            
            console.log('🔍 localStorage.setItem called:', key, value ? value.substring(0, 50) + '...' : 'null');
            
            // Проверяем, не изменился ли auth token
            if (key === 'auth-storage' || key === 'token' || key === 'authToken' || key === 'accessToken') {
                console.log('🔍 Auth-related localStorage changed:', key, value ? value.substring(0, 20) + '...' : 'null');
                
                // Даем время на завершение операций
                setTimeout(() => {
                    window.checkTokenAfterLogin();
                }, 500);
            }
        };

        // Также мониторим sessionStorage
        var originalSessionSetItem = sessionStorage.setItem;
        sessionStorage.setItem = function(key, value) {
            originalSessionSetItem.apply(this, arguments);
            
            console.log('🔍 sessionStorage.setItem called:', key, value ? value.substring(0, 50) + '...' : 'null');
            
            if (key === 'token' || key === 'authToken' || key === 'accessToken') {
                console.log('🔍 Auth-related sessionStorage changed:', key, value ? value.substring(0, 20) + '...' : 'null');
                
                setTimeout(() => {
                    window.checkTokenAfterLogin();
                }, 500);
            }
        };

        // 1. Периодическая проверка на наличие токена (каждые 2 секунды в течение 60 секунд)
        var checkInterval = setInterval(() => {
            var currentToken = localStorage.getItem('auth-storage') || 
                              localStorage.getItem('token') || 
                              localStorage.getItem('authToken') || 
                              localStorage.getItem('accessToken') ||
                              sessionStorage.getItem('token');
            
            if (currentToken && !window.loginDetected) {
                console.log('🔍 Periodic check found token:', currentToken.substring(0, 20) + '...');
                window.loginDetected = true;
                window.checkTokenAfterLogin();
            }
        }, 2000);

        // Останавливаем проверку через 60 секунд
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('⏰ Stopped periodic token checking');
        }, 60000);

        // 2. Мониторинг событий DOM для обнаружения изменений
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // Проверяем при любых изменениях DOM
                if (!window.loginDetected) {
                    setTimeout(() => {
                        var token = localStorage.getItem('auth-storage') || 
                                   localStorage.getItem('token') || 
                                   localStorage.getItem('authToken');
                        if (token) {
                            console.log('🔍 DOM mutation detected token:', token.substring(0, 20) + '...');
                            window.loginDetected = true;
                            window.checkTokenAfterLogin();
                        }
                    }, 100);
                }
            });
        });

        // Начинаем наблюдение за изменениями
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });

        // 3. Мониторинг событий клавиатуры (Enter в формах логина)
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && !window.loginDetected) {
                setTimeout(() => {
                    var token = localStorage.getItem('auth-storage') || 
                               localStorage.getItem('token') || 
                               localStorage.getItem('authToken');
                    if (token) {
                        console.log('🔍 Enter key detected token:', token.substring(0, 20) + '...');
                        window.loginDetected = true;
                        window.checkTokenAfterLogin();
                    }
                }, 1000);
            }
        });

        // 4. Мониторинг событий click (кнопки логина)
        document.addEventListener('click', function(event) {
            if (!window.loginDetected) {
                setTimeout(() => {
                    var token = localStorage.getItem('auth-storage') || 
                               localStorage.getItem('token') || 
                               localStorage.getItem('authToken');
                    if (token) {
                        console.log('🔍 Click event detected token:', token.substring(0, 20) + '...');
                        window.loginDetected = true;
                        window.checkTokenAfterLogin();
                    }
                }, 1500);
            }
        });

        // 5. Мониторинг событий focus/blur на input полях
        document.addEventListener('focus', function(event) {
            if (event.target.type === 'password' || event.target.type === 'email') {
                setTimeout(() => {
                    if (!window.loginDetected) {
                        var token = localStorage.getItem('auth-storage') || 
                                   localStorage.getItem('token') || 
                                   localStorage.getItem('authToken');
                        if (token) {
                            console.log('🔍 Input focus detected token:', token.substring(0, 20) + '...');
                            window.loginDetected = true;
                            window.checkTokenAfterLogin();
                        }
                    }
                }, 500);
            }
        }, true);

        // 6. Мониторинг изменений URL (если используется SPA роутинг)
        var currentURL = window.location.href;
        setInterval(() => {
            if (window.location.href !== currentURL) {
                currentURL = window.location.href;
                console.log('🔍 URL changed to:', currentURL);
                
                setTimeout(() => {
                    if (!window.loginDetected) {
                        var token = localStorage.getItem('auth-storage') || 
                                   localStorage.getItem('token') || 
                                   localStorage.getItem('authToken');
                        if (token) {
                            console.log('🔍 URL change detected token:', token.substring(0, 20) + '...');
                            window.loginDetected = true;
                            window.checkTokenAfterLogin();
                        }
                    }
                }, 1000);
            }
        }, 1000);

        true;
    `;

        return (
        <PushNotificationManager 
            onTokenReady={handleTokenReady}
            ref={pushNotificationManagerRef}
        >
            <SafeAreaView style={{ flex: 1 }}>
            {loading && (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color="#007aff" />
                </View>
            )}
            <WebView
                ref={webviewRef}
                    source={{ uri: 'https://kcell-service.vercel.app' }}
                onLoadEnd={() => setLoading(false)}
                startInLoadingState={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                    onMessage={onWebViewMessage}
                    injectedJavaScript={injectedJavaScript}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
            />
        </SafeAreaView>
        </PushNotificationManager>
    );
}

const styles = StyleSheet.create({
    loading: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
        zIndex: 1,
    }
});
