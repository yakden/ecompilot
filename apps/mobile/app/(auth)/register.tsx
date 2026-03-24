// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Register Screen
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
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/stores/auth.store";
import { authApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { Language } from "@/types";

interface FormState {
  name: string;
  email: string;
  password: string;
  language: Language;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
}

const LANGUAGES: Array<{ value: Language; label: string; flag: string }> = [
  { value: "pl", label: "Polski", flag: "🇵🇱" },
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "ua", label: "Українська", flag: "🇺🇦" },
];

function validateForm(
  form: FormState,
  t: ReturnType<typeof useTranslations>
): FormErrors {
  const errors: FormErrors = {};

  if (form.name.trim().length === 0) errors.name = t.auth.nameRequired;
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

export default function RegisterScreen(): React.JSX.Element {
  const t = useTranslations();
  const { setUser, setLanguage } = useAuthStore();

  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    language: "pl",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      if (key !== "language") {
        setErrors((prev) => ({ ...prev, [key]: undefined }));
      }
    },
    []
  );

  const handleRegister = async (): Promise<void> => {
    const validationErrors = validateForm(form, t);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        language: form.language,
      });
      setLanguage(form.language);
      setUser(response.user, response.tokens);
      router.replace("/(tabs)/analytics");
    } catch {
      Alert.alert("Error", t.auth.registerFailed);
    } finally {
      setLoading(false);
    }
  };

  const selectedLang = LANGUAGES.find((l) => l.value === form.language);

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
            {/* Header */}
            <Animated.View
              entering={FadeInUp.duration(600).springify()}
              className="items-center mb-10"
            >
              <View className="w-16 h-16 rounded-2xl bg-brand-600 items-center justify-center mb-4">
                <Text className="text-white text-2xl font-bold">EP</Text>
              </View>
              <Text className="text-white text-3xl font-bold">EcomPilot</Text>
              <Text className="text-slate-400 mt-2">{t.auth.register}</Text>
            </Animated.View>

            {/* Form */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(150).springify()}
              className="gap-4"
            >
              <Input
                label={t.auth.name}
                placeholder="Jan Kowalski"
                value={form.name}
                onChangeText={(v) => updateField("name", v)}
                error={errors.name}
                autoCapitalize="words"
                textContentType="name"
                returnKeyType="next"
              />

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
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={() => void handleRegister()}
              />

              {/* Language picker */}
              <View>
                <Text className="text-slate-300 text-sm font-medium mb-1.5">
                  {t.auth.language}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowLangPicker(true)}
                  className="flex-row items-center justify-between bg-surface-800 border border-surface-600 rounded-xl px-4 py-3.5"
                >
                  <Text className="text-white text-base">
                    {selectedLang?.flag} {selectedLang?.label}
                  </Text>
                  <Text className="text-slate-400">▾</Text>
                </TouchableOpacity>
              </View>

              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                onPress={() => void handleRegister()}
                className="mt-2"
              >
                {t.auth.register}
              </Button>
            </Animated.View>

            {/* Login link */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(300).springify()}
              className="flex-row justify-center mt-8 gap-1"
            >
              <Text className="text-slate-400">{t.auth.hasAccount}</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text className="text-brand-400 font-semibold">{t.auth.login}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
                updateField("language", lang.value);
                setShowLangPicker(false);
              }}
              className={[
                "flex-row items-center gap-3 py-3.5 px-4 rounded-xl mb-2",
                form.language === lang.value
                  ? "bg-brand-900 border border-brand-700"
                  : "bg-surface-700",
              ].join(" ")}
            >
              <Text className="text-2xl">{lang.flag}</Text>
              <Text
                className={[
                  "text-base",
                  form.language === lang.value
                    ? "text-brand-300 font-semibold"
                    : "text-white",
                ].join(" ")}
              >
                {lang.label}
              </Text>
              {form.language === lang.value && (
                <Text className="text-brand-400 ml-auto">✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
