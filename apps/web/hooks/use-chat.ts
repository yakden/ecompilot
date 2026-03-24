'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth.store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface SSEChunk {
  text?: string;
  sessionId?: string;
  done?: boolean;
  error?: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  sessionId: string | null;
  sendMessage: (text: string) => Promise<void>;
  resetChat: () => void;
}

export function useChat(): UseChatReturn {
  const { user, accessToken } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const assistantId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    abortControllerRef.current = new AbortController();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      if (user?.id) headers['x-user-id'] = user.id;
      if (user?.plan) headers['x-user-plan'] = user.plan;

      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text.trim(),
          sessionId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok || !response.body) {
        const json = await response.json().catch(() => ({}));
        const errMsg = json.error?.message ?? json.message ?? `HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr) as SSEChunk;

            if (chunk.sessionId && !sessionId) {
              setSessionId(chunk.sessionId);
            }

            if (chunk.text) {
              accumulated += chunk.text;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: accumulated, isStreaming: !chunk.done }
                    : msg
                )
              );
            }

            if (chunk.done) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, isStreaming: false } : msg
                )
              );
            }

            if (chunk.error) {
              throw new Error(chunk.error);
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: `Error: ${errorMessage}. Please try again.`,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, isStreaming: false } : msg
        )
      );
    }
  }, [isLoading, sessionId, accessToken, user]);

  const resetChat = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
    setSessionId(null);
  }, []);

  return { messages, isLoading, sessionId, sendMessage, resetChat };
}
