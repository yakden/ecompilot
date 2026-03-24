'use client';

import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import {
  DollarSign,
  ShoppingCart,
  Percent,
  Package,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/hooks/use-analytics';
import { RevenueChart } from './RevenueChart';
import { CategoryBreakdown } from './CategoryBreakdown';

function formatPln(grosze: number): string {
  return (grosze / 100).toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p className="text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      {sub !== undefined && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score >= 70) return 'text-green-600 dark:text-green-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

interface AnalyticsDashboardProps {
  onSwitchToNiches?: () => void;
}

export function AnalyticsDashboard({ onSwitchToNiches }: AnalyticsDashboardProps) {
  const t = useTranslations('dashboard.analytics');
  const { data, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500 dark:text-slate-400">
        {t('noData')}
      </div>
    );
  }

  const { kpis, revenueLast30, topProducts, categoryBreakdown, recentAnalyses } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
        <StatCard
          icon={DollarSign}
          label={t('totalRevenue')}
          value={`${formatPln(kpis.totalRevenue)} PLN`}
          iconColor="text-brand-400"
        />
        <StatCard
          icon={ShoppingCart}
          label={t('totalSold')}
          value={String(kpis.totalSold)}
          iconColor="text-green-400"
        />
        <StatCard
          icon={Percent}
          label={t('avgMargin')}
          value={`${String(kpis.avgMargin)}%`}
          iconColor="text-amber-400"
        />
        <StatCard
          icon={Package}
          label={t('totalProducts')}
          value={String(kpis.totalProducts)}
          iconColor="text-indigo-400"
        />
      </div>

      {/* Revenue Chart */}
      <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 md:p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
          {t('revenueTrend')}
        </h2>
        <RevenueChart data={revenueLast30} label={t('noData')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Top Products */}
        <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {t('topProductsTitle')}
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                    <th className="pb-2 text-xs font-medium text-slate-500 dark:text-slate-400">#</th>
                    <th className="pb-2 text-xs font-medium text-slate-500 dark:text-slate-400 pl-2">{t('topProducts')}</th>
                    <th className="pb-2 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">{t('revenue')}</th>
                    <th className="pb-2 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">{t('sold')}</th>
                    <th className="pb-2 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">{t('margin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.sku} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                      <td className="py-2.5 text-slate-400 dark:text-slate-500 font-medium">
                        {String(i + 1)}
                      </td>
                      <td className="py-2.5 pl-2">
                        <div className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{p.sku}</div>
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {formatPln(p.revenue)}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 dark:text-slate-300">
                        {String(p.sold)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className={cn(
                          'font-medium',
                          p.margin >= 30 ? 'text-green-600 dark:text-green-400' :
                          p.margin >= 15 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400',
                        )}>
                          {String(p.margin)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 md:p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {t('categoriesTitle')}
          </h2>
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('noData')}</p>
          ) : (
            <CategoryBreakdown
              data={categoryBreakdown}
              labels={{ products: t('totalProducts'), sold: t('sold') }}
            />
          )}
        </div>
      </div>

      {/* Recent Niche Analyses */}
      {recentAnalyses.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/60 p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('recentAnalyses')}
            </h2>
            {onSwitchToNiches && (
              <button
                onClick={onSwitchToNiches}
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                {t('tabNiches')} &rarr;
              </button>
            )}
          </div>
          <div className="space-y-3">
            {recentAnalyses.map((a) => (
              <div
                key={`${a.keyword}-${a.analyzedAt}`}
                className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"
              >
                <TrendingUp className="h-4 w-4 shrink-0 text-brand-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {a.keyword}
                  </p>
                  {a.recommendation && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {a.recommendation}
                    </p>
                  )}
                </div>
                <span className={cn('text-sm font-bold', scoreColor(a.score))}>
                  {a.score !== null ? String(a.score) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
