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
  Settings2
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
  ChannelData,
} from '@/hooks/use-media-plan-store';
import { ChannelEditor } from './ChannelEditor';
import { useToast } from '@/hooks/use-toast';
import { BuyingModel, BUYING_MODEL_INFO, FAMILY_INFO, inferChannelFamily, inferBuyingModel, getLikelyModel } from '@/types/channel';

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
    const parsed = parseFloat(localValue);
    if (value === null || value === undefined) {
      if (localValue !== '') setLocalValue('');
    } else if (parsed !== value) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const handleBlur = () => {
    if (localValue === '') {
      onChange(null);
      return;
    }
    let num = parseFloat(localValue);
    if (isNaN(num)) {
      setLocalValue(value?.toString() ?? '');
      return;
    }

    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);

    onChange(num);
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

  // New Channel State
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState<ChannelCategory>('Display/Programmatic');
  const [newChannelModel, setNewChannelModel] = useState<BuyingModel>('CPM');
  const [newChannelPrice, setNewChannelPrice] = useState(5);

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
    updateChannelTypeConfig,
    updateChannelConfigField,
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

  // Auto-set model when category changes
  useEffect(() => {
    const likely = getLikelyModel(newChannelCategory);
    setNewChannelModel(likely);
  }, [newChannelCategory]);

  const handleAddChannel = useCallback(() => {
    if (!newChannelName.trim()) {
      toast({ title: 'Error', description: 'Channel name is required', variant: 'destructive' });
      return;
    }

    // Construct new channel data
    const family = inferChannelFamily(newChannelName);

    addChannel({
      name: newChannelName,
      category: newChannelCategory,
      family,
      buyingModel: newChannelModel,
      typeConfig: {
        family,
        buyingModel: newChannelModel,
        price: newChannelPrice,
        baselineMetrics: {
          ctr: 1.0,
          conversionRate: 2.5,
          aov: 150
        }
      }
    });

    setNewChannelName('');
    setNewChannelPrice(5);
    setIsAddChannelOpen(false);
    toast({ title: 'Channel Added', description: `${newChannelName} has been added.` });
  }, [addChannel, newChannelName, newChannelCategory, newChannelModel, newChannelPrice, toast]);

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

                {/* Automation Tools */}
                <div className="flex justify-between items-center bg-sidebar-accent/50 p-2 rounded-md">
                  <span className="text-xs text-muted-foreground">Tools</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setIsDistributeWizardOpen(true)} title="Auto Distribute">
                      <Wand2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={normalizeAllocations} title="Normalize to 100%">
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <DistributionWizard
                  channels={channels}
                  onApply={setAllocations}
                  open={isDistributeWizardOpen}
                  onOpenChange={setIsDistributeWizardOpen}
                  showTrigger={false}
                />

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {channelsWithMetrics.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-2 text-xs">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 shrink-0"
                        onClick={() => toggleChannelLock(channel.id)}
                      >
                        {channel.locked ? <Lock className="h-3 w-3 text-warning" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                      <span className="truncate flex-1">{channel.name}</span>
                      <span className={cn(
                        "font-mono w-10 text-right",
                        (channel.aboveCpaTarget || channel.belowRoasTarget) ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {channel.allocationPct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
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
                  <p className="text-xs text-sidebar-foreground/50">Overrules CPM channels</p>
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

            {/* Channel List / Editor */}
            <AccordionItem value="channels" className="border border-sidebar-border rounded-lg overflow-hidden bg-sidebar-accent/30">
              <AccordionTrigger className="px-4 py-3 hover:bg-sidebar-accent/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sidebar-primary" />
                  <span className="text-sm font-medium text-sidebar-foreground">Channels</span>
                  <Badge variant="secondary" className="text-xs">{channels.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                {/* Channel List */}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {channelsWithMetrics.map((channel) => (
                    <ChannelListItem
                      key={channel.id}
                      channel={channel}
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
                        Create a new marketing channel. You can configure precise KPIs after adding.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Channel Name</Label>
                        <Input
                          value={newChannelName}
                          onChange={(e) => setNewChannelName(e.target.value)}
                          placeholder="e.g., TikTok Ads"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={newChannelCategory}
                          onValueChange={(v) => setNewChannelCategory(v as ChannelCategory)}
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

                      <div className="space-y-2">
                        <Label>Buying Model</Label>
                        <Select
                          value={newChannelModel}
                          onValueChange={(v) => setNewChannelModel(v as BuyingModel)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(BUYING_MODEL_INFO).map(([key, info]) => (
                              <SelectItem key={key} value={key}>{info.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Price / Base Cost</Label>
                        <Input
                          type="number"
                          value={newChannelPrice}
                          onChange={(e) => setNewChannelPrice(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-xs text-muted-foreground">Acts as CPM, CPC, CPA, or Monthly Fee depending on model.</p>
                      </div>

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

function ChannelListItem({
  channel,
  deleteChannel,
}: {
  channel: ChannelWithMetrics;
  deleteChannel: (id: string) => void;
}) {
  const { toast } = useToast();

  const handleDelete = () => {
    deleteChannel(channel.id);
    toast({ title: 'Channel Deleted', description: `${channel.name} has been removed.` });
  };

  const isWarning = channel.aboveCpaTarget || channel.belowRoasTarget;

  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-300",
        "bg-sidebar-accent/50 border-sidebar-border",
        isWarning && "border-destructive/50 bg-destructive/10"
      )}
    >
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: CATEGORY_INFO[channel.category]?.color }}
          />
          <span className={cn(
            "text-xs truncate max-w-[120px]",
            isWarning ? "text-destructive" : "text-sidebar-foreground"
          )}>
            {channel.name}
          </span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 scale-90 origin-left">
            {channel.buyingModel || 'CPM'}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <ChannelEditor channel={channel} />

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/20"
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
