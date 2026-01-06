import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/mediaplan-data';
import { useMultiMonthMetrics } from '@/hooks/use-multi-month-store';

const CHANNEL_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(220 70% 50%)',
  'hsl(280 70% 50%)',
  'hsl(340 70% 50%)',
  'hsl(60 70% 50%)',
  'hsl(180 70% 50%)',
  'hsl(120 70% 50%)',
];

export function MultiMonthCharts() {
  const { months, totals } = useMultiMonthMetrics();

  // Budget vs Revenue trend data
  const trendData = useMemo(() => {
    return months.map((m, idx) => ({
      name: m.label.replace(' (Soft Launch)', '').split(' ')[0].slice(0, 3),
      month: `M${idx + 1}`,
      budget: m.totalSpend || 0,
      revenue: m.revenue || 0,
      profit: m.netProfit || 0,
    }));
  }, [months]);

  // Channel spend evolution data
  const channelEvolutionData = useMemo(() => {
    return months.map((m, idx) => {
      const data: Record<string, number | string> = {
        name: m.label.replace(' (Soft Launch)', '').split(' ')[0].slice(0, 3),
      };
      m.channels.forEach((ch) => {
        const spend = (ch.allocationPct / 100) * (m.totalSpend || m.budget);
        data[ch.name.replace(/^(SEO|Paid|Affiliate|Influencer)\s*-\s*/, '')] = spend;
      });
      return data;
    });
  }, [months]);

  // Get unique channel names for stacking
  const channelNames = useMemo(() => {
    if (months.length === 0) return [];
    return months[0].channels.map((ch) => 
      ch.name.replace(/^(SEO|Paid|Affiliate|Influencer)\s*-\s*/, '')
    );
  }, [months]);

  // Cumulative profit curve data
  const cumulativeData = useMemo(() => {
    return months.map((m, idx) => ({
      name: m.label.replace(' (Soft Launch)', '').split(' ')[0].slice(0, 3),
      cumulative: m.cumulativeProfit || 0,
      positive: (m.cumulativeProfit || 0) > 0 ? m.cumulativeProfit : 0,
      negative: (m.cumulativeProfit || 0) < 0 ? m.cumulativeProfit : 0,
    }));
  }, [months]);

  if (months.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Generate months to see charts
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Budget vs Revenue Trend */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Budget vs Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis 
                  yAxisId="left"
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`}
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
                  yAxisId="left"
                  type="monotone" 
                  dataKey="budget" 
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Budget"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Revenue"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Cumulative Profit Curve */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cumulative Profit/Loss</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Area 
                  type="monotone" 
                  dataKey="positive" 
                  fill="hsl(142 76% 36% / 0.3)"
                  stroke="hsl(142 76% 36%)"
                  strokeWidth={2}
                  name="Profit"
                />
                <Area 
                  type="monotone" 
                  dataKey="negative" 
                  fill="hsl(var(--destructive) / 0.3)"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  name="Loss"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Channel Spend Evolution */}
      <Card className="border-border lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Channel Spend Evolution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '10px' }}
                  formatter={(value) => <span className="text-xs">{value}</span>}
                />
                {channelNames.map((name, idx) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="a"
                    fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
