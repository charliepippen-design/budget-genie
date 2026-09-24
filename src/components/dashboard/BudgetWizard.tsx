import React, { useState, useMemo } from 'react';
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription 
} from '@/components/ui/dialog';
import { 
    ResponsiveContainer, ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from 'recharts';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
    Wand2, TrendingUp, Calendar, Zap, AlertTriangle, 
    ArrowUpRight, ArrowDownRight, Coins, Bot, Activity, Database 
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useMediaPlanStore, calculateChannelMetrics } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { useUser } from '@/lib/auth';
import { PaywallModal } from './PaywallModal';

interface BudgetWizardProps {
    isOpen?: boolean;
    onClose?: () => void;
    trigger?: React.ReactNode;
}

export const BudgetWizard: React.FC<BudgetWizardProps> = ({ isOpen: controlledOpen, onClose: controlledClose, trigger }) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = typeof controlledOpen !== 'undefined';
    const isOpen = isControlled ? controlledOpen : internalOpen;

    const { channels, globalMultipliers, devDeityMode, applyArbitrageRebalance } = useMediaPlanStore();
    const { totalBudget } = useProjectStore();

    const handleArbitrage = () => {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (user?.publicMetadata?.tier !== 'DEITY' && !devDeityMode && !isLocal) {
            setIsPaywallOpen(true);
            return;
        }
        applyArbitrageRebalance();
    };

    // Forecasting Control States
    const [months, setMonths] = useState(6);
    const [budgetGrowth, setBudgetGrowth] = useState(5); // %
    const [ltvGrowth, setLtvGrowth] = useState(-2); // %

    const { user } = useUser();
    const [isPaywallOpen, setIsPaywallOpen] = useState(false);

    const handleOpenChange = (open: boolean) => {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (open && user?.publicMetadata?.tier !== 'DEITY' && !devDeityMode && !isLocal) {
            setIsPaywallOpen(true);
            return;
        }

        if (isControlled) {
            if (!open) controlledClose?.();
        } else {
            setInternalOpen(open);
        }
    };

    // Currency Formatter
    const money = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);

    // Predictive Array Engine (Executes dynamically without touching Zustand store)
    const projections = useMemo(() => {
        const results = [];
        let cumulativeRevenue = 0;
        let cumulativeSpend = 0;
        let cumulativeFtds = 0;

        for (let m = 1; m <= months; m++) {
            const growthFactor = Math.pow(1 + budgetGrowth / 100, m - 1);
            const ltvFactor = Math.pow(1 + ltvGrowth / 100, m - 1);

            const activeBudget = totalBudget * growthFactor;

            let mSpend = 0;
            let mRevs = 0;
            let mFtds = 0;

            channels.forEach(ch => {
                // Dynamically mutate LTV explicitly for this specific projection iteration
                const baseLtv = ch.typeConfig?.baselineMetrics?.expectedLtv || globalMultipliers.playerValue;
                const mutatedCh = {
                    ...ch,
                    typeConfig: {
                        ...ch.typeConfig,
                        baselineMetrics: {
                            ...ch.typeConfig?.baselineMetrics,
                            expectedLtv: baseLtv * ltvFactor
                        }
                    }
                };
                
                // Re-run the core metric normalization strictly for forecasting display
                const metrics = calculateChannelMetrics(mutatedCh, activeBudget, globalMultipliers);
                mSpend += metrics.spend;
                mRevs += metrics.revenue;
                mFtds += metrics.conversions;
            });

            cumulativeSpend += mSpend;
            cumulativeRevenue += mRevs;
            cumulativeFtds += mFtds;

            results.push({
                month: m,
                spend: mSpend,
                conversions: mFtds,
                revenue: mRevs,
                cpa: mFtds > 0 ? mSpend / mFtds : 0,
                roas: mSpend > 0 ? mRevs / mSpend : 0,
                cumulativeRevenue,
                cumulativeSpend,
                avgLtv: mFtds > 0 ? mRevs / mFtds : 0,
            });
        }
        return results;
    }, [months, budgetGrowth, ltvGrowth, channels, totalBudget, globalMultipliers]);

    const totalRoi = projections.length > 0 ? (projections[projections.length - 1].cumulativeRevenue / projections[projections.length - 1].cumulativeSpend) * 100 : 0;

    return (
        <>
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col bg-[#020617] border-slate-800 p-0 overflow-hidden shadow-2xl">
                
                {/* Header Strip */}
                <DialogHeader className="p-6 border-b border-slate-800 bg-slate-950 flex flex-row items-center justify-between shadow-md z-10">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600/20 rounded-lg border border-indigo-500/50 relative">
                                <Zap className="w-5 h-5 text-indigo-400 absolute opacity-50 blur-sm" />
                                <Zap className="w-5 h-5 text-indigo-300 relative z-10" />
                            </div>
                            <DialogTitle className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                                Budget Wizard <span className="text-indigo-400 font-mono text-xl opacity-90 mx-1">|</span> Master Edition
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-slate-400 mt-1 ml-12 text-sm max-w-lg">
                            Multi-month predictive forecasting engine. Compounding metrics run fully localized in memory.
                        </DialogDescription>
                    </div>
                    
                    <div className="hidden lg:flex gap-6 text-right items-center">
                        <Button variant="secondary" size="sm" className="bg-violet-700/20 hover:bg-violet-600" onClick={handleArbitrage}>
                            Agentic Arbitrage
                        </Button>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800/50 flex flex-col font-mono text-sm leading-tight text-slate-300">
                            <span className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Projected LTV</span>
                            <span className="text-green-400 font-bold">{money(projections[projections.length - 1]?.avgLtv || 0)}</span>
                        </div>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800/50 flex flex-col font-mono text-sm leading-tight text-slate-300">
                            <span className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Projected ROI</span>
                            <span className="text-indigo-300 font-bold">{totalRoi.toFixed(0)}%</span>
                        </div>
                        <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-500/30 flex flex-col font-mono text-sm leading-tight text-white shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                            <span className="text-[10px] text-indigo-300 mb-0.5 uppercase tracking-wider flex items-center gap-1"><Coins className="w-3 h-3"/> Cumulative Revenue</span>
                            <span className="text-xl font-black text-white">{money(projections[projections.length - 1]?.cumulativeRevenue || 0)}</span>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                    {/* Controls Sidebar */}
                    <div className="w-full lg:w-80 bg-slate-900/50 border-r border-slate-800 p-6 flex flex-col overflow-y-auto">
                        <h4 className="text-sm font-semibold tracking-wider uppercase text-slate-500 mb-6 flex items-center gap-2">
                            <Wand2 className="w-4 h-4"/> Trajectory Settings
                        </h4>

                        <div className="space-y-8">
                            {/* Length Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-slate-200 flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-400"/> Timeline (Months)</label>
                                    <span className="font-mono text-sm text-indigo-400 font-bold bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/30">{months} MO</span>
                                </div>
                                <input 
                                    type="range" min="1" max="12" step="1" 
                                    value={months} onChange={(e) => setMonths(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <p className="text-xs text-slate-500">Fixed hard limit at 12M per industry spec.</p>
                            </div>

                            <hr className="border-slate-800"/>

                            {/* MoM Budget Growth Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-slate-200 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400"/> MoM Budget Growth</label>
                                    <span className="font-mono text-sm font-bold bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-green-400">
                                        {budgetGrowth > 0 ? '+' : ''}{budgetGrowth}%
                                    </span>
                                </div>
                                <input 
                                    type="range" min="-20" max="50" step="1" 
                                    value={budgetGrowth} onChange={(e) => setBudgetGrowth(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                                />
                                <p className="text-xs text-slate-500 leading-tight">Increases global baseline spend allocation uniformly month-over-month.</p>
                            </div>

                            <hr className="border-slate-800"/>

                            {/* MoM LTV Decay Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                                        {ltvGrowth < 0 ? <ArrowDownRight className="w-4 h-4 text-red-400"/> : <ArrowUpRight className="w-4 h-4 text-indigo-400"/>} 
                                        MoM LTV Curve
                                    </label>
                                    <span className={cn(
                                        "font-mono text-sm font-bold bg-slate-800 px-2 py-0.5 rounded border border-slate-700",
                                        ltvGrowth < 0 ? "text-red-400" : "text-indigo-400"
                                    )}>
                                        {ltvGrowth > 0 ? '+' : ''}{ltvGrowth}%
                                    </span>
                                </div>
                                <input 
                                    type="range" min="-20" max="20" step="1" 
                                    value={ltvGrowth} onChange={(e) => setLtvGrowth(parseInt(e.target.value))}
                                    className={cn(
                                        "w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer",
                                        ltvGrowth < 0 ? "accent-red-500" : "accent-indigo-500"
                                    )}
                                />
                                <p className="text-xs text-slate-500 leading-tight">Applies linear multiplicative growth/decay natively to your strict custom Month 1 baseline overrides.</p>
                            </div>
                        </div>

                    </div>

                    {/* Output Area */}
                    <ScrollArea className="flex-1 bg-slate-950 p-6 overflow-x-auto relative z-0">
                        <div className="min-w-[800px] space-y-8">
                            
                            {/* Visual Projection Chart */}
                            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-green-500 opacity-50" />
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-indigo-400"/> Growth Trajectory Visualizer
                                    </h3>
                                    <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                                        <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 font-mono bg-indigo-500/5">Revenue (Compounding)</Badge>
                                        <Badge variant="outline" className="border-green-500/30 text-green-300 font-mono bg-green-500/5">FTD Volume</Badge>
                                    </div>
                                </div>

                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={projections} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                                            <XAxis 
                                                dataKey="month" 
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={{ stroke: '#1e293b' }}
                                                tickFormatter={(v) => `MO ${v}`}
                                            />
                                            <YAxis 
                                                yAxisId="left"
                                                tick={{ fill: '#64748b', fontSize: 10 }}
                                                axisLine={false}
                                                tickFormatter={(v) => `€${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`}
                                            />
                                            <YAxis 
                                                yAxisId="right"
                                                orientation="right"
                                                tick={{ fill: '#64748b', fontSize: 10 }}
                                                axisLine={false}
                                                tickFormatter={(v) => v}
                                            />
                                            <Tooltip 
                                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                                                labelStyle={{ color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}
                                                itemStyle={{ fontSize: '12px' }}
                                                formatter={(value: any, name: string) => {
                                                    if (name.includes('Rev') || name.includes('Spend')) return [money(value), name];
                                                    return [value.toFixed(0), name];
                                                }}
                                            />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                            
                                            <Area 
                                                yAxisId="left"
                                                type="monotone" 
                                                dataKey="cumulativeRevenue" 
                                                name="Cumulative Revenue"
                                                stroke="#6366f1" 
                                                strokeWidth={3}
                                                fillOpacity={1} 
                                                fill="url(#colorRev)" 
                                                animationDuration={1500}
                                            />
                                            <Bar 
                                                yAxisId="left"
                                                dataKey="monthlySpend" 
                                                name="Monthly Spend"
                                                fill="#334155" 
                                                radius={[4, 4, 0, 0]} 
                                                barSize={30}
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Database className="w-5 h-5 text-slate-400"/> Compounding Projection Matrix
                                </h3>
                            </div>
                            
                            <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-xl">
                                <table className="w-full text-sm text-left relative">
                                    <thead className="bg-slate-950/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                                        <tr>
                                            <th className="px-5 py-4 w-20 text-center">Month</th>
                                            <th className="px-5 py-4">Est. Spend</th>
                                            <th className="px-5 py-4">Total FTDs</th>
                                            <th className="px-5 py-4">Blended CPA</th>
                                            <th className="px-5 py-4">Est. Revenue</th>
                                            <th className="px-5 py-4 text-right bg-indigo-950/20 text-indigo-300 font-bold border-l border-indigo-900/30">Cumulative Rev</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {projections.map((row, idx) => (
                                            <tr key={row.month} className="hover:bg-slate-800/40 transition-colors group">
                                                <td className="px-5 py-4 font-mono text-center">
                                                    <span className={cn(
                                                        "inline-flex items-center justify-center w-6 h-6 rounded-md",
                                                        idx === 0 ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "bg-slate-800 text-slate-400"
                                                    )}>
                                                        {row.month}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-slate-300 font-mono">
                                                    {money(row.spend)}
                                                    {idx > 0 && budgetGrowth !== 0 && (
                                                        <span className={cn("ml-2 text-[10px]", budgetGrowth > 0 ? "text-green-500/70" : "text-red-500/70")}>
                                                            {budgetGrowth > 0 ? '↑' : '↓'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 font-mono text-slate-300">
                                                    {Math.floor(row.conversions).toLocaleString('en-US')}
                                                </td>
                                                <td className="px-5 py-4 font-mono">
                                                    {row.cpa > 0 ? (
                                                        <span className="text-red-300">{money(row.cpa)}</span>
                                                    ) : <span className="text-slate-600">-</span>}
                                                </td>
                                                <td className="px-5 py-4 font-mono text-slate-300">
                                                    {money(row.revenue)}
                                                </td>
                                                <td className="px-5 py-4 text-right font-mono font-bold bg-indigo-950/10 text-white border-l border-indigo-900/30 group-hover:bg-indigo-950/30">
                                                    {money(row.cumulativeRevenue)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Summary Notes */}
                            <div className="mt-8 flex gap-6 text-sm">
                                <div className="flex items-start gap-2 max-w-sm">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <p className="text-slate-500 leading-relaxed text-xs">
                                        <strong className="text-slate-300">Baseline Lock:</strong> Month 1 metrics precisely map to your active global store calculations.
                                    </p>
                                </div>
                                <div className="flex items-start gap-2 max-w-sm">
                                    <Bot className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                                    <p className="text-slate-500 leading-relaxed text-xs">
                                        <strong className="text-slate-300">Stateless Execution:</strong> Values calculated inline via `useMemo` strictly mapping UI axes to prevent any global variable leakages.
                                    </p>
                                </div>
                            </div>

                        </div>
                    </ScrollArea>
                </div>

            </DialogContent>
        </Dialog>
        <PaywallModal isOpen={isPaywallOpen} onClose={() => setIsPaywallOpen(false)} featureName="Budget Wizard: Master Edition" />
        </>
    );
};

