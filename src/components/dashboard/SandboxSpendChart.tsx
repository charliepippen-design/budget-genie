import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface SandboxSpendDatum {
  channel: string;
  spend: number;
}

interface SandboxSpendChartProps {
  baselineData: SandboxSpendDatum[];
  adjustedData: SandboxSpendDatum[];
  axisColor: string;
  gridColor: string;
  tooltipStyle: {
    backgroundColor: string;
    border: string;
    borderRadius: string;
    color: string;
  };
  formatCurrency: (value: number) => string;
  symbol: string;
  ariaLabel: string;
}

const BASELINE_FILL = 'rgba(148,163,184,0.68)';
const INCREASE_FILL = 'rgba(52,211,153,0.82)';
const DECREASE_FILL = 'rgba(251,113,133,0.82)';
const NEUTRAL_FILL = 'rgba(34,211,238,0.82)';

export function SandboxSpendChart({
  baselineData,
  adjustedData,
  axisColor,
  gridColor,
  tooltipStyle,
  formatCurrency,
  symbol,
  ariaLabel,
}: SandboxSpendChartProps) {
  const chartData = baselineData.map((item) => {
    const adjusted = adjustedData.find((entry) => entry.channel === item.channel);
    const adjustedSpend = adjusted ? adjusted.spend : item.spend;
    const delta = adjustedSpend - item.spend;

    return {
      channel: item.channel,
      baseline: item.spend,
      adjusted: adjustedSpend,
      adjustedFill: delta > 0 ? INCREASE_FILL : delta < 0 ? DECREASE_FILL : NEUTRAL_FILL,
    };
  });

  return (
    <div role="img" aria-label={ariaLabel} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 16, left: 6, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="channel"
            tick={{ fill: axisColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: axisColor, fontSize: 11 }}
            tickFormatter={(value: number) => `${symbol}${Math.round(value)}`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'baseline' ? 'Baseline Spend' : 'Adjusted Spend',
            ]}
          />
          <Legend />
          <Bar
            dataKey="baseline"
            fill={BASELINE_FILL}
            name="Baseline Spend"
            radius={[6, 6, 0, 0]}
          />
          <Bar dataKey="adjusted" name="Adjusted Spend" radius={[6, 6, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={`${entry.channel}-adjusted`} fill={entry.adjustedFill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
