import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import '@/app/globals.css';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { ThemeScript } from '@/components/ui/ThemeScript';

const localeNames: Record<string, string> = {
  ru: 'ru-RU',
  pl: 'pl-PL',
  ua: 'uk-UA',
  en: 'en-US',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hero' });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://ecompilot.pl';

  return {
    title: {
      default: `EcomPilot PL — ${t('titleHighlight')}`,
      template: `%s | EcomPilot PL`,
    },
    description: t('subtitle'),
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        'ru-RU': `${baseUrl}/ru`,
        'pl-PL': `${baseUrl}/pl`,
        'uk-UA': `${baseUrl}/ua`,
        'en-US': `${baseUrl}/en`,
      },
    },
    openGraph: {
      type: 'website',
      locale: localeNames[locale] ?? 'en-US',
      url: `${baseUrl}/${locale}`,
      title: 'EcomPilot PL',
      description: t('subtitle'),
      siteName: 'EcomPilot PL',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'EcomPilot PL',
      description: t('subtitle'),
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as 'ru' | 'pl' | 'ua' | 'en')) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased font-sans transition-colors duration-300">
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <ThemeProvider>
              {children}
            </ThemeProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
