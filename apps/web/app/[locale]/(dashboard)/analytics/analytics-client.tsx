'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { NicheAnalyzer } from '@/components/analytics/NicheAnalyzer';
import { SeasonalCalendar } from '@/components/analytics/SeasonalCalendar';

type AnalyticsTab = 'overview' | 'niches' | 'seasonal';

export function AnalyticsPageClient() {
  const t = useTranslations('dashboard.analytics');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');

  const tabs: Array<{ key: AnalyticsTab; label: string }> = [
    { key: 'overview', label: t('tabOverview') },
    { key: 'niches', label: t('tabNiches') },
    { key: 'seasonal', label: t('tabSeasonal') },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        {t('title')}
      </h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'text-slate-900 dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-500 after:rounded-t-full'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <AnalyticsDashboard onSwitchToNiches={() => setActiveTab('niches')} />
      )}
      {activeTab === 'niches' && <NicheAnalyzer />}
      {activeTab === 'seasonal' && <SeasonalCalendar />}
    </div>
  );
}
