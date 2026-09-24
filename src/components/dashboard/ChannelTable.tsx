import React, { useMemo, useState, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  formatNumber,
  formatPercentage,
  CATEGORY_INFO,
  ChannelCategory,
} from '@/lib/mediaplan-data';
import {
  useCategoryTotals,
  ChannelWithMetrics,
  useMediaPlanStore,
  useChannelsWithMetrics,
} from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { Search, Megaphone, Users, Star, Edit2, Settings2, Lock, Unlock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChannelEditor } from './ChannelEditor';
import { BUYING_MODEL_INFO } from '@/types/channel';
import { AddChannelDialog } from './AddChannelDialog';

const getSparklinePath = (id: string) => {
  if (id.includes('seo')) {
    return "M 0 16 C 10 14, 20 10, 30 8 C 40 6, 45 3, 50 1";
  }
  if (id.includes('native') || id.includes('push') || id.includes('programmatic')) {
    return "M 0 16 Q 12 2 24 12 T 50 8";
  }
  if (id.includes('affiliate')) {
    return "M 0 15 L 12 12 L 25 10 L 38 6 L 50 5";
  }
  return "M 0 15 Q 12 15 25 10 T 50 5";
};

const CategoryIcon = ({ category }: { category: ChannelCategory }) => {
  const icons: Partial<Record<ChannelCategory, any>> = {
    'SEO/Content': Search,
    'Paid Search': Search,
    'Paid Social': Star,
    'Offline/TV': Megaphone, // Fallback icon
    'Display/Programmatic': Megaphone,
    'Affiliate': Users,
    'Email/SMS': Users, // Fallback
    'Other': Settings2,
  };
  const Icon = icons[category] || Settings2;
  return <Icon className="h-3.5 w-3.5" />;
};

// Inline editable cell component
function EditableCell({
  value,
  onSave,
  type = 'number',
  suffix = '',
  prefix = '',
  className,
  formatCurrencyFn,
}: {
  value: number | null | undefined;
  onSave: (value: number) => void;
  type?: 'number' | 'currency' | 'percentage';
  suffix?: string;
  prefix?: string;
  className?: string;
  formatCurrencyFn?: (value: number) => string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const displayValue = useMemo(() => {
    if (value === null || value === undefined) return 'N/A';
    if (type === 'currency' && formatCurrencyFn) return formatCurrencyFn(value);
    if (type === 'percentage') return `${value.toFixed(2)}%`;
    return `${prefix}${value.toFixed(2)}${suffix}`;
  }, [value, type, prefix, suffix, formatCurrencyFn]);

  const handleStartEdit = useCallback(() => {
    setEditValue(value?.toString() ?? '');
    setIsEditing(true);
  }, [value]);

  const handleSave = useCallback(() => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      onSave(Math.max(0, numValue));
    }
    setIsEditing(false);
  }, [editValue, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [handleSave]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="h-6 w-20 text-xs px-1"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 cursor-pointer group",
        className
      )}
      onClick={handleStartEdit}
    >
      <span className="font-mono text-sm">{displayValue}</span>
      <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
    </div>
  );
}

