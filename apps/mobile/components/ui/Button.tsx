// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Button component
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type TouchableOpacityProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends TouchableOpacityProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  readonly children: React.ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const variantClasses: Record<ButtonVariant, { container: string; text: string }> = {
  primary: {
    container: "bg-brand-600 border border-brand-500",
    text: "text-white font-semibold",
  },
  secondary: {
    container: "bg-surface-700 border border-surface-600",
    text: "text-white font-semibold",
  },
  outline: {
    container: "bg-transparent border border-brand-500",
    text: "text-brand-400 font-semibold",
  },
  ghost: {
    container: "bg-transparent border border-transparent",
    text: "text-brand-400 font-medium",
  },
  danger: {
    container: "bg-red-600 border border-red-500",
    text: "text-white font-semibold",
  },
};

const sizeClasses: Record<ButtonSize, { container: string; text: string }> = {
  sm: {
    container: "px-3 py-2 rounded-lg",
    text: "text-sm",
  },
  md: {
    container: "px-5 py-3.5 rounded-xl",
    text: "text-base",
  },
  lg: {
    container: "px-6 py-4 rounded-xl",
    text: "text-lg",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  children,
  disabled,
  style,
  onPress,
  ...rest
}: ButtonProps): React.JSX.Element {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (): void => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = (): void => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const { container, text } = variantClasses[variant];
  const { container: sizeContainer, text: sizeText } = sizeClasses[size];

  const isDisabled = disabled === true || loading;

  return (
    <AnimatedTouchable
      style={[animatedStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.9}
      {...rest}
      className={[
        container,
        sizeContainer,
        fullWidth ? "w-full items-center" : "items-center self-start",
        "flex-row justify-center",
        isDisabled ? "opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "outline" || variant === "ghost" ? "#a78bfa" : "#ffffff"}
        />
      ) : (
        <Text className={[text, sizeText].join(" ")}>{children}</Text>
      )}
    </AnimatedTouchable>
  );
}
