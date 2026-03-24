// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — AI Chat Screen with SSE streaming
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChatBubble } from "@/components/ai/ChatBubble";
import { useAuthStore } from "@/stores/auth.store";
import { streamChat } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import type { ChatMessage } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createUserMessage(content: string): ChatMessage {
  return {
    id: generateId(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

function createAssistantMessage(content: string, streaming = false): ChatMessage {
  return {
    id: generateId(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    isStreaming: streaming,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AiChatScreen(): React.JSX.Element {
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);

  const [sessionId] = useState(() => generateId());
  const [messages, setMessages] = useState<ChatMessage[]>([
    createAssistantMessage(t.chat.welcomeMessage),
  ]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(async (): Promise<void> => {
    const text = inputText.trim();
    if (text.length === 0 || isStreaming) return;

    setInputText("");

    const userMessage = createUserMessage(text);
    setMessages((prev) => [...prev, userMessage]);

    const assistantMsgId = generateId();
    streamingIdRef.current = assistantMsgId;

    const streamingMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, streamingMsg]);
    setIsStreaming(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let accumulated = "";

      for await (const chunk of streamChat(sessionId, text, controller.signal)) {
        if (chunk.type === "delta" && chunk.content !== undefined) {
          accumulated += chunk.content;
          const captured = accumulated;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: captured, isStreaming: true }
                : msg
            )
          );
        } else if (chunk.type === "done" || chunk.type === "error") {
          break;
        }
      }

      // Finalize message (stop streaming indicator)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: t.chat.errorMessage,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      streamingIdRef.current = null;
    }
  }, [inputText, isStreaming, sessionId, t.chat.errorMessage]);

  const handleNewChat = (): void => {
    abortRef.current?.abort();
    setMessages([createAssistantMessage(t.chat.welcomeMessage)]);
    setIsStreaming(false);
    setInputText("");
  };

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <ChatBubble
        message={item}
        isLatest={index === messages.length - 1}
      />
    ),
    [messages.length]
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <SafeAreaView className="flex-1 bg-surface-900" edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-surface-700">
          <View>
            <Text className="text-white text-lg font-bold">{t.chat.title}</Text>
            {user !== null && (
              <Text className="text-slate-500 text-xs capitalize">
                {user.plan} plan
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleNewChat}
            className="bg-surface-700 border border-surface-600 rounded-xl px-3 py-1.5"
          >
            <Text className="text-slate-300 text-sm">{t.chat.newChat}</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          removeClippedSubviews={false}
        />

        {/* Streaming indicator */}
        {isStreaming && (
          <View className="flex-row items-center gap-2 px-5 py-1">
            <ActivityIndicator size="small" color="#8b5cf6" />
            <Text className="text-slate-500 text-xs">{t.chat.thinking}</Text>
          </View>
        )}

        {/* Input */}
        <Animated.View
          entering={FadeInDown.duration(300)}
          className="flex-row items-end gap-2 px-4 py-3 border-t border-surface-700 bg-surface-800"
        >
          <TextInput
            className="flex-1 bg-surface-700 border border-surface-600 rounded-2xl px-4 py-3 text-white text-sm max-h-28"
            placeholder={t.chat.placeholder}
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => void handleSend()}
          />

          <TouchableOpacity
            onPress={() => void handleSend()}
            disabled={inputText.trim().length === 0 || isStreaming}
            className={[
              "w-11 h-11 rounded-full items-center justify-center",
              inputText.trim().length > 0 && !isStreaming
                ? "bg-brand-600"
                : "bg-surface-700",
            ].join(" ")}
          >
            {isStreaming ? (
              <View className="w-3 h-3 rounded-sm bg-slate-400" />
            ) : (
              <Text className="text-white text-base">↑</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
