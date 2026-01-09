import { useState, useCallback, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Settings,
  DollarSign,
  Sliders,
  Layers,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Lock,
  Unlock,
  Target,
  TrendingUp,
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
import { cn } from '@/lib/utils';
import { DistributionWizard } from './DistributionWizard';
import { ChannelCategory, CATEGORY_INFO } from '@/lib/mediaplan-data';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  useMediaPlanStore,
  useChannelsWithMetrics,
  ChannelWithMetrics,
} from '@/hooks/use-media-plan-store';
import { ChannelEditor } from './ChannelEditor';
import { useToast } from '@/hooks/use-toast';
import { BuyingModel, BUYING_MODEL_INFO, inferChannelFamily, getLikelyModel } from '@/types/channel';

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

  useEffect(() => {
    if (value === null || value === undefined) {
      if (localValue !== '') setLocalValue('');
    } else if (parseFloat(localValue) !== value) {
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
    setAllocations,
    normalizeAllocations,
    toggleChannelLock,
    addChannel,
    deleteChannel,
    rebalanceToTargets,
    resetAll,
    savePreset,
    loadPreset,
    presets,
  } = useMediaPlanStore();

  const channelsWithMetrics = useChannelsWithMetrics();
  const hasTargets = globalMultipliers.cpaTarget !== null || globalMultipliers.roasTarget !== null;
  const hasPoorPerformers = channelsWithMetrics.some((ch) => ch.aboveCpaTarget || ch.belowRoasTarget);

  useEffect(() => {
    const likely = getLikelyModel(newChannelCategory);
    setNewChannelModel(likely);
  }, [newChannelCategory]);

  const handleAddChannel = useCallback(() => {
    if (!newChannelName.trim()) {
      toast({ title: 'Error', description: 'Channel name is required', variant: 'destructive' });
      return;
    }
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
        baselineMetrics: { ctr: 1.0, conversionRate: 2.5, aov: 150 }
      }
    });
    setNewChannelName('');
    setIsAddChannelOpen(false);
    toast({ title: 'Channel Added', description: `${newChannelName} has been added.` });
  }, [addChannel, newChannelName, newChannelCategory, newChannelModel, newChannelPrice, toast]);

  const handleSavePreset = useCallback(() => {
    if (!newPresetName.trim()) return;
    savePreset(newPresetName.trim());
    setNewPresetName('');
    toast({ title: 'Preset Saved', description: `"${newPresetName}" has been saved.` });
  }, [newPresetName, savePreset, toast]);

  const handleRebalance = Callback(() => {
    rebalanceToTargets();
    toast({ title: 'Rebalanced', description: 'Budget shifted from poor to good performers.' });
  }, [rebalanceToTargets, toast]);

  return (
    // CRITICAL: LIQUID CONTAINER - NO FIXED POSITIONING
    <div className="h-full w-full overflow-y-auto bg-slate-900 text-slate-100 p-4 pb-24">

      {/* Header Area */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-slate-400" />
          <h2 className="font-semibold text-slate-100">Settings Console</h2>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">

        {/* Budget Controls */}
        <div className="space-y-4 rounded-lg bg-slate-800/30 p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-blue-400" />
            <h3 className="font-medium text-sm text-slate-300">Budget Controls</h3>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-slate-400">Total Budget</Label>
              <Badge variant="outline" className="font-mono text-xs border-slate-700 text-slate-300">
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
          </div>

          <div className="flex justify-between items-center bg-slate-800/50 p-2 rounded-md">
            <span className="text-xs text-slate-500">Tools</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => setIsDistributeWizardOpen(true)} title="Auto Distribute" className="h-6 w-6">
                <Wand2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" onClick={normalizeAllocations} title="Normalize" className="h-6 w-6">
                <Minimize2 className="h-3 w-3" />
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
        </div>

        {/* Global Multipliers */}
        <div className="space-y-4 rounded-lg bg-slate-800/30 p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Sliders className="h-4 w-4 text-blue-400" />
            <h3 className="font-medium text-sm text-slate-300">Global Multipliers</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs text-slate-400">Spend Multiplier</Label>
                <span className="text-xs font-mono">{globalMultipliers.spendMultiplier.toFixed(2)}x</span>
              </div>
              <Slider
                value={[globalMultipliers.spendMultiplier]}
                onValueChange={([v]) => setGlobalMultipliers({ spendMultiplier: v })}
                min={0.8} max={2} step={0.05}
              />
            </div>

            {/* CPA / ROAS Targets */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">CPA Target</Label>
                <SmartInput
                  value={globalMultipliers.cpaTarget}
                  onChange={(val) => setGlobalMultipliers({ cpaTarget: val })}
                  placeholder="None"
                  className="h-7 text-xs bg-slate-800 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">ROAS Target</Label>
                <SmartInput
                  value={globalMultipliers.roasTarget}
                  onChange={(val) => setGlobalMultipliers({ roasTarget: val })}
                  placeholder="None"
                  className="h-7 text-xs bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            {hasTargets && hasPoorPerformers && (
              <Button variant="secondary" size="sm" onClick={handleRebalance} className="w-full h-7 text-xs">
                Rebalance
              </Button>
            )}
          </div>
        </div>

        {/* Channels List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-400" />
              <h3 className="font-medium text-sm text-slate-300">Channels</h3>
            </div>
            <span className="bg-slate-800 text-xs px-2 py-0.5 rounded-full text-slate-400">{channels.length}</span>
          </div>

          <div className="space-y-2">
            {channelsWithMetrics.map(channel => (
              <ChannelListItem key={channel.id} channel={channel} deleteChannel={deleteChannel} />
            ))}
          </div>

          <Dialog open={isAddChannelOpen} onOpenChange={setIsAddChannelOpen}>
            <DialogTrigger asChild>
              <Button className="w-full mt-4 border-2 border-dashed border-slate-800 bg-transparent text-slate-400 hover:border-blue-500 hover:text-blue-500 hover:bg-slate-900/50">
                + Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Channel</DialogTitle>
                <DialogDescription>Create a new marketing channel.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Channel Name</Label>
                  <Input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="e.g. TikTok" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={newChannelCategory} onValueChange={(v) => setNewChannelCategory(v as ChannelCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                        <SelectItem key={key} value={key}>{info.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Buying Model</Label>
                  <Select value={newChannelModel} onValueChange={(v) => setNewChannelModel(v as BuyingModel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(BUYING_MODEL_INFO).map(([key, info]) => (
                        <SelectItem key={key} value={key}>{info.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Price</Label>
                  <Input type="number" value={newChannelPrice} onChange={(e) => setNewChannelPrice(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddChannelOpen(false)}>Cancel</Button>
                <Button onClick={handleAddChannel}>Add Channel</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Footer Presets */}
        <div className="pt-6 border-t border-slate-800 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Preset name..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="h-8 text-xs bg-slate-800 border-slate-700"
            />
            <Button size="sm" onClick={handleSavePreset} className="h-8 w-8 p-0"><Save className="h-4 w-4" /></Button>
          </div>
          {presets.length > 0 && (
            <Select onValueChange={loadPreset}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700"><SelectValue placeholder="Load Preset" /></SelectTrigger>
              <SelectContent>
                {presets.map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="destructive" size="sm" onClick={resetAll} className="w-full h-8 text-xs mt-2">
            <RotateCcw className="h-3 w-3 mr-2" /> Reset All
          </Button>
        </div>

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
    <div className={cn(
      "rounded-md border p-2 transition-all duration-200",
      "bg-slate-800/40 border-slate-700 hover:border-slate-600",
      isWarning && "border-red-900/50 bg-red-900/10"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: CATEGORY_INFO[channel.category]?.color }}
          />
          <span className={cn(
            "text-xs font-medium truncate max-w-[120px]",
            isWarning ? "text-red-400" : "text-slate-300"
          )}>
            {channel.name}
          </span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-slate-500 border-slate-700">
            {channel.buyingModel || 'CPM'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <ChannelEditor channel={channel} />
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-600 hover:text-red-400" onClick={handleDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
