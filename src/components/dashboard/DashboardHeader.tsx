import { DollarSign, Download, FileText, Image, ChevronDown, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  return (
    <header className="glass border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            {toggleSidebar && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-2">
                <Settings className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              </Button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary">
              <DollarSign className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                MediaPlanner <span className="gradient-text">Pro</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Interactive Budget Scaler
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Currency Selector */}
            <CurrencySelector compact />

            {/* Budget Type Selector */}
            <Select
              value={budgetPreset}
              onValueChange={(value) => onPresetChange(value as BudgetPresetKey)}
            >
              <SelectTrigger className="w-[160px] bg-card border-border">
                <SelectValue placeholder="Budget Type" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {Object.entries(BUDGET_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col">
                      <span>{preset.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reset Button */}
            <Button variant="outline" size="icon" onClick={onReset} title="Reset Plan">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>

            {/* Import Button */}
            <Button variant="default" onClick={onImport} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0">
              <span className="text-xs">✨</span>
              Import Genius
            </Button>

            {/* Projects Manager */}
            <ProjectManager />

            {/* Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border-border">
                <DropdownMenuItem onClick={() => onExport('pdf')} className="gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport('csv')} className="gap-2 cursor-pointer">
                  <Download className="h-4 w-4" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport('png')} className="gap-2 cursor-pointer">
                  <Image className="h-4 w-4" />
                  Export as PNG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Settings Link */}
            <a href="/settings" className="inline-flex items-center justify-center p-2 rounded-md hover:bg-slate-800 transition-colors" title="Account Settings">
              <Settings className="h-5 w-5 text-slate-400 hover:text-white" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
