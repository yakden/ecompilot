import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Check, Zap, HelpCircle } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { PricingCards } from '@/components/pricing/PricingCards';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return { title: t('title') };
}

const FAQ_ITEMS = [
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and billing is prorated.',
  },
  {
    q: 'Is there a free trial for Pro?',
    a: 'We offer a 14-day free trial for the Pro plan. No credit card required to start.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit cards, PayPal, and bank transfer for Business plans.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your data is retained for 30 days after cancellation. You can export everything before that.',
  },
  {
    q: 'Do you offer discounts for annual billing?',
    a: 'Yes, annual billing saves you 20% compared to monthly pricing.',
  },
  {
    q: 'Is there a limit on API calls for Business?',
    a: 'Business plan includes 10,000 API calls per month. Additional calls are billed at 0.01 PLN each.',
  },
];

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-20 pb-12 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-brand-600/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white mb-4">{t('title')}</h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-400 dark:text-slate-400 max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-4">
        <div className="mx-auto max-w-7xl">
          <PricingCards />
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-16 border-t border-slate-100 dark:border-slate-800">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white text-center mb-10">
            Full feature comparison
          </h2>

          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
            {/* Table Header */}
            <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 min-w-[480px]">
              <div className="p-4 text-sm font-semibold text-slate-400 dark:text-slate-400">Feature</div>
              <div className="p-4 text-center text-sm font-semibold text-slate-400 dark:text-slate-400">Free</div>
              <div className="p-4 text-center text-sm font-bold text-brand-600 dark:text-brand-300 bg-brand-600/10">Pro</div>
              <div className="p-4 text-center text-sm font-semibold text-amber-600 dark:text-amber-300">Business</div>
            </div>

            <div className="min-w-[480px]">
            {[
              { feature: 'Niche Analyses', free: '5/mo', pro: 'Unlimited', business: 'Unlimited' },
              { feature: 'AI Assistant queries', free: '10/day', pro: 'Unlimited', business: 'Unlimited' },
              { feature: 'Supplier search', free: 'Basic', pro: 'Full database', business: 'Full + API' },
              { feature: 'Margin Calculator', free: true, pro: true, business: true },
              { feature: 'Competitor monitoring', free: '3', pro: '50', business: 'Unlimited' },
              { feature: 'Auto-listing', free: false, pro: '100/mo', business: 'Unlimited' },
              { feature: 'Price optimizer', free: false, pro: true, business: true },
              { feature: 'Academy courses', free: 'Basic', pro: 'All courses', business: 'All + private' },
              { feature: 'Team members', free: '1', pro: '1', business: 'Up to 10' },
              { feature: 'API access', free: false, pro: false, business: true },
              { feature: 'White label', free: false, pro: false, business: true },
              { feature: 'Support', free: 'Community', pro: 'Priority email', business: 'Dedicated manager' },
              { feature: 'SLA', free: false, pro: '99.5%', business: '99.9%' },
            ].map((row, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-4 border-b border-slate-100 dark:border-slate-800/60 last:border-0 ${idx % 2 === 0 ? '' : 'bg-slate-50 dark:bg-slate-900/60'}`}
              >
                <div className="p-4 text-sm text-slate-600 dark:text-slate-300">{row.feature}</div>
                <div className="p-4 text-center">
                  <CellValue value={row.free} />
                </div>
                <div className="p-4 text-center bg-brand-600/5">
                  <CellValue value={row.pro} highlight />
                </div>
                <div className="p-4 text-center">
                  <CellValue value={row.business} />
                </div>
              </div>
            ))}
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 border-t border-slate-100 dark:border-slate-800">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white text-center mb-8 md:mb-10">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
                <div className="flex items-start gap-3">
                  <HelpCircle className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white mb-1.5">{item.q}</p>
                    <p className="text-sm text-slate-400 dark:text-slate-400 leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 dark:border-slate-800 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-slate-600">
            © 2026 EcomPilot PL. All rights reserved. · Questions? <a href="mailto:hello@ecompilot.pl" className="text-brand-400 hover:text-brand-300">hello@ecompilot.pl</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function CellValue({ value, highlight = false }: { value: boolean | string; highlight?: boolean }) {
  if (value === true) {
    return <Check className={`mx-auto h-4 w-4 ${highlight ? 'text-brand-400' : 'text-green-400'}`} />;
  }
  if (value === false) {
    return <span className="text-slate-700 text-lg">—</span>;
  }
  return (
    <span className={`text-xs font-medium ${highlight ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>
      {value}
    </span>
  );
}
