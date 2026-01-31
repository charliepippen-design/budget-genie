import React from 'react';
import {
    TrendingUp,
    TrendingDown,
    Zap,
    Minus,
    Activity,
    BarChart3,
    Rocket,
    LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    useMultiMonthStore,
    ProgressionPattern,
} from '@/hooks/use-multi-month-store';

const PATTERN_INFO: Record<ProgressionPattern, { icon: React.ReactNode; label: string; description: string }> = {
    linear: { icon: <TrendingUp className="h-4 w-4" />, label: 'Linear Growth', description: 'Steady month-over-month budget increase' },
    exponential: { icon: <Zap className="h-4 w-4" />, label: 'Exponential Growth', description: 'Accelerating compound growth' },
    'u-shaped': { icon: <Activity className="h-4 w-4" />, label: 'U-Shaped (Valley)', description: 'Low spend in middle, high at start & end' },
    'inverse-u': { icon: <TrendingDown className="h-4 w-4" />, label: 'Inverse-U (Peak)', description: 'High spend early, declining over time' },
    seasonal: { icon: <BarChart3 className="h-4 w-4" />, label: 'Seasonal Pattern', description: 'Repeating cycle with peaks' },
    step: { icon: <LayoutGrid className="h-4 w-4" />, label: 'Step Function', description: 'Budget plateaus, then jumps' },
    'aggressive-launch': { icon: <Rocket className="h-4 w-4" />, label: 'Aggressive Launch', description: 'High initial spend, then stabilize' },
    flat: { icon: <Minus className="h-4 w-4" />, label: 'Flat (Constant)', description: 'Same budget every month' },
    custom: { icon: <LayoutGrid className="h-4 w-4" />, label: 'Custom Curve', description: 'Manual month multipliers' },
};

export function ProgressionPatternSelector() {
    const {
        progressionPattern,
        setProgressionPattern,
        applyPattern,
    } = useMultiMonthStore();

    return (
        <Card className="border-border bg-card/50 mt-6">
            <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-foreground">Distribution Curve</Label>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={applyPattern}
                        className="h-7 text-xs gap-1"
                    >
                        <TrendingUp className="h-3 w-3" />
                        Apply to All
                    </Button>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
                    <TooltipProvider>
                        {(Object.keys(PATTERN_INFO) as ProgressionPattern[]).map((pattern) => {
                            const info = PATTERN_INFO[pattern];
                            return (
                                <Tooltip key={pattern}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() => {
                                                setProgressionPattern(pattern);
                                                setTimeout(() => applyPattern(), 0);
                                            }}
                                            className={cn(
                                                "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                                                progressionPattern === pattern
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {info.icon}
                                            <span className="text-[10px] leading-tight text-center line-clamp-1">
                                                {info.label.split(' ')[0]}
                                            </span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[200px]">
                                        <p className="font-medium">{info.label}</p>
                                        <p className="text-xs text-muted-foreground">{info.description}</p>
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </TooltipProvider>
                </div>
            </CardContent>
        </Card>
    );
}
