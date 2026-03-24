// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Entry redirect
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";

export default function Index(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/analytics" />;
  }

  return <Redirect href="/(auth)/login" />;
}
