import React, { useState, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wand2, Users, TrendingUp, Scale, Zap, ArrowRight } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { ChannelData, ChannelCategory } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { CATEGORY_INFO } from '@/lib/mediaplan-data';

interface BudgetWizardProps {
    trigger?: React.ReactNode;
}

type StrategyType = 'BALANCED' | 'AFFILIATE_DOM' | 'INFLUENCER_DOM' | 'HYBRID_GROWTH' | null;

const STRATEGIES: { id: StrategyType; name: string; icon: React.ElementType; description: string; color: string }[] = [
    {
        id: 'BALANCED',
        name: 'Balanced Distribution',
        icon: Scale,
        description: 'Equal budget allocation across all active channels.',
        color: 'text-blue-400'
    },
    {
        id: 'AFFILIATE_DOM',
        name: 'Affiliate Dominant',
        icon: Users,
        description: '60% of budget allocated to Affiliate channels.',
        color: 'text-indigo-400'
    },
    {
        id: 'INFLUENCER_DOM',
        name: 'Influencer Dominant',
        icon: Zap,
        description: '60% of budget allocated to Influencer (Paid Social) channels.',
        color: 'text-pink-400'
    },
    {
        id: 'HYBRID_GROWTH',
        name: 'Hybrid Growth',
        icon: TrendingUp,
        description: 'Mix of Paid Media (40%) and Affiliate (40%) for rapid scale.',
        color: 'text-green-400'
    }
];

