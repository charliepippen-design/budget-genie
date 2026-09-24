import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, Activity, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import { calculateArbitrageConfidence, selectArbitrageCandidates } from '@/lib/plan-math';

export const StrategicInsightsPanel = () => {
    const { toast } = useToast();
    const channels = useChannelsWithMetrics();
    const { setChannelAllocation, updateChannelConfigField, normalizeAllocations, globalMultipliers, totalBudget } = useMediaPlanStore();
    const { symbol } = useCurrency();

    // Helper to format currency values cleanly for display (e.g. €2.5k)
    const formatAmount = (num: number) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
        return num.toFixed(0);
    };

    // 1. --- CALCULATIONS: CARD 1 (Worst CPA / Target CPA Violator) ---
    const targetCpa = globalMultipliers.cpaTarget;
    const activeVariableChannels = channels.filter(ch =>
        ch.isActive &&
        ch.metrics.spend > 0 &&
        (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
    );

    const cpaTargetValue = targetCpa || 150; // Fallback value if target not set
    const cpaViolators = activeVariableChannels.filter(ch => ch.metrics.cpa && ch.metrics.cpa > cpaTargetValue);

    // Worst violator based on percentage deviation
    const worstCpaChannel = cpaViolators.length > 0
        ? [...cpaViolators].sort((a, b) => {
            const ratioA = ((a.metrics.cpa || 0) - cpaTargetValue) / cpaTargetValue;
            const ratioB = ((b.metrics.cpa || 0) - cpaTargetValue) / cpaTargetValue;
            return ratioB - ratioA;
          })[0]
        : null;

    const hasCpaTarget = targetCpa !== null && targetCpa !== undefined;
    const cpaCompliancePassed = hasCpaTarget && cpaViolators.length === 0;

    // 2. --- CALCULATIONS: CARD 2 (Arbitrage Opportunity) ---
    const targetRoas = globalMultipliers.roasTarget || 2.5;

    // Use pure selector that prevents recommending saturated channels as winner
    const { loser, winner, arbitragePossible } = selectArbitrageCandidates(channels, targetRoas);
    let expectedAddedRevenue = 0;
    let deductionPct = 0;
    let siphonSpend = 0;

    if (loser && winner && arbitragePossible) {
        const roasRatio = loser.metrics.roas / targetRoas;
        const failingSpendRatio = Math.max(0, 1 - roasRatio);
        const maxSiphonRatio = 0.20;
        // Siphon up to 20% of allocation, or less if performance is close to target
        const exactSiphonRatio = Math.min(failingSpendRatio || maxSiphonRatio, maxSiphonRatio);

        deductionPct = loser.allocationPct * exactSiphonRatio;
        siphonSpend = (deductionPct / 100) * totalBudget;
        expectedAddedRevenue = siphonSpend * (winner.metrics.roas - loser.metrics.roas);
    }

    // Arbitrage candidates for fallback best channel
    const arbitrageCandidates = channels.filter(ch =>
        ch.isActive &&
        !ch.locked &&
        ch.metrics.spend > 0 &&
        (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
    );

    // Find the winner to receive worst CPA channel siphon if needed
    const bestRoasChannel = arbitrageCandidates.length > 0
        ? [...arbitrageCandidates].sort((a, b) => b.metrics.roas - a.metrics.roas)[0]
        : null;

    // 3. --- CALCULATIONS: CARD 3 (Diminishing Returns & Saturation) ---
    const saturationCandidates = channels.filter(ch =>
        ch.isActive &&
        ch.metrics.spend > 0 &&
        (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
    );

    let saturatedChannel = null;
    let highestSaturationRatio = 0;

    saturationCandidates.forEach(ch => {
        const ceil = ch.typeConfig?.baselineMetrics?.saturationCeiling || 50000;
        const ratio = ch.metrics.spend / ceil;
        if (ratio > highestSaturationRatio) {
            highestSaturationRatio = ratio;
            saturatedChannel = ch;
        }
    });

    // Fallback: If no channel has custom saturation, pick the highest spending variable channel
    if (!saturatedChannel && saturationCandidates.length > 0) {
        const sortedBySpend = [...saturationCandidates].sort((a, b) => b.metrics.spend - a.metrics.spend);
        saturatedChannel = sortedBySpend[0];
        const ceil = saturatedChannel.typeConfig?.baselineMetrics?.saturationCeiling || 50000;
        highestSaturationRatio = saturatedChannel.metrics.spend / ceil;
    }

    const saturationCeiling = saturatedChannel?.typeConfig?.baselineMetrics?.saturationCeiling || 50000;

    // --- BUTTON 1: REDUCE ALLOCATION (Worst CPA channel siphon) ---
    const handleRebalanceWorstCpa = () => {
        if (!worstCpaChannel || !bestRoasChannel) {
            toast({ title: "No Action", description: "No channels require efficiency rebalancing.", variant: "default" });
            return;
        }

        const siphonRatio = 0.15; // Siphon 15% of the worst CPA channel's allocation
        const deduction = worstCpaChannel.allocationPct * siphonRatio;

        if (deduction <= 0.01) {
            toast({ title: "Action limits reached", description: "Insufficient budget left to siphon from the bleeding channel.", variant: "default" });
            return;
        }

        const newWorstAlloc = worstCpaChannel.allocationPct - deduction;
        const newBestAlloc = bestRoasChannel.allocationPct + deduction;

        setChannelAllocation(worstCpaChannel.id, newWorstAlloc);
        setChannelAllocation(bestRoasChannel.id, newBestAlloc);
        normalizeAllocations();

        toast({
            title: "Efficiency Rebalanced",
            description: `Siphoned ${deduction.toFixed(1)}% budget from ${worstCpaChannel.name} directly into ${bestRoasChannel.name}.`,
            className: "border-green-500/30 bg-green-500/10"
        });
    };

    // --- BUTTON 2: APPROVE REBALANCE (Arbitrage) ---
    const handleApproveRebalance = () => {
        if (!loser || !winner || !arbitragePossible) {
            toast({ title: "No Action Taken", description: "Plan is already balanced or lacks candidate channels.", variant: "default" });
            return;
        }

        if (deductionPct <= 0.01) {
            toast({ title: "Action limits reached", description: "Insufficient budget left to siphon from the bleeding channel.", variant: "default" });
            return;
        }

        const newLoserAlloc = loser.allocationPct - deductionPct;
        const newWinnerAlloc = winner.allocationPct + deductionPct;

        setChannelAllocation(loser.id, newLoserAlloc);
        setChannelAllocation(winner.id, newWinnerAlloc);
        normalizeAllocations();

        toast({
            title: "Rebalance Approved",
            description: `Siphoned ${deductionPct.toFixed(1)}% budget from ${loser.name} directly into ${winner.name}.`,
            className: "border-green-500/30 bg-green-500/10"
        });
    };

    // --- BUTTON 3: CAP SPEND (Lock Saturated Channel) ---
    const handleCapSpend = () => {
        if (!saturatedChannel) {
            toast({ title: "No Action", description: "No active variable channels to cap.", variant: "default" });
            return;
        }

        if (saturatedChannel.locked) {
            toast({ title: "Already Locked", description: `"${saturatedChannel.name}" is already locked.`, variant: "default" });
            return;
        }

        useMediaPlanStore.getState().toggleChannelLock(saturatedChannel.id);

        toast({
            title: "Spend Capped",
            description: `Locked spend for ${saturatedChannel.name} to prevent diminishing returns.`,
            className: "border-amber-500/30 bg-amber-500/10"
        });
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CARD 1: Efficiency Alert */}
            {cpaCompliancePassed ? (
                <Card className="bg-slate-800/50 backdrop-blur-sm border-emerald-500/20 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-xl rounded-full -mr-10 -mt-10" />
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <span className="text-sm font-semibold text-emerald-400">CPA Compliant</span>
                                </div>
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-mono">
                                    100% Target Met
                                </Badge>
                            </div>

                            <h4 className="text-slate-200 font-medium leading-snug mb-4">
                                All campaigns are running <span className="text-emerald-400 font-bold">within target CPA limits</span>.
                            </h4>

                            <div className="h-12 w-full mb-4 opacity-50">
                                <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible">
                                    <path
                                        d="M0 30 Q30 25 60 15 T100 5"
                                        fill="none"
                                        stroke="#10b981"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    />
                                    <path
                                        d="M0 30 Q30 25 60 15 T100 5 V40 H0 Z"
                                        fill="url(#greenGradient)"
                                        className="opacity-20"
                                    />
                                    <defs>
                                        <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" />
                                            <stop offset="100%" stopColor="transparent" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] text-slate-500 italic mb-4 leading-normal">
                                * Derived from active plan constraints and real-time CPA analysis.
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-emerald-500/20 text-emerald-300 hover:text-emerald-200 pointer-events-none opacity-50"
                                disabled
                            >
                                All Compliant
                            </Button>
                        </div>
                    </div>
                </Card>
            ) : !worstCpaChannel ? (
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-slate-500/30 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-500/5 blur-xl rounded-full -mr-10 -mt-10" />
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-slate-500/10 rounded-lg">
                                        <HelpCircle className="w-5 h-5 text-slate-400" />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-400">
                                        {activeVariableChannels.length === 0 ? "No Active Spend" : "CPA Within Limits"}
                                    </span>
                                </div>
                                <Badge variant="outline" className="text-[10px] bg-slate-500/10 border-slate-700 text-slate-400 font-mono">
                                    {activeVariableChannels.length === 0 ? "No Active Spend" : hasCpaTarget ? "Target Met" : "Target Not Set"}
                                </Badge>
                            </div>

                            <h4 className="text-slate-400 font-medium leading-snug mb-4">
                                {activeVariableChannels.length === 0
                                    ? "No active campaigns with spend to evaluate CPA compliance."
                                    : hasCpaTarget
                                    ? "All active campaigns are running within your specified target CPA."
                                    : "Active campaigns are running within default thresholds (€150). Set a custom target in Multipliers to customize."}
                            </h4>
                        </div>

                        <div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-slate-800 text-slate-500 pointer-events-none"
                                disabled
                            >
                                {activeVariableChannels.length === 0 ? "No Data Available" : "All Compliant"}
                            </Button>
                        </div>
                    </div>
                </Card>
            ) : (
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-red-500/30 transition-all">
                    {/* Glow Effect */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-xl rounded-full -mr-10 -mt-10" />

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-red-500/10 rounded-lg">
                                        <AlertTriangle className="w-5 h-5 text-red-400" />
                                    </div>
                                    <span className="text-sm font-semibold text-red-400">Efficiency Alert</span>
                                </div>
                                <Badge variant="outline" className="text-[10px] bg-red-500/10 border-red-500/30 text-red-400 font-mono">
                                    CPA Target Overrun
                                </Badge>
                            </div>

                            <h4 className="text-slate-200 font-medium leading-snug mb-4">
                                {worstCpaChannel.name} is <span className="text-red-400 font-bold">{Math.round(((worstCpaChannel.metrics.cpa! - cpaTargetValue) / cpaTargetValue) * 100)}% above target CPA</span>.
                            </h4>

                            {/* Sparkline Visual */}
                            <div className="h-12 w-full mb-4 opacity-50">
                                <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible">
                                    <path
                                        d="M0 35 Q10 32 20 25 T40 28 T60 20 T80 10 T100 2"
                                        fill="none"
                                        stroke="#f87171"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    />
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
                        </div>

                        <div>
                            <div className="text-[10px] text-slate-500 italic mb-4 leading-normal">
                                * CPA: {symbol}{Math.round(worstCpaChannel.metrics.cpa!)} vs Target: {symbol}{cpaTargetValue}.
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-red-500/20 hover:bg-red-500/10 text-red-300 hover:text-red-200 flex items-center justify-center gap-2"
                                onClick={handleRebalanceWorstCpa}
                            >
                                Optimize Allocation <ArrowRight className="w-3 h-3"/>
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* CARD 2: Arbitrage Opportunity */}
            {!arbitragePossible || !winner || !loser ? (
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-slate-500/30 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-500/5 blur-xl rounded-full -mr-10 -mt-10" />
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-slate-500/10 rounded-lg">
                                        <TrendingUp className="w-5 h-5 text-slate-400" />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-400">Arbitrage Optimized</span>
                                </div>
                            </div>
                            <h4 className="text-slate-400 font-medium leading-snug mb-4">
                                Plan ROAS is optimized. No high-impact rebalance opportunities found.
                            </h4>
                        </div>
                        <div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-slate-800 text-slate-500 pointer-events-none"
                                disabled
                            >
                                Plan Balanced
                            </Button>
                        </div>
                    </div>
                </Card>
            ) : (
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-green-500/30 transition-all">
                    {/* Glow Effect */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 blur-xl rounded-full -mr-10 -mt-10" />

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-green-500/10 rounded-lg">
                                        <TrendingUp className="w-5 h-5 text-green-400" />
                                    </div>
                                    <span className="text-sm font-semibold text-green-400">Arbitrage Opportunity</span>
                                </div>
                                <Badge variant="outline" className="text-[10px] bg-green-500/10 border-green-500/30 text-green-400 font-mono">
                                    {calculateArbitrageConfidence(winner.metrics.roas, loser.metrics.roas)}% Confidence
                                </Badge>
                            </div>

                            <h4 className="text-slate-200 font-medium leading-snug mb-4">
                                {winner.name} is under-funded. <span className="text-green-400 font-bold">+{((winner.metrics.roas - loser.metrics.roas)).toFixed(1)}x ROAS</span> spread over {loser.name}.
                            </h4>

                            {/* Progress Visual */}
                            <div className="space-y-2 mb-6 mt-2">
                                <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-wider">
                                    <span>Current Spend</span>
                                    <span>Potential Gain</span>
                                </div>
                                <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-slate-500 w-[70%]" />
                                    <div className="h-full bg-green-500 animate-pulse w-[30%]" />
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400">{symbol}{formatAmount(winner.metrics.spend)} Spend</span>
                                    <span className="text-green-400 font-mono">+{symbol}{formatAmount(expectedAddedRevenue)} Rev</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] text-slate-500 italic mb-4 leading-normal">
                                * Shift {deductionPct.toFixed(1)}% allocation from {loser.name} to {winner.name}.
                            </div>

                            <Button
                                variant="default"
                                size="sm"
                                className="w-full border-green-500/80 bg-green-500/20 hover:bg-green-500/40 text-green-100 font-bold tracking-wide mt-2"
                                onClick={handleApproveRebalance}
                            >
                                Approve Rebalance
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* CARD 3: Market Saturation */}
            {!saturatedChannel ? (
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-slate-500/30 transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-500/5 blur-xl rounded-full -mr-10 -mt-10" />
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-slate-500/10 rounded-lg">
                                        <Activity className="w-5 h-5 text-slate-400" />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-400">No Saturation</span>
                                </div>
                            </div>
                            <h4 className="text-slate-400 font-medium leading-snug mb-4">
                                All campaigns are running comfortably within saturation ceilings.
                            </h4>
                        </div>
                        <div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-slate-800 text-slate-500 pointer-events-none"
                                disabled
                            >
                                Safe Capacity
                            </Button>
                        </div>
                    </div>
                </Card>
            ) : (
                <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/30 transition-all">
                    {/* Glow Effect */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-xl rounded-full -mr-10 -mt-10" />

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-amber-500/10 rounded-lg">
                                        <Activity className="w-5 h-5 text-amber-400" />
                                    </div>
                                    <span className="text-sm font-semibold text-amber-400">Market Saturation</span>
                                </div>
                                <Badge variant="outline" className={cn(
                                    "text-[10px] font-mono",
                                    highestSaturationRatio >= 1.0
                                        ? "bg-red-500/10 border-red-500/30 text-red-400 font-bold"
                                        : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                )}>
                                    {highestSaturationRatio >= 1.0 ? `OVER CEILING (${Math.round(highestSaturationRatio * 100)}%)` : `${Math.round(highestSaturationRatio * 100)}% Saturation`}
                                </Badge>
                            </div>

                            <h4 className="text-slate-200 font-medium leading-snug mb-4">
                                {saturatedChannel.name} is hitting diminishing returns. Spend is at <span className={cn("font-bold", highestSaturationRatio >= 1.0 ? "text-red-400" : "text-amber-400")}>{Math.round(highestSaturationRatio * 100)}% of ceiling</span>.
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
                                <span className={cn("ml-3 text-xs font-mono", highestSaturationRatio >= 1.0 ? "text-red-400 font-bold" : "text-amber-300")}>
                                    {highestSaturationRatio >= 1.0 ? `OVER CEILING (${Math.round(highestSaturationRatio * 100)}%)` : 'SATURATION APPROACHING'}
                                </span>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] text-slate-500 italic mb-4 leading-normal">
                                * Spend: {symbol}{formatAmount(saturatedChannel.metrics.spend)} / Ceiling: {symbol}{formatAmount(saturationCeiling)}.
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "w-full border-amber-500/20 hover:bg-amber-500/10 text-amber-300 hover:text-amber-200",
                                    saturatedChannel.locked && "opacity-50 pointer-events-none border-slate-800 text-slate-500"
                                )}
                                onClick={handleCapSpend}
                                disabled={saturatedChannel.locked}
                            >
                                {saturatedChannel.locked ? "Spend Capped (Locked)" : "Cap Spend"}
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};
