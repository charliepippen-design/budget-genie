import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    Wand2,
    Check,
    TrendingUp,
    Users,
    Megaphone,
    Sprout,
    Search,
    Target,
    Zap,
    RefreshCw,
    BarChart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DistributionStrategy, DISTRIBUTION_CONFIG, calculateDistribution } from '@/lib/distribution-logic';
import { ChannelData } from '@/hooks/use-media-plan-store';
import { formatPercentage } from '@/lib/mediaplan-data';

interface DistributionWizardProps {
    channels: ChannelData[];
    onApply: (allocations: Record<string, number>) => void;
    // Controlled props
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    // Legacy props (optional)
    triggerClassName?: string;
    showTrigger?: boolean;
}

// Helper to get icon for strategy
function getStrategyIcon(strategy: DistributionStrategy) {
    switch (strategy) {
        case 'balanced': return <TrendingUp className="h-4 w-4 text-primary" />;
        case 'affiliate_dominant': return <Users className="h-4 w-4 text-purple-500" />;
        case 'influencer_dominant': return <Megaphone className="h-4 w-4 text-pink-500" />;
        case 'hybrid_growth': return <Sprout className="h-4 w-4 text-green-500" />;
        case 'seo_foundation': return <Search className="h-4 w-4 text-emerald-500" />;
        case 'conversion_max': return <Target className="h-4 w-4 text-red-500" />;
        case 'programmatic_blitz': return <Zap className="h-4 w-4 text-orange-500" />;
        case 'retention_ltv': return <RefreshCw className="h-4 w-4 text-blue-500" />;
        default: return <BarChart className="h-4 w-4" />;
    }
}

// Helper for bar visualization widths [blue, purple, pink, orange]
function getBarWidths(strategy: DistributionStrategy): [string, string, string, string] {
    switch (strategy) {
        case 'balanced': return ['25%', '25%', '25%', '25%'];
        case 'affiliate_dominant': return ['10%', '60%', '10%', '20%'];
        case 'influencer_dominant': return ['10%', '10%', '70%', '10%'];
        case 'hybrid_growth': return ['15%', '35%', '35%', '15%'];
        case 'seo_foundation': return ['60%', '20%', '10%', '10%']; // Heavy Blue (SEO/Content)
        case 'conversion_max': return ['10%', '10%', '20%', '60%']; // Heavy Orange (Retargeting/Push)
        case 'programmatic_blitz': return ['20%', '10%', '20%', '50%']; // Mix
        case 'retention_ltv': return ['10%', '50%', '10%', '30%']; // Mix
        default: return ['25%', '25%', '25%', '25%'];
    }
}

export function DistributionWizard({
    channels,
    onApply,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    triggerClassName,
    showTrigger = true
}: DistributionWizardProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [selectedStrategy, setSelectedStrategy] = useState<DistributionStrategy>('balanced');

    // Resolve controlled vs uncontrolled state
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;

    const handleApply = () => {
        // Map ChannelData to the format expected by calculateDistribution
        const logicChannels = channels.map(c => ({
            id: c.id,
            category: c.category,
            family: c.family,
            name: c.name
        }));

        const newAllocations = calculateDistribution(logicChannels, selectedStrategy);
        onApply(newAllocations);
        if (setOpen) setOpen(false);
    };

    // Calculate preview for current selection
    const previewAllocations = calculateDistribution(
        channels.map(c => ({
            id: c.id,
            category: c.category,
            family: c.family,
            name: c.name
        })),
        selectedStrategy
    );

    // Sort channels by allocation to show top winners
    const topChannels = [...channels]
        .sort((a, b) => (previewAllocations[b.id] || 0) - (previewAllocations[a.id] || 0))
        .slice(0, 6);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {showTrigger && (
                <DialogTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-6 px-2 text-xs gap-1.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors",
                            triggerClassName
                        )}
                    >
                        <Wand2 className="h-3 w-3" />
                        Auto-Distribute
                    </Button>
                </DialogTrigger>
            )}

            <DialogContent className="sm:max-w-[800px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-primary" />
                        Budget Distribution Wizard
                    </DialogTitle>
                    <DialogDescription>
                        Choose a strategy to automatically distribute your budget across active channels.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4 grid-cols-[1.5fr_1fr]">
                    <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
                        {(Object.keys(DISTRIBUTION_CONFIG.strategies) as DistributionStrategy[]).map((strategy) => {
                            const config = DISTRIBUTION_CONFIG.strategies[strategy];
                            const isSelected = selectedStrategy === strategy;
                            const widths = getBarWidths(strategy);

                            return (
                                <div
                                    key={strategy}
                                    className={cn(
                                        "cursor-pointer rounded-xl border-2 p-3 transition-all hover:bg-accent/50 relative overflow-hidden",
                                        isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-muted"
                                    )}
                                    onClick={() => setSelectedStrategy(strategy)}
                                >
                                    <div className="flex justify-between items-start mb-1.5">
                                        <div className="flex items-center gap-2">
                                            {getStrategyIcon(strategy)}
                                            <h3 className="font-semibold text-xs capitalize">
                                                {strategy.replace(/_/g, ' ')}
                                            </h3>
                                        </div>
                                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-snug mb-2 line-clamp-2">
                                        {config.description}
                                    </p>

                                    {/* Mini Visualization Bar */}
                                    <div className="h-1.5 w-full flex rounded-full overflow-hidden bg-muted/50 mt-auto">
                                        <div className="h-full bg-blue-500/80" style={{ width: widths[0] }} />
                                        <div className="h-full bg-purple-500/80" style={{ width: widths[1] }} />
                                        <div className="h-full bg-pink-500/80" style={{ width: widths[2] }} />
                                        <div className="h-full bg-orange-500/80" style={{ width: widths[3] }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="rounded-lg border bg-card p-4 h-fit sticky top-0">
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                            <TrendingUp className="h-3 w-3" />
                            Predicted Allocation
                        </h4>
                        <div className="space-y-3">
                            {topChannels.map(ch => (
                                <div key={ch.id} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="truncate opacity-80">{ch.name}</span>
                                        <span className="font-mono font-medium">
                                            {formatPercentage(previewAllocations[ch.id] || 0)}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-500"
                                            style={{ width: `${Math.min(100, (previewAllocations[ch.id] || 0))}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {channels.length > 6 && (
                                <div className="text-[10px] text-muted-foreground pt-2 text-center border-t border-border/50 mt-2">
                                    + {channels.length - 6} smaller channels
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen && setOpen(false)}>Cancel</Button>
                    <Button onClick={handleApply} className="gap-2">
                        <Wand2 className="h-4 w-4" />
                        Apply Distribution
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
