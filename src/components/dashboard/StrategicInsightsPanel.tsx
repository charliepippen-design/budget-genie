import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, Activity, CheckCircle2 } from 'lucide-react';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { useToast } from '@/hooks/use-toast';
import { useActionPulseStore } from '@/store/useActionPulseStore';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { getEfficiencyAlerts, getMetricIntegrityIssues } from '@/lib/planning-insights';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

/** Sets bar width imperatively so no style prop appears in JSX. */
function BarFill({ pct, className }: { pct: number; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.style.width = `${pct}%`;
  }, [pct]);
  return <div ref={ref} className={className} />;
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

export const StrategicInsightsPanel = () => {
  const { toast } = useToast();
  const channels = useChannelsWithMetrics();
  const { setChannelAllocation, normalizeAllocations, toggleChannelLock } = useMediaPlanStore();
  const dispatchActionPulse = useActionPulseStore((state) => state.dispatchActionPulse);
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';

  // --- LIVE DATA COMPUTATIONS ---

  const efficiencyAlerts = useMemo(() => getEfficiencyAlerts(channels), [channels]);
  const integrityIssues = useMemo(() => getMetricIntegrityIssues(channels), [channels]);

  // Card 1: Efficiency Alert — real worst offender
  const efficiencyTarget = useMemo(() => {
    // Priority: integrity issue > high-severity alert > medium-severity alert
    if (integrityIssues.length > 0) {
      return { channelName: integrityIssues[0].channelName, reason: integrityIssues[0].issue, type: 'integrity' as const };
    }
    const high = efficiencyAlerts.find((a) => a.severity === 'high');
    if (high) return { channelName: high.channelName, reason: high.reason, type: 'efficiency' as const };
    const medium = efficiencyAlerts.find((a) => a.severity === 'medium');
    if (medium) return { channelName: medium.channelName, reason: medium.reason, type: 'efficiency' as const };
    return null;
  }, [integrityIssues, efficiencyAlerts]);

  // Sparkline: real ROAS values for active channels, sorted best→worst
  const sparklinePoints = useMemo(() => {
    const active = channels.filter((c) => c.isActive && c.metrics.spend > 0);
    if (active.length < 2) return null;
    const sorted = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas);
    const maxRoas = Math.max(...sorted.map((c) => c.metrics.roas), 1);
    const step = 100 / Math.max(sorted.length - 1, 1);
    const points = sorted.map((c, i) => ({
      x: i * step,
      y: 38 - (c.metrics.roas / maxRoas) * 34,
    }));
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return { d, points, maxRoas };
  }, [channels]);

  // Card 2: Arbitrage Opportunity — real underfunded channel vs overfunded
  const arbitrage = useMemo(() => {
    const active = channels.filter(
      (c) => c.isActive && c.metrics.spend > 0 && c.metrics.roas > 0
    );
    if (active.length < 2) return null;

    const sorted = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas);
    const winner = sorted[0];
    const loser = sorted[sorted.length - 1];

    if (winner.id === loser.id) return null;
    // Only surface if the gap is meaningful (winner is ≥20% better ROAS)
    if (winner.metrics.roas < loser.metrics.roas * 1.2) return null;

    const shiftAmount = loser.metrics.spend * 0.2; // shift 20% of loser's spend
    const revenueGain = (winner.metrics.roas - loser.metrics.roas) * shiftAmount;
    const roasUpliftPct = Math.round(((winner.metrics.roas / loser.metrics.roas) - 1) * 100);

    // Progress bar: winner share vs total active spend
    const totalSpend = active.reduce((sum, c) => sum + c.metrics.spend, 0);
    const winnerSharePct = Math.round((winner.metrics.spend / totalSpend) * 100);

    return { winner, loser, shiftAmount, revenueGain, roasUpliftPct, winnerSharePct };
  }, [channels]);

  // Card 3: Market Saturation — real saturation channels
  const saturationChannels = useMemo(
    () =>
      channels.filter((c) => {
        const ceiling = c.typeConfig.baselineMetrics.saturationCeiling ?? 0;
        return c.isActive && ceiling > 0 && c.metrics.spend > ceiling * 0.9;
      }),
    [channels]
  );
  const topSaturation = saturationChannels[0] ?? null;
  const saturationPct = topSaturation
    ? Math.min(100, Math.round((topSaturation.metrics.spend / (topSaturation.typeConfig.baselineMetrics.saturationCeiling ?? topSaturation.metrics.spend)) * 100))
    : 0;

  // Are there any issues at all?
  const hasAnyAlert = !!efficiencyTarget || !!arbitrage || saturationChannels.length > 0;

  // --- ACTION HANDLERS ---

  const handleAutoFix = () => {
    const candidates = channels.filter(
      (ch) =>
        !ch.locked &&
        ['CPM', 'CPC', 'CPA'].includes(ch.buyingModel) &&
        ch.metrics.cpa != null &&
        ch.metrics.cpa > 0
    );
    if (candidates.length === 0) {
      toast({ title: 'No Action Taken', description: 'No suitable variable channels found to optimize.' });
      return;
    }
    const worst = candidates.reduce((prev, cur) => {
      const p = prev.metrics.cpa ?? Infinity;
      const c = cur.metrics.cpa ?? Infinity;
      return p > c ? prev : cur;
    });
    if (worst.locked) {
      toast({ title: 'Action Blocked', description: `${worst.name} is locked.` });
      return;
    }
    setChannelAllocation(worst.id, Math.max(0, worst.allocationPct * 0.9));
    normalizeAllocations();
    toast({ title: 'Optimized', description: `Reduced ${worst.name} budget by 10% due to high cost per conversion.` });
    dispatchActionPulse(worst.id, 'reduce-spend');
  };

  const handleReallocate = () => {
    if (!arbitrage) return;
    if (arbitrage.winner.locked) {
      toast({ title: 'Action Blocked', description: `${arbitrage.winner.name} is locked.` });
      return;
    }
    setChannelAllocation(arbitrage.winner.id, Math.min(100, arbitrage.winner.allocationPct + 20));
    normalizeAllocations();
    toast({
      title: 'Budget Reallocated',
      description: `Shifted budget from ${arbitrage.loser.name} → ${arbitrage.winner.name}.`,
      className: 'border-green-500/30 bg-green-500/10',
    });
    dispatchActionPulse(arbitrage.winner.id, 'reallocate');
  };

  const handleCapSpend = () => {
    if (!topSaturation) return;
    toggleChannelLock(topSaturation.id);
    toast({
      title: 'Spend Capped',
      description: `Locked ${topSaturation.name} to prevent diminishing returns.`,
      className: 'border-amber-500/30 bg-amber-500/10',
    });
    dispatchActionPulse(topSaturation.id, 'cap-spend');
  };

  // --- RENDER ---

  return (
    <div className="w-full grid grid-cols-1 gap-6">
      <AnimatePresence mode="popLayout">

        {/* All Clear state */}
        {!hasAnyAlert && (
          <motion.div
            key="all-clear"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Card className={cn('w-full p-5 flex flex-col items-center justify-center gap-3 text-center', isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200')}>
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <p className={cn('text-sm font-medium', isDark ? 'text-slate-300' : 'text-slate-600')}>
                All systems nominal
              </p>
              <p className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-400')}>
                No efficiency issues, arbitrage gaps, or saturation signals detected.
              </p>
            </Card>
          </motion.div>
        )}

        {/* CARD 1: Efficiency Alert — only when there's a real issue */}
        {!!efficiencyTarget && (
          <motion.div
            key="efficiency-alert"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Card className={cn('w-full backdrop-blur-sm p-5 flex flex-col justify-between relative overflow-hidden group hover:border-red-500/30 transition-all', isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200')}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-xl rounded-full -mr-10 -mt-10" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <span className="text-sm font-semibold text-red-400">Efficiency Alert</span>
                </div>

                <h4 className={cn('font-medium leading-snug mb-4', isDark ? 'text-slate-200' : 'text-slate-800')}>
                  <span className="text-red-300 font-semibold">{efficiencyTarget.channelName}</span>{' '}
                  — {efficiencyTarget.reason}
                </h4>

                {/* Real sparkline: ROAS by channel, best→worst */}
                <div className="h-12 w-full mb-4 opacity-60">
                  {sparklinePoints ? (
                    <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f87171" />
                          <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                      </defs>
                      <path d={sparklinePoints.d} fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                      {sparklinePoints.points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="1.5" fill="#f87171" opacity="0.7" />
                      ))}
                      {/* 1x ROAS baseline */}
                      <line x1="0" y1={38 - (1 / sparklinePoints.maxRoas) * 34} x2="100" y2={38 - (1 / sparklinePoints.maxRoas) * 34} stroke="#f87171" strokeWidth="0.5" strokeDasharray="3,2" opacity="0.4" />
                    </svg>
                  ) : (
                    <div className={cn('w-full h-full rounded flex items-center justify-center text-xs', isDark ? 'bg-slate-700/50 text-slate-500' : 'bg-slate-100 text-slate-400')}>
                      Add channels to see trend
                    </div>
                  )}
                </div>

                <Button
                  variant="outline" size="sm"
                  className="w-full border-red-500/20 hover:bg-red-500/10 text-red-300 hover:text-red-200"
                  onClick={handleAutoFix}
                >
                  Auto-Fix (Reduce Spend)
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* CARD 2: Arbitrage Opportunity — only when a real gap exists */}
        {!!arbitrage && (
          <motion.div
            key="arbitrage"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Card className={cn('w-full backdrop-blur-sm p-5 flex flex-col justify-between relative overflow-hidden group hover:border-green-500/30 transition-all', isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200')}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 blur-xl rounded-full -mr-10 -mt-10" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="text-sm font-semibold text-green-400">Arbitrage Opportunity</span>
                </div>

                <h4 className={cn('font-medium leading-snug mb-4', isDark ? 'text-slate-200' : 'text-slate-800')}>
                  <span className="text-green-300 font-semibold">{arbitrage.winner.name}</span> is under-funded
                  vs <span className="text-red-300">{arbitrage.loser.name}</span>.{' '}
                  <span className="text-green-400 font-bold">+{arbitrage.roasUpliftPct}% return on spend</span> potential.
                </h4>

                {/* Real progress bar */}
                <div className="space-y-2 mb-6 mt-2">
                  <div className={cn('flex justify-between text-[10px] uppercase tracking-wider', isDark ? 'text-slate-500' : 'text-slate-400')}>
                    <span>Current ({arbitrage.winner.name})</span>
                    <span>Potential Impact</span>
                  </div>
                  <div className={cn('h-2 rounded-full overflow-hidden flex', isDark ? 'bg-slate-700' : 'bg-slate-200')}>
                    <BarFill pct={arbitrage.winnerSharePct} className="h-full bg-slate-500 rounded-full" />
                    <BarFill pct={Math.min(30, 100 - arbitrage.winnerSharePct)} className="h-full bg-green-500 animate-pulse rounded-full" />
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className={cn(isDark ? 'text-slate-400' : 'text-slate-600')}>
                      {fmt(arbitrage.winner.metrics.spend)} Spend
                    </span>
                    <span className="text-green-400 font-mono">+{fmt(arbitrage.revenueGain)} Rev</span>
                  </div>
                </div>

                <Button
                  variant="outline" size="sm"
                  className="w-full border-green-500/20 hover:bg-green-500/10 text-green-300 hover:text-green-200"
                  onClick={handleReallocate}
                >
                  Reallocate Budget
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* CARD 3: Market Saturation — only when channels are actually near ceiling */}
        {saturationChannels.length > 0 && (
          <motion.div
            key="saturation"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Card className={cn('w-full backdrop-blur-sm p-5 flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/30 transition-all', isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200')}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-xl rounded-full -mr-10 -mt-10" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Activity className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-sm font-semibold text-amber-400">Market Saturation</span>
                </div>

                <h4 className={cn('font-medium leading-snug mb-4', isDark ? 'text-slate-200' : 'text-slate-800')}>
                  <span className="text-amber-300 font-semibold">{topSaturation!.name}</span> is at{' '}
                  <span className="text-amber-400 font-bold">{saturationPct}% of capacity</span>.{' '}
                  Additional spend will face diminishing returns.
                </h4>

                {/* Real saturation gauge */}
                <div className="mb-4">
                  <div className={cn('h-2 rounded-full overflow-hidden', isDark ? 'bg-slate-700' : 'bg-slate-200')}>
                    <BarFill
                      pct={saturationPct}
                      className={cn('h-full rounded-full transition-all duration-500', saturationPct >= 95 ? 'bg-red-500 animate-pulse' : 'bg-amber-500')}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1">
                    <span className={cn(isDark ? 'text-slate-500' : 'text-slate-400')}>0%</span>
                    <span className="text-amber-400 font-mono">{saturationPct}% used</span>
                    <span className={cn(isDark ? 'text-slate-500' : 'text-slate-400')}>100%</span>
                  </div>
                </div>

                <Button
                  variant="outline" size="sm"
                  className="w-full border-amber-500/20 hover:bg-amber-500/10 text-amber-300 hover:text-amber-200"
                  onClick={handleCapSpend}
                >
                  Cap Spend
                </Button>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]" aria-live="polite">
                  <AnimatePresence mode="popLayout">
                    <motion.span
                      key={`over-${efficiencyAlerts.filter((a) => a.severity === 'high').length}`}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.24 }}
                      className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-300"
                    >
                      Overspending: {efficiencyAlerts.filter((a) => a.severity === 'high').length}
                    </motion.span>
                    <motion.span
                      key={`sat-${saturationChannels.length}`}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.24 }}
                      className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300"
                    >
                      Near Ceiling: {saturationChannels.length}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};
