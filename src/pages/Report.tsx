import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  Download,
  Sparkles,
  Clock,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useMediaPlanStore, useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import {
  buildScenarioEnvelope,
  getEfficiencyAlerts,
  buildRoasTrendData,
  buildGroupSpendTotals,
  GROUP_COLORS,
} from '@/lib/planning-insights';
import { generateReportNarrative, ReportNarrative } from '@/lib/report-narrator';
import { useVerticalConfig } from '@/hooks/use-vertical-config';

const PIE_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#84cc16',
];

const Report = () => {
  const navigate = useNavigate();
  const vc = useVerticalConfig();
  const channels = useChannelsWithMetrics();
  const { totalBudget, globalMultipliers, activeGeos } = useMediaPlanStore();
  const { format } = useCurrency();

  const active = useMemo(
    () => channels.filter((c) => c.isActive && c.metrics.spend > 0),
    [channels]
  );

  const totalSpend = useMemo(() => active.reduce((s, c) => s + c.metrics.spend, 0), [active]);

  const projectedRevenue = useMemo(
    () => active.reduce((s, c) => s + c.metrics.revenue, 0),
    [active]
  );

  const projectedFtds = useMemo(
    () => active.reduce((s, c) => s + c.metrics.conversions, 0),
    [active]
  );

  const blendedCpa = useMemo(
    () => (projectedFtds > 0 ? totalSpend / projectedFtds : null),
    [totalSpend, projectedFtds]
  );

  const blendedRoas = useMemo(
    () => (totalSpend > 0 ? projectedRevenue / totalSpend : 0),
    [projectedRevenue, totalSpend]
  );

  const netPnl = projectedRevenue - totalSpend;
  const isProfit = netPnl >= 0;

  const paybackMonths = useMemo(() => {
    const monthlyLtvInflow = projectedFtds * globalMultipliers.playerValue;
    if (monthlyLtvInflow <= 0) return null;
    const months = Math.ceil((totalSpend / monthlyLtvInflow) * 12);
    return months > 24 ? null : months;
  }, [projectedFtds, globalMultipliers.playerValue, totalSpend]);

  const topChannel = useMemo(
    () => [...active].sort((a, b) => b.metrics.roas - a.metrics.roas)[0],
    [active]
  );

  const weakestChannel = useMemo(() => active.find((c) => c.metrics.roas < 1) ?? null, [active]);

  const scenarioEnvelope = useMemo(
    () =>
      buildScenarioEnvelope({
        baseLtvPerUser: globalMultipliers.playerValue,
        conversions: projectedFtds,
        cpa: blendedCpa ?? 0,
        assumptions: { churnRate: 0.042, cpaMultiplier: 1, roasMultiplier: 1 },
      }),
    [globalMultipliers.playerValue, projectedFtds, blendedCpa]
  );

  const roasTrend = useMemo(
    () => buildRoasTrendData(active, { churnRate: 0.042, cpaMultiplier: 1, roasMultiplier: 1 }, 6),
    [active]
  );

  const groupSpend = useMemo(() => buildGroupSpendTotals(active), [active]);

  const alerts = useMemo(() => getEfficiencyAlerts(active), [active]);

  const pieData = useMemo(
    () => active.map((c) => ({ name: c.name, value: c.metrics.spend })),
    [active]
  );

  const [narrative, setNarrative] = useState<ReportNarrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(true);

  useEffect(() => {
    generateReportNarrative({
      totalBudget,
      totalSpend,
      projectedRevenue,
      projectedFtds,
      blendedCpa,
      blendedRoas,
      paybackMonths,
      topChannel: topChannel?.name ?? 'Unknown',
      weakestChannel: weakestChannel?.name ?? null,
      scenarioBase: scenarioEnvelope[1],
      alertCount: alerts.length,
      vertical: vc.vertical,
      geos: activeGeos,
    }).then((result) => {
      setNarrative(result);
      setNarrativeLoading(false);
    });
    // Intentionally mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const $ = (n: number) => format(n);

  const pageDate = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  const marketLabel = activeGeos.length > 0 ? activeGeos.join(', ') : 'Global';
  const verticalLabel = vc.label;

  const paybackColor =
    paybackMonths !== null && paybackMonths <= 3
      ? 'text-green-400'
      : paybackMonths !== null && paybackMonths <= 6
        ? 'text-amber-400'
        : 'text-red-400';

  const revenueVsSpendWidth =
    totalSpend > 0 ? Math.min(100, (projectedRevenue / totalSpend) * 50) : 0;

  const sortedActiveBySpend = useMemo(
    () => [...active].sort((a, b) => b.metrics.spend - a.metrics.spend),
    [active]
  );

  const sortedPieLegend = useMemo(() => [...pieData].sort((a, b) => b.value - a.value), [pieData]);

  const roasTarget = globalMultipliers.roasTarget ?? 2;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="w-full border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Plan
          </Button>
          <div className="text-center">
            <p className="text-base font-semibold text-white">Performance Report</p>
            <p className="text-xs text-slate-400">{pageDate}</p>
          </div>
          <Button variant="ghost" disabled title="Coming soon" className="gap-2 text-slate-500">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl space-y-12 px-6 py-8">
        <section className="space-y-5">
          <div>
            <h1 className="text-3xl font-bold">{vc.report.heroTitle}</h1>
            <p className="mt-2 text-slate-400">
              {verticalLabel} · {marketLabel}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center gap-2 text-indigo-400">
                <DollarSign className="h-5 w-5" />
                <p className="text-sm">Monthly Investment</p>
              </div>
              <p className="text-4xl font-bold">{$(totalBudget)}</p>
              <p className="mt-2 text-xs text-slate-400">
                fully deployed across {active.length} channels
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div
                className={`mb-3 flex items-center gap-2 ${isProfit ? 'text-green-400' : 'text-red-400'}`}
              >
                <TrendingUp className="h-5 w-5" />
                <p className="text-sm">{vc.report.revenueLabel}</p>
              </div>
              <p className="text-4xl font-bold text-green-400">{$(projectedRevenue)}</p>
              <p className="mt-2 text-xs text-slate-400">
                {blendedRoas.toFixed(2)}x return on spend
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center gap-2 text-indigo-400">
                <Users className="h-5 w-5" />
                <p className="text-sm">{vc.report.customerCountLabel}</p>
              </div>
              <p className="text-4xl font-bold">{Math.round(projectedFtds).toLocaleString()}</p>
              <p className="mt-2 text-xs text-slate-400">
                {blendedCpa
                  ? `at ${$(blendedCpa)} per ${vc.terms.conversion.toLowerCase()}`
                  : `${vc.terms.costPerConversion.toLowerCase()} not calculable`}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex items-center gap-2 text-amber-400">
                <Clock className="h-5 w-5" />
                <p className="text-sm">{vc.report.paybackLabel}</p>
              </div>
              <p className={`text-4xl font-bold ${paybackColor}`}>
                {paybackMonths ? `${paybackMonths} months` : '24+ months'}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                based on {$(globalMultipliers.playerValue)} {vc.terms.customerValue.toLowerCase()}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-sm text-indigo-300">
            <Sparkles className="h-4 w-4" />
            AI Analysis
          </div>
          <p className="text-sm text-slate-400">{vc.report.cohortValueLabel}</p>
          {narrativeLoading ? (
            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="h-5 w-4/5 animate-pulse rounded bg-slate-800" />
              <div className="h-5 w-full animate-pulse rounded bg-slate-800" />
              <div className="h-5 w-3/4 animate-pulse rounded bg-slate-800" />
            </div>
          ) : narrative ? (
            <>
              <div className="rounded-2xl border border-indigo-500/30 bg-slate-900 p-6">
                <p className="text-xs uppercase tracking-widest text-indigo-400">
                  EXECUTIVE SUMMARY
                </p>
                <p className="mt-3 text-lg leading-relaxed text-slate-100">
                  {narrative.executiveSummary}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">
                    CAMPAIGN INSIGHT
                  </p>
                  <p className="mt-2 text-sm text-slate-200">{narrative.operatorInsight}</p>
                </div>
                <div className="rounded-xl border border-slate-800 border-l-4 border-l-amber-400 bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-widest text-amber-400">BIGGEST RISK</p>
                  <p className="mt-2 text-sm text-slate-200">{narrative.biggestRisk}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">WEEK 1 FOCUS</p>
                  <p className="mt-2 text-sm text-slate-200">{narrative.firstCheckIn}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-200">
              Plan is projecting {blendedRoas.toFixed(2)}x return on {$(totalSpend)} deployed.{' '}
              {topChannel ? `${topChannel.name} is your strongest channel.` : ''}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Profit & Loss Projection</h2>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start">
              <div>
                <p className="text-sm text-slate-400">{vc.report.revenueLabel}</p>
                <p className="mt-2 text-3xl font-bold text-green-400">{$(projectedRevenue)}</p>
                <p className="mt-5 text-sm text-slate-400">{vc.report.cohortValueLabel}</p>
                <p className="mt-2 text-xl font-semibold">
                  {$(scenarioEnvelope[1].projectedCohortValue)}
                </p>
                <p className="text-xs text-slate-500">total cohort value (Base)</p>
              </div>

              <div className="hidden h-full w-px bg-slate-800 md:block" />

              <div>
                <p className="text-sm text-slate-400">Total Investment</p>
                <p className="mt-2 text-3xl font-bold text-slate-200">{$(totalSpend)}</p>
                <p className="mt-5 text-sm text-slate-400">{vc.terms.costPerConversion}</p>
                <p className="mt-2 text-xl font-semibold">{blendedCpa ? $(blendedCpa) : 'N/A'}</p>
              </div>

              <div className="hidden h-full w-px bg-slate-800 md:block" />

              <div>
                <p className="text-sm text-slate-400">Net P&L (Month 1)</p>
                <p
                  className={`mt-2 text-3xl font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}
                >
                  {$(netPnl)}
                </p>
                <p className="mt-5 text-sm text-slate-400">LTV : CAC Ratio</p>
                <p
                  className={`mt-2 text-xl font-semibold ${
                    scenarioEnvelope[1].ltvToCac > 2
                      ? 'text-green-400'
                      : scenarioEnvelope[1].ltvToCac >= 1
                        ? 'text-amber-400'
                        : 'text-red-400'
                  }`}
                >
                  {scenarioEnvelope[1].ltvToCac.toFixed(2)}x
                </p>
                <p className="text-xs text-slate-500">lifetime value vs acquisition cost</p>
              </div>
            </div>

            <div className="mt-8">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${revenueVsSpendWidth}%`, backgroundColor: vc.accent.hex }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>Investment</span>
                <span>Revenue</span>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">What Could Happen</h2>
            <p className="mt-1 text-slate-400">
              Three scenarios based on market conditions. Base is most likely.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
              <Badge className="bg-red-500/20 text-red-300">BEAR CASE</Badge>
              <p className="mt-4 text-sm text-slate-300">
                {vc.terms.customerValue} per {vc.terms.conversion}
              </p>
              <p className="text-2xl font-bold">{$(scenarioEnvelope[0].projectedLtvPerUser)}</p>
              <p className="mt-3 text-sm text-slate-300">{vc.report.cohortValueLabel}</p>
              <p className="text-lg font-semibold">{$(scenarioEnvelope[0].projectedCohortValue)}</p>
              <p className="mt-3 text-sm text-slate-300">LTV:CAC</p>
              <p className="text-lg font-semibold">{scenarioEnvelope[0].ltvToCac.toFixed(2)}x</p>
              <p className="mt-4 text-xs text-slate-400">If market conditions worsen by 15%</p>
            </div>

            <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/20 p-5 ring-1 ring-indigo-500/40">
              <div className="flex items-center gap-2">
                <Badge className="bg-indigo-500/20 text-indigo-300">BASE CASE</Badge>
                <span className="text-xs text-indigo-300">Most Likely</span>
              </div>
              <p className="mt-4 text-sm text-slate-300">
                {vc.terms.customerValue} per {vc.terms.conversion}
              </p>
              <p className="text-2xl font-bold">{$(scenarioEnvelope[1].projectedLtvPerUser)}</p>
              <p className="mt-3 text-sm text-slate-300">{vc.report.cohortValueLabel}</p>
              <p className="text-lg font-semibold">{$(scenarioEnvelope[1].projectedCohortValue)}</p>
              <p className="mt-3 text-sm text-slate-300">LTV:CAC</p>
              <p className="text-lg font-semibold">{scenarioEnvelope[1].ltvToCac.toFixed(2)}x</p>
              <p className="mt-4 text-xs text-slate-400">
                Expected outcome based on your benchmarks
              </p>
            </div>

            <div className="rounded-2xl border border-green-500/30 bg-green-950/20 p-5">
              <Badge className="bg-green-500/20 text-green-300">BULL CASE</Badge>
              <p className="mt-4 text-sm text-slate-300">
                {vc.terms.customerValue} per {vc.terms.conversion}
              </p>
              <p className="text-2xl font-bold">{$(scenarioEnvelope[2].projectedLtvPerUser)}</p>
              <p className="mt-3 text-sm text-slate-300">{vc.report.cohortValueLabel}</p>
              <p className="text-lg font-semibold">{$(scenarioEnvelope[2].projectedCohortValue)}</p>
              <p className="mt-3 text-sm text-slate-300">LTV:CAC</p>
              <p className="text-lg font-semibold">{scenarioEnvelope[2].ltvToCac.toFixed(2)}x</p>
              <p className="mt-4 text-xs text-slate-400">If conditions improve by 15%</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">Channel by Channel</h2>
            <p className="mt-1 text-slate-400">How each channel contributes to your plan.</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="grid grid-cols-6 gap-3 bg-slate-800/50 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
              <div>Channel</div>
              <div>Spend</div>
              <div>% of Budget</div>
              <div>Est. {vc.terms.conversionPlural}</div>
              <div>{vc.terms.costPerConversion}</div>
              <div>Return</div>
            </div>

            {sortedActiveBySpend.map((c) => {
              const pct = totalSpend > 0 ? (c.metrics.spend / totalSpend) * 100 : 0;
              const returnClass =
                c.metrics.roas >= roasTarget
                  ? 'text-green-400'
                  : c.metrics.roas >= 1
                    ? 'text-amber-400'
                    : 'text-red-400';

              return (
                <div
                  key={c.id}
                  className="grid grid-cols-6 gap-3 border-b border-slate-800 px-4 py-3 hover:bg-slate-800/50"
                >
                  <div>
                    <p className="font-medium text-white">{c.name}</p>
                    <span className="text-xs text-slate-500">{c.family}</span>
                  </div>
                  <div>{$(c.metrics.spend)}</div>
                  <div>{pct.toFixed(1)}%</div>
                  <div>{Math.round(c.metrics.conversions).toLocaleString()}</div>
                  <div>{c.metrics.cpa ? $(c.metrics.cpa) : 'N/A'}</div>
                  <div className={returnClass}>{c.metrics.roas.toFixed(2)}x</div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex h-5 overflow-hidden rounded-full border border-slate-700 bg-slate-800">
              {sortedActiveBySpend.map((c, i) => {
                const width = totalSpend > 0 ? (c.metrics.spend / totalSpend) * 100 : 0;
                return (
                  <div
                    key={c.id}
                    title={`${c.name}: ${$(c.metrics.spend)}`}
                    className="h-full"
                    style={{
                      width: `${width}%`,
                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Where Your Budget Goes</h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    innerRadius={60}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={`${entry.name}-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [$(value), 'Spend']}
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 10,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="space-y-3">
                {sortedPieLegend.map((row, i) => {
                  const pct = totalSpend > 0 ? (row.value / totalSpend) * 100 : 0;
                  return (
                    <div key={row.name} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-sm text-slate-200">{row.name}</span>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-slate-100">{$(row.value)}</p>
                        <p className="text-xs text-slate-400">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-slate-800 pt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Group totals</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p className="text-slate-300">
                    Paid: <span className="text-slate-100">{$(groupSpend.paid)}</span>
                  </p>
                  <p className="text-slate-300">
                    Organic: <span className="text-slate-100">{$(groupSpend.organic)}</span>
                  </p>
                  <p className="text-slate-300">
                    Affiliate: <span className="text-slate-100">{$(groupSpend.affiliate)}</span>
                  </p>
                  <p className="text-slate-300">
                    Influencer: <span className="text-slate-100">{$(groupSpend.influencer)}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">Projected Performance Over 6 Months</h2>
            <p className="mt-1 text-slate-400">
              How each channel group's return is expected to evolve, accounting for audience
              saturation and retention.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={roasTrend}>
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(2)}x`}
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 10,
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="Paid"
                  stroke={GROUP_COLORS.paid}
                  fill={GROUP_COLORS.paid}
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="Organic"
                  stroke={GROUP_COLORS.organic}
                  fill={GROUP_COLORS.organic}
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="Affiliate"
                  stroke={GROUP_COLORS.affiliate}
                  fill={GROUP_COLORS.affiliate}
                  fillOpacity={0.15}
                />
                <Area
                  type="monotone"
                  dataKey="Influencer"
                  stroke={GROUP_COLORS.influencer}
                  fill={GROUP_COLORS.influencer}
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {alerts.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h2 className="text-2xl font-bold">Efficiency Alerts</h2>
              <Badge className="bg-amber-500/20 text-amber-300">{alerts.length}</Badge>
            </div>

            <div className="space-y-3">
              {alerts.map((alert, idx) => (
                <div
                  key={`${alert.channelId}-${idx}`}
                  className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        alert.severity === 'high'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }
                    >
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <p className="font-semibold">{alert.channelName}</p>
                  </div>
                  <p className="mt-2 text-slate-300">{alert.reason}</p>
                  {alert.severity === 'high' ? (
                    <p className="mt-2 text-xs text-red-400">Immediate attention recommended</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Before You Launch</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-amber-500/30 bg-slate-900 p-5">
              <div className="flex items-center gap-2 text-amber-400">
                <Shield className="h-5 w-5" />
                <p className="font-semibold">Key Risk</p>
              </div>
              <p className="mt-3 text-slate-200">
                {narrative?.biggestRisk
                  ? narrative.biggestRisk
                  : weakestChannel
                    ? `${weakestChannel.name} is operating below 1x return. Consider reducing its allocation before launch.`
                    : alerts.length > 0
                      ? `${alerts[0].channelName} is approaching its efficiency ceiling.`
                      : 'No critical risks identified in this plan.'}
              </p>
            </div>

            <div className="rounded-2xl border border-indigo-500/30 bg-slate-900 p-5">
              <div className="flex items-center gap-2 text-indigo-400">
                <CheckCircle className="h-5 w-5" />
                <p className="font-semibold">What To Do After Week 1</p>
              </div>
              <p className="mt-3 text-slate-200">
                {narrative?.firstCheckIn
                  ? narrative.firstCheckIn
                  : `Review your ${vc.terms.costPerConversion.toLowerCase()} vs your target. If it's running above ${
                      globalMultipliers.cpaTarget
                        ? format(globalMultipliers.cpaTarget)
                        : 'your target'
                    }, pause the lowest-performing channel and reallocate to your top performer.`}
              </p>
            </div>
          </div>

          <Button
            onClick={() => navigate('/')}
            className="w-full bg-indigo-600 hover:bg-indigo-500"
          >
            Return to Plan →
          </Button>
        </section>
      </div>
    </div>
  );
};

export default Report;
