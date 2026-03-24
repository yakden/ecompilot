import type { Metadata } from 'next';
import { InventoryClient } from './inventory-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: _locale } = await params;
  return {
    title: 'Zarządzanie Magazynem — EcomPilot',
    description:
      'Analiza ABC, prognozowanie popytu, martwy zapas i alerty magazynowe.',
  };
}

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4 md:mb-6">
          Zarządzanie Magazynem
        </h1>
        <InventoryClient />
      </div>
    </div>
  );
}
