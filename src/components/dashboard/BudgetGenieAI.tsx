import { PlannerChat } from '../planner/PlannerChat';
import { AiCommandBar } from '../planner/AiCommandBar';
import { useState, useCallback, Suspense } from 'react';
import {
  CalendarRange,
  FlaskConical,
  GitCompare,
  Globe2,
  LayoutDashboard,
  Settings2,
  Table2,
} from 'lucide-react';
import { SectionErrorBoundary } from '@/components/common/SectionErrorBoundary';
import { lazyWithReload } from '@/lib/lazy-with-reload';
import { useBudgetGenieViewModel } from '@/hooks/use-budget-genie-view-model';
import { SettingsConsole } from './SettingsConsole';
import { DashboardHeader } from './DashboardHeader';
import { OverBudgetBanner } from './OverBudgetBanner';
import { PlanCanvas } from './PlanCanvas';
import { PlanKpiBar } from './PlanKpiBar';
import { ChannelTable } from './ChannelTable';
import { MonthConfigPanel } from '../multi-month/MonthConfigPanel';
import { ProgressionPatternSelector } from '../multi-month/ProgressionPatternSelector';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartSectionSkeleton, ScenarioListSkeleton } from '@/components/common/AppSkeletons';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTheme } from '@/hooks/use-theme';
import { toast } from 'sonner';
import { FTDVelocityEngine } from './FTDVelocityEngine';
import { GlobalGeoArbitrageTokenMatrix } from './GlobalGeoArbitrageTokenMatrix';
import { MarketSplitCard } from './MarketSplitCard';
import {
  exportToCsv,
  exportToExcel,
  exportToPdf,
  exportEnterpriseConfigJson,
} from '@/lib/export-service';
import { useSandboxStore } from '@/store/useSandboxStore';
import { cn } from '@/lib/utils';
import { useMediaPlanStore, usePlanResult } from '@/hooks/use-media-plan-store';
import { useExportRunner } from '@/hooks/use-export-runner';

const BudgetWizard = lazyWithReload(() =>
  import('./BudgetWizard').then((m) => ({ default: m.BudgetWizard })), 'BudgetWizard');
const ImportWizard = lazyWithReload(() =>
  import('../multi-month/ImportWizard').then((m) => ({ default: m.ImportWizard })), 'ImportWizard');
const PLTable = lazyWithReload(() => import('../multi-month/PLTable').then((m) => ({ default: m.PLTable })), 'PLTable');
const MultiMonthCharts = lazyWithReload(() =>
  import('../multi-month/MultiMonthCharts').then((m) => ({ default: m.MultiMonthCharts })), 'MultiMonthCharts');
const ScenarioComparison = lazyWithReload(() =>
  import('../multi-month/ScenarioComparison').then((m) => ({ default: m.ScenarioComparison })), 'ScenarioComparison');
const ChartSection = lazyWithReload(() =>
  import('./ChartSection').then((m) => ({ default: m.ChartSection })), 'ChartSection');
const ScenarioSidebar = lazyWithReload(() =>
  import('./ScenarioSidebar').then((m) => ({ default: m.ScenarioSidebar })), 'ScenarioSidebar');
const StrategicInsightsPanel = lazyWithReload(() =>
  import('./StrategicInsightsPanel').then((m) => ({ default: m.StrategicInsightsPanel })), 'StrategicInsightsPanel');
const LtvForecastPanel = lazyWithReload(() =>
  import('./LtvForecastPanel').then((m) => ({ default: m.LtvForecastPanel })), 'LtvForecastPanel');

// The workspace areas. Each groups the widgets a planner uses together, instead of one long page.
const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'channels', label: 'Channels', icon: Table2 },
  { id: 'timeline', label: 'Timeline', icon: CalendarRange },
  { id: 'scenarios', label: 'Scenarios', icon: GitCompare },
  { id: 'markets', label: 'Markets', icon: Globe2 },
  { id: 'what-if', label: 'What-if', icon: FlaskConical },
] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number]['id'];
const WORKSPACE_TAB_KEY = 'mediaplan-workspace-tab';

function readSavedTab(): WorkspaceTab {
  try {
    const saved = localStorage.getItem(WORKSPACE_TAB_KEY);
    return WORKSPACE_TABS.find((t) => t.id === saved)?.id ?? 'overview';
  } catch {
    return 'overview';
  }
}

