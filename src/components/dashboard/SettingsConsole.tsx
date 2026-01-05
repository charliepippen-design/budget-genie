import { useState, useCallback } from 'react';
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
  X,
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
import { formatCurrency, ChannelCategory, CATEGORY_INFO } from '@/lib/mediaplan-data';
import { GlobalMultipliers, ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import { Channel } from '@/lib/mediaplan-data';
import { useToast } from '@/hooks/use-toast';

interface SettingsConsoleProps {
  totalBudget: number;
  setTotalBudget: (value: number) => void;
  channels: Channel[];
  channelAllocations: Record<string, number>;
  setChannelAllocation: (channelId: string, percentage: number) => void;
  normalizeAllocations: () => void;
  globalMultipliers: GlobalMultipliers;
  setGlobalMultipliers: (updates: Partial<GlobalMultipliers>) => void;
  resetGlobalMultipliers: () => void;
  channelsWithMetrics: ChannelWithMetrics[];
  addChannel: (channel: Omit<Channel, 'id' | 'basePercentage'>) => void;
  updateChannel: (id: string, updates: Partial<Omit<Channel, 'id'>>) => void;
  deleteChannel: (id: string) => void;
  resetAll: () => void;
  savePreset: (name: string) => void;
  presets: string[];
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;
}

export function SettingsConsole({
  totalBudget,
  setTotalBudget,
  channels,
  channelAllocations,
  setChannelAllocation,
  normalizeAllocations,
  globalMultipliers,
  setGlobalMultipliers,
  resetGlobalMultipliers,
  channelsWithMetrics,
  addChannel,
  updateChannel,
  deleteChannel,
  resetAll,
  savePreset,
  presets,
  loadPreset,
  deletePreset,
}: SettingsConsoleProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isAddChannelOpen, setIsAddChannelOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    category: 'paid' as ChannelCategory,
    baseSpend: 1000,
    cpm: 5,
    ctr: 1,
    estimatedRoas: 2,
  });
  const { toast } = useToast();

  const allocationTotal = Object.values(channelAllocations).reduce((sum, v) => sum + v, 0);

  const handleAddChannel = useCallback(() => {
    if (!newChannel.name.trim()) {
      toast({ title: 'Error', description: 'Channel name is required', variant: 'destructive' });
      return;
    }
    
    addChannel(newChannel);
    setNewChannel({ name: '', category: 'paid', baseSpend: 1000, cpm: 5, ctr: 1, estimatedRoas: 2 });
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
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title="Settings Console"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title="Budget"
        >
          <DollarSign className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title="Multipliers"
        >
          <Sliders className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title="Channels"
        >
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
            <AccordionItem value="budget" className="border border-sidebar-border rounded-lg overflow-hidden bg-sidebar-accent/30">
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
                    <span>€10K</span>
                    <span>€1M</span>
                  </div>
                </div>

                {/* Channel Allocations */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Channel Allocations</Label>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={Math.abs(allocationTotal - 100) < 0.1 ? "default" : "destructive"}
                        className="font-mono text-xs"
                      >
                        {allocationTotal.toFixed(1)}%
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={normalizeAllocations}
                        className="h-6 px-2 text-xs text-sidebar-foreground hover:bg-sidebar-accent"
                      >
                        Normalize
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {channelsWithMetrics.map((channel) => (
                      <div key={channel.id} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-sidebar-foreground/70 truncate max-w-[140px]" title={channel.name}>
                            {channel.name.replace(/^(SEO|Paid|Affiliate|Influencer)\s*-\s*/, '')}
                          </span>
                          <span className="text-xs font-mono text-sidebar-foreground">
                            {channel.currentPercentage.toFixed(1)}%
                          </span>
                        </div>
                        <Slider
                          value={[channel.currentPercentage]}
                          onValueChange={([v]) => setChannelAllocation(channel.id, v)}
                          min={0}
                          max={50}
                          step={0.5}
                          className="w-full"
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

                {/* CPM Override */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">CPM Override (avg)</Label>
                    <Input
                      type="number"
                      value={globalMultipliers.cpmOverride ?? ''}
                      onChange={(e) => setGlobalMultipliers({ 
                        cpmOverride: e.target.value ? parseFloat(e.target.value) : null 
                      })}
                      placeholder="Individual"
                      className="w-24 h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                    />
                  </div>
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

                {/* CPA Target */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">CPA Target</Label>
                    <Input
                      type="number"
                      value={globalMultipliers.cpaTarget ?? ''}
                      onChange={(e) => setGlobalMultipliers({ 
                        cpaTarget: e.target.value ? parseFloat(e.target.value) : null 
                      })}
                      placeholder="No target"
                      className="w-24 h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                    />
                  </div>
                </div>

                {/* ROAS Target */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">ROAS Target</Label>
                    <Input
                      type="number"
                      value={globalMultipliers.roasTarget ?? ''}
                      onChange={(e) => setGlobalMultipliers({ 
                        roasTarget: e.target.value ? parseFloat(e.target.value) : null 
                      })}
                      placeholder="No target"
                      className="w-24 h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                    />
                  </div>
                </div>

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
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {channelsWithMetrics.map((channel) => (
                    <ChannelEditorItem
                      key={channel.id}
                      channel={channel}
                      updateChannel={updateChannel}
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
                        Create a new marketing channel with custom metrics.
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
                          <Label>Base Spend (€)</Label>
                          <Input
                            type="number"
                            value={newChannel.baseSpend}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, baseSpend: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>CPM (€)</Label>
                          <Input
                            type="number"
                            value={newChannel.cpm}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, cpm: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>CTR (%)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={newChannel.ctr}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, ctr: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>ROAS (x)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={newChannel.estimatedRoas}
                            onChange={(e) => setNewChannel(prev => ({ ...prev, estimatedRoas: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
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
              {presets.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
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
  updateChannel,
  deleteChannel,
}: {
  channel: ChannelWithMetrics;
  updateChannel: (id: string, updates: Partial<Omit<Channel, 'id'>>) => void;
  deleteChannel: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const handleDelete = () => {
    deleteChannel(channel.id);
    toast({ title: 'Channel Deleted', description: `${channel.name} has been removed.` });
  };

  return (
    <div 
      className={cn(
        "rounded-lg border transition-all",
        "bg-sidebar-accent/50 border-sidebar-border",
        channel.warnings.length > 0 && "border-warning/50",
        isExpanded && "bg-sidebar-accent"
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
          <span className="text-xs text-sidebar-foreground truncate">
            {channel.name.replace(/^(SEO|Paid|Affiliate|Influencer)\s*-\s*/, '')}
          </span>
          {channel.warnings.length > 0 && (
            <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
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
        <div className="px-2 pb-2 space-y-2 border-t border-sidebar-border/50 pt-2">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs text-sidebar-foreground/60">Name</Label>
            <Input
              value={channel.name}
              onChange={(e) => updateChannel(channel.id, { name: e.target.value })}
              className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
            />
          </div>
          
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">CPM (€)</Label>
              <Input
                type="number"
                step="0.1"
                value={channel.cpm ?? ''}
                onChange={(e) => updateChannel(channel.id, { cpm: parseFloat(e.target.value) || 0 })}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">CTR (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={channel.ctr ?? ''}
                onChange={(e) => updateChannel(channel.id, { ctr: parseFloat(e.target.value) || 0 })}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">ROAS (x)</Label>
              <Input
                type="number"
                step="0.1"
                value={channel.estimatedRoas ?? ''}
                onChange={(e) => updateChannel(channel.id, { estimatedRoas: parseFloat(e.target.value) || 0 })}
                className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-sidebar-foreground/60">Category</Label>
              <Select
                value={channel.category}
                onValueChange={(v) => updateChannel(channel.id, { category: v as ChannelCategory })}
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
          </div>

          {/* Warnings */}
          {channel.warnings.length > 0 && (
            <div className="space-y-1">
              {channel.warnings.map((warning, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-warning">
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
