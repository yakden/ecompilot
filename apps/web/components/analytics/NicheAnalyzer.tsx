'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  ShoppingBag,
  Loader2,
  BarChart2,
  AlertCircle,
} from 'lucide-react';
import { cn, getScoreColor, getScoreBg, formatCurrency, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAnalyzeNiche, useNicheStatus } from '@/hooks/use-analytics';

interface NicheResult {
  niche: string;
  score: number;
  competition: number;
  demand: number;
  profitability: number;
  trend: 'up' | 'down' | 'stable';
  avgPrice: number;
  monthlyVolume: number;
  topProducts: Array<{
    name: string;
    price: number;
    sales: number;
    rating: number;
  }>;
  dataSource?: 'allegro_scrape' | 'estimated';
}

const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-400" />;
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
};

export function NicheAnalyzer() {
  const t = useTranslations('dashboard.analytics');
  const [query, setQuery] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<NicheResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isTimeout, setIsTimeout] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyzeMutation = useAnalyzeNiche();
  const statusQuery = useNicheStatus(jobId, query);

  // jobId is set after mutation succeeds (202) and cleared when analysis resolves
  // isPolling must be true as soon as jobId is set, even before the first
  // status response arrives (statusQuery.data is undefined at that point)
  const isPolling = !!jobId;
  const isLoading = analyzeMutation.isPending || isPolling;

  useEffect(() => {
    if (!statusQuery.data) return;
    if (statusQuery.data.status === 'completed' && statusQuery.data.result) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setResult(statusQuery.data.result);
      setJobId(null);
      setIsTimeout(false);
    } else if (statusQuery.data.status === 'failed') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setAnalysisError(statusQuery.data.error ?? 'Analysis failed. Please try again.');
      setJobId(null);
      setIsTimeout(false);
    }
  }, [statusQuery.data]);

  // 30-second timeout guard: show a notice if the job is still pending
  useEffect(() => {
    if (jobId) {
      setIsTimeout(false);
      timeoutRef.current = setTimeout(() => {
        setIsTimeout(true);
      }, 30_000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsTimeout(false);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [jobId]);

  async function handleAnalyze() {
    if (!query.trim()) return;
    setResult(null);
    setAnalysisError(null);
    setJobId(null);
    setIsTimeout(false);

    analyzeMutation.mutate(
      { keyword: query.trim() },
      {
        onSuccess: (data) => {
          setJobId(data.jobId);
        },
        onError: (error) => {
          setAnalysisError(error.message);
        },
      }
    );
  }

  function ScoreGauge({ value, label }: { value: number; label: string }) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">{label}</span>
          <span className={cn('text-sm font-bold', getScoreColor(value))}>
            {value}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', getScoreBg(value))}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleAnalyze()}
            placeholder={t('searchPlaceholder')}
            className="pl-10"
          />
        </div>
        <Button
          onClick={() => void handleAnalyze()}
          disabled={isLoading || !query.trim()}
          className="min-w-32"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('loading')}
            </>
          ) : (
            <>
              <BarChart2 className="mr-2 h-4 w-4" />
              {t('search')}
            </>
          )}
        </Button>
      </div>

      {/* Error State */}
      {analysisError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{analysisError}</p>
        </div>
      )}

      {/* Empty State */}
      {!result && !isLoading && !analysisError && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Search className="h-8 w-8 text-slate-600" />
          </div>
          <p className="text-slate-400">{t('noResults')}</p>
          <p className="text-sm text-slate-600 mt-1">
            Try: headphones, gaming chair, kitchen gadgets
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500 mb-4" />
          <p className="text-slate-400 animate-pulse">
            {isPolling ? 'Analyzing market data...' : t('loading')}
          </p>
          {isPolling && statusQuery.data?.status && (
            <p className="text-xs text-slate-600 mt-1 capitalize">{statusQuery.data.status}...</p>
          )}
          {isTimeout && (
            <p className="text-xs text-amber-500 mt-3 max-w-xs text-center">
              This is taking longer than usual. The analysis is still running — please wait or try again with a different keyword.
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {result && !isLoading && (
        <div className="space-y-6 animate-fade-in">
          {/* Estimated-data banner */}
          {result.dataSource === 'estimated' && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300">
                Данные оценочные. Подключите Allegro API в настройках для точных результатов.
              </p>
            </div>
          )}

          {/* Score Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Main Score */}
            <div className="md:col-span-1 rounded-xl border border-slate-700 bg-slate-800/50 p-6 flex flex-col items-center justify-center">
              <p className="text-sm text-slate-400 mb-3">{t('score')}</p>
              <div className="relative flex h-28 w-28 items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="44"
                    fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"
                  />
                  <circle
                    cx="50" cy="50" r="44"
                    fill="none"
                    stroke={(result.score ?? 0) >= 70 ? '#22c55e' : (result.score ?? 0) >= 45 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44 * (result.score ?? 0) / 100} ${2 * Math.PI * 44}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="text-center">
                  <span className={cn('text-3xl font-black', getScoreColor(result.score ?? 0))}>
                    {result.score ?? 0}
                  </span>
                  <span className="block text-xs text-slate-500">/100</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <TrendIcon trend={result.trend ?? 'stable'} />
                <span className="text-xs text-slate-400 capitalize">{result.trend ?? 'stable'}</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-800/50 p-6 space-y-4">
              <ScoreGauge value={result.competition ?? 0} label={t('competition')} />
              <ScoreGauge value={result.demand ?? 0} label={t('demand')} />
              <ScoreGauge value={result.profitability ?? 0} label={t('profitability')} />
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-xs text-slate-500 mb-1">Avg. Price</p>
              <p className="text-xl font-bold text-white">{formatCurrency(result.avgPrice ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-xs text-slate-500 mb-1">Monthly Volume</p>
              <p className="text-xl font-bold text-white">{formatNumber(result.monthlyVolume ?? 0)} units</p>
            </div>
          </div>

          {/* Top Products Table */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-brand-400" />
              <h3 className="text-sm font-semibold text-white">{t('topProducts')}</h3>
            </div>
            <div className="divide-y divide-slate-800">
              {(result.topProducts ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  No product data available
                </div>
              ) : (
                (result.topProducts ?? []).map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
                        {idx + 1}
                      </span>
                      <span className="text-sm text-slate-200 font-medium">{product.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-400">{formatCurrency(product.price ?? 0)}</span>
                      <span className="text-slate-500">{formatNumber(product.sales ?? 0)} sales</span>
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star className="h-3.5 w-3.5 fill-amber-400" />
                        {(product.rating ?? 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
