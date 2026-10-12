import { buildPlanScenarios, DEFAULT_CHURN_RATE } from '@/lib/ltv-model';
import { PlannerChat } from '../planner/PlannerChat';
import { useState, useMemo, useCallback, Suspense } from 'react';
import { SectionErrorBoundary } from '@/components/common/SectionErrorBoundary';
import { lazyWithReload } from '@/lib/lazy-with-reload';
import { useBudgetGenieViewModel } from '@/hooks/use-budget-genie-view-model';
import { SettingsConsole } from './SettingsConsole';
import { DashboardHeader } from './DashboardHeader';
import { EfficiencyAlertBanner } from './EfficiencyAlertBanner';
import { BudgetHero } from './BudgetHero';
import { ChannelTable } from './ChannelTable';
import { ProjectManager } from './ProjectManager';
import { MonthConfigPanel } from '../multi-month/MonthConfigPanel';
import { WizardLauncherCard } from './WizardLauncherCard';
import { ProgressionPatternSelector } from '../multi-month/ProgressionPatternSelector';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BudgetPresetKey } from '@/lib/mediaplan-data';
import { ChartSectionSkeleton, ScenarioListSkeleton } from '@/components/common/AppSkeletons';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTheme } from '@/hooks/use-theme';
import { toast } from 'sonner';
import { FTDVelocityEngine } from './FTDVelocityEngine';
import { GlobalGeoArbitrageTokenMatrix } from './GlobalGeoArbitrageTokenMatrix';
import {
  exportToCsv,
  exportToExcel,
  exportToPdf,
  exportEnterpriseConfigJson,
} from '@/lib/export-service';
import { useSandboxStore } from '@/store/useSandboxStore';
import { cn } from '@/lib/utils';
import {
  getEfficiencyAlerts,
  getMetricIntegrityIssues,
} from '@/lib/planning-insights';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
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

