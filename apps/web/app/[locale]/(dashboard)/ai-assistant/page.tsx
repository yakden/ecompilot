import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { ChatInterface } from '@/components/ai/ChatInterface';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ai' });
  return { title: t('title') };
}

export default async function AIAssistantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ai' });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-hidden p-2 sm:p-4 md:p-6 flex flex-col">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4 md:mb-6 px-2 sm:px-0">{t('title')}</h1>
        <div className="flex-1 min-h-0">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
