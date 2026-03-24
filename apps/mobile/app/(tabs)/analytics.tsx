// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Analytics / Niche Analysis Screen
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeInUp, LinearTransition } from "react-native-reanimated";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScoreGauge } from "@/components/analytics/ScoreGauge";
import { analyticsApi } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { NicheAnalysis, DemandLevel, CompetitionLevel } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function demandColor(level: DemandLevel): string {
  const map: Record<DemandLevel, string> = {
    low: "#64748b",
    medium: "#eab308",
    high: "#22c55e",
    very_high: "#10b981",
  };
  return map[level];
}

function competitionColor(level: CompetitionLevel): string {
  const map: Record<CompetitionLevel, string> = {
    low: "#22c55e",
    medium: "#eab308",
    high: "#f97316",
    very_high: "#ef4444",
  };
  return map[level];
}

function trendIcon(dir: NicheAnalysis["trendDirection"]): string {
  const icons = { up: "↑", down: "↓", stable: "→" } as const;
  return icons[dir];
}

function trendColor(dir: NicheAnalysis["trendDirection"]): string {
  const colors = { up: "#22c55e", down: "#ef4444", stable: "#94a3b8" } as const;
  return colors[dir];
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Result Panel
// ─────────────────────────────────────────────────────────────────────────────

function AnalysisResult({
  analysis,
  t,
}: {
  analysis: NicheAnalysis;
  t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  return (
    <Animated.View
      entering={FadeInDown.duration(500).springify()}
      layout={LinearTransition}
    >
      <Card variant="bordered" padding="lg" className="mt-6">
        {/* Title */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-white text-lg font-bold flex-1 mr-2" numberOfLines={1}>
            {analysis.keyword}
          </Text>
          <Badge
            variant="status"
            status={analysis.score >= 60 ? "success" : analysis.score >= 40 ? "warning" : "error"}
            label={`${analysis.score}/100`}
          />
        </View>

        {/* Score Gauge */}
        <View className="items-center mb-6">
          <ScoreGauge score={analysis.score} size={180} />
        </View>

        {/* Key Metrics Grid */}
        <View className="flex-row flex-wrap gap-3 mb-4">
          <View className="flex-1 min-w-[45%] bg-surface-700 rounded-xl p-3">
            <Text className="text-slate-400 text-xs mb-1">{t.analytics.demand}</Text>
            <Text
              className="text-base font-semibold"
              style={{ color: demandColor(analysis.demandLevel) }}
            >
              {t.analytics.demandLevels[analysis.demandLevel]}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-surface-700 rounded-xl p-3">
            <Text className="text-slate-400 text-xs mb-1">{t.analytics.competition}</Text>
            <Text
              className="text-base font-semibold"
              style={{ color: competitionColor(analysis.competitionLevel) }}
            >
              {t.analytics.demandLevels[analysis.competitionLevel]}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-surface-700 rounded-xl p-3">
            <Text className="text-slate-400 text-xs mb-1">{t.analytics.monthlySearches}</Text>
            <Text className="text-white text-base font-semibold">
              {analysis.monthlySearches.toLocaleString()}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-surface-700 rounded-xl p-3">
            <Text className="text-slate-400 text-xs mb-1">{t.analytics.trend}</Text>
            <Text
              className="text-base font-semibold"
              style={{ color: trendColor(analysis.trendDirection) }}
            >
              {trendIcon(analysis.trendDirection)}{" "}
              {t.analytics.trendDirections[analysis.trendDirection]}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-surface-700 rounded-xl p-3">
            <Text className="text-slate-400 text-xs mb-1">{t.analytics.avgPrice}</Text>
            <Text className="text-white text-base font-semibold">
              {analysis.avgPrice.toFixed(2)} PLN
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-surface-700 rounded-xl p-3">
            <Text className="text-slate-400 text-xs mb-1">{t.analytics.avgMargin}</Text>
            <Text className="text-green-400 text-base font-semibold">
              {analysis.avgMargin.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Top Marketplaces */}
        {analysis.topMarketplaces.length > 0 && (
          <View>
            <Text className="text-slate-400 text-xs mb-2">{t.analytics.topMarketplaces}</Text>
            <View className="flex-row flex-wrap gap-2">
              {analysis.topMarketplaces.map((mp) => (
                <Badge key={mp} label={mp} />
              ))}
            </View>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History Item
// ─────────────────────────────────────────────────────────────────────────────

function HistoryItem({
  item,
  onPress,
}: {
  item: NicheAnalysis;
  onPress: (item: NicheAnalysis) => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      className="flex-row items-center bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 mb-2"
    >
      <View className="flex-1">
        <Text className="text-white font-medium" numberOfLines={1}>
          {item.keyword}
        </Text>
        <Text className="text-slate-500 text-xs mt-0.5">
          {new Date(item.analyzedAt).toLocaleDateString()}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="text-brand-400 font-bold">{item.score}/100</Text>
        <Text
          style={{ color: trendColor(item.trendDirection), fontSize: 12 }}
        >
          {trendIcon(item.trendDirection)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen(): React.JSX.Element {
  const t = useTranslations();
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NicheAnalysis | null>(null);
  const [history, setHistory] = useState<NicheAnalysis[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleAnalyze = async (): Promise<void> => {
    const trimmed = keyword.trim();
    if (trimmed.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResult(null);

    try {
      const analysis = await analyticsApi.analyze(trimmed, controller.signal);
      setResult(analysis);
      setHistory((prev) => [analysis, ...prev.filter((h) => h.keyword !== trimmed)].slice(0, 20));
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== "AbortError") {
        Alert.alert(t.common.error, t.analytics.limitReached);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-900" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInUp.duration(500)}>
          <Text className="text-white text-2xl font-bold">{t.analytics.title}</Text>
          <Text className="text-slate-400 text-sm mt-1">
            Discover profitable niches
          </Text>
        </Animated.View>

        {/* Search */}
        <Animated.View
          entering={FadeInDown.duration(500).delay(100)}
          className="mt-6 flex-row gap-3"
        >
          <View className="flex-1">
            <Input
              placeholder={t.analytics.searchPlaceholder}
              value={keyword}
              onChangeText={setKeyword}
              returnKeyType="search"
              onSubmitEditing={() => void handleAnalyze()}
            />
          </View>
          <Button
            variant="primary"
            loading={loading}
            onPress={() => void handleAnalyze()}
            disabled={keyword.trim().length === 0}
            className="self-center"
          >
            {loading ? "" : "→"}
          </Button>
        </Animated.View>

        {/* Loading state */}
        {loading && (
          <Animated.View entering={FadeInDown} className="items-center py-8">
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text className="text-slate-400 mt-3">{t.analytics.analyzing}</Text>
          </Animated.View>
        )}

        {/* Result */}
        {result !== null && !loading && (
          <AnalysisResult analysis={result} t={t} />
        )}

        {/* History */}
        {history.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(200)} className="mt-8">
            <TouchableOpacity
              onPress={() => setShowHistory((p) => !p)}
              className="flex-row items-center justify-between mb-3"
            >
              <Text className="text-white font-semibold">{t.analytics.history}</Text>
              <Text className="text-slate-400">{showHistory ? "▾" : "▸"}</Text>
            </TouchableOpacity>

            {showHistory && (
              <View>
                {history.map((item) => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    onPress={(a) => {
                      setResult(a);
                      setKeyword(a.keyword);
                    }}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* Empty state */}
        {!loading && result === null && history.length === 0 && (
          <Animated.View
            entering={FadeInDown.duration(500).delay(200)}
            className="items-center py-12"
          >
            <Text className="text-5xl mb-4">🔍</Text>
            <Text className="text-slate-400 text-center">{t.analytics.noHistory}</Text>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
