// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Auth Stack Layout
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Stack, Redirect } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";

export default function AuthLayout(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/analytics" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0f0a1e" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
