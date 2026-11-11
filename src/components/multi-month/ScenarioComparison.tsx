import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/mediaplan-data';
import { useMultiMonthStore, useTimelineResult } from '@/hooks/use-multi-month-store';
import type { TimelineComparisonMetric } from '@/engine/timeline';
import { useCurrency } from '@/contexts/CurrencyContext';

interface ComparisonMetric {
  label: string;
  scenarioA: number | string;
  scenarioB: number | string;
  diff: number;
  diffPct: number;
  winner: 'A' | 'B' | 'tie';
  format: 'currency' | 'number' | 'percentage' | 'month';
}

const METRIC_LABELS: Record<TimelineComparisonMetric, string> = {
  allocatedBudget: 'Total Budget',
  revenue: 'Total Revenue',
  netProfit: 'Net Profit',
  roas: 'Avg ROAS',
  cpa: 'Avg CPA',
  breakEvenMonth: 'Break-even Month',
};

const METRIC_FORMATS: Record<TimelineComparisonMetric, ComparisonMetric['format']> = {
  allocatedBudget: 'currency',
  revenue: 'currency',
  netProfit: 'currency',
  roas: 'number',
  cpa: 'currency',
  breakEvenMonth: 'month',
};

export function ScenarioComparison() {
  const { scenarios, comparisonScenarioId, setComparisonScenario } = useMultiMonthStore();

  const { symbol, format: formatCurrency } = useCurrency();
  // Same revenue model as the active plan, so A and B are compared like for like.
  const { comparison } = useTimelineResult();

  const metrics: ComparisonMetric[] = useMemo(() => {
    if (!comparison) return [];

    const breakEvenLabel = (month: number | null) => (month !== null ? `M${month + 1}` : 'Never');

    return comparison.rows.map((row) => ({
      label: METRIC_LABELS[row.metric],
      scenarioA: row.metric === 'breakEvenMonth' ? breakEvenLabel(row.a) : (row.a ?? 0),
      scenarioB: row.metric === 'breakEvenMonth' ? breakEvenLabel(row.b) : (row.b ?? 0),
      diff: row.diff,
      diffPct: row.diffPct,
      winner: row.winner,
      format: METRIC_FORMATS[row.metric],
    }));
  }, [comparison]);

  // Chart data for overlay
  const overlayData = useMemo(() => {
    if (!comparison) return [];

    return comparison.overlay.map((point, i) => ({
      name: `M${i + 1}`,
      currentRevenue: point.aRevenue,
      currentProfit: point.aCumulativeProfit,
      compRevenue: point.bRevenue,
      compProfit: point.bCumulativeProfit,
    }));
  }, [comparison]);

  const formatValue = (value: number | string, format: ComparisonMetric['format']) => {
    if (typeof value === 'string') return value;
    switch (format) {
      case 'currency':
        return formatCurrency(value, true);
      case 'number':
        return value.toFixed(2) + 'x';
      case 'percentage':
        return value.toFixed(1) + '%';
      default:
        return value;
    }
  };

  if (scenarios.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center text-muted-foreground">
          Save at least one scenario to enable comparison.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scenario Selector */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">Current Plan (Scenario A)</div>
              <Badge variant="secondary">Active Configuration</Badge>
            </div>
            <div className="text-muted-foreground">vs</div>
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">Compare With (Scenario B)</div>
              <Select
                value={comparisonScenarioId || ''}
                onValueChange={(v) => setComparisonScenario(v || null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select scenario..." />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!comparison && (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Pick a saved scenario above to compare it with the current plan.
          </CardContent>
        </Card>
      )}

      {comparison && (
        <>
          {/* Metrics Comparison */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {metrics.map((m) => (
              <Card key={m.label} className="border-border">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-2">{m.label}</div>
                  <div className="space-y-1">
                    <div
                      className={cn(
                        'flex justify-between text-sm',
                        m.winner === 'A' && 'text-green-500 font-medium'
                      )}
                    >
                      <span>A:</span>
                      <span className="font-mono">{formatValue(m.scenarioA, m.format)}</span>
                    </div>
                    <div
                      className={cn(
                        'flex justify-between text-sm',
                        m.winner === 'B' && 'text-green-500 font-medium'
                      )}
                    >
                      <span>B:</span>
                      <span className="font-mono">{formatValue(m.scenarioB, m.format)}</span>
                    </div>
                    {m.format === 'currency' && (
                      <div
                        className={cn(
                          'text-xs text-center pt-1 border-t',
                          m.diff > 0
                            ? 'text-green-500'
                            : m.diff < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                        )}
                      >
                        {m.diff > 0 ? '+' : ''}
                        {formatCurrency(m.diff, true)} ({m.diffPct.toFixed(1)}%)
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Overlay Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Revenue Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overlayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={10}
                        tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}K`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="currentRevenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        name="Current (A)"
                      />
                      <Line
                        type="monotone"
                        dataKey="compRevenue"
                        stroke="hsl(var(--chart-3))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Comparison (B)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cumulative Profit Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overlayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={10}
                        tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}K`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="currentProfit"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        name="Current (A)"
                      />
                      <Line
                        type="monotone"
                        dataKey="compProfit"
                        stroke="hsl(var(--chart-3))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Comparison (B)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
