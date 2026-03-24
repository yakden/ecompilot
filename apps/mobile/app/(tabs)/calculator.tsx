// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Margin Calculator Screen
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultCard } from "@/components/calculator/ResultCard";
import { useTranslations } from "@/lib/i18n";
import type { MarginCalculation } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Calculation logic
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  purchasePrice: string;
  sellingPrice: string;
  shippingCost: string;
  platformFeePercent: string;
  vatPercent: string;
}

const DEFAULT_FORM: FormState = {
  purchasePrice: "",
  sellingPrice: "",
  shippingCost: "0",
  platformFeePercent: "8",
  vatPercent: "23",
};

function calculate(form: FormState): MarginCalculation | null {
  const purchasePrice = parseFloat(form.purchasePrice.replace(",", "."));
  const sellingPrice = parseFloat(form.sellingPrice.replace(",", "."));
  const shippingCost = parseFloat(form.shippingCost.replace(",", ".") || "0");
  const platformFeePercent = parseFloat(form.platformFeePercent.replace(",", ".") || "0");
  const vatPercent = parseFloat(form.vatPercent.replace(",", ".") || "0");

  if (
    isNaN(purchasePrice) ||
    isNaN(sellingPrice) ||
    isNaN(shippingCost) ||
    isNaN(platformFeePercent) ||
    isNaN(vatPercent)
  ) {
    return null;
  }

  const platformFeeAmount = (sellingPrice * platformFeePercent) / 100;
  const vatAmount = (sellingPrice * vatPercent) / (100 + vatPercent);
  const totalCosts = purchasePrice + shippingCost + platformFeeAmount + vatAmount;
  const profit = sellingPrice - totalCosts;
  const margin = profit;
  const marginPercent = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
  const roi = purchasePrice > 0 ? (profit / purchasePrice) * 100 : 0;

  return {
    purchasePrice,
    sellingPrice,
    shippingCost,
    platformFeePercent,
    vatPercent,
    margin,
    marginPercent,
    profit,
    roi,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick preset
// ─────────────────────────────────────────────────────────────────────────────

interface Preset {
  readonly label: string;
  readonly platformFee: string;
  readonly vat: string;
}

const PRESETS: Preset[] = [
  { label: "Allegro", platformFee: "8", vat: "23" },
  { label: "Amazon PL", platformFee: "15", vat: "23" },
  { label: "Ceneo", platformFee: "3", vat: "23" },
  { label: "Custom", platformFee: "", vat: "" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CalculatorScreen(): React.JSX.Element {
  const t = useTranslations();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState<MarginCalculation | null>(null);
  const [activePreset, setActivePreset] = useState<string>("Allegro");
  const [errors, setErrors] = useState<Partial<FormState>>({});

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    []
  );

  const applyPreset = (preset: Preset): void => {
    setActivePreset(preset.label);
    if (preset.platformFee !== "") {
      setForm((prev) => ({
        ...prev,
        platformFeePercent: preset.platformFee,
        vatPercent: preset.vat,
      }));
    }
  };

  const handleCalculate = (): void => {
    const newErrors: Partial<FormState> = {};

    if (form.purchasePrice.trim().length === 0) {
      newErrors.purchasePrice = "Required";
    }
    if (form.sellingPrice.trim().length === 0) {
      newErrors.sellingPrice = "Required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const calc = calculate(form);
    setResult(calc);
  };

  const handleReset = (): void => {
    setForm(DEFAULT_FORM);
    setResult(null);
    setErrors({});
    setActivePreset("Allegro");
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-900" edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInUp.duration(500)}>
            <Text className="text-white text-2xl font-bold">{t.calculator.title}</Text>
            <Text className="text-slate-400 text-sm mt-1">
              Calculate your net profit & ROI
            </Text>
          </Animated.View>

          {/* Platform Presets */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(100)}
            className="mt-6"
          >
            <Text className="text-slate-400 text-xs mb-2 uppercase tracking-wider">
              Platform Preset
            </Text>
            <View className="flex-row gap-2 flex-wrap">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant={activePreset === preset.label ? "primary" : "outline"}
                  size="sm"
                  onPress={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </View>
          </Animated.View>

          {/* Form */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(150)}
            className="mt-6 gap-4"
          >
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  label={t.calculator.purchasePrice}
                  placeholder="0.00"
                  value={form.purchasePrice}
                  onChangeText={(v) => updateField("purchasePrice", v)}
                  error={errors.purchasePrice}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View className="flex-1">
                <Input
                  label={t.calculator.sellingPrice}
                  placeholder="0.00"
                  value={form.sellingPrice}
                  onChangeText={(v) => updateField("sellingPrice", v)}
                  error={errors.sellingPrice}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
            </View>

            <Input
              label={t.calculator.shippingCost}
              placeholder="0.00"
              value={form.shippingCost}
              onChangeText={(v) => updateField("shippingCost", v)}
              keyboardType="decimal-pad"
              returnKeyType="next"
              hint="Shipping cost paid by seller"
            />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  label={t.calculator.platformFee}
                  placeholder="8"
                  value={form.platformFeePercent}
                  onChangeText={(v) => updateField("platformFeePercent", v)}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View className="flex-1">
                <Input
                  label={t.calculator.vat}
                  placeholder="23"
                  value={form.vatPercent}
                  onChangeText={(v) => updateField("vatPercent", v)}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleCalculate}
                />
              </View>
            </View>

            {/* Actions */}
            <View className="flex-row gap-3 mt-2">
              <Button
                variant="primary"
                size="lg"
                style={{ flex: 1 }}
                onPress={handleCalculate}
              >
                {t.calculator.calculate}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onPress={handleReset}
              >
                {t.calculator.reset}
              </Button>
            </View>
          </Animated.View>

          {/* Results */}
          {result !== null && (
            <View className="mt-6">
              <Text className="text-slate-400 text-xs mb-3 uppercase tracking-wider">
                {t.calculator.results}
              </Text>
              <ResultCard result={result} currency="PLN" />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
