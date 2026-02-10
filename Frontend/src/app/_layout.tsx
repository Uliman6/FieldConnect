import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text, Alert, Platform } from 'react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAuthStore } from '@/lib/auth-store';
import { DataProvider, useDataProvider } from '@/lib/data-provider';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

// Initialize Sentry for crash reporting
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Capture 100% of transactions for performance monitoring in beta
  tracesSampleRate: 1.0,
  // Only enable in production builds
  enabled: !__DEV__,
  debug: false,
});

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Check for OTA updates
function useOTAUpdates() {
  useEffect(() => {
    // Skip on web platform
    if (Platform.OS === 'web') return;

    async function checkForUpdates() {
      try {
        // Check if updates are enabled
        if (!Updates.isEnabled) {
          console.log('[updates] Updates are disabled (dev build or not configured)');
          return;
        }

        console.log('[updates] Checking for updates...');
        console.log('[updates] Channel:', Updates.channel);
        console.log('[updates] Runtime version:', Updates.runtimeVersion);

        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          console.log('[updates] Update available, downloading...');
          await Updates.fetchUpdateAsync();

          Alert.alert(
            'Update Available',
            'A new version has been downloaded. Restart to apply the update.',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Restart Now',
                onPress: () => Updates.reloadAsync()
              },
            ]
          );
        } else {
          console.log('[updates] App is up to date');
        }
      } catch (error: any) {
        console.log('[updates] Error checking for updates:', error?.message || error);
        // In production, silently fail. In dev, you can uncomment to debug:
        // Alert.alert('Update Check Failed', error?.message || 'Unknown error');
      }
    }

    // Check for updates after a short delay to not block startup
    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, []);
}

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return; // Wait for auth check

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);
}

function SyncStatusBanner() {
  const { isSyncing, isOnline, pendingCount, error } = useDataProvider();

  if (!isSyncing && isOnline && pendingCount === 0 && !error) {
    return null;
  }

  return (
    <View style={styles.syncBanner}>
      {!isOnline && (
        <View style={[styles.syncIndicator, { backgroundColor: '#F59E0B' }]}>
          <Text style={styles.syncText}>Offline - changes will sync when connected</Text>
        </View>
      )}
      {isOnline && isSyncing && (
        <View style={[styles.syncIndicator, { backgroundColor: '#3B82F6' }]}>
          <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.syncText}>Syncing...</Text>
        </View>
      )}
      {isOnline && pendingCount > 0 && !isSyncing && (
        <View style={[styles.syncIndicator, { backgroundColor: '#F97316' }]}>
          <Text style={styles.syncText}>{pendingCount} pending changes</Text>
        </View>
      )}
      {error && (
        <View style={[styles.syncIndicator, { backgroundColor: '#EF4444' }]}>
          <Text style={styles.syncText}>Sync error: {error}</Text>
        </View>
      )}
    </View>
  );
}

function RootLayoutNav({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  useProtectedRoute();
  const { isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DataProvider>
        <SyncStatusBanner />
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="export" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="event-detail" options={{ headerShown: false }} />
          <Stack.Screen name="exports" options={{ headerShown: false }} />
          <Stack.Screen name="import" options={{ headerShown: false }} />
          <Stack.Screen name="insights" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="daily-log-detail" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </DataProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { loadStoredAuth } = useAuthStore();

  // Check for OTA updates on app start
  useOTAUpdates();

  useEffect(() => {
    loadStoredAuth().finally(() => {
      SplashScreen.hideAsync();
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <RootLayoutNav colorScheme={colorScheme} />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  syncText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
