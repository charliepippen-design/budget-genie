import { useMemo, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
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
import { ChannelWithMetrics } from '@/hooks/use-budget-calculator';
import { cn } from '@/lib/utils';
import { Search, Megaphone, Users, Star } from 'lucide-react';

interface ChannelTableProps {
  channels: ChannelWithMetrics[];
  onAllocationChange: (channelId: string, percentage: number) => void;
  categoryTotals: Record<string, { spend: number; percentage: number }>;
}

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

export function ChannelTable({ 
  channels, 
  onAllocationChange,
  categoryTotals,
}: ChannelTableProps) {
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
      onAllocationChange(channelId, values[0]);
    },
    [onAllocationChange]
  );

  // Calculate total allocation
  const totalAllocation = useMemo(() => 
    channels.reduce((sum, ch) => sum + ch.currentPercentage, 0),
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
              <TableHead className="w-[200px]">Allocation %</TableHead>
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
                  {categoryChannels.map((channel) => (
                    <TableRow 
                      key={channel.id}
                      className="group transition-colors hover:bg-muted/20"
                    >
                      <TableCell className="font-medium">
                        <span className="text-sm">{channel.name}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[channel.currentPercentage]}
                            onValueChange={(values) => handleSliderChange(channel.id, values)}
                            min={0}
                            max={50}
                            step={0.5}
                            className="w-24 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                          />
                          <span className="font-mono text-sm w-14 text-right">
                            {formatPercentage(channel.currentPercentage)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(channel.metrics.spend)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        €{channel.cpm?.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(channel.metrics.impressions, true)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {channel.ctr?.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(channel.metrics.conversions)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {channel.metrics.cpa ? formatCurrency(channel.metrics.cpa) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant="outline"
                          className={cn(
                            "font-mono text-xs",
                            channel.metrics.roas >= 3 && "border-success text-success",
                            channel.metrics.roas >= 2 && channel.metrics.roas < 3 && "border-warning text-warning",
                            channel.metrics.roas < 2 && "border-destructive text-destructive"
                          )}
                        >
                          {channel.metrics.roas.toFixed(1)}x
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
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
                {categoryChannels.map((channel) => (
                  <div 
                    key={channel.id}
                    className="p-3 rounded-lg bg-muted/20 border border-border/30"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium">{channel.name}</span>
                      <Badge 
                        variant="outline"
                        className={cn(
                          "font-mono text-xs",
                          channel.metrics.roas >= 3 && "border-success text-success",
                          channel.metrics.roas < 2 && "border-destructive text-destructive"
                        )}
                      >
                        {channel.metrics.roas.toFixed(1)}x ROAS
                      </Badge>
                    </div>
                    
                    {/* Slider */}
                    <div className="flex items-center gap-3 mb-3">
                      <Slider
                        value={[channel.currentPercentage]}
                        onValueChange={(values) => handleSliderChange(channel.id, values)}
                        min={0}
                        max={50}
                        step={0.5}
                        className="flex-1"
                      />
                      <span className="font-mono text-sm w-14 text-right">
                        {formatPercentage(channel.currentPercentage)}
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
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
