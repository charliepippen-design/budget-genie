import { useState, useCallback, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Sliders,
  Layers,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  AlertTriangle,
  Lock,
  Unlock,
  Target,
  TrendingUp,
  MoreHorizontal,
  Minimize2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DistributionWizard } from './DistributionWizard';
import { ChannelCategory, CATEGORY_INFO } from '@/lib/mediaplan-data';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  useMediaPlanStore,
  useChannelsWithMetrics,
  ChannelWithMetrics,
  ImpressionMode,
} from '@/hooks/use-media-plan-store';
import { useToast } from '@/hooks/use-toast';

// Helper component for "Breathing Room" inputs
function SmartInput({
  value,
  onChange,
  min = 0,
  max,
  className,
  placeholder,
  type = "number",
  disabled = false
}: {
  value: number | null | undefined;
  onChange: (val: number | null) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  const [localValue, setLocalValue] = useState<string>(value?.toString() ?? '');

  // Sync local value when external value changes (unless we are editing)
  useEffect(() => {
    // Only update if the parsed local value is different from new value
    // to avoid cursor jumping or overwrite if they are equivalent
    const parsed = parseFloat(localValue);
    if (value === null || value === undefined) {
      if (localValue !== '') setLocalValue('');
    } else if (parsed !== value) {
      setLocalValue(value.toString());
    }
  }, [value]); // relying only on value change

  const handleBlur = () => {
    if (localValue === '') {
      onChange(null);
      return;
    }
    let num = parseFloat(localValue);
    if (isNaN(num)) {
      // Revert to original
      setLocalValue(value?.toString() ?? '');
      return;
    }

    // Clamp
    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);

    // Update parent
    onChange(num);
    // Update local to match clamped
    setLocalValue(num.toString());
  };

  return (
    <Input
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

export function SettingsConsole() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [isDistributeWizardOpen, setIsDistributeWizardOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    category: 'Display/Programmatic' as ChannelCategory,
    baseCpm: 5,
    baseCtr: 1,
    baseCr: 2.5,
    baseRoas: 2,
    impressionMode: 'CPM' as ImpressionMode,
    fixedImpressions: 100000,
  });

  const { toast } = useToast();
  const { symbol, format: formatCurrency } = useCurrency();

  const {
    totalBudget,
    setTotalBudget,
    channels,
    globalMultipliers,
    setGlobalMultipliers,
    resetGlobalMultipliers,
    setChannelAllocation,
    setAllocations,
    normalizeAllocations,
    toggleChannelLock,
    updateChannelOverride,
    setImpressionMode,
    setFixedImpressions,
    addChannel,
    deleteChannel,
    rebalanceToTargets,
    resetAll,
    savePreset,
    loadPreset,
    deletePreset,
    presets,
  } = useMediaPlanStore();

  const channelsWithMetrics = useChannelsWithMetrics();

  const allocationTotal = channels.reduce((sum, ch) => sum + ch.allocationPct, 0);
  const hasTargets = globalMultipliers.cpaTarget !== null || globalMultipliers.roasTarget !== null;
  const hasPoorPerformers = channelsWithMetrics.some((ch) => ch.aboveCpaTarget || ch.belowRoasTarget);

  const handleAddChannel = useCallback(() => {
    if (!newChannel.name.trim()) {
      toast({ title: 'Error', description: 'Channel name is required', variant: 'destructive' });
      return;
    }

    addChannel(newChannel);
    setNewChannel({
      name: '',
      category: 'Display/Programmatic',
      baseCpm: 5,
      baseCtr: 1,
      baseCr: 2.5,
      baseRoas: 2,
      impressionMode: 'CPM',
      fixedImpressions: 100000,
    });
    setIsAddChannelOpen(false);
    toast({ title: 'Channel Added', description: `${newChannel.name} has been added.` });
  }, [addChannel, newChannel, toast]);

  const handleSavePreset = useCallback(() => {
    if (!newPresetName.trim()) {
      toast({ title: 'Error', description: 'Preset name is required', variant: 'destructive' });
      return;
    }
    savePreset(newPresetName.trim());
    setNewPresetName('');
    toast({ title: 'Preset Saved', description: `"${newPresetName}" has been saved.` });
  }, [newPresetName, savePreset, toast]);

  const handleRebalance = useCallback(() => {
    rebalanceToTargets();
    toast({ title: 'Rebalanced', description: 'Budget shifted from poor to good performers.' });
  }, [rebalanceToTargets, toast]);

  if (isCollapsed) {
    return (
      <div className="w-14 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-4 gap-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Separator className="bg-sidebar-border w-8" />
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" title="Settings Console">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" title="Budget">
          <DollarSign className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" title="Multipliers">
          <Sliders className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" title="Channels">
          <Layers className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-sidebar-primary" />
          <h3 className="font-semibold text-sidebar-foreground">Settings Console</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <Accordion type="multiple" defaultValue={['budget', 'multipliers', 'channels']} className="space-y-2">
            {/* Budget Controls */}
            <AccordionItem value="budget" className="border border-sidebar-border rounded-lg bg-sidebar-accent/30">
              <AccordionTrigger className="px-4 py-3 hover:bg-sidebar-accent/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-sidebar-primary" />
                  <span className="text-sm font-medium text-sidebar-foreground">Budget Controls</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                {/* Total Budget */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Total Budget</Label>
                    <Badge variant="outline" className="font-mono text-xs border-sidebar-border text-sidebar-foreground">
                      {formatCurrency(totalBudget)}
                    </Badge>
                  </div>
                  <Slider
                    value={[totalBudget]}
                    onValueChange={([v]) => setTotalBudget(v)}
                    min={10000}
                    max={1000000}
                    step={1000}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-sidebar-foreground/50">
                    <span>{symbol}10K</span>
                    <span>{symbol}1M</span>
                  </div>
                </div>

                {/* Channel Allocations */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-sidebar-foreground/70">Channel Allocations</Label>
                      <Badge
                        variant={Math.abs(allocationTotal - 100) < 0.1 ? "default" : "destructive"}
                        className="font-mono text-xs"
                      >
                        {allocationTotal.toFixed(1)}%
                      </Badge>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={normalizeAllocations}>
                          <Minimize2 className="mr-2 h-4 w-4" />
                          <span>Normalize</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsDistributeWizardOpen(true)}>
                          <Wand2 className="mr-2 h-4 w-4" />
                          <span>Auto-Distribute</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DistributionWizard
                      channels={channels}
                      onApply={setAllocations}
                      open={isDistributeWizardOpen}
                      onOpenChange={setIsDistributeWizardOpen}
                      showTrigger={false}
                    />
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {channelsWithMetrics.map((channel) => (
                      <div key={channel.id} className="space-y-1">
                        <div className="flex justify-between items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0"
                                onClick={() => toggleChannelLock(channel.id)}
                              >
                                {channel.locked ? (
                                  <Lock className="h-3 w-3 text-warning" />
                                ) : (
                                  <Unlock className="h-3 w-3 text-sidebar-foreground/40" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Click to lock this channel's budget %</TooltipContent>
                          </Tooltip>
                          <span
                            className={cn(
                              "text-xs truncate flex-1",
                              channel.aboveCpaTarget || channel.belowRoasTarget
                                ? "text-destructive"
                                : "text-sidebar-foreground/70"
                            )}
                            title={channel.name}
                          >
                            {channel.name.replace(/^(SEO|Paid|Affiliate|Influencer)\s*-\s*/, '')}
                          </span>
                          <span className="text-xs font-mono text-sidebar-foreground w-12 text-right">
                            {channel.allocationPct.toFixed(1)}%
                          </span>
                        </div>
                        <Slider
                          value={[channel.allocationPct]}
                          onValueChange={([v]) => setChannelAllocation(channel.id, v)}
                          min={0}
                          max={100}
                          step={0.5}
                          className="w-full"
                          disabled={channel.locked}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Global Multipliers */}
            <AccordionItem value="multipliers" className="border border-sidebar-border rounded-lg overflow-hidden bg-sidebar-accent/30">
              <AccordionTrigger className="px-4 py-3 hover:bg-sidebar-accent/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-sidebar-primary" />
                  <span className="text-sm font-medium text-sidebar-foreground">Global Multipliers</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                {/* Spend Multiplier */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Spend Multiplier</Label>
                    <Badge variant="outline" className="font-mono text-xs border-sidebar-border text-sidebar-foreground">
                      {globalMultipliers.spendMultiplier.toFixed(2)}x
                    </Badge>
                  </div>
                  <Slider
                    value={[globalMultipliers.spendMultiplier]}
                    onValueChange={([v]) => setGlobalMultipliers({ spendMultiplier: v })}
                    min={0.8}
                    max={2}
                    step={0.05}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-sidebar-foreground/50">
                    <span>0.8x</span>
                    <span>2.0x</span>
                  </div>
                </div>

                {/* Default CPM Override */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Default CPM ({symbol})</Label>
                    <SmartInput
                      value={globalMultipliers.defaultCpmOverride}
                      onChange={(val) => setGlobalMultipliers({ defaultCpmOverride: val })}
                      placeholder="Per-channel"
                      className="w-24 h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                    />
                  </div>
                  <p className="text-xs text-sidebar-foreground/50">Only applies to channels without CPM override</p>
                </div>

                {/* CTR Bump */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">CTR Bump</Label>
                    <Badge variant="outline" className="font-mono text-xs border-sidebar-border text-sidebar-foreground">
                      {globalMultipliers.ctrBump >= 0 ? '+' : ''}{globalMultipliers.ctrBump.toFixed(1)}%
                    </Badge>
                  </div>
                  <Slider
                    value={[globalMultipliers.ctrBump]}
                    onValueChange={([v]) => setGlobalMultipliers({ ctrBump: v })}
                    min={-2}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-sidebar-foreground/50">
                    <span>-2%</span>
                    <span>+2%</span>
                  </div>
                </div>

                <Separator className="bg-sidebar-border" />

                {/* CPA Target */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <Target className="h-3 w-3 text-sidebar-primary" />
                      <Label className="text-xs text-sidebar-foreground/70">CPA Target ({symbol})</Label>
                    </div>
                    <SmartInput
                      value={globalMultipliers.cpaTarget}
                      onChange={(val) => setGlobalMultipliers({ cpaTarget: val })}
                      placeholder="No target"
                      className="w-24 h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                    />
                  </div>
                </div>

                {/* ROAS Target */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-sidebar-primary" />
                      <Label className="text-xs text-sidebar-foreground/70">ROAS Target (x)</Label>
                    </div>
                    <SmartInput
                      value={globalMultipliers.roasTarget}
                      onChange={(val) => setGlobalMultipliers({ roasTarget: val })}
                      placeholder="No target"
                      className="w-24 h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                    />
                  </div>
                </div>

                {/* Rebalance Button */}
                {hasTargets && hasPoorPerformers && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleRebalance}
                    className="w-full gap-2"
                  >
                    <Target className="h-3 w-3" />
                    Rebalance to Meet Targets
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetGlobalMultipliers}
                  className="w-full gap-2 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Multipliers
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Channel Editor */}
            <AccordionItem value="channels" className="border border-sidebar-border rounded-lg overflow-hidden bg-sidebar-accent/30">
              <AccordionTrigger className="px-4 py-3 hover:bg-sidebar-accent/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sidebar-primary" />
                  <span className="text-sm font-medium text-sidebar-foreground">Channel Editor</span>
                  <Badge variant="secondary" className="text-xs">{channels.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                {/* Channel List */}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {channelsWithMetrics.map((channel) => (
                    <ChannelEditorItem
                      key={channel.id}
                      channel={channel}
                      updateChannelOverride={updateChannelOverride}
                      setImpressionMode={setImpressionMode}
                      setFixedImpressions={setFixedImpressions}
                      deleteChannel={deleteChannel}
                    />
                  ))}
                </div>

                {/* Add Channel Button */}
                <Dialog open={isAddChannelOpen} onOpenChange={setIsAddChannelOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      Add Channel
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add New Channel</DialogTitle>
                      <DialogDescription>
                        Create a new marketing channel with custom KPIs.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Channel Name</Label>
                        <Input
                          value={newChannel.name}
                          onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g., TikTok Ads"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={newChannel.category}
                          onValueChange={(v) => setNewChannel(prev => ({ ...prev, category: v as ChannelCategory }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                              <SelectItem key={key} value={key}>{info.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>CPM ({symbol})</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={newChannel.baseCpm}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, baseCpm: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>CTR (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={newChannel.baseCtr}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, baseCtr: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Conv. Rate (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={newChannel.baseCr}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, baseCr: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>ROAS (x)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={newChannel.baseRoas}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, baseRoas: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Impression Mode</Label>
                        <Select
                          value={newChannel.impressionMode}
                          onValueChange={(v) => setNewChannel(prev => ({ ...prev, impressionMode: v as ImpressionMode }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CPM">CPM-based (dynamic)</SelectItem>
                            <SelectItem value="FIXED">Fixed Impressions</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newChannel.impressionMode === 'FIXED' && (
                        <div className="space-y-2">
                          <Label>Fixed Impressions</Label>
                          <Input
                            type="number"
                            min="0"
                            value={newChannel.fixedImpressions}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, fixedImpressions: Math.max(0, parseInt(e.target.value) || 0) }))}
                          />
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddChannelOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddChannel}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Channel
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        {/* Save Preset */}
        <div className="flex gap-2">
          <Input
            placeholder="Preset name..."
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
            className="flex-1 h-8 text-sm bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
          />
          <Button
            size="sm"
            onClick={handleSavePreset}
            className="h-8 px-3 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Load Preset */}
        {presets.length > 0 && (
          <Select onValueChange={loadPreset}>
            <SelectTrigger className="h-8 text-sm bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
              <SelectValue placeholder="Load preset..." />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.name} value={preset.name}>{preset.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Reset All */}
        <Button
          variant="outline"
          size="sm"
          onClick={resetAll}
          className="w-full gap-2 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
        >
          <RotateCcw className="h-3 w-3" />
          Reset All
        </Button>
      </div>
    </div>
  );
}

// Channel Editor Item Component
function ChannelEditorItem({
  channel,
  updateChannelOverride,
  setImpressionMode,
  setFixedImpressions,
  deleteChannel,
}: {
  channel: ChannelWithMetrics;
  updateChannelOverride: (id: string, updates: any) => void;
  setImpressionMode: (id: string, mode: ImpressionMode) => void;
  setFixedImpressions: (id: string, impressions: number) => void;
  deleteChannel: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();
  const { symbol } = useCurrency();

  const handleDelete = () => {
    deleteChannel(channel.id);
    toast({ title: 'Channel Deleted', description: `${channel.name} has been removed.` });
  };

  const isWarning = channel.aboveCpaTarget || channel.belowRoasTarget;
  const [isMounting, setIsMounting] = useState(true);

  useEffect(() => {
    // Remove mounting class after animation
    const t = setTimeout(() => setIsMounting(false), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-500",
        "bg-sidebar-accent/50 border-sidebar-border",
        isWarning && "border-destructive/50 bg-destructive/10",
        isExpanded && "bg-sidebar-accent",
        isMounting && "animate-pulse scale-[1.02] bg-blue-500/20 border-blue-500/50"
      )}
    >
      <div
        className="flex items-center justify-between p-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: CATEGORY_INFO[channel.category]?.color }}
          />
          <span className={cn(
            "text-xs truncate",
            isWarning ? "text-destructive" : "text-sidebar-foreground"
          )}>
            {channel.name.replace(/^(SEO|Paid|Affiliate|Influencer)\s*-\s*/, '')}
          </span>
          {isWarning && (
            <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/20"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {isExpanded && (
        <div className="px-2 pb-2 space-y-3 border-t border-sidebar-border/50 pt-2">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs text-sidebar-foreground/60">Name</Label>
            <Input
              value={channel.name}
              onChange={(e) => updateChannelOverride(channel.id, { name: e.target.value })}
              className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label className="text-xs text-sidebar-foreground/60">Category</Label>
            <Select
              value={channel.category}
              onValueChange={(v) => updateChannelOverride(channel.id, { category: v as ChannelCategory })}
            >
              <SelectTrigger className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>{info.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Impression Mode */}
          <div className="space-y-1">
            <Label className="text-xs text-sidebar-foreground/60">Impression Mode</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={channel.impressionMode === 'FIXED'}
                onCheckedChange={(checked) => setImpressionMode(channel.id, checked ? 'FIXED' : 'CPM')}
              />
              <span className="text-xs text-sidebar-foreground">
                {channel.impressionMode === 'FIXED' ? 'Fixed Impressions' : 'CPM-based'}
              </span>
            </div>
          </div>

          {channel.impressionMode === 'FIXED' && (
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">Fixed Impressions</Label>
              <Input
                type="number"
                min="0"
                value={channel.fixedImpressions}
                onChange={(e) => setFixedImpressions(channel.id, Math.max(0, parseInt(e.target.value) || 0))}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
          )}

          {/* KPI Overrides Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">CPM ({symbol})</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={channel.overrideCpm ?? channel.baseCpm}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateChannelOverride(channel.id, {
                    overrideCpm: isNaN(val) ? null : Math.max(0, val)
                  });
                }}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">CTR (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={channel.overrideCtr ?? channel.baseCtr}
                onChange={(e) => updateChannelOverride(channel.id, {
                  overrideCtr: e.target.value ? parseFloat(e.target.value) : null
                })}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">Conv. Rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={channel.overrideCr ?? channel.baseCr}
                onChange={(e) => updateChannelOverride(channel.id, {
                  overrideCr: e.target.value ? parseFloat(e.target.value) : null
                })}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">ROAS (x)</Label>
              <Input
                type="number"
                step="0.1"
                value={channel.overrideRoas ?? channel.baseRoas}
                onChange={(e) => updateChannelOverride(channel.id, {
                  overrideRoas: e.target.value ? parseFloat(e.target.value) : null
                })}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs text-sidebar-foreground/60">CPA Override ({symbol})</Label>
              <Input
                type="number"
                step="0.1"
                value={channel.overrideCpa ?? ''}
                onChange={(e) => updateChannelOverride(channel.id, {
                  overrideCpa: e.target.value ? parseFloat(e.target.value) : null
                })}
                placeholder="Auto-calculated"
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
          </div>

          {/* Warnings */}
          {channel.warnings.length > 0 && (
            <div className="space-y-1 pt-1">
              {channel.warnings.map((warning, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
