// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Chat Bubble
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text } from "react-native";
import Animated, {
  FadeInUp,
  FadeInDown,
} from "react-native-reanimated";
import type { ChatMessage } from "@/types";
import { StreamingText } from "./StreamingText";

interface ChatBubbleProps {
  readonly message: ChatMessage;
  readonly isLatest?: boolean;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatBubble({
  message,
  isLatest = false,
}: ChatBubbleProps): React.JSX.Element {
  const isUser = message.role === "user";
  const isStreaming = message.isStreaming === true;

  return (
    <Animated.View
      entering={isUser ? FadeInUp.duration(300) : FadeInDown.duration(300)}
      className={["flex-row mb-3", isUser ? "justify-end" : "justify-start"].join(" ")}
    >
      {!isUser && (
        <View className="w-8 h-8 rounded-full bg-brand-700 items-center justify-center mr-2 mt-1 flex-shrink-0">
          <Text className="text-white text-xs font-bold">AI</Text>
        </View>
      )}

      <View className={["max-w-[78%]", isUser ? "items-end" : "items-start"].join(" ")}>
        <View
          className={[
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-brand-600 rounded-tr-sm"
              : "bg-surface-700 border border-surface-600 rounded-tl-sm",
          ].join(" ")}
        >
          {isStreaming && isLatest ? (
            <StreamingText text={message.content} />
          ) : (
            <Text className={["text-sm leading-5", isUser ? "text-white" : "text-slate-200"].join(" ")}>
              {message.content}
            </Text>
          )}

          {isStreaming && isLatest && (
            <View className="flex-row gap-1 mt-1">
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  className="w-1 h-1 rounded-full bg-brand-400"
                  style={{ opacity: 0.4 + i * 0.3 }}
                />
              ))}
            </View>
          )}
        </View>

        <Text className="text-slate-600 text-xs mt-1 mx-1">
          {formatTime(message.createdAt)}
        </Text>
      </View>

      {isUser && (
        <View className="w-8 h-8 rounded-full bg-surface-600 items-center justify-center ml-2 mt-1 flex-shrink-0">
          <Text className="text-slate-300 text-xs font-bold">ME</Text>
        </View>
      )}
    </Animated.View>
  );
}
