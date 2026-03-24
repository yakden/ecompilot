'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import type { Theme } from '@/providers/theme-provider';

const OPTIONS: Array<{ value: Theme; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const CurrentIcon = current.Icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Toggle theme"
        className={cn(
          'flex items-center gap-2 rounded-lg transition-colors',
          'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          compact ? 'p-2' : 'px-3 py-2 text-sm font-medium'
        )}
      >
        <CurrentIcon className="h-4 w-4 shrink-0" />
        {!compact && <span className="hidden sm:inline">{current.label}</span>}
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-full z-50 mt-2 w-36 rounded-xl border shadow-xl',
            'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
            'shadow-slate-200/60 dark:shadow-black/50',
            'animate-fade-in'
          )}
        >
          <div className="p-1">
            {OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  theme === value
                    ? 'bg-brand-600/10 text-brand-600 dark:bg-brand-600/15 dark:text-brand-300 font-medium'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
