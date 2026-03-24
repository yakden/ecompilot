// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Streaming Text (word-by-word animation)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
} from "react-native-reanimated";

interface StreamingTextProps {
  readonly text: string;
  readonly wordDelay?: number;
  readonly textClassName?: string;
}

interface AnimatedWordProps {
  readonly word: string;
  readonly index: number;
  readonly delay: number;
}

function AnimatedWord({ word, delay }: AnimatedWordProps): React.JSX.Element {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(4);

  useEffect(() => {
    const timeout = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 200 });
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text style={animatedStyle} className="text-slate-200 text-sm">
      {word}{" "}
    </Animated.Text>
  );
}

export function StreamingText({
  text,
  wordDelay = 40,
}: StreamingTextProps): React.JSX.Element {
  const words = text.split(" ").filter((w) => w.length > 0);

  // For very long texts, skip animation and just show the text
  if (words.length > 100) {
    return (
      <Text className="text-slate-200 text-sm leading-5">{text}</Text>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(200)} className="flex-row flex-wrap">
      {words.map((word, index) => (
        <AnimatedWord
          key={`${word}-${index}`}
          word={word}
          index={index}
          delay={index * wordDelay}
        />
      ))}
    </Animated.View>
  );
}
