import { useState, useCallback } from 'react';
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Sliders,
  Layers,
  Save,
  RotateCcw,
  Target,
  TrendingUp,
  FolderOpen,
  Trash2,
  Copy,
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
import { formatCurrency } from '@/lib/mediaplan-data';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { useToast } from '@/hooks/use-toast';

export function MultiMonthGlobalSettings() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloneId, setCloneId] = useState<string | null>(null);
  const { toast } = useToast();

  const {
    globalSettings,
    setGlobalSettings,
    scenarios,
    activeScenarioId,
    saveScenario,
    loadScenario,
    deleteScenario,
    cloneScenario,
    applyGlobalChannelsToAll,
    resetPlan,
  } = useMultiMonthStore();

  const handleSaveScenario = useCallback(() => {
    if (!newPresetName.trim()) {
      toast({ title: 'Error', description: 'Scenario name is required', variant: 'destructive' });
      return;
    }
    saveScenario(newPresetName.trim());
    setNewPresetName('');
    toast({ title: 'Scenario Saved', description: `"${newPresetName}" has been saved.` });
  }, [newPresetName, saveScenario, toast]);

  const handleClone = useCallback(() => {
    if (!cloneId || !cloneName.trim()) return;
    cloneScenario(cloneId, cloneName.trim());
    setCloneId(null);
    setCloneName('');
    toast({ title: 'Cloned', description: `Scenario cloned as "${cloneName}"` });
  }, [cloneId, cloneName, cloneScenario, toast]);

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
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" title="Budget">
          <DollarSign className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" title="Scenarios">
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-72 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-sidebar-primary" />
          <h3 className="font-semibold text-sidebar-foreground text-sm">Global Settings</h3>
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

      <ScrollArea className="flex-1">
        <div className="p-3">
          <Accordion type="multiple" defaultValue={['budget', 'scaling', 'scenarios']} className="space-y-2">
            {/* Plan-Wide Budget */}
            <AccordionItem value="budget" className="border border-sidebar-border rounded-lg overflow-hidden bg-sidebar-accent/30">
              <AccordionTrigger className="px-3 py-2 hover:bg-sidebar-accent/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-sidebar-primary" />
                  <span className="text-xs font-medium text-sidebar-foreground">Budget Settings</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3 space-y-3">
                {/* Base Monthly Budget */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Base Monthly Budget</Label>
                    <Badge variant="outline" className="font-mono text-xs border-sidebar-border text-sidebar-foreground">
                      {formatCurrency(globalSettings.baseMonthlyBudget)}
                    </Badge>
                  </div>
                  <Slider
                    value={[globalSettings.baseMonthlyBudget]}
                    onValueChange={([v]) => setGlobalSettings({ baseMonthlyBudget: v })}
                    min={1000}
                    max={500000}
                    step={1000}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-sidebar-foreground/50">
                    <span>€1K</span>
                    <span>€500K</span>
                  </div>
                </div>

                {/* Growth Rate */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Growth Rate</Label>
                    <Badge variant="outline" className="font-mono text-xs border-sidebar-border text-sidebar-foreground">
                      {globalSettings.growthRate >= 0 ? '+' : ''}{globalSettings.growthRate}%
                    </Badge>
                  </div>
                  <Slider
                    value={[globalSettings.growthRate]}
                    onValueChange={([v]) => setGlobalSettings({ growthRate: v })}
                    min={-20}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-sidebar-foreground/50">
                    <span>-20%</span>
                    <span>+50%</span>
                  </div>
                </div>

                {/* Growth Type */}
                <div className="space-y-1">
                  <Label className="text-xs text-sidebar-foreground/70">Growth Type</Label>
                  <Select
                    value={globalSettings.growthType}
                    onValueChange={(v) => setGlobalSettings({ growthType: v as 'linear' | 'exponential' | 'seasonal' })}
                  >
                    <SelectTrigger className="h-7 text-xs bg-sidebar-accent border-sidebar-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linear">Linear</SelectItem>
                      <SelectItem value="exponential">Exponential</SelectItem>
                      <SelectItem value="seasonal">Seasonal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Plan-Wide Scaling */}
            <AccordionItem value="scaling" className="border border-sidebar-border rounded-lg overflow-hidden bg-sidebar-accent/30">
              <AccordionTrigger className="px-3 py-2 hover:bg-sidebar-accent/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-sidebar-primary" />
                  <span className="text-xs font-medium text-sidebar-foreground">Global Scaling</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3 space-y-3">
                {/* Spend Multiplier */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Spend Multiplier</Label>
                    <Badge variant="outline" className="font-mono text-xs border-sidebar-border text-sidebar-foreground">
                      {globalSettings.spendMultiplier.toFixed(2)}x
                    </Badge>
                  </div>
                  <Slider
                    value={[globalSettings.spendMultiplier]}
                    onValueChange={([v]) => setGlobalSettings({ spendMultiplier: v })}
                    min={0.8}
                    max={2}
                    step={0.05}
                    className="w-full"
                  />
                </div>

                {/* Global CPM Override */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">Default CPM (€)</Label>
                    <Input
                      type="number"
                      value={globalSettings.defaultCpmOverride ?? ''}
                      onChange={(e) => setGlobalSettings({ 
                        defaultCpmOverride: e.target.value ? parseFloat(e.target.value) : null 
                      })}
                      placeholder="Auto"
                      className="w-20 h-6 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                    />
                  </div>
                </div>

                {/* CTR Bump */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-sidebar-foreground/70">CTR Bump</Label>
                    <Badge variant="outline" className="font-mono text-xs border-sidebar-border text-sidebar-foreground">
                      {globalSettings.ctrBump >= 0 ? '+' : ''}{globalSettings.ctrBump.toFixed(1)}%
                    </Badge>
                  </div>
                  <Slider
                    value={[globalSettings.ctrBump]}
                    onValueChange={([v]) => setGlobalSettings({ ctrBump: v })}
                    min={-2}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                </div>

                <Separator className="bg-sidebar-border" />

                {/* CPA Target */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-sidebar-primary" />
                    <Label className="text-xs text-sidebar-foreground/70">CPA Target (€)</Label>
                  </div>
                  <Input
                    type="number"
                    value={globalSettings.cpaTarget ?? ''}
                    onChange={(e) => setGlobalSettings({ 
                      cpaTarget: e.target.value ? parseFloat(e.target.value) : null 
                    })}
                    placeholder="None"
                    className="w-20 h-6 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                  />
                </div>

                {/* ROAS Target */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-sidebar-primary" />
                    <Label className="text-xs text-sidebar-foreground/70">ROAS Target (x)</Label>
                  </div>
                  <Input
                    type="number"
                    value={globalSettings.roasTarget ?? ''}
                    onChange={(e) => setGlobalSettings({ 
                      roasTarget: e.target.value ? parseFloat(e.target.value) : null 
                    })}
                    placeholder="None"
                    className="w-20 h-6 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyGlobalChannelsToAll}
                  className="w-full gap-1 text-xs h-7 bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                >
                  <Layers className="h-3 w-3" />
                  Apply Channels to All Months
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Scenario Manager */}
            <AccordionItem value="scenarios" className="border border-sidebar-border rounded-lg overflow-hidden bg-sidebar-accent/30">
              <AccordionTrigger className="px-3 py-2 hover:bg-sidebar-accent/50 hover:no-underline">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-sidebar-primary" />
                  <span className="text-xs font-medium text-sidebar-foreground">Scenarios</span>
                  {scenarios.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1">
                      {scenarios.length}
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3 space-y-3">
                {/* Save New */}
                <div className="flex gap-1">
                  <Input
                    placeholder="Scenario name..."
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="h-7 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveScenario}
                    className="h-7 px-2"
                    disabled={!newPresetName.trim()}
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                </div>

                {/* Scenario List */}
                {scenarios.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {scenarios.map((scenario) => (
                      <div
                        key={scenario.id}
                        className={cn(
                          "flex items-center gap-1 p-2 rounded border text-xs",
                          activeScenarioId === scenario.id
                            ? "border-primary bg-primary/10"
                            : "border-sidebar-border bg-sidebar-accent/50"
                        )}
                      >
                        <span className="flex-1 truncate text-sidebar-foreground" title={scenario.name}>
                          {scenario.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => loadScenario(scenario.id)}
                          title="Load"
                        >
                          <FolderOpen className="h-3 w-3" />
                        </Button>
                        <Dialog open={cloneId === scenario.id} onOpenChange={(open) => !open && setCloneId(null)}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => {
                                setCloneId(scenario.id);
                                setCloneName(`${scenario.name} (Copy)`);
                              }}
                              title="Clone"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[320px]">
                            <DialogHeader>
                              <DialogTitle>Clone Scenario</DialogTitle>
                              <DialogDescription>Enter a name for the cloned scenario.</DialogDescription>
                            </DialogHeader>
                            <Input
                              value={cloneName}
                              onChange={(e) => setCloneName(e.target.value)}
                              placeholder="New scenario name"
                            />
                            <DialogFooter>
                              <Button onClick={handleClone} disabled={!cloneName.trim()}>
                                Clone
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-destructive hover:text-destructive"
                          onClick={() => deleteScenario(scenario.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetPlan}
                  className="w-full gap-1 text-xs h-7 bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Plan
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}
