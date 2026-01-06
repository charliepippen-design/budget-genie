import { useCallback, useMemo, useState } from 'react';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Zap,
  Minus,
  Activity,
  BarChart3,
  Rocket,
  LayoutGrid,
  Upload,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  useMultiMonthStore,
  ProgressionPattern,
} from '@/hooks/use-multi-month-store';
import { ImportWizard } from './ImportWizard';
import { CurrencySelector } from '@/components/common/CurrencySelector';

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

export function MonthConfigPanel() {
  const [importOpen, setImportOpen] = useState(false);
  
  const {
    includeSoftLaunch,
    planningMonths,
    startMonth,
    progressionPattern,
    setIncludeSoftLaunch,
    setPlanningMonths,
    setStartMonth,
    setProgressionPattern,
    applyPattern,
    months,
  } = useMultiMonthStore();

  const totalMonths = planningMonths + (includeSoftLaunch ? 1 : 0);

  const dateRange = useMemo(() => {
    if (months.length === 0) return '';
    const first = months[0]?.label.replace(' (Soft Launch)', '');
    const last = months[months.length - 1]?.label.replace(' (Soft Launch)', '');
    return `${first} - ${last}`;
  }, [months]);

  const generateMonthOptions = useCallback(() => {
    const options = [];
    const now = new Date();
    for (let i = -3; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = date.toISOString().slice(0, 7);
      const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
      options.push({ value, label });
    }
    return options;
  }, []);

  const monthOptions = generateMonthOptions();

  return (
    <>
      <Card className="border-border bg-card/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Duration */}
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium text-foreground whitespace-nowrap">Plan Duration</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="soft-launch"
                    checked={includeSoftLaunch}
                    onCheckedChange={(checked) => setIncludeSoftLaunch(checked === true)}
                  />
                  <Label htmlFor="soft-launch" className="text-xs text-muted-foreground cursor-pointer">
                    Include Soft Launch
                  </Label>
                </div>
                <Select
                  value={planningMonths.toString()}
                  onValueChange={(v) => setPlanningMonths(parseInt(v))}
                >
                  <SelectTrigger className="w-24 h-8 text-sm bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} months
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Month */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm text-muted-foreground">Start:</Label>
                <Select value={startMonth} onValueChange={setStartMonth}>
                  <SelectTrigger className="w-40 h-8 text-sm bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Total Display */}
              <Badge variant="secondary" className="px-3 py-1 text-sm">
                Total: {totalMonths} months
              </Badge>
              {dateRange && (
                <span className="text-xs text-muted-foreground hidden lg:inline">
                  ({dateRange})
                </span>
              )}
            </div>
            
            {/* Currency + Import */}
            <div className="flex items-center gap-2">
              <CurrencySelector compact />
              <Button
                variant="default"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Import Genius
              </Button>
            </div>
          </div>

          {/* Progression Pattern */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">Progression Pattern</Label>
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
                          onClick={() => setProgressionPattern(pattern)}
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
          </div>
        </CardContent>
      </Card>
      
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
