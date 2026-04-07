import { Fragment, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
  useBlendedMetrics,
  calculateChannelMetrics,
} from '@/hooks/use-media-plan-store';
// import { useBudgetEngine } from '@/hooks/use-budget-engine';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import {
  Search,
  Megaphone,
  Users,
  Star,
  Edit2,
  Settings2,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChannelEditor } from './ChannelEditor';
import { BUYING_MODEL_INFO } from '@/types/channel';
import { useActionPulseStore } from '@/store/useActionPulseStore';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { useVerticalConfig } from '@/hooks/use-vertical-config';

const CATEGORY_ICONS: Partial<Record<ChannelCategory, LucideIcon>> = {
  'SEO/Content': Search,
  'Paid Search': Search,
  'Paid Social': Star,
  'Offline/TV': Megaphone,
  'Display/Programmatic': Megaphone,
  Affiliate: Users,
  'Email/SMS': Users,
  Other: Settings2,
};

const CATEGORY_TINT_BG_CLASSES: Record<ChannelCategory, string> = {
  'SEO/Content': 'bg-[hsl(var(--chart-1)/0.2)]',
  'Display/Programmatic': 'bg-[hsl(var(--chart-2)/0.2)]',
  Affiliate: 'bg-[hsl(var(--chart-3)/0.2)]',
  'Paid Social': 'bg-[hsl(var(--chart-4)/0.2)]',
  'Paid Search': 'bg-[hsl(var(--chart-5)/0.2)]',
  'Offline/TV': 'bg-[hsl(var(--muted-foreground)/0.2)]',
  'Email/SMS': 'bg-[hsl(var(--primary)/0.2)]',
  Other: 'bg-[hsl(var(--secondary)/0.2)]',
};

type SortKey = 'spend' | 'impressions' | 'cpa' | 'roas';

const CategoryIcon = ({ category }: { category: ChannelCategory }) => {
  const Icon = CATEGORY_ICONS[category] || Settings2;
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
  highlight = false,
}: {
  value: number | null | undefined;
  onSave: (value: number) => void;
  type?: 'number' | 'currency' | 'percentage';
  suffix?: string;
  prefix?: string;
  className?: string;
  formatCurrencyFn?: (value: number) => string;
  highlight?: boolean;
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
      }
    },
    [handleSave]
  );

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
          className="h-9 w-24 text-sm px-2"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 cursor-pointer group',
        highlight && 'text-cyan-400',
        className
      )}
      onClick={handleStartEdit}
    >
      <span className="font-mono text-sm">{displayValue}</span>
      <Edit2
        className={cn(
          'h-3 w-3 transition-opacity print-mode-hide',
          highlight ? 'opacity-100 text-cyan-400 animate-pulse' : 'opacity-0 group-hover:opacity-50'
        )}
      />
    </div>
  );
}

