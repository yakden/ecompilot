'use client';

interface DataPoint {
  date: string;
  revenue: number;
  sold: number;
}

interface RevenueChartProps {
  data: DataPoint[];
  label: string;
}

export function RevenueChart({ data, label }: RevenueChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {label}
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const padding = { top: 20, right: 16, bottom: 32, left: 60 };
  const width = 700;
  const height = 240;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2),
    y: padding.top + chartH - (d.revenue / maxRevenue) * chartH,
    ...d,
  }));

  const linePoints = points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');
  const areaPoints = [
    `${String(points[0]?.x ?? padding.left)},${String(padding.top + chartH)}`,
    ...points.map((p) => `${String(p.x)},${String(p.y)}`),
    `${String(points[points.length - 1]?.x ?? padding.left + chartW)},${String(padding.top + chartH)}`,
  ].join(' ');

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    value: Math.round(maxRevenue * pct) / 100,
    y: padding.top + chartH - pct * chartH,
  }));

  // X-axis labels — show every ~5th date
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data
    .filter((_d, i) => i % step === 0 || i === data.length - 1)
    .map((d, _i, arr) => {
      const idx = data.indexOf(d);
      const x = padding.left + (data.length > 1 ? (idx / (data.length - 1)) * chartW : chartW / 2);
      return { label: d.date.slice(5), x };
    });

  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} className="w-full h-auto">
      <defs>
        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={padding.left}
            y1={tick.y}
            x2={padding.left + chartW}
            y2={tick.y}
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-700/50"
            strokeDasharray="4 4"
          />
          <text
            x={padding.left - 8}
            y={tick.y + 4}
            textAnchor="end"
            className="fill-slate-400 dark:fill-slate-500"
            fontSize="10"
          >
            {tick.value >= 1000 ? `${String(Math.round(tick.value / 1000))}k` : String(Math.round(tick.value))}
          </text>
        </g>
      ))}

      {/* X labels */}
      {xLabels.map((xl) => (
        <text
          key={xl.label}
          x={xl.x}
          y={height - 6}
          textAnchor="middle"
          className="fill-slate-400 dark:fill-slate-500"
          fontSize="10"
        >
          {xl.label}
        </text>
      ))}

      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#revenueGrad)" />

      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="rgb(99,102,241)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots */}
      {points.map((p) => (
        <circle
          key={p.date}
          cx={p.x}
          cy={p.y}
          r="3"
          fill="rgb(99,102,241)"
          stroke="white"
          strokeWidth="1.5"
          className="dark:stroke-slate-900"
        />
      ))}
    </svg>
  );
}
