'use client';

interface CategoryData {
  category: string;
  revenue: number;
  products: number;
  sold: number;
}

interface CategoryBreakdownProps {
  data: CategoryData[];
  labels: {
    products: string;
    sold: string;
  };
}

const COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-teal-500',
];

export function CategoryBreakdown({ data, labels }: CategoryBreakdownProps) {
  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map((c) => c.revenue), 1);

  return (
    <div className="space-y-3">
      {data.map((cat, i) => {
        const pct = (cat.revenue / maxRevenue) * 100;
        const colorClass = COLORS[i % COLORS.length] ?? COLORS[0];
        return (
          <div key={cat.category}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {cat.category}
              </span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-2 whitespace-nowrap">
                {(cat.revenue / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700/50 overflow-hidden">
              <div
                className={`h-full rounded-full ${colorClass} transition-all`}
                style={{ width: `${String(Math.max(pct, 2))}%` }}
              />
            </div>
            <div className="flex gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{labels.products}: {String(cat.products)}</span>
              <span>{labels.sold}: {String(cat.sold)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
