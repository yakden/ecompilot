'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Search,
  BookOpen,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Calendar,
  Tag,
  Loader2,
  AlertCircle,
  RefreshCw,
  Scale,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useLegalTopics,
  useLegalTopic,
  useLegalLimits,
  useLegalSearch,
  localeLang,
  type LegalTopic,
} from '@/hooks/use-legal';

// ─── Constants ────────────────────────────────────────────────────────────────

// Category labels are now resolved via t() in components that have translation context.
// This map is kept only for components that need a label outside translation hooks.
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  registration: 'categoryRegistration',
  taxation: 'categoryTaxation',
  logistics: 'categoryLogistics',
  'intellectual-property': 'categoryIntellectualProperty',
  customs: 'categoryCustoms',
  'data-protection': 'categoryDataProtection',
  'allegro-strategy': 'categoryAllegroStrategy',
  compliance: 'categoryCompliance',
  reviews: 'categoryReviews',
};

const CATEGORY_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  registration: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-300',
    border: 'border-blue-500/30',
    dot: 'bg-blue-400',
  },
  taxation: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
  },
  logistics: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  'intellectual-property': {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-300',
    border: 'border-purple-500/30',
    dot: 'bg-purple-400',
  },
  customs: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-300',
    border: 'border-orange-500/30',
    dot: 'bg-orange-400',
  },
  'data-protection': {
    bg: 'bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-300',
    border: 'border-rose-500/30',
    dot: 'bg-rose-400',
  },
  'allegro-strategy': {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-300',
    border: 'border-orange-500/30',
    dot: 'bg-orange-400',
  },
  compliance: {
    bg: 'bg-teal-500/10',
    text: 'text-teal-600 dark:text-teal-300',
    border: 'border-teal-500/30',
    dot: 'bg-teal-400',
  },
  reviews: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-600 dark:text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-400',
  },
};

const DEFAULT_COLOR = {
  bg: 'bg-slate-500/10',
  text: 'text-slate-600 dark:text-slate-300',
  border: 'border-slate-500/30',
  dot: 'bg-slate-400',
};

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? DEFAULT_COLOR;
}

const ORDERED_CATEGORIES = [
  'registration',
  'taxation',
  'logistics',
  'intellectual-property',
  'customs',
  'data-protection',
  'allegro-strategy',
  'compliance',
  'reviews',
];

// ─── Utility hooks ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ─── Date formatter ───────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ─── Category Badge ───────────────────────────────────────────────────────────

function CategoryBadge({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const t = useTranslations('dashboard.guides');
  const colors = getCategoryColor(category);
  const labelKey = CATEGORY_LABEL_KEYS[category];
  const label = labelKey ? t(labelKey as Parameters<typeof t>[0]) : category;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wide',
        colors.bg,
        colors.text,
        colors.border,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
      {label}
    </span>
  );
}

