'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Package,
  PackageX,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Plus,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  Archive,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AbcChart } from '@/components/inventory/AbcChart';
import { StockAlerts } from '@/components/inventory/StockAlerts';
import {
  useProducts,
  useAbcAnalysisQuery,
  useAbcAnalysis,
  useDeadStock,
  useReorderAlerts,
  type Product,
  type ProductsQueryParams,
  type AbcClass,
} from '@/hooks/use-inventory';
import { AddProductClient } from './add-product-client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPln(grosze: number): string {
  return (grosze / 100).toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function stockStatus(
  product: Product,
  labels: { out: string; low: string; ok: string },
): {
  label: string;
  color: string;
} {
  if (product.currentStock === 0)
    return { label: labels.out, color: 'text-red-600 dark:text-red-400' };
  if (product.currentStock <= product.reorderPoint)
    return { label: labels.low, color: 'text-amber-600 dark:text-amber-400' };
  return { label: labels.ok, color: 'text-green-600 dark:text-green-400' };
}

function abcBadgeClass(cls: AbcClass | null): string {
  switch (cls) {
    case 'A':
      return 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-500/30';
    case 'B':
      return 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30';
    case 'C':
      return 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600/30';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700/30';
  }
}

function daysSince(
  dateStr: string | null,
  labels: { never: string; today: string; yesterday: string; daysAgo: string },
): string {
  if (dateStr === null) return labels.never;
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return labels.today;
  if (days === 1) return labels.yesterday;
  return `${String(days)}${labels.daysAgo}`;
}

// ─── Section tab type ─────────────────────────────────────────────────────────

type SectionTab = 'products' | 'abc' | 'deadstock' | 'alerts';

// ─── Sort state ───────────────────────────────────────────────────────────────

type SortField = NonNullable<ProductsQueryParams['sortBy']>;

interface SortState {
  field: SortField;
  dir: 'asc' | 'desc';
}

function SortIcon({
  field,
  current,
}: {
  field: SortField;
  current: SortState;
}) {
  if (current.field !== field)
    return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-600" />;
  return current.dir === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5 text-brand-400" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 text-brand-400" />
  );
}

// ─── Products Table ───────────────────────────────────────────────────────────

interface ProductsTableProps {
  products: Product[];
  sort: SortState;
  onSort: (field: SortField) => void;
  isLoading: boolean;
}

