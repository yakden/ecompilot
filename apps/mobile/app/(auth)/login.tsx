// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Login Screen
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/auth.store";
import { authApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";

interface FormState {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
}

function validateForm(form: FormState, t: ReturnType<typeof useTranslations>): FormErrors {
  const errors: FormErrors = {};

  if (form.email.trim().length === 0) {
    errors.email = t.auth.emailRequired;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = t.auth.invalidEmail;
  }

  if (form.password.length === 0) {
    errors.password = t.auth.passwordRequired;
  } else if (form.password.length < 8) {
    errors.password = t.auth.passwordTooShort;
  }

  return errors;
}

export default function LoginScreen(): React.JSX.Element {
  const t = useTranslations();
  const { setUser, biometricEnabled, tokens } = useAuthStore();

  const [form, setForm] = useState<FormState>({ email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    []
  );

  const handleLogin = async (): Promise<void> => {
    const validationErrors = validateForm(form, t);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.login({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      setUser(response.user, response.tokens);
      router.replace("/(tabs)/analytics");
    } catch {
      Alert.alert("Error", t.auth.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async (): Promise<void> => {
    if (!biometricEnabled || tokens === null) return;

    setBiometricLoading(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert("Biometric unavailable", "No biometric authentication available on this device.");
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t.auth.biometricPrompt,
        fallbackLabel: "Use passcode",
        cancelLabel: t.common.cancel,
      });

      if (result.success) {
        router.replace("/(tabs)/analytics");
      }
    } catch {
      // Biometric failed silently — user can still use email/password
    } finally {
      setBiometricLoading(false);
    }
  };

  const canUseBiometric = biometricEnabled && tokens !== null;

  return (
    <SafeAreaView className="flex-1 bg-surface-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 justify-center py-12">
            {/* Logo & Header */}
            <Animated.View
              entering={FadeInUp.duration(600).springify()}
              className="items-center mb-10"
            >
              <View className="w-16 h-16 rounded-2xl bg-brand-600 items-center justify-center mb-4">
                <Text className="text-white text-2xl font-bold">EP</Text>
              </View>
              <Text className="text-white text-3xl font-bold">EcomPilot</Text>
              <Text className="text-slate-400 mt-2 text-center">
                {t.auth.login}
              </Text>
            </Animated.View>

            {/* Form */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(150).springify()}
              className="gap-4"
            >
              <Input
                label={t.auth.email}
                placeholder="you@example.com"
                value={form.email}
                onChangeText={(v) => updateField("email", v)}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />

              <Input
                label={t.auth.password}
                placeholder="••••••••"
                value={form.password}
                onChangeText={(v) => updateField("password", v)}
                error={errors.password}
                secureTextEntry
                secureToggle
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={() => void handleLogin()}
              />

              <TouchableOpacity className="self-end">
                <Text className="text-brand-400 text-sm">
                  {t.auth.forgotPassword}
                </Text>
              </TouchableOpacity>

              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                onPress={() => void handleLogin()}
                className="mt-2"
              >
                {t.auth.login}
              </Button>

              {/* Divider */}
              <View className="flex-row items-center gap-3 my-2">
                <View className="flex-1 h-px bg-surface-600" />
                <Text className="text-slate-500 text-sm">{t.common.or}</Text>
                <View className="flex-1 h-px bg-surface-600" />
              </View>

              {/* Google */}
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onPress={() => {
                  // OAuth flow — handled via WebBrowser
                }}
              >
                {t.auth.continueWithGoogle}
              </Button>

              {/* Biometric */}
              {canUseBiometric && (
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  loading={biometricLoading}
                  onPress={() => void handleBiometricLogin()}
                >
                  {t.auth.loginWithBiometric}
                </Button>
              )}
            </Animated.View>

            {/* Register link */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(300).springify()}
              className="flex-row justify-center mt-8 gap-1"
            >
              <Text className="text-slate-400">{t.auth.noAccount}</Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
                <Text className="text-brand-400 font-semibold">
                  {t.auth.register}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
