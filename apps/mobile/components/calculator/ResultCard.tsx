// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Calculator Result Card
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
} from "react-native-reanimated";
import type { MarginCalculation } from "@/types";

interface ResultCardProps {
  readonly result: MarginCalculation;
  readonly currency?: string;
}

interface MetricRowProps {
  readonly label: string;
  readonly value: string;
  readonly highlight?: boolean;
  readonly positive?: boolean;
}

function MetricRow({
  label,
  value,
  highlight = false,
  positive,
}: MetricRowProps): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-surface-700">
      <Text className={["text-sm", highlight ? "text-white font-semibold" : "text-slate-400"].join(" ")}>
        {label}
      </Text>
      <Text
        className={[
          "text-sm font-semibold",
          highlight
            ? positive !== undefined
              ? positive
                ? "text-green-400"
                : "text-red-400"
              : "text-white"
            : "text-slate-200",
        ].join(" ")}
      >
        {value}
      </Text>
    </View>
  );
}

interface GaugeMiniProps {
  readonly percent: number;
  readonly color: string;
}

function GaugeMini({ percent, color }: GaugeMiniProps): React.JSX.Element {
  const width = useSharedValue(0);
  const clampedPercent = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    width.value = withSpring(clampedPercent, { damping: 14, stiffness: 100 });
  }, [clampedPercent, width]);

  const animStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
    backgroundColor: color,
  }));

  return (
    <View className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
      <Animated.View style={[animStyle, { height: "100%", borderRadius: 999 }]} />
    </View>
  );
}

export function ResultCard({
  result,
  currency = "PLN",
}: ResultCardProps): React.JSX.Element {
  const { margin, marginPercent, profit, roi } = result;

  const isPositive = profit > 0;
  const marginColor = marginPercent >= 30 ? "#22c55e" : marginPercent >= 15 ? "#eab308" : "#ef4444";

  const formatMoney = (val: number): string =>
    `${val.toFixed(2)} ${currency}`;

  const formatPercent = (val: number): string =>
    `${val.toFixed(1)}%`;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify()}
      className="bg-surface-800 rounded-2xl border border-surface-600 p-4"
    >
      {/* Header row — margin % large display */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-slate-400 text-xs mb-1">Margin</Text>
          <View className="flex-row items-baseline gap-1">
            <Text
              className="font-bold"
              style={{ fontSize: 36, color: marginColor }}
            >
              {marginPercent.toFixed(1)}
            </Text>
            <Text className="text-slate-400 text-lg">%</Text>
          </View>
        </View>

        <View className="items-end">
          <Text className="text-slate-400 text-xs mb-1">Net Profit</Text>
          <Text
            className={["text-xl font-bold", isPositive ? "text-green-400" : "text-red-400"].join(
              " "
            )}
          >
            {isPositive ? "+" : ""}
            {formatMoney(profit)}
          </Text>
        </View>
      </View>

      {/* Margin gauge */}
      <View className="mb-4">
        <GaugeMini percent={marginPercent} color={marginColor} />
      </View>

      {/* Metrics */}
      <MetricRow
        label="Gross Margin"
        value={formatMoney(margin)}
        highlight
        positive={isPositive}
      />
      <MetricRow label="ROI" value={formatPercent(roi)} highlight positive={roi > 0} />
      <MetricRow
        label="Selling Price"
        value={formatMoney(result.sellingPrice)}
      />
      <MetricRow
        label="Purchase Price"
        value={formatMoney(result.purchasePrice)}
      />
      <MetricRow
        label="Shipping"
        value={formatMoney(result.shippingCost)}
      />
      <MetricRow
        label="Platform Fee"
        value={formatPercent(result.platformFeePercent)}
      />
      <MetricRow label="VAT" value={formatPercent(result.vatPercent)} />
    </Animated.View>
  );
}
