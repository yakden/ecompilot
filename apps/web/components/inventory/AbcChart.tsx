'use client';

import type { AbcStats } from '@/hooks/use-inventory';
import { cn } from '@/lib/utils';

interface AbcChartProps {
  stats: AbcStats;
  className?: string;
}

interface ClassConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  description: string;
}

const CLASS_CONFIG: Record<'A' | 'B' | 'C', ClassConfig> = {
  A: {
    label: 'Klasa A',
    color: '#22c55e',
    bgColor: 'bg-green-500/15',
    borderColor: 'border-green-500/40',
    textColor: 'text-green-400',
    description: '80% przychodu',
  },
  B: {
    label: 'Klasa B',
    color: '#f59e0b',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/40',
    textColor: 'text-amber-400',
    description: '15% przychodu',
  },
  C: {
    label: 'Klasa C',
    color: '#64748b',
    bgColor: 'bg-slate-500/15',
    borderColor: 'border-slate-500/40',
    textColor: 'text-slate-400',
    description: '5% przychodu',
  },
};

interface BarSegmentProps {
  pct: number;
  color: string;
  label: string;
}

function BarSegment({ pct, color, label }: BarSegmentProps) {
  return (
    <div
      className="relative flex items-center justify-center text-[10px] font-bold text-slate-900 dark:text-white transition-all duration-500"
      style={{
        width: `${String(pct)}%`,
        backgroundColor: color,
        minWidth: pct > 3 ? undefined : '0px',
        overflow: 'hidden',
      }}
      title={`${label}: ${String(pct)}%`}
    >
      {pct > 8 && <span>{String(pct)}%</span>}
    </div>
  );
}

export function AbcChart({ stats, className }: AbcChartProps) {
  const classes = [
    {
      key: 'A' as const,
      productsPct: stats.aProductsPct,
      revenuePct: stats.aRevenuePct,
    },
    {
      key: 'B' as const,
      productsPct: stats.bProductsPct,
      revenuePct: stats.bRevenuePct,
    },
    {
      key: 'C' as const,
      productsPct: stats.cProductsPct,
      revenuePct: stats.cRevenuePct,
    },
  ];

  const totalRevenuePln = stats.totalRevenue / 100;

  return (
    <div className={cn('space-y-5', className)}>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {classes.map(({ key, productsPct, revenuePct }) => {
          const cfg = CLASS_CONFIG[key];
          return (
            <div
              key={key}
              className={cn(
                'rounded-xl border p-4',
                cfg.bgColor,
                cfg.borderColor,
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-black',
                    cfg.bgColor,
                    cfg.textColor,
                    'border',
                    cfg.borderColor,
                  )}
                >
                  {key}
                </span>
                <span className={cn('text-xs font-medium', cfg.textColor)}>
                  {cfg.description}
                </span>
              </div>
              <p className={cn('text-2xl font-black', cfg.textColor)}>
                {String(productsPct)}%
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                produktów → {String(revenuePct)}% przychodu
              </p>
            </div>
          );
        })}
      </div>

      {/* Stacked product distribution bar */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Rozkład produktów
        </p>
        <div className="flex h-8 w-full overflow-hidden rounded-lg">
          {classes.map(({ key, productsPct }) => (
            <BarSegment
              key={key}
              pct={productsPct}
              color={CLASS_CONFIG[key].color}
              label={`Klasa ${key}`}
            />
          ))}
        </div>
      </div>

      {/* Stacked revenue distribution bar */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Rozkład przychodu
        </p>
        <div className="flex h-8 w-full overflow-hidden rounded-lg">
          {classes.map(({ key, revenuePct }) => (
            <BarSegment
              key={key}
              pct={revenuePct}
              color={CLASS_CONFIG[key].color}
              label={`Klasa ${key}`}
            />
          ))}
        </div>
      </div>

      {/* Legend + total */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {classes.map(({ key }) => {
            const cfg = CLASS_CONFIG[key];
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: cfg.color }}
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">{cfg.label}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Łączny przychód:{' '}
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            {totalRevenuePln.toLocaleString('pl-PL', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            PLN
          </span>
        </p>
      </div>

      {/* Insight callout */}
      <div className="rounded-lg border border-brand-200 bg-brand-50 dark:border-brand-600/25 dark:bg-brand-600/10 p-3">
        <p className="text-xs text-brand-600 dark:text-brand-300 leading-relaxed">
          <span className="font-semibold">Analiza Pareto:</span> Produkty klasy
          A ({String(stats.aProductsPct)}% asortymentu) generują{' '}
          {String(stats.aRevenuePct)}% przychodu. Priorytetyzuj ich dostępność
          i skróć czas realizacji zamówień dla tej grupy.
        </p>
      </div>
    </div>
  );
}
