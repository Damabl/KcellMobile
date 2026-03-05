import React, { useEffect, useState, useRef } from 'react';
import { SafeAreaView, StyleSheet, View, ActivityIndicator, Alert, Platform, Linking, Text, TouchableOpacity, NativeModules, NativeEventEmitter } from 'react-native';
import { WebView } from 'react-native-webview';
import PushNotificationManager from './src/components/PushNotificationManager';

export default function App() {
    const [loading, setLoading] = useState(true);
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [networkError, setNetworkError] = useState(false);
    const webviewRef = useRef<WebView>(null);
    const pushNotificationManagerRef = useRef<any>(null);

    // Подписка на данные Core Motion (Activity Tracker) — инжект в WebView
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        const MotionBridge = NativeModules?.MotionBridge;
        if (!MotionBridge) return;
        const emitter = new NativeEventEmitter(MotionBridge);
        const sub = emitter.addListener('onMotionData', (payload: { data?: string; error?: string }) => {
            if (!webviewRef.current) return;
            if (payload?.error) {
                const errEscaped = (payload.error || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const script = `if (typeof window.handleIOSMotionData === 'function') { window.handleIOSMotionData(JSON.stringify({ error: '${errEscaped}' })); }`;
                webviewRef.current.injectJavaScript(script);
                return;
            }
            const raw = payload?.data;
            if (!raw) return;
            const escaped = raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
            const script = `if (typeof window.handleIOSMotionData === 'function') { window.handleIOSMotionData('${escaped}'); }`;
            webviewRef.current.injectJavaScript(script);
        });
        return () => sub.remove();
    }, []);

    // Подписка на шаги из HealthKit / CMPedometer и отправка в WebView
    useEffect(() => {
        if (Platform.OS !== 'ios') return;

        const StepCounterBridge = NativeModules?.StepCounterBridge;
        if (!StepCounterBridge) {
            console.log('[STEPS] StepCounterBridge not found');
            return;
        }

        const emitter = new NativeEventEmitter(StepCounterBridge);
        const sub = emitter.addListener('onStepCount', (payload: { steps?: number; error?: string }) => {
            if (!webviewRef.current) return;
            if (payload?.error) {
                console.warn('[STEPS] Error from native step counter:', payload.error);
                return;
            }
            if (typeof payload?.steps === 'number') {
                webviewRef.current.postMessage(
                    JSON.stringify({
                        type: 'stepsUpdated',
                        value: payload.steps,
                    })
                );
            }
        });

        // Запрашиваем авторизацию HealthKit и запускаем шагомер
        (async () => {
            try {
                if (StepCounterBridge.requestAuthorization) {
                    const granted = await StepCounterBridge.requestAuthorization();
                    if (!granted) {
                        console.log('[STEPS] HealthKit authorization not granted');
                        return;
                    }
                }
                if (StepCounterBridge.startStepUpdates) {
                    StepCounterBridge.startStepUpdates();
                }
            } catch (e) {
                console.warn('[STEPS] Failed to start step updates:', e);
            }
        })();

        return () => {
            sub.remove();
            if (StepCounterBridge.stopStepUpdates) {
                StepCounterBridge.stopStepUpdates();
            }
        };
    }, []);

    // Обработчик готовности FCM токена
    const handleTokenReady = (token: string) => {
        console.log('[FCM] ===== handleTokenReady called =====');
        console.log('[FCM] FCM token:', token ? token.substring(0, 30) + '...' : 'NULL');
        setFcmToken(token);
        
        // Отправляем токен в WebView
        sendTokenToWebView(token);
        
        // Проверяем, есть ли сохраненный auth token для немедленной отправки
        // Это нужно для случая, когда FCM токен приходит после логина
        if (webviewRef.current) {
            const checkAuthScript = `
                (function() {
                    var authToken = null;
                    var authStorage = localStorage.getItem('auth-storage');
                    
                    if (authStorage) {
                        try {
                            var authData = JSON.parse(authStorage);
                            authToken = authData.state?.token || authData.token || null;
                        } catch (e) {}
                    }
                    
                    if (!authToken) {
                        authToken = localStorage.getItem('token') || 
                                   localStorage.getItem('authToken') || 
                                   localStorage.getItem('accessToken') || 
                                   sessionStorage.getItem('token') || null;
                    }
                    
                    if (authToken) {
                        // Пользователь залогинен, отправляем FCM токен на сервер
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'authAndFCMTokens',
                            authToken: authToken,
                            fcmToken: '${token}',
                            success: true
                        }));
                    }
                })();
            `;
            webviewRef.current.injectJavaScript(checkAuthScript);
        }
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

    // Флаг для отслеживания успешной отправки токена (как в Android)
    const tokenSentSuccessfullyRef = useRef(false);
    const tokenSendingInProgressRef = useRef(false);
    // Auth‑токен, для которого FCM ПОСЛЕДНИЙ РАЗ был успешно отправлен.
    // Позволяет детектить смену аккаунта независимо от сигналов WebView
    // (WebView может перезагрузиться и потерять state).
    const lastSentForAuthTokenRef = useRef<string | null>(null);
    // Последний auth‑токен, полученный от WebView (для обработчиков сообщений)
    const lastAuthTokenRef = useRef<string | null>(null);

    const sendTokensToServer = async (fcmToken: string, authToken: string) => {
        // Самодостаточная детекция смены аккаунта: если auth‑токен изменился
        // с момента последней успешной отправки — сбрасываем флаг и переотправляем.
        // Это нужно потому что при перезагрузке страницы (смена аккаунта) WebView
        // теряет state и НЕ отправляет userLoggedOut.
        if (tokenSentSuccessfullyRef.current && lastSentForAuthTokenRef.current && lastSentForAuthTokenRef.current !== authToken) {
            console.log('[FCM] Auth token changed (account switch detected) — resetting send flag');
            console.log('[FCM]   previous:', (lastSentForAuthTokenRef.current || '').substring(0, 20) + '...');
            console.log('[FCM]   new:     ', authToken.substring(0, 20) + '...');
            tokenSentSuccessfullyRef.current = false;
            tokenSendingInProgressRef.current = false;
        }

        // Проверяем, был ли токен уже успешно отправлен или отправляется прямо сейчас
        if (tokenSentSuccessfullyRef.current) {
            console.log('[FCM] Token already sent successfully for this auth token, skipping...');
            return;
        }
        if (tokenSendingInProgressRef.current) {
            console.log('[FCM] Token send already in progress, skipping...');
            return;
        }

        // Проверяем, есть ли FCM токен
        if (!fcmToken || fcmToken.trim() === '') {
            console.warn('[FCM] FCM token is empty - notifications permission might be denied');
            return;
        }

        tokenSendingInProgressRef.current = true;

        try {
            // Используем правильный URL как в Android
            const apiUrl = 'https://workflow-back-zpk4.onrender.com/api/fcm/token';
            
            // Генерируем deviceId (используем часть FCM токена, как в Android)
            const deviceId = fcmToken.substring(0, 20);

            // Формат запроса должен совпадать с Android версией
            const requestBody = {
                token: fcmToken,
                authToken: authToken,
                platform: 'ios',
                deviceId: deviceId,
            };

            console.log('[FCM] Sending FCM token to server...');
            console.log('[FCM] URL:', apiUrl);
            console.log('[FCM] FCM token:', fcmToken.substring(0, 20) + '...');
            console.log('[FCM] Auth token (first 20 chars):', authToken.substring(0, 20) + '...');
            console.log('[FCM] Platform: ios');
            console.log('[FCM] Device ID:', deviceId);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify(requestBody),
            });

            const responseCode = response.status;
            console.log('[FCM] HTTP status:', responseCode);

            if (response.ok || responseCode === 201) {
                console.log('[FCM] FCM token sent successfully for auth:', authToken.substring(0, 20) + '...');
                tokenSentSuccessfullyRef.current = true;
                tokenSendingInProgressRef.current = false;
                lastSentForAuthTokenRef.current = authToken;

                // Уведомляем WebView о успехе (как в Android)
                if (webviewRef.current) {
                    const script = `
                        if (window.onFCMTokenSent) {
                            window.onFCMTokenSent({
                                success: true,
                                code: ${responseCode}
                            });
                        }
                    `;
                    webviewRef.current.injectJavaScript(script);
                }
            } else {
                tokenSendingInProgressRef.current = false;
                const errorText = await response.text().catch(() => 'No error details');
                console.error('[FCM] Failed to send FCM token. Response code:', responseCode, 'Error:', errorText);

                // Уведомляем WebView об ошибке (как в Android)
                if (webviewRef.current) {
                    const errorJson = JSON.stringify({
                        success: false,
                        code: responseCode,
                        error: errorText.substring(0, 200), // Ограничиваем длину
                    });
                    const script = `
                        if (window.onFCMTokenSent) {
                            window.onFCMTokenSent(${errorJson});
                        }
                    `;
                    webviewRef.current.injectJavaScript(script);
                }
            }
        } catch (error: any) {
            tokenSendingInProgressRef.current = false;
            console.error('[FCM] Error sending FCM token to server:', error);

            // Уведомляем WebView об ошибке (как в Android)
            if (webviewRef.current) {
                const errorJson = JSON.stringify({
                    success: false,
                    error: error?.message || 'Unknown error',
                });
                const script = `
                    if (window.onFCMTokenSent) {
                        window.onFCMTokenSent(${errorJson});
                    }
                `;
                webviewRef.current.injectJavaScript(script);
            }
        }
    };

    // Обработчики разрешений (для React Native WebView на iOS — через нативный LocationPermissionModule)
    const handlePermissionCheck = async (data: any) => {
        const { permission, callback } = data;
        const cb = callback || 'onPermissionStatusChecked';

        if (Platform.OS === 'ios' && permission === 'location') {
            try {
                const { NativeModules } = require('react-native');
                const LocationModule = NativeModules?.LocationPermissionModule;
                if (LocationModule?.getLocationPermissionStatus) {
                    const status = await LocationModule.getLocationPermissionStatus();
                    const script = `
                        if (window.FCM && window.FCM['${cb}']) {
                            window.FCM['${cb}']('${status}');
                        }
                    `;
                    webviewRef.current?.injectJavaScript(script);
                    return;
                }
            } catch (e) {
                console.warn('[PERMISSION] getLocationPermissionStatus error:', e);
            }
        }

        if (Platform.OS === 'ios' && permission === 'camera') {
            try {
                const { NativeModules } = require('react-native');
                const CameraModule = NativeModules?.CameraPermissionModule;
                if (CameraModule?.getCameraPermissionStatus) {
                    const status = await CameraModule.getCameraPermissionStatus();
                    const script = `
                        if (window.FCM && window.FCM['${cb}']) {
                            window.FCM['${cb}']('${status}');
                        }
                    `;
                    webviewRef.current?.injectJavaScript(script);
                    return;
                }
            } catch (e) {
                console.warn('[PERMISSION] getCameraPermissionStatus error:', e);
            }
        }

        // Датчики движения (Activity Tracker): на iOS отдельного системного разрешения нет, разрешаем
        if (Platform.OS === 'ios' && permission === 'motion') {
            const script = `
                if (window.FCM && window.FCM['${cb}']) {
                    window.FCM['${cb}']('granted');
                }
            `;
            webviewRef.current?.injectJavaScript(script);
            return;
        }

        const status = 'unknown';
        const script = `
            if (window.FCM && window.FCM['${cb}']) {
                window.FCM['${cb}']('${status}');
            }
        `;
        webviewRef.current?.injectJavaScript(script);
    };

    /** Показывает алерт «Перейдите в Настройки» для указанного разрешения (с debounce) */
    const settingsAlertShownAtRef = useRef<number>(0);
    const showOpenSettingsAlert = (permissionName: string) => {
        const now = Date.now();
        // Не показываем повторно, если алерт уже был показан менее 2 секунд назад
        if (now - settingsAlertShownAtRef.current < 2000) {
            console.log('[PERMISSION] Алерт «Открыть Настройки» уже показан, пропускаем дубликат');
            return;
        }
        settingsAlertShownAtRef.current = now;

        Alert.alert(
            `Доступ к ${permissionName} запрещён`,
            `Вы ранее запретили доступ к ${permissionName}. Чтобы включить его, перейдите в Настройки приложения.`,
            [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Открыть Настройки', onPress: () => Linking.openSettings() },
            ]
        );
    };

    const handlePermissionRequest = async (data: any) => {
        const { permission } = data;

        if (Platform.OS === 'ios' && permission === 'location') {
            try {
                const { NativeModules } = require('react-native');
                const LocationModule = NativeModules?.LocationPermissionModule;
                if (LocationModule?.getLocationPermissionStatus && LocationModule?.requestLocationPermission) {
                    // Сначала проверяем текущий статус
                    const currentStatus = await LocationModule.getLocationPermissionStatus();
                    console.log('[PERMISSION] handlePermissionRequest: текущий статус геолокации:', currentStatus);

                    if (currentStatus === 'denied') {
                        // Уже запрещено — iOS не покажет диалог повторно, направляем в Настройки
                        console.log('[PERMISSION] Статус denied — показываем алерт «Открыть Настройки»');
                        showOpenSettingsAlert('геолокации');
                        const eventData = JSON.stringify({ type: 'location', granted: false });
                        const script = `
                            if (typeof window.onAndroidEvent === 'function') {
                                window.onAndroidEvent('permission', ${eventData});
                            }
                        `;
                        webviewRef.current?.injectJavaScript(script);
                        return;
                    }

                    // Статус notDetermined — покажем системный диалог
                    const granted = await LocationModule.requestLocationPermission();
                    const eventData = JSON.stringify({ type: 'location', granted });
                    const script = `
                        if (typeof window.onAndroidEvent === 'function') {
                            window.onAndroidEvent('permission', ${eventData});
                        }
                    `;
                    webviewRef.current?.injectJavaScript(script);
                    return;
                }
            } catch (e) {
                console.warn('[PERMISSION] requestLocationPermission error:', e);
                const script = `
                    if (typeof window.onAndroidEvent === 'function') {
                        window.onAndroidEvent('permission', {"type":"location","granted":false});
                    }
                `;
                webviewRef.current?.injectJavaScript(script);
            }
            return;
        }

        if (Platform.OS === 'ios' && permission === 'camera') {
            try {
                const { NativeModules } = require('react-native');
                const CameraModule = NativeModules?.CameraPermissionModule;
                if (CameraModule?.getCameraPermissionStatus && CameraModule?.requestCameraPermission) {
                    const currentStatus = await CameraModule.getCameraPermissionStatus();
                    console.log('[PERMISSION] handlePermissionRequest: текущий статус камеры:', currentStatus);

                    if (currentStatus === 'denied') {
                        showOpenSettingsAlert('камере');
                        const eventData = JSON.stringify({ type: 'camera', granted: false });
                        webviewRef.current?.injectJavaScript(
                            `if (typeof window.onAndroidEvent === 'function') { window.onAndroidEvent('permission', ${eventData}); }`
                        );
                        return;
                    }
                    if (currentStatus === 'granted') {
                        const eventData = JSON.stringify({ type: 'camera', granted: true });
                        webviewRef.current?.injectJavaScript(
                            `if (typeof window.onAndroidEvent === 'function') { window.onAndroidEvent('permission', ${eventData}); }`
                        );
                        return;
                    }
                    const granted = await CameraModule.requestCameraPermission();
                    const eventData = JSON.stringify({ type: 'camera', granted });
                    webviewRef.current?.injectJavaScript(
                        `if (typeof window.onAndroidEvent === 'function') { window.onAndroidEvent('permission', ${eventData}); }`
                    );
                    return;
                }
            } catch (e) {
                console.warn('[PERMISSION] requestCameraPermission error:', e);
            }
            showOpenSettingsAlert('камере');
            return;
        }

        // Датчики движения (Activity Tracker): на iOS отдельного системного разрешения нет
        if (Platform.OS === 'ios' && permission === 'motion') {
            const eventData = JSON.stringify({ type: 'motion', granted: true });
            webviewRef.current?.injectJavaScript(
                `if (typeof window.onAndroidEvent === 'function') { window.onAndroidEvent('permission', ${eventData}); }`
            );
            return;
        }

        console.log(`[PERMISSION] Requesting ${permission} permission (no native handler)`);
    };
    
    const handleLocationEnabledCheck = () => {
        if (Platform.OS === 'ios') {
            const script = `
                if (window.FCM && window.FCM.onLocationEnabledCheck) {
                    window.FCM.onLocationEnabledCheck(true);
                }
            `;
            webviewRef.current?.injectJavaScript(script);
        }
    };

    // Перехват запроса геолокации (iframe с путём) — в контексте жеста пользователя (iOS)
    const onShouldStartLoadWithRequest = (request: { url: string }) => {
        const url = request?.url || '';
        if (Platform.OS === 'ios' && (url.includes('__requestLocationPermission__') || url.includes('__request_location__'))) {
            console.log('[PERMISSION] onShouldStartLoadWithRequest: перехват запроса геолокации', url);
            requestLocationPermissionNative();
            return false;
        }
        return true;
    };

    const requestLocationPermissionNative = async () => {
        if (Platform.OS !== 'ios') return;
        const { NativeModules } = require('react-native');
        const LocationModule = NativeModules?.LocationPermissionModule;
        if (!LocationModule?.requestLocationPermission) {
            console.warn('[PERMISSION] LocationPermissionModule.requestLocationPermission не найден');
            return;
        }

        try {
            // Сначала проверяем текущий статус — если уже denied, сразу показываем алерт
            if (LocationModule?.getLocationPermissionStatus) {
                const currentStatus = await LocationModule.getLocationPermissionStatus();
                console.log('[PERMISSION] requestLocationPermissionNative: текущий статус:', currentStatus);

                if (currentStatus === 'denied') {
                    console.log('[PERMISSION] Статус denied — показываем алерт «Открыть Настройки»');
                    showOpenSettingsAlert('геолокации');
                    const eventData = JSON.stringify({ type: 'location', granted: false });
                    const script = `
                        if (typeof window.onAndroidEvent === 'function') {
                            window.onAndroidEvent('permission', ${eventData});
                        }
                    `;
                    webviewRef.current?.injectJavaScript(script);
                    return;
                }
            }

            // Статус notDetermined — запрашиваем системный диалог
            console.log('[PERMISSION] Вызов LocationPermissionModule.requestLocationPermission()');
            const granted = await LocationModule.requestLocationPermission();
            console.log('[PERMISSION] Разрешение геолокации:', granted ? 'granted' : 'denied');

            const eventData = JSON.stringify({ type: 'location', granted });
            const script = `
                if (typeof window.onAndroidEvent === 'function') {
                    window.onAndroidEvent('permission', ${eventData});
                }
            `;
            webviewRef.current?.injectJavaScript(script);
        } catch (e: any) {
            console.warn('[PERMISSION] requestLocationPermission error:', e);
            const script = `
                if (typeof window.onAndroidEvent === 'function') {
                    window.onAndroidEvent('permission', {"type":"location","granted":false});
                }
            `;
            webviewRef.current?.injectJavaScript(script);
        }
    };

    const onWebViewMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            // === ДИАГНОСТИКА: логируем ВСЕ сообщения от WebView ===
            console.log('[WEBVIEW MSG]', data.type, data.type === 'authAndFCMTokens' ? `auth:${(data.authToken||'').substring(0,15)}... fcm:${(data.fcmToken||'').substring(0,15)}... success:${data.success}` : '');
            
            if (data.type === 'requestPermission' || data.type === 'checkPermissionStatus') {
                console.log('[PERMISSION] WebView message:', data.type, data.permission || '');
            }

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
                        console.log('[FCM] authAndFCMTokens received, auth:', authToken.substring(0, 20) + '...');
                        setFcmToken(webviewFcmToken);

                        // sendTokensToServer сама детектит смену аккаунта через
                        // lastSentForAuthTokenRef и сбрасывает флаги
                        sendTokensToServer(webviewFcmToken, authToken);
                        
                        // Сохраняем auth token в натив (iOS: UserDefaults → sendFCMTokenToServer)
                        if (Platform.OS === 'ios') {
                            const { NativeModules } = require('react-native');
                            const bridge = NativeModules?.PushNotificationBridge;
                            if (bridge?.saveAuthToken) {
                                bridge.saveAuthToken(authToken).catch(() => {});
                            }
                        }
                    } else {
                        setFcmToken(webviewFcmToken);
                        console.log('[FCM] User not logged in, FCM token saved for later');
                    }
                    break;
                case 'authTokenSaved':
                    // Фронт (ios-bridge) уведомил о сохранении auth — передаём в натив для отправки FCM
                    const { token: savedToken } = data;
                    if (savedToken && Platform.OS === 'ios') {
                        // Детектим смену аккаунта: если auth‑токен изменился — сбрасываем FCM‑флаги
                        if (lastAuthTokenRef.current && lastAuthTokenRef.current !== savedToken) {
                            console.log('[FCM] authTokenSaved: account changed — resetting FCM flags');
                            tokenSentSuccessfullyRef.current = false;
                            tokenSendingInProgressRef.current = false;
                        }
                        lastAuthTokenRef.current = savedToken;

                        const { NativeModules } = require('react-native');
                        const bridge = NativeModules?.PushNotificationBridge;
                        if (bridge?.saveAuthToken) {
                            bridge.saveAuthToken(savedToken).catch(() => {});
                        }

                        // Переотправляем FCM‑токен на сервер с новым auth‑токеном
                        if (fcmToken && !tokenSentSuccessfullyRef.current) {
                            console.log('[FCM] authTokenSaved: re-sending FCM token with new auth');
                            sendTokensToServer(fcmToken, savedToken);
                        }
                    }
                    break;
                case 'accountChanged':
                    // ios-bridge явно уведомил о смене аккаунта — гарантируем перерегистрацию FCM
                    const { token: changedToken } = data;
                    console.log('[FCM] Account changed signal received, auth:', changedToken ? changedToken.substring(0, 20) + '...' : 'NULL');
                    tokenSentSuccessfullyRef.current = false;
                    tokenSendingInProgressRef.current = false;
                    lastSentForAuthTokenRef.current = null;
                    lastAuthTokenRef.current = changedToken || null;

                    if (changedToken && Platform.OS === 'ios') {
                        const { NativeModules } = require('react-native');
                        const bridge2 = NativeModules?.PushNotificationBridge;
                        if (bridge2?.saveAuthToken) {
                            bridge2.saveAuthToken(changedToken).catch(() => {});
                        }
                        // Переотправляем FCM токен (пробуем state, потом native)
                        if (fcmToken) {
                            sendTokensToServer(fcmToken, changedToken);
                        } else if (bridge2?.getFCMToken) {
                            bridge2.getFCMToken()
                                .then((nativeToken: string) => {
                                    if (nativeToken) {
                                        setFcmToken(nativeToken);
                                        sendTokensToServer(nativeToken, changedToken);
                                    }
                                })
                                .catch(() => {});
                        }
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
                    // Пользователь залогинился — отправляем FCM токен на сервер
                    // ТОЛЬКО через React Native sendTokensToServer (один путь).
                    // НЕ вызываем bridge.saveAuthToken здесь — он дублирует отправку через нативный sendFCMTokenToServer.
                    const { authToken: loginAuthToken, success: loginSuccess } = data;
                    console.log('[FCM] userLoggedIn received, auth:', loginAuthToken ? loginAuthToken.substring(0, 20) + '...' : 'NULL', 'fcmToken state:', fcmToken ? 'EXISTS' : 'NULL');
                    
                    if (loginSuccess && loginAuthToken) {
                        lastAuthTokenRef.current = loginAuthToken;

                        if (fcmToken) {
                            console.log('[FCM] userLoggedIn: sending FCM with fcmToken from state');
                            sendTokensToServer(fcmToken, loginAuthToken);
                        } else if (Platform.OS === 'ios') {
                            // fcmToken state ещё null — получаем из натива
                            console.log('[FCM] userLoggedIn: fcmToken state is null, trying native PushNotificationBridge.getFCMToken');
                            const { NativeModules } = require('react-native');
                            const bridge = NativeModules?.PushNotificationBridge;
                            if (bridge?.getFCMToken) {
                                bridge.getFCMToken()
                                    .then((nativeToken: string) => {
                                        console.log('[FCM] Got FCM token from native:', nativeToken ? nativeToken.substring(0, 20) + '...' : 'NULL');
                                        if (nativeToken) {
                                            setFcmToken(nativeToken);
                                            sendTokensToServer(nativeToken, loginAuthToken);
                                        }
                                    })
                                    .catch(() => {
                                        console.log('[FCM] Failed to get FCM from native, calling callFCMInitialization');
                                        callFCMInitialization();
                                    });
                            } else {
                                callFCMInitialization();
                            }
                        } else {
                            callFCMInitialization();
                        }
                    }
                    break;
                case 'userLoggedOut':
                    // Пользователь вышел из аккаунта — сбрасываем все FCM флаги
                    console.log('[FCM] User logged out - resetting ALL FCM flags');
                    tokenSentSuccessfullyRef.current = false;
                    tokenSendingInProgressRef.current = false;
                    lastSentForAuthTokenRef.current = null;
                    lastAuthTokenRef.current = null;
                    
                    // Очищаем auth token в нативной части (iOS UserDefaults)
                    if (Platform.OS === 'ios') {
                        const { NativeModules } = require('react-native');
                        const bridge = NativeModules?.PushNotificationBridge;
                        if (bridge?.saveAuthToken) {
                            bridge.saveAuthToken('').catch(() => {});
                        }
                    }
                    break;
                case 'testPushNotification':
                    // Test push notification requested but disabled - use terminal for testing
                    break;
                case 'initializePushNotifications':
                    // Инициализация push-уведомлений после логина.
                    // Разрешение уже запрашивается нативно при запуске (один диалог),
                    // не показываем второй диалог на русском — только инициализируем FCM.
                    callFCMInitialization();
                    break;
                case 'openWhatsApp':
                    // Обработка WhatsApp deep links от WebView
                    const { url: whatsappUrl } = data;
                    console.log('📱 [WHATSAPP] Получен запрос на открытие WhatsApp:', whatsappUrl);
                    
                    if (whatsappUrl) {
                        // Проверяем, что URL корректный
                        if (!whatsappUrl.startsWith('whatsapp://') && !whatsappUrl.startsWith('https://wa.me/')) {
                            console.error('❌ [WHATSAPP] Неверный WhatsApp URL:', whatsappUrl);
                            Alert.alert('Ошибка', 'Неверная ссылка WhatsApp');
                            return;
                        }
                        
                        // Пытаемся открыть WhatsApp
                        Linking.canOpenURL(whatsappUrl).then(supported => {
                            if (supported) {
                                return Linking.openURL(whatsappUrl);
                            } else {
                                console.error('❌ [WHATSAPP] WhatsApp не установлен или URL не поддерживается');
                                Alert.alert(
                                    'WhatsApp не установлен',
                                    'WhatsApp не установлен на этом устройстве. Вы можете:\n\n1. Установить WhatsApp из App Store\n2. Скопировать ссылку и поделиться вручную',
                                    [
                                        { text: 'Скопировать ссылку', onPress: () => {
                                            // Копируем ссылку в буфер обмена
                                            const Clipboard = require('@react-native-clipboard/clipboard').default;
                                            Clipboard.setString(whatsappUrl);
                                            Alert.alert('Скопировано', 'Ссылка скопирована в буфер обмена');
                                        }},
                                        { text: 'OK', style: 'cancel' }
                                    ]
                                );
                            }
                        }).catch(err => {
                            console.error('❌ [WHATSAPP] Ошибка проверки WhatsApp:', err);
                            Alert.alert(
                                'Ошибка',
                                'Не удалось открыть WhatsApp. Убедитесь, что приложение установлено.',
                                [{ text: 'OK' }]
                            );
                        });
                    }
                    break;
                case 'startMotionUpdates':
                    if (Platform.OS === 'ios') {
                        const MotionBridge = NativeModules?.MotionBridge;
                        if (MotionBridge?.startMotionUpdates) {
                            MotionBridge.startMotionUpdates();
                            console.log('[PERMISSION] Motion updates started (Activity Tracker)');
                        }
                    }
                    break;
                case 'stopMotionUpdates':
                    if (Platform.OS === 'ios') {
                        const MotionBridge = NativeModules?.MotionBridge;
                        if (MotionBridge?.stopMotionUpdates) {
                            MotionBridge.stopMotionUpdates();
                            console.log('[PERMISSION] Motion updates stopped');
                        }
                    }
                    break;
                case 'startBackgroundTracking':
                    // Фоновый режим для Activity Tracker (геолокация уже запрашивается отдельно)
                    if (Platform.OS === 'ios') {
                        console.log('[PERMISSION] Background tracking requested (Activity Tracker)');
                    }
                    break;
                case 'stopBackgroundTracking':
                    break;
                case 'checkPermissionStatus':
                    // Обработка запроса статуса разрешения
                    handlePermissionCheck(data);
                    break;
                case 'requestPermission': {
                    const { permission } = data;
                    console.log('[PERMISSION] postMessage requestPermission:', permission);
                    // На iOS геолокация уже запрашивается через iframe → onShouldStartLoadWithRequest
                    if (permission === 'location' && Platform.OS === 'ios') {
                        // Не вызываем нативный модуль здесь — перехват URL вызовет его один раз
                        break;
                    }
                    handlePermissionRequest(data);
                    break;
                }
                case 'isLocationEnabled':
                    // Обработка запроса статуса GPS
                    handleLocationEnabledCheck();
                    break;
                case 'saveFile':
                    // Скачивание файла в приложении (шаблон, отчёты Excel/Power BI)
                    const { filename, base64Data, mimeType } = data;
                    if (filename && base64Data && Platform.OS === 'ios') {
                        const { NativeModules } = require('react-native');
                        const FileBridge = NativeModules?.FileDownloadBridge;
                        if (FileBridge?.saveFileBase64) {
                            FileBridge.saveFileBase64(filename, base64Data, mimeType || 'application/octet-stream')
                                .then(() => {})
                                .catch((err: any) => console.warn('[SAVEFILE] Error:', err));
                        }
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
        
        // iOS Permission Bridge - работает аналогично Android
        (function() {
            if (!window.FCM) {
                window.FCM = {};
            }
            
            // Проверка статуса разрешения
            window.FCM.checkPermissionStatus = function(permission, callback) {
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                    // Нативный WKWebView
                    window.webkit.messageHandlers.permissionBridge.postMessage({
                        action: 'checkPermissionStatus',
                        permission: permission,
                        callback: callback || 'onPermissionStatusChecked'
                    });
                } else if (window.ReactNativeWebView) {
                    // React Native WebView
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'checkPermissionStatus',
                        permission: permission,
                        callback: callback || 'onPermissionStatusChecked'
                    }));
                } else {
                    // Fallback для веба
                    if (permission === 'notifications' && 'Notification' in window) {
                        const status = Notification.permission;
                        if (callback && window.FCM[callback]) {
                            window.FCM[callback](status);
                        }
                    }
                }
            };
            
            // Запрос разрешения
            window.FCM.requestPermission = function(permission) {
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                    // Нативный WKWebView
                    window.webkit.messageHandlers.permissionBridge.postMessage({
                        action: 'requestPermission',
                        permission: permission
                    });
                } else if (window.ReactNativeWebView) {
                    // Геолокация: загрузка кастомного URL в контексте жеста пользователя,
                    // чтобы iOS показал системный диалог разрешения
                    if (permission === 'location') {
                        try {
                            var iframe = document.createElement('iframe');
                            iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
                            iframe.src = 'https://workflow-service-front.vercel.app/__request_location__';
                            document.body.appendChild(iframe);
                            setTimeout(function() { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 300);
                        } catch (e) {}
                    }
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'requestPermission',
                        permission: permission
                    }));
                } else {
                    // Fallback для веба
                    if (permission === 'notifications' && 'Notification' in window) {
                        Notification.requestPermission();
                    }
                }
            };
            
            // Проверка включенности GPS
            window.FCM.isLocationEnabled = function() {
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.permissionBridge) {
                    window.webkit.messageHandlers.permissionBridge.postMessage({
                        action: 'isLocationEnabled'
                    });
                } else if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'isLocationEnabled'
                    }));
                }
                return false; // По умолчанию, реальное значение придет через callback
            };
            
            // Callbacks
            window.FCM.onPermissionStatusChecked = function(status) {
                console.log('[PERMISSION] Status checked:', status);
            };
            
            window.FCM.onLocationEnabledCheck = function(enabled) {
                console.log('[PERMISSION] Location enabled:', enabled);
            };
            
            // Activity Tracker: датчики движения (CoreMotion) — в React Native WebView через postMessage
            window.FCM.startMotionUpdates = function() {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'startMotionUpdates' }));
                }
            };
            window.FCM.stopMotionUpdates = function() {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopMotionUpdates' }));
                }
            };
            window.FCM.startBackgroundTracking = function() {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'startBackgroundTracking' }));
                }
            };
            window.FCM.stopBackgroundTracking = function() {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'stopBackgroundTracking' }));
                }
            };
            
            // Обработчик событий от нативного кода (аналогично Android)
            if (!window.onAndroidEvent) {
                window.onAndroidEvent = function(event, data) {
                    console.log('[PERMISSION] Event received:', event, data);
                    try {
                        var eventData = typeof data === 'string' ? JSON.parse(data) : data;
                        if (event === 'permission') {
                            var status = eventData.granted ? 'granted' : 'denied';
                            console.log('[PERMISSION] ' + eventData.type + ': ' + status);
                        }
                    } catch (e) {
                        console.error('[PERMISSION] Error parsing event data:', e);
                    }
                };
            }
            
            console.log('✅ iOS Permission Bridge initialized');
        })();

        // Функция для отправки сохраненного токена на сервер (как в Android)
        window.FCM.sendStoredTokenToServer = function() {
            console.log('[FCM] sendStoredTokenToServer called');
            
            // Получаем auth token из localStorage
            var authToken = null;
            var authStorage = localStorage.getItem('auth-storage');
            
            if (authStorage) {
                try {
                    var authData = JSON.parse(authStorage);
                    authToken = authData.state?.token || authData.token || null;
                } catch (e) {
                    console.error('[FCM] Error parsing auth-storage:', e);
                }
            }
            
            if (!authToken) {
                authToken = localStorage.getItem('token') || 
                           localStorage.getItem('authToken') || 
                           localStorage.getItem('accessToken') || 
                           sessionStorage.getItem('token') || null;
            }
            
            // Получаем FCM токен (должен быть сохранен ранее)
            var fcmToken = null;
            if (window.ReactNativeWebView) {
                // Запрашиваем FCM токен у React Native
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'getFCMToken'
                }));
                
                // FCM токен придет через receiveFCMToken callback
                // Сохраняем authToken для последующей отправки
                if (authToken) {
                    localStorage.setItem('pendingAuthToken', authToken);
                }
            }
        };
        
        // Функция для проверки токена после получения разрешения (как в Android)
        window.FCM.checkTokenAfterPermission = function() {
            console.log('[FCM] checkTokenAfterPermission called');
            
            // Проверяем, есть ли auth token
            var authToken = null;
            var authStorage = localStorage.getItem('auth-storage');
            
            if (authStorage) {
                try {
                    var authData = JSON.parse(authStorage);
                    authToken = authData.state?.token || authData.token || null;
                } catch (e) {
                    console.error('[FCM] Error parsing auth-storage:', e);
                }
            }
            
            if (!authToken) {
                authToken = localStorage.getItem('token') || 
                           localStorage.getItem('authToken') || 
                           localStorage.getItem('accessToken') || 
                           sessionStorage.getItem('token') || null;
            }
            
            if (authToken) {
                // Пользователь залогинен, отправляем FCM токен
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'getFCMToken'
                    }));
                }
            } else {
                console.log('[FCM] User not logged in, FCM token will be sent after login');
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

        // === Единый механизм обнаружения логина (с debounce) ===
        var _loginCheckTimer = null;
        window._lastAuthToken = null; // Запоминаем последний отправленный auth token
        
        window._scheduleLoginCheck = function() {
            if (_loginCheckTimer) clearTimeout(_loginCheckTimer);
            _loginCheckTimer = setTimeout(function() {
                var authStorage = localStorage.getItem('auth-storage');
                var currentToken = null;
                
                if (authStorage) {
                    try {
                        var authData = JSON.parse(authStorage);
                        currentToken = authData.state?.token || authData.token || null;
                    } catch (e) {}
                }
                if (!currentToken) {
                    currentToken = localStorage.getItem('token') || 
                                  localStorage.getItem('authToken') || 
                                  localStorage.getItem('accessToken') ||
                                  sessionStorage.getItem('token');
                }
                
                if (currentToken) {
                    // Проверяем: новый логин ИЛИ смена аккаунта (другой токен)
                    if (!window.loginDetected || currentToken !== window._lastAuthToken) {
                        if (window.loginDetected && currentToken !== window._lastAuthToken) {
                            console.log('[FCM] Account changed - resending FCM token');
                            // Уведомляем React Native о смене аккаунта
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'userLoggedOut'
                                }));
                            }
                        }
                        window.loginDetected = true;
                        window._lastAuthToken = currentToken;
                        // Даём время на сброс флагов после userLoggedOut
                        setTimeout(function() {
                            window.checkTokenAfterLogin();
                        }, 300);
                    }
                }
            }, 1000);
        };

        // Проверка при загрузке (одноразово через 3 секунды)
        setTimeout(function() { window._scheduleLoginCheck(); }, 3000);

        // Мониторинг изменений localStorage для обнаружения логина
        var originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
            originalSetItem.apply(this, arguments);
            if (key === 'auth-storage' || key === 'token' || key === 'authToken' || key === 'accessToken') {
                window._scheduleLoginCheck();
            }
        };

        // Также мониторим sessionStorage
        var originalSessionSetItem = sessionStorage.setItem;
        sessionStorage.setItem = function(key, value) {
            originalSessionSetItem.apply(this, arguments);
            if (key === 'token' || key === 'authToken' || key === 'accessToken') {
                window._scheduleLoginCheck();
            }
        };

        // Мониторинг logout — сброс флагов при выходе из аккаунта
        var originalRemoveItem = localStorage.removeItem;
        localStorage.removeItem = function(key) {
            originalRemoveItem.apply(this, arguments);
            if (key === 'auth-storage' || key === 'token' || key === 'authToken' || key === 'accessToken') {
                console.log('[FCM] Auth token removed - user logged out');
                window.loginDetected = false;
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'userLoggedOut'
                    }));
                }
            }
        };

        var originalClear = localStorage.clear;
        localStorage.clear = function() {
            originalClear.apply(this, arguments);
            console.log('[FCM] localStorage cleared - user logged out');
            window.loginDetected = false;
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'userLoggedOut'
                }));
            }
        };

        // Периодическая проверка (каждые 5 секунд в течение 30 секунд)
        var checkInterval = setInterval(function() {
            window._scheduleLoginCheck();
        }, 5000);
        setTimeout(function() { clearInterval(checkInterval); }, 30000);

        // Обработка WhatsApp ссылок
        window.openWhatsApp = function(url) {
            console.log('📱 [WHATSAPP] Открытие WhatsApp:', url);
            
            // Проверяем, что URL корректный
            if (!url || (!url.startsWith('whatsapp://') && !url.startsWith('https://wa.me/'))) {
                console.error('❌ [WHATSAPP] Неверный WhatsApp URL:', url);
                alert('Неверная ссылка WhatsApp');
                return;
            }
            
            // Для React Native WebView используем специальную обработку
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'openWhatsApp',
                    url: url
                }));
            } else {
                // Для обычных браузеров
                try {
                    window.location.href = url;
                } catch (error) {
                    console.error('❌ [WHATSAPP] Ошибка открытия WhatsApp:', error);
                    alert('Не удалось открыть WhatsApp. Убедитесь, что приложение установлено.');
                }
            }
        };
        
        // Перехват кликов по WhatsApp ссылкам
        document.addEventListener('click', function(event) {
            const target = event.target;
            const link = target.closest('a[href*="whatsapp://"], a[href*="wa.me/"]');
            
            if (link) {
                event.preventDefault();
                const href = link.getAttribute('href');
                console.log('📱 [WHATSAPP] Перехвачен клик по WhatsApp ссылке:', href);
                window.openWhatsApp(href);
            }
        }, true);

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
                source={{ uri: 'https://workflow-service-front.vercel.app' }}
                onLoadEnd={() => { setLoading(false); setNetworkError(false); }}
                onError={() => {
                    if (Platform.OS === 'ios') {
                        setLoading(false);
                        setNetworkError(true);
                    }
                }}
                onHttpError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    if (Platform.OS === 'ios' && nativeEvent.statusCode >= 400) {
                        setLoading(false);
                        setNetworkError(true);
                    }
                }}
                startInLoadingState={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                onMessage={onWebViewMessage}
                injectedJavaScript={injectedJavaScript}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
                renderError={Platform.OS === 'ios' ? () => (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorTitle}>Нет подключения к интернету</Text>
                        <Text style={styles.errorText}>Проверьте соединение и попробуйте снова</Text>
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={() => {
                                setLoading(true);
                                setNetworkError(false);
                                webviewRef.current?.reload();
                            }}
                        >
                            <Text style={styles.retryButtonText}>Повторить попытку</Text>
                        </TouchableOpacity>
                    </View>
                ) : undefined}
            />
            {networkError && Platform.OS === 'ios' ? (
                <View style={[styles.errorContainer, styles.errorOverlay]}>
                    <Text style={styles.errorTitle}>Нет подключения к интернету</Text>
                    <Text style={styles.errorText}>Проверьте соединение и попробуйте снова</Text>
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => {
                            setNetworkError(false);
                            setLoading(true);
                            webviewRef.current?.reload();
                        }}
                    >
                        <Text style={styles.retryButtonText}>Повторить попытку</Text>
                    </TouchableOpacity>
                </View>
            ) : null}
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
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#f5f5f5',
    },
    errorOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
        textAlign: 'center',
    },
    errorText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 24,
        textAlign: 'center',
    },
    retryButton: {
        backgroundColor: '#007aff',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
