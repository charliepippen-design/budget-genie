import { Button } from '@/components/ui/button';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { optimizeBudget } from '@/lib/optimization-logic';
import { useToast } from '@/components/ui/use-toast';
import { Wand2 } from 'lucide-react';

export function OptimizationControls() {
    const { channels, totalBudget, globalMultipliers, setChannels, normalizeAllocations } = useMediaPlanStore();
    const { toast } = useToast();

    const handleSmartOptimize = () => {
        const result = optimizeBudget(channels, totalBudget, globalMultipliers);

        // Check if changes occurred
        if (result.changes.freedAllocation > 0) {
            setChannels(result.channels);
            // Ensure normalization runs to be safe, though utility does it.
            normalizeAllocations();

            toast({
                title: "Optimization Complete",
                description: `Reallocated ${(result.changes.freedAllocation).toFixed(1)}% spend from underperforming channels.`,
            });
        } else {
            toast({
                title: "No Optimizations Needed",
                description: "Your budget allocation looks good based on current targets!",
            });
        }
    };

    const hasTargets = globalMultipliers.cpaTarget || globalMultipliers.roasTarget;

    if (!hasTargets) return null;

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleSmartOptimize}
            className="w-full border-dashed border-indigo-500/50 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
        >
            <Wand2 className="w-4 h-4 mr-2" />
            Auto-Fix Allocations
        </Button>
    );
}
