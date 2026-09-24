import { Download, FileText, Image, ChevronDown, Trash2, Settings, TrendingUp, PanelLeftClose, PanelLeft, Undo2, Redo2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMediaPlanStore, useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useHistoryStore } from '@/hooks/use-history';
import { useState } from 'react';
import { exportToCsv } from '@/lib/export-service';
import { ReportBuilderModal } from './ReportBuilderModal';
import { CollaborationDialog } from './CollaborationDialog';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BUDGET_PRESETS, BudgetPresetKey } from '@/lib/mediaplan-data';
import { CurrencySelector } from '@/components/common/CurrencySelector';
import { ProjectManager } from '@/components/dashboard/ProjectManager';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DashboardHeaderProps {
  budgetPreset: BudgetPresetKey;
  onPresetChange: (preset: BudgetPresetKey) => void;
  onExport: (format: 'pdf' | 'csv' | 'png') => void;
  onImport: () => void;
  onReset: () => void;
  isOpen?: boolean;
  toggleSidebar?: () => void;
}

export function DashboardHeader({
  budgetPreset,
  onPresetChange,
  onExport,
  onImport,
  onReset,
  isOpen,
  toggleSidebar
}: DashboardHeaderProps) {
  const { totalBudget, globalMultipliers, setGlobalMultipliers } = useMediaPlanStore();
  const { format, symbol } = useCurrency();
  const multiplier = globalMultipliers.spendMultiplier || 1;
  const effectiveBudget = totalBudget * multiplier;
  const channelsWithMetrics = useChannelsWithMetrics();
  const { toast } = useToast();

  const historyStore = useHistoryStore();
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  return (
    <header className="glass border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            {toggleSidebar && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-2" title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}>
                {isOpen ? (
                  <PanelLeftClose className="h-5 w-5 text-indigo-400" />
                ) : (
                  <PanelLeft className="h-5 w-5 text-slate-400" />
                )}
              </Button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary">
              <span className="text-xl font-bold text-primary-foreground">{symbol}</span>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              MediaPlan <span className="gradient-text">Pro</span>
            </h1>
            {multiplier !== 1 ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span>{format(totalBudget)}</span>
                <span className="text-cyan-400 font-mono">× {multiplier.toFixed(2)}x</span>
                <span>=</span>
                <span className="font-bold text-foreground">{format(effectiveBudget)}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Interactive Budget Scaler
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          {/* Currency Selector */}
          <CurrencySelector compact />

          {/* Budget Type Selector */}
          <Select
            value={budgetPreset}
            onValueChange={(value) => onPresetChange(value as BudgetPresetKey)}
          >
            <SelectTrigger className="w-[180px] bg-card border-border">
              <SelectValue placeholder="Budget Type" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border max-w-[260px]">
              {Object.entries(BUDGET_PRESETS).map(([key, preset]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-medium text-xs text-slate-200">{preset.name}</span>
                    <span className="text-[10px] text-slate-400 leading-normal line-clamp-1">{preset.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Undo/Redo Buttons */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => historyStore.undo()} 
                  disabled={!historyStore.canUndo}
                  className="h-9 w-9 bg-card border-border"
                >
                  <Undo2 className="h-4 w-4 text-slate-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-950 border-slate-800 text-xs text-slate-300">
                Undo edit (Ctrl+Z) — Navigates edit history in active session
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => historyStore.redo()} 
                  disabled={!historyStore.canRedo}
                  className="h-9 w-9 bg-card border-border"
                >
                  <Redo2 className="h-4 w-4 text-slate-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-950 border-slate-800 text-xs text-slate-300">
                Redo edit (Ctrl+Y) — Navigates edit history in active session
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Reset Button */}
          <Button variant="outline" size="icon" onClick={onReset} title="Reset Plan" className="h-9 w-9 bg-card border-border">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>

          {/* Import Button */}
          <Button variant="default" onClick={onImport} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0 h-9">
            <span className="text-xs">✨</span>
            Import Genius
          </Button>

          {/* Projects Manager */}
          <ProjectManager />

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 h-9">
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border">
              <DropdownMenuItem onClick={() => setIsReportOpen(true)} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportToCsv(channelsWithMetrics, symbol)} className="gap-2 cursor-pointer">
                <Download className="h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                toast({
                  title: 'Print / Save Image',
                  description: 'Use your browser print command (Ctrl+P) or screenshot tool to capture the plan visualization as a PNG.',
                });
              }} className="gap-2 cursor-pointer">
                <Image className="h-4 w-4" />
                Export as PNG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Share Button */}
          <Button 
            variant="outline" 
            onClick={() => setIsShareOpen(true)} 
            className="gap-2 h-9 border-indigo-500/20 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>

          {/* Settings Link */}
          <a href="/settings" className="inline-flex items-center justify-center p-2 rounded-md hover:bg-slate-800 transition-colors" title="Account Settings">
            <Settings className="h-5 w-5 text-slate-400 hover:text-white" />
          </a>
        </div>
      </div>
      <ReportBuilderModal open={isReportOpen} onOpenChange={setIsReportOpen} />
      <CollaborationDialog open={isShareOpen} onOpenChange={setIsShareOpen} />
    </header>
  );
}
