import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ScenarioDatum {
  scenario: string;
  roi: number;
}

interface ScenarioChartProps {
  baselineScenarios: ScenarioDatum[];
  adjustedScenarios: ScenarioDatum[];
  axisColor: string;
  gridColor: string;
  tooltipStyle: {
    backgroundColor: string;
    border: string;
    borderRadius: string;
    color: string;
  };
  ariaLabel: string;
}

const BASELINE_STROKE = '#8b5cf6';
const ADJUSTED_STROKE = '#34d399';

export function ScenarioChart({
  baselineScenarios,
  adjustedScenarios,
  axisColor,
  gridColor,
  tooltipStyle,
  ariaLabel,
}: ScenarioChartProps) {
  const chartData = baselineScenarios.map((item) => {
    const adjusted = adjustedScenarios.find((entry) => entry.scenario === item.scenario);

    return {
      scenario: item.scenario,
      baseline: item.roi,
      adjusted: adjusted ? adjusted.roi : item.roi,
    };
  });

  return (
    <div role="img" aria-label={ariaLabel} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 20, left: 6, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="scenario"
            tick={{ fill: axisColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: axisColor, fontSize: 11 }}
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)}%`,
              name === 'baseline' ? 'Baseline ROI' : 'Adjusted ROI',
            ]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="baseline"
            stroke={BASELINE_STROKE}
            name="Baseline ROI"
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="adjusted"
            stroke={ADJUSTED_STROKE}
            name="Adjusted ROI"
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