export const BudgetGenieAI = () => {
  // 1. VIEW MODEL (The Brain)
  // Connects to store, handles math, provides stable data
  const vm = useBudgetGenieViewModel();
  const channels = useChannelsWithMetrics();
  const { symbol, format } = useCurrency();
  const { theme } = useTheme();
  const { globalMultipliers, userStatus } = useMediaPlanStore();
  const sandboxSnapshot = useSandboxStore((state) => state.exportSnapshot);
  const isDark = theme === 'dark' || theme === 'contrast';

  // 2. UI STATE (The Skin)
  // Purely presentational state
  // On phones/tablets the settings drawer covers the dashboard, so start closed there.
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024
  );
  const [preset, setPreset] = useState<BudgetPresetKey>('custom');
  const [isBudgetWizardOpen, setIsBudgetWizardOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Same scenario model as the LTV lab and /report, so exports show the same numbers.
  const playerValue = useMediaPlanStore((s) => s.globalMultipliers.playerValue);
  const observedLtv = useMediaPlanStore((s) => s.observedLtv);
  const scenarioOutputs = useMemo(
    () =>
      buildPlanScenarios(vm.blendedMetrics, {
        playerValue,
        blendedRoas: vm.blendedMetrics.blendedRoas,
        churnRate: DEFAULT_CHURN_RATE,
        observedLtv,
      }),
    [observedLtv, playerValue, vm.blendedMetrics]
  );

  const efficiencyAlerts = useMemo(() => {
    const modelAlerts = getEfficiencyAlerts(channels).map((alert) => ({
      channelName: alert.channelName,
      reason: alert.reason,
      severity: alert.severity,
    }));

    const integrityAlerts = getMetricIntegrityIssues(channels).map((issue) => ({
      channelName: issue.channelName,
      reason: issue.issue,
      severity: 'medium' as const,
    }));

    return [...modelAlerts, ...integrityAlerts];
  }, [channels]);

  const { exporting, run: runExportTask } = useExportRunner();

  const handleExport = useCallback(
    async (formatType: 'pdf' | 'csv' | 'xlsx' | 'json') => {
      if (userStatus === 'demo') {
        toast.error(
          'Deployment Blocked. Exporting optimized CPA and ROAS targets requires a Pro Acquisition License.'
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
            exportToPdf(channels, vm.totalBudget, vm.blendedMetrics, exportOptions)
          );
          return;
        case 'csv':
          await runExportTask('CSV', () =>
            exportToCsv(
              channels,
              vm.totalBudget,
              vm.blendedMetrics,
              exportOptions,
              scenarioOutputs,
              efficiencyAlerts,
              sandboxSnapshot
            )
          );
          return;
        case 'json':
          await runExportTask('JSON config', () =>
            exportEnterpriseConfigJson(
              channels,
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
            exportToExcel(
              channels,
              vm.totalBudget,
              vm.blendedMetrics,
              scenarioOutputs,
              efficiencyAlerts,
              sandboxSnapshot
            )
          );
          return;
      }
    },
    [
      channels,
      efficiencyAlerts,
      format,
      globalMultipliers.cpaTarget,
      globalMultipliers.roasTarget,
      runExportTask,
      sandboxSnapshot,
      scenarioOutputs,
      symbol,
      userStatus,
      vm.blendedMetrics,
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
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:relative lg:translate-x-0'
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
            'relative z-10 flex flex-1 flex-col overflow-y-auto transition-colors duration-300',
            isDark ? 'bg-[#020617]' : 'bg-slate-50'
          )}
        >
          <DashboardHeader
            budgetPreset={preset}
            onPresetChange={setPreset}
            onExport={handleExport}
            exportingLabel={exporting}
            onImport={() => setIsImportOpen(true)}
            onReset={() => vm.resetAll()}
            onLaunchMasterWizard={() => setIsBudgetWizardOpen(true)}
          />

          <div className="max-w-[1600px] mx-auto w-full px-6 pt-3">
            <EfficiencyAlertBanner />
          </div>

          <main className={cn('flex-1 overflow-y-auto', isDark ? 'bg-[#020617]' : 'bg-slate-50')}>
            {/* BUDGET HERO (Big Number) */}
            <div id="hero-charts-anchor">
              <BudgetHero />
            </div>

            <div className="max-w-[1600px] mx-auto space-y-6 pb-20 p-6">
              {/* MONTHLY CONFIG (Seasonality) */}
              <div className="mb-6">
                <MonthConfigPanel />
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_384px] gap-6 mb-6">
                {/* CENTER COLUMN (Charts & Wizard) */}
                <div className="min-w-0 space-y-6">
                  {/* PROJECT MANAGER (Top Bar) */}
                  <Suspense
                    fallback={
                      <div
                        className={cn(
                          'rounded-xl border p-3 text-xs',
                          isDark
                            ? 'border-slate-800 text-slate-400'
                            : 'border-slate-200 text-slate-600 bg-white'
                        )}
                      >
                        Loading vault...
                      </div>
                    }
                  >
                    <ProjectManager isDark={isDark} />
                  </Suspense>

                  {/* CHARTS (The Visuals) */}
                  {/* Data passed from ViewModel ensuring consistency */}
                  <div id="primary-charts-anchor">
                    <Suspense fallback={<ChartSectionSkeleton />}>
                      <ChartSection channels={vm.channels} categoryTotals={vm.categoryTotals} />
                    </Suspense>
                  </div>

                  <Suspense
                    fallback={
                      <div
                        className={cn(
                          'rounded-xl border p-4 text-xs',
                          isDark
                            ? 'border-slate-800 text-slate-400'
                            : 'border-slate-200 text-slate-600 bg-white'
                        )}
                      >
                        Modeling LTV scenarios...
                      </div>
                    }
                  >
                    <LtvForecastPanel />
                  </Suspense>

                  {/* WIZARD LAUNCHER */}
                  <WizardLauncherCard
                    variant="banner"
                    onLaunch={() => setIsBudgetWizardOpen(true)}
                  />

                  {/* PROGRESSION PATTERN (Moved) */}
                  <ProgressionPatternSelector />
                </div>

                {/* RIGHT SIDEBAR (Scenarios) */}
                <div className="shrink-0 w-full xl:w-96 min-w-0">
                  <div className="w-full xl:sticky xl:top-4 space-y-6">
                    <Suspense fallback={<ScenarioListSkeleton />}>
                      <ScenarioSidebar
                        totalBudget={vm.totalBudget}
                        channelAllocations={vm.currentAllocations}
                        onLoadScenario={vm.handleLoadScenario}
                        onReset={vm.resetAll}
                        onNormalize={vm.normalizeAllocations}
                      />
                    </Suspense>

                    <Suspense
                      fallback={
                        <div
                          className={cn(
                            'rounded-xl border p-4 text-xs',
                            isDark
                              ? 'border-slate-800 text-slate-400'
                              : 'border-slate-200 text-slate-600 bg-white'
                          )}
                        >
                          Loading insights...
                        </div>
                      }
                    >
                      <StrategicInsightsPanel />
                    </Suspense>
                  </div>
                </div>
              </div>

              {/* MACRO VELOCITY WIDGET */}
              <GlobalGeoArbitrageTokenMatrix />

              <FTDVelocityEngine />

              {/* DATA GRID (Tabs) */}
              <Tabs defaultValue="single" className="w-full mt-6">
                <TabsList
                  className={cn(
                    'mb-4 h-10 p-1 border',
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                  )}
                >
                  <TabsTrigger
                    value="single"
                    className={cn(
                      'transition-all',
                      isDark
                        ? 'data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                        : 'text-slate-700 data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                    )}
                  >
                    Global View
                  </TabsTrigger>
                  <TabsTrigger
                    value="multi"
                    className={cn(
                      'transition-all',
                      isDark
                        ? 'data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                        : 'text-slate-700 data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                    )}
                  >
                    Multi-Month Detailed View
                  </TabsTrigger>
                  <TabsTrigger
                    value="multi-charts"
                    className={cn(
                      'transition-all',
                      isDark
                        ? 'data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                        : 'text-slate-700 data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                    )}
                  >
                    Multi-Month Charts
                  </TabsTrigger>
                  <TabsTrigger
                    value="scenarios"
                    className={cn(
                      'transition-all',
                      isDark
                        ? 'data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                        : 'text-slate-700 data-[state=active]:bg-indigo-600 data-[state=active]:text-white'
                    )}
                  >
                    Scenario Comparison
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="single" className="mt-0">
                  <div
                    className={cn(
                      'rounded-xl border shadow-sm overflow-hidden',
                      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    )}
                  >
                    <ChannelTable />
                  </div>
                </TabsContent>

                <TabsContent value="multi" className="mt-0">
                  <Suspense
                    fallback={
                      <div
                        className={cn('p-4 text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}
                      >
                        Loading table...
                      </div>
                    }
                  >
                    <PLTable />
                  </Suspense>
                </TabsContent>

                <TabsContent value="multi-charts" className="mt-0">
                  <Suspense fallback={<ChartSectionSkeleton />}>
                    <MultiMonthCharts />
                  </Suspense>
                </TabsContent>

                <TabsContent value="scenarios" className="mt-0">
                  <Suspense fallback={<ChartSectionSkeleton />}>
                    <ScenarioComparison />
                  </Suspense>
                </TabsContent>
              </Tabs>
            </div>
          </main>
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
