import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { ViewPreferenceProvider } from '@/hooks/use-view-preference';
import { ToastProvider } from '@/hooks/use-toast';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated !== null) SplashScreen.hideAsync();
  }, [isAuthenticated]);

  if (isAuthenticated === null) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="index" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <ViewPreferenceProvider>
          <ToastProvider>
            <RootNavigator />
          </ToastProvider>
        </ViewPreferenceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
