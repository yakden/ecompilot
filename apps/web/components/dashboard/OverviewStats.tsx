'use client';

// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — OverviewStats
// Key seller statistics grid for dashboard overview
// ─────────────────────────────────────────────────────────────────────────────

import {
  ShoppingBag,
  Package,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TrendDirection = 'up' | 'down' | 'neutral';

interface StatItem {
  readonly label: string;
  readonly value: string;
  readonly subValue?: string;
  readonly trend?: number;
  readonly trendDirection?: TrendDirection;
  readonly trendLabel?: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconColor: string;
  readonly iconBg: string;
}

interface OverviewStatsProps {
  readonly stats?: readonly StatItem[];
  readonly className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend indicator
// ─────────────────────────────────────────────────────────────────────────────

function TrendBadge({
  direction,
  value,
  label,
}: {
  direction: TrendDirection;
  value?: number;
  label?: string;
}) {
  if (direction === 'neutral' || value === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
        <Minus className="h-3 w-3" />
        {label ?? 'No change'}
      </span>
    );
  }

  const isUp = direction === 'up';
  const TrendIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium',
        isUp ? 'text-emerald-400' : 'text-red-400',
      )}
    >
      <TrendIcon className="h-3 w-3" />
      {value > 0 ? '+' : ''}
      {value.toFixed(1)}%
      {label && <span className="text-slate-500 dark:text-slate-400 font-normal">{label}</span>}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default mock stats (replaced with real data via props)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_STATS: readonly StatItem[] = [
  {
    label: 'Total Sales',
    value: '1,284',
    subValue: 'this month',
    trend: 12.4,
    trendDirection: 'up',
    trendLabel: 'vs last month',
    icon: ShoppingBag,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    label: 'Active Listings',
    value: '347',
    subValue: 'across all platforms',
    trend: 5.2,
    trendDirection: 'up',
    trendLabel: 'new this week',
    icon: Package,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    label: 'Pending Orders',
    value: '23',
    subValue: 'awaiting shipment',
    trend: -8.0,
    trendDirection: 'down',
    trendLabel: 'vs yesterday',
    icon: Clock,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    label: 'Revenue (MTD)',
    value: 'PLN 48,920',
    subValue: 'month-to-date',
    trend: 18.7,
    trendDirection: 'up',
    trendLabel: 'vs last month',
    icon: TrendingUp,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OverviewStats
// ─────────────────────────────────────────────────────────────────────────────

export function OverviewStats({ stats = DEFAULT_STATS, className }: OverviewStatsProps) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4', className)}>
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 flex flex-col gap-3"
          >
            {/* Icon + label */}
            <div className="flex items-center justify-between">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg border',
                  stat.iconBg,
                )}
              >
                <Icon className={cn('h-4.5 w-4.5', stat.iconColor)} />
              </div>
              {stat.trendDirection && (
                <TrendBadge
                  direction={stat.trendDirection}
                  value={stat.trend}
                  label={undefined}
                />
              )}
            </div>

            {/* Value */}
            <div className="flex flex-col gap-0.5">
              <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-tight truncate">
                {stat.value}
              </span>
              {stat.subValue && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{stat.subValue}</span>
              )}
            </div>

            {/* Label + trend label */}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-300">{stat.label}</span>
              {stat.trendDirection && (
                <TrendBadge
                  direction={stat.trendDirection}
                  value={stat.trend}
                  label={stat.trendLabel}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
