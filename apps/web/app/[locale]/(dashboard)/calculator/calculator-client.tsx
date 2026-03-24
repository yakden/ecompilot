'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Calculator,
  TrendingUp,
  DollarSign,
  BarChart2,
  Target,
  Package,
  Truck,
  ShoppingBag,
  Loader2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  MapPin,
  Globe2,
  Navigation,
  Building,
  Users,
  Coins,
} from 'lucide-react';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useMarginCalc,
  useZusCalc,
  useDeliveryCalc,
  useAllegroFees,
  useRates,
  type MarginCalcPayload,
  type ZusCalcPayload,
  type DeliveryCalcPayload,
  type AllegroFeesPayload,
} from '@/hooks/use-calculator';
import { useGeocode, useCountry, useCountries } from '@/hooks/use-geodata';

const PLATFORMS = [
  { value: 'allegro', label: 'Allegro', fee: 7 },
  { value: 'amazon', label: 'Amazon PL', fee: 12 },
  { value: 'olx', label: 'OLX', fee: 5 },
  { value: 'empik', label: 'Empik', fee: 10 },
  { value: 'custom', label: 'Custom', fee: 0 },
];

type CalcTab = 'margin' | 'zus' | 'delivery' | 'allegro' | 'geodata';

function ResultCard({
  icon: Icon,
  label,
  value,
  color,
  suffix = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <p className={cn('text-2xl font-black', color)}>
        {suffix === '%' ? formatPercent(value) : suffix === 'x' ? `${value.toFixed(2)}x` : formatCurrency(value)}
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
    </div>
  );
}

