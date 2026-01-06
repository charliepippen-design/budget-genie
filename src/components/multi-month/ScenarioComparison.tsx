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
import { formatCurrency, formatNumber } from '@/lib/mediaplan-data';
import {
  useMultiMonthStore,
  useMultiMonthMetrics,
  useScenarioMetrics,
  calculatePlanMetrics,
} from '@/hooks/use-multi-month-store';
import { useCurrency } from '@/hooks/use-currency-store';

interface ComparisonMetric {
  label: string;
  scenarioA: number | string;
  scenarioB: number | string;
  diff: number;
  diffPct: number;
  winner: 'A' | 'B' | 'tie';
  format: 'currency' | 'number' | 'percentage' | 'month';
}

export function ScenarioComparison() {
  const {
    scenarios,
    comparisonScenarioId,
    setComparisonScenario,
    globalSettings,
    months,
  } = useMultiMonthStore();

  const { symbol } = useCurrency();
  const currentMetrics = useMultiMonthMetrics();
  const comparisonScenario = scenarios.find(s => s.id === comparisonScenarioId);
  const comparisonMetrics = useMemo(() => {
    if (!comparisonScenario) return null;
    return calculatePlanMetrics(comparisonScenario.months, comparisonScenario.globalSettings);
  }, [comparisonScenario]);

  const metrics: ComparisonMetric[] = useMemo(() => {
    if (!comparisonMetrics) return [];

    const a = currentMetrics.totals;
    const b = comparisonMetrics.totals;

    const compare = (
      aVal: number,
      bVal: number,
      higherIsBetter: boolean
    ): { diff: number; diffPct: number; winner: 'A' | 'B' | 'tie' } => {
      const diff = aVal - bVal;
      const diffPct = bVal !== 0 ? (diff / Math.abs(bVal)) * 100 : 0;
      let winner: 'A' | 'B' | 'tie' = 'tie';
      if (Math.abs(diff) > 0.01) {
        winner = higherIsBetter ? (diff > 0 ? 'A' : 'B') : (diff < 0 ? 'A' : 'B');
      }
      return { diff, diffPct, winner };
    };

    return [
      {
        label: 'Total Budget',
        scenarioA: a.totalBudget,
        scenarioB: b.totalBudget,
        ...compare(a.totalBudget, b.totalBudget, false),
        format: 'currency' as const,
      },
      {
        label: 'Total Revenue',
        scenarioA: a.totalRevenue,
        scenarioB: b.totalRevenue,
        ...compare(a.totalRevenue, b.totalRevenue, true),
        format: 'currency' as const,
      },
      {
        label: 'Net Profit',
        scenarioA: a.netProfit,
        scenarioB: b.netProfit,
        ...compare(a.netProfit, b.netProfit, true),
        format: 'currency' as const,
      },
      {
        label: 'Avg ROAS',
        scenarioA: a.avgRoas,
        scenarioB: b.avgRoas,
        ...compare(a.avgRoas, b.avgRoas, true),
        format: 'number' as const,
      },
      {
        label: 'Avg CPA',
        scenarioA: a.avgCpa || 0,
        scenarioB: b.avgCpa || 0,
        ...compare(a.avgCpa || 0, b.avgCpa || 0, false),
        format: 'currency' as const,
      },
      {
        label: 'Break-even Month',
        scenarioA: a.breakEvenMonth !== null ? `M${a.breakEvenMonth + 1}` : 'Never',
        scenarioB: b.breakEvenMonth !== null ? `M${b.breakEvenMonth + 1}` : 'Never',
        diff: (a.breakEvenMonth ?? 99) - (b.breakEvenMonth ?? 99),
        diffPct: 0,
        winner: a.breakEvenMonth !== null && b.breakEvenMonth !== null
          ? (a.breakEvenMonth < b.breakEvenMonth ? 'A' : a.breakEvenMonth > b.breakEvenMonth ? 'B' : 'tie')
          : a.breakEvenMonth !== null ? 'A' : b.breakEvenMonth !== null ? 'B' : 'tie',
        format: 'month' as const,
      },
    ];
  }, [currentMetrics, comparisonMetrics]);

  // Chart data for overlay
  const overlayData = useMemo(() => {
    if (!comparisonMetrics) return [];
    
    const maxLen = Math.max(currentMetrics.months.length, comparisonMetrics.months.length);
    const data = [];
    
    for (let i = 0; i < maxLen; i++) {
      const currentMonth = currentMetrics.months[i];
      const compMonth = comparisonMetrics.months[i];
      
      data.push({
        name: `M${i + 1}`,
        currentRevenue: currentMonth?.revenue || 0,
        currentProfit: currentMonth?.cumulativeProfit || 0,
        compRevenue: compMonth?.revenue || 0,
        compProfit: compMonth?.cumulativeProfit || 0,
      });
    }
    
    return data;
  }, [currentMetrics, comparisonMetrics]);

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

      {comparisonMetrics && (
        <>
          {/* Metrics Comparison */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {metrics.map((m) => (
              <Card key={m.label} className="border-border">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-2">{m.label}</div>
                  <div className="space-y-1">
                    <div className={cn(
                      "flex justify-between text-sm",
                      m.winner === 'A' && "text-green-500 font-medium"
                    )}>
                      <span>A:</span>
                      <span className="font-mono">{formatValue(m.scenarioA, m.format)}</span>
                    </div>
                    <div className={cn(
                      "flex justify-between text-sm",
                      m.winner === 'B' && "text-green-500 font-medium"
                    )}>
                      <span>B:</span>
                      <span className="font-mono">{formatValue(m.scenarioB, m.format)}</span>
                    </div>
                    {m.format === 'currency' && (
                      <div className={cn(
                        "text-xs text-center pt-1 border-t",
                        m.diff > 0 ? "text-green-500" : m.diff < 0 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {m.diff > 0 ? '+' : ''}{formatCurrency(m.diff, true)} ({m.diffPct.toFixed(1)}%)
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
