import React from 'react';
import { useBlendedMetrics } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Target, TrendingUp, Users, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ForecastCard = () => {
    const { projectedRevenue, blendedCpa, blendedRoas, totalConversions } = useBlendedMetrics();
    const { symbol } = useCurrency();

    return (
        <div className="h-full bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-white">Projected Outcomes</h3>
                    <p className="text-slate-400 text-xs">Based on current allocation</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Est. Revenue */}
                <div className="relative group p-4 rounded-xl bg-slate-900/50 border border-slate-700/50 hover:border-emerald-500/30 transition-all">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-400 text-sm font-medium">Est. Revenue</span>
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="text-3xl font-bold text-white tracking-tight">
                        {symbol}{projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {/* Blended CPA */}
                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 flex flex-col justify-center">
                        <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Blended CPA</div>
                        <div className={cn(
                            "text-xl font-bold",
                            (blendedCpa || 0) < 50 ? "text-emerald-400" : "text-white"
                        )}>
                            {symbol}{blendedCpa?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
                        </div>
                    </div>

                    {/* Blended ROAS */}
                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 flex flex-col justify-center">
                        <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Blended ROAS</div>
                        <div className={cn(
                            "text-xl font-bold",
                            blendedRoas > 3 ? "text-emerald-400" : blendedRoas > 1 ? "text-yellow-400" : "text-red-400"
                        )}>
                            {blendedRoas.toFixed(2)}x
                        </div>
                    </div>

                    {/* Total Conversions */}
                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 flex flex-col justify-center">
                        <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Conversions</div>
                        <div className="text-xl font-bold text-white">
                            {totalConversions.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700/50 text-center">
                <span className="text-xs text-slate-500 italic">
                    *Estimates assume historical performance metrics hold true
                </span>
            </div>
        </div>
    );
};
