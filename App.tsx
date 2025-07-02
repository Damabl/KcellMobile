// App.js
import React from 'react'
import { SafeAreaView, StyleSheet, Platform } from 'react-native'
import { WebView } from 'react-native-webview'

export default function App() {
    return (
        <SafeAreaView style={styles.container}>
            <WebView
                source={{ uri: 'https://kcell-service.vercel.app' }}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                originWhitelist={['*']}
                onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent
                    console.warn('WebView error: ', nativeEvent)
                }}
            />
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginTop: Platform.OS === 'android' ? 25 : 0,
    },
    webview: {
        flex: 1,
    },
})