// ---- Margin Calculator ----
function MarginCalculator() {
  const t = useTranslations('dashboard.calculator');
  const marginMutation = useMarginCalc();
  const { data: rates } = useRates();

  const [productCost, setProductCost] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [platformFee, setPlatformFee] = useState('7');
  const [sellingPrice, setSellingPrice] = useState('');
  const [platform, setPlatform] = useState('allegro');

  function handlePlatformSelect(value: string) {
    setPlatform(value);
    const found = PLATFORMS.find((p) => p.value === value);
    if (found && found.fee > 0) setPlatformFee(String(found.fee));
  }

  function handleCalculate() {
    const payload: MarginCalcPayload = {
      productCost: parseFloat(productCost) || 0,
      shippingCost: parseFloat(shippingCost) || 0,
      platformFeePercent: parseFloat(platformFee) || 0,
      sellingPrice: parseFloat(sellingPrice) || 0,
      platform,
    };
    marginMutation.mutate(payload);
  }

  const result = marginMutation.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Input Form */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calculator className="h-5 w-5 text-brand-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('title')}</h2>
        </div>

        {rates && (
          <div className="mb-4 flex gap-3 text-[11px] text-slate-500">
            <span>VAT: {(rates as Record<string, unknown> as { vat?: { standard?: string } }).vat?.standard ?? '23'}%</span>
            <span>ZUS min: {(rates as Record<string, unknown> as { zus2025?: { health?: { minimumPln?: string } } }).zus2025?.health?.minimumPln ?? '381.78'} PLN</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('platform')}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => handlePlatformSelect(p.value)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs font-medium transition-all',
                    platform === p.value
                      ? 'border-brand-600/60 bg-brand-600/15 text-brand-600 dark:text-brand-300'
                      : 'border-slate-200 bg-slate-100/60 text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="productCost">{t('productCost')} (PLN)</Label>
            <Input
              id="productCost"
              type="number"
              min="0"
              step="0.01"
              value={productCost}
              onChange={(e) => setProductCost(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shippingCost">{t('shippingCost')} (PLN)</Label>
            <Input
              id="shippingCost"
              type="number"
              min="0"
              step="0.01"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="platformFee">{t('platformFee')} (%)</Label>
            <Input
              id="platformFee"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={platformFee}
              onChange={(e) => setPlatformFee(e.target.value)}
              placeholder="7"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sellingPrice">{t('sellingPrice')} (PLN)</Label>
            <Input
              id="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <Button
            onClick={handleCalculate}
            className="w-full"
            size="lg"
            disabled={marginMutation.isPending || !sellingPrice || !productCost}
          >
            {marginMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('calculating')}
              </>
            ) : (
              <>
                <Calculator className="mr-2 h-4 w-4" />
                {t('calculate')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {marginMutation.isError && (
          <ErrorBanner message={marginMutation.error?.message ?? t('calcFailed')} />
        )}

        {result ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('costBreakdown')}</h3>
              <div className="space-y-2">
                {[
                  { label: t('productCostLabel'), value: result.costBreakdown.productCost, color: 'text-slate-700 dark:text-slate-300' },
                  { label: t('shippingLabel'), value: result.costBreakdown.shippingCost, color: 'text-slate-700 dark:text-slate-300' },
                  { label: t('platformFeeLabel'), value: result.costBreakdown.platformFeeAmount, color: 'text-slate-700 dark:text-slate-300' },
                  { label: t('totalCosts'), value: result.costBreakdown.totalCosts, color: 'text-red-600 dark:text-red-400', bold: true },
                  { label: t('sellingPriceLabel'), value: parseFloat(sellingPrice) || 0, color: 'text-brand-600 dark:text-brand-300', bold: true },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className={cn('text-xs', item.color)}>{item.label}</span>
                    <span className={cn('text-sm', item.bold ? `font-bold ${item.color}` : 'text-slate-700 dark:text-slate-300')}>
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ResultCard
                icon={DollarSign}
                label={t('results.grossProfit')}
                value={result.grossProfit}
                color={result.grossProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
              />
              <ResultCard
                icon={TrendingUp}
                label={t('results.netProfit')}
                value={result.netProfit}
                color={result.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
              />
              <ResultCard
                icon={BarChart2}
                label={t('results.margin')}
                value={result.margin}
                color={result.margin >= 20 ? 'text-green-600 dark:text-green-400' : result.margin >= 10 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}
                suffix="%"
              />
              <ResultCard
                icon={Target}
                label={t('results.roi')}
                value={result.roi}
                color={result.roi >= 30 ? 'text-green-600 dark:text-green-400' : result.roi >= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}
                suffix="%"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-slate-400" />
                <span className="text-xs text-slate-500 dark:text-slate-400">{t('results.breakeven')}</span>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(result.breakeven)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('breakevenMin')}</p>
            </div>

            {result.recommendation && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 dark:border-brand-700/40 dark:bg-brand-950/30 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-brand-400" />
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-300">{t('recommendation')}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{result.recommendation}</p>
              </div>
            )}
          </>
        ) : (
          !marginMutation.isError && (
            <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
              <Calculator className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">{t('fillAndCalculate')}</p>
              <p className="text-slate-600 text-xs mt-1">{t('toSeeMargins')}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ---- ZUS Calculator ----
function ZusCalculator() {
  const t = useTranslations('dashboard.calculator');
  const zusMutation = useZusCalc();
  const [incomeType, setIncomeType] = useState<'b2b' | 'employment' | 'self_employed'>('self_employed');
  const [grossIncome, setGrossIncome] = useState('');

  function handleCalculate() {
    zusMutation.mutate({
      incomeType,
      grossIncome: parseFloat(grossIncome) || 0,
      year: new Date().getFullYear(),
    } satisfies ZusCalcPayload);
  }

  const result = zusMutation.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Package className="h-5 w-5 text-brand-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('zusTitle')}</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('incomeType')}</Label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { value: 'self_employed', label: t('selfEmployed') },
                { value: 'b2b', label: t('b2bContract') },
                { value: 'employment', label: t('employment') },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setIncomeType(opt.value as typeof incomeType)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium text-left transition-all',
                    incomeType === opt.value
                      ? 'border-brand-600/60 bg-brand-600/15 text-brand-600 dark:text-brand-300'
                      : 'border-slate-200 bg-slate-100/60 text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grossIncome">{t('grossIncome')}</Label>
            <Input
              id="grossIncome"
              type="number"
              min="0"
              step="100"
              value={grossIncome}
              onChange={(e) => setGrossIncome(e.target.value)}
              placeholder="5000.00"
            />
          </div>

          <Button
            onClick={handleCalculate}
            className="w-full"
            size="lg"
            disabled={zusMutation.isPending || !grossIncome}
          >
            {zusMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('calculating')}</>
            ) : (
              <><Calculator className="mr-2 h-4 w-4" />{t('calculateZus')}</>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {zusMutation.isError && (
          <ErrorBanner message={zusMutation.error?.message ?? t('calcFailed')} />
        )}
        {result ? (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">{t('zusBreakdown')}</h3>
            {[
              { label: t('socialInsurance'), value: result.social },
              { label: t('healthInsurance'), value: result.health },
              { label: t('laborFund'), value: result.laborFund },
              { label: t('totalContributions'), value: result.total, bold: true, color: 'text-red-600 dark:text-red-400' },
            ].map((item, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className={cn('text-sm font-semibold', item.color ?? 'text-slate-800 dark:text-slate-200')}>
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
            <div className="pt-2 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('netIncome')}</span>
              <span className="text-xl font-black text-green-400">{formatCurrency(result.netIncome)}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('effectiveRate')}: {result.effectiveRate.toFixed(1)}%
            </p>
          </div>
        ) : (
          !zusMutation.isError && (
            <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
              <Package className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">{t('enterIncomeZus')}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ---- Delivery from China Calculator ----
function DeliveryCalculator() {
  const t = useTranslations('dashboard.calculator');
  const deliveryMutation = useDeliveryCalc();
  const [weightKg, setWeightKg] = useState('');
  const [originCity, setOriginCity] = useState('Shenzhen');
  const [goods, setGoods] = useState('');
  const [quantity, setQuantity] = useState('');

  function handleCalculate() {
    deliveryMutation.mutate({
      weightKg: parseFloat(weightKg) || 0,
      originCity,
      destinationCountry: 'PL',
      goods,
      quantity: parseInt(quantity) || 1,
    } satisfies DeliveryCalcPayload);
  }

  const result = deliveryMutation.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Truck className="h-5 w-5 text-brand-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('deliveryTitle')}</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">{t('weightKg')}</Label>
            <Input
              id="weightKg"
              type="number"
              min="0.1"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="10.0"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="originCity">{t('originCity')}</Label>
            <select
              id="originCity"
              value={originCity}
              onChange={(e) => setOriginCity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              {['Shenzhen', 'Guangzhou', 'Shanghai', 'Yiwu', 'Beijing', 'Hangzhou'].map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goods">{t('goodsType')}</Label>
            <Input
              id="goods"
              value={goods}
              onChange={(e) => setGoods(e.target.value)}
              placeholder={t('goodsPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quantity">{t('quantity')}</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="100"
            />
          </div>

          <Button
            onClick={handleCalculate}
            className="w-full"
            size="lg"
            disabled={deliveryMutation.isPending || !weightKg}
          >
            {deliveryMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('calculating')}</>
            ) : (
              <><Truck className="mr-2 h-4 w-4" />{t('calculateDelivery')}</>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {deliveryMutation.isError && (
          <ErrorBanner message={deliveryMutation.error?.message ?? t('calcFailed')} />
        )}
        {result ? (
          <div className="space-y-3">
            {[
              { key: 'sea', label: t('seaFreight'), icon: '🚢', data: result.sea },
              { key: 'air', label: t('airFreight'), icon: '✈️', data: result.air },
              { key: 'express', label: t('expressFreight'), icon: '⚡', data: result.express },
            ].filter((item) => item.data !== null).map((item) => (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span>{item.icon}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</span>
                  {item.data && (
                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{item.data.days} {t('days')}</span>
                  )}
                </div>
                {item.data && (
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">~${item.data.costUsd.toFixed(2)} USD</span>
                    <span className="text-lg font-bold text-brand-600 dark:text-brand-300">{formatCurrency(item.data.costPln)}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 p-4 space-y-2">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('additionalCosts')}</h4>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">{t('customsDuty')}</span>
                <span className="text-slate-700 dark:text-slate-200">{formatCurrency(result.customsDuty)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">VAT (23%)</span>
                <span className="text-slate-700 dark:text-slate-200">{formatCurrency(result.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-slate-200 dark:border-slate-700 pt-2">
                <span className="text-slate-700 dark:text-slate-300">{t('totalLandedCost')}</span>
                <span className="text-slate-900 dark:text-white">{formatCurrency(result.totalLandedCost)}</span>
              </div>
            </div>
          </div>
        ) : (
          !deliveryMutation.isError && (
            <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
              <Truck className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">{t('enterShipmentDetails')}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ---- Allegro Fees Calculator ----
function AllegroFeesCalculator() {
  const t = useTranslations('dashboard.calculator');
  const allegroMutation = useAllegroFees();
  const [category, setCategory] = useState('Electronics');
  const [sellingPrice, setSellingPrice] = useState('');
  const [isPromoted, setIsPromoted] = useState(false);
  const [hasSuperSeller, setHasSuperSeller] = useState(false);

  const ALLEGRO_CATEGORIES = [
    'Electronics', 'Home & Garden', 'Clothing', 'Sports', 'Books', 'Toys', 'Automotive', 'Beauty',
  ];

  function handleCalculate() {
    allegroMutation.mutate({
      category,
      sellingPrice: parseFloat(sellingPrice) || 0,
      isPromoted,
      hasSuperSeller,
    } satisfies AllegroFeesPayload);
  }

  const result = allegroMutation.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-6">
          <ShoppingBag className="h-5 w-5 text-brand-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('allegroTitle')}</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('category')}</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              {ALLEGRO_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="allegroPrice">{t('sellingPriceAllegro')}</Label>
            <Input
              id="allegroPrice"
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="99.99"
            />
          </div>

          <div className="flex flex-col gap-2">
            {[
              { id: 'promoted', label: t('promotedListing'), value: isPromoted, setter: setIsPromoted },
              { id: 'superseller', label: t('superSeller'), value: hasSuperSeller, setter: setHasSuperSeller },
            ].map(({ id, label, value, setter }) => (
              <label key={id} className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setter(!value)}
                  className={cn(
                    'h-5 w-9 rounded-full transition-colors cursor-pointer',
                    value ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
                  )}
                >
                  <div className={cn(
                    'h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform',
                    value ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                  )} />
                </div>
                <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
              </label>
            ))}
          </div>

          <Button
            onClick={handleCalculate}
            className="w-full"
            size="lg"
            disabled={allegroMutation.isPending || !sellingPrice}
          >
            {allegroMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('calculating')}</>
            ) : (
              <><ShoppingBag className="mr-2 h-4 w-4" />{t('calculateFees')}</>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {allegroMutation.isError && (
          <ErrorBanner message={allegroMutation.error?.message ?? t('calcFailed')} />
        )}
        {result ? (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">{t('allegroFeeBreakdown')}</h3>
            {[
              { label: t('listingFee'), value: result.listingFee },
              { label: t('successFee'), value: result.successFee },
              { label: t('promotionFee'), value: result.promotionFee },
            ].map((item, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className="text-sm text-slate-700 dark:text-slate-200">{formatCurrency(item.value)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t('totalFees')} ({result.feePercent.toFixed(1)}%)
              </span>
              <span className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(result.totalFee)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-700 pt-3">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('netRevenue')}</span>
              <span className="text-xl font-black text-green-600 dark:text-green-400">{formatCurrency(result.netRevenue)}</span>
            </div>
          </div>
        ) : (
          !allegroMutation.isError && (
            <div className="flex flex-col items-center justify-center h-64 text-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
              <ShoppingBag className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">{t('enterProductDetails')}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Address Autocomplete (Geocoding)
// ─────────────────────────────────────────────────────────────────────────────

function AddressAutocomplete() {
  const t = useTranslations('dashboard.geodata');
  const [inputValue, setInputValue] = useState('');
  const [debouncedAddress, setDebouncedAddress] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<{ displayName: string; lat: number; lng: number } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedAddress(inputValue);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  const { data: suggestions, isFetching } = useGeocode(debouncedAddress);

  function handleSelect(lat: number, lng: number, displayName: string) {
    setSelectedAddress({ lat, lng, displayName });
    setInputValue(displayName);
    setShowDropdown(false);
    setDebouncedAddress('');
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="addressInput">{t('validateAddress')}</Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            id="addressInput"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setSelectedAddress(null);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="ul. Marszałkowska 1, Warszawa"
            className="pl-10"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
          )}
        </div>

        {/* Dropdown suggestions */}
        {showDropdown && suggestions && suggestions.length > 0 && !selectedAddress && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-20 relative">
            {suggestions.slice(0, 5).map((result, idx) => (
              <button
                key={idx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result.lat, result.lng, result.displayName)}
                className="w-full flex items-start gap-2 px-3 py-2.5 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
              >
                <Navigation className="h-3.5 w-3.5 text-brand-400 shrink-0 mt-0.5" />
                <span className="text-slate-700 dark:text-slate-300 line-clamp-2">{result.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Validated result */}
      {selectedAddress && (
        <div className="rounded-xl border border-green-200 dark:border-green-700/40 bg-green-50 dark:bg-green-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">{t('validateAddress')}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">{selectedAddress.displayName}</p>
          <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>lat: {selectedAddress.lat.toFixed(6)}</span>
            <span>lng: {selectedAddress.lng.toFixed(6)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Country Info Panel
// ─────────────────────────────────────────────────────────────────────────────

function CountryInfoPanel() {
  const t = useTranslations('dashboard.geodata');
  const [selectedCode, setSelectedCode] = useState('DE');

  const { data: countries, isLoading: countriesLoading } = useCountries();
  const { data: countryInfo, isFetching: countryFetching } = useCountry(selectedCode);

  const sortedCountries = [...(countries ?? [])].sort((a, b) => {
    const nameA = typeof a.name === 'string' ? a.name : a.name?.common ?? '';
    const nameB = typeof b.name === 'string' ? b.name : b.name?.common ?? '';
    return nameA.localeCompare(nameB);
  });

  const firstCurrency = countryInfo?.currencies
    ? Object.values(countryInfo.currencies)[0]
    : undefined;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="countrySelect">{t('countryInfo')}</Label>
        <div className="relative">
          <Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <select
            id="countrySelect"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            {countriesLoading && <option>Loading...</option>}
            {sortedCountries.map((c) => {
              const code = (c as unknown as Record<string, unknown>).code as string || c.cca2 || '';
              const nm = typeof c.name === 'string' ? c.name : c.name?.common ?? '';
              return (
                <option key={code} value={code}>
                  {nm} ({code})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {countryFetching && (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loadingGuide')}
        </div>
      )}

      {countryInfo && !countryFetching && (() => {
        const ci = countryInfo as unknown as Record<string, unknown>;
        const countryName = typeof ci.name === 'string' ? ci.name : (ci.name as Record<string, string>)?.common ?? '';
        const officialName = (ci.officialName as string) || (typeof ci.name === 'object' ? (ci.name as Record<string, string>)?.official : '') || '';
        const flagUrl = (ci.flag as string) || (ci.flags as Record<string, string>)?.svg || '';
        const capitalStr = Array.isArray(ci.capital) ? (ci.capital as string[])[0] : (ci.capital as string) || '';
        const currencyStr = (ci.currency as string) || '';
        const currencySymbol = (ci.currencySymbol as string) || '';
        const populationNum = (ci.population as number) || 0;
        const regionStr = (ci.region as string) || '';
        return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
          <div className="flex items-center gap-3">
            {flagUrl && (
              <img src={flagUrl} alt={countryName} className="h-8 w-12 rounded object-cover shadow-sm" />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{countryName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{officialName}</p>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2">
            {capitalStr && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <div className="flex items-center gap-1 mb-1">
                  <Building className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{t('capital')}</span>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{capitalStr}</p>
              </div>
            )}

            {currencyStr && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <div className="flex items-center gap-1 mb-1">
                  <Coins className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{t('currency')}</span>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {currencySymbol} {currencyStr}
                </p>
              </div>
            )}

            {populationNum > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <div className="flex items-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{t('population')}</span>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {(populationNum / 1_000_000).toFixed(1)}M
                </p>
              </div>
            )}

            {regionStr && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <div className="flex items-center gap-1 mb-1">
                  <BarChart2 className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Region</span>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{regionStr}</p>
              </div>
            )}
          </div>

        </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Geodata Tab (Address + Country)
// ─────────────────────────────────────────────────────────────────────────────

function GeodataTab() {
  const t = useTranslations('dashboard.geodata');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Address validation */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-brand-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('validateAddress')}</h2>
        </div>
        <AddressAutocomplete />
      </div>

      {/* Country info */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-brand-400" />
          <h2 className="font-semibold text-slate-900 dark:text-white">{t('countryInfo')}</h2>
        </div>
        <CountryInfoPanel />
      </div>
    </div>
  );
}

// ---- Main Component ----
export function CalculatorClient() {
  const t = useTranslations('dashboard.calculator');
  const [activeTab, setActiveTab] = useState<CalcTab>('margin');

  const TABS: Array<{ id: CalcTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'margin', label: t('tabMargin'), icon: Calculator },
    { id: 'zus', label: t('tabZus'), icon: Package },
    { id: 'delivery', label: t('tabDelivery'), icon: Truck },
    { id: 'allegro', label: t('tabAllegro'), icon: ShoppingBag },
    { id: 'geodata', label: t('tabGeodata'), icon: Globe2 },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 p-1 w-full overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3 md:px-4 py-2 text-xs md:text-sm font-medium transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-brand-600/20 text-brand-600 dark:text-brand-300 border border-brand-600/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'margin' && <MarginCalculator />}
      {activeTab === 'zus' && <ZusCalculator />}
      {activeTab === 'delivery' && <DeliveryCalculator />}
      {activeTab === 'allegro' && <AllegroFeesCalculator />}
      {activeTab === 'geodata' && <GeodataTab />}
    </div>
  );
}
