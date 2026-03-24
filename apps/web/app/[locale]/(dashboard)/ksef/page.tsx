import type { Metadata } from 'next';
import { KsefClient } from './ksef-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: _locale } = await params;
  return {
    title: 'KSeF — e-Faktury — EcomPilot',
    description:
      'Zarządzaj fakturami VAT w systemie KSeF. Twórz, wysyłaj i śledź faktury elektroniczne.',
  };
}

export default async function KsefPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
        <KsefClient />
      </div>
    </div>
  );
}
