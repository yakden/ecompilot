'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, LogOut, Settings, ChevronDown, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/providers/sidebar-provider';

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const { user, logout } = useAuthStore();
  const { toggle } = useSidebar();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80 px-4 md:px-6 backdrop-blur-sm sticky top-0 z-10">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={toggle}
        className="md:hidden flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-3">
        {/* Notifications */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-500" />
        </button>

        {/* Theme Toggle */}
        <ThemeToggle compact />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* User Menu */}
        {user ? (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600/20 border border-brand-600/30">
                <span className="text-xs font-semibold text-brand-600 dark:text-brand-300">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="hidden md:block text-sm font-medium text-slate-700 dark:text-slate-200 max-w-24 truncate">
                {user.name}
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-slate-400 transition-transform duration-200',
                  userMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-xl shadow-slate-200/60 dark:shadow-black/50 animate-fade-in">
                <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{user.email}</p>
                  <span className="mt-1.5 inline-block rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-300 uppercase tracking-wider">
                    {user.plan}
                  </span>
                </div>
                <div className="p-1">
                  <Link
                    href={`/${locale}/settings`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    {t('dashboard')}
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/login`}
              className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors px-3 py-2"
            >
              {t('login')}
            </Link>
            <Link
              href={`/${locale}/register`}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
            >
              {t('register')}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
