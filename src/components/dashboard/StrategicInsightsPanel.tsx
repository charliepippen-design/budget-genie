import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, Activity, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { useToast } from '@/hooks/use-toast';

export const StrategicInsightsPanel = () => {
    const { toast } = useToast();
    const channels = useChannelsWithMetrics(state => state.channels); // Get with metrics for sorting
    const { updateChannelAllocation, updateChannelConfigField } = useMediaPlanStore();

    // --- BUTTON 1: AUTO-FIX (Reduce Highest CPA) ---
    const handleAutoFix = () => {
        // Find highest CPA channel that is variable and unlocked
        const candidates = channels.filter(ch =>
            !ch.locked &&
            (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA') &&
            ch.metrics.cpa > 0
        );

        if (candidates.length === 0) {
            toast({ title: "No Action Taken", description: "No suitable variable channels found to optimize.", variant: "default" });
            return;
        }

        const highestCpa = candidates.reduce((prev, current) =>
            (prev.metrics.cpa > current.metrics.cpa) ? prev : current
        );

        // Reduce by 10% relative (e.g. 20% -> 18%)
        const currentAlloc = highestCpa.allocationPct;
        const newAlloc = Math.max(0, currentAlloc * 0.9);
        const saving = currentAlloc - newAlloc;

        updateChannelAllocation(highestCpa.id, newAlloc);

        // Note: The store's normalizeAllocations (triggered by UI or effect usually, but we might want to manually trigger or let user normalize)
        // For now, we leave the saving as 'unallocated' effectively, or let the user click Normalize.
        // Actually, the prompt says "redistribute the savings". 
        // Simple way: Add saving / N to remaining channels.

        const others = candidates.filter(ch => ch.id !== highestCpa.id);
        const totalOtherAlloc = others.reduce((sum, ch) => sum + ch.allocationPct, 0);

        if (others.length > 0 && totalOtherAlloc > 0) {
            others.forEach(ch => {
                const share = ch.allocationPct / totalOtherAlloc;
                const boost = saving * share;
                updateChannelAllocation(ch.id, ch.allocationPct + boost);
            });
        } else if (others.length > 0) {
            // Fallback to equal if others have 0 allocation
            const boost = saving / others.length;
            others.forEach(ch => updateChannelAllocation(ch.id, ch.allocationPct + boost));
        }

        toast({
            title: "Optimized",
            description: `Reduced ${highestCpa.name} budget by 10% due to high CPA.`,
        });
    };

    // --- BUTTON 2: REALLOCATE (Arbitrage) ---
    const handleReallocate = () => {
        // Find Winner (High ROAS) and Loser (Low ROAS)
        const candidates = channels.filter(ch =>
            !ch.locked &&
            (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
        );

        if (candidates.length < 2) {
            toast({ title: "Insufficient Data", description: "Need at least 2 variable channels to reallocate.", variant: "destructive" });
            return;
        }

        const sortedByRoas = [...candidates].sort((a, b) => b.metrics.roas - a.metrics.roas);
        const winner = sortedByRoas[0];
        const loser = sortedByRoas[sortedByRoas.length - 1];

        if (winner.id === loser.id) return; // Should not happen with length >= 2

        // Move 5% absolute
        const amount = 5;
        if (loser.allocationPct < amount) {
            toast({ title: "Action Failed", description: `${loser.name} has insufficient budget to reallocate.`, variant: "destructive" });
            return;
        }

        updateChannelAllocation(loser.id, loser.allocationPct - amount);
        updateChannelAllocation(winner.id, winner.allocationPct + amount);

        toast({
            title: "Strategy",
            description: `Moved 5% budget from ${loser.name} to ${winner.name} to maximize ROAS.`,
            className: "border-green-500/30 bg-green-500/10"
        });
    };

    // --- BUTTON 3: CAP SPEND (Lock Highest Spender) ---
    const handleCapSpend = () => {
        const candidates = channels.filter(ch =>
            !ch.locked &&
            (ch.buyingModel === 'CPM' || ch.buyingModel === 'CPC' || ch.buyingModel === 'CPA')
        );

        if (candidates.length === 0) {
            toast({ title: "No Action", description: "All variable channels are already locked or empty.", variant: "default" });
            return;
        }

        const highestSpender = candidates.reduce((prev, current) =>
            (prev.metrics.spend > current.metrics.spend) ? prev : current
        );

        // Lock it
        updateChannelConfigField(highestSpender.id, 'locked', true);

        toast({
            title: "Spend Capped",
            description: `Locked spend for ${highestSpender.name} to prevent diminishing returns.`,
            className: "border-amber-500/30 bg-amber-500/10"
        });
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CARD 1: Efficiency Alert */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-red-500/30 transition-all">
                {/* Glow Effect */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-xl rounded-full -mr-10 -mt-10" />

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-2 bg-red-500/10 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <span className="text-sm font-semibold text-red-400">Efficiency Alert</span>
                    </div>

                    <h4 className="text-slate-200 font-medium leading-snug mb-4">
                        Facebook Ads CPA is <span className="text-red-400 font-bold">15% above target</span>.
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
                    >
                        Auto-Fix (Reduce Spend)
                    </Button>
                </div>
            </Card>

            {/* CARD 2: Arbitrage Opportunity */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-green-500/30 transition-all">
                {/* Glow Effect */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 blur-xl rounded-full -mr-10 -mt-10" />

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-green-400" />
                        </div>
                        <span className="text-sm font-semibold text-green-400">Arbitrage Opportunity</span>
                    </div>

                    <h4 className="text-slate-200 font-medium leading-snug mb-4">
                        SEO Content is under-funded. <span className="text-green-400 font-bold">+18% ROAS</span> potential.
                    </h4>

                    {/* Progress Visual */}
                    <div className="space-y-2 mb-6 mt-2">
                        <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-wider">
                            <span>Current</span>
                            <span>Potential Impact</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
                            <div className="h-full bg-slate-500 w-[60%]" />
                            <div className="h-full bg-green-500 animate-pulse w-[30%]" />
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400">€2k Spend</span>
                            <span className="text-green-400 font-mono">+€8.5k Rev</span>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-green-500/20 hover:bg-green-500/10 text-green-300 hover:text-green-200"
                        onClick={handleReallocate}
                    >
                        Reallocate Budget
                    </Button>
                </div>
            </Card>

            {/* CARD 3: Market Saturation */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50 p-5 flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/30 transition-all">
                {/* Glow Effect */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-xl rounded-full -mr-10 -mt-10" />

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                            <Activity className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="text-sm font-semibold text-amber-400">Market Saturation</span>
                    </div>

                    <h4 className="text-slate-200 font-medium leading-snug mb-4">
                        Paid Search is hitting diminishing returns. Next €5k @ <span className="text-amber-400 font-bold">0.8x ROAS</span>.
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
                    >
                        Cap Spend
                    </Button>
                </div>
            </Card>
        </div>
    );
};
