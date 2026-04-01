import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
// FIX: Use the requested relative import for the store
// FIX: Use the requested relative import for the store
import { useProjectStore } from '../../store/useProjectStore';
import { ChannelWithMetrics, useChannelsWithMetrics } from '@/hooks/use-media-plan-store'; // Keep types/helpers valid

// FIX: Use relative imports for UI components as requested
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Slider } from '../../components/ui/slider';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

import {
  Plus,
  Trash2,
  Settings,
  RotateCcw,
  Layers,
  Wand2,
  Tag,
  Folder,
  BadgeDollarSign,
  Percent,
} from 'lucide-react';
import { CATEGORY_INFO } from '@/lib/mediaplan-data';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { ChannelEditor } from './ChannelEditor';
import { OptimizationControls } from './OptimizationControls';
import { ChannelCategory } from '@/lib/mediaplan-data';
import {
  BuyingModel,
  BUYING_MODEL_INFO,
  inferChannelFamily,
  getLikelyModel,
} from '@/types/channel';

const BudgetWizard = lazy(() =>
  import('./BudgetWizard').then((m) => ({ default: m.BudgetWizard }))
);

// ------------------------------------------------------------------
// SUB-COMPONENT: GlobalMultipliers
// ------------------------------------------------------------------
const GlobalMultipliers: React.FC = () => {
  // We can use the same store hook here
  const {
    globalMultipliers = { spendMultiplier: 1, cpaTarget: null, roasTarget: null },
    setGlobalMultipliers,
    totalBudget,
  } = useProjectStore();
  const { symbol, format } = useCurrency();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      {/* Spend Multiplier */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <Label className="text-slate-400">Spend Multiplier</Label>
          <span className="font-mono text-slate-200">
            {globalMultipliers.spendMultiplier.toFixed(2)}x
          </span>
        </div>
        <Slider
          value={[globalMultipliers.spendMultiplier]}
          onValueChange={([v]) => setGlobalMultipliers({ spendMultiplier: v })}
          onValueCommit={([v]) => {
            const newBudget = totalBudget * v;
            toast({
              title: 'Budget Scaled',
              description: `Effective budget is now ${format(newBudget)}`,
            });
          }}
          min={0.8}
          max={2}
          step={0.05}
          className="mt-1"
        />
      </div>

      {/* Targets */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500 uppercase tracking-wider">CPA Target</Label>
          <div className="relative">
            <span className="absolute left-2 top-2.5 text-sm text-slate-500">{symbol}</span>
            <Input
              type="number"
              value={globalMultipliers.cpaTarget || ''}
              onChange={(e) =>
                setGlobalMultipliers({
                  cpaTarget: e.target.value ? parseFloat(e.target.value) : null,
                })
              }
              placeholder="None"
              className="h-10 pl-7 text-sm bg-[#020617] border-slate-700 text-slate-200"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500 uppercase tracking-wider">ROAS Target</Label>
          <div className="relative">
            <span className="absolute left-2 top-2.5 text-sm text-slate-500">x</span>
            <Input
              type="number"
              value={globalMultipliers.roasTarget || ''}
              onChange={(e) =>
                setGlobalMultipliers({
                  roasTarget: e.target.value ? parseFloat(e.target.value) : null,
                })
              }
              placeholder="None"
              className="h-10 pl-7 text-sm bg-[#020617] border-slate-700 text-slate-200"
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

  const categoryDotClass: Record<ChannelCategory, string> = {
    'SEO/Content': 'bg-[hsl(var(--chart-1))]',
    'Display/Programmatic': 'bg-[hsl(var(--chart-2))]',
    Affiliate: 'bg-[hsl(var(--chart-3))]',
    'Paid Social': 'bg-[hsl(var(--chart-4))]',
    'Paid Search': 'bg-[hsl(var(--chart-5))]',
    'Offline/TV': 'bg-[hsl(var(--muted-foreground))]',
    'Email/SMS': 'bg-[hsl(var(--primary))]',
    Other: 'bg-[hsl(var(--secondary))]',
  };

  const handleDelete = () => {
    deleteChannel(channel.id);
    toast({ title: 'Channel Deleted', description: `${channel.name} has been removed.` });
  };

  const isWarning = channel.aboveCpaTarget || channel.belowRoasTarget;

  return (
    <div
      className={cn(
        'group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:border-slate-600 transition-all mb-2',
        isWarning && 'border-red-900/50 bg-red-900/10'
      )}
    >
      {/* LEFT: Data Column (Never obscured) */}
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        {/* Status Dot */}
        <div
          className={cn(
            'w-2.5 h-2.5 rounded-full shrink-0',
            channel.isActive ? categoryDotClass[channel.category] : 'bg-slate-600'
          )}
        />

        <div className="flex flex-col min-w-0">
          <span
            className={cn(
              'text-sm font-medium truncate',
              isWarning ? 'text-red-400' : 'text-slate-200'
            )}
          >
            {channel.name}
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="uppercase tracking-wider font-bold text-[10px] bg-slate-800 px-1.5 rounded">
              {channel.buyingModel}
            </span>
            <span className="truncate text-slate-400">
              {channel.allocationPct.toFixed(1)}% Alloc
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT: Action Icons (Visible on group-hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
        <ChannelEditor
          channel={channel}
          trigger={
            <button
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
              title="Configure"
              onClick={(e) => e.stopPropagation()}
            >
              <Settings className="w-4 h-4" />
            </button>
          }
        />

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// MAIN COMPONENT: SettingsConsole
// ------------------------------------------------------------------
export const SettingsConsole: React.FC = () => {
  const { channels, addChannel, resetAll, totalBudget, globalMultipliers } = useProjectStore();
  const channelsWithMetrics = useChannelsWithMetrics();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<ChannelCategory>('Display/Programmatic');
  const [newModel, setNewModel] = useState<BuyingModel>('CPM');
  const [newPrice, setNewPrice] = useState(5);

  const modelChoices: BuyingModel[] = ['CPM', 'CPA', 'REV_SHARE', 'FLAT_FEE'];

  const priceMeta = useMemo(() => {
    switch (newModel) {
      case 'CPM':
        return { label: 'CPM Price', prefix: '$', suffix: 'per 1K' };
      case 'CPA':
        return { label: 'Target CPA', prefix: '$', suffix: 'per FTD' };
      case 'REV_SHARE':
        return { label: 'RevShare %', prefix: '', suffix: '%' };
      case 'FLAT_FEE':
        return { label: 'Flat Fee', prefix: '$', suffix: 'total' };
      default:
        return { label: 'Price', prefix: '$', suffix: '' };
    }
  }, [newModel]);

  useEffect(() => {
    setNewModel(getLikelyModel(newCat));
  }, [newCat]);

  const handleCreateChannel = useCallback(() => {
    // (Keep existing logic)
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
        baselineMetrics: { ctr: 1.0, conversionRate: 1.5, aov: 100 },
      },
    });
    setNewName('');
    setIsAddOpen(false);
    toast({ title: 'Channel Added', description: `${newName} created successfully.` });
  }, [addChannel, newCat, newModel, newName, newPrice, toast]);

  const channelItems = useMemo(
    () => channelsWithMetrics.map((channel) => <ChannelItem key={channel.id} channel={channel} />),
    [channelsWithMetrics]
  );

  return (
    // ROOT CONTAINER: Deep Blue Background
    <div className="h-full w-full bg-[#020617] text-slate-100 flex flex-col overflow-hidden">
      {/* <div className="text-yellow-500 font-mono">DEBUG MODE: Settings Console</div> */}
      <div className="p-4 border-b border-slate-800 space-y-4 flex-shrink-0 bg-[#020617] z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-500" />
            <h2 className="font-bold text-base tracking-tight text-white">MediaPlan Pro</h2>
          </div>

          <div className="flex items-center gap-1">
            <Suspense fallback={null}>
              <BudgetWizard
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                    title="Auto-Distribute"
                  >
                    <Wand2 className="w-5 h-5" />
                  </Button>
                }
              />
            </Suspense>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    'Are you sure you want to reset the entire plan? This cannot be undone (except via Undo).'
                  )
                ) {
                  resetAll();
                  toast({
                    title: 'Plan Reset',
                    description: 'Use Undo (Ctrl+Z) to restore if needed.',
                  });
                }
              }}
              className="text-sm text-slate-500 hover:text-white h-9 px-3"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Reset
            </Button>
          </div>
        </div>

        {/* Render Global Multipliers safely in a Card */}
        <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-800 shadow-sm mb-2">
          <GlobalMultipliers />
          <div className="mt-3">
            <OptimizationControls />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
              Active Channels
            </span>
          </div>
          <span className="bg-indigo-500/10 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-mono border border-indigo-500/20">
            {channels.length}
          </span>
        </div>

        <div className="space-y-3 pb-10">
          {/* <div className="text-slate-500 text-xs">Debugging List...</div> */}
          {channelItems}
        </div>

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
          <DialogContent
            overlayClassName="backdrop-blur-md bg-slate-950/80"
            className="bg-slate-900 border border-slate-700 shadow-2xl rounded-xl p-6"
          >
            <DialogHeader>
              <DialogTitle className="text-slate-100">Add New Channel</DialogTitle>
              <DialogDescription className="text-slate-400">
                Configure category, buying model, and pricing defaults.
              </DialogDescription>
            </DialogHeader>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 py-4"
            >
              <div className="space-y-2 col-span-full">
                <Label className="text-slate-300">Name</Label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Channel Name"
                    className="pl-9 bg-slate-800 shadow-inner border-slate-700 transition-all focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Category</Label>
                  <Select value={newCat} onValueChange={(v) => setNewCat(v as ChannelCategory)}>
                    <SelectTrigger className="bg-slate-800 shadow-inner border-slate-700 transition-all focus:ring-2 focus:ring-cyan-500/50">
                      <Folder className="w-4 h-4 text-slate-500 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                      {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Buying Model</Label>
                  <Select value={newModel} onValueChange={(v) => setNewModel(v as BuyingModel)}>
                    <SelectTrigger className="bg-slate-800 shadow-inner border-slate-700 transition-all focus:ring-2 focus:ring-cyan-500/50">
                      <BadgeDollarSign className="w-4 h-4 text-slate-500 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                      {modelChoices.map((model) => (
                        <SelectItem key={model} value={model}>
                          {BUYING_MODEL_INFO[model]?.name || model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">{priceMeta.label}</Label>
                <div className="relative">
                  {priceMeta.prefix ? (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                      {priceMeta.prefix}
                    </span>
                  ) : (
                    <Percent className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  )}
                  <Input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                    className={cn(
                      'bg-slate-800 shadow-inner border-slate-700 transition-all focus:ring-2 focus:ring-cyan-500/50',
                      'pr-16',
                      priceMeta.prefix ? 'pl-7' : 'pl-9'
                    )}
                  />
                  {priceMeta.suffix ? (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                      {priceMeta.suffix}
                    </span>
                  ) : null}
                </div>
              </div>
            </motion.div>
            <DialogFooter>
              <Button
                onClick={handleCreateChannel}
                className="bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(8,145,178,0.4)] transition-all font-semibold"
              >
                Create Channel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
