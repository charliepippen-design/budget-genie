import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import { CATEGORY_INFO, formatCurrency, formatPercentage } from '@/lib/mediaplan-data';

interface ChartSectionProps {
  channels: ChannelWithMetrics[];
  categoryTotals: Record<string, { spend: number; percentage: number }>;
}

const CHART_COLORS = [
  'hsl(224, 76%, 48%)',   // Primary blue
  'hsl(187, 92%, 42%)',   // Accent cyan
  'hsl(142, 76%, 45%)',   // Success green
  'hsl(38, 92%, 55%)',    // Warning amber
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          Spend: <span className="font-mono text-foreground">{formatCurrency(data.value)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Allocation: <span className="font-mono text-foreground">{formatPercentage(data.percentage)}</span>
        </p>
      </div>
    );
  }
  return null;
};

const RoasTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm">{data.name}</p>
        <p className="text-sm text-muted-foreground">
          ROAS: <span className="font-mono text-foreground">{data.roas.toFixed(2)}x</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Spend: <span className="font-mono text-foreground">{formatCurrency(data.spend)}</span>
        </p>
      </div>
    );
  }
  return null;
};

export function ChartSection({ channels, categoryTotals }: ChartSectionProps) {
  // Pie chart data - by category
  const pieData = useMemo(() => {
    return Object.entries(categoryTotals).map(([category, data], index) => ({
      name: CATEGORY_INFO[category as keyof typeof CATEGORY_INFO].name,
      value: data.spend,
      percentage: data.percentage,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [categoryTotals]);

  // Bar chart data - ROAS by channel (top performers)
  const barData = useMemo(() => {
    return channels
      .filter((ch) => ch.metrics.spend > 0)
      .sort((a, b) => b.metrics.roas - a.metrics.roas)
      .slice(0, 8)
      .map((ch, index) => ({
        name: ch.name.replace(/^(SEO|Paid|Affiliate|Influencer) - /, ''),
        roas: ch.metrics.roas,
        spend: ch.metrics.spend,
        fill: CHART_COLORS[
          Object.keys(CATEGORY_INFO).indexOf(ch.category) % CHART_COLORS.length
        ],
      }));
  }, [channels]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pie Chart - Spend Allocation */}
      <Card className="bg-card border-border/50 card-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Spend Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  animationDuration={500}
                  animationBegin={0}
                >
                  {pieData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  formatter={(value: string) => (
                    <span className="text-sm text-foreground">{value}</span>
                  )}
                  wrapperStyle={{ paddingTop: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Bar Chart - ROAS by Channel */}
      <Card className="bg-card border-border/50 card-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">ROAS by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={barData} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  horizontal={true}
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis 
                  type="number" 
                  domain={[0, 'dataMax']}
                  tickFormatter={(value) => `${value}x`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={120}
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip content={<RoasTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
                <Bar 
                  dataKey="roas" 
                  radius={[0, 4, 4, 0]}
                  animationDuration={500}
                  animationBegin={100}
                >
                  {barData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
