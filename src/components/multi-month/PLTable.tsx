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
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <TableRow className={cn(
        "hover:bg-muted/50 transition-colors",
        month.isSoftLaunch && "bg-primary/5"
      )}>
        <TableCell className="font-medium">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 mr-2">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <span className="text-sm">{month.label}</span>
          {month.isSoftLaunch && (
            <Badge variant="secondary" className="ml-2 text-[10px]">Soft</Badge>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={month.budget}
              onChange={(e) => updateMonth(month.id, { budget: parseFloat(e.target.value) || 0 })}
              className="w-24 h-7 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => updateMonth(month.id, { budgetLocked: !month.budgetLocked })}
            >
              {month.budgetLocked ? <Lock className="h-3 w-3 text-warning" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
            </Button>
          </div>
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {formatCurrency(month.totalSpend || 0, true)}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {formatNumber(month.totalConversions || 0)}
        </TableCell>
        <TableCell className="text-right font-mono text-sm">
          {formatCurrency(month.revenue || 0, true)}
        </TableCell>
        <TableCell className="text-right font-mono text-sm text-muted-foreground">
          {formatCurrency(month.operatingCosts || 0, true)}
        </TableCell>
        <TableCell className={cn("text-right font-mono text-sm font-medium", profitClass)}>
          {formatCurrency(month.netProfit || 0, true)}
        </TableCell>
        <TableCell className={cn("text-right font-mono text-sm font-medium", cumulativeClass)}>
          {formatCurrency(month.cumulativeProfit || 0, true)}
        </TableCell>
      </TableRow>
      
      <CollapsibleContent asChild>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={8} className="p-0">
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
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-48">Month</TableHead>
              <TableHead className="w-32">Budget</TableHead>
              <TableHead className="text-right w-24">Spend</TableHead>
              <TableHead className="text-right w-24">Conv.</TableHead>
              <TableHead className="text-right w-24">Revenue</TableHead>
              <TableHead className="text-right w-24">OpEx</TableHead>
              <TableHead className="text-right w-24">Net P/L</TableHead>
              <TableHead className="text-right w-28">Cumulative</TableHead>
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
            <TableRow className="bg-primary/10 font-semibold border-t-2 border-primary">
              <TableCell>TOTALS</TableCell>
              <TableCell className="font-mono">{formatCurrency(totals.avgMonthlyBudget, true)}/mo avg</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.totalBudget, true)}</TableCell>
              <TableCell className="text-right font-mono">{formatNumber(totals.totalConversions)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totals.totalRevenue, true)}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(totals.operatingCosts, true)}</TableCell>
              <TableCell className={cn(
                "text-right font-mono",
                totals.netProfit > 0 ? "text-green-500" : totals.netProfit < 0 ? "text-destructive" : ""
              )}>
                {formatCurrency(totals.netProfit, true)}
              </TableCell>
              <TableCell className="text-right">
                {totals.breakEvenMonth !== null && (
                  <Badge variant="outline" className="text-xs">
                    Break-even: M{totals.breakEvenMonth + 1}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </Card>
  );
}
