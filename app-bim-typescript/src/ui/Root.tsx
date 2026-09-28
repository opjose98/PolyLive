// =============================================================================
// Root.tsx — Proveedores globales de la app
// =============================================================================
//
// Gestos (gesture-handler), safe-area, fuentes Roboto y el host de toasts.
// Todo lo que se monte debajo puede usar las primitivas de `ui/primitives`.
// =============================================================================

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { fontAssets } from './design/typography';
import { colors } from './design/tokens';
import { ToastHost } from './primitives';
import App from './App';

export default function Root() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        {/* Si las fuentes fallan se sigue con la del sistema: no es motivo para no arrancar. */}
        {fontsLoaded || fontError ? <App /> : <View style={styles.splash} />}
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  splash: { flex: 1, backgroundColor: colors.surface },
});
