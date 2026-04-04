import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { useToast } from '@/hooks/use-toast';
import { useActionPulseStore } from '@/store/useActionPulseStore';
import { useMemo } from 'react';
import { getEfficiencyAlerts, getMetricIntegrityIssues } from '@/lib/planning-insights';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

export const StrategicInsightsPanel = () => {
  const { toast } = useToast();
  const channels = useChannelsWithMetrics();
  const { setChannelAllocation, normalizeAllocations, toggleChannelLock } = useMediaPlanStore();
  const dispatchActionPulse = useActionPulseStore((state) => state.dispatchActionPulse);
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';

  const efficiencyAlerts = useMemo(() => getEfficiencyAlerts(channels), [channels]);
  const integrityIssues = useMemo(() => getMetricIntegrityIssues(channels), [channels]);
  const topDiminishingAlert = efficiencyAlerts.find((alert) => alert.severity === 'high');

  // --- BUTTON 1: AUTO-FIX (Reduce Highest CPA) ---
  const handleAutoFix = () => {
    const candidates = channels.filter(
      (ch) =>
        !ch.locked &&
        (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA') &&
        ch.metrics.cpa > 0
    );

    if (candidates.length === 0) {
      toast({
        title: 'No Action Taken',
        description: 'No suitable variable channels found to optimize.',
        variant: 'default',
      });
      return;
    }

    const highestCpa = candidates.reduce((prev, current) =>
      prev.metrics.cpa > current.metrics.cpa ? prev : current
    );

    if (highestCpa.locked) {
      toast({
        title: 'Action Blocked',
        description: `${highestCpa.name} is locked. Unlock it before auto-optimizing.`,
        variant: 'default',
      });
      return;
    }

    const newAlloc = Math.max(0, highestCpa.allocationPct * 0.9);
    setChannelAllocation(highestCpa.id, newAlloc);
    normalizeAllocations();

    toast({
      title: 'Optimized',
      description: `Reduced ${highestCpa.name} budget by 10% due to high CPA.`,
    });
    dispatchActionPulse(highestCpa.id, 'reduce-spend');
  };

  // --- BUTTON 2: REALLOCATE (Arbitrage) ---
  const handleReallocate = () => {
    // Find Winner (High ROAS) and Loser (Low ROAS)
    const candidates = channels.filter(
      (ch) =>
        !ch.locked &&
        (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
    );

    if (candidates.length < 2) {
      toast({
        title: 'Insufficient Data',
        description: 'Need at least 2 variable channels to reallocate.',
        variant: 'destructive',
      });
      return;
    }

    const sortedByRoas = [...candidates].sort((a, b) => b.metrics.roas - a.metrics.roas);
    const winner = sortedByRoas[0];
    const loser = sortedByRoas[sortedByRoas.length - 1];

    if (winner.id === loser.id) return;

    if (winner.locked) {
      toast({
        title: 'Action Blocked',
        description: `${winner.name} is locked. Unlock it before reallocating.`,
        variant: 'default',
      });
      return;
    }

    const newPercentage = Math.min(100, winner.allocationPct + 20);
    setChannelAllocation(winner.id, newPercentage);
    normalizeAllocations();

    toast({
      title: 'Strategy',
      description: `Moved budget from ${loser.name} to ${winner.name} to maximize ROAS.`,
      className: 'border-green-500/30 bg-green-500/10',
    });
    dispatchActionPulse(winner.id, 'reallocate');
  };

  // --- BUTTON 3: CAP SPEND (Lock Highest Spender) ---
  const handleCapSpend = () => {
    const candidates = channels.filter(
      (ch) =>
        !ch.locked &&
        (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
    );

    if (candidates.length === 0) {
      toast({
        title: 'No Action',
        description: 'All variable channels are already locked or empty.',
        variant: 'default',
      });
      return;
    }

    const saturationCandidate = topDiminishingAlert
      ? candidates.find((channel) => channel.id === topDiminishingAlert.channelId)
      : null;

    const highestSpender = saturationCandidate
      ? saturationCandidate
      : candidates.reduce((prev, current) =>
          prev.metrics.spend > current.metrics.spend ? prev : current
        );

    // Lock it
    toggleChannelLock(highestSpender.id);

    toast({
      title: 'Spend Capped',
      description: `Locked spend for ${highestSpender.name} to prevent diminishing returns.`,
      className: 'border-amber-500/30 bg-amber-500/10',
    });
    dispatchActionPulse(highestSpender.id, 'cap-spend');
  };

  return (
    <div className="w-full grid grid-cols-1 gap-6">
      {/* CARD 1: Efficiency Alert */}
      <Card className={cn("w-full backdrop-blur-sm p-5 flex flex-col justify-between relative overflow-hidden group hover:border-red-500/30 transition-all", isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200")}>
        {/* Glow Effect */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-xl rounded-full -mr-10 -mt-10" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-sm font-semibold text-red-400">Efficiency Alert</span>
          </div>

          <h4 className={cn("font-medium leading-snug mb-4", isDark ? "text-slate-200" : "text-slate-800")}>
            {integrityIssues[0]
              ? `${integrityIssues[0].channelName} has incomplete metrics that can skew optimization.`
              : 'Highest CPA channel is above target and needs spend containment.'}
          </h4>

          {/* Sparkline Visual (Static SVG for demo) */}
          <div className="h-12 w-full mb-4 opacity-50">
            <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible">
              <path
                d="M0 35 Q10 32 20 25 T40 28 T60 20 T80 10 T100 2"
                fill="none"
                stroke="#f87171"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Fill gradient area */}
              <path
                d="M0 35 Q10 32 20 25 T40 28 T60 20 T80 10 T100 2 V40 H0 Z"
                fill="url(#redGradient)"
                className="opacity-20"
              />
              <defs>
                <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full border-red-500/20 hover:bg-red-500/10 text-red-300 hover:text-red-200"
            onClick={handleAutoFix}
            aria-label="Auto fix high CPA allocation"
          >
            Auto-Fix (Reduce Spend)
          </Button>
        </div>
      </Card>

      {/* CARD 2: Arbitrage Opportunity */}
      <Card className={cn("w-full backdrop-blur-sm p-5 flex flex-col justify-between relative overflow-hidden group hover:border-green-500/30 transition-all", isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200")}>
        {/* Glow Effect */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 blur-xl rounded-full -mr-10 -mt-10" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-sm font-semibold text-green-400">Arbitrage Opportunity</span>
          </div>

          <h4 className={cn("font-medium leading-snug mb-4", isDark ? "text-slate-200" : "text-slate-800")}>
            SEO Content is under-funded. <span className="text-green-400 font-bold">+18% ROAS</span>{' '}
            potential.
          </h4>

          {/* Progress Visual */}
          <div className="space-y-2 mb-6 mt-2">
            <div className={cn("flex justify-between text-[10px] uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>
              <span>Current</span>
              <span>Potential Impact</span>
            </div>
            <div className={cn("h-2 rounded-full overflow-hidden flex", isDark ? "bg-slate-700" : "bg-slate-200")}>
              <div className="h-full bg-slate-500 w-[60%]" />
              <div className="h-full bg-green-500 animate-pulse w-[30%]" />
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className={cn(isDark ? "text-slate-400" : "text-slate-600")}>€2k Spend</span>
              <span className="text-green-400 font-mono">+€8.5k Rev</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full border-green-500/20 hover:bg-green-500/10 text-green-300 hover:text-green-200"
            onClick={handleReallocate}
            aria-label="Reallocate budget to high ROAS channels"
          >
            Reallocate Budget
          </Button>
        </div>
      </Card>

      {/* CARD 3: Market Saturation */}
      <Card className={cn("w-full backdrop-blur-sm p-5 flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/30 transition-all", isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200")}>
        {/* Glow Effect */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-xl rounded-full -mr-10 -mt-10" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-sm font-semibold text-amber-400">Market Saturation</span>
          </div>

          <h4 className={cn("font-medium leading-snug mb-4", isDark ? "text-slate-200" : "text-slate-800")}>
            {topDiminishingAlert
              ? `${topDiminishingAlert.channelName} is approaching diminishing returns.`
              : 'Top spend channel is showing saturation pressure.'}{' '}
            <span className="text-amber-400 font-bold">Cap before efficiency drops further.</span>
          </h4>

          {/* Pulse Visual */}
          <div className="flex items-center justify-center h-12 mb-4 bg-amber-500/5 rounded-lg border border-amber-500/10">
            <div className="flex items-center gap-1">
              <div className="w-1 h-3 bg-amber-500/30 rounded-full" />
              <div className="w-1 h-5 bg-amber-500/50 rounded-full" />
              <div className="w-1 h-8 bg-amber-500 animate-pulse rounded-full" />
              <div className="w-1 h-5 bg-amber-500/50 rounded-full" />
              <div className="w-1 h-3 bg-amber-500/30 rounded-full" />
            </div>
            <span className="ml-3 text-xs text-amber-300 font-mono">SATURATION DETECTED</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full border-amber-500/20 hover:bg-amber-500/10 text-amber-300 hover:text-amber-200"
            onClick={handleCapSpend}
            aria-label="Cap channel spend to prevent saturation"
          >
            Cap Spend
          </Button>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]" aria-live="polite">
            <AnimatePresence mode="popLayout">
              <motion.span
                key={`overspending-${efficiencyAlerts.filter((a) => a.severity === 'high').length}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.24, ease: 'easeInOut' }}
                className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-300"
              >
                Overspending: {efficiencyAlerts.filter((a) => a.severity === 'high').length}
              </motion.span>
              <motion.span
                key={`underfunded-${Math.max(0, channels.length - efficiencyAlerts.length)}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.24, ease: 'easeInOut' }}
                className="rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-green-300"
              >
                Underfunding Opportunities: {Math.max(0, channels.length - efficiencyAlerts.length)}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </Card>
    </div>
  );
};