function ProductsTable({
  products: rows,
  sort,
  onSort,
  isLoading,
}: ProductsTableProps) {
  const t = useTranslations('dashboard.inventory');
  const statusLabels = { out: t('statusOut'), low: t('statusLow'), ok: t('statusOk') };
  const daysLabels = {
    never: t('neverSold'),
    today: t('soldToday'),
    yesterday: t('soldYesterday'),
    daysAgo: t('soldDaysAgo'),
  };

  function th(label: string, field: SortField) {
    return (
      <th
        scope="col"
        className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 dark:text-slate-300 transition-colors select-none"
        onClick={() => onSort(field)}
      >
        <span className="flex items-center gap-1.5">
          {label}
          <SortIcon field={field} current={sort} />
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">
          <tr>
            {th(t('colNameSku'), 'name')}
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('colCategory')}
            </th>
            {th(t('colStock'), 'stock')}
            {th(t('colSold30d'), 'lastSold')}
            {th(t('colRevenue'), 'revenue')}
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('colAbc')}
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('colStatus')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {isLoading ? (
            <tr>
              <td colSpan={7} className="py-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-600 mx-auto" />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-12 text-center">
                <Package className="h-10 w-10 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">{t('noProducts')}</p>
              </td>
            </tr>
          ) : (
            rows.map((product) => {
              const status = stockStatus(product, statusLabels);
              return (
                <tr
                  key={product.id}
                  className="bg-white dark:bg-slate-950/50 hover:bg-white/80 dark:bg-slate-900/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{product.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{product.sku}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{product.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {String(product.currentStock)}
                    </span>
                    {product.reservedStock > 0 && (
                      <span className="text-xs text-slate-600 ml-1">
                        (-{String(product.reservedStock)})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                    {daysSince(product.lastSoldAt, daysLabels)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {formatPln(product.totalRevenue)} PLN
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-black',
                        abcBadgeClass(product.abcClass),
                      )}
                    >
                      {product.abcClass ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-semibold', status.color)}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
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
        <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function InventoryClient() {
  const t = useTranslations('dashboard.inventory');
  const [activeTab, setActiveTab] = useState<SectionTab>('products');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'revenue', dir: 'desc' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const productsQuery = useProducts({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sortBy: sort.field,
    sortDir: sort.dir,
  });

  const abcQuery = useAbcAnalysisQuery();
  const runAbc = useAbcAnalysis();
  const deadStockQuery = useDeadStock();
  const alertsQuery = useReorderAlerts();

  function handleSort(field: SortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'desc' },
    );
    setPage(0);
  }

  // Client-side search filter applied on top of server-sorted data
  const filteredProducts = (productsQuery.data?.data ?? []).filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()),
  );

  const totalProducts = productsQuery.data?.pagination.total ?? 0;
  const totalAlerts = alertsQuery.data?.data.length ?? 0;
  const totalDeadStock =
    (deadStockQuery.data?.data.deadStock.length ?? 0) +
    (deadStockQuery.data?.data.slowMoving.length ?? 0);

  const tabs: Array<{ key: SectionTab; label: string; badge?: number }> = [
    { key: 'products', label: t('tabProducts'), badge: totalProducts },
    { key: 'abc', label: t('tabAbc') },
    { key: 'deadstock', label: t('tabDeadstock'), badge: totalDeadStock },
    { key: 'alerts', label: t('tabAlerts'), badge: totalAlerts },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ── KPI row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
        <StatCard
          icon={Package}
          label={t('statProducts')}
          value={String(totalProducts)}
          sub={t('statProductsSub')}
          iconColor="text-brand-400"
        />
        <StatCard
          icon={TrendingUp}
          label={t('statClassA')}
          value={`${String(abcQuery.data?.data.stats.aProductsPct ?? 0)}%`}
          sub={t('statClassASub')}
          iconColor="text-green-400"
        />
        <StatCard
          icon={AlertTriangle}
          label={t('statAlerts')}
          value={String(totalAlerts)}
          sub={t('statAlertsSub')}
          iconColor="text-amber-400"
        />
        <StatCard
          icon={Archive}
          label={t('statDeadstock')}
          value={String(totalDeadStock)}
          sub={t('statDeadstockSub')}
          iconColor="text-slate-500 dark:text-slate-400"
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'text-slate-900 dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-500 after:rounded-t-full'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={cn(
                  'inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                  activeTab === tab.key
                    ? 'bg-brand-600/30 text-brand-600 dark:text-brand-300'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                )}
              >
                {String(tab.badge)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Products tab ───────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
            <div className="relative w-full sm:flex-1 sm:min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="pl-10"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('addProduct')}
            </Button>
          </div>

          <AddProductClient
            open={showAddForm}
            onClose={() => setShowAddForm(false)}
          />

          <ProductsTable
            products={filteredProducts}
            sort={sort}
            onSort={handleSort}
            isLoading={productsQuery.isLoading}
          />

          {/* Pagination */}
          {(productsQuery.data?.pagination.total ?? 0) > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {t('showing')}{' '}
                {String(Math.min(page * PAGE_SIZE + PAGE_SIZE, totalProducts))}{' '}
                {t('of')} {String(totalProducts)}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  {t('prevPage')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!productsQuery.data?.pagination.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('nextPage')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABC Analysis tab ───────────────────────────────────────────── */}
      {activeTab === 'abc' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('abcTitle')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('abcSubtitle')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runAbc.mutate()}
              disabled={runAbc.isPending}
            >
              {runAbc.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {t('runAnalysis')}
            </Button>
          </div>

          {abcQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
            </div>
          ) : abcQuery.data !== undefined ? (
            <AbcChart stats={abcQuery.data.data.stats} />
          ) : (
            <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-100/60 dark:bg-slate-900/40 py-10 text-center">
              <BarChart3 className="h-10 w-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('abcClickHint')}
              </p>
            </div>
          )}

          {/* Class breakdown tables */}
          {abcQuery.data !== undefined && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {(
                [
                  {
                    key: 'A' as const,
                    items: abcQuery.data.data.classA as Product[],
                    colorClass: 'text-green-400',
                  },
                  {
                    key: 'B' as const,
                    items: abcQuery.data.data.classB as Product[],
                    colorClass: 'text-amber-400',
                  },
                  {
                    key: 'C' as const,
                    items: abcQuery.data.data.classC as Product[],
                    colorClass: 'text-slate-400',
                  },
                ]
              ).map(({ key, items, colorClass }) => (
                <div
                  key={key}
                  className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-100/60 dark:bg-slate-900/40 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-black',
                        abcBadgeClass(key),
                      )}
                    >
                      {key}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {String(items.length)} {t('products')}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-800/50 max-h-64 overflow-y-auto scrollbar-thin">
                    {items.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-100/80 dark:bg-slate-800/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                            {p.name}
                          </p>
                          <p className="text-[10px] text-slate-600">{p.sku}</p>
                        </div>
                        <span className={cn('text-xs font-semibold shrink-0 ml-2', colorClass)}>
                          {formatPln(p.totalRevenue)} PLN
                        </span>
                      </li>
                    ))}
                    {items.length === 0 && (
                      <li className="py-6 text-center text-xs text-slate-600">
                        {t('noProductsInClass')}
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dead Stock tab ─────────────────────────────────────────────── */}
      {activeTab === 'deadstock' && (
        <div className="space-y-5">
          {deadStockQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
            </div>
          ) : deadStockQuery.data !== undefined ? (
            <>
              {/* Cost summary */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-700/30 dark:bg-red-950/20 p-4">
                  <p className="text-xs text-red-500 dark:text-red-400 font-medium uppercase tracking-wider mb-1">
                    {t('deadstockTitle')}
                  </p>
                  <p className="text-2xl font-black text-red-600 dark:text-red-400">
                    {String(deadStockQuery.data.data.deadStock.length)}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t('deadstockSub')}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-700/30 dark:bg-amber-950/20 p-4">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider mb-1">
                    {t('slowMovingTitle')}
                  </p>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {String(deadStockQuery.data.data.slowMoving.length)}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t('slowMovingSub')}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-700/30 bg-white/80 dark:bg-slate-900/60 p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider mb-1">
                    {t('holdingCostTitle')}
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {formatPln(deadStockQuery.data.data.totalHoldingCost)}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{t('holdingCostSub')}</p>
                </div>
              </div>

              {/* Recommendations */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('recommendationsTitle')}
                </h4>
                {deadStockQuery.data.data.recommendations.length === 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-100/60 dark:bg-slate-900/40 py-10 text-center">
                    <CheckCircle className="h-10 w-10 text-green-500/60 mx-auto mb-3" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('noRecommendations')}
                    </p>
                  </div>
                ) : (
                  deadStockQuery.data.data.recommendations.map((rec) => (
                    <div
                      key={rec.productId}
                      className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {rec.productName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {rec.sku} · {rec.category}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={cn(
                              'inline-block rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border',
                              rec.action === 'liquidate'
                                ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 border-red-300 dark:border-red-700/40'
                                : rec.action === 'discount_sell'
                                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 border-amber-300 dark:border-amber-700/40'
                                  : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border-blue-300 dark:border-blue-700/40',
                            )}
                          >
                            {rec.action === 'liquidate'
                              ? t('actionLiquidate')
                              : rec.action === 'discount_sell'
                                ? t('actionDiscount')
                                : t('actionBundle')}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {rec.actionReason}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                        <span>
                          {t('stockLabel')}{' '}
                          <span className="text-slate-500 dark:text-slate-400">
                            {String(rec.currentStock)} szt.
                          </span>
                        </span>
                        <span>
                          {t('holdingCostTitle')}:{' '}
                          <span className="text-red-600 dark:text-red-400">
                            {formatPln(rec.monthlyHoldingCost)} PLN
                          </span>
                        </span>
                        {rec.daysSinceLastSale !== null && (
                          <span>
                            {t('colSold30d')}:{' '}
                            <span className="text-slate-500 dark:text-slate-400">
                              {String(rec.daysSinceLastSale)}{t('soldDaysAgo')}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Alerts tab ─────────────────────────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex flex-row items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('alertsTitle')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('alertsSubtitle')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void alertsQuery.refetch()}
              disabled={alertsQuery.isFetching}
            >
              {alertsQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>

          {alertsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
            </div>
          ) : (
            <StockAlerts alerts={alertsQuery.data?.data ?? []} />
          )}
        </div>
      )}
    </div>
  );
}
