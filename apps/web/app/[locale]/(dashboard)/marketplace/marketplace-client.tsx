'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ShoppingBag,
  Store,
  Package,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  Clock,
  Truck,
  XCircle,
  RotateCcw,
  ChevronRight,
  ArrowLeft,
  Link2,
  TrendingUp,
  MapPin,
  Search,
  Navigation,
  Box,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useOrders,
  useAccounts,
  type MarketplaceOrder,
  type OrderStatus,
  type AccountStatus,
} from '@/hooks/use-marketplace';
import { usePaczkomaty } from '@/hooks/use-logistics-api';
import { useGeocode } from '@/hooks/use-geodata';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: 'Pending', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800/40', icon: Clock },
  processing: { label: 'Processing', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40', icon: Package },
  shipped: { label: 'Shipped', color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-800/40', icon: Truck },
  delivered: { label: 'Delivered', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800/40', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/40', icon: XCircle },
  returned: { label: 'Returned', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700', icon: RotateCcw },
};

const ACCOUNT_STATUS_CONFIG: Record<AccountStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'text-green-600 dark:text-green-400' },
  suspended: { label: 'Suspended', color: 'text-red-600 dark:text-red-400' },
  pending: { label: 'Pending', color: 'text-yellow-600 dark:text-yellow-400' },
  disconnected: { label: 'Disconnected', color: 'text-slate-500' },
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', config.color, config.bg)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}

function OrderDetailView({ order, onBack }: { order: MarketplaceOrder; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Order Info */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Order Details</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">Order ID</span>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{order.externalId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">Platform</span>
              <Badge variant="secondary" className="text-[10px]">{order.platform}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 dark:text-slate-500">Status</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">Date</span>
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {new Date(order.createdAt).toLocaleDateString('pl-PL')}
              </span>
            </div>
            {order.trackingNumber && (
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">Tracking</span>
                <span className="text-xs font-mono text-brand-600 dark:text-brand-300">{order.trackingNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Buyer Info */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Buyer</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">Name</span>
              <span className="text-xs text-slate-600 dark:text-slate-300">{order.buyer.name}</span>
            </div>
            {order.buyer.email && (
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">Email</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">{order.buyer.email}</span>
              </div>
            )}
            {order.buyer.city && (
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">City</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">{order.buyer.city}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Order Items</h3>
        </div>
        <div className="divide-y divide-slate-800">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-slate-900 dark:text-white">{item.name}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{item.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {formatCurrency(item.unitPrice)} x {item.quantity}
                </p>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Total</span>
          <span className="text-lg font-black text-slate-900 dark:text-white">
            {formatCurrency(order.totalAmount)} {order.currency}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Paczkomat Finder
// ─────────────────────────────────────────────────────────────────────────────

function PaczkomatFinder() {
  const t = useTranslations('dashboard.paczkomaty');

  const [addressInput, setAddressInput] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPaczkomat, setSelectedPaczkomat] = useState<string | null>(null);

  const { data: geocodeResults, isFetching: geocoding } = useGeocode(searchAddress);
  const { data: paczkomaty, isFetching: loadingPoints, isError: pointsError } = usePaczkomaty(
    selectedCoords?.lat ?? null,
    selectedCoords?.lng ?? null,
    5
  );

  function handleSearch() {
    setSearchAddress(addressInput);
    setSelectedCoords(null);
  }

  function handleSelectGeocode(lat: number, lng: number) {
    setSelectedCoords({ lat, lng });
    setSearchAddress('');
  }

  const typeLabel = (type: string): string => {
    const map: Record<string, string> = {
      locker: 'Paczkomat',
      pop: 'POP',
      parcel_locker: 'Paczkomat',
      parcel_locker_superpop: 'SuperPOP',
    };
    return map[type] ?? type;
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('title')}</h3>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder={t('searchAddress')}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button onClick={handleSearch} disabled={geocoding || !addressInput.trim()} className="shrink-0">
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">{t('search')}</span>
          </Button>
        </div>

        {/* Geocode suggestions */}
        {geocodeResults && geocodeResults.length > 0 && !selectedCoords && (
          <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {geocodeResults.slice(0, 5).map((result, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setAddressInput(result.displayName);
                  handleSelectGeocode(result.lat, result.lng);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
              >
                <Navigation className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300 line-clamp-1">{result.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loadingPoints && (
        <div className="flex items-center justify-center py-10 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
          <Loader2 className="h-6 w-6 animate-spin text-brand-400 mr-2" />
          <span className="text-sm text-slate-500 dark:text-slate-400">{t('search')}...</span>
        </div>
      )}

      {/* Error */}
      {pointsError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{t('noResults')}</p>
        </div>
      )}

      {/* Results */}
      {!loadingPoints && paczkomaty && paczkomaty.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{paczkomaty.length}</span>{' '}
            {t('found')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {paczkomaty.slice(0, 20).map((point) => (
              <div
                key={point.name}
                className={cn(
                  'rounded-xl border bg-white dark:bg-slate-900 p-4 transition-all duration-200',
                  selectedPaczkomat === point.name
                    ? 'border-brand-600/60 ring-1 ring-brand-600/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-brand-400 shrink-0" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                      {point.name}
                    </span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <span className="inline-flex rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      {typeLabel(point.type)}
                    </span>
                    {point.isActive !== false && (
                      <span className="inline-flex rounded-full border border-green-200 dark:border-green-700/40 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                        {point.status || 'Active'}
                      </span>
                    )}
                  </div>
                </div>

                {(point.address.line1 || point.address.city) && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex items-start gap-1">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      {[point.address.line1, point.address.postalCode, point.address.city]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </p>
                )}

                {point.distance !== undefined && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                    {(point.distance / 1000).toFixed(2)} km
                  </p>
                )}

                <Button
                  size="sm"
                  variant={selectedPaczkomat === point.name ? 'default' : 'outline'}
                  onClick={() => setSelectedPaczkomat(selectedPaczkomat === point.name ? null : point.name)}
                  className="w-full text-xs"
                >
                  {selectedPaczkomat === point.name ? (
                    <><CheckCircle className="h-3.5 w-3.5 mr-1" />{t('select')}</>
                  ) : (
                    t('select')
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loadingPoints && paczkomaty && paczkomaty.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
          <MapPin className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('noResults')}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

type ActiveView = 'orders' | 'accounts' | 'paczkomaty';

export function MarketplaceClient() {
  const [activeView, setActiveView] = useState<ActiveView>('orders');
  const [selectedOrder, setSelectedOrder] = useState<MarketplaceOrder | null>(null);

  const { data: ordersData, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useOrders();
  const { data: accountsData, isLoading: accountsLoading, isError: accountsError, refetch: refetchAccounts } = useAccounts();

  const orders = ordersData?.items ?? [];
  const accounts = accountsData?.items ?? [];

  if (selectedOrder) {
    return (
      <OrderDetailView order={selectedOrder} onBack={() => setSelectedOrder(null)} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 p-1 w-full sm:w-fit overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveView('orders')}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all whitespace-nowrap',
            activeView === 'orders'
              ? 'bg-brand-600/20 text-brand-600 dark:text-brand-300 border border-brand-600/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <Package className="h-4 w-4" />
          Orders
          {ordersData && (
            <span className="ml-1 rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              {ordersData.total}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('accounts')}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all whitespace-nowrap',
            activeView === 'accounts'
              ? 'bg-brand-600/20 text-brand-600 dark:text-brand-300 border border-brand-600/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <Store className="h-4 w-4" />
          Accounts
          {accountsData && (
            <span className="ml-1 rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              {accountsData.total}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('paczkomaty')}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all whitespace-nowrap',
            activeView === 'paczkomaty'
              ? 'bg-brand-600/20 text-brand-600 dark:text-brand-300 border border-brand-600/30'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <MapPin className="h-4 w-4" />
          Paczkomaty
        </button>
      </div>

      {/* Orders View */}
      {activeView === 'orders' && (
        <div className="space-y-4">
          {ordersError && (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">Failed to load orders.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void refetchOrders()} className="text-red-600 dark:text-red-400 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {ordersLoading && (
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden animate-pulse">
              <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-3 rounded bg-slate-200 dark:bg-slate-800" />
                ))}
              </div>
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-4 px-4 py-4 border-b border-slate-200/50 dark:border-slate-800/50 last:border-0">
                  {Array.from({ length: 5 }).map((__, i) => (
                    <div key={i} className="h-3 rounded bg-white dark:bg-slate-800/60" />
                  ))}
                </div>
              ))}
            </div>
          )}

          {!ordersLoading && orders.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 min-w-[600px]">
                <div className="col-span-3">Order / Buyer</div>
                <div className="col-span-2">Platform</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-1" />
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-slate-800/50 min-w-[600px]">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="w-full grid grid-cols-12 gap-3 px-4 py-3.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800/30 transition-colors group"
                  >
                    <div className="col-span-3">
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{order.externalId}</p>
                      <p className="text-sm text-slate-900 dark:text-white font-medium mt-0.5">{order.buyer.name}</p>
                    </div>
                    <div className="col-span-2 flex items-center">
                      <Badge variant="secondary" className="text-[10px]">{order.platform}</Badge>
                    </div>
                    <div className="col-span-2 flex items-center">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(order.totalAmount)}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center">
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {new Date(order.createdAt).toLocaleDateString('pl-PL')}
                      </span>
                    </div>
                    <div className="col-span-1 flex items-center justify-end">
                      <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-brand-400 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
              </div>
            </div>
          )}

          {!ordersLoading && !ordersError && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50">
              <ShoppingBag className="h-12 w-12 text-slate-700 mb-3" />
              <p className="text-slate-400 dark:text-slate-500">No orders yet</p>
              <p className="text-xs text-slate-600 mt-1">Connect a marketplace account to see orders</p>
            </div>
          )}
        </div>
      )}

      {/* Accounts View */}
      {activeView === 'accounts' && (
        <div className="space-y-4">
          {accountsError && (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">Failed to load accounts.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void refetchAccounts()} className="text-red-600 dark:text-red-400 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {accountsLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5 animate-pulse">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!accountsLoading && accounts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((account) => {
                const statusConfig = ACCOUNT_STATUS_CONFIG[account.status];
                return (
                  <div key={account.id} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{account.accountName}</h3>
                          <span className={cn('text-[10px] font-semibold', statusConfig.color)}>
                            {statusConfig.label}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">{account.platformLabel}</Badge>
                      </div>
                      <Link2 className="h-4 w-4 text-slate-600" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3">
                        <div className="flex items-center gap-1 mb-1">
                          <Package className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Orders</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{account.ordersCount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg bg-slate-100 dark:bg-slate-800/50 p-3">
                        <div className="flex items-center gap-1 mb-1">
                          <TrendingUp className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Revenue</span>
                        </div>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          {formatCurrency(account.revenueTotal)}
                        </p>
                      </div>
                    </div>

                    {account.lastSyncAt && (
                      <p className="text-[10px] text-slate-600 mt-3">
                        Last synced: {new Date(account.lastSyncAt).toLocaleString('pl-PL')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Account CTA */}
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-900/30 p-6 text-center">
            <Store className="h-8 w-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">Connect a new marketplace</p>
            <Button variant="outline" size="sm" className="gap-2">
              <Link2 className="h-3.5 w-3.5" />
              Connect Account
            </Button>
          </div>
        </div>
      )}

      {/* Paczkomaty View */}
      {activeView === 'paczkomaty' && <PaczkomatFinder />}
    </div>
  );
}
