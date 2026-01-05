import { useState, useCallback } from 'react';
import { 
  Save, 
  FolderOpen, 
  RotateCcw, 
  Trash2, 
  ChevronLeft,
  ChevronRight,
  Settings2,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  BudgetScenario, 
  saveScenario, 
  loadScenarios, 
  deleteScenario,
  formatCurrency,
} from '@/lib/mediaplan-data';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ScenarioSidebarProps {
  totalBudget: number;
  channelAllocations: Record<string, number>;
  onLoadScenario: (scenario: BudgetScenario) => void;
  onReset: () => void;
  onNormalize: () => void;
}

export function ScenarioSidebar({
  totalBudget,
  channelAllocations,
  onLoadScenario,
  onReset,
  onNormalize,
}: ScenarioSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [scenarios, setScenarios] = useState<BudgetScenario[]>(() => loadScenarios());
  const [newScenarioName, setNewScenarioName] = useState('');
  const { toast } = useToast();

  const handleSave = useCallback(() => {
    if (!newScenarioName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for your scenario.',
        variant: 'destructive',
      });
      return;
    }

    const scenario: BudgetScenario = {
      id: `scenario-${Date.now()}`,
      name: newScenarioName.trim(),
      totalBudget,
      channelAllocations: { ...channelAllocations },
      createdAt: new Date(),
    };

    saveScenario(scenario);
    setScenarios(loadScenarios());
    setNewScenarioName('');
    
    toast({
      title: 'Scenario saved',
      description: `"${scenario.name}" has been saved.`,
    });
  }, [newScenarioName, totalBudget, channelAllocations, toast]);

  const handleLoad = useCallback((scenario: BudgetScenario) => {
    onLoadScenario(scenario);
    toast({
      title: 'Scenario loaded',
      description: `"${scenario.name}" has been applied.`,
    });
  }, [onLoadScenario, toast]);

  const handleDelete = useCallback((id: string, name: string) => {
    deleteScenario(id);
    setScenarios(loadScenarios());
    toast({
      title: 'Scenario deleted',
      description: `"${name}" has been removed.`,
    });
  }, [toast]);

  if (isCollapsed) {
    return (
      <div className="w-14 bg-sidebar border-l border-sidebar-border flex flex-col items-center py-4 gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Separator className="bg-sidebar-border" />
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title="Settings"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNormalize}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title="Normalize to 100%"
        >
          <Scale className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title="Reset allocations"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-72 bg-sidebar border-l border-sidebar-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        <h3 className="font-semibold text-sidebar-foreground">Scenarios</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-4 border-b border-sidebar-border">
        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onNormalize}
            className="flex-1 gap-1.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80"
          >
            <Scale className="h-3.5 w-3.5" />
            Normalize
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            className="flex-1 gap-1.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>

        {/* Save Scenario */}
        <div className="space-y-2">
          <Label className="text-sidebar-foreground text-xs">Save Current</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Scenario name..."
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="flex-1 h-8 text-sm bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
            />
            <Button
              size="sm"
              onClick={handleSave}
              className="h-8 px-3 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Saved Scenarios */}
      <div className="flex-1 overflow-hidden">
        <div className="px-4 py-2 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-sidebar-foreground/70" />
          <span className="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wider">
            Saved ({scenarios.length})
          </span>
        </div>
        
        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className="px-4 pb-4 space-y-2">
            {scenarios.length === 0 ? (
              <p className="text-sm text-sidebar-foreground/50 text-center py-8">
                No saved scenarios yet
              </p>
            ) : (
              scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={cn(
                    "group p-3 rounded-lg border transition-all",
                    "bg-sidebar-accent border-sidebar-border",
                    "hover:border-sidebar-primary/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-sidebar-foreground truncate">
                        {scenario.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs font-mono border-sidebar-border text-sidebar-foreground/70">
                          {formatCurrency(scenario.totalBudget)}
                        </Badge>
                        <span className="text-xs text-sidebar-foreground/50">
                          {scenario.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleLoad(scenario)}
                        className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(scenario.id, scenario.name)}
                        className="h-7 w-7 text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
