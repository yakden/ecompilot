// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Animated Score Gauge (SVG arc, 0–100)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ScoreGaugeProps {
  readonly score: number;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly label?: string;
  readonly showValue?: boolean;
  readonly animationDuration?: number;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  if (score >= 20) return "Weak";
  return "Poor";
}

export function ScoreGauge({
  score,
  size = 160,
  strokeWidth = 14,
  label,
  showValue = true,
  animationDuration = 1200,
}: ScoreGaugeProps): React.JSX.Element {
  const clampedScore = Math.max(0, Math.min(100, score));
  const animatedValue = useSharedValue(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // 270° arc (¾ of circle)
  const arcLength = circumference * 0.75;

  useEffect(() => {
    animatedValue.value = withTiming(clampedScore, {
      duration: animationDuration,
      easing: Easing.out(Easing.cubic),
    });
  }, [clampedScore, animationDuration, animatedValue]);

  const animatedProps = useAnimatedProps(() => {
    const progress = animatedValue.value / 100;
    const strokeDashoffset = arcLength - arcLength * progress;
    return { strokeDashoffset };
  });

  const center = size / 2;
  // Start at 135° (bottom-left corner), arc goes clockwise
  const rotation = 135;

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#ef4444" />
            <Stop offset="25%" stopColor="#f97316" />
            <Stop offset="50%" stopColor="#eab308" />
            <Stop offset="75%" stopColor="#22c55e" />
            <Stop offset="100%" stopColor="#10b981" />
          </LinearGradient>
        </Defs>

        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          rotation={rotation}
          origin={`${center}, ${center}`}
        />

        {/* Animated progress arc */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation={rotation}
          origin={`${center}, ${center}`}
        />
      </Svg>

      {/* Center score display */}
      <View className="absolute items-center justify-center">
        {showValue && (
          <>
            <Text
              className="text-white font-bold"
              style={{ fontSize: size * 0.22, lineHeight: size * 0.26 }}
            >
              {Math.round(clampedScore)}
            </Text>
            <Text
              className="text-slate-400 font-medium"
              style={{ fontSize: size * 0.09 }}
            >
              {label ?? getScoreLabel(clampedScore)}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
