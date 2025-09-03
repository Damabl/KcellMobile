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
        setFcmToken(token);
        
        // Отправляем токен в WebView
        sendTokenToWebView(token);
    };

    // Функция для вызова инициализации FCM
    const callFCMInitialization = () => {
        if (pushNotificationManagerRef.current && pushNotificationManagerRef.current.initializePushNotifications) {
            pushNotificationManagerRef.current.initializePushNotifications();
        } else {
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
                    
                    var authToken = null;
                    
                    // 1. Попробуем auth-storage (Zustand)
                    if (debug['auth-storage']) {
                        try {
                            var authData = JSON.parse(debug['auth-storage']);
                            // Zustand с persist сохраняет данные в state
                            authToken = authData.state?.token || authData.token || null;
                        } catch (e) {
                            // Error parsing auth-storage
                        }
                    }
                    
                    // 2. Fallback к простым ключам
                    if (!authToken) {
                        authToken = debug['token'] || debug['authToken'] || debug['accessToken'] || debug['session-token'] || null;
                    }
                    
                    if (authToken) {
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
                const result = await response.json();
                // Tokens sent successfully
            } else {
                // Failed to send tokens
            }
        } catch (error) {
            // Error sending tokens
        }
    };

    const onWebViewMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);

            switch (data.type) {
                case 'getFCMToken':
                    if (fcmToken) {
                        sendTokenToWebView(fcmToken);
                    } else {
                        // Если токен еще не готов, сохраняем запрос
                        // Можно добавить очередь запросов здесь
                    }
                    break;
                case 'authAndFCMTokens':
                    // Получаем оба токена от WebView
                    const { authToken, fcmToken: webviewFcmToken, success, error } = data;
                    
                    if (success && authToken && webviewFcmToken) {
                        // User is logged in, sending tokens to server
                        sendTokensToServer(webviewFcmToken, authToken);
                    } else {
                        // User not logged in, FCM token saved for later
                        setFcmToken(webviewFcmToken);
                    }
                    break;
                case 'subscribeToTopic':
                    // Subscribe to topic
                    break;
                case 'unsubscribeFromTopic':
                    // Unsubscribe from topic
                    break;
                case 'sendTokenToServer':
                    if (fcmToken) {
                        // Sending token to server
                    }
                    break;
                case 'userLoggedIn':
                    // Пользователь залогинился, отправляем сохраненный FCM токен
                    const { authToken: loginAuthToken, success: loginSuccess } = data;
                    
                    if (loginSuccess && loginAuthToken) {
                        // User logged in, requesting push notification permission
                        
                        // Отправляем команду в WebView для инициализации push-уведомлений
                        if (webviewRef.current) {
                            const script = `
                                if (window.initializePushNotifications) {
                                    window.initializePushNotifications();
                                }
                            `;
                            webviewRef.current.injectJavaScript(script);
                        }
                        
                        // Отправляем токены на сервер
                        if (fcmToken) {
                            // User logged in, sending FCM token to server
                            sendTokensToServer(fcmToken, loginAuthToken);
                        }
                    }
                    break;
                case 'testPushNotification':
                    // Test push notification requested but disabled - use terminal for testing
                    break;
                case 'initializePushNotifications':
                    // Инициализация push-уведомлений после логина
                    
                    // Проверяем, не показывали ли мы уже диалог
                    if (!pushDialogShown) {
                        setPushDialogShown(true);
                        
                        // Показываем диалог для запроса разрешения на push-уведомления
                        Alert.alert(
                            'Разрешение на уведомления',
                            'Хотите получать push-уведомления?',
                            [
                                { text: 'Нет', style: 'cancel' },
                                { 
                                    text: 'Да', 
                                    onPress: () => {
                                        // User agreed to push notifications
                                        // Вызываем реальную инициализацию FCM
                                        callFCMInitialization();
                                    }
                                }
                            ]
                        );
                    }
                    break;
                default:
                    // Unknown message type
            }
        } catch (error) {
            // Error parsing WebView message
        }
    };

    const injectedJavaScript = `
        // Глобальные функции для FCM
        window.receiveFCMToken = function(token, authToken) {
            // FCM Token received from native
            // Auth Token received from native
            // Здесь можно обработать токены в веб-приложении
            if (window.fcmTokenCallback) {
                window.fcmTokenCallback(token, authToken);
            }
        };

        window.receiveFCMData = function(data) {
            // FCM Data received from native
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

        // Функция для инициализации push-уведомлений после логина
        window.initializePushNotifications = function() {
            // Проверяем, не вызывали ли мы уже инициализацию
            if (!window.pushNotificationsInitialized) {
                window.pushNotificationsInitialized = true;
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'initializePushNotifications'
                }));
            }
        };

        // Функция для проверки токена после логина (как в Android)
        window.checkTokenAfterLogin = function() {
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
            
            var authToken = null;
            
            // 1. Попробуем auth-storage (Zustand)
            if (debug['auth-storage']) {
                try {
                    var authData = JSON.parse(debug['auth-storage']);
                    authToken = authData.state?.token || authData.token || null;
                } catch (e) {
                    // Error parsing auth-storage
                }
            }
            
            // 2. Fallback к простым ключам
            if (!authToken) {
                authToken = debug['token'] || debug['authToken'] || debug['accessToken'] || debug['session-token'] || null;
            }
            
            if (authToken) {
                // Отправляем сообщение в React Native
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'userLoggedIn',
                    authToken: authToken,
                    success: true
                }));
            } else {
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
                        window.loginDetected = true;
                        window.checkTokenAfterLogin();
                    }
                }
            }, delay);
        });

        // Мониторинг изменений localStorage для обнаружения логина
        var originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
            originalSetItem.apply(this, arguments);
            
            // Проверяем, не изменился ли auth token
            if (key === 'auth-storage' || key === 'token' || key === 'authToken' || key === 'accessToken') {
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
            
            if (key === 'token' || key === 'authToken' || key === 'accessToken') {
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
                window.loginDetected = true;
                window.checkTokenAfterLogin();
            }
        }, 2000);

        // Останавливаем проверку через 60 секунд
        setTimeout(() => {
            clearInterval(checkInterval);
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
                
                setTimeout(() => {
                    if (!window.loginDetected) {
                        var token = localStorage.getItem('auth-storage') || 
                                   localStorage.getItem('token') || 
                                   localStorage.getItem('authToken');
                        if (token) {
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
