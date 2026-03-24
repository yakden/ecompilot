import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { GuidesClient } from './guides-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.nav' });
  return { title: t('guides') };
}

export default async function GuidesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.nav' });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4 md:mb-6">{t('guides')}</h1>
        <GuidesClient />
      </div>
    </div>
  );
}
