// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Input component
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  type TextInputProps,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface InputProps extends TextInputProps {
  readonly label?: string;
  readonly error?: string;
  readonly hint?: string;
  readonly leftIcon?: React.ReactNode;
  readonly rightIcon?: React.ReactNode;
  readonly secureToggle?: boolean;
  readonly containerClassName?: string;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  secureToggle = false,
  secureTextEntry,
  containerClassName,
  onFocus,
  onBlur,
  ...props
}: InputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry ?? false);

  const borderOpacity = useSharedValue(0);
  const borderScale = useSharedValue(0.95);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    opacity: borderOpacity.value,
    transform: [{ scaleX: borderScale.value }],
  }));

  const handleFocus: TextInputProps["onFocus"] = (e) => {
    setIsFocused(true);
    borderOpacity.value = withTiming(1, { duration: 200 });
    borderScale.value = withSpring(1, { damping: 20 });
    onFocus?.(e);
  };

  const handleBlur: TextInputProps["onBlur"] = (e) => {
    setIsFocused(false);
    borderOpacity.value = withTiming(0, { duration: 200 });
    onBlur?.(e);
  };

  const hasError = error !== undefined && error.length > 0;

  return (
    <View className={["w-full", containerClassName].filter(Boolean).join(" ")}>
      {label !== undefined && (
        <Text className="text-slate-300 text-sm font-medium mb-1.5">{label}</Text>
      )}

      <View className="relative">
        {/* Focus ring */}
        <Animated.View
          style={animatedBorderStyle}
          className={[
            "absolute inset-0 rounded-xl border-2",
            hasError ? "border-red-500" : "border-brand-500",
          ].join(" ")}
          pointerEvents="none"
        />

        {/* Input container */}
        <View
          className={[
            "flex-row items-center rounded-xl border px-4",
            hasError
              ? "border-red-500 bg-red-950/20"
              : isFocused
              ? "border-brand-500/60 bg-surface-700"
              : "border-surface-600 bg-surface-800",
          ].join(" ")}
        >
          {leftIcon !== undefined && (
            <View className="mr-3">{leftIcon}</View>
          )}

          <TextInput
            className="flex-1 text-white text-base py-3.5"
            placeholderTextColor="#64748b"
            cursorColor="#8b5cf6"
            selectionColor="#7c3aed"
            onFocus={handleFocus}
            onBlur={handleBlur}
            secureTextEntry={secureToggle ? isSecure : secureTextEntry}
            {...props}
          />

          {secureToggle && (
            <TouchableOpacity
              onPress={() => setIsSecure((prev) => !prev)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="ml-2"
            >
              <Text className="text-slate-400 text-sm">
                {isSecure ? "Show" : "Hide"}
              </Text>
            </TouchableOpacity>
          )}

          {rightIcon !== undefined && !secureToggle && (
            <View className="ml-2">{rightIcon}</View>
          )}
        </View>
      </View>

      {hasError && (
        <Text className="text-red-400 text-xs mt-1.5 ml-1">{error}</Text>
      )}

      {hint !== undefined && !hasError && (
        <Text className="text-slate-500 text-xs mt-1.5 ml-1">{hint}</Text>
      )}
    </View>
  );
}
