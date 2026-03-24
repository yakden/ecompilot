'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  BarChart3,
  Bot,
  BookOpen,
  Calculator,
  FileText,
  Home,
  MessageSquare,
  Package,
  Boxes,
  Settings,
  Sparkles,
  Zap,
  ChevronRight,
  Scale,
  ShoppingBag,
  Image,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useSidebar } from '@/providers/sidebar-provider';

const navItems = [
  { key: 'overview', href: '', icon: Home },
  { key: 'analytics', href: '/analytics', icon: BarChart3 },
  { key: 'calculator', href: '/calculator', icon: Calculator },
  { key: 'suppliers', href: '/suppliers', icon: Package },
  { key: 'aiAssistant', href: '/ai-assistant', icon: Bot },
  { key: 'guides', href: '/guides', icon: Scale },
  { key: 'inventory', href: '/inventory', icon: Boxes },
  { key: 'marketplace', href: '/marketplace', icon: ShoppingBag },
  { key: 'ksef', href: '/ksef', icon: FileText },
  { key: 'content', href: '/content', icon: Image },
  { key: 'academy', href: '/academy', icon: BookOpen },
  { key: 'community', href: '/community', icon: MessageSquare },
  { key: 'settings', href: '/settings', icon: Settings },
] as const;

type NavKey = (typeof navItems)[number]['key'];

const NAV_LABELS: Record<string, Record<NavKey, string>> = {
  ru: {
    overview: 'Обзор',
    analytics: 'Анализ ниш',
    aiAssistant: 'ИИ-ассистент',
    suppliers: 'Поставщики',
    inventory: 'Склад',
    calculator: 'Калькулятор',
    guides: 'Правовые гайды',
    marketplace: 'Маркетплейс',
    ksef: 'KSeF',
    content: 'Контент-инструменты',
    academy: 'Академия',
    community: 'Сообщество',
    settings: 'Настройки',
  },
  pl: {
    overview: 'Przegląd',
    analytics: 'Analiza nisz',
    aiAssistant: 'Asystent AI',
    suppliers: 'Dostawcy',
    inventory: 'Magazyn',
    calculator: 'Kalkulator',
    guides: 'Przewodniki prawne',
    marketplace: 'Marketplace',
    ksef: 'KSeF',
    content: 'Narzędzia treści',
    academy: 'Akademia',
    community: 'Społeczność',
    settings: 'Ustawienia',
  },
  ua: {
    overview: 'Огляд',
    analytics: 'Аналіз ніш',
    aiAssistant: 'ШІ-асистент',
    suppliers: 'Постачальники',
    inventory: 'Склад',
    calculator: 'Калькулятор',
    guides: 'Правові гайди',
    marketplace: 'Маркетплейс',
    ksef: 'KSeF',
    content: 'Контент-інструменти',
    academy: 'Академія',
    community: 'Спільнота',
    settings: 'Налаштування',
  },
  en: {
    overview: 'Overview',
    analytics: 'Niche Analysis',
    aiAssistant: 'AI Assistant',
    suppliers: 'Suppliers',
    inventory: 'Inventory',
    calculator: 'Calculator',
    guides: 'Legal Guides',
    marketplace: 'Marketplace',
    ksef: 'KSeF',
    content: 'Content Tools',
    academy: 'Academy',
    community: 'Community',
    settings: 'Settings',
  },
};

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const t = useTranslations('dashboard.nav');
  const locale = useLocale();

  function safeTranslate(key: string): string {
    try {
      return t(key as NavKey);
    } catch {
      return NAV_LABELS[locale]?.[key as NavKey] ?? NAV_LABELS['en']?.[key as NavKey] ?? key;
    }
  }

  const pathname = usePathname();
  const { user } = useAuthStore();
  const { isOpen, close } = useSidebar();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const dashboardBase = `/${locale}`;

  const planColors = {
    free: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    pro: 'bg-brand-600/30 text-brand-700 border border-brand-600/40 dark:text-brand-300',
    business:
      'bg-amber-100 text-amber-700 border border-amber-300/40 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40',
  };

  const planIcons = {
    free: null,
    pro: <Zap className="h-3 w-3" />,
    business: <Sparkles className="h-3 w-3" />,
  };

  const sidebarContent = (
    <aside
      className={cn(
        'flex h-full w-64 flex-col',
        'border-r border-slate-200 bg-slate-50',
        'dark:border-slate-800 dark:bg-slate-950',
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-bg">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-slate-900 dark:text-white text-sm">EcomPilot</span>
          <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wider uppercase">
            PL PLATFORM
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const href = `${dashboardBase}${item.href}`;
          const isActive =
            item.href === ''
              ? pathname === dashboardBase || pathname === `${dashboardBase}/`
              : pathname.startsWith(`${dashboardBase}${item.href}`);
          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              href={href}
              onClick={close}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-brand-600/15 text-brand-700 border border-brand-600/25 dark:text-brand-300'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                )}
              />
              <span>{safeTranslate(item.key)}</span>
              {isActive && (
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-brand-500 dark:text-brand-500" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Plan Badge */}
      {mounted && user && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-4">
          <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-transparent p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                {safeTranslate('currentPlan')}
              </span>
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  planColors[user.plan]
                )}
              >
                {planIcons[user.plan]}
                {user.plan.toUpperCase()}
              </span>
            </div>
            {user.plan === 'free' && (
              <>
                <div className="mb-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full w-3/5 rounded-full bg-brand-600" />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{safeTranslate('analysesUsed')}</p>
                <Link
                  href={`/${locale}/pricing`}
                  onClick={close}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600/20 border border-brand-600/30 py-1.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300 hover:bg-brand-600/30 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  {safeTranslate('upgradeToPro')}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex h-full w-64 shrink-0">{sidebarContent}</div>

      {/* Mobile: overlay drawer */}
      {mounted && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              'fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300',
              isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
            onClick={close}
            aria-hidden="true"
          />
          {/* Slide-in drawer */}
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-64 md:hidden transform transition-transform duration-300 ease-in-out',
              isOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}
