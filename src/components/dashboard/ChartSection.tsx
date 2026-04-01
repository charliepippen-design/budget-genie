import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ChannelWithMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  buildBudgetUtilization,
  buildChannelStackData,
  buildGroupSpendTotals,
  buildRoasTrendData,
  getChannelGroup,
  GROUP_COLORS,
  GROUP_LABELS,
  type ChannelGroup,
} from '@/lib/planning-insights';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/hooks/use-theme';

interface ChartSectionProps {
  channels: ChannelWithMetrics[];
  categoryTotals: Record<string, { spend: number; percentage: number }>;
}

interface RoasTooltipPayload {
  month: string;
  Organic?: number;
  Paid?: number;
  Affiliate?: number;
  Influencer?: number;
}

interface TooltipProps<T> {
  active?: boolean;
  payload?: Array<{ payload: T }>;
}

const CHANNEL_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#8b5cf6',
  '#ef4444',
  '#84cc16',
  '#f97316',
  '#14b8a6',
];

type ViewMode = 'category' | 'channel';

export function ChartSection({ channels, categoryTotals }: ChartSectionProps) {
  const { format: formatCurrency } = useCurrency();
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [groupView, setGroupView] = useState<ChannelGroup | 'all'>('all');
  const totalBudget = useMediaPlanStore((state) => state.totalBudget);

  const chartAxisColor = theme === 'dark' ? '#94a3b8' : '#475569';
  const chartGridColor = theme === 'dark' ? 'rgba(100,116,139,0.25)' : 'rgba(148,163,184,0.3)';
  const tooltipClass =
    theme === 'dark'
      ? 'bg-slate-950/95 border border-slate-700 text-slate-100'
      : 'bg-white/95 border border-slate-300 text-slate-700';

  const SpendTooltip = ({ active, payload }: TooltipProps<Record<string, number | string>>) => {
    if (active && payload && payload.length) {
      const entries = payload.map((item) => item.payload).filter(Boolean) as Array<
        Record<string, number | string>
      >;
      const data = entries[0] || {};

      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-sm">{String(data.name ?? 'Spend Distribution')}</p>
          {Object.keys(data)
            .filter((key) => key !== 'name' && typeof data[key] === 'number')
            .map((key) => (
              <p key={key} className="text-sm text-muted-foreground">
                {key}:{' '}
                <span className="font-mono text-foreground">
                  {formatCurrency(Number(data[key]))}
                </span>
              </p>
            ))}
        </div>
      );
    }
    return null;
  };

  const RoasTooltip = ({ active, payload }: TooltipProps<RoasTooltipPayload>) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className={`${tooltipClass} rounded-lg p-3 shadow-lg backdrop-blur`}>
          <p className="font-semibold text-sm">{data.month}</p>
          <p className="text-sm">
            Organic:{' '}
            <span className="font-mono text-[#22c55e]">{(data.Organic ?? 0).toFixed(2)}x</span>
          </p>
          <p className="text-sm">
            Paid: <span className="font-mono text-[#3b82f6]">{(data.Paid ?? 0).toFixed(2)}x</span>
          </p>
          <p className="text-sm">
            Affiliate:{' '}
            <span className="font-mono text-[#f59e0b]">{(data.Affiliate ?? 0).toFixed(2)}x</span>
          </p>
          <p className="text-sm">
            Influencer:{' '}
            <span className="font-mono text-[#ec4899]">{(data.Influencer ?? 0).toFixed(2)}x</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const groupedChannels = useMemo(
    () =>
      channels.reduce<Record<ChannelGroup, ChannelWithMetrics[]>>(
        (acc, channel) => {
          const group = getChannelGroup(channel);
          acc[group].push(channel);
          return acc;
        },
        { organic: [], paid: [], affiliate: [], influencer: [] }
      ),
    [channels]
  );

  const groupTotals = useMemo(() => buildGroupSpendTotals(channels), [channels]);
  const budgetUtilization = useMemo(
    () => buildBudgetUtilization(channels, totalBudget),
    [channels, totalBudget]
  );

  const categoryStackData = useMemo(
    () => [
      {
        name: 'Category Spend',
        Organic: groupTotals.organic,
        Paid: groupTotals.paid,
        Affiliate: groupTotals.affiliate,
        Influencer: groupTotals.influencer,
      },
    ],
    [groupTotals]
  );

  const visibleChannels = useMemo(() => {
    const list = groupView === 'all' ? channels : groupedChannels[groupView];
    return list.filter((channel) => channel.metrics.spend > 0);
  }, [channels, groupView, groupedChannels]);

  const channelStackData = useMemo(() => buildChannelStackData(visibleChannels), [visibleChannels]);

  const roasTrendData = useMemo(
    () =>
      buildRoasTrendData(channels, {
        churnRate: 0.04,
        cpaMultiplier: 1,
        roasMultiplier: 1,
      }),
    [channels]
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2 border border-slate-700/60 bg-slate-900/50 backdrop-blur-md shadow-[0_10px_35px_rgba(15,23,42,0.45)]">
        <CardHeader className="pb-2 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold">Spend Distribution</CardTitle>
            <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'rounded-none h-8 px-3 text-xs',
                  viewMode === 'category' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300'
                )}
                onClick={() => setViewMode('category')}
                aria-label="Switch to category spend view"
              >
                Category View
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'rounded-none h-8 px-3 text-xs',
                  viewMode === 'channel' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-300'
                )}
                onClick={() => setViewMode('channel')}
                aria-label="Switch to channel spend view"
              >
                Channel View
              </Button>
            </div>
          </div>
          {viewMode === 'channel' && (
            <Tabs
              value={groupView}
              onValueChange={(value) => setGroupView(value as ChannelGroup | 'all')}
            >
              <TabsList className="grid w-full grid-cols-5 bg-slate-950/70 border border-slate-700">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="organic">Organic</TabsTrigger>
                <TabsTrigger value="paid">Paid</TabsTrigger>
                <TabsTrigger value="affiliate">Affiliate</TabsTrigger>
                <TabsTrigger value="influencer">Influencer</TabsTrigger>
              </TabsList>
              <TabsContent value={groupView} className="mt-0" />
            </Tabs>
          )}
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={viewMode === 'category' ? categoryStackData : channelStackData}
                margin={{ top: 6, right: 8, left: 8, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: chartAxisColor, fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value: number) => formatCurrency(value)}
                  tick={{ fill: chartAxisColor, fontSize: 11 }}
                  tickLine={false}
                />
                <Tooltip content={<SpendTooltip />} />
                <Legend
                  formatter={(value) => <span className="text-slate-200 text-xs">{value}</span>}
                />
                {viewMode === 'category'
                  ? (Object.keys(GROUP_LABELS) as ChannelGroup[]).map((group) => (
                      <Bar
                        key={group}
                        dataKey={GROUP_LABELS[group]}
                        stackId="spend"
                        fill={GROUP_COLORS[group]}
                        radius={[4, 4, 0, 0]}
                        animationDuration={450}
                        animationEasing="ease-in-out"
                      />
                    ))
                  : visibleChannels.map((channel, index) => (
                      <Bar
                        key={channel.id}
                        dataKey={channel.name}
                        stackId="spend"
                        fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]}
                        radius={[4, 4, 0, 0]}
                        animationDuration={450}
                        animationEasing="ease-in-out"
                      />
                    ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-700/60 bg-slate-900/50 backdrop-blur-md shadow-[0_10px_35px_rgba(15,23,42,0.45)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Budget Utilization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AnimatePresence mode="popLayout">
            {budgetUtilization.map((item) => (
              <motion.div
                key={`${item.group}-${item.status}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: 'easeInOut' }}
                className="space-y-1.5"
                aria-live="polite"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{item.label}</span>
                  <span
                    className={cn(
                      'font-mono',
                      item.status === 'overspend' && 'text-red-400',
                      item.status === 'underfunded' && 'text-green-400',
                      item.status === 'balanced' && 'text-slate-300'
                    )}
                  >
                    {item.utilizationPct.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(100, item.utilizationPct)}
                  className={cn(
                    'h-2 transition-all duration-300 ease-in-out',
                    item.status === 'overspend' && '[&>div]:bg-red-500',
                    item.status === 'underfunded' && '[&>div]:bg-green-500'
                  )}
                  aria-label={`${item.label} budget utilization`}
                />
                <p className="text-[11px] text-slate-400">{formatCurrency(item.spend)} allocated</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card className="xl:col-span-3 border border-slate-700/60 bg-slate-900/50 backdrop-blur-md shadow-[0_10px_35px_rgba(15,23,42,0.45)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">ROAS Trend Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={roasTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: chartAxisColor, fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => `${Number(value).toFixed(1)}x`}
                  tick={{ fill: chartAxisColor, fontSize: 11 }}
                  tickLine={false}
                />
                <Tooltip content={<RoasTooltip />} />
                <Legend
                  formatter={(value) => <span className="text-slate-200 text-xs">{value}</span>}
                />
                <Line
                  type="monotone"
                  dataKey="Organic"
                  stroke={GROUP_COLORS.organic}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={450}
                  animationEasing="ease-in-out"
                />
                <Line
                  type="monotone"
                  dataKey="Paid"
                  stroke={GROUP_COLORS.paid}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={450}
                  animationEasing="ease-in-out"
                />
                <Line
                  type="monotone"
                  dataKey="Affiliate"
                  stroke={GROUP_COLORS.affiliate}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={450}
                  animationEasing="ease-in-out"
                />
                <Line
                  type="monotone"
                  dataKey="Influencer"
                  stroke={GROUP_COLORS.influencer}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={450}
                  animationEasing="ease-in-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <Accordion
            type="single"
            collapsible
            className="mt-3 border border-slate-800 rounded-lg px-3"
          >
            {(Object.keys(groupedChannels) as ChannelGroup[]).map((group) => (
              <AccordionItem key={group} value={group} className="border-slate-800">
                <AccordionTrigger className="text-xs text-slate-300 hover:no-underline">
                  {GROUP_LABELS[group]} channels ({groupedChannels[group].length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {groupedChannels[group].map((channel) => (
                      <div
                        key={channel.id}
                        className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs"
                      >
                        <p className="text-slate-200">{channel.name}</p>
                        <p className="text-slate-400">
                          {formatCurrency(channel.metrics.spend)} •{' '}
                          {channel.metrics.roas.toFixed(2)}x ROAS
                        </p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
