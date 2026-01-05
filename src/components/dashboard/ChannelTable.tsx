import { useMemo, useState, useCallback } from 'react';
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
  formatCurrency, 
  formatNumber, 
  formatPercentage,
  CATEGORY_INFO,
  ChannelCategory,
} from '@/lib/mediaplan-data';
import { 
  useMediaPlanStore,
  useChannelsWithMetrics,
  useCategoryTotals,
  ChannelWithMetrics,
} from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { Search, Megaphone, Users, Star, Edit2, Check } from 'lucide-react';

const CategoryIcon = ({ category }: { category: ChannelCategory }) => {
  const icons = {
    seo: Search,
    paid: Megaphone,
    affiliate: Users,
    influencer: Star,
  };
  const Icon = icons[category];
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
}: { 
  value: number | null | undefined;
  onSave: (value: number) => void;
  type?: 'number' | 'currency' | 'percentage';
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const displayValue = useMemo(() => {
    if (value === null || value === undefined) return 'N/A';
    if (type === 'currency') return formatCurrency(value);
    if (type === 'percentage') return `${value.toFixed(2)}%`;
    return `${prefix}${value.toFixed(2)}${suffix}`;
  }, [value, type, prefix, suffix]);

  const handleStartEdit = useCallback(() => {
    setEditValue(value?.toString() ?? '');
    setIsEditing(true);
  }, [value]);

  const handleSave = useCallback(() => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      onSave(numValue);
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
  const { setChannelAllocation, updateChannelOverride } = useMediaPlanStore();
  const channels = useChannelsWithMetrics();
  const categoryTotals = useCategoryTotals();

  // Group channels by category
  const groupedChannels = useMemo(() => {
    const groups: Record<ChannelCategory, ChannelWithMetrics[]> = {
      seo: [],
      paid: [],
      affiliate: [],
      influencer: [],
    };
    
    channels.forEach((ch) => {
      groups[ch.category].push(ch);
    });
    
    return groups;
  }, [channels]);

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

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden card-shadow">
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
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">CPM</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">CTR %</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">CPA</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(Object.entries(groupedChannels) as [ChannelCategory, ChannelWithMetrics[]][]).map(
              ([category, categoryChannels]) => (
                <>
                  {/* Category Header Row */}
                  <TableRow 
                    key={`header-${category}`} 
                    className="bg-muted/40 hover:bg-muted/40"
                  >
                    <TableCell colSpan={9} className="py-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="flex h-6 w-6 items-center justify-center rounded-md"
                          style={{ backgroundColor: CATEGORY_INFO[category].color + '20' }}
                        >
                          <CategoryIcon category={category} />
                        </div>
                        <span className="font-semibold text-sm">
                          {CATEGORY_INFO[category].name}
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
                      >
                        <TableCell className="font-medium">
                          <span className={cn(
                            "text-sm",
                            isWarning && "text-destructive"
                          )}>
                            {channel.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Slider
                              value={[channel.allocationPct]}
                              onValueChange={(values) => handleSliderChange(channel.id, values)}
                              min={0}
                              max={100}
                              step={0.5}
                              className="w-20 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                            />
                            <span className="font-mono text-sm w-12 text-right">
                              {formatPercentage(channel.allocationPct)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(channel.metrics.spend)}
                        </TableCell>
                        <TableCell className="text-right">
                          <EditableCell
                            value={channel.metrics.effectiveCpm}
                            onSave={(v) => updateChannelOverride(channel.id, { overrideCpm: v })}
                            prefix="€"
                            className="justify-end text-muted-foreground"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(channel.metrics.impressions, true)}
                        </TableCell>
                        <TableCell className="text-right">
                          <EditableCell
                            value={channel.metrics.effectiveCtr}
                            onSave={(v) => updateChannelOverride(channel.id, { overrideCtr: v })}
                            suffix="%"
                            className="justify-end text-muted-foreground"
                          />
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
                </>
              )
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
                  style={{ backgroundColor: CATEGORY_INFO[category].color + '20' }}
                >
                  <CategoryIcon category={category} />
                </div>
                <span className="font-semibold">{CATEGORY_INFO[category].name}</span>
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
                          value={[channel.allocationPct]}
                          onValueChange={(values) => handleSliderChange(channel.id, values)}
                          min={0}
                          max={100}
                          step={0.5}
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
                          <p className="font-mono font-medium">{formatNumber(channel.metrics.impressions, true)}</p>
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
    </div>
  );
}
