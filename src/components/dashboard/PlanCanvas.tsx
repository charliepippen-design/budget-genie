import { useState, useSyncExternalStore, type ReactNode } from 'react';
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
import { OptimiseMixDialog } from '@/components/plan/OptimiseMixDialog';
import { RangeAssumptionsDialog } from '@/components/plan/RangeAssumptionsDialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip as Hint, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { EngineRange } from '@/engine/contract';
import { selectProjectionBand } from '@/engine/projection-band';
import { getEngine, subscribeEngine } from '@/engine/registry';
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
import { RANGE_HINT, formatRange, paybackRangeLabel } from '@/lib/plan-ranges';
import { formatLtvToCac } from '@/lib/planning-insights';
import { cn } from '@/lib/utils';
import { LossBanner } from './LossBanner';

// One neutral ramp: channels are told apart by position and label, colour is kept for results.
const CHANNEL_COLORS = ['#ffffff', '#cfcfcf', '#a6a6a6', '#808080', '#5e5e5e', '#444444'];
const BUDGET_STEPS = [-20, -10, 10, 20, 50];

const compact = (value: number) =>
  Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : `${Math.round(value)}`;

/** A table figure that shows its likely range on hover or focus; plain text when the engine gives none. */
function RangedFigure({
  range,
  format,
  className,
  children,
}: {
  range: EngineRange | null | undefined;
  format: (value: number) => string;
  className: string;
  children: string;
}) {
  if (!range) return <span className={className}>{children}</span>;
  const likely = `Likely ${formatRange(range, format)}`;
  return (
    <TooltipProvider delayDuration={100}>
      <Hint>
        <TooltipTrigger asChild>
          <span tabIndex={0} data-range={likely} className={cn(className, 'cursor-help')}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="px-2.5 py-1 text-xs tabular-nums">{likely}</TooltipContent>
      </Hint>
    </TooltipProvider>
  );
}

/**
 * The plan at a glance, editable in place: channel mix with live sliders on one side, the
 * 12-month projection on the other. Every figure comes from the engine result.
 */
