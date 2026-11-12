import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
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
import { BrandLogo } from '@/components/common/BrandLogo';
import { RangeLine } from '@/components/plan/RangeLine';
import { CURRENCIES, formatMoney } from '@/contexts/CurrencyContext';
import { computePlanResult, type EngineRange, type EngineResult } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { getVerticalConfig } from '@/hooks/use-vertical-config';
import { BRAND_NAME } from '@/lib/brand';
import { formatLtvToCac } from '@/lib/planning-insights';
import { MONTH1_ROAS_LABEL } from '@/lib/roas-pair';
import { fetchSharedPlan, type SharedPlan as SharedPlanData } from '@/lib/share-link';
import { cn } from '@/lib/utils';

// Same neutral ramp as the plan canvas: channels are told apart by position and label.
const CHANNEL_COLORS = ['#ffffff', '#cfcfcf', '#a6a6a6', '#808080', '#5e5e5e', '#444444'];
const CHANNEL_COLORS_LIGHT = ['#1c1c1c', '#444444', '#5e5e5e', '#808080', '#a6a6a6', '#cfcfcf'];

const compact = (value: number) =>
  Math.abs(value) >= 1000 ? `${Number((value / 1000).toFixed(value >= 100000 ? 0 : 1))}k` : `${Math.round(value)}`;
const whole = (value: number) => Math.round(value).toLocaleString('en-US');

type Load =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error' }
  | { state: 'ready'; plan: SharedPlanData; result: EngineResult };

const HEAD = 'text-[10px] font-semibold uppercase leading-4 tracking-wide text-slate-400';
const CARD = 'rounded-2xl bg-slate-900 p-4 sm:p-6';

