'use client';

import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Check, Zap, Sparkles, Building2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const planIcons = {
  free: null,
  pro: <Zap className="h-5 w-5 text-brand-400" />,
  business: <Building2 className="h-5 w-5 text-amber-400" />,
};

export function PricingCards() {
  const t = useTranslations('pricing');
  const locale = useLocale();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const plans = [
    {
      key: 'free' as const,
      color: 'border-slate-200 dark:border-slate-700',
      headerBg: 'bg-slate-100 dark:bg-slate-800/50',
      priceColor: 'text-white',
      ctaVariant: 'outline' as const,
    },
    {
      key: 'pro' as const,
      color: 'border-brand-600/60',
      headerBg: 'bg-brand-50 dark:bg-brand-950/40',
      priceColor: 'gradient-text',
      ctaVariant: 'default' as const,
      popular: true,
    },
    {
      key: 'business' as const,
      color: 'border-amber-700/40',
      headerBg: 'bg-amber-50 dark:bg-amber-950/20',
      priceColor: 'text-amber-400',
      ctaVariant: 'outline' as const,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setBillingCycle('monthly')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            billingCycle === 'monthly'
              ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          )}
        >
          {t('monthly')}
        </button>
        <div className="relative">
          <button
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-300',
              billingCycle === 'annual' ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300',
                billingCycle === 'annual' ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>
        <button
          onClick={() => setBillingCycle('annual')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
            billingCycle === 'annual'
              ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          )}
        >
          {t('annual')}
          <span className="rounded-full bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700/30 px-2 py-0.5 text-xs text-green-700 dark:text-green-400 font-semibold">
            {t('save')}
          </span>
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => {
          const features = t.raw(`${plan.key}.features`) as string[];
          const basePrice = parseInt(t(`${plan.key}.price`), 10);
          const displayPrice = billingCycle === 'annual' && basePrice > 0
            ? Math.round(basePrice * 0.8)
            : basePrice;

          return (
            <div
              key={plan.key}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden',
                'transition-all duration-300 hover:shadow-xl',
                plan.color,
                plan.popular && 'shadow-xl shadow-brand-950/50 scale-105'
              )}
            >
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 h-0.5 gradient-bg" />
              )}

              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="flex items-center gap-1 rounded-full gradient-bg px-3 py-1 text-xs font-bold text-white shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    {t('popular')}
                  </span>
                </div>
              )}

              {/* Header */}
              <div className={cn('p-6', plan.headerBg)}>
                <div className="flex items-center gap-2 mb-1">
                  {planIcons[plan.key]}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t(`${plan.key}.name`)}
                  </h3>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  {t(`${plan.key}.description`)}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-500 dark:text-slate-400">zł</span>
                  <span className={cn('text-5xl font-black', plan.priceColor)}>
                    {displayPrice}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-sm ml-1">/ mo</span>
                </div>
              </div>

              {/* Features */}
              <div className="flex flex-1 flex-col p-6">
                <ul className="flex-1 space-y-3 mb-6">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-slate-600 dark:text-slate-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href={`/${locale}/register`}>
                  <Button
                    variant={plan.ctaVariant}
                    className={cn(
                      'w-full',
                      plan.popular && 'gradient-bg border-0 hover:opacity-90'
                    )}
                    size="lg"
                  >
                    {t(`${plan.key}.cta`)}
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
