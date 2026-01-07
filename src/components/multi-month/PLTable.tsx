import { useState, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  ArrowDown,
  Lock,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/mediaplan-data';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  useMultiMonthStore,
  useMultiMonthMetrics,
  MonthData,
} from '@/hooks/use-multi-month-store';

// Consistent Grid Definition for Header and Rows
// 1. Month (Label + Toggle)
// 2. Budget (Input)
// 3. Spend
// 4. Conversions
// 5. Revenue
// 6. OpEx
// 7. Net P/L
// 8. Cumulative
const GRID_COLS = "grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr]";

function MonthRow({
  month,
  isExpanded,
  onToggle,
  formatCurrency,
}: {
  month: MonthData & { totalSpend?: number; totalConversions?: number; revenue?: number; operatingCosts?: number; netProfit?: number; cumulativeProfit?: number };
  isExpanded: boolean;
  onToggle: () => void;
  formatCurrency: (value: number, compact?: boolean) => string;
}) {
  const {
    updateMonth,
    updateMonthChannel,
    copyFromPreviousMonth,
    resetMonthToGlobal,
    applyToRemainingMonths
  } = useMultiMonthStore();

  const profitClass = useMemo(() => {
    if (!month.netProfit) return '';
    if (month.netProfit > 0) return 'text-green-500';
    if (month.netProfit < 0) return 'text-destructive';
    return 'text-primary';
  }, [month.netProfit]);

  const cumulativeClass = useMemo(() => {
    if (month.cumulativeProfit === undefined) return '';
    if (month.cumulativeProfit > 0) return 'text-green-500';
    if (month.cumulativeProfit < 0) return 'text-destructive';
    return '';
  }, [month.cumulativeProfit]);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle} asChild>
      <>
        <TableRow className={cn(
          "grid items-center gap-4 hover:bg-muted/50 transition-colors py-2",
          GRID_COLS,
          month.isSoftLaunch && "bg-primary/5"
        )}>
          <TableCell className="font-medium p-0 pl-2 flex items-center gap-2 overflow-hidden">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <span className="text-sm truncate" title={month.label}>{month.label}</span>
            {month.isSoftLaunch && (
              <Badge variant="secondary" className="text-[10px] px-1 h-5 hidden xl:inline-flex">Soft</Badge>
            )}
          </TableCell>
          <TableCell className="p-0">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={month.budget}
                onChange={(e) => updateMonth(month.id, { budget: parseFloat(e.target.value) || 0 })}
                className="w-full min-w-[80px] h-7 text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => updateMonth(month.id, { budgetLocked: !month.budgetLocked })}
              >
                {month.budgetLocked ? <Lock className="h-3 w-3 text-warning" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
              </Button>
            </div>
          </TableCell>
          <TableCell className="text-right font-mono text-sm p-0">{formatCurrency(month.totalSpend || 0, true)}</TableCell>
          <TableCell className="text-right font-mono text-sm p-0">{formatNumber(month.totalConversions || 0)}</TableCell>
          <TableCell className="text-right font-mono text-sm p-0">{formatCurrency(month.revenue || 0, true)}</TableCell>
          <TableCell className="text-right font-mono text-sm text-muted-foreground p-0">{formatCurrency(month.operatingCosts || 0, true)}</TableCell>
          <TableCell className={cn("text-right font-mono text-sm font-medium p-0", profitClass)}>{formatCurrency(month.netProfit || 0, true)}</TableCell>
          <TableCell className={cn("text-right font-mono text-sm font-medium p-0 pr-2", cumulativeClass)}>{formatCurrency(month.cumulativeProfit || 0, true)}</TableCell>
        </TableRow>

        <CollapsibleContent asChild>
          <TableRow className="bg-muted/30 hover:bg-muted/30 block">
            <TableCell colSpan={8} className="p-0 border-0 block w-full">
              <Card className="m-2 border-dashed">
                <CardContent className="p-3 space-y-3">
                  {/* Month Controls */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Multiplier:</span>
                      <Slider
                        value={[month.budgetMultiplier]}
                        onValueChange={([v]) => updateMonth(month.id, { budgetMultiplier: v })}
                        min={0.5}
                        max={2}
                        step={0.1}
                        className="w-24"
                      />
                      <Badge variant="outline" className="text-xs font-mono">
                        {month.budgetMultiplier.toFixed(1)}x
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Spend Mult:</span>
                      <Input
                        type="number"
                        value={month.spendMultiplier ?? ''}
                        onChange={(e) => updateMonth(month.id, {
                          spendMultiplier: e.target.value ? parseFloat(e.target.value) : null
                        })}
                        placeholder="Global"
                        className="w-16 h-6 text-xs"
                        step={0.1}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">CTR Bump:</span>
                      <Input
                        type="number"
                        value={month.ctrBump ?? ''}
                        onChange={(e) => updateMonth(month.id, {
                          ctrBump: e.target.value ? parseFloat(e.target.value) : null
                        })}
                        placeholder="Global"
                        className="w-16 h-6 text-xs"
                        step={0.1}
                      />
                    </div>
                    <div className="flex gap-1 ml-auto">
                      {month.monthIndex > 0 && (
                        <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => copyFromPreviousMonth(month.id)}>
                          <Copy className="h-3 w-3" /> Copy Prev
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => resetMonthToGlobal(month.id)}>
                        <RotateCcw className="h-3 w-3" /> Reset
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => applyToRemainingMonths(month.id)}>
                        <ArrowDown className="h-3 w-3" /> Apply Below
                      </Button>
                    </div>
                  </div>

                  {/* Channel Allocations */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {month.channels.map((ch) => (
                      <div key={ch.channelId} className="flex items-center gap-1 p-1.5 rounded bg-background/50 border border-border/50">
                        <span className="text-[10px] truncate flex-1" title={ch.name}>
                          {ch.name.replace(/^(SEO|Paid|Affiliate|Influencer)\s*-\s*/, '')}
                        </span>
                        <Input
                          type="number"
                          value={ch.allocationPct.toFixed(1)}
                          onChange={(e) => updateMonthChannel(month.id, ch.channelId, {
                            allocationPct: parseFloat(e.target.value) || 0
                          })}
                          className="w-14 h-5 text-[10px] text-right"
                          step={0.5}
                        />
                        <span className="text-[10px] text-muted-foreground">%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

export function PLTable() {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const { months: planMetrics, totals } = useMultiMonthMetrics();
  const { format: formatCurrency } = useCurrency();

  const toggleMonth = useCallback((monthId: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthId)) {
        next.delete(monthId);
      } else {
        next.add(monthId);
      }
      return next;
    });
  }, []);

  return (
    <Card className="border-border">
      <ScrollArea className="w-full">
        {/* Set min-width to prevent squashing on small screens */}
        <div className="min-w-[800px]">
          <Table>
            <TableHeader>
              <TableRow className={cn("grid gap-4 bg-muted/50 py-3", GRID_COLS)}>
                <TableHead className="pl-4 p-0">Month</TableHead>
                <TableHead className="p-0">Budget</TableHead>
                <TableHead className="text-right p-0">Spend</TableHead>
                <TableHead className="text-right p-0">Conv.</TableHead>
                <TableHead className="text-right p-0">Revenue</TableHead>
                <TableHead className="text-right p-0">OpEx</TableHead>
                <TableHead className="text-right p-0">Net P/L</TableHead>
                <TableHead className="text-right pr-4 p-0">Cumulative</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planMetrics.map((month) => (
                <MonthRow
                  key={month.id}
                  month={month}
                  isExpanded={expandedMonths.has(month.id)}
                  onToggle={() => toggleMonth(month.id)}
                  formatCurrency={formatCurrency}
                />
              ))}
              {/* Summary Row */}
              <TableRow className={cn(
                "grid gap-4 bg-primary/10 font-bold border-t-2 border-primary py-3",
                GRID_COLS
              )}>
                <TableCell className="pl-4 p-0">TOTALS</TableCell>
                <TableCell className="font-mono text-xs p-0">{formatCurrency(totals.totalAllocatedBudget, true)}</TableCell>
                <TableCell className="text-right font-mono p-0">{formatCurrency(totals.totalSpend, true)}</TableCell>
                <TableCell className="text-right font-mono p-0">{formatNumber(totals.totalConversions)}</TableCell>
                <TableCell className="text-right font-mono p-0">{formatCurrency(totals.totalRevenue, true)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground p-0">{formatCurrency(totals.operatingCosts, true)}</TableCell>
                <TableCell className={cn(
                  "text-right font-mono p-0",
                  totals.netProfit > 0 ? "text-green-500" : totals.netProfit < 0 ? "text-destructive" : ""
                )}>
                  {formatCurrency(totals.netProfit, true)}
                </TableCell>
                <TableCell className={cn(
                  "text-right font-mono p-0 pr-4",
                  totals.endingCumulativeProfit > 0 ? "text-green-500" : totals.endingCumulativeProfit < 0 ? "text-destructive" : ""
                )}>
                  {formatCurrency(totals.endingCumulativeProfit, true)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Card>
  );
}
