import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BarChart3,
  Bot,
  BookOpen,
  Calculator,
  MessageSquare,
  Package,
  ArrowRight,
  Star,
  Users,
  TrendingUp,
  Zap,
  Shield,
  Globe,
  BarChart2,
  Tag,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Scan,
  Receipt,
  Warehouse,
  Scale,
  MapPin,
  Palette,
  ShoppingCart,
  Truck,
  GraduationCap,
  Map,
  CheckCircle2,
  Building2,
  Cpu,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { PricingCards } from '@/components/pricing/PricingCards';
import { Button } from '@/components/ui/button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hero' });
  return {
    title: `EcomPilot PL — ${t('titleHighlight')}`,
    description: t('subtitle'),
  };
}

type FeatureKey =
  | 'nicheAnalysis'
  | 'marginCalculator'
  | 'supplierBase'
  | 'aiAssistant'
  | 'barcodeScanner'
  | 'ksefInvoices'
  | 'inventoryMgmt'
  | 'legalGuides'
  | 'contractorCheck'
  | 'paczkomaty'
  | 'contentGen'
  | 'marketplaceHub'
  | 'logistics'
  | 'community'
  | 'academy'
  | 'geoData';

const featureIcons: Record<FeatureKey, React.ComponentType<{ className?: string }>> = {
  nicheAnalysis: BarChart3,
  marginCalculator: Calculator,
  supplierBase: Package,
  aiAssistant: Bot,
  barcodeScanner: Scan,
  ksefInvoices: Receipt,
  inventoryMgmt: Warehouse,
  legalGuides: Scale,
  contractorCheck: Shield,
  paczkomaty: MapPin,
  contentGen: Palette,
  marketplaceHub: ShoppingCart,
  logistics: Truck,
  community: MessageSquare,
  academy: GraduationCap,
  geoData: Map,
};

const featureColors: string[] = [
  'from-violet-600/20 to-purple-600/10 border-violet-600/30',
  'from-blue-600/20 to-cyan-600/10 border-blue-600/30',
  'from-emerald-600/20 to-teal-600/10 border-emerald-600/30',
  'from-amber-600/20 to-orange-600/10 border-amber-600/30',
  'from-pink-600/20 to-rose-600/10 border-pink-600/30',
  'from-indigo-600/20 to-blue-600/10 border-indigo-600/30',
  'from-cyan-600/20 to-sky-600/10 border-cyan-600/30',
  'from-red-600/20 to-orange-600/10 border-red-600/30',
  'from-teal-600/20 to-green-600/10 border-teal-600/30',
  'from-purple-600/20 to-violet-600/10 border-purple-600/30',
  'from-sky-600/20 to-blue-600/10 border-sky-600/30',
  'from-green-600/20 to-emerald-600/10 border-green-600/30',
  'from-rose-600/20 to-pink-600/10 border-rose-600/30',
  'from-orange-600/20 to-amber-600/10 border-orange-600/30',
  'from-fuchsia-600/20 to-purple-600/10 border-fuchsia-600/30',
  'from-lime-600/20 to-green-600/10 border-lime-600/30',
];

const iconColors: string[] = [
  'text-violet-500 dark:text-violet-400',
  'text-blue-500 dark:text-blue-400',
  'text-emerald-500 dark:text-emerald-400',
  'text-amber-500 dark:text-amber-400',
  'text-pink-500 dark:text-pink-400',
  'text-indigo-500 dark:text-indigo-400',
  'text-cyan-500 dark:text-cyan-400',
  'text-red-500 dark:text-red-400',
  'text-teal-500 dark:text-teal-400',
  'text-purple-500 dark:text-purple-400',
  'text-sky-500 dark:text-sky-400',
  'text-green-500 dark:text-green-400',
  'text-rose-500 dark:text-rose-400',
  'text-orange-500 dark:text-orange-400',
  'text-fuchsia-500 dark:text-fuchsia-400',
  'text-lime-500 dark:text-lime-400',
];

