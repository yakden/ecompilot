'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Search,
  Star,
  CheckCircle,
  ExternalLink,
  Mail,
  Loader2,
  AlertCircle,
  RefreshCw,
  Package,
  MessageCircle,
  Phone,
  Send,
  Globe,
  Truck,
  X,
  ChevronDown,
  Zap,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  Building2,
  BadgeCheck,
  XCircle,
  FileSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useVerifyVat, useVerifyKrs, useVerifyNip } from '@/hooks/use-verification';
import {
  useSuppliers,
  useSupplierCategories,
  useSupplierSearch,
  useSupplierDetail,
  type SupplierListItem,
  type SupplierDetail,
  type SupplierFilters,
  type SupplierType,
} from '@/hooks/use-suppliers';
import { getCountryFlag, getCountryName, extractCountryCodes } from '@/lib/country-flags';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUPPLIER_TYPES: Array<{ value: SupplierType | ''; labelKey: string }> = [
  { value: '', labelKey: 'typeAll' },
  { value: 'china', labelKey: 'typeChina' },
  { value: 'poland', labelKey: 'typePoland' },
  { value: 'turkey', labelKey: 'typeTurkey' },
  { value: 'eu', labelKey: 'typeEu' },
  { value: 'dropship', labelKey: 'typeDropship' },
];

