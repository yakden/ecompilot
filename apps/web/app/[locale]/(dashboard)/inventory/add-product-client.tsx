'use client';

import { useState, useId, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  X,
  Barcode,
  PenLine,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  PackageSearch,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useBarcodeLookup,
  useAddProduct,
  type BarcodeLookupResult,
  type CreateProductPayload,
} from '@/hooks/use-product-autofill';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sourceBadgeClass(source: BarcodeLookupResult['source']): string {
  switch (source) {
    case 'icecat':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'upcitemdb':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300';
    case 'openfoodfacts':
      return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

function nutriScoreColor(score: string | undefined): string {
  if (!score) return 'bg-slate-200 text-slate-600';
  switch (score.toUpperCase()) {
    case 'A': return 'bg-green-500 text-white';
    case 'B': return 'bg-lime-400 text-white';
    case 'C': return 'bg-yellow-400 text-white';
    case 'D': return 'bg-orange-500 text-white';
    case 'E': return 'bg-red-600 text-white';
    default: return 'bg-slate-200 text-slate-600';
  }
}

function autoSku(barcode: string): string {
  return `BC-${barcode}`;
}

type Mode = 'barcode' | 'manual';

// ─────────────────────────────────────────────────────────────────────────────
// NutrientRow
// ─────────────────────────────────────────────────────────────────────────────

function NutrientRow({ label, value, unit }: { label: string; value?: number; unit: string }) {
  if (value === undefined || value === null) return null;
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800">
      <td className="py-1.5 pr-4 text-xs text-slate-500 dark:text-slate-400">{label}</td>
      <td className="py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">
        {value.toFixed(1)} {unit}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductFoundCard
// ─────────────────────────────────────────────────────────────────────────────

interface ProductFoundCardProps {
  result: BarcodeLookupResult;
  t: ReturnType<typeof useTranslations<'dashboard.addProduct'>>;
  tNutrients: ReturnType<typeof useTranslations<'dashboard.nutrients'>>;
}

function ProductFoundCard({ result, t, tNutrients }: ProductFoundCardProps) {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50/60 dark:border-green-800/40 dark:bg-green-900/10 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        <span className="text-sm font-semibold text-green-700 dark:text-green-400">
          {t('productFound')}
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
            sourceBadgeClass(result.source),
          )}
        >
          {result.source}
        </span>
      </div>

      {/* Product info */}
      <div className="flex gap-4">
        {result.imageUrl && (
          <div className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white">
            <Image
              src={result.imageUrl}
              alt={result.name ?? ''}
              fill
              className="object-contain p-1"
              sizes="80px"
              unoptimized
            />
          </div>
        )}
        <div className="space-y-1 min-w-0">
          {result.name && (
            <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
              {result.name}
            </p>
          )}
          {result.brand && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">{t('brand')}:</span> {result.brand}
            </p>
          )}
          {result.category && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">{t('category')}:</span> {result.category}
            </p>
          )}
          {result.nutriScore && (
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-black tracking-wider',
                nutriScoreColor(result.nutriScore),
              )}
            >
              Nutri-Score {result.nutriScore.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {result.description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3">
          {result.description}
        </p>
      )}

      {/* Nutriments table */}
      {result.nutriments && Object.keys(result.nutriments).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            {tNutrients('title')}
          </p>
          <table className="w-full">
            <tbody>
              <NutrientRow label={tNutrients('energy')} value={result.nutriments.energyKcal} unit="kcal" />
              <NutrientRow label={tNutrients('fat')} value={result.nutriments.fat} unit="g" />
              <NutrientRow label={tNutrients('saturatedFat')} value={result.nutriments.saturatedFat} unit="g" />
              <NutrientRow label={tNutrients('carbs')} value={result.nutriments.carbohydrates} unit="g" />
              <NutrientRow label={tNutrients('sugars')} value={result.nutriments.sugars} unit="g" />
              <NutrientRow label={tNutrients('fiber')} value={result.nutriments.fiber} unit="g" />
              <NutrientRow label={tNutrients('protein')} value={result.nutriments.proteins} unit="g" />
              <NutrientRow label={tNutrients('salt')} value={result.nutriments.salt} unit="g" />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FormField
// ─────────────────────────────────────────────────────────────────────────────

interface FormFieldProps {
  id: string;
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: 'text' | 'number';
  error?: string;
  disabled?: boolean;
}

function FormField({ id, label, value, onChange, type = 'text', error, disabled }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(error && 'border-red-500/60 focus-visible:ring-red-500/30')}
      />
      {error && (
        <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface AddProductClientProps {
  open: boolean;
  onClose: () => void;
}

export function AddProductClient({ open, onClose }: AddProductClientProps) {
  const t = useTranslations('dashboard.addProduct');
  const tNutrients = useTranslations('dashboard.nutrients');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const formId = useId();

  const [mode, setMode] = useState<Mode>('barcode');

  // Barcode mode state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [submittedBarcode, setSubmittedBarcode] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Form state (used in both modes; pre-filled from lookup in barcode mode)
  const [form, setForm] = useState<{
    name: string;
    sku: string;
    category: string;
    purchasePrice: string;
    sellingPrice: string;
    currentStock: string;
    reorderPoint: string;
  }>({
    name: '',
    sku: '',
    category: '',
    purchasePrice: '',
    sellingPrice: '',
    currentStock: '0',
    reorderPoint: '10',
  });

  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [prefilled, setPrefilled] = useState(false);

  // Barcode lookup — only fires when submittedBarcode is set and valid
  const lookup = useBarcodeLookup(submittedBarcode);
  const addProduct = useAddProduct();

  // Auto-focus barcode input when modal opens
  useEffect(() => {
    if (open && mode === 'barcode') {
      setTimeout(() => barcodeRef.current?.focus(), 50);
    }
  }, [open, mode]);

  // Pre-fill form when lookup succeeds
  useEffect(() => {
    if (lookup.data && submittedBarcode && !prefilled) {
      const result = lookup.data;
      setForm((prev) => ({
        ...prev,
        name: result.name ?? prev.name,
        sku: autoSku(submittedBarcode),
        category: result.category ?? prev.category,
        brand: result.brand ?? prev.brand,
      }));
      setPrefilled(true);
    }
  }, [lookup.data, submittedBarcode, prefilled]);

  // If lookup fails (404 / not found) and user hasn't manually switched → suggest manual
  const lookupNotFound =
    submittedBarcode !== '' &&
    !lookup.isLoading &&
    !lookup.data &&
    lookup.error !== null;

  function handleBarcodeSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    setPrefilled(false);
    setSubmittedBarcode(barcodeInput.trim());
  }

  function switchToManual() {
    setMode('manual');
    setSubmittedBarcode('');
    setBarcodeInput('');
    setPrefilled(false);
  }

  function switchToBarcode() {
    setMode('barcode');
    setSubmittedBarcode('');
    setBarcodeInput('');
    setPrefilled(false);
    setForm({ name: '', sku: '', category: '', purchasePrice: '', sellingPrice: '', currentStock: '0', reorderPoint: '10' });
  }

  function handleClose() {
    setMode('barcode');
    setSubmittedBarcode('');
    setBarcodeInput('');
    setPrefilled(false);
    setForm({ name: '', sku: '', category: '', purchasePrice: '', sellingPrice: '', currentStock: '0', reorderPoint: '10' });
    setErrors({});
    addProduct.reset();
    onClose();
  }

  function setField(key: keyof typeof form) {
    return (val: string) => setForm((prev) => ({ ...prev, [key]: val }));
  }

  function validate(): boolean {
    const next: Partial<typeof form> = {};
    if (!form.name.trim()) next.name = 'Required';
    if (!form.sku.trim()) next.sku = 'Required';
    if (!form.category.trim()) next.category = 'Required';
    const pp = parseFloat(form.purchasePrice);
    if (isNaN(pp) || pp <= 0) next.purchasePrice = '> 0';
    const sp = parseFloat(form.sellingPrice);
    if (isNaN(sp) || sp <= 0) next.sellingPrice = '> 0';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateProductPayload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      purchasePrice: Math.round(parseFloat(form.purchasePrice) * 100),
      sellingPrice: Math.round(parseFloat(form.sellingPrice) * 100),
      currentStock: parseInt(form.currentStock, 10) || 0,
      reorderPoint: parseInt(form.reorderPoint, 10) || 10,
    };

    addProduct.mutate(payload, {
      onSuccess: () => {
        handleClose();
        router.refresh();
      },
    });
  }

  if (!open) return null;

  const showProductCard = mode === 'barcode' && lookup.data && submittedBarcode;
  const showAutofilledBadge = prefilled && mode === 'barcode';
  const showForm = mode === 'manual' || (mode === 'barcode' && (showProductCard || lookupNotFound));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className={cn(
          'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4',
          'pointer-events-none',
        )}
      >
        <div
          className={cn(
            'pointer-events-auto w-full max-w-lg max-h-[90vh] overflow-y-auto',
            'rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
            'shadow-2xl',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2
              id={`${formId}-title`}
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              {t('title')}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Mode switcher */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 gap-1">
              <button
                type="button"
                onClick={switchToBarcode}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                  mode === 'barcode'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <Barcode className="h-4 w-4" />
                {t('barcodeMode')}
              </button>
              <button
                type="button"
                onClick={switchToManual}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                  mode === 'manual'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <PenLine className="h-4 w-4" />
                {t('manualMode')}
              </button>
            </div>

            {/* Barcode search row */}
            {mode === 'barcode' && (
              <form onSubmit={handleBarcodeSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    ref={barcodeRef}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder={t('barcodeInput')}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!barcodeInput.trim() || lookup.isLoading}
                  className="shrink-0"
                >
                  {lookup.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-1.5" />
                      {t('search')}
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* Product found card */}
            {showProductCard && (
              <ProductFoundCard
                result={lookup.data}
                t={t}
                tNutrients={tNutrients}
              />
            )}

            {/* Not found message */}
            {lookupNotFound && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/10 p-4 flex gap-3">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    {t('notFound')}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                    {t('fillManually')}
                  </p>
                </div>
              </div>
            )}

            {/* Auto-filled badge */}
            {showAutofilledBadge && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  {t('autoFilled')}
                </span>
              </div>
            )}

            {/* Product form */}
            {showForm && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <FormField
                      id={`${formId}-name`}
                      label={t('name')}
                      value={form.name}
                      onChange={setField('name')}
                      error={errors.name}
                    />
                  </div>
                  <FormField
                    id={`${formId}-sku`}
                    label={t('sku')}
                    value={form.sku}
                    onChange={setField('sku')}
                    error={errors.sku}
                  />
                  <FormField
                    id={`${formId}-category`}
                    label={t('category')}
                    value={form.category}
                    onChange={setField('category')}
                    error={errors.category}
                  />
                  <FormField
                    id={`${formId}-purchasePrice`}
                    label={t('purchasePrice')}
                    value={form.purchasePrice}
                    onChange={setField('purchasePrice')}
                    type="number"
                    error={errors.purchasePrice}
                  />
                  <FormField
                    id={`${formId}-sellingPrice`}
                    label={t('sellingPrice')}
                    value={form.sellingPrice}
                    onChange={setField('sellingPrice')}
                    type="number"
                    error={errors.sellingPrice}
                  />
                  <FormField
                    id={`${formId}-stock`}
                    label={t('stock')}
                    value={form.currentStock}
                    onChange={setField('currentStock')}
                    type="number"
                  />
                  <FormField
                    id={`${formId}-reorder`}
                    label={t('reorderPoint')}
                    value={form.reorderPoint}
                    onChange={setField('reorderPoint')}
                    type="number"
                  />
                </div>

                {addProduct.error && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {addProduct.error.message}
                  </p>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                    {/* common.cancel not available from this namespace — use hardcoded since useTranslations is scoped */}
                    Anuluj
                  </Button>
                  <Button type="submit" size="sm" disabled={addProduct.isPending}>
                    {addProduct.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-1.5" />
                    )}
                    {t('addToInventory')}
                  </Button>
                </div>
              </form>
            )}

            {/* Empty state — barcode mode, nothing searched yet */}
            {mode === 'barcode' && !submittedBarcode && !lookup.isLoading && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <PackageSearch className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('barcodeInput')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
