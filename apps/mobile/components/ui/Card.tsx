// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Card component
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, type ViewProps } from "react-native";

interface CardProps extends ViewProps {
  readonly children: React.ReactNode;
  readonly variant?: "default" | "elevated" | "bordered" | "glass";
  readonly padding?: "none" | "sm" | "md" | "lg";
  readonly className?: string;
}

const variantClasses = {
  default: "bg-surface-800 rounded-2xl",
  elevated: "bg-surface-800 rounded-2xl shadow-lg",
  bordered: "bg-surface-800 rounded-2xl border border-surface-600",
  glass: "bg-surface-800/70 rounded-2xl border border-surface-600/50",
} as const;

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
} as const;

export function Card({
  children,
  variant = "default",
  padding = "md",
  className,
  style,
  ...props
}: CardProps): React.JSX.Element {
  return (
    <View
      className={[variantClasses[variant], paddingClasses[padding], className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}
