import { Lock, LockOpen, SlidersHorizontal, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useBudgetEngine } from '@/hooks/use-budget-engine';
import {
  GLOBAL_BUDGET_CAP,
  MIN_BUDGET_CAP,
  useMediaPlanStore,
  usePlanResult,
} from '@/hooks/use-media-plan-store';
import { useTheme } from '@/hooks/use-theme';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { isFixedCostChannel } from '@/lib/media-plan/plan-snapshot';
import { formatLtvToCac } from '@/lib/planning-insights';
import { cn } from '@/lib/utils';
import { LossBanner } from './LossBanner';

const CHANNEL_COLORS = [
  '#6366f1',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
  '#38bdf8',
  '#4ade80',
  '#f87171',
  '#e879f9',
  '#facc15',
];
const BUDGET_STEPS = [-20, -10, 10, 20, 50];

const compact = (value: number) =>
  Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : `${Math.round(value)}`;

/**
 * The plan at a glance, editable in place: channel mix with live sliders on one side, the
 * 12-month projection on the other. Every figure comes from the engine result.
 */
export function PlanCanvas({ onOpenChannels }: { onOpenChannels: () => void }) {
  const { channels, channelInsights, totals, customerValue, scenarios } = usePlanResult();
  const totalBudget = useMediaPlanStore((s) => s.totalBudget);
  const roasTarget = useMediaPlanStore((s) => s.globalMultipliers.roasTarget);
  const setChannelAllocation = useMediaPlanStore((s) => s.setChannelAllocation);
  const toggleChannelActive = useMediaPlanStore((s) => s.toggleChannelActive);
  const toggleChannelLock = useMediaPlanStore((s) => s.toggleChannelLock);
  const { updateBudget } = useBudgetEngine();
  const { format, symbol } = useCurrency();
  const vc = useVerticalConfig();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';

  const colorOf = (index: number) => CHANNEL_COLORS[index % CHANNEL_COLORS.length];
  const cardClass = cn(
    'rounded-2xl border p-4 md:p-5',
    isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-white'
  );
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const headClass = cn('text-[10px] font-semibold uppercase tracking-wide leading-4', mutedClass);

  const stepBudget = (pct: number) => {
    const floor = Math.max(MIN_BUDGET_CAP, totals.fixedTierSpend);
    const next = Math.round((totalBudget * (1 + pct / 100)) / 500) * 500;
    updateBudget(Math.min(GLOBAL_BUDGET_CAP, Math.max(floor, next)));
  };

  const projection = customerValue.curve.map((point) => ({
    month: point.label,
    value: Math.round(point.cohortValue),
  }));
  const payback = customerValue.paybackMonth;

  return (
    <div className="space-y-4">
      <LossBanner />

      <div className="grid grid-cols-1 gap-4 min-[1300px]:grid-cols-[repeat(auto-fit,minmax(620px,1fr))]">
        {/* CHANNEL MIX */}
        <section className={cardClass} aria-label="Channel mix">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-indigo-400" aria-hidden />
              <h2 className="text-base font-semibold leading-6">Channel mix</h2>
              <span className={cn('text-xs', mutedClass)}>drag to rebalance; the rest adjusts</span>
            </div>
            <button
              type="button"
              onClick={onOpenChannels}
              className="min-h-0 text-xs font-semibold text-indigo-400 underline-offset-2 hover:underline"
            >
              Prices and funnel rates →
            </button>
          </div>

          {/* Share of spend, one segment per channel */}
          <div
            className={cn(
              'mb-4 flex h-3 w-full overflow-hidden rounded-full',
              isDark ? 'bg-slate-800' : 'bg-slate-200'
            )}
            role="img"
            aria-label="Share of spend by channel"
          >
            {channels.map((channel, index) => {
              const share = channelInsights[channel.id]?.spendSharePct ?? 0;
              return share > 0 ? (
                <div
                  key={channel.id}
                  title={`${channel.name}: ${share.toFixed(1)}%`}
                  style={{ width: `${share}%`, backgroundColor: colorOf(index) }}
                  className="h-full transition-[width] duration-200"
                />
              ) : null;
            })}
          </div>

          <div
            className={cn(
              'hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_3.5rem_5rem_4rem_3.5rem_4.5rem] items-center gap-3 px-1 pb-1 md:grid',
              headClass
            )}
          >
            <span>Channel</span>
            <span>Rebalance</span>
            <span className="text-right">Share</span>
            <span className="text-right">Spend</span>
            <span className="text-right">{vc.terms.conversionPlural}</span>
            <span className="text-right">ROAS</span>
            <span className="text-right">On / lock</span>
          </div>

          <ul className={cn('divide-y', isDark ? 'divide-slate-800' : 'divide-slate-200')}>
            {channels.map((channel, index) => {
              const insight = channelInsights[channel.id];
              const fixed = isFixedCostChannel(channel);
              const active = channel.isActive !== false;
              const roas = channel.metrics.roas;
              const roasClass = !active
                ? mutedClass
                : roas < 1
                  ? 'text-rose-400'
                  : roasTarget && roas >= roasTarget
                    ? 'text-emerald-400'
                    : isDark
                      ? 'text-slate-200'
                      : 'text-slate-800';
              return (
                <li
                  key={channel.id}
                  className={cn(
                    'grid grid-cols-2 items-center gap-x-3 gap-y-1 px-1 py-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_3.5rem_5rem_4rem_3.5rem_4.5rem]',
                    !active && 'opacity-50'
                  )}
                >
                  <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorOf(index) }}
                      aria-hidden
                    />
                    <span className="truncate text-sm font-medium leading-5" title={channel.name}>
                      {channel.name}
                    </span>
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    {fixed ? (
                      <span className={cn('whitespace-nowrap text-xs', mutedClass)}>
                        Fixed {format(channel.typeConfig.price)}/mo
                      </span>
                    ) : (
                      <Slider
                        value={[channel.allocationPct]}
                        min={0}
                        max={100}
                        step={0.5}
                        disabled={!active || channel.locked}
                        onValueChange={([value]) => setChannelAllocation(channel.id, value)}
                        aria-label={`${channel.name} share of variable budget`}
                      />
                    )}
                  </div>

                  <span className="text-right text-sm tabular-nums leading-5">
                    {(insight?.spendSharePct ?? 0).toFixed(1)}%
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums leading-5">
                    {format(channel.metrics.spend)}
                  </span>
                  <span className="text-right text-sm tabular-nums leading-5">
                    {Math.round(channel.metrics.conversions).toLocaleString('en-US')}
                  </span>
                  <span className={cn('text-right text-sm font-semibold tabular-nums leading-5', roasClass)}>
                    {active ? `${roas.toFixed(2)}x` : 'off'}
                  </span>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleChannelLock(channel.id)}
                      disabled={fixed}
                      aria-label={`${channel.locked ? 'Unlock' : 'Lock'} ${channel.name}`}
                      title={channel.locked ? 'Locked: other sliders will not change it' : 'Lock this share'}
                      className={cn(
                        'min-h-0 rounded p-1 disabled:opacity-30',
                        channel.locked ? 'text-amber-400' : mutedClass
                      )}
                    >
                      {channel.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                    </button>
                    <Switch
                      checked={active}
                      onCheckedChange={() => toggleChannelActive(channel.id)}
                      aria-label={`${active ? 'Turn off' : 'Turn on'} ${channel.name}`}
                      className="min-h-0"
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {totals.unallocated > 1 ? (
            <p className="mt-3 text-xs leading-5 text-amber-400">
              {format(totals.unallocated)} of the budget is not allocated.
            </p>
          ) : null}
        </section>

        {/* PROJECTION */}
        <section className={cardClass} aria-label="12-month projection">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" aria-hidden />
              <h2 className="text-base font-semibold leading-6">12-month projection</h2>
            </div>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                payback === null ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'
              )}
            >
              {payback === null ? 'No payback within 12 months' : `Pays back in month ${payback}`}
            </span>
          </div>
          <p className={cn('mb-2 text-xs leading-5', mutedClass)}>
            Cumulative value of the customers this month's budget acquires, against what they cost.
          </p>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projection} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="plan-canvas-value" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis
                  width={44}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => `${symbol}${compact(value)}`}
                />
                <Tooltip
                  formatter={(value: number) => [format(value), 'Cohort value']}
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={totals.totalSpend}
                  stroke="#f87171"
                  strokeDasharray="5 4"
                  label={{ value: 'Spend', position: 'insideTopRight', fontSize: 11, fill: '#f87171' }}
                />
                <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#plan-canvas-value)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {scenarios.map((scenario) => (
              <div
                key={scenario.scenario}
                className={cn(
                  'rounded-xl border px-3 py-2',
                  isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                )}
              >
                <p className={headClass}>{scenario.scenario}</p>
                <p className="truncate text-base font-bold tabular-nums leading-6">
                  {format(scenario.projectedCohortValue)}
                </p>
                <p className={cn('text-[11px] leading-4', mutedClass)}>
                  LTV:CAC {formatLtvToCac(scenario.ltvToCac)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className={cn('mb-1.5', headClass)}>Try another budget</p>
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_STEPS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => stepBudget(pct)}
                  className={cn(
                    'min-h-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:border-indigo-500 hover:bg-indigo-500/10'
                      : 'border-slate-300 text-slate-700 hover:border-indigo-500 hover:bg-indigo-50'
                  )}
                >
                  {pct > 0 ? `+${pct}%` : `${pct}%`}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