const integrations = [
  { name: 'VIES', color: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50' },
  { name: 'KRS', color: 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/50' },
  { name: 'CEIDG', color: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50' },
  { name: 'InPost', color: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50' },
  { name: 'DHL', color: 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/50' },
  { name: 'Icecat', color: 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/50' },
  { name: 'Open Food Facts', color: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/50' },
  { name: 'UPCitemdb', color: 'bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/50' },
  { name: 'Nominatim', color: 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/50' },
  { name: 'REST Countries', color: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50' },
  { name: 'UN Comtrade', color: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50' },
  { name: 'Eurostat', color: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50' },
  { name: 'GeoNames', color: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50' },
  { name: 'Poczta Polska', color: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/50' },
  { name: 'Google Search', color: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/50' },
];

const marketplacePlatforms = [
  'Allegro', 'Amazon PL', 'OLX', 'Empik', 'Ceneo', 'eBay PL',
  'Etsy', 'Vinted', 'Erli', 'Zalando', 'Shein PL', 'Allegro',
  'Amazon PL', 'OLX', 'Empik', 'Ceneo',
];

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tHero = await getTranslations({ locale, namespace: 'hero' });
  const tFeatures = await getTranslations({ locale, namespace: 'features' });
  const tPricing = await getTranslations({ locale, namespace: 'pricing' });
  const tIntegrations = await getTranslations({ locale, namespace: 'integrations' });
  const tHowItWorks = await getTranslations({ locale, namespace: 'howItWorks' });
  const tTestimonials = await getTranslations({ locale, namespace: 'testimonials' });
  const tCta = await getTranslations({ locale, namespace: 'cta' });
  const tFooter = await getTranslations({ locale, namespace: 'footer' });

  const stats = [
    { value: '18K+', label: tHero('stats.sellers') },
    { value: '500K+', label: tHero('stats.niches') },
    { value: '30+', label: tHero('stats.guides') },
    { value: '15+', label: tHero('stats.integrations') },
  ];

  const featureKeys = Object.keys(featureIcons) as FeatureKey[];

  const howItWorksSteps = [
    {
      number: '01',
      title: tHowItWorks('step1.title'),
      description: tHowItWorks('step1.description'),
      accent: 'from-violet-500 to-purple-600',
    },
    {
      number: '02',
      title: tHowItWorks('step2.title'),
      description: tHowItWorks('step2.description'),
      accent: 'from-blue-500 to-cyan-600',
    },
    {
      number: '03',
      title: tHowItWorks('step3.title'),
      description: tHowItWorks('step3.description'),
      accent: 'from-emerald-500 to-teal-600',
    },
  ];

  const testimonials = [
    {
      quote: tTestimonials('item1.quote'),
      author: tTestimonials('item1.author'),
      role: tTestimonials('item1.role'),
      stars: 5,
      initial: 'M',
    },
    {
      quote: tTestimonials('item2.quote'),
      author: tTestimonials('item2.author'),
      role: tTestimonials('item2.role'),
      stars: 5,
      initial: 'A',
    },
    {
      quote: tTestimonials('item3.quote'),
      author: tTestimonials('item3.author'),
      role: tTestimonials('item3.role'),
      stars: 5,
      initial: 'P',
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Navbar />

      {/* ── Section 1: Hero ── */}
      <section className="relative overflow-hidden pt-16 pb-16 md:pt-24 md:pb-28">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-violet-600/8 dark:bg-violet-600/12 blur-3xl" />
          <div className="absolute top-24 right-[-10%] h-[350px] w-[450px] rounded-full bg-blue-500/6 dark:bg-blue-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-[-5%] h-[250px] w-[350px] rounded-full bg-purple-800/5 dark:bg-purple-800/10 blur-2xl" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(rgba(124,58,237,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.5) 1px, transparent 1px)`,
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-300 mb-8">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>{tHero('badge')}</span>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-slate-900 dark:text-white mb-4 md:mb-6 leading-[1.1] tracking-tight">
            {tHero('title')}{' '}
            <span className="gradient-text">{tHero('titleHighlight')}</span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto max-w-3xl text-sm sm:text-base md:text-lg text-slate-500 dark:text-slate-400 mb-8 md:mb-10 leading-relaxed">
            {tHero('subtitle')}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-14 md:mb-16">
            <Link href={`/${locale}/register`}>
              <Button size="xl" variant="gradient" className="group w-full sm:w-auto shadow-lg shadow-violet-500/25">
                {tHero('cta')}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href={`/${locale}/pricing`}>
              <Button
                size="xl"
                variant="outline"
                className="w-full sm:w-auto border-slate-300 dark:border-slate-700 hover:border-violet-500/50 dark:hover:border-violet-500/40"
              >
                {tHero('ctaSecondary')}
              </Button>
            </Link>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {stats.map((stat, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm px-4 py-3 text-center"
              >
                <p className="text-2xl sm:text-3xl font-black gradient-text leading-tight">{stat.value}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-tight">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 2: Marketplace logos marquee ── */}
      <section className="py-5 border-y border-slate-200 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-900/40 overflow-hidden">
        <div className="flex items-center gap-8 animate-marquee-infinite whitespace-nowrap">
          {[...marketplacePlatforms, ...marketplacePlatforms].map((platform, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-default"
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="text-sm font-medium">{platform}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 3: Features Grid ── */}
      <section id="features" className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-10 md:mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/8 px-3 py-1 text-xs font-medium text-violet-600 dark:text-violet-400 mb-4">
              <Zap className="h-3 w-3" />
              {tFeatures('moduleCount')}
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-4">
              {tFeatures('title')}
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              {tFeatures('subtitle')}
            </p>
          </div>

          {/* 4-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {featureKeys.map((key, idx) => {
              const Icon = featureIcons[key] ?? BarChart3;
              const colorClass = featureColors[idx % featureColors.length] ?? featureColors[0]!;
              const iconColor = iconColors[idx % iconColors.length] ?? iconColors[0]!;

              return (
                <div
                  key={key}
                  className={`group relative rounded-xl border bg-gradient-to-br p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-slate-900/50 ${colorClass}`}
                >
                  <div
                    className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-slate-900/60 ring-1 ring-white/20 ${iconColor}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-1.5 text-sm leading-snug">
                    {tFeatures(`items.${key}.title` as Parameters<typeof tFeatures>[0])}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {tFeatures(`items.${key}.description` as Parameters<typeof tFeatures>[0])}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Section 4: Integrations banner ── */}
      <section className="py-16 md:py-20 bg-slate-50 dark:bg-slate-900/30 border-y border-slate-200 dark:border-slate-800/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/8 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 mb-4">
              <Cpu className="h-3 w-3" />
              {tIntegrations('badge')}
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-4">
              {tIntegrations('title')}
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              {tIntegrations('subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            {integrations.map((integration, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-transform hover:scale-105 ${integration.color}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {integration.name}
              </span>
            ))}
          </div>

          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-8">
            {tIntegrations('freeNote')}
          </p>
        </div>
      </section>

      {/* ── Section 5: How it works ── */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 md:mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-4">
              <CheckCircle2 className="h-3 w-3" />
              {tHowItWorks('badge')}
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-4">
              {tHowItWorks('title')}
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              {tHowItWorks('subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative">
            {/* Connector line */}
            <div
              className="hidden md:block absolute top-12 left-1/3 right-1/3 h-px bg-gradient-to-r from-violet-500/30 via-blue-500/30 to-emerald-500/30"
              aria-hidden="true"
            />

            {howItWorksSteps.map((step, idx) => (
              <div key={idx} className="relative flex flex-col items-center text-center">
                {/* Number circle */}
                <div
                  className={`mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${step.accent} shadow-lg ring-4 ring-white dark:ring-slate-950`}
                >
                  <span className="text-2xl font-black text-white">{step.number}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: Testimonials ── */}
      <section className="py-12 md:py-16 border-y border-slate-200 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-900/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-2">
              {tTestimonials('title')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{tTestimonials('subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {testimonials.map((review, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: review.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 italic mb-5 leading-relaxed">
                  &ldquo;{review.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shrink-0">
                    <span className="text-xs font-bold text-white">{review.initial}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{review.author}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{review.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 7: Pricing ── */}
      <section id="pricing" className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-4">
              {tPricing('title')}
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-slate-500 dark:text-slate-400">
              {tPricing('subtitle')}
            </p>
          </div>
          <PricingCards />
        </div>
      </section>

      {/* ── Section 8: CTA ── */}
      <section className="py-16 md:py-24 bg-slate-50 dark:bg-transparent">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 p-6 sm:p-8 md:p-12 relative overflow-hidden shadow-sm">
            {/* Decorative blobs inside card */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-violet-400/10 blur-2xl" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-blue-400/10 blur-2xl" />
            </div>

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-600 dark:text-violet-400 mb-6">
                <Users className="h-3 w-3" />
                {tCta('badge')}
              </div>

              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-4">
                {tCta('title')}
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-slate-500 dark:text-slate-400 mb-6 md:mb-8 max-w-2xl mx-auto">
                {tCta('subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Link href={`/${locale}/register`}>
                  <Button size="xl" variant="gradient" className="group w-full sm:w-auto shadow-lg shadow-violet-500/25">
                    {tHero('cta')}
                    <ChevronRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href={`/${locale}/pricing`}>
                  <Button size="xl" variant="outline" className="w-full sm:w-auto border-slate-300 dark:border-slate-700">
                    {tCta('viewPricing')}
                  </Button>
                </Link>
              </div>

              <p className="mt-5 text-xs text-slate-400 dark:text-slate-600">
                {tCta('freeNote')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 9: Footer ── */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-bg">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-bold text-slate-900 dark:text-white text-base">
                  Ecom<span className="text-brand-500 dark:text-brand-400">Pilot</span>
                  <span className="text-slate-400 text-xs font-normal ml-1">PL</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                {tFooter('tagline')}
              </p>
            </div>

            {/* Product links */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                {tFooter('productTitle')}
              </p>
              <ul className="space-y-2">
                {[
                  { href: `/${locale}#features`, label: tFooter('links.features') },
                  { href: `/${locale}/pricing`, label: tFooter('links.pricing') },
                  { href: `/${locale}/dashboard/guides`, label: tFooter('links.guides') },
                  { href: `/${locale}/dashboard/community`, label: tFooter('links.community') },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal links */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                {tFooter('legalTitle')}
              </p>
              <ul className="space-y-2">
                {[
                  { href: '#', label: tFooter('links.privacy') },
                  { href: '#', label: tFooter('links.terms') },
                  { href: '#', label: tFooter('links.contact') },
                ].map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Integrations column */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                {tFooter('integrationsTitle')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Allegro', 'Amazon', 'InPost', 'KSeF', 'VIES', 'CEIDG'].map((name) => (
                  <span
                    key={name}
                    className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-400 dark:text-slate-600">
              &copy; 2026 EcomPilot PL. {tFooter('rights')}
            </p>
            <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-600">
              <Building2 className="h-3 w-3" />
              <span>{tFooter('madeIn')}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