export function PlanCanvas({ onOpenChannels }: { onOpenChannels: () => void }) {
  const result = usePlanResult();
  const { channels, channelInsights, totals, customerValue, scenarios, alerts, ranges } = result;
  const engine = useSyncExternalStore(subscribeEngine, getEngine, getEngine);
  const [optimiseOpen, setOptimiseOpen] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
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
    'rounded-2xl p-4 md:p-5',
    isDark ? 'bg-slate-900' : 'bg-white'
  );
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const headClass = cn('text-[10px] font-semibold uppercase tracking-wide leading-4', mutedClass);

  const stepBudget = (pct: number) => {
    const floor = Math.max(MIN_BUDGET_CAP, totals.fixedTierSpend);
    const next = Math.round((totalBudget * (1 + pct / 100)) / 500) * 500;
    updateBudget(Math.min(GLOBAL_BUDGET_CAP, Math.max(floor, next)));
  };

  // With ranges, each month also carries the likely band around the value curve.
  const band = selectProjectionBand(result);
  const projection = customerValue.curve.map((point, index) => ({
    month: point.label,
    value: Math.round(point.cohortValue),
    ...(band ? { band: [Math.round(band[index].p10), Math.round(band[index].p90)] } : {}),
  }));
  const payback = customerValue.paybackMonth;
  const paybackLabel = ranges
    ? paybackRangeLabel(ranges.paybackMonth)
    : {
        text: payback === null ? 'No payback within 12 months' : `Pays back in month ${payback}`,
        tone: payback === null ? ('bad' as const) : ('good' as const),
        caution: null,
      };
  const whole = (value: number) => Math.round(value).toLocaleString('en-US');
  const times = (value: number) => `${value.toFixed(2)}x`;
  const channelsLink = (
    <button
      type="button"
      onClick={onOpenChannels}
      className="min-h-0 text-xs font-semibold text-indigo-400 underline-offset-2 hover:underline"
    >
      Prices and funnel rates →
    </button>
  );

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
              {alerts.belowBreakEven.length > 0 ? (
                <span
                  className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-400"
                  title={`${format(alerts.wastedSpend)} goes to channels returning less than they cost`}
                >
                  {alerts.belowBreakEven.length} below 1x
                </span>
              ) : null}
              {alerts.nearSaturation.length > 0 ? (
                <span
                  className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400"
                  title="Spending above 90% of the level where returns flatten"
                >
                  {alerts.nearSaturation.length} near saturation
                </span>
              ) : null}
            </div>
            {engine.optimise ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOptimiseOpen(true)}
                  className={cn(
                    'min-h-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:border-indigo-500 hover:bg-indigo-500/10'
                      : 'border-slate-300 text-slate-700 hover:border-indigo-500 hover:bg-indigo-50'
                  )}
                >
                  Optimise mix
                </button>
                {channelsLink}
              </div>
            ) : (
              channelsLink
            )}
          </div>

          {/* Share of spend, one segment per channel */}
          <div
            className={cn(
              'mb-4 flex h-2 w-full gap-0.5 overflow-hidden rounded-full',
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

          {/* Narrow panels scroll the table sideways instead of squeezing its columns. */}
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className={cn(
                  'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_3.5rem_5rem_4rem_3.5rem_4.5rem] items-center gap-3 px-1 pb-1',
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
                        'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_3.5rem_5rem_4rem_3.5rem_4.5rem] items-center gap-x-3 px-1 py-2',
                        !active && 'opacity-50'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colorOf(index) }}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-medium leading-5" title={channel.name}>
                          {channel.name}
                        </span>
                      </div>

                      <div>
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
                      <RangedFigure
                        range={active ? ranges?.channels[channel.id]?.conversions : null}
                        format={whole}
                        className="text-right text-sm tabular-nums leading-5"
                      >
                        {whole(channel.metrics.conversions)}
                      </RangedFigure>
                      <RangedFigure
                        range={active ? ranges?.channels[channel.id]?.roas : null}
                        format={times}
                        className={cn('text-right text-sm font-semibold tabular-nums leading-5', roasClass)}
                      >
                        {active ? times(roas) : 'off'}
                      </RangedFigure>
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
            </div>
          </div>

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
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span
                title={ranges ? RANGE_HINT : undefined}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  paybackLabel.tone === 'bad' ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'
                )}
              >
                {paybackLabel.text}
              </span>
              {paybackLabel.caution ? (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                  {paybackLabel.caution}
                </span>
              ) : null}
            </div>
          </div>
          <p className={cn('mb-2 text-xs leading-5', mutedClass)}>
            Cumulative value of the customers this month's budget acquires, against what they cost.
            {ranges ? (
              <>
                {' '}
                The shaded band is the likely range.{' '}
                <button
                  type="button"
                  onClick={() => setAssumptionsOpen(true)}
                  className="min-h-0 font-semibold text-indigo-400 underline-offset-2 hover:underline"
                >
                  How these ranges are estimated
                </button>
              </>
            ) : null}
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
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2a2a2a' : '#dcdcdc'} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#979797' }} tickLine={false} axisLine={false} />
                <YAxis
                  width={44}
                  tick={{ fontSize: 11, fill: '#979797' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => `${symbol}${compact(value)}`}
                />
                <Tooltip
                  formatter={(value: number | number[]) =>
                    Array.isArray(value)
                      ? [`${format(value[0])} – ${format(value[1])}`, 'Likely range']
                      : [format(value), 'Cohort value']
                  }
                  contentStyle={{
                    backgroundColor: isDark ? '#1c1c1c' : '#ffffff',
                    border: `1px solid ${isDark ? '#333333' : '#bdbdbd'}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={totals.totalSpend}
                  stroke="#f87171"
                  strokeDasharray="5 4"
                  // With the band, the value line ends near the spend line: the label moves clear of it.
                  label={{
                    value: 'Spend',
                    position: band ? 'insideTopLeft' : 'insideTopRight',
                    fontSize: 11,
                    fill: '#f87171',
                  }}
                />
                {band ? <Area type="monotone" dataKey="band" stroke="none" fill="#34d399" fillOpacity={0.14} /> : null}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill={band ? 'none' : 'url(#plan-canvas-value)'}
                />
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

      {engine.optimise ? <OptimiseMixDialog open={optimiseOpen} onOpenChange={setOptimiseOpen} /> : null}
      {ranges ? (
        <RangeAssumptionsDialog
          open={assumptionsOpen}
          onOpenChange={setAssumptionsOpen}
          assumptions={ranges.assumptions}
        />
      ) : null}
    </div>
  );
}
