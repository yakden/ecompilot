// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Root Layout
// ─────────────────────────────────────────────────────────────────────────────

import "../global.css";

import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "@/stores/auth.store";
import { configureApiClient } from "@/lib/api";
import { setI18nLanguage } from "@/lib/i18n";

// Keep splash visible until ready
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — safe to ignore
});

// Push notification handler (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

function RootLayoutNav(): React.JSX.Element {
  const { isAuthenticated, user, getAccessToken, refreshAccessToken } =
    useAuthStore();

  useEffect(() => {
    // Wire up API client with auth store
    configureApiClient({
      getToken: getAccessToken,
      refreshToken: refreshAccessToken,
    });

    // Set i18n language from user preferences
    if (user !== null) {
      setI18nLanguage(user.language);
    }
  }, [user, getAccessToken, refreshAccessToken]);

  useEffect(() => {
    // Register for push notifications
    void registerForPushNotificationsAsync();

    // Handle notification tap (deep linking)
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | { screen?: string }
          | undefined;
        if (data?.screen !== undefined) {
          // expo-router will handle navigation via the scheme
        }
      }
    );

    return () => sub.remove();
  }, []);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
    </Stack>
  );
}

async function registerForPushNotificationsAsync(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7c3aed",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return;
  }
}

export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor="#0f0a1e" />
        <RootLayoutNav />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
