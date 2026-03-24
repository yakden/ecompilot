// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Profile & Settings Screen
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as Application from "expo-application";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useTranslations } from "@/lib/i18n";
import type { Language } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Setting Row
// ─────────────────────────────────────────────────────────────────────────────

interface SettingRowProps {
  readonly label: string;
  readonly description?: string;
  readonly value: boolean;
  readonly onValueChange: (v: boolean) => void;
  readonly disabled?: boolean;
}

function SettingRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
}: SettingRowProps): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between py-3.5 border-b border-surface-700">
      <View className="flex-1 mr-4">
        <Text className={["text-sm font-medium", disabled ? "text-slate-600" : "text-white"].join(" ")}>
          {label}
        </Text>
        {description !== undefined && (
          <Text className="text-slate-500 text-xs mt-0.5">{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: "#334155", true: "#7c3aed" }}
        thumbColor={value ? "#a78bfa" : "#64748b"}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <Text className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3 mt-6">
      {title}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Picker Modal
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES: Array<{ value: Language; label: string; flag: string }> = [
  { value: "pl", label: "Polski", flag: "🇵🇱" },
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "ua", label: "Українська", flag: "🇺🇦" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Plan card
// ─────────────────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  t,
}: {
  plan: "free" | "pro" | "business";
  t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  const planColors = {
    free: { bg: "bg-slate-800", border: "border-slate-600", text: "text-slate-300" },
    pro: { bg: "bg-brand-900/60", border: "border-brand-700", text: "text-brand-300" },
    business: { bg: "bg-amber-900/40", border: "border-amber-700", text: "text-amber-300" },
  } as const;

  const colors = planColors[plan];

  const features = {
    free: ["5 niche analyses/day", "3 AI messages/day", "Barcode scanner"],
    pro: ["Unlimited analyses", "Unlimited AI chat", "CSV export", "Priority support"],
    business: ["Everything in Pro", "API access", "5 team members", "White-label reports"],
  } as const;

  return (
    <Card variant="bordered" className={[colors.bg, "border", colors.border].join(" ")}>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-white text-lg font-bold">
          {t.profile.plans[plan]}
        </Text>
        <Badge variant="plan" plan={plan} />
      </View>
      <View className="gap-1.5">
        {features[plan].map((feature) => (
          <View key={feature} className="flex-row items-center gap-2">
            <Text className="text-green-400 text-xs">✓</Text>
            <Text className="text-slate-300 text-sm">{feature}</Text>
          </View>
        ))}
      </View>
      {plan !== "business" && (
        <Button variant="primary" size="sm" fullWidth className="mt-4">
          {t.profile.upgradePlan}
        </Button>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen(): React.JSX.Element {
  const t = useTranslations();

  const { user, logout, language, setLanguage, biometricEnabled, setBiometricEnabled } =
    useAuthStore();

  const {
    notificationsEnabled,
    nicheAlerts,
    aiResponseNotifications,
    planUpdateNotifications,
    hapticFeedback,
    setNotificationsEnabled,
    setNicheAlerts,
    setAiResponseNotifications,
    setPlanUpdateNotifications,
    setHapticFeedback,
  } = useSettingsStore();

  const [showLangPicker, setShowLangPicker] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleBiometricToggle = async (enabled: boolean): Promise<void> => {
    if (enabled) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          "Biometric unavailable",
          "Please set up Face ID or Touch ID in your device settings first."
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm to enable biometric login",
        cancelLabel: t.common.cancel,
      });

      if (result.success) {
        setBiometricEnabled(true);
      }
    } else {
      setBiometricEnabled(false);
    }
  };

  const handleLogout = (): void => {
    Alert.alert(t.profile.logout, t.profile.logoutConfirm, [
      { text: t.profile.cancel, style: "cancel" },
      {
        text: t.profile.logout,
        style: "destructive",
        onPress: async () => {
          setLogoutLoading(true);
          await logout();
          setLogoutLoading(false);
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const selectedLang = LANGUAGES.find((l) => l.value === language);
  const plan = user?.plan ?? "free";

  return (
    <SafeAreaView className="flex-1 bg-surface-900" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* User Header */}
        <Animated.View entering={FadeInUp.duration(500)} className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-brand-700 items-center justify-center mb-3">
            <Text className="text-white text-3xl font-bold">
              {user?.name.charAt(0).toUpperCase() ?? "?"}
            </Text>
          </View>
          <Text className="text-white text-xl font-bold">{user?.name ?? "—"}</Text>
          <Text className="text-slate-400 text-sm mt-0.5">{user?.email ?? "—"}</Text>
          <View className="mt-2">
            <Badge variant="plan" plan={plan} size="md" />
          </View>
        </Animated.View>

        {/* Plan */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <SectionHeader title={t.profile.plan} />
          <PlanCard plan={plan} t={t} />
        </Animated.View>

        {/* Notifications */}
        <Animated.View entering={FadeInDown.duration(400).delay(150)}>
          <SectionHeader title={t.profile.notifications} />
          <Card variant="bordered" padding="md">
            <SettingRow
              label={t.profile.notifications}
              description="Enable push notifications"
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
            <SettingRow
              label="Niche Alerts"
              description="Get notified about niche score changes"
              value={nicheAlerts}
              onValueChange={setNicheAlerts}
              disabled={!notificationsEnabled}
            />
            <SettingRow
              label="AI Responses"
              description="Push when AI responds to your query"
              value={aiResponseNotifications}
              onValueChange={setAiResponseNotifications}
              disabled={!notificationsEnabled}
            />
            <SettingRow
              label="Plan Updates"
              description="Billing and plan change notifications"
              value={planUpdateNotifications}
              onValueChange={setPlanUpdateNotifications}
              disabled={!notificationsEnabled}
            />
          </Card>
        </Animated.View>

        {/* App Settings */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <SectionHeader title={t.profile.settings} />
          <Card variant="bordered" padding="md">
            <SettingRow
              label={t.profile.biometric}
              description="Face ID / Touch ID login"
              value={biometricEnabled}
              onValueChange={(v) => void handleBiometricToggle(v)}
            />
            <SettingRow
              label="Haptic Feedback"
              description="Vibrate on scan and interactions"
              value={hapticFeedback}
              onValueChange={setHapticFeedback}
            />

            {/* Language selector */}
            <TouchableOpacity
              onPress={() => setShowLangPicker(true)}
              className="flex-row items-center justify-between py-3.5"
            >
              <View>
                <Text className="text-white text-sm font-medium">{t.profile.language}</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="text-slate-400 text-sm">
                  {selectedLang?.flag} {selectedLang?.label}
                </Text>
                <Text className="text-slate-500">›</Text>
              </View>
            </TouchableOpacity>
          </Card>
        </Animated.View>

        {/* App Info */}
        <Animated.View entering={FadeInDown.duration(400).delay(250)}>
          <SectionHeader title="App" />
          <Card variant="bordered" padding="md">
            <View className="flex-row justify-between py-2">
              <Text className="text-slate-400 text-sm">{t.profile.version}</Text>
              <Text className="text-slate-300 text-sm">
                {Application.nativeApplicationVersion ?? "1.0.0"}
              </Text>
            </View>
          </Card>
        </Animated.View>

        {/* Logout */}
        <Animated.View entering={FadeInDown.duration(400).delay(300)} className="mt-6">
          <Button
            variant="danger"
            size="lg"
            fullWidth
            loading={logoutLoading}
            onPress={handleLogout}
          >
            {t.profile.logout}
          </Button>
        </Animated.View>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal
        visible={showLangPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLangPicker(false)}
      >
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => setShowLangPicker(false)}
        />
        <View className="bg-surface-800 rounded-t-3xl px-6 pb-10 pt-4">
          <View className="w-10 h-1 rounded-full bg-surface-600 self-center mb-6" />
          <Text className="text-white text-lg font-semibold mb-4">
            {t.auth.selectLanguage}
          </Text>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.value}
              onPress={() => {
                setLanguage(lang.value);
                setShowLangPicker(false);
              }}
              className={[
                "flex-row items-center gap-3 py-3.5 px-4 rounded-xl mb-2",
                language === lang.value
                  ? "bg-brand-900 border border-brand-700"
                  : "bg-surface-700",
              ].join(" ")}
            >
              <Text className="text-2xl">{lang.flag}</Text>
              <Text
                className={[
                  "text-base flex-1",
                  language === lang.value
                    ? "text-brand-300 font-semibold"
                    : "text-white",
                ].join(" ")}
              >
                {lang.label}
              </Text>
              {language === lang.value && (
                <Text className="text-brand-400">✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
