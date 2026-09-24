import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Slider } from '../../components/ui/slider';
import { TrendingUp, Rocket, Crown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { ForecastCard } from './ForecastCard';
import { useBudgetEngine } from '@/hooks/use-budget-engine';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';

export const BudgetHero = () => {
    // Consolidate Store Access
    // We use useProjectStore for read access to state
    const { totalBudget, channels, globalMultipliers } = useProjectStore();
    const { updateBudget } = useBudgetEngine();
    const { symbol } = useCurrency();
    const channelsWithMetrics = useChannelsWithMetrics();
    const [localBudget, setLocalBudget] = useState(totalBudget);
    const [mood, setMood] = useState({ text: "Bootstrapping", color: "text-blue-400", bg: "bg-blue-500", icon: Zap });

    // Calculate Budget Floor (Sum of Fixed Tiers)
    const minBudget = channels
        .filter(c => c.tier === 'fixed')
        .reduce((sum, c) => sum + (c.typeConfig.price || 0), 0);

    useEffect(() => {
        setLocalBudget(totalBudget);
        updateMood(totalBudget);
    }, [totalBudget]);

    const updateMood = (value: number) => {
        if (value < 10000) setMood({ text: "Bootstrapping", color: "text-blue-400", bg: "bg-blue-500", icon: Zap });
        else if (value < 50000) setMood({ text: "High Growth Velocity", color: "text-emerald-400", bg: "bg-emerald-500", icon: TrendingUp });
        else if (value < 200000) setMood({ text: "Aggressive Scaling", color: "text-purple-400", bg: "bg-purple-500", icon: Rocket });
        else setMood({ text: "Market Domination", color: "text-orange-500", bg: "bg-orange-500", icon: Crown });
    };

    const { cpaTarget, roasTarget } = globalMultipliers || {};

    const compliance = React.useMemo(() => {
        const activeChannels = channelsWithMetrics.filter(ch => ch.isActive && ch.metrics.spend > 0);
        const totalActiveSpend = activeChannels.reduce((sum, ch) => sum + ch.metrics.spend, 0);

        if (totalActiveSpend === 0) return { cpaPct: 100, roasPct: 100 };

        const cpaCompliantSpend = activeChannels
            .filter(ch => !ch.aboveCpaTarget)
            .reduce((sum, ch) => sum + ch.metrics.spend, 0);

        const roasCompliantSpend = activeChannels
            .filter(ch => !ch.belowRoasTarget)
            .reduce((sum, ch) => sum + ch.metrics.spend, 0);

        return {
            cpaPct: Math.round((cpaCompliantSpend / totalActiveSpend) * 100),
            roasPct: Math.round((roasCompliantSpend / totalActiveSpend) * 100),
        };
    }, [channelsWithMetrics, cpaTarget, roasTarget]);

    const handleSlide = (val: number[]) => {
        let value = val[0];

        // Enforce Floor
        if (value < minBudget) {
            value = minBudget;
        }

        setLocalBudget(value);
        updateBudget(value);
        updateMood(value);
    };

    const presets = [minBudget > 0 ? minBudget : 10000, 25000, 50000, 100000, 500000].filter(v => v >= minBudget);

    return (
        <div className="w-full bg-[#020617] border-b border-slate-800 p-6 md:p-8 flex flex-col items-center justify-center space-y-8 relative overflow-hidden shrink-0">
            {/* Background Glow Effect */}
            <div className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] blur-[100px] rounded-full pointer-events-none transition-colors duration-500 opacity-10",
                mood.bg
            )} />

            {/* SPLIT LAYOUT CONTAINER */}
            <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* LEFT COLUMN: BUDGET INPUT */}
                <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-8 shadow-2xl flex flex-col items-center justify-between gap-8 h-full">

                    {/* Dynamic Header */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className={cn("flex items-center gap-2 font-mono text-sm uppercase tracking-widest animate-pulse transition-colors duration-300 cursor-help border-b border-dashed border-slate-700 pb-0.5", mood.color)}>
                                <mood.icon className="w-4 h-4" />
                                {mood.text}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-slate-950 border-slate-800 text-slate-200 p-3 max-w-[280px]">
                            <p className="text-xs font-semibold mb-1 text-white">{mood.text}</p>
                            <p className="text-[11px] leading-relaxed text-slate-400">
                                {mood.text === "Bootstrapping" && "Budget under €10k. Focuses on proof of concept, high efficiency, and minimized risk."}
                                {mood.text === "High Growth Velocity" && "Budget €10k to €50k. Accelerates acquisition across main channels with balanced performance."}
                                {mood.text === "Aggressive Scaling" && "Budget €50k to €200k. Maximizes acquisition volume and expands marketing channel mix."}
                                {mood.text === "Market Domination" && "Budget over €200k. Heavy brand presence, high volume, and capturing maximum market share."}
                            </p>
                        </TooltipContent>
                    </Tooltip>

                    {/* MASSIVE BUDGET DISPLAY */}
                    <div className="relative text-center">
                        <div className="text-xs uppercase tracking-widest text-slate-400 font-mono mb-1">Monthly Planned Budget</div>
                        <h1 className="text-6xl md:text-7xl font-black text-white tracking-tighter drop-shadow-2xl transition-all duration-300 relative">
                            {symbol}{localBudget.toLocaleString()}
                        </h1>
                    </div>

                    {/* THE GIANT CURSOR (Slider) */}
                    <div className="w-full px-4">
                        <Slider
                            defaultValue={[localBudget]}
                            max={1000000}
                            step={1000}
                            value={[localBudget]}
                            onValueChange={handleSlide}
                            className="cursor-pointer py-4"
                        />
                        <div className="flex justify-between text-xs text-slate-500 mt-2 font-mono uppercase">
                            <span>Min: {symbol}1k</span>
                            <span>Max: {symbol}1M+</span>
                        </div>
                    </div>

                    {/* TARGET CONSTRAINTS COMPLIANCE */}
                    {(cpaTarget || roasTarget) ? (
                        <div className="w-full bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2">
                            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest text-left">
                                Target Constraints Compliance
                            </div>
                            <div className="flex flex-wrap gap-2 w-full">
                                {cpaTarget && (
                                    <div className={cn(
                                        "flex-1 min-w-[130px] rounded-lg p-2 border flex flex-col items-start gap-0.5",
                                        compliance.cpaPct === 100 
                                            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" 
                                            : compliance.cpaPct > 50 
                                                ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-400" 
                                                : "border-red-500/20 bg-red-500/5 text-red-400"
                                    )}>
                                        <span className="text-[10px] text-slate-400 font-medium">Target CPA: {symbol}{cpaTarget}</span>
                                        <span className="text-xs font-bold font-mono">{compliance.cpaPct}% Budget Compliant</span>
                                    </div>
                                )}
                                {roasTarget && (
                                    <div className={cn(
                                        "flex-1 min-w-[130px] rounded-lg p-2 border flex flex-col items-start gap-0.5",
                                        compliance.roasPct === 100 
                                            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" 
                                            : compliance.roasPct > 50 
                                                ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-400" 
                                                : "border-red-500/20 bg-red-500/5 text-red-400"
                                    )}>
                                        <span className="text-[10px] text-slate-400 font-medium">Target ROAS: {roasTarget}x</span>
                                        <span className="text-xs font-bold font-mono">{compliance.roasPct}% Budget Compliant</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs text-slate-500 italic text-center w-full">
                            No active constraints. Define CPA/ROAS targets in the sidebar.
                        </div>
                    )}

                    {/* PRESET TRIGGERS */}
                    <div className="flex flex-wrap justify-center gap-2">
                        {presets.map((amount) => (
                            <button
                                key={amount}
                                onClick={() => handleSlide([amount])}
                                className={cn(
                                    "px-4 py-2 rounded-full border border-slate-700 bg-slate-950/50 text-slate-300 font-medium text-xs transition-all",
                                    "hover:bg-slate-800 hover:border-slate-500 hover:text-white hover:scale-105",
                                    localBudget === amount && "ring-2 ring-blue-500 bg-blue-500/10 text-white border-blue-500"
                                )}
                            >
                                {symbol}{(amount / 1000)}k
                            </button>
                        ))}
                    </div>
                </div>

                {/* RIGHT COLUMN: FORECAST ENGINE */}
                <div className="h-full">
                    <ForecastCard />
                </div>
            </div>
        </div>
    );
};
