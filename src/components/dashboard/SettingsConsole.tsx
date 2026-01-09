import React, { useState, useEffect, useCallback } from 'react';
// FIX: Use the requested relative import for the store
import { useProjectStore } from '../../store/useProjectStore';
import { ChannelWithMetrics, useChannelsWithMetrics } from '@/hooks/use-media-plan-store'; // Keep types/helpers valid

// FIX: Use relative imports for UI components as requested
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Slider } from '../../components/ui/slider';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

import {
  Plus,
  Trash2,
  Settings,
  RotateCcw,
  Layers,
  Wand2
} from 'lucide-react';
import { CATEGORY_INFO } from '@/lib/mediaplan-data';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { ChannelEditor } from './ChannelEditor';
import { BudgetWizard } from './BudgetWizard';
import { ChannelCategory } from '@/lib/mediaplan-data';
import { BuyingModel, BUYING_MODEL_INFO, inferChannelFamily, getLikelyModel } from '@/types/channel';

// ------------------------------------------------------------------
// SUB-COMPONENT: GlobalMultipliers
// ------------------------------------------------------------------
const GlobalMultipliers: React.FC = () => {
  // We can use the same store hook here
  const { globalMultipliers, setGlobalMultipliers } = useProjectStore();
  const { symbol } = useCurrency();

  return (
    <div className="space-y-4">
      {/* Spend Multiplier */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <Label className="text-slate-400">Spend Multiplier</Label>
          <span className="font-mono text-slate-200">{globalMultipliers.spendMultiplier.toFixed(2)}x</span>
        </div>
        <Slider
          value={[globalMultipliers.spendMultiplier]}
          onValueChange={([v]) => setGlobalMultipliers({ spendMultiplier: v })}
          min={0.8} max={2} step={0.05}
          className="mt-1"
        />
      </div>

      {/* Targets */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500 uppercase tracking-wider">CPA Target</Label>
          <div className="relative">
            <span className="absolute left-2 top-1.5 text-xs text-slate-500">{symbol}</span>
            <Input
              type="number"
              value={globalMultipliers.cpaTarget || ''}
              onChange={(e) => setGlobalMultipliers({ cpaTarget: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="None"
              className="h-8 pl-6 text-xs bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500 uppercase tracking-wider">ROAS Target</Label>
          <div className="relative">
            <span className="absolute left-2 top-1.5 text-xs text-slate-500">x</span>
            <Input
              type="number"
              value={globalMultipliers.roasTarget || ''}
              onChange={(e) => setGlobalMultipliers({ roasTarget: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="None"
              className="h-8 pl-6 text-xs bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// SUB-COMPONENT: ChannelItem
// ------------------------------------------------------------------
const ChannelItem: React.FC<{ channel: ChannelWithMetrics }> = ({ channel }) => {
  const { deleteChannel } = useProjectStore();
  const { toast } = useToast();

  const handleDelete = () => {
    deleteChannel(channel.id);
    toast({ title: 'Channel Deleted', description: `${channel.name} has been removed.` });
  };

  const isWarning = channel.aboveCpaTarget || channel.belowRoasTarget;

  return (
    <div className={cn(
      "group relative flex items-center justify-between p-3 rounded-lg border transition-all duration-200",
      "bg-slate-800/40 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/80",
      isWarning && "border-red-900/50 bg-red-900/10"
    )}>
      {/* Left Info */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-slate-900/50"
          style={{ backgroundColor: CATEGORY_INFO[channel.category]?.color || '#cbd5e1' }}
        />
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "text-sm font-medium pr-2 break-words leading-tight", // FIX: Replaced truncate with break-words
            isWarning ? "text-red-400" : "text-slate-200 group-hover:text-white"
          )}>
            {channel.name}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-slate-700/50 text-slate-400 border-0">
              {channel.buyingModel}
            </Badge>
            <span className="text-[10px] text-slate-600 truncate">
              {channel.allocationPct.toFixed(1)}% Alloc
            </span>
          </div>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <ChannelEditor channel={channel} />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md"
          onClick={handleDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};


// ------------------------------------------------------------------
// MAIN COMPONENT: SettingsConsole
// ------------------------------------------------------------------
export const SettingsConsole: React.FC = () => {
  // Grab data from store (User requested 'useProjectStore')
  const {
    channels,
    addChannel,
    resetAll // Note: Shim might need this alias or we use properties that match
    // The shim just exports useMediaPlanStore, so it has resetAll, not resetProject.
    // We will stick to the existing property names to avoid logic errors unless user renamed them in store too.
    // User prompt said "const { channels, addChannel, resetProject } = useProjectStore();"
    // But we know 'resetProject' doesn't exist on the store. 'resetAll' does.
    // We'll keep 'resetAll' here to ensure it works, effectively "fixing" the user's snippet logic instantly.
  } = useProjectStore();

  const channelsWithMetrics = useChannelsWithMetrics();
  const { toast } = useToast();

  // Add Channel State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<ChannelCategory>('Display/Programmatic');
  const [newModel, setNewModel] = useState<BuyingModel>('CPM');
  const [newPrice, setNewPrice] = useState(5);

  useEffect(() => {
    setNewModel(getLikelyModel(newCat));
  }, [newCat]);

  const handleCreateChannel = () => {
    if (!newName.trim()) return;
    const family = inferChannelFamily(newName);
    addChannel({
      name: newName,
      category: newCat,
      family,
      buyingModel: newModel,
      typeConfig: {
        family,
        buyingModel: newModel,
        price: newPrice,
        baselineMetrics: { ctr: 1.0, conversionRate: 1.5, aov: 100 }
      }
    });
    setNewName('');
    setIsAddOpen(false);
    toast({ title: "Channel Added", description: `${newName} created successfully.` });
  };

  return (
    // ROOT CONTAINER: Pure Liquid. Fills the Grid Cell.
    <div className="h-full w-full bg-slate-900 text-slate-100 flex flex-col overflow-hidden">

      {/* 1. HEADER & GLOBAL CONTROLS */}
      <div className="p-4 border-b border-slate-800 space-y-4 flex-shrink-0 bg-slate-900 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-500" />
            <h2 className="font-bold text-base tracking-tight text-white">MediaPlan Pro</h2>
          </div>

          <div className="flex items-center gap-1">
            <BudgetWizard
              trigger={
                <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10" title="Auto-Distribute">
                  <Wand2 className="w-4 h-4" />
                </Button>
              }
            />
            <Button variant="ghost" size="sm" onClick={resetAll} className="text-xs text-slate-500 hover:text-white h-7 px-2">
              <RotateCcw className="w-3 h-3 mr-1.5" /> Reset
            </Button>
          </div>
        </div>

        {/* Render Global Multipliers safely */}
        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 shadow-inner">
          <GlobalMultipliers />
        </div>
      </div>

      {/* 2. SCROLLABLE CHANNEL LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Active Channels</span>
          </div>
          <span className="bg-indigo-500/10 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-mono border border-indigo-500/20">
            {channels.length}
          </span>
        </div>

        {/* List Items */}
        <div className="space-y-3 pb-10">
          {channelsWithMetrics.map((channel) => (
            <ChannelItem key={channel.id} channel={channel} />
          ))}
        </div>

        {/* Add Button */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full border-2 border-dashed border-slate-800 bg-transparent text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/5 h-12 rounded-xl transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Channel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Channel</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Channel Name" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newCat} onValueChange={(v) => setNewCat(v as ChannelCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_INFO).map(([key, info]) => <SelectItem key={key} value={key}>{info.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" value={newPrice} onChange={e => setNewPrice(parseFloat(e.target.value))} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateChannel}>Create Channel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>

    </div>
  );
};
