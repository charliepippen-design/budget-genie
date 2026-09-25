import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { LayoutGrid, Upload, Sparkles, Calendar } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toMonthValue, useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { CurrencySelector } from '@/components/common/CurrencySelector';

const ImportWizard = lazy(() =>
  import('./ImportWizard').then((m) => ({ default: m.ImportWizard }))
);

// PATTERN_INFO moved to ProgressionPatternSelector.tsx

export function MonthConfigPanel() {
  const [importOpen, setImportOpen] = useState(false);

  const {
    includeSoftLaunch,
    planningMonths,
    startMonth,
    setIncludeSoftLaunch,
    setPlanningMonths,
    setStartMonth,
    months,
    monthsCustomized,
    generateMonths,
  } = useMultiMonthStore();

  // Months follow the main plan until the user edits a month by hand.
  const planBudget = useMediaPlanStore((s) => s.totalBudget);
  const planChannels = useMediaPlanStore((s) => s.channels);
  const [planChangedSinceEdit, setPlanChangedSinceEdit] = useState(false);
  const firstRun = useRef(true);
  useEffect(() => {
    const isFirst = firstRun.current;
    firstRun.current = false;
    if (months.length === 0 || !monthsCustomized) {
      generateMonths();
    } else if (!isFirst) {
      setPlanChangedSinceEdit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to plan changes only
  }, [planBudget, planChannels]);

  const confirmRebuild = () =>
    !monthsCustomized ||
    window.confirm('This rebuilds all months and discards your per-month edits. Continue?');

  const totalMonths = planningMonths + (includeSoftLaunch ? 1 : 0);

  const dateRange = useMemo(() => {
    if (months.length === 0) return '';
    const first = months[0]?.label.replace(' (Soft Launch)', '');
    const last = months[months.length - 1]?.label.replace(' (Soft Launch)', '');
    return `${first} - ${last}`;
  }, [months]);

  const generateMonthOptions = useCallback(() => {
    const options: Array<{ value: string; label: string }> = [];
    const now = new Date();
    for (let i = -3; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = toMonthValue(date);
      const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
        date
      );
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
                <Label className="text-sm font-medium text-foreground whitespace-nowrap">
                  Plan Duration
                </Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="soft-launch"
                    checked={includeSoftLaunch}
                    onCheckedChange={(checked) => confirmRebuild() && setIncludeSoftLaunch(checked === true)}
                  />
                  <Label
                    htmlFor="soft-launch"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Include Soft Launch
                  </Label>
                </div>
                <Select
                  value={planningMonths.toString()}
                  onValueChange={(v) => confirmRebuild() && setPlanningMonths(parseInt(v))}
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
                <Select value={startMonth} onValueChange={(v) => confirmRebuild() && setStartMonth(v)}>
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

              {planChangedSinceEdit && monthsCustomized && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (confirmRebuild()) {
                      generateMonths();
                      setPlanChangedSinceEdit(false);
                    }
                  }}
                >
                  Plan changed: resync months
                </Button>
              )}

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

          {/* Progression Pattern Moved */}
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
      </Suspense>
    </>
  );
}
