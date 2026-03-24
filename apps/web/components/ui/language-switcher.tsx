'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect, useTransition } from 'react';
import { cn } from '@/lib/utils';

const languages = [
  { code: 'ru', flag: '🇷🇺', name: 'Русский', short: 'RU' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski', short: 'PL' },
  { code: 'ua', flag: '🇺🇦', name: 'Українська', short: 'UA' },
  { code: 'en', flag: '🇬🇧', name: 'English', short: 'EN' },
] as const;

type LanguageCode = (typeof languages)[number]['code'];

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const locale = useLocale() as LanguageCode;
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === locale) ?? languages[0];

  function handleLocaleChange(newLocale: LanguageCode) {
    setIsOpen(false);
    // Replace the locale segment in the pathname
    // pathname is like /ru/calculator or /pl/suppliers
    const segments = pathname.split('/');
    if (segments.length > 1 && ['ru', 'pl', 'ua', 'en'].includes(segments[1] ?? '')) {
      segments[1] = newLocale;
    } else {
      segments.splice(1, 0, newLocale);
    }
    const newPath = segments.join('/') || `/${newLocale}`;
    startTransition(() => {
      router.push(newPath);
      router.refresh();
    });
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2',
          'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          'dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
          'text-sm transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-brand-600'
        )}
        aria-label="Switch language"
        aria-expanded={isOpen}
      >
        <span className="text-base leading-none">{isPending ? '⏳' : currentLang.flag}</span>
        <span className="font-medium text-xs">{currentLang.short}</span>
        {!compact && (
          <span className="hidden sm:inline font-medium">{currentLang.name}</span>
        )}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-slate-400 dark:text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-xl shadow-slate-200/60 dark:shadow-black/50 animate-fade-in">
          <div className="p-1">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLocaleChange(lang.code)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
                  locale === lang.code
                    ? 'bg-brand-600/10 text-brand-600 dark:bg-brand-600/20 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                )}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="font-medium">{lang.name}</span>
                {locale === lang.code && (
                  <Check className="ml-auto h-3.5 w-3.5 text-brand-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
