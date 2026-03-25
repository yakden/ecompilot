// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — Dashboard Overview Page
// Main seller dashboard: stats, compliance widget, quick actions
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  BarChart3,
  Bot,
  BookOpen,
  Calculator,
  Package,
  Zap,
  TrendingUp,
  MessageSquare,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { OverviewStats } from '@/components/dashboard/OverviewStats';
import { ComplianceWidget } from '@/components/dashboard/ComplianceWidget';

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return {
    title: `EcomPilot PL — ${t('dashboard')}`,
    description: 'Your seller command center — stats, compliance, and quick actions.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick action items
// ─────────────────────────────────────────────────────────────────────────────

interface QuickAction {
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly color: string;
  readonly bg: string;
  readonly border: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent activity mock data type
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityItem {
  readonly id: string;
  readonly type: 'order' | 'review' | 'alert' | 'message';
  readonly title: string;
  readonly subtitle: string;
  readonly time: string;
  readonly status?: 'positive' | 'negative' | 'neutral';
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tNav = await getTranslations({ locale, namespace: 'nav' });

  const quickActions: QuickAction[] = [
    {
      href: `/${locale}/analytics`,
      label: 'Niche Analysis',
      description: 'Find profitable products',
      icon: BarChart3,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20 hover:border-violet-500/40',
    },
    {
      href: `/${locale}/ai-assistant`,
      label: 'AI Assistant',
      description: 'Ask anything about selling',
      icon: Bot,
      color: 'text-brand-400',
      bg: 'bg-brand-500/10',
      border: 'border-brand-500/20 hover:border-brand-500/40',
    },
    {
      href: `/${locale}/calculator`,
      label: 'Margin Calculator',
      description: 'Calculate profitability',
      icon: Calculator,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20 hover:border-amber-500/40',
    },
    {
      href: `/${locale}/suppliers`,
      label: 'Find Suppliers',
      description: 'Source from China & EU',
      icon: Package,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
    },
    {
      href: `/${locale}/academy`,
      label: 'Academy',
      description: 'Learn marketplace selling',
      icon: BookOpen,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/20 hover:border-sky-500/40',
    },
    {
      href: `/${locale}/community`,
      label: 'Community',
      description: 'Connect with sellers',
      icon: MessageSquare,
      color: 'text-pink-400',
      bg: 'bg-pink-500/10',
      border: 'border-pink-500/20 hover:border-pink-500/40',
    },
  ];

  const recentActivity: ActivityItem[] = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      type: 'order',
      title: 'New order #48291',
      subtitle: 'iPhone 15 Case — PLN 39.99',
      time: '2 min ago',
      status: 'positive',
    },
    {
      id: '2',
      type: 'review',
      title: '5-star review received',
      subtitle: 'Wireless Earbuds Pro — "Excellent quality!"',
      time: '18 min ago',
      status: 'positive',
    },
    {
      id: '3',
      type: 'alert',
      title: 'Late shipment warning',
      subtitle: 'Order #48187 is approaching the SLA deadline',
      time: '1h ago',
      status: 'negative',
    },
    {
      id: '4',
      type: 'message',
      title: 'Buyer question',
      subtitle: 'Regarding delivery time for order #48246',
      time: '2h ago',
      status: 'neutral',
    },
    {
      id: '5',
      type: 'order',
      title: 'New order #48279',
      subtitle: 'USB-C Hub 7-in-1 — PLN 89.99',
      time: '3h ago',
      status: 'positive',
    },
  ];

  function activityIcon(type: ActivityItem['type']) {
    switch (type) {
      case 'order': return Package;
      case 'review': return TrendingUp;
      case 'alert': return Bell;
      case 'message': return MessageSquare;
    }
  }

  function activityIconColors(type: ActivityItem['type']) {
    switch (type) {
      case 'order': return { color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
      case 'review': return { color: 'text-amber-400', bg: 'bg-amber-500/10' };
      case 'alert': return { color: 'text-red-400', bg: 'bg-red-500/10' };
      case 'message': return { color: 'text-blue-400', bg: 'bg-blue-500/10' };
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto w-full">

        {/* Page title */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/20 border border-brand-600/30 shrink-0">
            <Zap className="h-4 w-4 text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
              {tNav('dashboard')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your marketplace command center — everything you need to grow.
            </p>
          </div>
        </div>

        {/* Overview stats */}
        <OverviewStats />

        {/* Quick actions */}
        <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Quick Actions</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">All tools</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`group flex flex-col gap-2 md:gap-2.5 rounded-xl border p-3 md:p-4 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 ${action.border}`}
                >
                  <div
                    className={`flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg ${action.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${action.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-100 leading-tight truncate">
                      {action.label}
                    </p>
                    <p className="text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Compliance widget */}
        <ComplianceWidget
          riskScore={82}
          riskLevel="low"
          lastChecked={new Date().toISOString()}
        />

        {/* Recent activity */}
        <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Activity</h3>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              View all
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {recentActivity.map((item) => {
              const Icon = activityIcon(item.type);
              const { color, bg } = activityIconColors(item.type);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg p-3 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}
                  >
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-400 dark:text-slate-600 whitespace-nowrap">
                    {item.time}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

    </div>
  );
}
