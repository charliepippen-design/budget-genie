import { DollarSign, Download, FileText, Image, ChevronDown } from 'lucide-react';
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

interface DashboardHeaderProps {
  budgetPreset: BudgetPresetKey;
  onPresetChange: (preset: BudgetPresetKey) => void;
  onExport: (format: 'pdf' | 'csv' | 'png') => void;
}

export function DashboardHeader({
  budgetPreset,
  onPresetChange,
  onExport,
}: DashboardHeaderProps) {
  return (
    <header className="glass border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary">
              <DollarSign className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                MediaPlan <span className="gradient-text">Pro</span>
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
          </div>
        </div>
      </div>
    </header>
  );
}
