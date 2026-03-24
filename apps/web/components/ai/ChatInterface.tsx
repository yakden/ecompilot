'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Send, Bot, User, Sparkles, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChat } from '@/hooks/use-chat';

export function ChatInterface() {
  const t = useTranslations('ai');
  const { messages: hookMessages, isLoading, sendMessage, resetChat } = useChat();
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestedQuestions = t.raw('suggestedQuestions') as string[];

  const welcomeMessage = {
    id: 'welcome',
    role: 'assistant' as const,
    content: t('welcomeMessage'),
    timestamp: new Date(),
    isStreaming: false,
  };

  const allMessages = hookMessages.length === 0
    ? [welcomeMessage]
    : hookMessages;

  function scrollToBottom() {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }

  useEffect(() => {
    scrollToBottom();
  }, [allMessages]);

  async function handleSend(messageText?: string) {
    const text = messageText ?? input;
    if (!text.trim() || isLoading) return;

    setInput('');
    await sendMessage(text.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleReset() {
    resetChat();
    setInput('');
  }

  const showSuggested = hookMessages.length === 0;

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600/20 border border-brand-600/30">
            <Bot className="h-4 w-4 text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('title')}</p>
            <p className="text-[11px] text-green-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              {t('online')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-8 w-8 p-0 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"
          title={t('resetChat')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-3 md:p-4">
        <div className="space-y-4">
          {allMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  message.role === 'assistant'
                    ? 'bg-brand-600/20 border border-brand-600/30'
                    : 'bg-slate-700'
                )}
              >
                {message.role === 'assistant' ? (
                  <Bot className="h-4 w-4 text-brand-400" />
                ) : (
                  <User className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-3',
                  message.role === 'user'
                    ? 'bg-brand-600/20 border border-brand-600/30 text-slate-100 rounded-tr-sm'
                    : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                )}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                  {message.isStreaming && (
                    <span className="inline-block h-4 w-0.5 bg-brand-400 ml-0.5 animate-pulse" />
                  )}
                </p>
                <p className="mt-1.5 text-[10px] text-slate-600">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Thinking indicator when waiting for first token */}
          {isLoading && allMessages[allMessages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600/20 border border-brand-600/30">
                <Bot className="h-4 w-4 text-brand-400" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.3s]" />
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.15s]" />
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggested Questions */}
      {showSuggested && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {t('suggestedQuestionsLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question, idx) => (
              <button
                key={idx}
                onClick={() => void handleSend(question)}
                disabled={isLoading}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:text-white transition-colors disabled:opacity-50 text-left"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-slate-100 dark:border-slate-800 p-3 md:p-4">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder')}
            rows={1}
            disabled={isLoading}
            className={cn(
              'flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-3',
              'text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'max-h-32 transition-colors scrollbar-thin'
            )}
            style={{ minHeight: '44px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <Button
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim()}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-slate-600 text-center">
          {t('enterToSend')}
        </p>
      </div>
    </div>
  );
}
