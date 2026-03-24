// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Tab Navigator Layout (5 tabs)
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Tabs, Redirect } from "expo-router";
import { View, Text, Platform } from "react-native";
import { useAuthStore } from "@/stores/auth.store";
import { useTranslations } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Tab Icons (inline SVG-like using text/emoji for zero-dep approach)
// ─────────────────────────────────────────────────────────────────────────────

interface TabIconProps {
  readonly focused: boolean;
  readonly icon: string;
  readonly label: string;
}

function TabIcon({ focused, icon, label }: TabIconProps): React.JSX.Element {
  return (
    <View className="items-center justify-center pt-1">
      <Text
        style={{
          fontSize: 22,
          opacity: focused ? 1 : 0.45,
        }}
      >
        {icon}
      </Text>
      {focused && (
        <View className="w-1 h-1 rounded-full bg-brand-500 mt-0.5" />
      )}
    </View>
  );
}

export default function TabsLayout(): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const t = useTranslations();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1a1330",
          borderTopColor: "#2d2254",
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: "#8b5cf6",
        tabBarInactiveTintColor: "#475569",
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="analytics"
        options={{
          title: t.nav.analytics,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📊" label={t.nav.analytics} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-chat"
        options={{
          title: t.nav.aiChat,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🤖" label={t.nav.aiChat} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: t.nav.scanner,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="📷" label={t.nav.scanner} />
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: t.nav.calculator,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="🧮" label={t.nav.calculator} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.nav.profile,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="👤" label={t.nav.profile} />
          ),
        }}
      />
    </Tabs>
  );
}