export const BudgetGenieAI = () => {
  // 1. VIEW MODEL (The Brain)
  // Connects to store, handles math, provides stable data
  const vm = useBudgetGenieViewModel();
  // Exports print the engine result, so they show the same numbers as the dashboard.
  const planResult = usePlanResult();
  const { symbol, format } = useCurrency();
  const { theme } = useTheme();
  const { globalMultipliers, userStatus } = useMediaPlanStore();
  const sandboxSnapshot = useSandboxStore((state) => state.exportSnapshot);
  const isDark = theme === 'dark' || theme === 'contrast';

  // 2. UI STATE (The Skin)
  // Purely presentational state
  // Assumptions drawer (targets, multipliers, channel list). Closed by default: the workspace
  // tabs hold the everyday controls, so the plan gets the width.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>(readSavedTab);
  const selectTab = useCallback((value: string) => {
    setTab(value as WorkspaceTab);
    try {
      localStorage.setItem(WORKSPACE_TAB_KEY, value);
    } catch {
      // storage unavailable: the tab just isn't remembered
    }
  }, []);
  const loadingClass = cn('p-4 text-sm', isDark ? 'text-slate-400' : 'text-slate-600');
  const [isBudgetWizardOpen, setIsBudgetWizardOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { exporting, run: runExportTask } = useExportRunner();

  const handleExport = useCallback(
    async (formatType: 'pdf' | 'csv' | 'xlsx' | 'json') => {
      if (userStatus === 'demo') {
        toast.error(
          'Deployment Blocked. Exporting optimized CPA and ROAS targets requires the Pro plan.'
        );
        return;
      }

      const exportOptions = {
        currencySymbol: symbol,
        formatCurrency: format,
      };

      switch (formatType) {
        case 'pdf':
          await runExportTask('PDF', () =>
            exportToPdf(planResult, vm.totalBudget, exportOptions)
          );
          return;
        case 'csv':
          await runExportTask('CSV', () =>
            exportToCsv(planResult, vm.totalBudget, exportOptions, sandboxSnapshot)
          );
          return;
        case 'json':
          await runExportTask('JSON config', () =>
            exportEnterpriseConfigJson(
              planResult,
              vm.totalBudget,
              {
                cpaTarget: globalMultipliers.cpaTarget,
                roasTarget: globalMultipliers.roasTarget,
              },
              vm.projectName
            )
          );
          return;
        case 'xlsx':
          await runExportTask('Excel', () =>
            exportToExcel(planResult, vm.totalBudget, sandboxSnapshot)
          );
          return;
      }
    },
    [
      format,
      globalMultipliers.cpaTarget,
      globalMultipliers.roasTarget,
      planResult,
      runExportTask,
      sandboxSnapshot,
      symbol,
      userStatus,
      vm.projectName,
      vm.totalBudget,
    ]
  );

  return (
    <SectionErrorBoundary name="dashboard">
      <div
        className={cn(
          'flex h-screen overflow-hidden font-inter selection:bg-indigo-500/30 transition-colors duration-300',
          isDark ? 'bg-[#020617] text-white' : 'bg-slate-100 text-slate-900'
        )}
      >
        {/* WIZARD MODAL */}
        <Suspense fallback={null}>
          <BudgetWizard isOpen={isBudgetWizardOpen} onClose={() => setIsBudgetWizardOpen(false)} />
        </Suspense>

        {/* Mobile: toggle + backdrop for the settings drawer */}
        <button
          type="button"
          onClick={() => setIsSidebarOpen((open) => !open)}
          className="fixed bottom-4 left-4 z-[60] rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-xl lg:hidden"
        >
          {isSidebarOpen ? 'Close settings' : 'Settings'}
        </button>
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* LEFT SIDEBAR (SETTINGS) */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-80 backdrop-blur-xl border-r transform transition-transform duration-300 ease-in-out shadow-2xl',
            isDark ? 'bg-slate-950/95 border-indigo-500/10' : 'bg-white/95 border-slate-200',
            isSidebarOpen ? 'translate-x-0 lg:relative' : '-translate-x-full'
          )}
        >
          <div className="h-full overflow-y-auto custom-scrollbar">
            <SettingsConsole />
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div
          id="dashboard-main-capture"
          className={cn(
            'relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden transition-colors duration-300',
            isDark ? 'bg-[#020617]' : 'bg-slate-50'
          )}
        >
          <DashboardHeader
            onExport={handleExport}
            exportingLabel={exporting}
            onImport={() => setIsImportOpen(true)}
            onReset={() => vm.resetAll()}
            onLaunchMasterWizard={() => setIsBudgetWizardOpen(true)}
          />

          <PlanKpiBar />

          <div className="space-y-2 px-4 pt-2 empty:hidden">
            <OverBudgetBanner />
          </div>

          <Tabs value={tab} onValueChange={selectTab} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 px-4 pt-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen((open) => !open)}
                aria-pressed={isSidebarOpen}
                title="Targets, multipliers and the channel list"
                className={cn(
                  'hidden h-[46px] min-h-0 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors lg:flex',
                  isSidebarOpen
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                    : isDark
                      ? 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                )}
              >
                <Settings2 className="h-4 w-4" />
                Assumptions
              </button>
              <TabsList
                className={cn(
                  'h-auto min-w-0 flex-1 justify-start gap-1 overflow-x-auto border p-1',
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                )}
              >
                {WORKSPACE_TABS.map(({ id, label, icon: Icon }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      'gap-2 px-4 py-2 transition-all data-[state=active]:bg-indigo-600 data-[state=active]:text-white',
                      !isDark && 'text-slate-700'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <main className="min-h-0 flex-1 overflow-y-auto !p-0">
              <div className="mx-auto max-w-[1600px] space-y-6 p-4 pb-20">
                <TabsContent value="overview" className="mt-0 space-y-6">
                  <AiCommandBar />
                  <div id="hero-charts-anchor">
                    <PlanCanvas onOpenChannels={() => selectTab('channels')} />
                  </div>
                  <div id="primary-charts-anchor">
                    <Suspense fallback={<ChartSectionSkeleton />}>
                      <ChartSection channels={vm.channels} categoryTotals={vm.categoryTotals} />
                    </Suspense>
                  </div>
                  <Suspense fallback={<p className={loadingClass}>Loading insights...</p>}>
                    <StrategicInsightsPanel />
                  </Suspense>
                </TabsContent>

                <TabsContent value="channels" className="mt-0">
                  <div
                    className={cn(
                      'rounded-xl border shadow-sm overflow-hidden',
                      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    )}
                  >
                    <ChannelTable />
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="mt-0 space-y-6">
                  <MonthConfigPanel />
                  <ProgressionPatternSelector />
                  <Tabs defaultValue="multi" className="w-full">
                    <TabsList
                      className={cn(
                        'mb-4 h-10 p-1 border',
                        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      )}
                    >
                      <TabsTrigger value="multi">Multi-Month Detailed View</TabsTrigger>
                      <TabsTrigger value="multi-charts">Multi-Month Charts</TabsTrigger>
                    </TabsList>
                    <TabsContent value="multi" className="mt-0">
                      <Suspense fallback={<p className={loadingClass}>Loading table...</p>}>
                        <PLTable />
                      </Suspense>
                    </TabsContent>
                    <TabsContent value="multi-charts" className="mt-0">
                      <Suspense fallback={<ChartSectionSkeleton />}>
                        <MultiMonthCharts />
                      </Suspense>
                    </TabsContent>
                  </Tabs>
                </TabsContent>

                <TabsContent value="scenarios" className="mt-0">
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[384px_minmax(0,1fr)]">
                    <Suspense fallback={<ScenarioListSkeleton />}>
                      <ScenarioSidebar
                        totalBudget={vm.totalBudget}
                        channelAllocations={vm.currentAllocations}
                        onLoadScenario={vm.handleLoadScenario}
                        onReset={vm.resetAll}
                        onNormalize={vm.normalizeAllocations}
                      />
                    </Suspense>
                    <div className="min-w-0">
                      <h2 className="mb-3 text-lg font-semibold">Scenario Comparison</h2>
                      <Suspense fallback={<ChartSectionSkeleton />}>
                        <ScenarioComparison />
                      </Suspense>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="markets" className="mt-0 space-y-6">
                  <MarketSplitCard />
                  <GlobalGeoArbitrageTokenMatrix />
                  <FTDVelocityEngine />
                </TabsContent>

                <TabsContent value="what-if" className="mt-0">
                  <Suspense fallback={<p className={loadingClass}>Modeling LTV scenarios...</p>}>
                    <LtvForecastPanel />
                  </Suspense>
                </TabsContent>
              </div>
            </main>
          </Tabs>
        </div>

        <SectionErrorBoundary name="planner-chat">
          <PlannerChat />
        </SectionErrorBoundary>

        {/* MODALS */}
        <Suspense fallback={null}>
          <ImportWizard open={isImportOpen} onOpenChange={setIsImportOpen} />
        </Suspense>
      </div>
    </SectionErrorBoundary>
  );
};
