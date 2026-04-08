import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  ArrowLeft,
  Moon,
  Sun,
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Share2,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useMediaPlanStore, useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { buildScenarioEnvelope, getEfficiencyAlerts } from '@/lib/planning-insights';
import { generateReportNarrative, type ReportNarrative } from '@/lib/report-narrator';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { useTheme } from '@/hooks/use-theme';
import { toast } from 'sonner';

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

const Output = () => {
  const navigate = useNavigate();
  const vc = useVerticalConfig();
  const { theme, cycleTheme } = useTheme();
  const channels = useChannelsWithMetrics();
  const { totalBudget, globalMultipliers, activeGeos, projectName } = useMediaPlanStore();
  const { format } = useCurrency();

  const $ = (n: number) => format(n);

  // ─── Derived data ────────────────────────────────────────────────────────

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

  const alerts = useMemo(() => getEfficiencyAlerts(active), [active]);

  const pieData = useMemo(
    () => active.map((c) => ({ name: c.name, value: c.metrics.spend })),
    [active]
  );

  // Preserve original color index when sorting for the legend list
  const sortedPieData = useMemo(
    () => pieData.map((d, i) => ({ ...d, colorIndex: i })).sort((a, b) => b.value - a.value),
    [pieData]
  );

  const sortedBySpend = useMemo(
    () => [...active].sort((a, b) => b.metrics.spend - a.metrics.spend),
    [active]
  );

  const roasTarget = globalMultipliers.roasTarget ?? 2;

  // ─── AI narrative ────────────────────────────────────────────────────────

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
    })
      .then((result) => {
        setNarrative(result);
        setNarrativeLoading(false);
      })
      .catch((error) => {
        console.error('Failed to generate report narrative:', error);
        setNarrative(null);
        setNarrativeLoading(false);
      });
    // Intentionally mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Print styles (injected once on mount) ───────────────────────────────

  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-output-print', '');
    style.textContent = `
      @media print {
        .print-hidden { display: none !important; }
        body { background: white !important; color: black !important; }
        @page { margin: 1.5cm; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const pageDate = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  const paybackColor =
    paybackMonths !== null && paybackMonths <= 3
      ? 'text-green-500'
      : paybackMonths !== null && paybackMonths <= 6
        ? 'text-amber-500'
        : 'text-red-500';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── OutputNav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 h-14 bg-background border-b border-border flex items-center px-6 print:hidden">
        <div className="flex items-center w-full max-w-5xl mx-auto gap-4">
          {/* Left */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="gap-2 text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Plan
          </Button>

          {/* Centre */}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <span className="font-semibold text-foreground truncate">{projectName}</span>
            <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 shrink-0">
              {vc.emoji} {vc.label}
            </span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              title="Switch theme"
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === 'dark' || theme === 'contrast' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast('Link copied to clipboard');
                } catch {
                  toast.error('Could not copy link');
                }
              }}
            >
              <Share2 className="w-4 h-4" />
              Copy Link
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-8 py-12 space-y-16 print:px-0 print:py-0">
        {/* ── CoverSection ────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:divide-x md:divide-border">
            {/* Left column */}
            <div className="md:pr-10">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Media Plan</p>
              <h1 className="text-5xl font-bold text-foreground mt-2 leading-tight break-words">
                {projectName}
              </h1>
              <div className="mt-4">
                <span className="bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium">
                  {vc.emoji} {vc.label}
                </span>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">Prepared {pageDate}</p>
              <div className="mt-8">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Monthly Investment
                </p>
                <p className="text-4xl font-bold text-foreground mt-1">{$(totalBudget)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {active.length} channels ·{' '}
                  {activeGeos.length > 0 ? activeGeos.join(', ') : 'Global reach'}
                </p>
              </div>
            </div>

            {/* Right column — stat cards */}
            <div className="flex flex-col gap-4 md:pl-10">
              {/* Revenue card */}
              <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
                <TrendingUp
                  className={`w-5 h-5 mt-0.5 shrink-0 ${isProfit ? 'text-green-500' : 'text-red-500'}`}
                />
                <div>
                  <p className="text-xs text-muted-foreground">{vc.report.revenueLabel}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{$(projectedRevenue)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {blendedRoas.toFixed(2)}x return on spend
                  </p>
                </div>
              </div>

              {/* Customer count card */}
              <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
                <Users className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">{vc.report.customerCountLabel}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {Math.round(projectedFtds).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {blendedCpa ? `at ${$(blendedCpa)} each` : 'cost not calculable'}
                  </p>
                </div>
              </div>

              {/* Payback card */}
              <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
                <Clock className={`w-5 h-5 mt-0.5 shrink-0 ${paybackColor}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{vc.report.paybackLabel}</p>
                  <p className={`text-2xl font-bold mt-1 ${paybackColor}`}>
                    {paybackMonths ? `${paybackMonths} months` : '24+ months'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    based on {$(globalMultipliers.playerValue)}{' '}
                    {vc.terms.customerValue.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── StrategySection ──────────────────────────────────────── */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
            Strategic Approach
          </h2>

          {narrativeLoading ? (
            <div className="space-y-3">
              <div className="bg-muted animate-pulse rounded h-4 w-full" />
              <div className="bg-muted animate-pulse rounded h-4 w-4/5" />
              <div className="bg-muted animate-pulse rounded h-4 w-3/5" />
            </div>
          ) : narrative ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-primary mb-4">
                <Sparkles className="w-3 h-3" />
                AI-generated analysis
              </div>
              <div className="border-l-4 border-primary pl-6 py-2">
                <p className="text-xl leading-relaxed text-foreground font-light">
                  {narrative.executiveSummary}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="bg-card border border-border rounded-2xl p-6">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                    Campaign Insight
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {narrative.operatorInsight}
                  </p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-6">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                    First Week Focus
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {narrative.firstCheckIn}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="border-l-4 border-primary pl-6 py-2">
              <p className="text-xl leading-relaxed text-foreground font-light">
                This plan deploys {$(totalBudget)} across {active.length} channels, projecting{' '}
                {$(projectedRevenue)} in {vc.terms.revenueMetric.toLowerCase()} at a{' '}
                {blendedRoas.toFixed(2)}x return on spend.
              </p>
            </div>
          )}
        </section>

        {/* ── AllocationSection ────────────────────────────────────── */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
            Budget Allocation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Donut chart */}
            <div className="relative">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    innerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active: isActive, payload }) => {
                      if (!isActive || !payload?.length) return null;
                      const d = payload[0].payload as { name: string; value: number };
                      const pct = totalSpend > 0 ? ((d.value / totalSpend) * 100).toFixed(1) : '0';
                      return (
                        <div className="bg-card border border-border rounded-lg p-2 text-sm shadow-md">
                          <p className="font-medium text-foreground">{d.name}</p>
                          <p className="text-muted-foreground">
                            {$(d.value)} · {pct}%
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre label overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{$(totalSpend)}</p>
                  <p className="text-xs text-muted-foreground">total spend</p>
                </div>
              </div>
            </div>

            {/* Allocation list */}
            <div>
              {sortedPieData.map((row) => {
                const pct = totalSpend > 0 ? ((row.value / totalSpend) * 100).toFixed(1) : '0';
                return (
                  <div
                    key={row.name}
                    className="flex justify-between items-center py-3 border-b border-border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{
                          backgroundColor: PIE_COLORS[row.colorIndex % PIE_COLORS.length],
                        }}
                      />
                      <span className="text-sm font-medium text-foreground truncate">
                        {row.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className="text-sm font-semibold text-foreground">{$(row.value)}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
              {/* Total row */}
              <div className="flex justify-between items-center py-3">
                <span className="text-sm font-bold text-foreground">Total</span>
                <span className="text-sm font-bold text-foreground">{$(totalSpend)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── ProjectionsSection ───────────────────────────────────── */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
            Financial Projections
          </h2>

          {/* P&L summary bar */}
          <div className="bg-card border border-border rounded-2xl p-8 flex flex-wrap items-start gap-y-6">
            <div className="min-w-[8rem]">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Monthly Investment
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">{$(totalSpend)}</p>
            </div>
            <div className="w-px bg-border self-stretch mx-8 hidden sm:block" />
            <div className="min-w-[8rem]">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {vc.report.revenueLabel}
              </p>
              <p
                className={`text-3xl font-bold mt-1 ${isProfit ? 'text-green-500' : 'text-red-500'}`}
              >
                {$(projectedRevenue)}
              </p>
            </div>
            <div className="w-px bg-border self-stretch mx-8 hidden sm:block" />
            <div className="min-w-[8rem]">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Net Result (Month 1)
              </p>
              <p
                className={`text-3xl font-bold mt-1 ${netPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}
              >
                {$(netPnl)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {blendedRoas.toFixed(2)}x return on spend
              </p>
            </div>
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {/* Bear */}
            <div className="border border-border bg-card rounded-2xl p-6">
              <span className="text-xs bg-red-500/10 text-red-500 rounded-full px-3 py-1">
                Bear Case
              </span>
              <p className="text-sm text-muted-foreground mt-4">
                {vc.terms.customerValue} (per customer)
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {$(scenarioEnvelope[0].projectedLtvPerUser)}
              </p>
              <p className="text-sm text-muted-foreground mt-3">Total Cohort Value</p>
              <p className="text-lg text-muted-foreground">
                {$(scenarioEnvelope[0].projectedCohortValue)}
              </p>
              <p className="text-sm text-muted-foreground mt-3">LTV:CAC</p>
              <p className="text-lg font-semibold text-foreground">
                {scenarioEnvelope[0].ltvToCac.toFixed(2)}x
              </p>
              <p className="text-xs text-muted-foreground mt-4">If conditions worsen by 15%</p>
            </div>

            {/* Base */}
            <div className="ring-2 ring-primary border border-primary/30 bg-card rounded-2xl p-6 shadow-md">
              <span className="text-xs bg-primary/10 text-primary rounded-full px-3 py-1">
                Base Case · Most Likely
              </span>
              <p className="text-sm text-muted-foreground mt-4">
                {vc.terms.customerValue} (per customer)
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {$(scenarioEnvelope[1].projectedLtvPerUser)}
              </p>
              <p className="text-sm text-muted-foreground mt-3">Total Cohort Value</p>
              <p className="text-lg text-muted-foreground">
                {$(scenarioEnvelope[1].projectedCohortValue)}
              </p>
              <p className="text-sm text-muted-foreground mt-3">LTV:CAC</p>
              <p className="text-lg font-semibold text-foreground">
                {scenarioEnvelope[1].ltvToCac.toFixed(2)}x
              </p>
              <p className="text-xs text-muted-foreground mt-4">Expected outcome</p>
            </div>

            {/* Bull */}
            <div className="border border-border bg-card rounded-2xl p-6">
              <span className="text-xs bg-green-500/10 text-green-500 rounded-full px-3 py-1">
                Bull Case
              </span>
              <p className="text-sm text-muted-foreground mt-4">
                {vc.terms.customerValue} (per customer)
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {$(scenarioEnvelope[2].projectedLtvPerUser)}
              </p>
              <p className="text-sm text-muted-foreground mt-3">Total Cohort Value</p>
              <p className="text-lg text-muted-foreground">
                {$(scenarioEnvelope[2].projectedCohortValue)}
              </p>
              <p className="text-sm text-muted-foreground mt-3">LTV:CAC</p>
              <p className="text-lg font-semibold text-foreground">
                {scenarioEnvelope[2].ltvToCac.toFixed(2)}x
              </p>
              <p className="text-xs text-muted-foreground mt-4">If conditions improve by 15%</p>
            </div>
          </div>
        </section>

        {/* ── ChannelTableSection ──────────────────────────────────── */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
            Channel Strategy
          </h2>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Channel</th>
                  <th className="text-left px-4 py-3 font-medium w-32">Type</th>
                  <th className="text-right px-4 py-3 font-medium w-36">Monthly Budget</th>
                  <th className="text-right px-4 py-3 font-medium w-28">
                    {vc.terms.conversionPlural}
                  </th>
                  <th className="text-right px-4 py-3 font-medium w-36">
                    {vc.terms.costPerConversion}
                  </th>
                  <th className="text-right px-4 py-3 font-medium w-24">Return</th>
                </tr>
              </thead>
              <tbody>
                {sortedBySpend.map((c) => {
                  const roasClass =
                    c.metrics.roas >= roasTarget
                      ? 'text-green-500'
                      : c.metrics.roas >= 1
                        ? 'text-yellow-500'
                        : 'text-red-500';
                  return (
                    <tr key={c.id} className="bg-card border-b border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.family}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-muted text-muted-foreground text-xs rounded px-2 py-0.5">
                          {c.buyingModel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {$(c.metrics.spend)}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {Math.round(c.metrics.conversions).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {c.metrics.cpa ? $(c.metrics.cpa) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${roasClass}`}>
                        {c.metrics.roas.toFixed(2)}x
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-semibold">
                  <td className="px-4 py-3 text-foreground">Total</td>
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3 text-right text-foreground">{$(totalSpend)}</td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {Math.round(projectedFtds).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {blendedCpa ? $(blendedCpa) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {blendedRoas.toFixed(2)}x
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ── RiskSection ──────────────────────────────────────────── */}
        {(alerts.length > 0 || !!narrative?.biggestRisk) && (
          <section>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
              Risks &amp; Recommendations
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Key Risk */}
              <div className="bg-card border border-amber-500/30 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <span className="font-semibold text-foreground">Key Risk</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {narrative?.biggestRisk ?? alerts[0]?.reason ?? 'No critical risks identified.'}
                </p>
              </div>

              {/* Recommendation */}
              <div className="bg-card border border-primary/30 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                  <span className="font-semibold text-foreground">What To Do Next</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {narrative?.firstCheckIn ??
                    `Review your ${vc.terms.costPerConversion.toLowerCase()} after the first week. If it exceeds your target, reallocate from your lowest-performing channel to ${topChannel?.name ?? 'your top performer'}.`}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── FooterSection ────────────────────────────────────────── */}
        <footer className="border-t border-border pt-8 mt-8">
          <div className="flex flex-col md:flex-row md:justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Generated by MediaPlanner Pro</p>
              <p className="text-sm text-muted-foreground">{pageDate}</p>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm md:text-right">
              This plan is a projection based on industry benchmarks and the inputs provided. Actual
              results may vary.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Output;
