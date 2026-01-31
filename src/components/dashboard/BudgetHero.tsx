import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Slider } from '../../components/ui/slider';
import { TrendingUp, Rocket, Crown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { ForecastCard } from './ForecastCard';
import { useBudgetEngine } from '@/hooks/use-budget-engine';

export const BudgetHero = () => {
    // Consolidate Store Access
    // We use useProjectStore for read access to state
    const { totalBudget, channels } = useProjectStore();
    const { updateBudget } = useBudgetEngine();
    const { symbol } = useCurrency();
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
                    <div className={cn("flex items-center gap-2 font-mono text-sm uppercase tracking-widest animate-pulse transition-colors duration-300", mood.color)}>
                        <mood.icon className="w-4 h-4" />
                        {mood.text}
                    </div>

                    {/* MASSIVE BUDGET DISPLAY */}
                    <div className="relative text-center">
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