// ─── Inline Markdown renderer ─────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern =
    /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[2] !== undefined) {
      parts.push(
        <strong key={match.index} className="font-semibold text-slate-900 dark:text-white">
          {match[2]}
        </strong>,
      );
    } else if (match[3] !== undefined) {
      parts.push(
        <em key={match.index} className="italic text-slate-600 dark:text-slate-300">
          {match[3]}
        </em>,
      );
    } else if (match[4] !== undefined) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[0.85em] font-mono text-brand-600 dark:text-brand-300"
        >
          {match[4]}
        </code>,
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      const SAFE_URL = /^https?:\/\//i;
      const href = SAFE_URL.test(match[6]) ? match[6] : "#";
      parts.push(
        <a
          key={match.index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
        >
          {match[5]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts;
}

// ─── Markdown Table ───────────────────────────────────────────────────────────

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((l) => !/^\|[-| :]+\|$/.test(l))
    .map((l) =>
      l
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    );

  if (rows.length === 0) return null;

  const [header, ...body] = rows;

  return (
    <div className="overflow-x-auto my-4 rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            {header!.map((cell, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-200"
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr
              key={ri}
              className={cn(
                'border-b border-slate-200/60 dark:border-slate-800/60 last:border-0',
                ri % 2 !== 0 && 'bg-slate-50 dark:bg-slate-800/20',
              )}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2 text-slate-600 dark:text-slate-300">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Full Markdown renderer ───────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-2xl font-black text-slate-900 dark:text-white mt-8 mb-4 leading-tight">
          {renderInline(line.slice(2))}
        </h1>,
      );
      i++;
      continue;
    }

    if (line.startsWith('## ')) {
      elements.push(
        <h2
          key={i}
          className="text-lg font-bold text-slate-900 dark:text-white mt-8 mb-3 pb-2 border-b border-slate-100 dark:border-slate-200 dark:border-slate-800"
        >
          {renderInline(line.slice(3))}
        </h2>,
      );
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-slate-900 dark:text-white mt-6 mb-2">
          {renderInline(line.slice(4))}
        </h3>,
      );
      i++;
      continue;
    }

    if (/^---+$/.test(line)) {
      elements.push(<hr key={i} className="my-6 border-slate-200 dark:border-slate-800" />);
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={i}
          className="border-l-4 border-brand-600/50 pl-4 py-1 my-3 text-slate-500 dark:text-slate-400 italic"
        >
          {renderInline(line.slice(2))}
        </blockquote>,
      );
      i++;
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        tableLines.push(lines[i]!);
        i++;
      }
      elements.push(<MarkdownTable key={`table-${i}`} lines={tableLines} />);
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const listItems: string[] = [];
      while (
        i < lines.length &&
        (lines[i]!.startsWith('- ') || lines[i]!.startsWith('* '))
      ) {
        listItems.push(lines[i]!.slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-3 space-y-1.5 pl-5">
          {listItems.map((item, idx) => (
            <li
              key={idx}
              className="text-slate-600 dark:text-slate-300 list-disc marker:text-brand-500"
            >
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i]!)) {
        listItems.push(lines[i]!.replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-3 space-y-1.5 pl-5">
          {listItems.map((item, idx) => (
            <li
              key={idx}
              className="text-slate-600 dark:text-slate-300 list-decimal marker:text-brand-500"
            >
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    elements.push(
      <p key={i} className="text-slate-600 dark:text-slate-300 leading-relaxed">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────

function FaqItem({
  q,
  a,
  index,
}: {
  q: string;
  a: string;
  index: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'rounded-xl border transition-colors duration-150',
        open
          ? 'border-brand-600/40 bg-brand-600/5'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/20 text-[10px] font-bold text-brand-600 dark:text-brand-300">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-slate-900 dark:text-white leading-snug">
            {q}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform duration-200 mt-0.5',
            open && 'rotate-180 text-brand-400',
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="px-5 pb-4 pl-[3.25rem]">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

function FaqSection({ faq }: { faq: Array<{ q: string; a: string }> }) {
  const t = useTranslations('dashboard.guides');
  if (faq.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-5">
        <HelpCircle className="h-5 w-5 text-brand-400" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('faq')}
        </h2>
      </div>
      <div className="space-y-3">
        {faq.map((item, idx) => (
          <FaqItem key={idx} q={item.q} a={item.a} index={idx} />
        ))}
      </div>
    </div>
  );
}

// ─── Legal Limits Sidebar ─────────────────────────────────────────────────────

function LegalLimitsPanel({ year }: { year: number }) {
  const t = useTranslations('dashboard.guides');
  const { data, isLoading, isError } = useLegalLimits(year);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('limitsTitle')} {year}</h3>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) return null;

  const byCategory: Record<string, typeof data.limits> = {};
  for (const limit of data.limits) {
    if (!byCategory[limit.category]) byCategory[limit.category] = [];
    byCategory[limit.category]!.push(limit);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5">
      <div className="flex items-center gap-2 mb-5">
        <Scale className="h-4 w-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('limitsTitle')} {year}</h3>
      </div>
      <div className="space-y-5">
        {Object.entries(byCategory).map(([category, limits]) => (
          <div key={category}>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              {category}
            </p>
            <div className="space-y-1.5">
              {limits.map((limit, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                      {limit.name}
                    </p>
                    {limit.description && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {limit.description}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-green-600 dark:text-green-400 shrink-0 tabular-nums">
                    {limit.currency === '%'
                      ? `${limit.value}%`
                      : `${limit.value.toLocaleString('pl-PL')} ${limit.currency}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Topic Card ───────────────────────────────────────────────────────────────

function highlightText(
  text: string,
  query: string | undefined,
): React.ReactNode {
  if (!query || query.trim().length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-brand-500/30 text-brand-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function TopicCard({
  topic,
  onClick,
  searchQuery,
}: {
  topic: LegalTopic;
  onClick: () => void;
  searchQuery?: string;
}) {
  const colors = getCategoryColor(topic.category);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <CategoryBadge category={topic.category} />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors leading-snug line-clamp-2">
            {highlightText(topic.title, searchQuery)}
          </h3>
          {topic.summary && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
              {topic.summary}
            </p>
          )}
          {topic.tags && topic.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {topic.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
              {topic.tags.length > 4 && (
                <span className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                  +{topic.tags.length - 4}
                </span>
              )}
            </div>
          )}
          {topic.updatedAt && (
            <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-slate-500 dark:text-slate-400">
              <Calendar className="h-3 w-3" />
              {formatDate(topic.updatedAt)}
            </div>
          )}
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 mt-1 transition-all',
            colors.text,
            'opacity-30 group-hover:opacity-100 group-hover:translate-x-0.5',
          )}
        />
      </div>
    </button>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function TopicCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 animate-pulse">
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800 mb-2" />
      <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800 mb-2" />
      <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800 mb-1" />
      <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

// ─── Category filter pills ────────────────────────────────────────────────────

function CategoryFilters({
  categories,
  active,
  onChange,
}: {
  categories: string[];
  active: string | null;
  onChange: (cat: string | null) => void;
}) {
  const t = useTranslations('dashboard.guides');
  const ordered = ORDERED_CATEGORIES.filter((c) => categories.includes(c));
  const extra = categories.filter((c) => !ORDERED_CATEGORIES.includes(c));
  const all = [...ordered, ...extra];

  if (all.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
          !active
            ? 'border-brand-600/60 bg-brand-600/15 text-brand-600 dark:text-brand-300'
            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-600',
        )}
      >
        {t('allCategories')}
      </button>
      {all.map((cat) => {
        const colors = getCategoryColor(cat);
        const isActive = active === cat;
        const labelKey = CATEGORY_LABEL_KEYS[cat];
        const label = labelKey ? t(labelKey as Parameters<typeof t>[0]) : cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(isActive ? null : cat)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
              isActive
                ? cn(colors.bg, colors.text, colors.border)
                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:border-slate-600',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Article Detail View ──────────────────────────────────────────────────────

function ArticleView({
  slug,
  lang,
  allTopics,
  onBack,
  onTopicSelect,
}: {
  slug: string;
  lang: string;
  allTopics: LegalTopic[];
  onBack: () => void;
  onTopicSelect: (slug: string) => void;
}) {
  const t = useTranslations('dashboard.guides');
  const { data: topic, isLoading, isError } = useLegalTopic(slug, lang);

  const relatedTopics = topic
    ? allTopics
        .filter((t) => t.slug !== slug && t.category === topic.category)
        .slice(0, 3)
    : [];

  const readingMinutes =
    topic?.content
      ? Math.max(1, Math.ceil(topic.content.split(/\s+/).length / 200))
      : null;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 gap-2 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('backToList')}
      </Button>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{t('loadingGuide')}</p>
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">
            {t('errorArticle')}
          </p>
        </div>
      )}

      {topic && !isLoading && (
        <div className="max-w-[800px] mx-auto space-y-5">
          {/* Article header */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <CategoryBadge category={topic.category} />
              {topic.tags?.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white leading-tight mb-3">
              {topic.title}
            </h1>
            {topic.summary && (
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                {topic.summary}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-200 dark:border-slate-800">
              {topic.updatedAt && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{t('updatedAt')}: {formatDate(topic.updatedAt)}</span>
                </div>
              )}
              {readingMinutes && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{readingMinutes} {t('readingTime')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Article body */}
          {topic.content && (
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
              <MarkdownContent content={topic.content} />
            </div>
          )}

          {/* FAQ */}
          {topic.faq && topic.faq.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-6">
              <FaqSection faq={topic.faq} />
            </div>
          )}

          {/* Related topics */}
          {relatedTopics.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                {t('relatedTopics')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {relatedTopics.map((related) => (
                  <button
                    key={related.slug}
                    type="button"
                    onClick={() => onTopicSelect(related.slug)}
                    className="text-left rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all group"
                  >
                    <CategoryBadge
                      category={related.category}
                      className="mb-2"
                    />
                    <p className="text-xs font-medium text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors leading-snug line-clamp-3">
                      {related.title}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main GuidesClient ────────────────────────────────────────────────────────

export function GuidesClient() {
  const t = useTranslations('dashboard.guides');
  const locale = useLocale();
  const lang = localeLang(locale);

  const [rawSearch, setRawSearch] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const debouncedSearch = useDebounce(rawSearch, 300);
  const isSearching = debouncedSearch.trim().length >= 2;

  const {
    data: topicsData,
    isLoading: topicsLoading,
    isError: topicsError,
    refetch,
  } = useLegalTopics(lang);

  const { data: searchResults, isLoading: searchLoading } = useLegalSearch(
    debouncedSearch,
    lang,
  );

  const allTopics = topicsData?.items ?? [];
  const baseTopics = isSearching ? (searchResults?.items ?? []) : allTopics;

  const filteredTopics = activeCategory
    ? baseTopics.filter((t) => t.category === activeCategory)
    : baseTopics;

  const categories = Array.from(
    new Set(allTopics.map((t) => t.category)),
  ).filter(Boolean);

  const handleTopicSelect = useCallback((slug: string) => {
    setSelectedSlug(slug);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBack = useCallback(() => {
    setSelectedSlug(null);
  }, []);

  // ── Article view ──────────────────────────────────────────────────────────
  if (selectedSlug) {
    return (
      <ArticleView
        slug={selectedSlug}
        lang={lang}
        allTopics={allTopics}
        onBack={handleBack}
        onTopicSelect={handleTopicSelect}
      />
    );
  }

  // ── Topic list view ───────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
          {searchLoading && isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-500 dark:text-slate-400 dark:text-slate-500" />
          )}
          <Input
            value={rawSearch}
            onChange={(e) => {
              setRawSearch(e.target.value);
              setActiveCategory(null);
            }}
            placeholder={t('searchPlaceholder')}
            className="pl-10 pr-9"
          />
        </div>
        {topicsError && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            className="text-slate-500 dark:text-slate-400 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </Button>
        )}
      </div>

      {/* Category pills (hidden during search) */}
      {!isSearching && (
        <CategoryFilters
          categories={categories}
          active={activeCategory}
          onChange={setActiveCategory}
        />
      )}

      {/* Search status line */}
      {isSearching && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <Search className="h-3.5 w-3.5" />
          {searchLoading ? (
            <span>{t('searching')}</span>
          ) : (
            <span>
              {t('foundCount')}{' '}
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                {filteredTopics.length}
              </span>{' '}
              по запросу &ldquo;{debouncedSearch}&rdquo;
            </span>
          )}
          <button
            type="button"
            onClick={() => setRawSearch('')}
            className="ml-1 text-xs text-slate-600 hover:text-slate-500 dark:text-slate-400 underline underline-offset-2"
          >
            {t('resetSearch')}
          </button>
        </div>
      )}

      {/* Error banner */}
      {topicsError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">
            {t('errorTitle')}
          </p>
        </div>
      )}

      {/* Loading skeletons */}
      {topicsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, idx) => (
            <TopicCardSkeleton key={idx} />
          ))}
        </div>
      )}

      {/* Main content grid */}
      {!topicsLoading && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          {/* Topic cards */}
          <div className="xl:col-span-2 order-2 xl:order-1">
            {filteredTopics.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTopics.map((topic) => (
                  <TopicCard
                    key={topic.id}
                    topic={topic}
                    onClick={() => handleTopicSelect(topic.slug)}
                    searchQuery={isSearching ? debouncedSearch : undefined}
                  />
                ))}
              </div>
            ) : (
              !topicsError && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <BookOpen className="h-12 w-12 text-slate-400 dark:text-slate-700 mb-4" />
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    {t('noResults')}
                  </p>
                  {isSearching && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      {t('noResultsHint')}{' '}
                      <button
                        type="button"
                        onClick={() => setRawSearch('')}
                        className="text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:text-brand-700 dark:hover:text-brand-300"
                      >
                        {t('resetSearch')}
                      </button>
                    </p>
                  )}
                  {activeCategory && !isSearching && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      {t('noCategoryResults')}
                    </p>
                  )}
                </div>
              )
            )}
          </div>

          {/* Legal limits sidebar */}
          <div className="xl:col-span-1 order-1 xl:order-2">
            <LegalLimitsPanel year={2025} />
          </div>
        </div>
      )}
    </div>
  );
}
