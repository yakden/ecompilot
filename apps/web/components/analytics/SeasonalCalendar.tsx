'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useSeasonal } from '@/hooks/use-analytics';
import { cn } from '@/lib/utils';

export function SeasonalCalendar() {
  const t = useTranslations('dashboard.analytics');
  const { data, isLoading } = useSeasonal();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!data) return null;

  const { currentMonth, calendar } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {calendar.map((m) => {
        const isCurrent = m.month === currentMonth;
        const barWidth = Math.round(m.demandIndex * 100 / 1.2);
        return (
          <div
            key={m.month}
            className={cn(
              'rounded-xl border p-4 transition-colors',
              isCurrent
                ? 'border-brand-500/50 bg-brand-500/5 dark:bg-brand-500/10'
                : 'border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/60',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className={cn(
                'text-sm font-semibold',
                isCurrent ? 'text-brand-600 dark:text-brand-400' : 'text-slate-900 dark:text-white',
              )}>
                {m.name}
              </h3>
              {isCurrent && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-brand-600 dark:text-brand-400">
                  {t('currentMonth')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1 mb-3">
              {m.events.map((event) => (
                <span
                  key={event}
                  className="inline-block rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-400"
                >
                  {event}
                </span>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('seasonDemand')}
                </span>
                <span className={cn(
                  'text-xs font-semibold',
                  m.demandIndex >= 1.0
                    ? 'text-green-600 dark:text-green-400'
                    : m.demandIndex >= 0.85
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400',
                )}>
                  {m.demandIndex.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/50 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    m.demandIndex >= 1.0
                      ? 'bg-green-500'
                      : m.demandIndex >= 0.85
                        ? 'bg-amber-500'
                        : 'bg-slate-400',
                  )}
                  style={{ width: `${String(barWidth)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