export function ChannelTable() {
  const vc = useVerticalConfig();
  const {
    setChannelAllocation,
    normalizeAllocations,
    updateChannelConfigField,
    totalBudget,
    toggleChannelLock,
    setGhostProjectedRevenue,
  } = useMediaPlanStore();
  // const { rebalance } = useBudgetEngine();
  const channels = useChannelsWithMetrics();
  const blendedMetrics = useBlendedMetrics();
  const categoryTotals = useCategoryTotals();
  const { symbol, format: formatCurrency } = useCurrency();
  const [priceHintChannelId, setPriceHintChannelId] = useState<string | null>(null);
  const [guidedChannelId, setGuidedChannelId] = useState<string | null>(null);
  const [showStickyHud, setShowStickyHud] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [monthlyDrafts, setMonthlyDrafts] = useState<Record<string, number[]>>({});
  const priceHintTimerRef = useRef<number | null>(null);
  const guidedPulseTimerRef = useRef<number | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const targetChannelId = useActionPulseStore((state) => state.targetChannelId);
  const pulseKey = useActionPulseStore((state) => state.pulseKey);
  const clearActionPulse = useActionPulseStore((state) => state.clearActionPulse);

  const { sortedRows, sortKey, sortDirection, toggleSort } = useSortableTable<
    ChannelWithMetrics,
    SortKey
  >(
    channels,
    (row, key) => {
      switch (key) {
        case 'spend':
          return formatCurrency(row.metrics.spend);
        case 'impressions':
          return row.buyingModel === 'FLAT_FEE' || row.buyingModel === 'CPA' || row.tier === 'fixed'
            ? '--'
            : formatNumber(row.metrics.impressions, true);
        case 'cpa':
          return row.metrics.cpa ? formatCurrency(row.metrics.cpa) : '0';
        case 'roas':
          return `${row.metrics.roas.toFixed(2)}x`;
        default:
          return 0;
      }
    },
    'roas',
    'desc'
  );

  useEffect(() => {
    return () => {
      if (priceHintTimerRef.current) {
        window.clearTimeout(priceHintTimerRef.current);
      }
      if (guidedPulseTimerRef.current) {
        window.clearTimeout(guidedPulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hero = document.getElementById('hero-charts-anchor');
    const charts = document.getElementById('primary-charts-anchor');

    if (!hero && !charts) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const anyVisible = entries.some((entry) => entry.isIntersecting);
        setShowStickyHud(!anyVisible);
      },
      { threshold: 0.1 }
    );

    if (hero) observer.observe(hero);
    if (charts) observer.observe(charts);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!targetChannelId || pulseKey === 0) return;

    const rowEl = rowRefs.current[targetChannelId];
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setGuidedChannelId(targetChannelId);
    if (guidedPulseTimerRef.current) {
      window.clearTimeout(guidedPulseTimerRef.current);
    }
    guidedPulseTimerRef.current = window.setTimeout(() => {
      setGuidedChannelId((current) => (current === targetChannelId ? null : current));
    }, 1800);

    clearActionPulse();
  }, [targetChannelId, pulseKey, clearActionPulse]);

  const categorySections = useMemo(() => {
    const groups: Partial<Record<ChannelCategory, ChannelWithMetrics[]>> = {};

    (Object.keys(CATEGORY_INFO) as ChannelCategory[]).forEach((cat) => {
      groups[cat] = [];
    });

    sortedRows.forEach((ch) => {
      const category = ch.category && groups[ch.category] ? ch.category : 'Other';
      if (!groups[category as ChannelCategory]) {
        groups[category as ChannelCategory] = [];
      }
      groups[category as ChannelCategory]?.push(ch);
    });

    return (Object.entries(groups) as [ChannelCategory, ChannelWithMetrics[]][]).filter(
      ([, items]) => items.length > 0
    );
  }, [sortedRows]);

  const handleSliderChange = useCallback(
    (channelId: string, values: number[]) => {
      setChannelAllocation(channelId, values[0]);

      const {
        channels: updatedChannels,
        totalBudget: updatedBudget,
        globalMultipliers,
      } = useMediaPlanStore.getState();
      const projectedRevenue = updatedChannels.reduce((sum, channel) => {
        return sum + calculateChannelMetrics(channel, updatedBudget, globalMultipliers).revenue;
      }, 0);

      setGhostProjectedRevenue(projectedRevenue);
    },
    [setChannelAllocation, setGhostProjectedRevenue]
  );

  const handleSliderCommit = useCallback(() => {
    normalizeAllocations();
    setGhostProjectedRevenue(null);
  }, [normalizeAllocations, setGhostProjectedRevenue]);

  const triggerPriceHint = useCallback((channelId: string) => {
    setPriceHintChannelId(channelId);
    setGuidedChannelId(channelId);
    if (priceHintTimerRef.current) {
      window.clearTimeout(priceHintTimerRef.current);
    }
    priceHintTimerRef.current = window.setTimeout(() => {
      setPriceHintChannelId((current) => (current === channelId ? null : current));
      setGuidedChannelId((current) => (current === channelId ? null : current));
    }, 1200);
  }, []);

  const toggleRowExpansion = useCallback((channel: ChannelWithMetrics) => {
    setExpandedRows((prev) => ({ ...prev, [channel.id]: !prev[channel.id] }));
    setMonthlyDrafts((prev) => {
      if (prev[channel.id]) return prev;
      const seed = Number((channel.metrics.spend / 9).toFixed(2));
      return { ...prev, [channel.id]: Array.from({ length: 9 }, () => seed) };
    });
  }, []);

  const updateMonthlyValue = useCallback(
    (channel: ChannelWithMetrics, monthIndex: number, value: number) => {
      setMonthlyDrafts((prev) => {
        const existing = prev[channel.id] ?? Array.from({ length: 9 }, () => 0);
        const next = [...existing];
        next[monthIndex] = Math.max(0, value);

        const monthlyTotal = next.reduce((sum, monthSpend) => sum + monthSpend, 0);

        const isFixedByModel =
          channel.tier === 'fixed' ||
          channel.buyingModel === 'FLAT_FEE' ||
          channel.buyingModel === 'RETAINER';

        if (isFixedByModel) {
          updateChannelConfigField(channel.id, 'price', monthlyTotal);
        } else {
          const nextPct = totalBudget > 0 ? (monthlyTotal / totalBudget) * 100 : 0;
          setChannelAllocation(channel.id, Math.max(0, Math.min(100, nextPct)));
        }

        return { ...prev, [channel.id]: next };
      });
    },
    [setChannelAllocation, totalBudget, updateChannelConfigField]
  );

  // Calculate total allocation
  const totalAllocation = useMemo(
    () => channels.reduce((sum, ch) => sum + ch.allocationPct, 0),
    [channels]
  );

  const renderSortHeader = (label: string, key: SortKey) => {
    const isActive = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors',
          isActive ? 'text-cyan-400' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : null}
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden card-shadow">
      <AnimatePresence>
        {showStickyHud ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/85 border-b border-cyan-900/50 shadow-md"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 py-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">
                  Remaining Budget
                </p>
                <p className="text-sm font-mono text-cyan-300">
                  {formatCurrency(Math.max(0, totalBudget - blendedMetrics.totalSpend))}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Blended ROAS</p>
                <p className="text-sm font-mono text-cyan-300">
                  {blendedMetrics.blendedRoas.toFixed(2)}x
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">
                  Total {vc.terms.conversionPlural}
                </p>
                <p className="text-sm font-mono text-cyan-300">
                  {formatNumber(blendedMetrics.totalConversions)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">
                  Blended {vc.terms.costPerConversion}
                </p>
                <p className="text-sm font-mono text-cyan-300">
                  {blendedMetrics.blendedCpa ? formatCurrency(blendedMetrics.blendedCpa) : '--'}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Header with total indicator */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
        <h3 className="font-semibold">Channel Allocation</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Total:</span>
          <Badge
            variant={Math.abs(totalAllocation - 100) < 0.1 ? 'default' : 'destructive'}
            className="font-mono"
          >
            {formatPercentage(totalAllocation)}
          </Badge>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="w-[250px]">Channel</TableHead>
              <TableHead className="w-[180px]">Allocation %</TableHead>
              <TableHead className="text-right">{renderSortHeader('Spend', 'spend')}</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">
                {renderSortHeader('Impressions', 'impressions')}
              </TableHead>
              <TableHead className="text-right">CTR %</TableHead>
              <TableHead className="text-right">{vc.terms.conversionPlural}</TableHead>
              <TableHead className="text-right">
                {renderSortHeader(vc.terms.costPerConversion, 'cpa')}
              </TableHead>
              <TableHead className="text-right">{renderSortHeader('ROAS', 'roas')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorySections.map(([category, categoryChannels]) => (
              <Fragment key={category}>
                {/* Category Header Row */}
                <TableRow key={`header-${category}`} className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={9} className="py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-md',
                          CATEGORY_TINT_BG_CLASSES[category]
                        )}
                      >
                        <CategoryIcon category={category} />
                      </div>
                      <span className="font-semibold text-sm">
                        {CATEGORY_INFO[category]?.name || category}
                      </span>
                      <Badge variant="outline" className="ml-auto font-mono text-xs">
                        {formatPercentage(categoryTotals[category]?.percentage || 0)} •{' '}
                        {formatCurrency(categoryTotals[category]?.spend || 0)}
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>

                {/* Channel Rows */}
                {categoryChannels.map((channel) => {
                  const isWarning = channel.aboveCpaTarget || channel.belowRoasTarget;
                  const isAllocationFixedByModel =
                    channel.tier === 'fixed' ||
                    channel.buyingModel === 'FLAT_FEE' ||
                    channel.buyingModel === 'RETAINER';
                  const isAllocationDisabled = channel.locked || isAllocationFixedByModel;

                  return (
                    <Fragment key={channel.id}>
                      <TableRow
                        ref={(el) => {
                          rowRefs.current[channel.id] = el;
                        }}
                        className={cn(
                          'group transition-colors hover:bg-muted/20',
                          isWarning && 'bg-destructive/5 hover:bg-destructive/10'
                        )}
                        title={
                          isWarning
                            ? 'Constraint Violation: Channel metrics exceed Target CPA/ROAS'
                            : undefined
                        }
                      >
                        <TableCell className="font-medium">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleRowExpansion(channel)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-slate-800/60 text-slate-400 hover:text-cyan-300 transition-colors"
                              aria-label="Toggle monthly timeline"
                            >
                              {expandedRows[channel.id] ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <span className={cn('text-sm', isWarning && 'text-destructive')}>
                              {channel.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 print-mode-hide"
                              onClick={() => {
                                if (!isAllocationFixedByModel) {
                                  toggleChannelLock(channel.id);
                                } else {
                                  triggerPriceHint(channel.id);
                                }
                              }}
                              aria-label={channel.locked ? 'Unlock channel' : 'Lock channel'}
                              title={
                                isAllocationFixedByModel
                                  ? 'Fixed channels are price-driven. Edit price in Configure.'
                                  : channel.locked
                                    ? 'Unlock channel allocation'
                                    : 'Lock channel allocation'
                              }
                            >
                              {isAllocationFixedByModel || channel.locked ? (
                                <Lock className="h-4 w-4 text-red-500" />
                              ) : (
                                <Unlock className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                            <Badge variant="outline" className="text-xs px-2 py-0 h-5">
                              {(channel.buyingModel &&
                                BUYING_MODEL_INFO[channel.buyingModel]?.name) ||
                                'CPM'}
                            </Badge>
                            {channel.tier === 'fixed' && (
                              <Badge
                                variant="secondary"
                                className="text-xs px-2 py-0 h-5 bg-slate-800 text-slate-400 border-slate-700"
                              >
                                FIXED
                              </Badge>
                            )}
                            <ChannelEditor channel={channel} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={() => {
                                    if (isAllocationFixedByModel) {
                                      triggerPriceHint(channel.id);
                                    }
                                  }}
                                  className={cn(
                                    guidedChannelId === channel.id &&
                                      'rounded-md ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(8,145,178,0.6)] transition-all ease-out duration-1000'
                                  )}
                                >
                                  <Slider
                                    data-channel-id={channel.id}
                                    value={[channel.allocationPct]}
                                    onPointerDown={() => {
                                      setGhostProjectedRevenue(blendedMetrics.projectedRevenue);
                                    }}
                                    onPointerUp={() => {
                                      setGhostProjectedRevenue(null);
                                    }}
                                    onPointerCancel={() => {
                                      setGhostProjectedRevenue(null);
                                    }}
                                    onValueChange={(values) =>
                                      handleSliderChange(channel.id, values)
                                    }
                                    onValueCommit={handleSliderCommit}
                                    min={0}
                                    max={100}
                                    step={0.1}
                                    className={cn(
                                      'w-24 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 print-mode-hide',
                                      isAllocationDisabled &&
                                        'opacity-50 cursor-not-allowed [&_[role=slider]]:cursor-not-allowed grayscale'
                                    )}
                                    disabled={channel.locked || isAllocationFixedByModel}
                                  />
                                </div>
                              </TooltipTrigger>
                              {isAllocationFixedByModel ? (
                                <TooltipContent>
                                  Fixed Cost Channel: Edit the Price or click Configure to modify
                                  the spend allocation.
                                </TooltipContent>
                              ) : null}
                            </Tooltip>
                            <span
                              className={cn(
                                'font-mono text-sm w-12 text-right',
                                isAllocationFixedByModel && 'text-slate-500 italic'
                              )}
                            >
                              {formatPercentage(channel.allocationPct)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono text-sm rounded-md transition-all',
                            guidedChannelId === channel.id &&
                              'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(8,145,178,0.6)] transition-all ease-out duration-1000 text-cyan-400'
                          )}
                        >
                          {formatCurrency(channel.metrics.spend)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className={cn(
                              'rounded-md px-1 py-0.5 transition-all',
                              priceHintChannelId === channel.id &&
                                'animate-pulse ring-1 ring-cyan-400/70 text-cyan-400'
                            )}
                          >
                            <EditableCell
                              value={channel.metrics.effectivePrice}
                              onSave={(v) => updateChannelConfigField(channel.id, 'price', v)}
                              prefix={symbol}
                              className="justify-end text-muted-foreground"
                              highlight={priceHintChannelId === channel.id}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {channel.buyingModel === 'FLAT_FEE' ||
                          channel.buyingModel === 'CPA' ||
                          channel.tier === 'fixed' ? (
                            <span className="text-slate-500">--</span>
                          ) : (
                            formatNumber(channel.metrics.impressions, true)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {channel.buyingModel === 'FLAT_FEE' ||
                          channel.buyingModel === 'CPA' ||
                          channel.tier === 'fixed' ? (
                            <div className="text-right text-slate-500 text-sm py-1">N/A</div>
                          ) : (
                            <EditableCell
                              value={channel.metrics.effectiveCtr}
                              onSave={(v) =>
                                updateChannelConfigField(channel.id, 'baselineMetrics', { ctr: v })
                              }
                              suffix="%"
                              className="justify-end text-muted-foreground"
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(channel.metrics.conversions)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono text-sm',
                            channel.aboveCpaTarget && 'text-destructive font-semibold'
                          )}
                        >
                          {channel.metrics.cpa ? formatCurrency(channel.metrics.cpa) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              'font-mono text-xs',
                              !channel.belowRoasTarget &&
                                channel.metrics.roas >= 3 &&
                                'border-success text-success',
                              !channel.belowRoasTarget &&
                                channel.metrics.roas >= 2 &&
                                channel.metrics.roas < 3 &&
                                'border-warning text-warning',
                              channel.belowRoasTarget && 'border-destructive text-destructive'
                            )}
                          >
                            {channel.metrics.roas.toFixed(1)}x
                          </Badge>
                        </TableCell>
                      </TableRow>
                      <AnimatePresence>
                        {expandedRows[channel.id] ? (
                          <TableRow key={`${channel.id}-expanded`}>
                            <TableCell colSpan={9} className="p-0">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-slate-900/50 shadow-inner p-4 border-t border-slate-800"
                              >
                                <div className="flex w-full overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-3 pb-2 md:grid md:grid-cols-9 md:overflow-visible">
                                  {(
                                    monthlyDrafts[channel.id] ?? Array.from({ length: 9 }, () => 0)
                                  ).map((monthValue, monthIndex) => (
                                    <div
                                      key={`${channel.id}-m-${monthIndex}`}
                                      className="space-y-1 min-w-[85px] snap-center shrink-0 md:w-auto md:shrink"
                                    >
                                      <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                                        M{monthIndex + 1}
                                      </label>
                                      <Input
                                        type="number"
                                        value={monthValue}
                                        onChange={(e) =>
                                          updateMonthlyValue(
                                            channel,
                                            monthIndex,
                                            parseFloat(e.target.value) || 0
                                          )
                                        }
                                        className="h-8 text-xs bg-slate-900 border-slate-700"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-border/50">
        {categorySections.map(([category, categoryChannels]) => (
          <div key={category} className="p-4">
            {/* Category Header */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg',
                  CATEGORY_TINT_BG_CLASSES[category]
                )}
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
                const isAllocationFixedByModel =
                  channel.tier === 'fixed' ||
                  channel.buyingModel === 'FLAT_FEE' ||
                  channel.buyingModel === 'RETAINER';
                const isAllocationDisabled = channel.locked || isAllocationFixedByModel;

                return (
                  <div
                    key={channel.id}
                    className={cn(
                      'p-3 rounded-lg border',
                      isWarning
                        ? 'border-destructive/50 bg-destructive/5'
                        : 'border-border/30 bg-muted/20'
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleRowExpansion(channel)}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-slate-800/60 text-slate-400 hover:text-cyan-300 transition-colors"
                          aria-label="Toggle monthly timeline"
                        >
                          {expandedRows[channel.id] ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <span
                          className={cn(
                            'text-sm font-medium truncate',
                            isWarning && 'text-destructive'
                          )}
                        >
                          {channel.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 print-mode-hide"
                          onClick={() => {
                            if (!isAllocationFixedByModel) {
                              toggleChannelLock(channel.id);
                            } else {
                              triggerPriceHint(channel.id);
                            }
                          }}
                          aria-label={channel.locked ? 'Unlock channel' : 'Lock channel'}
                        >
                          {isAllocationFixedByModel || channel.locked ? (
                            <Lock className="h-4 w-4 text-red-500" />
                          ) : (
                            <Unlock className="h-4 w-4 text-gray-400" />
                          )}
                        </Button>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'font-mono text-xs',
                          channel.belowRoasTarget && 'border-destructive text-destructive',
                          !channel.belowRoasTarget &&
                            channel.metrics.roas >= 3 &&
                            'border-success text-success'
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
                        onPointerDown={() => {
                          setGhostProjectedRevenue(blendedMetrics.projectedRevenue);
                        }}
                        onPointerUp={() => {
                          setGhostProjectedRevenue(null);
                        }}
                        onPointerCancel={() => {
                          setGhostProjectedRevenue(null);
                        }}
                        onValueChange={(values) => handleSliderChange(channel.id, values)}
                        onValueCommit={handleSliderCommit}
                        min={0}
                        max={100}
                        step={0.1}
                        className={cn(
                          'flex-1 print-mode-hide',
                          isAllocationDisabled &&
                            'opacity-50 cursor-not-allowed [&_[role=slider]]:cursor-not-allowed'
                        )}
                        disabled={channel.locked || isAllocationFixedByModel}
                      />
                      <span className="font-mono text-sm w-14 text-right">
                        {formatPercentage(channel.allocationPct)}
                      </span>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Spend</span>
                        <p className="font-mono font-medium">
                          {formatCurrency(channel.metrics.spend)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Impr.</span>
                        <p className="font-mono font-medium">
                          {channel.buyingModel === 'FLAT_FEE' ||
                          channel.buyingModel === 'CPA' ||
                          channel.tier === 'fixed' ? (
                            <span className="text-slate-500">--</span>
                          ) : (
                            formatNumber(channel.metrics.impressions, true)
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{vc.terms.conversion}</span>
                        <p className="font-mono font-medium">
                          {formatNumber(channel.metrics.conversions)}
                        </p>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedRows[channel.id] ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 bg-slate-900/50 shadow-inner p-3 border-t border-slate-800 rounded"
                        >
                          <div className="flex w-full overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-3 pb-2 md:grid md:grid-cols-9 md:overflow-visible">
                            {(monthlyDrafts[channel.id] ?? Array.from({ length: 9 }, () => 0)).map(
                              (monthValue, monthIndex) => (
                                <div
                                  key={`${channel.id}-mobile-m-${monthIndex}`}
                                  className="space-y-1 min-w-[85px] snap-center shrink-0 md:w-auto md:shrink"
                                >
                                  <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                                    M{monthIndex + 1}
                                  </label>
                                  <Input
                                    type="number"
                                    value={monthValue}
                                    onChange={(e) =>
                                      updateMonthlyValue(
                                        channel,
                                        monthIndex,
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="h-8 text-xs bg-slate-900 border-slate-700"
                                  />
                                </div>
                              )
                            )}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