export function ChannelTable() {
  const { setChannelAllocation, updateChannelConfigField } = useMediaPlanStore();
  const channels = useChannelsWithMetrics();
  const categoryTotals = useCategoryTotals();
  const { symbol, format: formatCurrency } = useCurrency();
  const [hideUnallocated, setHideUnallocated] = useState(false);

  const { months: multiMonths } = useMultiMonthStore();

  const getDynamicSparklinePath = useCallback((channelId: string) => {
    if (!multiMonths || multiMonths.length < 2) {
      return getSparklinePath(channelId);
    }

    const roasValues = multiMonths.map(m => {
      const ch = m.channels?.find(c => c.channelId === channelId);
      return ch ? ch.roas : 0;
    });

    const min = Math.min(...roasValues);
    const max = Math.max(...roasValues);
    const range = max - min;

    const points = roasValues.map((roas, i) => {
      const x = (i / (roasValues.length - 1)) * 50;
      const y = range > 0.01 ? 18 - ((roas - min) / range) * 16 : 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `M ${points.join(" L ")}`;
  }, [multiMonths]);

  const filteredChannels = useMemo(() => {
    if (hideUnallocated) {
      return channels.filter(ch => ch.allocationPct > 0);
    }
    return channels;
  }, [channels, hideUnallocated]);

  // Group channels by category
  const groupedChannels = useMemo(() => {
    // Initialize groups based on the actual CATEGORY_INFO keys to ensure we match the schema
    const groups: Partial<Record<ChannelCategory, ChannelWithMetrics[]>> = {};

    // Pre-fill groups to ensure order based on CATEGORY_INFO if desired, or dynamic
    (Object.keys(CATEGORY_INFO) as ChannelCategory[]).forEach(cat => {
      groups[cat] = [];
    });

    filteredChannels.forEach((ch) => {
      // Defensive check for invalid/legacy categories
      if (!ch.category || !groups[ch.category]) {
        console.warn(`Channel ${ch.id} has invalid category: ${ch.category}`);
        // Fallback to 'Other' if possible, or create the key dynamically
        if (!groups['Other']) groups['Other'] = [];
        groups['Other']?.push(ch);
        return;
      }
      groups[ch.category]?.push(ch);
    });

    return groups as Record<ChannelCategory, ChannelWithMetrics[]>;
  }, [filteredChannels]);

  const handleSliderChange = useCallback(
    (channelId: string, values: number[]) => {
      setChannelAllocation(channelId, values[0]);
    },
    [setChannelAllocation]
  );

  // Calculate total allocation
  const totalAllocation = useMemo(() =>
    channels.reduce((sum, ch) => sum + ch.allocationPct, 0),
    [channels]
  );

  const overrideSummary = useMemo(() => {
    const active = channels.filter(ch => ch.isActive);
    const lockedCount = active.filter(ch => ch.locked || ch.tier === 'fixed').length;
    const scalableCount = active.filter(ch => !ch.locked && ch.tier !== 'fixed').length;
    return { lockedCount, scalableCount };
  }, [channels]);

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden card-shadow">
      {/* Header with total indicator */}
      <div className="flex flex-wrap items-center justify-between p-4 border-b border-border/50 bg-muted/30 gap-4">
        <h3 className="font-semibold">Channel Allocation</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none hover:text-white transition-colors">
            <input 
              type="checkbox" 
              checked={hideUnallocated} 
              onChange={(e) => setHideUnallocated(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Hide Unallocated</span>
          </label>
          <span className="text-sm text-muted-foreground">Total:</span>
          <Badge
            variant={Math.abs(totalAllocation - 100) < 0.1 ? 'default' : 'destructive'}
            className="font-mono"
          >
            {formatPercentage(totalAllocation)}
          </Badge>
          <AddChannelDialog
            trigger={
              <Button size="sm" variant="outline" className="h-8 gap-1 border-indigo-500/30 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10">
                <Plus className="h-3.5 w-3.5" />
                Add Channel
              </Button>
            }
          />
        </div>
      </div>

      {/* Override and optimization summary bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-slate-900/40 text-[11px] text-slate-400">
        <div>
          <span className="font-semibold text-slate-200">{overrideSummary.lockedCount}</span> locked (manual overrides) • <span className="font-semibold text-slate-200">{overrideSummary.scalableCount}</span> scalable (auto-optimized)
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="w-[250px]">Channel</TableHead>
              <TableHead className="w-[180px]">Allocation %</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">CTR %</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">CPA</TableHead>
              <TableHead className="text-right">Exp. LTV</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(Object.entries(groupedChannels) as [ChannelCategory, ChannelWithMetrics[]][]).map(
              ([category, categoryChannels]) => {
                if (categoryChannels.length === 0) return null;
                return (
                  <React.Fragment key={`group-${category}`}>
                    {/* Category Header Row */}
                    <TableRow
                      className="bg-muted/40 hover:bg-muted/40"
                    >
                      <TableCell colSpan={10} className="py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-6 w-6 items-center justify-center rounded-md"
                            style={{ backgroundColor: (CATEGORY_INFO[category]?.color || '#888') + '20' }}
                          >
                            <CategoryIcon category={category} />
                          </div>
                          <span className="font-semibold text-sm">
                            {CATEGORY_INFO[category]?.name || category}
                          </span>
                          <Badge variant="outline" className="ml-auto font-mono text-xs">
                            {formatPercentage(categoryTotals[category]?.percentage || 0)} • {formatCurrency(categoryTotals[category]?.spend || 0)}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Channel Rows */}
                    {categoryChannels.map((channel) => {
                      const isWarning = channel.aboveCpaTarget || channel.belowRoasTarget;

                      return (
                        <TableRow
                          key={channel.id}
                          className={cn(
                            "group transition-colors hover:bg-muted/20",
                            isWarning && "bg-destructive/5 hover:bg-destructive/10"
                          )}
                          title={isWarning ? "Constraint Violation: Channel metrics exceed Target CPA/ROAS" : undefined}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-sm",
                                isWarning && "text-destructive"
                              )}>
                                {channel.name}
                              </span>
                              
                              {/* SPARKLINE PERFORMANCE TREND */}
                              <svg className="w-12 h-6 overflow-visible opacity-60 hidden xl:inline-block ml-1" viewBox="0 0 50 20" title="Monthly ROAS Trend (Multi-Month Planning)">
                                <path
                                  d={getDynamicSparklinePath(channel.id)}
                                  fill="none"
                                  stroke={channel.metrics.roas >= 3 ? "#10b981" : channel.metrics.roas >= 2 ? "#f59e0b" : "#ef4444"}
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {(channel.buyingModel && BUYING_MODEL_INFO[channel.buyingModel]?.name) || 'CPM'}
                            </Badge>
                            {channel.tier === 'fixed' && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-slate-800 text-slate-400 border-slate-700">
                                FIXED
                              </Badge>
                            )}
                            <ChannelEditor channel={channel} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => {
                                // Fixed Tier channels cannot be unlocked manually in this context unless tier changes
                                if (channel.tier === 'fixed') return;
                                useMediaPlanStore.getState().toggleChannelLock(channel.id);
                              }}
                              disabled={channel.tier === 'fixed'}
                            >
                              {channel.tier === 'fixed' ? (
                                <Lock className="h-3 w-3 text-slate-500 opacity-50" />
                              ) : channel.locked ? (
                                <Lock className="h-3 w-3 text-red-500" />
                              ) : (
                                <Unlock className="h-3 w-3 text-gray-400" />
                              )}
                            </Button>
                            <Slider
                              data-channel-id={channel.id}
                              value={[channel.allocationPct]}
                              onValueChange={(values) => handleSliderChange(channel.id, values)}
                              min={0}
                              max={100}
                              step={0.1}
                              className={cn(
                                "w-20 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4",
                                (channel.locked || channel.tier === 'fixed') && "opacity-50 pointer-events-none grayscale"
                              )}
                              disabled={channel.locked || channel.tier === 'fixed'}
                            />
                            <span className={cn(
                              "font-mono text-sm w-12 text-right",
                              channel.tier === 'fixed' && "text-slate-500 italic"
                            )}>
                              {formatPercentage(channel.allocationPct)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(channel.metrics.spend)}
                        </TableCell>
                        <TableCell className="text-right">
                          <EditableCell
                            value={channel.metrics.effectivePrice}
                            onSave={(v) => updateChannelConfigField(channel.id, 'price', v)}
                            prefix={symbol}
                            className="justify-end text-muted-foreground"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {(channel.buyingModel === 'FLAT_FEE' || channel.buyingModel === 'CPA' || channel.tier === 'fixed')
                            ? <span className="text-slate-500">--</span>
                            : formatNumber(channel.metrics.impressions, true)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(channel.buyingModel === 'FLAT_FEE' || channel.buyingModel === 'CPA' || channel.tier === 'fixed')
                            ? <div className="text-right text-slate-500 text-sm py-1">N/A</div>
                            : <EditableCell
                              value={channel.metrics.effectiveCtr}
                              onSave={(v) => updateChannelConfigField(channel.id, 'baselineMetrics', { ctr: v })}
                              suffix="%"
                              className="justify-end text-muted-foreground"
                            />
                          }
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(channel.metrics.conversions)}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-mono text-sm",
                          channel.aboveCpaTarget && "text-destructive font-semibold"
                        )}>
                          {channel.metrics.cpa ? formatCurrency(channel.metrics.cpa) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <EditableCell
                            value={channel.typeConfig.baselineMetrics.expectedLtv || useMediaPlanStore.getState().globalMultipliers.playerValue}
                            onSave={(v) => updateChannelConfigField(channel.id, 'baselineMetrics', { expectedLtv: v })}
                            prefix={symbol}
                            className="justify-end text-muted-foreground"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-mono text-xs",
                              !channel.belowRoasTarget && channel.metrics.roas >= 3 && "border-success text-success",
                              !channel.belowRoasTarget && channel.metrics.roas >= 2 && channel.metrics.roas < 3 && "border-warning text-warning",
                              channel.belowRoasTarget && "border-destructive text-destructive"
                            )}
                          >
                            {channel.metrics.roas.toFixed(1)}x
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  </React.Fragment>
                );
              }
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-border/50">
        {(Object.entries(groupedChannels) as [ChannelCategory, ChannelWithMetrics[]][]).map(
          ([category, categoryChannels]) => (
            <div key={category} className="p-4">
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: (CATEGORY_INFO[category]?.color || '#888') + '20' }}
                >
                  <CategoryIcon category={category} />
                </div>
                <span className="font-semibold">{CATEGORY_INFO[category]?.name || category}</span>
                <Badge variant="outline" className="ml-auto font-mono text-xs">
                  {formatCurrency(categoryTotals[category]?.spend || 0)}
                </Badge>
              </div>

              {/* Channel Cards */}
              <div className="space-y-3">
                {categoryChannels.map((channel) => {
                  const isWarning = channel.aboveCpaTarget || channel.belowRoasTarget;

                  return (
                    <div
                      key={channel.id}
                      className={cn(
                        "p-3 rounded-lg bg-muted/20 border border-border/30",
                        isWarning && "border-destructive/50 bg-destructive/5"
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className={cn(
                          "text-sm font-medium",
                          isWarning && "text-destructive"
                        )}>
                          {channel.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-xs",
                            channel.belowRoasTarget && "border-destructive text-destructive",
                            !channel.belowRoasTarget && channel.metrics.roas >= 3 && "border-success text-success"
                          )}
                        >
                          {channel.metrics.roas.toFixed(1)}x ROAS
                        </Badge>
                      </div>

                      {/* Slider */}
                      <div className="flex items-center gap-3 mb-3">
                        <Slider
                          data-channel-id={channel.id}
                          value={[channel.allocationPct]}
                          onValueChange={(values) => handleSliderChange(channel.id, values)}
                          min={0}
                          max={100}
                          step={0.1}
                          className="flex-1"
                        />
                        <span className="font-mono text-sm w-14 text-right">
                          {formatPercentage(channel.allocationPct)}
                        </span>
                      </div>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Spend</span>
                          <p className="font-mono font-medium">{formatCurrency(channel.metrics.spend)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Impr.</span>
                          <p className="font-mono font-medium">
                            {(channel.buyingModel === 'FLAT_FEE' || channel.buyingModel === 'CPA' || channel.tier === 'fixed')
                              ? <span className="text-slate-500">--</span>
                              : formatNumber(channel.metrics.impressions, true)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Conv.</span>
                          <p className="font-mono font-medium">{formatNumber(channel.metrics.conversions)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>
    </div >
  );
}
