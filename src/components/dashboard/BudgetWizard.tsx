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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'; // Assuming shadcn tabs exist or using custom
import { Wand2, Shield, Skull, Zap, Users, AlertTriangle } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { ChannelData, ChannelCategory } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { CATEGORY_INFO } from '@/lib/mediaplan-data';
import { REGULATED_STRATEGIES, UNREGULATED_STRATEGIES, StrategyDef } from '@/lib/wizard-strategies';

interface BudgetWizardProps {
    isOpen?: boolean; // Made optional for Uncontrolled mode
    onClose?: () => void; // Made optional
    trigger?: React.ReactNode; // New trigger support
}

export const BudgetWizard: React.FC<BudgetWizardProps> = ({ isOpen: controlledOpen, onClose: controlledClose, trigger }) => {
    // FULL IMPLEMENTATION
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = typeof controlledOpen !== 'undefined';
    const isOpen = isControlled ? controlledOpen : internalOpen;

    const { channels, setAllocations } = useProjectStore();
    const [activeTab, setActiveTab] = useState('regulated');

    const handleOpenChange = (open: boolean) => {
        if (isControlled) {
            if (!open) controlledClose?.();
        } else {
            setInternalOpen(open);
        }
    };

    const handleApplyStrategy = (strategy: StrategyDef) => {
        // 1. Group Channels by Category
        const channelsByCategory: Record<string, string[]> = {};
        channels.forEach(ch => {
            if (!channelsByCategory[ch.category]) channelsByCategory[ch.category] = [];
            channelsByCategory[ch.category].push(ch.id);
        });

        const newAllocations: Record<string, number> = {};

        // 2. Distribute Budget
        Object.entries(strategy.distribution).forEach(([category, targetPct]) => {
            const categoryChannels = channelsByCategory[category] || [];
            if (categoryChannels.length === 0) return;

            // Simple even distribution within category for now
            const perChannel = targetPct / categoryChannels.length;
            categoryChannels.forEach(id => {
                newAllocations[id] = perChannel;
            });
        });

        // 3. Handle Categories NOT in the strategy (set to 0 or leave?)
        // Strategy implies total control, so we should zero out others to normalize correctly?
        // Let's assume the distribution sums to 100%. If not, normalization in store handles it.
        // We only set what is defined. The store's setAllocations uses a merge strategy, 
        // so we need to be careful. The current store implementation update only touched IDs.
        // To be safe and "take over", really we should probably zero everything else or 
        // rely on `setAllocations` being comprehensive. 
        // 
        // Let's explicitly set 0 for known channels not in the target set to ensure clean switch.
        channels.forEach(ch => {
            if (newAllocations[ch.id] === undefined) {
                newAllocations[ch.id] = 0;
            }
        });

        setAllocations(newAllocations);
        handleOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="bg-[#0f172a] border-slate-700 text-slate-100 max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-slate-800 bg-[#020617]">
                    <div className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-indigo-400" />
                        <DialogTitle className="text-xl font-bold tracking-tight">Budget Wizard: Master Edition</DialogTitle>
                    </div>
                    <DialogDescription className="text-slate-400">
                        Select a specialized allocation strategy to instantly rebalance your portfolio.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="flex-1 overflow-hidden flex flex-col md:flex-row h-full">
                    {/* Sidebar / Tabs */}
                    <TabsList className="w-full md:w-64 flex-shrink-0 flex-col h-full justify-start rounded-none border-r border-slate-800 bg-[#0f172a] p-4 gap-2">
                        <TabsTrigger value="regulated" className="w-full justify-start data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-400">
                            <Shield className="w-4 h-4 mr-2" />
                            Regulated Markets
                        </TabsTrigger>
                        <TabsTrigger value="unregulated" className="w-full justify-start data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-400">
                            <Zap className="w-4 h-4 mr-2" />
                            Unregulated / Grey
                        </TabsTrigger>

                    </TabsList>

                    {/* Content Area */}
                    <ScrollArea className="flex-1 bg-[#020617] p-6">
                        <TabsContent value="regulated" className="mt-0 space-y-4">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold text-white mb-1">Standard Strategies</h3>
                                <p className="text-sm text-slate-400">Safe, balanced approaches for compliant industries (E-comm, SaaS, Local).</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {REGULATED_STRATEGIES.map(strategy => (
                                    <StrategyCard key={strategy.id} strategy={strategy} onApply={() => handleApplyStrategy(strategy)} />
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="unregulated" className="mt-0 space-y-6">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold text-white mb-1">Vertical Specific</h3>
                                <p className="text-sm text-slate-400">High-variance strategies for Casino, Crypto, Nutra, and Adult.</p>
                            </div>

                            {Object.entries(UNREGULATED_STRATEGIES).map(([vertical, strategies]) => (
                                <div key={vertical} className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="border-indigo-500/30 text-indigo-400">{vertical}</Badge>
                                        <div className="h-px bg-slate-800 flex-1" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {strategies.map(strategy => (
                                            <StrategyCard key={strategy.id} strategy={strategy} vertical={vertical} onApply={() => handleApplyStrategy(strategy)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </TabsContent>
                    </ScrollArea>
                </Tabs>
            </DialogContent>
        </Dialog >
    );
};

// Helper Component for the Card
const StrategyCard: React.FC<{ strategy: StrategyDef; vertical?: string; onApply: () => void }> = ({ strategy, vertical, onApply }) => {
    const Icon = strategy.icon || Wand2;

    return (
        <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] p-4 transition-all hover:border-indigo-500/50 hover:bg-[#1e293b]">
            {/* Hover Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 opacity-0 transition-opacity group-hover:opacity-100" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 border border-slate-700 text-indigo-400 group-hover:text-indigo-300 group-hover:border-indigo-500/50">
                            <Icon className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-slate-100">{strategy.name}</h4>
                            {vertical && <span className="text-[10px] text-slate-500 uppercase tracking-wider">{vertical}</span>}
                        </div>
                    </div>
                </div>

                <p className="text-xs text-slate-400 mb-4 line-clamp-2 min-h-[2.5em]">
                    {strategy.description}
                </p>

                {/* Distribution Mini-Bar */}
                <div className="space-y-1.5 mb-4">
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        {Object.entries(strategy.distribution).map(([cat, pct], i) => (
                            <div
                                key={cat}
                                style={{ width: `${pct}%`, backgroundColor: CATEGORY_INFO[cat as ChannelCategory]?.color || '#94a3b8' }}
                                className="h-full"
                            />
                        ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Distribution Preview</span>
                        <span className="font-mono">{Object.keys(strategy.distribution).length} Cats</span>
                    </div>
                </div>

                <Button onClick={onApply} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white h-9">
                    Apply Strategy
                </Button>
            </div>
        </div>
    );
};
