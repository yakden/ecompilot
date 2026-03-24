'use client';

import { AlertTriangle, PackageX, TrendingDown, Archive, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertWithProduct, AlertType } from '@/hooks/use-inventory';
import { useAcknowledgeAlert } from '@/hooks/use-inventory';

interface StockAlertsProps {
  alerts: AlertWithProduct[];
  className?: string;
}

interface AlertConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  badgeColor: string;
}

const ALERT_CONFIG: Record<AlertType, AlertConfig> = {
  out_of_stock: {
    icon: PackageX,
    label: 'Brak w magazynie',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-700/50',
    iconColor: 'text-red-500 dark:text-red-400',
    badgeColor: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 border-red-300 dark:border-red-700/40',
  },
  low_stock: {
    icon: AlertTriangle,
    label: 'Niski stan',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-700/50',
    iconColor: 'text-amber-500 dark:text-amber-400',
    badgeColor: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 border-amber-300 dark:border-amber-700/40',
  },
  overstock: {
    icon: Archive,
    label: 'Nadmiar zapasów',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-700/50',
    iconColor: 'text-blue-500 dark:text-blue-400',
    badgeColor: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border-blue-300 dark:border-blue-700/40',
  },
  dead_stock: {
    icon: TrendingDown,
    label: 'Martwy zapas',
    bgColor: 'bg-white dark:bg-slate-900/60',
    borderColor: 'border-slate-600/50',
    iconColor: 'text-slate-400',
    badgeColor: 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-600/40',
  },
};

interface AlertCardProps {
  alertWithProduct: AlertWithProduct;
}

function AlertCard({ alertWithProduct }: AlertCardProps) {
  const { alert, product } = alertWithProduct;
  const cfg = ALERT_CONFIG[alert.alertType];
  const Icon = cfg.icon;
  const acknowledge = useAcknowledgeAlert();

  const stockPct =
    alert.reorderPoint > 0
      ? Math.min(100, Math.round((alert.currentStock / alert.reorderPoint) * 100))
      : 0;

  const createdAt = new Date(alert.createdAt).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all duration-200',
        cfg.bgColor,
        cfg.borderColor,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            cfg.bgColor,
          )}
        >
          <Icon className={cn('h-4 w-4', cfg.iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug truncate">
                {product.name}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{product.sku}</p>
            </div>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                cfg.badgeColor,
              )}
            >
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
          </div>

          {/* Stock indicator */}
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 dark:text-slate-500">
                Stan:{' '}
                <span className={cn('font-semibold', cfg.iconColor)}>
                  {String(alert.currentStock)} szt.
                </span>
              </span>
              <span className="text-slate-400 dark:text-slate-500">
                Próg:{' '}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {String(alert.reorderPoint)} szt.
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', {
                  'bg-red-500': alert.alertType === 'out_of_stock',
                  'bg-amber-500': alert.alertType === 'low_stock',
                  'bg-blue-500': alert.alertType === 'overstock',
                  'bg-slate-500': alert.alertType === 'dead_stock',
                })}
                style={{ width: `${String(stockPct)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600">{createdAt}</span>
            <button
              onClick={() =>
                acknowledge.mutate({ alertId: alert.id })
              }
              disabled={acknowledge.isPending}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                'border border-slate-300 dark:border-slate-600/50 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:text-white hover:border-slate-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {acknowledge.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3" />
              )}
              Potwierdź
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockAlerts({ alerts, className }: StockAlertsProps) {
  const outOfStock = alerts.filter((a) => a.alert.alertType === 'out_of_stock');
  const lowStock = alerts.filter((a) => a.alert.alertType === 'low_stock');
  const other = alerts.filter(
    (a) =>
      a.alert.alertType !== 'out_of_stock' && a.alert.alertType !== 'low_stock',
  );

  const ordered = [...outOfStock, ...lowStock, ...other];

  if (ordered.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/40 py-10',
          className,
        )}
      >
        <CheckCircle className="h-10 w-10 text-green-500/60 mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Brak aktywnych alertów
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Wszystkie stany magazynowe są na właściwym poziomie.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Priority badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {outOfStock.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700/40 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-300">
            <PackageX className="h-3 w-3" />
            {String(outOfStock.length)} brak w magazynie
          </span>
        )}
        {lowStock.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700/40 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {String(lowStock.length)} niski stan
          </span>
        )}
        {other.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-700/40 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <TrendingDown className="h-3 w-3" />
            {String(other.length)} inne
          </span>
        )}
      </div>

      {/* Alert cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ordered.map((item) => (
          <AlertCard key={item.alert.id} alertWithProduct={item} />
        ))}
      </div>
    </div>
  );
}
