import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/hooks/use-auth';
import { Navigation } from './src/navigation';
import { appFonts, configureDefaultTypography } from './src/constants/typography';

export default function App() {
  const [fontsLoaded] = useFonts(appFonts);

  useEffect(() => {
    if (fontsLoaded) configureDefaultTypography();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
