// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — EAN Barcode Scanner Screen
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ScanOverlay } from "@/components/scanner/ScanOverlay";
import { productApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { Product } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Product Result Panel
// ─────────────────────────────────────────────────────────────────────────────

interface ProductPanelProps {
  readonly product: Product | null;
  readonly ean: string;
  readonly notFound: boolean;
  readonly onScanAnother: () => void;
  readonly t: ReturnType<typeof useTranslations>;
}

function ProductPanel({
  product,
  ean,
  notFound,
  onScanAnother,
  t,
}: ProductPanelProps): React.JSX.Element {
  if (notFound || product === null) {
    return (
      <Animated.View
        entering={SlideInDown.duration(400).springify()}
        exiting={SlideOutDown.duration(300)}
        className="bg-surface-800 rounded-t-3xl px-6 pt-4 pb-8"
      >
        <View className="w-10 h-1 rounded-full bg-surface-600 self-center mb-6" />
        <View className="items-center py-6">
          <Text className="text-4xl mb-3">❓</Text>
          <Text className="text-white text-lg font-semibold">
            {t.scanner.productNotFound}
          </Text>
          <Text className="text-slate-400 text-sm mt-1">{t.scanner.ean}: {ean}</Text>
        </View>
        <Button variant="outline" fullWidth onPress={onScanAnother}>
          {t.scanner.scanAnother}
        </Button>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={SlideInDown.duration(400).springify()}
      exiting={SlideOutDown.duration(300)}
      className="bg-surface-800 rounded-t-3xl px-6 pt-4 pb-8"
    >
      <View className="w-10 h-1 rounded-full bg-surface-600 self-center mb-4" />
      <Text className="text-white text-base font-semibold mb-4">
        {t.scanner.productFound}
      </Text>

      <View className="flex-row gap-4 mb-4">
        {product.imageUrl !== null ? (
          <Image
            source={{ uri: product.imageUrl }}
            className="w-20 h-20 rounded-xl bg-surface-700"
            resizeMode="cover"
          />
        ) : (
          <View className="w-20 h-20 rounded-xl bg-surface-700 items-center justify-center">
            <Text className="text-3xl">📦</Text>
          </View>
        )}
        <View className="flex-1 justify-center">
          <Text className="text-white font-semibold text-base" numberOfLines={2}>
            {product.name}
          </Text>
          {product.brand !== null && (
            <Text className="text-slate-400 text-sm mt-0.5">{product.brand}</Text>
          )}
        </View>
      </View>

      <View className="gap-2 mb-5">
        <View className="flex-row justify-between py-2 border-b border-surface-700">
          <Text className="text-slate-400 text-sm">{t.scanner.ean}</Text>
          <Text className="text-white text-sm font-mono">{product.ean}</Text>
        </View>

        {product.category !== null && (
          <View className="flex-row justify-between py-2 border-b border-surface-700">
            <Text className="text-slate-400 text-sm">{t.scanner.category}</Text>
            <Text className="text-white text-sm">{product.category}</Text>
          </View>
        )}

        {product.avgPrice !== null && (
          <View className="flex-row justify-between py-2 border-b border-surface-700">
            <Text className="text-slate-400 text-sm">{t.scanner.avgPrice}</Text>
            <Text className="text-green-400 text-sm font-semibold">
              {product.avgPrice.toFixed(2)} {product.currency}
            </Text>
          </View>
        )}
      </View>

      <Button variant="primary" fullWidth onPress={onScanAnother}>
        {t.scanner.scanAnother}
      </Button>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

type ScannerState =
  | { type: "idle" }
  | { type: "scanning" }
  | { type: "loading"; ean: string }
  | { type: "found"; product: Product; ean: string }
  | { type: "not_found"; ean: string };

export default function ScannerScreen(): React.JSX.Element {
  const t = useTranslations();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScannerState>({ type: "scanning" });
  const [flashEnabled, setFlashEnabled] = useState(false);
  const scanCooldown = useRef(false);

  const handleBarcodeScan = useCallback(
    async (result: BarcodeScanningResult): Promise<void> => {
      if (scanCooldown.current) return;
      if (state.type !== "scanning") return;

      const ean = result.data;

      // Only process EAN-13, EAN-8, CODE-128
      const validTypes = ["ean13", "ean8", "code128", "upc_a", "upc_e"];
      if (!validTypes.includes(result.type.toLowerCase())) return;

      scanCooldown.current = true;

      // Haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setState({ type: "loading", ean });

      try {
        const product = await productApi.findByEan(ean);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setState({ type: "found", product, ean });
      } catch {
        setState({ type: "not_found", ean });
      }
    },
    [state.type]
  );

  const handleScanAnother = (): void => {
    scanCooldown.current = false;
    setState({ type: "scanning" });
  };

  // Request camera permission
  if (permission === null) {
    return (
      <SafeAreaView className="flex-1 bg-surface-900 items-center justify-center">
        <Text className="text-white">{t.common.loading}</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-surface-900 items-center justify-center px-6">
        <Text className="text-5xl mb-4">📷</Text>
        <Text className="text-white text-xl font-bold text-center mb-2">
          {t.scanner.permissionRequired}
        </Text>
        <Text className="text-slate-400 text-center mb-6">
          EcomPilot needs camera access to scan product barcodes.
        </Text>
        <Button
          variant="primary"
          onPress={() => void requestPermission()}
        >
          {t.scanner.grantPermission}
        </Button>
      </SafeAreaView>
    );
  }

  const isScanning = state.type === "scanning";
  const showResult = state.type === "found" || state.type === "not_found";
  const showLoading = state.type === "loading";

  return (
    <View className="flex-1 bg-black">
      {/* Camera */}
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={flashEnabled}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "code128", "upc_a", "upc_e"],
        }}
        onBarcodeScanned={
          isScanning
            ? (r) => void handleBarcodeScan(r)
            : undefined
        }
      >
        {/* Dark overlay + scan frame */}
        <ScanOverlay
          instruction={
            isScanning
              ? t.scanner.scanInstructions
              : showLoading
              ? t.scanner.scanning
              : state.type === "found"
              ? t.scanner.productFound
              : t.scanner.productNotFound
          }
          isScanning={isScanning}
          scanned={!isScanning}
        />

        {/* Top controls */}
        <SafeAreaView edges={["top"]} className="absolute top-0 left-0 right-0">
          <View className="flex-row items-center justify-between px-5 py-3">
            <Text className="text-white text-lg font-bold">{t.scanner.title}</Text>
            <TouchableOpacity
              onPress={() => setFlashEnabled((p) => !p)}
              className="bg-black/40 rounded-full px-3 py-1.5"
            >
              <Text className="text-white text-sm">
                {flashEnabled ? t.scanner.flashOff : t.scanner.flashOn}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Loading indicator */}
        {showLoading && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="absolute bottom-8 left-0 right-0 items-center"
          >
            <View className="bg-black/70 rounded-2xl px-5 py-3 flex-row items-center gap-2">
              <Text className="text-white text-sm">{t.scanner.scanning}</Text>
            </View>
          </Animated.View>
        )}
      </CameraView>

      {/* Product result bottom sheet */}
      {showResult && (
        <View className="absolute bottom-0 left-0 right-0">
          <ProductPanel
            product={state.type === "found" ? state.product : null}
            ean={state.type === "found" || state.type === "not_found" ? state.ean : ""}
            notFound={state.type === "not_found"}
            onScanAnother={handleScanAnother}
            t={t}
          />
        </View>
      )}
    </View>
  );
}