function Frame({ title, children }: { title: string; children: ReactNode }) {
  const { theme } = useTheme();
  // index.html ships "index, follow"; Helmet only adds a second tag, so the static one is switched too.
  useEffect(() => {
    const tag = document.querySelector<HTMLMetaElement>('meta[name="robots"]:not([data-react-helmet])');
    if (!tag) return;
    const previous = tag.content;
    tag.content = 'noindex';
    return () => {
      tag.content = previous;
    };
  }, []);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Helmet>
        <title>{`${title} | ${BRAND_NAME}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" aria-label={BRAND_NAME}>
            <BrandLogo size="sm" tone={theme === 'light' ? 'light' : 'dark'} />
          </Link>
          <span className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-400">Read-only</span>
        </header>
        {children}
      </div>
    </div>
  );
}

// A div with the main role: the app's global `main` padding would push the content off the page grid.
function Message({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div role="main" className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>
    </div>
  );
}

const PILL = 'inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold';
const HomeLink = ({ primary = false }: { primary?: boolean }) => (
  <Link
    to="/"
    className={cn(PILL, primary ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-900 text-slate-100 hover:bg-slate-800')}
  >
    Go to {BRAND_NAME}
  </Link>
);

function Skeleton() {
  const block = 'animate-pulse rounded-2xl bg-slate-900';
  return (
    <div role="main" className="flex-1 pt-10" aria-busy="true" aria-label="Loading shared plan" data-testid="shared-plan-loading">
      <div className={cn(block, 'h-4 w-24')} />
      <div className={cn(block, 'mt-3 h-10 w-2/3')} />
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cn(block, 'h-20')} />
        ))}
      </div>
      <div className={cn(block, 'mt-4 h-64')} />
      <div className={cn(block, 'mt-4 h-72')} />
    </div>
  );
}

/**
 * Public, read-only view of a shared plan (/p/:id). The numbers are recomputed by the engine
 * from the snapshot; nothing is read from or written to the visitor's own plan or storage.
 */
export default function SharedPlan() {
  const { id = '' } = useParams();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: 'loading' });
    fetchSharedPlan(id)
      .then((plan) => {
        if (cancelled) return;
        // A snapshot the engine cannot compute is an error state, never a blank page.
        setLoad(plan ? { state: 'ready', plan, result: computePlanResult(plan.mediaPlanState) } : { state: 'missing' });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  if (load.state === 'loading') {
    return (
      <Frame title="Shared plan">
        <Skeleton />
      </Frame>
    );
  }
  if (load.state === 'missing') {
    return (
      <Frame title="Shared plan not found">
        <Message
          title="Plan not found"
          body="This shared plan does not exist or was removed."
          action={<HomeLink primary />}
        />
      </Frame>
    );
  }
  if (load.state === 'error') {
    return (
      <Frame title="Shared plan">
        <Message
          title="This plan could not be loaded"
          body="Something went wrong while loading this shared plan. Please try again."
          action={
            <>
              <button type="button" onClick={retry} className={cn(PILL, 'bg-indigo-600 hover:bg-indigo-500')}>
                Retry
              </button>
              <HomeLink />
            </>
          }
        />
      </Frame>
    );
  }
  return (
    <Frame title={load.plan.name}>
      <PlanDocument plan={load.plan} result={load.result} />
    </Frame>
  );
}

function PlanDocument({ plan, result }: { plan: SharedPlanData; result: EngineResult }) {
  const { theme } = useTheme();
  const isDark = theme !== 'light';
  const vc = getVerticalConfig(plan.vertical);
  const money = (value: number) => formatMoney(value, plan.currency);
  const symbol = CURRENCIES[plan.currency].symbol;
  const { totals, economics, roas, customerValue, scenarios, channelInsights, ranges } = result;

  const channels = useMemo(
    () => result.channels.filter((channel) => channel.isActive !== false && channel.metrics.spend > 0),
    [result.channels]
  );
  const colors = isDark ? CHANNEL_COLORS : CHANNEL_COLORS_LIGHT;
  const colorOf = (index: number) => colors[index % colors.length];
  const shareOf = (channelId: string) => channelInsights[channelId]?.spendSharePct ?? 0;

  const prepared = new Date(plan.createdAt);
  const preparedLabel = Number.isNaN(prepared.getTime())
    ? null
    : prepared.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const net = economics.computable ? economics.netValuePerMonth : null;
  const times = (value: number) => `${value.toFixed(2)}x`;
  // `range` is the engine's likely range for the figure, shown under it; absent with point estimates.
  const tiles: Array<{
    label: string;
    value: string;
    hint?: string;
    tone?: 'good' | 'bad';
    range?: EngineRange | null;
    rangeFormat?: (value: number) => string;
  }> = [
    { label: 'Budget / month', value: money(plan.mediaPlanState.totalBudget) },
    {
      label: vc.terms.revenueMetric,
      value: money(totals.projectedRevenue),
      range: ranges?.totals.revenue,
      rangeFormat: money,
    },
    {
      label: vc.terms.costPerConversion,
      value: totals.blendedCpa === null ? 'n/a' : money(totals.blendedCpa),
      range: totals.blendedCpa === null ? null : ranges?.totals.costPerConversion,
      rangeFormat: money,
    },
    {
      label: 'Lifetime ROAS',
      value: times(roas.lifetime),
      hint: `${MONTH1_ROAS_LABEL} ${roas.month1 === null ? 'n/a' : times(roas.month1)}`,
      range: ranges?.totals.roas,
      rangeFormat: times,
    },
    {
      label: vc.terms.conversionPlural,
      value: whole(totals.totalConversions),
      range: ranges?.totals.conversions,
      rangeFormat: whole,
    },
    {
      label: 'Net / month',
      value: net === null ? 'n/a' : money(net),
      tone: net === null ? undefined : net < 0 ? 'bad' : 'good',
    },
  ];

  const projection = customerValue.curve.map((point) => ({
    month: point.label,
    value: Math.round(point.cohortValue),
  }));
  const payback = customerValue.paybackMonth;
  const roasClass = (value: number) => (value < 1 ? 'text-rose-400' : undefined);

  return (
    <div role="main" className="flex-1 pt-8 sm:pt-12" data-testid="shared-plan">
      <p className={HEAD}>Media plan</p>
      <h1 className="mt-1 break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{plan.name}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        {preparedLabel ? `Prepared ${preparedLabel} · ` : ''}
        {vc.label} · Monthly figures in {plan.currency}
      </p>

      <section aria-label="Plan summary" className="mt-6 grid grid-cols-2 gap-2 sm:mt-8 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0 rounded-2xl bg-slate-900 px-4 py-3">
            <p className={HEAD}>{tile.label}</p>
            <p
              className={cn(
                'mt-0.5 break-words text-xl font-bold leading-8 tabular-nums sm:text-2xl',
                tile.tone === 'bad' && 'text-rose-400',
                tile.tone === 'good' && 'text-emerald-400'
              )}
            >
              {tile.value}
            </p>
            {tile.rangeFormat ? (
              <RangeLine range={tile.range} format={tile.rangeFormat} className="text-[11px] text-slate-400" />
            ) : null}
            {tile.hint ? <p className="text-[11px] leading-4 text-slate-400">{tile.hint}</p> : null}
          </div>
        ))}
      </section>

      <section aria-label="Channel mix" className={cn(CARD, 'mt-4')}>
        <h2 className="text-base font-semibold leading-6">Channel mix</h2>
        <p className="text-xs leading-5 text-slate-400">Where the monthly budget goes and what each channel returns.</p>

        <div
          className="mt-4 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-slate-800"
          role="img"
          aria-label="Share of spend by channel"
        >
          {channels.map((channel, index) => (
            <div
              key={channel.id}
              title={`${channel.name}: ${shareOf(channel.id).toFixed(1)}%`}
              style={{ width: `${shareOf(channel.id)}%`, backgroundColor: colorOf(index) }}
              className="h-full"
            />
          ))}
        </div>

        {channels.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">This plan has no active channels.</p>
        ) : (
          <table className="mt-4 w-full border-collapse text-sm" data-testid="shared-plan-channels">
            <thead className="hidden sm:table-header-group">
              <tr className={HEAD}>
                <th scope="col" className="pb-2 text-left font-semibold">Channel</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">Share</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">Spend</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">{vc.terms.conversionPlural}</th>
                <th scope="col" className="pb-2 pl-3 text-right font-semibold">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel, index) => {
                const share = `${shareOf(channel.id).toFixed(1)}%`;
                const conversions = whole(channel.metrics.conversions);
                const channelRoas = `${channel.metrics.roas.toFixed(2)}x`;
                return (
                  <tr key={channel.id} className="border-t border-slate-800 align-top">
                    <th scope="row" className="py-2.5 text-left font-medium">
                      <span className="flex items-start gap-2">
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colorOf(index) }}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block break-words leading-5">{channel.name}</span>
                          {/* Phones: the secondary figures sit under the name instead of in columns. */}
                          <span className="mt-0.5 block text-xs font-normal leading-5 text-slate-400 tabular-nums sm:hidden">
                            {share} · {conversions} {vc.terms.conversionPlural} ·{' '}
                            <span className={roasClass(channel.metrics.roas)}>{channelRoas}</span>
                          </span>
                        </span>
                      </span>
                    </th>
                    <td className="hidden py-2.5 pl-3 text-right tabular-nums leading-5 sm:table-cell">{share}</td>
                    <td className="whitespace-nowrap py-2.5 pl-3 text-right font-semibold tabular-nums leading-5">
                      {money(channel.metrics.spend)}
                    </td>
                    <td className="hidden py-2.5 pl-3 text-right tabular-nums leading-5 sm:table-cell">{conversions}</td>
                    <td
                      className={cn(
                        'hidden py-2.5 pl-3 text-right font-semibold tabular-nums leading-5 sm:table-cell',
                        roasClass(channel.metrics.roas)
                      )}
                    >
                      {channelRoas}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700 align-top font-semibold">
                <th scope="row" className="py-2.5 text-left font-semibold">
                  Total
                  <span className="mt-0.5 block text-xs font-normal leading-5 text-slate-400 tabular-nums sm:hidden">
                    {whole(totals.totalConversions)} {vc.terms.conversionPlural} · {roas.lifetime.toFixed(2)}x
                  </span>
                </th>
                <td className="hidden py-2.5 pl-3 text-right tabular-nums sm:table-cell">
                  {totals.totalSpend > 0 ? '100.0%' : '0.0%'}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 text-right tabular-nums">{money(totals.totalSpend)}</td>
                <td className="hidden py-2.5 pl-3 text-right tabular-nums sm:table-cell">
                  {whole(totals.totalConversions)}
                </td>
                <td className="hidden py-2.5 pl-3 text-right tabular-nums sm:table-cell">
                  {roas.lifetime.toFixed(2)}x
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section aria-label="12-month projection" className={cn(CARD, 'mt-4')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold leading-6">12-month projection</h2>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              payback === null ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'
            )}
          >
            {payback === null ? 'No payback within 12 months' : `Pays back in month ${payback}`}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Cumulative value of the customers one month of budget acquires, against what they cost.
        </p>

        <div className="mt-3 h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="shared-plan-value" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#2a2a2a' : '#dcdcdc'} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#979797' }}
                tickLine={false}
                axisLine={false}
                minTickGap={12}
              />
              <YAxis
                width={52}
                tick={{ fontSize: 11, fill: '#979797' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${symbol}${compact(value)}`}
              />
              <Tooltip
                formatter={(value: number) => [money(value), 'Cohort value']}
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
                label={{ value: 'Spend', position: 'insideTopRight', fontSize: 11, fill: '#f87171' }}
              />
              <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#shared-plan-value)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {scenarios.map((scenario) => (
            <div
              key={scenario.scenario}
              className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-950 px-4 py-3 sm:block"
            >
              <p className={HEAD}>{scenario.scenario}</p>
              <div className="text-right sm:text-left">
                <p className="break-words text-base font-bold leading-6 tabular-nums sm:text-lg">
                  {money(scenario.projectedCohortValue)}
                </p>
                <p className="text-[11px] leading-4 text-slate-400">LTV:CAC {formatLtvToCac(scenario.ltvToCac)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-8 flex flex-col gap-2 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>Figures are estimates from a planning model, not guarantees.</p>
        <p>
          Made with{' '}
          <Link to="/" className="font-semibold text-slate-100 underline-offset-2 hover:underline">
            {BRAND_NAME}
          </Link>
        </p>
      </footer>
    </div>
  );
}
