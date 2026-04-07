import {
  Download,
  FileText,
  ChevronDown,
  Trash2,
  Settings,
  Moon,
  Sun,
  Lock,
  ArrowUpRight,
  BarChart,
  Sparkles,
  Share2,
} from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVerticalConfig } from '@/hooks/use-vertical-config';

interface DashboardHeaderProps {
  budgetPreset: BudgetPresetKey;
  onPresetChange: (preset: BudgetPresetKey) => void;
  onExport: (format: 'pdf' | 'csv' | 'xlsx') => void;
  onImport: () => void;
  onReset: () => void;
  onLaunchMasterWizard: () => void;
}

export function DashboardHeader({
  budgetPreset,
  onPresetChange,
  onExport,
  onImport,
  onReset,
  onLaunchMasterWizard,
}: DashboardHeaderProps) {
  const { totalBudget, globalMultipliers, setHasCompletedOnboarding } = useMediaPlanStore();
  const vc = useVerticalConfig();
  const userStatus = useMediaPlanStore((state) => state.userStatus);
  const { format } = useCurrency();
  const { theme, cycleTheme } = useTheme();
  const navigate = useNavigate();
  const [isExportHostageModalOpen, setIsExportHostageModalOpen] = useState(false);
  const multiplier = globalMultipliers.spendMultiplier || 1;
  const effectiveBudget = totalBudget * multiplier;
  const nextThemeLabel = theme === 'light' ? 'dark' : theme === 'dark' ? 'high-contrast' : 'light';
  const currentThemeLabel =
    theme === 'contrast' ? 'High Contrast' : theme === 'dark' ? 'Dark' : 'Light';

  const isDark = theme === 'dark' || theme === 'contrast';
  const isDemo = userStatus === 'demo';
  const controlShellClass = cn(
    'h-10 rounded-lg border px-3 text-sm font-semibold transition-all duration-200',
    isDark
      ? 'border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800 hover:border-slate-600'
      : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:border-slate-400'
  );

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-300',
        isDark
          ? 'bg-slate-950/95 border-slate-800 text-slate-100'
          : 'bg-slate-50/95 border-slate-200 text-slate-900'
      )}
    >
      <div className="container mx-auto px-4 py-4">
        <Dialog open={isExportHostageModalOpen} onOpenChange={setIsExportHostageModalOpen}>
          <DialogContent className="max-w-lg border-slate-700 bg-[linear-gradient(160deg,_#020617,_#0f172a_55%,_#111827)] text-slate-100 shadow-[0_30px_90px_rgba(15,23,42,0.8)]">
            <DialogHeader className="text-left">
              <DialogTitle className="text-2xl font-black tracking-tight text-white">
                Deployment Blocked
              </DialogTitle>
              <DialogDescription className="text-slate-300">
                Exporting optimized CPA and ROAS targets requires a Pro Acquisition License.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-slate-200">
              Your demo workspace can model scenarios, but export pipelines stay blocked until the
              acquisition stack is licensed.
            </div>
            <Button
              className="h-14 w-full animate-pulse-slow bg-gradient-to-r from-cyan-500 to-blue-600 text-lg font-black text-white hover:from-cyan-600 hover:to-blue-700"
              onClick={() => (window.location.href = '/settings')}
            >
              Upgrade Now
            </Button>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className={cn(
                    'text-xl font-bold tracking-tight',
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  )}
                >
                  MediaPlanner{' '}
                  <span
                    className={cn(
                      'font-bold',
                      isDark
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent'
                        : 'bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent'
                    )}
                  >
                    Pro
                  </span>
                </h1>
                <span className="text-xs text-slate-400 border border-slate-700 rounded-full px-2 py-0.5 ml-2">
                  {vc.emoji} {vc.label}
                </span>
              </div>
              {multiplier !== 1 ? (
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-xs mt-0.5',
                    isDark ? 'text-slate-400' : 'text-slate-700'
                  )}
                >
                  <span>{format(totalBudget)}</span>
                  <span className={cn('font-mono', isDark ? 'text-cyan-300' : 'text-blue-700')}>
                    × {multiplier.toFixed(2)}x
                  </span>
                  <span>=</span>
                  <span className={cn('font-bold', isDark ? 'text-slate-100' : 'text-slate-800')}>
                    {format(effectiveBudget)}
                  </span>
                </div>
              ) : (
                <p className={cn('text-xs', isDark ? 'text-slate-400/80' : 'text-slate-600/80')}>
                  Interactive Budget Scaler
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHasCompletedOnboarding(false);
                navigate('/onboard');
              }}
              className={cn(
                'group relative h-10 rounded-xl border-0 px-4 text-white gap-2 font-semibold transition-all duration-300 hover:-translate-y-0.5',
                isDark
                  ? 'bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 shadow-[0_10px_26px_rgba(14,165,233,0.4)] hover:from-cyan-400 hover:via-sky-400 hover:to-blue-500'
                  : 'bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 shadow-[0_10px_24px_rgba(37,99,235,0.28)] hover:from-blue-500 hover:via-cyan-400 hover:to-emerald-400'
              )}
            >
              <Sparkles className="w-4 h-4 transition-transform duration-300 group-hover:rotate-6" />
              Initial Wizard
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onLaunchMasterWizard}
              className={cn(
                'group relative h-10 rounded-xl px-4 gap-2 font-semibold transition-all duration-300 hover:-translate-y-0.5',
                isDark
                  ? 'border-cyan-400/40 bg-slate-900/70 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_rgba(8,47,73,0.45)] hover:border-cyan-300 hover:bg-slate-800/80'
                  : 'border-blue-300 bg-white/95 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_20px_rgba(15,23,42,0.12)] hover:border-blue-400 hover:bg-blue-50'
              )}
            >
              <ArrowUpRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              Master Wizard
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1 min-h-[3rem] overflow-visible">
          {/* Currency Selector - FORCED CONTRAST */}
          <CurrencySelector compact />

          {/* Theme Toggle - FORCED CONTRAST */}
          <Button
            type="button"
            onClick={cycleTheme}
            aria-label={`Current theme ${currentThemeLabel}. Switch to ${nextThemeLabel} theme`}
            title={`Current theme ${currentThemeLabel}. Switch to ${nextThemeLabel} theme`}
            className={cn(controlShellClass, 'gap-2')}
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

          {/* Budget Type Selector - FORCED CONTRAST */}
          <Select
            value={budgetPreset}
            onValueChange={(value) => onPresetChange(value as BudgetPresetKey)}
          >
            <SelectTrigger
              className={cn(
                'w-[168px] h-10 rounded-lg border px-3 text-sm font-medium transition-colors',
                isDark
                  ? 'border-slate-700 bg-slate-900/60 text-slate-100 focus:ring-slate-600'
                  : 'border-slate-300 bg-white text-slate-900 focus:ring-slate-400'
              )}
            >
              <SelectValue placeholder="Budget Type" />
            </SelectTrigger>
            <SelectContent
              className={cn(
                'border-2',
                isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
              )}
            >
              {Object.entries(BUDGET_PRESETS).map(([key, preset]) => (
                <SelectItem
                  key={key}
                  value={key}
                  className={cn(
                    'cursor-pointer font-medium',
                    isDark ? 'focus:bg-slate-800' : 'focus:bg-slate-100'
                  )}
                >
                  <div className="flex flex-col">
                    <span>{preset.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Reset Button - FORCED CONTRAST */}
          <Button
            onClick={onReset}
            title="Reset Plan"
            aria-label="Reset plan"
            className={cn(controlShellClass, 'w-10 px-0')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {/* Import Button - ALWAYS VIBRANT */}
          <Button
            onClick={onImport}
            aria-label="Import media plan"
            className="h-10 rounded-lg px-4 gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0 text-white font-semibold transition-all duration-200"
          >
            <span className="text-xs">✨</span>
            Import Genius
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Projects Manager */}
            <ProjectManager isDark={isDark} triggerClassName={cn(controlShellClass, 'gap-2')} />

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/report')}
              className="gap-2 border-slate-700 text-slate-300 hover:text-white"
            >
              <BarChart className="w-4 h-4" />
              View Report
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/output')}
              className="gap-2"
            >
              <Share2 className="w-4 h-4" />
              View Plan
            </Button>

            {/* Export Dropdown - FORCED CONTRAST */}
            {isDemo ? (
              <Button
                className={cn(controlShellClass, 'gap-2')}
                aria-label="Export locked in demo"
                onClick={() => setIsExportHostageModalOpen(true)}
              >
                <Lock className="h-4 w-4" />
                Export Locked
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className={cn(controlShellClass, 'gap-2')} aria-label="Open export menu">
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className={cn(
                    'border-2',
                    isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'
                  )}
                >
                  <DropdownMenuItem
                    onClick={() => onExport('pdf')}
                    className={cn(
                      'gap-2 cursor-pointer font-medium',
                      isDark ? 'focus:bg-slate-800' : 'focus:bg-slate-100'
                    )}
                  >
                    <FileText className="h-4 w-4" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onExport('csv')}
                    className={cn(
                      'gap-2 cursor-pointer font-medium',
                      isDark ? 'focus:bg-slate-800' : 'focus:bg-slate-100'
                    )}
                  >
                    <Download className="h-4 w-4" />
                    Export Config (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onExport('xlsx')}
                    className={cn(
                      'gap-2 cursor-pointer font-medium',
                      isDark ? 'focus:bg-slate-800' : 'focus:bg-slate-100'
                    )}
                  >
                    <Download className="h-4 w-4" />
                    Export as Excel (.xlsx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {isDemo ? (
              <a href="/settings" className="inline-flex">
                <Button
                  className="h-10 rounded-lg px-4 gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700"
                  aria-label="Upgrade now"
                >
                  Upgrade Now
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </a>
            ) : null}

            {/* Settings Link - FORCED CONTRAST */}
            <a
              href="/settings"
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors font-semibold',
                isDark
                  ? 'border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              )}
              aria-label="Open account settings"
              title="Account Settings"
            >
              <Settings className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
