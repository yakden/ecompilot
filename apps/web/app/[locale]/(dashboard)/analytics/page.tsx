import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { AnalyticsPageClient } from './analytics-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.analytics' });
  return { title: t('title') };
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
        <AnalyticsPageClient />
      </div>
    </div>
  );
}