export const BudgetWizard: React.FC<BudgetWizardProps> = ({ trigger }) => {
    const { channels, setChannels } = useProjectStore();
    const [open, setOpen] = useState(false);
    const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>(null);

    // LOGIC: Calculate Allocations
    const proposedChannels = useMemo(() => {
        if (!selectedStrategy || channels.length === 0) return channels;

        // Deep copy to avoid mutating state directly in calc
        let next = JSON.parse(JSON.stringify(channels)) as ChannelData[];
        const totalChannels = next.length;

        if (selectedStrategy === 'BALANCED') {
            const share = 100 / totalChannels;
            next.forEach(ch => ch.allocationPct = share);
        }
        else if (selectedStrategy === 'AFFILIATE_DOM') {
            const affiliates = next.filter(ch => ch.category === 'Affiliate');
            const others = next.filter(ch => ch.category !== 'Affiliate');

            if (affiliates.length > 0) {
                const affShare = 60 / affiliates.length;
                affiliates.forEach(ch => ch.allocationPct = affShare);

                const otherShare = others.length > 0 ? 40 / others.length : 0;
                others.forEach(ch => ch.allocationPct = otherShare);
            } else {
                // Fallback if no affiliates
                next.forEach(ch => ch.allocationPct = 100 / totalChannels);
            }
        }
        else if (selectedStrategy === 'INFLUENCER_DOM') {
            const influencers = next.filter(ch => ch.category === 'Paid Social');
            const others = next.filter(ch => ch.category !== 'Paid Social');

            if (influencers.length > 0) {
                const infShare = 60 / influencers.length;
                influencers.forEach(ch => ch.allocationPct = infShare);

                const otherShare = others.length > 0 ? 40 / others.length : 0;
                others.forEach(ch => ch.allocationPct = otherShare);
            } else {
                next.forEach(ch => ch.allocationPct = 100 / totalChannels);
            }
        }
        else if (selectedStrategy === 'HYBRID_GROWTH') {
            // 40% Paid Media (Display/Prog/Search), 40% Affiliate, 20% Other
            const paid = next.filter(ch => ['Display/Programmatic', 'Paid Search'].includes(ch.category));
            const aff = next.filter(ch => ch.category === 'Affiliate');
            const others = next.filter(ch => !['Display/Programmatic', 'Paid Search', 'Affiliate'].includes(ch.category));

            // Distribute 40% to Paid
            if (paid.length > 0) {
                const share = 40 / paid.length;
                paid.forEach(ch => ch.allocationPct = share);
            }

            // Distribute 40% to Affiliate
            if (aff.length > 0) {
                const share = 40 / aff.length;
                aff.forEach(ch => ch.allocationPct = share);
            }

            // Normalize remaining budget (20% or more if categories missing)
            let allocated = 0;
            if (paid.length > 0) allocated += 40;
            if (aff.length > 0) allocated += 40;

            const remainingPct = 100 - allocated;

            if (others.length > 0) {
                const share = remainingPct / others.length;
                others.forEach(ch => ch.allocationPct = share);
            } else {
                // If "Others" is empty, we redistribute remaining to existing groups? 
                // For simplicity, let's just leave it (technically unlikely to happen with valid data)
                // But effectively we should probably re-normalize at the end to be safe.
            }
        }

        // Safety Normalization
        const totalAlloc = next.reduce((sum, ch) => sum + ch.allocationPct, 0);
        if (totalAlloc > 0 && Math.abs(totalAlloc - 100) > 0.1) {
            const factor = 100 / totalAlloc;
            next.forEach(ch => ch.allocationPct *= factor);
        }

        return next;
    }, [selectedStrategy, channels]);

    const handleApply = () => {
        if (selectedStrategy) {
            setChannels(proposedChannels);
            setOpen(false);
            setSelectedStrategy(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="max-w-3xl bg-slate-950 border-slate-800 text-slate-100">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Wand2 className="w-5 h-5 text-indigo-400" />
                        Budget Distribution Wizard
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Automatically redistribute your budget based on proven strategic models.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">

                    {/* LEFT: Strategy Selection */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Select Strategy</h4>
                        <div className="space-y-2">
                            {STRATEGIES.map(strategy => (
                                <div
                                    key={strategy.id}
                                    onClick={() => setSelectedStrategy(strategy.id as StrategyType)}
                                    className={cn(
                                        "p-3 rounded-xl border cursor-pointer transition-all hover:bg-slate-900",
                                        selectedStrategy === strategy.id
                                            ? "bg-slate-900 border-indigo-500/50 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]"
                                            : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn("p-2 rounded-lg bg-slate-950 border border-slate-800", strategy.color)}>
                                            <strategy.icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className={cn("font-medium text-sm", strategy.color)}>{strategy.name}</p>
                                            <p className="text-xs text-slate-500 line-clamp-1">{strategy.description}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT: Preview */}
                    <div className="bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
                        <div className="p-3 border-b border-slate-800 bg-slate-900">
                            <h4 className="text-sm font-medium text-slate-300">Allocation Preview</h4>
                        </div>

                        <ScrollArea className="flex-1 max-h-[300px]">
                            <div className="p-3 space-y-2">
                                {!selectedStrategy ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10 opacity-60">
                                        <Wand2 className="w-10 h-10 mb-3 text-slate-700" />
                                        <p className="text-sm">Select a strategy to preview changes</p>
                                    </div>
                                ) : (
                                    proposedChannels.map(ch => {
                                        const current = channels.find(c => c.id === ch.id);
                                        const isChange = Math.abs(ch.allocationPct - (current?.allocationPct || 0)) > 0.1;

                                        return (
                                            <div key={ch.id} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: CATEGORY_INFO[ch.category]?.color || '#64748b' }}
                                                    />
                                                    <span className="truncate text-slate-300 max-w-[120px]">{ch.name}</span>
                                                </div>

                                                <div className="flex items-center gap-3 font-mono text-xs">
                                                    <span className="text-slate-500">{(current?.allocationPct || 0).toFixed(1)}%</span>
                                                    <ArrowRight className="w-3 h-3 text-slate-600" />
                                                    <span className={cn(
                                                        "font-semibold",
                                                        isChange ? "text-indigo-400" : "text-slate-400"
                                                    )}>
                                                        {ch.allocationPct.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleApply}
                        disabled={!selectedStrategy}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        Apply Distribution
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
