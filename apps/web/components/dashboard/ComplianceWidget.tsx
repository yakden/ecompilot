'use client';

// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — ComplianceWidget
// Account compliance risk gauge + health metrics + quick actions
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useLocale } from 'next-intl';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Shield,
  TrendingUp,
  RotateCcw,
  MessageCircle,
  Truck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface HealthMetric {
  readonly label: string;
  readonly value: string;
  readonly target: string;
  readonly status: 'good' | 'warning' | 'danger';
  readonly icon: React.ComponentType<{ className?: string }>;
}

interface ComplianceWidgetProps {
  readonly riskScore?: number;
  readonly riskLevel?: RiskLevel;
  readonly metrics?: readonly HealthMetric[];
  readonly lastChecked?: string;
  readonly className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk level configuration
// ─────────────────────────────────────────────────────────────────────────────

interface RiskConfig {
  readonly label: string;
  readonly color: string;
  readonly bgColor: string;
  readonly borderColor: string;
  readonly ringColor: string;
  readonly gaugeColor: string;
  readonly Icon: React.ComponentType<{ className?: string }>;
}

const RISK_CONFIG: Record<RiskLevel, RiskConfig> = {
  low: {
    label: 'Low Risk',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    ringColor: 'stroke-emerald-500',
    gaugeColor: '#10b981',
    Icon: ShieldCheck,
  },
  medium: {
    label: 'Medium Risk',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    ringColor: 'stroke-amber-500',
    gaugeColor: '#f59e0b',
    Icon: ShieldAlert,
  },
  high: {
    label: 'High Risk',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    ringColor: 'stroke-orange-500',
    gaugeColor: '#f97316',
    Icon: ShieldAlert,
  },
  critical: {
    label: 'Critical Risk',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    ringColor: 'stroke-red-500',
    gaugeColor: '#ef4444',
    Icon: ShieldX,
  },
};

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'low';
  if (score >= 50) return 'medium';
  if (score >= 20) return 'high';
  return 'critical';
}

// ─────────────────────────────────────────────────────────────────────────────
// Status icon helper
// ─────────────────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: 'good' | 'warning' | 'danger' }) {
  if (status === 'good') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  }
  if (status === 'warning') {
    return <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />;
  }
  return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG gauge component
// ─────────────────────────────────────────────────────────────────────────────

interface GaugeProps {
  readonly score: number;
  readonly color: string;
}

function ScoreGauge({ score, color }: GaugeProps) {
  // Semi-circle gauge: goes from 180° to 0° (left to right)
  const radius = 40;
  const circumference = Math.PI * radius; // half-circle arc length
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (clampedScore / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="100" height="56" viewBox="0 0 100 56" className="overflow-visible">
        {/* Track */}
        <path
          d="M 10,50 A 40,40 0 0,1 90,50"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-slate-700"
        />
        {/* Progress */}
        <path
          d="M 10,50 A 40,40 0 0,1 90,50"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
        />
      </svg>
      {/* Score number */}
      <div className="absolute bottom-0 flex flex-col items-center" style={{ bottom: '-2px' }}>
        <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-none">
          {clampedScore}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-none mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default mock metrics (used when no real data is passed)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_METRICS: readonly HealthMetric[] = [
  {
    label: 'Seller Rating',
    value: '98.4%',
    target: '≥98%',
    status: 'good',
    icon: TrendingUp,
  },
  {
    label: 'Return Rate',
    value: '2.1%',
    target: '<3%',
    status: 'good',
    icon: RotateCcw,
  },
  {
    label: 'Response Time',
    value: '5.2h',
    target: '<24h',
    status: 'good',
    icon: MessageCircle,
  },
  {
    label: 'Late Shipments',
    value: '3.8%',
    target: '<2%',
    status: 'warning',
    icon: Truck,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ComplianceWidget
// ─────────────────────────────────────────────────────────────────────────────

export function ComplianceWidget({
  riskScore = 82,
  riskLevel,
  metrics = DEFAULT_METRICS,
  lastChecked,
  className,
}: ComplianceWidgetProps) {
  const locale = useLocale();
  const computedRiskLevel = riskLevel ?? scoreToRiskLevel(riskScore);
  const config = RISK_CONFIG[computedRiskLevel];
  const { Icon } = config;

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 flex flex-col gap-5',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border',
              config.bgColor,
              config.borderColor,
            )}
          >
            <Shield className={cn('h-4 w-4', config.color)} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Account Compliance</h3>
            {lastChecked && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Last checked:{' '}
                {new Date(lastChecked).toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            config.bgColor,
            config.borderColor,
            config.color,
          )}
        >
          <Icon className="h-3 w-3" />
          {config.label}
        </span>
      </div>

      {/* Gauge + metrics row */}
      <div className="flex items-start gap-5">
        {/* Gauge */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <ScoreGauge score={riskScore} color={config.gaugeColor} />
          <span className="text-[10px] text-slate-400 dark:text-slate-500">Compliance Score</span>
        </div>

        {/* Health metrics */}
        <div className="flex-1 grid grid-cols-1 gap-2 min-w-0">
          {metrics.map((metric) => {
            const MetricIcon = metric.icon;
            return (
              <div
                key={metric.label}
                className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 px-3 py-2"
              >
                <MetricIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="flex-1 min-w-0 text-xs text-slate-400 truncate">
                  {metric.label}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={cn(
                      'text-xs font-semibold tabular-nums',
                      metric.status === 'good' && 'text-emerald-400',
                      metric.status === 'warning' && 'text-amber-400',
                      metric.status === 'danger' && 'text-red-400',
                    )}
                  >
                    {metric.value}
                  </span>
                  <span className="text-[10px] text-slate-600">{metric.target}</span>
                  <StatusIcon status={metric.status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-slate-200 dark:bg-slate-800" />

      {/* Quick action buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition-colors',
            'border-brand-600/40 bg-brand-600/10 text-brand-600 dark:text-brand-300 hover:bg-brand-600/20',
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Check Listing
        </button>
        <Link
          href={`/${locale}/ai-assistant`}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition-colors',
            'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white',
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Guides
          <ArrowRight className="h-3 w-3 ml-auto" />
        </Link>
      </div>

      {/* Compliance guides link */}
      <p className="text-center text-[11px] text-slate-600">
        Learn about{' '}
        <Link
          href={`/${locale}/ai-assistant`}
          className="text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors"
        >
          Allegro TOS rules and account protection
        </Link>
      </p>
    </div>
  );
}
