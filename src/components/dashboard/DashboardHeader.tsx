import { getIndustryPack } from '@/lib/industries';
import { BrandLogo } from '@/components/common/BrandLogo';
import { AccountMenu } from '@/components/common/AccountMenu';
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
  Loader2,
  Upload,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBlendedMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CurrencySelector } from '@/components/common/CurrencySelector';
import { ProjectManager } from '@/components/dashboard/ProjectManager';
import { ConfirmDialog, type ConfirmRequest } from '@/components/common/ConfirmDialog';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { shareCurrentPlan } from '@/lib/share-link';

interface DashboardHeaderProps {
  onExport: (format: 'pdf' | 'csv' | 'xlsx' | 'json') => void;
  /** Label of the export currently running, or null when idle. */
  exportingLabel?: string | null;
  onImport: () => void;
  onReset: () => void;
  onLaunchMasterWizard: () => void;
}

export function DashboardHeader({
  onExport,
  exportingLabel = null,
  onImport,
  onReset,
  onLaunchMasterWizard,
}: DashboardHeaderProps) {
  const { totalBudget, globalMultipliers } = useMediaPlanStore();
  const vc = useVerticalConfig();
  const userStatus = useMediaPlanStore((state) => state.userStatus);
  const brief = useMediaPlanStore((state) => state.brief);
  const { format, code: currencyCode } = useCurrency();
  const [isSharing, setIsSharing] = useState(false);
  const shareLink = async () => {
    if (isSharing) return;
    setIsSharing(true);
    await shareCurrentPlan(useMediaPlanStore.getState(), currencyCode);
    setIsSharing(false);
  };
  const { theme, cycleTheme } = useTheme();
  const navigate = useNavigate();
  const [isExportHostageModalOpen, setIsExportHostageModalOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const multiplier = globalMultipliers.spendMultiplier || 1;
  // The multiplier scales variable channels only (fixed fees are contractual), so show real spend.
  const effectiveBudget = useBlendedMetrics().totalSpend;
  const nextThemeLabel = theme === 'light' ? 'dark' : theme === 'dark' ? 'high-contrast' : 'light';
  const currentThemeLabel =
    theme === 'contrast' ? 'High Contrast' : theme === 'dark' ? 'Dark' : 'Light';

  const isDark = theme === 'dark' || theme === 'contrast';
  const isDemo = userStatus === 'demo';
  const controlShellClass = cn(
    'h-9 rounded-full border px-3.5 text-sm font-medium transition-all duration-200',
    isDark
      ? 'border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800 hover:border-slate-600'
      : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:border-slate-400'
  );
  const menuClass = cn('border-2', isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white');
  const menuItemClass = cn(
    'gap-2 cursor-pointer font-medium',
    isDark ? 'focus:bg-slate-800' : 'focus:bg-slate-100'
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
      <div className="px-4 py-2.5">
        <Dialog open={isExportHostageModalOpen} onOpenChange={setIsExportHostageModalOpen}>
          <DialogContent className="max-w-lg border-slate-700 bg-[linear-gradient(160deg,_#141414,_#1c1c1c_55%,_#111827)] text-slate-100 shadow-[0_30px_90px_rgba(15,23,42,0.8)]">
            <DialogHeader className="text-left">
              <DialogTitle className="text-2xl font-black tracking-tight text-white">
                Deployment Blocked
              </DialogTitle>
              <DialogDescription className="text-slate-300">
                Exporting optimized CPA and ROAS targets requires the Pro plan.
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Brand, industry and effective budget */}
          <div className="order-1 flex min-w-0 items-center gap-2">
            <BrandLogo size="md" as="h1" tone={isDark ? 'dark' : 'light'} />
            <span
              className={cn(
                'whitespace-nowrap rounded-full border px-2 py-0.5 text-xs',
                isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-600'
              )}
            >
              {vc.emoji} {brief ? getIndustryPack(brief.industry).label : vc.label}
            </span>
            {multiplier !== 1 ? (
              <span
                className={cn(
                  'hidden items-center gap-1.5 text-xs xl:flex',
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
              </span>
            ) : null}
          </div>

          <div className="order-3 flex w-full flex-wrap items-center gap-2 min-[1800px]:order-2 min-[1800px]:ml-auto min-[1800px]:w-auto">
            <ProjectManager isDark={isDark} triggerClassName={cn(controlShellClass, 'gap-2')} />

            <Button onClick={() => navigate('/report')} className={cn(controlShellClass, 'gap-2')}>
              <BarChart className="h-4 w-4" />
              View Report
            </Button>

            <Button
              onClick={() => navigate('/output')}
              className="h-9 gap-2 rounded-full border-0 bg-indigo-600 px-4 text-sm font-semibold hover:bg-indigo-500"
            >
              <FileText className="h-4 w-4" />
              View Plan
            </Button>

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
                  <Button
                    className={cn(controlShellClass, 'gap-2')}
                    aria-label="Open export menu"
                    disabled={exportingLabel !== null}
                  >
                    {exportingLabel !== null ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {exportingLabel !== null ? `Exporting ${exportingLabel}...` : 'Export'}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={menuClass}>
                  <DropdownMenuItem onClick={() => onExport('pdf')} className={menuItemClass}>
                    <FileText className="h-4 w-4" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport('csv')} className={menuItemClass}>
                    <Download className="h-4 w-4" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport('json')} className={menuItemClass}>
                    <Download className="h-4 w-4" />
                    Export Config (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport('xlsx')} className={menuItemClass}>
                    <Download className="h-4 w-4" />
                    Export as Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void shareLink()} disabled={isSharing} className={menuItemClass}>
                    <Link2 className="h-4 w-4" />
                    Share link
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

            {/* Setup and occasional actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className={cn(controlShellClass, 'gap-2')} aria-label="Open plan setup menu">
                  <Sparkles className="h-4 w-4" />
                  Setup
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuClass}>
                {/* The wizard offers "Back to my plan" and asks before overwriting. */}
                <DropdownMenuItem onClick={() => navigate('/onboard')} className={menuItemClass}>
                  <Sparkles className="h-4 w-4" />
                  Initial Wizard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onLaunchMasterWizard} className={menuItemClass}>
                  <ArrowUpRight className="h-4 w-4" />
                  Master Wizard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onImport} className={menuItemClass}>
                  <Upload className="h-4 w-4" />
                  Import a plan
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    setConfirmRequest({
                      title: 'Reset the plan?',
                      description: 'This clears budget and channel settings. Ctrl+Z can undo it.',
                      confirmLabel: 'Reset plan',
                      onConfirm: onReset,
                    })
                  }
                  className={cn(menuItemClass, 'text-rose-400 focus:text-rose-400')}
                >
                  <Trash2 className="h-4 w-4" />
                  Reset plan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>

          <div className="order-2 ml-auto flex items-center gap-2 min-[1800px]:order-3 min-[1800px]:ml-0">
            <CurrencySelector compact />

            <Button
              type="button"
              onClick={cycleTheme}
              aria-label={`Current theme ${currentThemeLabel}. Switch to ${nextThemeLabel} theme`}
              title={`Current theme ${currentThemeLabel}. Switch to ${nextThemeLabel} theme`}
              className={cn(controlShellClass, 'w-9 px-0')}
            >
              {theme === 'contrast' ? (
                <span className="text-xs font-bold">HC</span>
              ) : theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            <a
              href="/settings"
              className={cn(controlShellClass, 'inline-flex w-9 items-center justify-center px-0')}
              aria-label="Open account settings"
              title="Account Settings"
            >
              <Settings className="h-4 w-4" />
            </a>

            <AccountMenu isDark={isDark} className={cn(controlShellClass, 'w-9 px-0')} />
          </div>
        </div>
      </div>
      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </header>
  );
}
