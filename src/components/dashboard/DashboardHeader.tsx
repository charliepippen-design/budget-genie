import { Download, FileText, Image, ChevronDown, Trash2, Settings, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
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
import { useTheme } from '@/hooks/use-theme';

interface DashboardHeaderProps {
  budgetPreset: BudgetPresetKey;
  onPresetChange: (preset: BudgetPresetKey) => void;
  onExport: (format: 'pdf' | 'csv' | 'xlsx' | 'png') => void;
  onImport: () => void;
  onReset: () => void;
}

export function DashboardHeader({
  budgetPreset,
  onPresetChange,
  onExport,
  onImport,
  onReset,
}: DashboardHeaderProps) {
  const { totalBudget, globalMultipliers } = useMediaPlanStore();
  const { format } = useCurrency();
  const { theme, cycleTheme } = useTheme();
  const multiplier = globalMultipliers.spendMultiplier || 1;
  const effectiveBudget = totalBudget * multiplier;
  const nextThemeLabel = theme === 'light' ? 'dark' : theme === 'dark' ? 'high-contrast' : 'light';
  const currentThemeLabel =
    theme === 'contrast' ? 'High Contrast' : theme === 'dark' ? 'Dark' : 'Light';

  return (
    <header className="glass border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3"></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              MediaPlanner <span className="gradient-text">Pro</span>
            </h1>
            {multiplier !== 1 ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span>{format(totalBudget)}</span>
                <span className="text-cyan-400 font-mono">× {multiplier.toFixed(2)}x</span>
                <span>=</span>
                <span className="font-bold text-foreground">{format(effectiveBudget)}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Interactive Budget Scaler</p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1 min-h-[3rem] overflow-visible">
          {/* Currency Selector */}
          <CurrencySelector compact />

          {/* Theme Toggle */}
          <Button
            type="button"
            variant="outline"
            onClick={cycleTheme}
            aria-label={`Current theme ${currentThemeLabel}. Switch to ${nextThemeLabel} theme`}
            title={`Current theme ${currentThemeLabel}. Switch to ${nextThemeLabel} theme`}
            className="gap-2 px-3"
          >
            {theme === 'contrast' ? (
              <span className="text-xs font-bold">HC</span>
            ) : theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{currentThemeLabel}</span>
          </Button>

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
          <Button
            variant="outline"
            size="icon"
            onClick={onReset}
            title="Reset Plan"
            aria-label="Reset plan"
            className="cta-glow"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>

          {/* Import Button */}
          <Button
            variant="default"
            onClick={onImport}
            aria-label="Import media plan"
            className="cta-glow gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0"
          >
            <span className="text-xs">✨</span>
            Import Genius
          </Button>

          {/* Projects Manager */}
          <ProjectManager />

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="cta-glow gap-2" aria-label="Open export menu">
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
              <DropdownMenuItem onClick={() => onExport('xlsx')} className="gap-2 cursor-pointer">
                <Download className="h-4 w-4" />
                Export as Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('png')} className="gap-2 cursor-pointer">
                <Image className="h-4 w-4" />
                Export as PNG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Settings Link */}
          <a
            href="/settings"
            className="inline-flex items-center justify-center p-2 rounded-md hover:bg-slate-800 transition-colors"
            aria-label="Open account settings"
            title="Account Settings"
          >
            <Settings className="h-5 w-5 text-slate-400 hover:text-white" />
          </a>
        </div>
      </div>
    </header>
  );
}
