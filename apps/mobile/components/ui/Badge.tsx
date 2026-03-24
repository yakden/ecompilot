// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Badge / Plan Badge component
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text } from "react-native";
import type { Plan } from "@/types";

type BadgeVariant = "plan" | "status" | "label";
type StatusType = "success" | "warning" | "error" | "info" | "neutral";

interface PlanBadgeProps {
  readonly plan: Plan;
  readonly size?: "sm" | "md";
}

interface StatusBadgeProps {
  readonly status: StatusType;
  readonly label: string;
  readonly size?: "sm" | "md";
}

interface LabelBadgeProps {
  readonly label: string;
  readonly color?: string;
  readonly size?: "sm" | "md";
}

type BadgeProps =
  | ({ variant: "plan" } & PlanBadgeProps)
  | ({ variant: "status" } & StatusBadgeProps)
  | ({ variant?: "label" } & LabelBadgeProps);

const planConfig: Record<Plan, { bg: string; text: string; border: string; label: string }> = {
  free: {
    bg: "bg-slate-700",
    text: "text-slate-300",
    border: "border-slate-600",
    label: "FREE",
  },
  pro: {
    bg: "bg-brand-900",
    text: "text-brand-300",
    border: "border-brand-700",
    label: "PRO",
  },
  business: {
    bg: "bg-amber-900",
    text: "text-amber-300",
    border: "border-amber-700",
    label: "BUSINESS",
  },
};

const statusConfig: Record<StatusType, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-green-900/50",
    text: "text-green-400",
    dot: "bg-green-400",
  },
  warning: {
    bg: "bg-amber-900/50",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  error: {
    bg: "bg-red-900/50",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  info: {
    bg: "bg-accent-600/20",
    text: "text-accent-400",
    dot: "bg-accent-400",
  },
  neutral: {
    bg: "bg-slate-700/50",
    text: "text-slate-400",
    dot: "bg-slate-400",
  },
};

export function Badge(props: BadgeProps): React.JSX.Element {
  const size = "size" in props ? (props.size ?? "md") : "md";
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  if (props.variant === "plan") {
    const config = planConfig[props.plan];
    return (
      <View
        className={[
          config.bg,
          "rounded-md border",
          config.border,
          padding,
          "flex-row items-center",
        ].join(" ")}
      >
        <Text className={[config.text, textSize, "font-bold tracking-wider"].join(" ")}>
          {config.label}
        </Text>
      </View>
    );
  }

  if (props.variant === "status") {
    const config = statusConfig[props.status];
    return (
      <View
        className={[
          config.bg,
          "rounded-full",
          padding,
          "flex-row items-center gap-1.5",
        ].join(" ")}
      >
        <View className={["w-1.5 h-1.5 rounded-full", config.dot].join(" ")} />
        <Text className={[config.text, textSize, "font-medium"].join(" ")}>
          {props.label}
        </Text>
      </View>
    );
  }

  // Default label badge
  return (
    <View className={["bg-brand-900/50 rounded-md", padding].join(" ")}>
      <Text className={["text-brand-300", textSize, "font-medium"].join(" ")}>
        {props.label}
      </Text>
    </View>
  );
}