const PLATFORM_ICONS: Record<string, string> = {
  '1688': '🏭',
  alibaba: '🛒',
  aliexpress: '🛍',
  allegro: '🟠',
  amazon: '📦',
  taobao: '🏪',
  shopee: '🍊',
  lazada: '🟡',
  baselinker: '🔗',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function parseRating(rating: string | number): number {
  const n = typeof rating === 'string' ? parseFloat(rating) : rating;
  return isNaN(n) ? 0 : n;
}

/** Description from Elasticsearch flat fields (SupplierListItem) */
function getListDescription(item: SupplierListItem, locale: string): string {
  if (locale === 'ru' && item.descriptionRu) return item.descriptionRu;
  if (locale === 'pl' && item.descriptionPl) return item.descriptionPl;
  if (locale === 'ua' && item.descriptionUa) return item.descriptionUa;
  if (locale === 'en' && item.descriptionEn) return item.descriptionEn;
  // Fallback chain
  return (
    item.descriptionRu ??
    item.descriptionEn ??
    item.descriptionPl ??
    item.descriptionUa ??
    ''
  );
}

/** Description from PostgreSQL nested object (SupplierDetail) */
function getDetailDescription(item: SupplierDetail, locale: string): string {
  const desc = item.description;
  if (!desc) return '';
  const lang = locale as 'ru' | 'pl' | 'ua' | 'en';
  return desc[lang] ?? desc.ru ?? desc.en ?? desc.pl ?? desc.ua ?? '';
}

function formatMoq(eur: number | null): string {
  if (eur === null || eur === 0) return '';
  return `€${eur.toLocaleString('ru-RU')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// StarRating
// ─────────────────────────────────────────────────────────────────────────────

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < Math.round(value)
              ? 'fill-amber-400 text-amber-400'
              : 'text-slate-300 dark:text-slate-700',
          )}
        />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SupplierCard
// ─────────────────────────────────────────────────────────────────────────────

interface SupplierCardProps {
  supplier: SupplierListItem;
  locale: string;
  onProfile: (id: string) => void;
}

function SupplierCard({ supplier, locale, onProfile }: SupplierCardProps) {
  const t = useTranslations('dashboard.suppliers');
  const rating = parseRating(supplier.rating);
  const flag = getCountryFlag(supplier.country);
  const countryName = getCountryName(supplier.country, locale === 'ru' ? 'ru' : 'en');
  const description = getListDescription(supplier, locale);
  const moq = formatMoq(supplier.minimumOrderEur);

  return (
    <article className="group flex flex-col rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 transition-all duration-200 hover:border-violet-300 dark:hover:border-violet-600/40 hover:shadow-lg hover:shadow-violet-100/50 dark:hover:shadow-violet-900/10">
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors truncate">
              {supplier.name}
            </h3>
            {supplier.isVerified && (
              <span title="Проверенный поставщик">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              </span>
            )}
            {supplier.isFeatured && (
              <Badge variant="default" className="text-[10px] shrink-0 py-0">
                TOP
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {(flag || countryName) && (
              <span className="flex items-center gap-1">
                {flag && <span>{flag}</span>}
                {countryName && <span>{countryName}</span>}
              </span>
            )}
            {rating > 0 && (
              <span className="flex items-center gap-1">
                <StarRating value={rating} />
                <span className="text-slate-600 dark:text-slate-300">{rating.toFixed(1)}</span>
                {supplier.reviewCount > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">
                    ({supplier.reviewCount} {t('reviews')})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* MOQ badge */}
        {moq && (
          <div className="shrink-0 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/60 px-2.5 py-1 text-center">
            <div className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('moq')}
            </div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{moq}</div>
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}

      {/* Categories */}
      {supplier.categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {supplier.categories.slice(0, 4).map((cat) => (
            <Badge key={cat} variant="secondary" className="text-[10px] py-0">
              {cat}
            </Badge>
          ))}
          {supplier.categories.length > 4 && (
            <Badge variant="outline" className="text-[10px] py-0 text-slate-500 dark:text-slate-400">
              +{supplier.categories.length - 4}
            </Badge>
          )}
        </div>
      )}

      {/* Badges row */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {supplier.supportsDropship && (
          <Badge variant="info" className="text-[10px] py-0 gap-1">
            <Zap className="h-2.5 w-2.5" />
            {t('dropship')}
          </Badge>
        )}
        {supplier.platforms.slice(0, 3).map((pl) => (
          <Badge key={pl} variant="outline" className="text-[10px] py-0 gap-1 text-slate-500 dark:text-slate-400">
            <span>{PLATFORM_ICONS[pl.toLowerCase()] ?? '🔌'}</span>
            {pl}
          </Badge>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        <Button
          size="sm"
          className="h-8 flex-1 gap-1.5 text-xs"
          onClick={() => onProfile(supplier.id)}
        >
          <Mail className="h-3.5 w-3.5" />
          {t('contact')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => onProfile(supplier.id)}
        >
          <Layers className="h-3.5 w-3.5" />
          {t('viewProfile')}
        </Button>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SupplierDetailModal
// ─────────────────────────────────────────────────────────────────────────────

interface SupplierDetailModalProps {
  supplierId: string | null;
  locale: string;
  onClose: () => void;
}

function SupplierDetailModal({
  supplierId,
  locale,
  onClose,
}: SupplierDetailModalProps) {
  const t = useTranslations('dashboard.suppliers');
  const { data: supplier, isLoading, isError } = useSupplierDetail(supplierId);

  const rating = supplier ? parseRating(supplier.rating) : 0;
  const flag = supplier ? getCountryFlag(supplier.country) : '';
  const countryName = supplier
    ? getCountryName(supplier.country, locale === 'ru' ? 'ru' : 'en')
    : '';
  const description = supplier ? getDetailDescription(supplier, locale) : '';
  const moq = supplier ? formatMoq(supplier.minimumOrderEur) : '';

  function handlePartnerClick() {
    if (!supplier?.website || !supplier.id) return;
    fetch(`/api/suppliers/${supplier.id}/click`, { method: 'POST' })
      .then((r) => r.json())
      .then((data: { data?: { redirectUrl?: string } }) => {
        const url = data?.data?.redirectUrl ?? supplier.website;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      })
      .catch(() => {
        if (supplier.website) window.open(supplier.website, '_blank', 'noopener,noreferrer');
      });
  }

  return (
    <Dialog.Root open={supplierId !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-white dark:bg-slate-950/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed z-50 w-full',
            'inset-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2',
            'max-h-screen sm:max-h-[90vh] overflow-y-auto',
            'sm:rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-violet-100/50 dark:shadow-violet-900/20',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          )}
        >
          {/* Close button */}
          <Dialog.Close className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </Dialog.Close>

          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-slate-600 dark:text-slate-300">{t('errorTitle')}</p>
            </div>
          )}

          {supplier && !isLoading && (
            <div>
              {/* Hero */}
              <div className="border-b border-slate-100 dark:border-slate-800 p-6 pb-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 text-2xl">
                    {flag || '🏭'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">
                        {supplier.name}
                      </Dialog.Title>
                      {supplier.isVerified && (
                        <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                      )}
                      {supplier.isFeatured && (
                        <Badge variant="default" className="text-[10px]">TOP</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                      {countryName && (
                        <span>
                          {flag} {countryName}
                        </span>
                      )}
                      {rating > 0 && (
                        <span className="flex items-center gap-1.5">
                          <StarRating value={rating} />
                          <span className="text-slate-600 dark:text-slate-300 font-medium">{rating.toFixed(1)}</span>
                          {supplier.reviewCount > 0 && (
                            <span className="text-slate-500 dark:text-slate-400">
                              ({supplier.reviewCount} {t('reviews')})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {moq && (
                    <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-center">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('moqLabel')}
                      </div>
                      <div className="text-base font-bold text-slate-800 dark:text-slate-100">{moq}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Description */}
                {description && (
                  <section>
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
                  </section>
                )}

                {/* Categories + Platforms */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {supplier.categories.length > 0 && (
                    <section>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t('category')}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {supplier.categories.map((cat) => (
                          <Badge key={cat} variant="secondary" className="text-xs">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </section>
                  )}

                  {supplier.platforms.length > 0 && (
                    <section>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t('platforms')}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {supplier.platforms.map((pl) => (
                          <Badge key={pl} variant="outline" className="text-xs gap-1">
                            <span>{PLATFORM_ICONS[pl.toLowerCase()] ?? '🔌'}</span>
                            {pl}
                          </Badge>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                {/* Tags */}
                {supplier.tags.length > 0 && (
                  <section>
                    <div className="flex flex-wrap gap-1.5">
                      {supplier.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[11px] text-slate-500 dark:text-slate-400">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {/* Shipping Info */}
                {supplier.shippingInfo && (
                  <section>
                    <h4 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <Truck className="h-3.5 w-3.5" />
                      {t('shipping')}
                    </h4>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-3 space-y-2">
                      {supplier.shippingInfo.averageDaysToPoland && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">{t('shippingDays')}</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {supplier.shippingInfo.averageDaysToPoland} дней
                          </span>
                        </div>
                      )}
                      {supplier.shippingInfo.freeShippingAboveEur && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 dark:text-slate-400">{t('freeShipping')}</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            €{supplier.shippingInfo.freeShippingAboveEur}
                          </span>
                        </div>
                      )}
                      {supplier.shippingInfo.methods && supplier.shippingInfo.methods.length > 0 && (
                        <div className="text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Методы: </span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {supplier.shippingInfo.methods.join(', ')}
                          </span>
                        </div>
                      )}
                      {supplier.shippingInfo.regionsServed && supplier.shippingInfo.regionsServed.length > 0 && (
                        <div className="text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Регионы: </span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {supplier.shippingInfo.regionsServed.join(', ')}
                          </span>
                        </div>
                      )}
                      {supplier.shippingInfo.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{supplier.shippingInfo.notes}</p>
                      )}
                    </div>
                  </section>
                )}

                {/* Contacts */}
                {supplier.contacts && Object.keys(supplier.contacts).length > 0 && (
                  <section>
                    <h4 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <Mail className="h-3.5 w-3.5" />
                      {t('contacts')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {supplier.contacts.email && (
                        <a
                          href={`mailto:${supplier.contacts.email}`}
                          className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-900 dark:text-white"
                        >
                          <Mail className="h-4 w-4 text-slate-500 dark:text-slate-500 shrink-0" />
                          <span className="truncate">{supplier.contacts.email}</span>
                        </a>
                      )}
                      {supplier.contacts.telegram && (
                        <a
                          href={`https://t.me/${supplier.contacts.telegram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 transition-colors hover:border-sky-700/40 hover:text-sky-300"
                        >
                          <Send className="h-4 w-4 text-slate-500 dark:text-slate-500 shrink-0" />
                          <span className="truncate">{supplier.contacts.telegram}</span>
                        </a>
                      )}
                      {supplier.contacts.whatsapp && (
                        <a
                          href={`https://wa.me/${supplier.contacts.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 transition-colors hover:border-emerald-700/40 hover:text-emerald-300"
                        >
                          <MessageCircle className="h-4 w-4 text-slate-500 dark:text-slate-500 shrink-0" />
                          <span className="truncate">{supplier.contacts.whatsapp}</span>
                        </a>
                      )}
                      {supplier.contacts.phone && (
                        <a
                          href={`tel:${supplier.contacts.phone}`}
                          className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-900 dark:text-white"
                        >
                          <Phone className="h-4 w-4 text-slate-500 dark:text-slate-500 shrink-0" />
                          <span className="truncate">{supplier.contacts.phone}</span>
                        </a>
                      )}
                    </div>
                  </section>
                )}

                {/* Recent Reviews */}
                {supplier.recentReviews && supplier.recentReviews.length > 0 && (
                  <section>
                    <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('recentReviews')}
                    </h4>
                    <div className="space-y-3">
                      {supplier.recentReviews.map((review) => (
                        <div
                          key={review.id}
                          className="rounded-xl border border-slate-800 bg-slate-100/80 dark:bg-slate-800/40 px-4 py-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <StarRating value={review.rating} />
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date(review.createdAt).toLocaleDateString('ru-RU')}
                            </span>
                          </div>
                          {review.comment && (
                            <p className="text-sm text-slate-600 dark:text-slate-300">{review.comment}</p>
                          )}
                          {review.pros && review.pros.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {review.pros.map((pro, i) => (
                                <span key={i} className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                  + {pro}
                                </span>
                              ))}
                            </div>
                          )}
                          {review.cons && review.cons.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {review.cons.map((con, i) => (
                                <span key={i} className="text-[11px] text-red-600 dark:text-red-400">
                                  - {con}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Partner / Website link */}
                {supplier.website && (
                  <section className="pt-1">
                    <button
                      onClick={handlePartnerClick}
                      className="group/btn flex w-full items-center justify-center gap-2 rounded-xl border border-violet-600/40 bg-violet-600/10 px-4 py-3 text-sm font-medium text-violet-700 dark:text-violet-300 transition-all hover:border-violet-500/60 hover:bg-violet-600/20 hover:text-violet-800 dark:hover:text-violet-200"
                    >
                      <Globe className="h-4 w-4" />
                      {t('partnerLink')}
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                    </button>
                  </section>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton card
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 dark:border-slate-700/40 bg-white dark:bg-slate-900 p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="h-10 w-14 rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mb-3 space-y-1.5">
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mb-4 flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="flex gap-2">
        <div className="h-8 flex-1 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-8 w-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VAT EU country codes
// ─────────────────────────────────────────────────────────────────────────────

const VAT_COUNTRIES = [
  { code: 'PL', label: 'PL — Polska' },
  { code: 'DE', label: 'DE — Deutschland' },
  { code: 'CZ', label: 'CZ — Česká republika' },
  { code: 'SK', label: 'SK — Slovensko' },
  { code: 'FR', label: 'FR — France' },
  { code: 'IT', label: 'IT — Italia' },
  { code: 'ES', label: 'ES — España' },
  { code: 'NL', label: 'NL — Nederland' },
  { code: 'AT', label: 'AT — Österreich' },
  { code: 'BE', label: 'BE — België' },
  { code: 'SE', label: 'SE — Sverige' },
  { code: 'DK', label: 'DK — Danmark' },
  { code: 'FI', label: 'FI — Suomi' },
  { code: 'PT', label: 'PT — Portugal' },
  { code: 'RO', label: 'RO — România' },
  { code: 'HU', label: 'HU — Magyarország' },
  { code: 'BG', label: 'BG — България' },
  { code: 'HR', label: 'HR — Hrvatska' },
  { code: 'LT', label: 'LT — Lietuva' },
  { code: 'LV', label: 'LV — Latvija' },
  { code: 'EE', label: 'EE — Eesti' },
  { code: 'SI', label: 'SI — Slovenija' },
  { code: 'LU', label: 'LU — Luxembourg' },
  { code: 'MT', label: 'MT — Malta' },
  { code: 'CY', label: 'CY — Κύπρος' },
  { code: 'IE', label: 'IE — Ireland' },
  { code: 'EL', label: 'EL — Ελλάδα' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CompanyVerifier
// ─────────────────────────────────────────────────────────────────────────────

type VerifyMode = 'vat' | 'krs' | 'nip';

function CompanyVerifier() {
  const t = useTranslations('dashboard.verification');

  const [mode, setMode] = useState<VerifyMode>('vat');
  const [vatCountry, setVatCountry] = useState('PL');
  const [vatNumber, setVatNumber] = useState('');
  const [krsInput, setKrsInput] = useState('');
  const [nipInput, setNipInput] = useState('');

  const vatMutation = useVerifyVat();

  // KRS and NIP are query-based (not mutation), driven by input
  const { data: krsData, isFetching: krsFetching, isError: krsError } = useVerifyKrs(krsInput);
  const { data: nipData, isFetching: nipFetching, isError: nipError } = useVerifyNip(nipInput);

  function handleVatVerify() {
    const cleaned = vatNumber.replace(/\s/g, '');
    if (!cleaned) return;
    vatMutation.mutate({ countryCode: vatCountry, vatNumber: cleaned });
  }

  const MODES: Array<{ id: VerifyMode; label: string }> = [
    { id: 'vat', label: 'VIES VAT' },
    { id: 'nip', label: 'NIP (PL)' },
    { id: 'krs', label: 'KRS (PL)' },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('title')}</h2>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-1 w-fit">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              mode === m.id
                ? 'bg-brand-600/20 text-brand-600 dark:text-brand-300 border border-brand-600/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input column */}
        <div className="space-y-3">
          {mode === 'vat' && (
            <>
              <div className="space-y-1.5">
                <Label>{t('countryCode')}</Label>
                <select
                  value={vatCountry}
                  onChange={(e) => setVatCountry(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  {VAT_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vatNumber">{t('vatInput')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="vatNumber"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder="1234567890"
                    onKeyDown={(e) => e.key === 'Enter' && handleVatVerify()}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleVatVerify}
                    disabled={vatMutation.isPending || !vatNumber.trim()}
                    className="shrink-0"
                  >
                    {vatMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileSearch className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">{t('verify')}</span>
                  </Button>
                </div>
              </div>
            </>
          )}

          {mode === 'nip' && (
            <div className="space-y-1.5">
              <Label htmlFor="nipInput">NIP</Label>
              <Input
                id="nipInput"
                value={nipInput}
                onChange={(e) => setNipInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="1234567890"
                maxLength={10}
              />
              {nipFetching && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('verify')}...
                </div>
              )}
            </div>
          )}

          {mode === 'krs' && (
            <div className="space-y-1.5">
              <Label htmlFor="krsInput">KRS</Label>
              <Input
                id="krsInput"
                value={krsInput}
                onChange={(e) => setKrsInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="0000123456"
                maxLength={10}
              />
              {krsFetching && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('verify')}...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Result column */}
        <div>
          {/* VAT result */}
          {mode === 'vat' && vatMutation.isError && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{t('notFound')}</p>
            </div>
          )}
          {mode === 'vat' && vatMutation.data && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {t('companyName')}
                </span>
                {vatMutation.data.valid ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 dark:border-green-700/40 dark:bg-green-950/40 px-2.5 py-0.5 text-[11px] font-semibold text-green-700 dark:text-green-400">
                    <BadgeCheck className="h-3 w-3" />
                    {t('valid')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 dark:border-red-700/40 dark:bg-red-950/40 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-400">
                    <XCircle className="h-3 w-3" />
                    {t('invalid')}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {vatMutation.data.name ?? '—'}
              </p>
              {vatMutation.data.address && (
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t('address')}</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">{vatMutation.data.address}</p>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-700">
                <span>{vatMutation.data.countryCode}-{vatMutation.data.vatNumber}</span>
                {vatMutation.data.requestDate && <span>{vatMutation.data.requestDate}</span>}
              </div>
            </div>
          )}

          {/* NIP result */}
          {mode === 'nip' && nipError && nipInput.length === 10 && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{t('notFound')}</p>
            </div>
          )}
          {mode === 'nip' && nipData && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-4 space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{nipData.companyName ?? '—'}</p>
              {nipData.regon && (
                <p className="text-xs text-slate-500 dark:text-slate-400">REGON: {nipData.regon}</p>
              )}
              {nipData.address && (
                <p className="text-xs text-slate-600 dark:text-slate-300">{nipData.address}</p>
              )}
              {nipData.vatStatus && (
                <Badge variant={nipData.vatStatus === 'active' ? 'default' : 'destructive'} className="text-[10px]">
                  VAT: {nipData.vatStatus}
                </Badge>
              )}
            </div>
          )}

          {/* KRS result */}
          {mode === 'krs' && krsError && krsInput.length >= 9 && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{t('notFound')}</p>
            </div>
          )}
          {mode === 'krs' && krsData && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-4 space-y-2">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{krsData.companyName ?? '—'}</p>
              {krsData.nip && <p className="text-xs text-slate-500 dark:text-slate-400">NIP: {krsData.nip}</p>}
              {krsData.legalForm && <p className="text-xs text-slate-500 dark:text-slate-400">{krsData.legalForm}</p>}
              {krsData.address && <p className="text-xs text-slate-600 dark:text-slate-300">{krsData.address}</p>}
              {krsData.status && (
                <Badge variant="secondary" className="text-[10px]">{krsData.status}</Badge>
              )}
            </div>
          )}

          {/* Idle state */}
          {mode === 'vat' && !vatMutation.data && !vatMutation.isError && !vatMutation.isPending && (
            <div className="flex flex-col items-center justify-center h-24 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20">
              <Building2 className="h-7 w-7 text-slate-300 dark:text-slate-700 mb-1.5" />
              <p className="text-xs text-slate-400 dark:text-slate-500">{t('vatInput')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SuppliersClient — main component
// ─────────────────────────────────────────────────────────────────────────────

export function SuppliersClient() {
  const t = useTranslations('dashboard.suppliers');
  const locale = useLocale();

  // ── Filter state ─────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [selectedType, setSelectedType] = useState<SupplierType | ''>('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);

  // ── Use search endpoint when query is typed, list endpoint otherwise ──────
  const isSearchMode = debouncedSearch.trim().length >= 2;

  const listFilters: SupplierFilters = {
    type: selectedType || undefined,
    category: selectedCategory || undefined,
    country: selectedCountry || undefined,
    dropship: selectedType === 'dropship' ? true : undefined,
    limit: 24,
  };

  const {
    data: listData,
    isLoading: listLoading,
    isError: listError,
    error: listErrorObj,
    refetch: listRefetch,
  } = useSuppliers(isSearchMode ? { limit: 0 } : listFilters);

  const {
    data: searchData,
    isLoading: searchLoading,
    isError: searchError,
  } = useSupplierSearch(
    debouncedSearch,
    {
      type: selectedType || undefined,
      category: selectedCategory || undefined,
      dropship: selectedType === 'dropship' ? true : undefined,
    },
  );

  const { data: categories } = useSupplierCategories();

  // ── Derive displayed items ─────────────────────────────────────────────
  const isLoading = isSearchMode ? searchLoading : listLoading;
  const isError = isSearchMode ? searchError : listError;

  const rawItems = isSearchMode
    ? (searchData?.items ?? [])
    : (listData?.items ?? []);

  // Client-side verified filter (applied on top of server filters)
  const suppliers = verifiedOnly
    ? rawItems.filter((s) => s.isVerified)
    : rawItems;

  const totalCount = isSearchMode
    ? (searchData?.total ?? suppliers.length)
    : (listData?.total ?? suppliers.length);

  // ── Extract unique countries from loaded data for the country dropdown ──
  const countryCodes = extractCountryCodes(rawItems);

  function resetFilters() {
    setSearchInput('');
    setSelectedType('');
    setSelectedCountry('');
    setSelectedCategory('');
    setVerifiedOnly(false);
  }

  const hasActiveFilters =
    searchInput ||
    selectedType ||
    selectedCountry ||
    selectedCategory ||
    verifiedOnly;

  return (
    <div className="space-y-5">
      {/* Company Verifier */}
      <CompanyVerifier />

      {/* Type tabs */}
      <div className="flex flex-wrap gap-1.5">
        {SUPPLIER_TYPES.map(({ value, labelKey }) => (
          <button
            key={value}
            onClick={() => setSelectedType(value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
              selectedType === value
                ? 'border-violet-600/60 bg-violet-600/15 text-violet-700 dark:text-violet-300'
                : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        {/* Search */}
        <div className="relative w-full sm:min-w-[200px] sm:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-10"
          />
          {searchLoading && isSearchMode && (
            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-500 dark:text-slate-400" />
          )}
        </div>

        {/* Country */}
        <div className="relative w-full sm:w-auto">
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/60 pl-3 pr-8 text-sm text-slate-700 dark:text-slate-200 transition-colors focus:border-violet-600/60 focus:outline-none focus:ring-1 focus:ring-violet-600/40"
          >
            <option value="">{t('allCountries')}</option>
            {countryCodes.map((code) => (
              <option key={code} value={code}>
                {getCountryFlag(code)} {getCountryName(code, locale === 'ru' ? 'ru' : 'en')}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
        </div>

        {/* Category */}
        <div className="relative w-full sm:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/60 pl-3 pr-8 text-sm text-slate-700 dark:text-slate-200 transition-colors focus:border-violet-600/60 focus:outline-none focus:ring-1 focus:ring-violet-600/40"
          >
            <option value="">{t('allCategories')}</option>
            {(categories ?? []).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
        </div>

        {/* Verified toggle */}
        <button
          onClick={() => setVerifiedOnly(!verifiedOnly)}
          className={cn(
            'flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all',
            verifiedOnly
              ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200',
          )}
        >
          <CheckCircle className="h-4 w-4" />
          {t('verifiedOnly')}
        </button>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between min-h-[24px]">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('loading')}
          </div>
        ) : !isError ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('found')}{' '}
            <span className="font-medium text-slate-600 dark:text-slate-300">{totalCount}</span>{' '}
            {t('suppliers')}
          </p>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {hasActiveFilters && !isLoading && (
            <button
              onClick={resetFilters}
              className="text-xs text-slate-500 dark:text-slate-500 underline underline-offset-2 hover:text-slate-600 dark:text-slate-300 transition-colors"
            >
              {t('resetFilters')}
            </button>
          )}
          {isError && !isSearchMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void listRefetch()}
              className="h-7 gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200"
            >
              <RefreshCw className="h-3 w-3" />
              {t('retry')}
            </Button>
          )}
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 px-4 py-3.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{t('errorTitle')}</p>
            <p className="text-xs text-red-500/70 dark:text-red-400/70 mt-0.5">
              {(listErrorObj as Error | undefined)?.message ?? t('errorHint')}
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton grid */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Supplier grid */}
      {!isLoading && suppliers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              locale={locale}
              onProfile={setActiveProfileId}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && suppliers.length === 0 && (
        <div className="py-16 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-400 dark:text-slate-600" />
          <p className="text-base font-medium text-slate-500 dark:text-slate-400">{t('noResults')}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{t('noResultsHint')}</p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="mt-4 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200"
            >
              {t('resetFilters')}
            </Button>
          )}
        </div>
      )}

      {/* Supplier detail modal */}
      <SupplierDetailModal
        supplierId={activeProfileId}
        locale={locale}
        onClose={() => setActiveProfileId(null)}
      />
    </div>
  );
}
