import {
  useState,
  useMemo,
  useCallback,
  Component,
  ErrorInfo,
  ReactNode,
  Suspense,
  lazy,
} from 'react';
import { useBudgetGenieViewModel } from '@/hooks/use-budget-genie-view-model';
import { SettingsConsole } from './SettingsConsole';
import { DashboardHeader } from './DashboardHeader';
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
import { toast } from 'sonner';
import { exportToCsv, exportToExcel, exportToPdf, exportToPng } from '@/lib/export-service';
import { useSandboxStore } from '@/store/useSandboxStore';
import {
  buildScenarioEnvelope,
  getEfficiencyAlerts,
  getMetricIntegrityIssues,
} from '@/lib/planning-insights';

const BudgetWizard = lazy(() =>
  import('./BudgetWizard').then((m) => ({ default: m.BudgetWizard }))
);
const GenieAssistant = lazy(() =>
  import('./GenieAssistant').then((m) => ({ default: m.GenieAssistant }))
);
const ImportWizard = lazy(() =>
  import('../multi-month/ImportWizard').then((m) => ({ default: m.ImportWizard }))
);
const PLTable = lazy(() => import('../multi-month/PLTable').then((m) => ({ default: m.PLTable })));
const ChartSection = lazy(() =>
  import('./ChartSection').then((m) => ({ default: m.ChartSection }))
);
const ScenarioSidebar = lazy(() =>
  import('./ScenarioSidebar').then((m) => ({ default: m.ScenarioSidebar }))
);
const StrategicInsightsPanel = lazy(() =>
  import('./StrategicInsightsPanel').then((m) => ({ default: m.StrategicInsightsPanel }))
);
const LtvForecastPanel = lazy(() =>
  import('./LtvForecastPanel').then((m) => ({ default: m.LtvForecastPanel }))
);

// --- DEBUG: ERROR BOUNDARY ---
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-12 text-center text-white bg-slate-900 h-screen flex flex-col items-center justify-center">
          <h1 className="text-3xl font-bold text-red-500 mb-4">💥 CRASH DETECTED</h1>
          <div className="bg-slate-800 p-6 rounded-lg border border-red-500/30 max-w-2xl text-left font-mono text-sm overflow-auto">
            <p className="text-red-300 mb-2 font-bold">{this.state.error?.toString()}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-medium transition-colors"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const BudgetGenieAI = () => {
  console.log('Rendering BudgetGenieAI...'); // Trace log

  // 1. VIEW MODEL (The Brain)
  // Connects to store, handles math, provides stable data
  const vm = useBudgetGenieViewModel();
  const channels = useChannelsWithMetrics();
  const { symbol, format } = useCurrency();
  const sandboxSnapshot = useSandboxStore((state) => state.exportSnapshot);

  // 2. UI STATE (The Skin)
  // Purely presentational state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [preset, setPreset] = useState<BudgetPresetKey>('custom');
  const [isBudgetWizardOpen, setIsBudgetWizardOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const scenarioOutputs = useMemo(
    () =>
      buildScenarioEnvelope({
        baseLtvPerUser: vm.blendedMetrics.blendedCpa
          ? vm.blendedMetrics.blendedCpa * vm.blendedMetrics.blendedRoas
          : 0,
        conversions: vm.blendedMetrics.totalConversions,
        cpa: vm.blendedMetrics.blendedCpa ?? 0,
        assumptions: {
          churnRate: 0.04,
          cpaMultiplier: 1,
          roasMultiplier: 1,
        },
      }),
    [vm.blendedMetrics]
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

  const handleExport = useCallback(
    (formatType: 'pdf' | 'csv' | 'xlsx' | 'png') => {
      try {
        const exportOptions = {
          currencySymbol: symbol,
          formatCurrency: format,
        };

        if (formatType === 'pdf') {
          exportToPdf(channels, vm.totalBudget, vm.blendedMetrics, exportOptions);
          toast.success('PDF export complete');
          return;
        }

        if (formatType === 'csv') {
          exportToCsv(
            channels,
            vm.totalBudget,
            vm.blendedMetrics,
            exportOptions,
            scenarioOutputs,
            efficiencyAlerts,
            sandboxSnapshot
          );
          toast.success('CSV export complete');
          return;
        }

        if (formatType === 'xlsx') {
          exportToExcel(
            channels,
            vm.totalBudget,
            vm.blendedMetrics,
            scenarioOutputs,
            efficiencyAlerts,
            sandboxSnapshot
          );
          toast.success('Excel export complete');
          return;
        }

        exportToPng().catch((error) => {
          toast.error(error.message || 'PNG export failed');
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Export failed');
      }
    },
    [
      channels,
      efficiencyAlerts,
      format,
      sandboxSnapshot,
      scenarioOutputs,
      symbol,
      vm.blendedMetrics,
      vm.totalBudget,
    ]
  );

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-[#020617] text-white overflow-hidden font-inter selection:bg-indigo-500/30">
        {/* WIZARD MODAL */}
        <Suspense fallback={null}>
          <BudgetWizard isOpen={isBudgetWizardOpen} onClose={() => setIsBudgetWizardOpen(false)} />
        </Suspense>

        {/* LEFT SIDEBAR (SETTINGS) */}
        <div
          className={`
                    fixed inset-y-0 left-0 z-50 w-80 bg-slate-950/95 backdrop-blur-xl border-r border-indigo-500/10 
                    transform transition-transform duration-300 ease-in-out shadow-2xl
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    lg:relative lg:translate-x-0
                `}
        >
          <div className="h-full overflow-y-auto custom-scrollbar">
            <SettingsConsole />
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div id="dashboard-main-capture" className="relative z-10 flex flex-col overflow-y-auto">
          <DashboardHeader
            budgetPreset={preset}
            onPresetChange={setPreset}
            onExport={handleExport}
            onImport={() => setIsImportOpen(true)}
            onReset={() => vm.resetAll()}
          />

          <main className="flex-1 overflow-y-auto">
            {/* BUDGET HERO (Big Number) */}
            <div id="hero-charts-anchor">
              <BudgetHero />
            </div>

            <div className="max-w-[1600px] mx-auto space-y-6 pb-20 p-6">
              {/* MONTHLY CONFIG (Seasonality) */}
              <div className="mb-6">
                <MonthConfigPanel />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-6">
                {/* CENTER COLUMN (Charts & Wizard) */}
                <div className="xl:col-span-3 space-y-6">
                  {/* PROJECT MANAGER (Top Bar) */}
                  <Suspense
                    fallback={
                      <div className="rounded-xl border border-slate-800 p-3 text-xs text-slate-400">
                        Loading vault...
                      </div>
                    }
                  >
                    <ProjectManager />
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
                      <div className="rounded-xl border border-slate-800 p-4 text-xs text-slate-400">
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

                  {/* STRATEGIC WAR ROOM */}
                  <Suspense
                    fallback={
                      <div className="rounded-xl border border-slate-800 p-4 text-xs text-slate-400">
                        Loading insights...
                      </div>
                    }
                  >
                    <StrategicInsightsPanel />
                  </Suspense>

                  {/* PROGRESSION PATTERN (Moved) */}
                  <ProgressionPatternSelector />
                </div>

                {/* RIGHT SIDEBAR (Scenarios) */}
                <div className="xl:col-span-1">
                  <Suspense fallback={<ScenarioListSkeleton />}>
                    <ScenarioSidebar
                      totalBudget={vm.totalBudget}
                      channelAllocations={vm.currentAllocations}
                      onLoadScenario={vm.handleLoadScenario}
                      onReset={vm.resetAll}
                      onNormalize={vm.normalizeAllocations}
                    />
                  </Suspense>
                </div>
              </div>

              {/* DATA GRID (Tabs) */}
              <Tabs defaultValue="single" className="w-full mt-6">
                <TabsList className="bg-slate-900 border border-slate-800 mb-4 h-10 p-1">
                  <TabsTrigger
                    value="single"
                    className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all"
                  >
                    Global View
                  </TabsTrigger>
                  <TabsTrigger
                    value="multi"
                    className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all"
                  >
                    Multi-Month Detailed View
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="single" className="mt-0">
                  <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                    <ChannelTable />
                  </div>
                </TabsContent>

                <TabsContent value="multi" className="mt-0">
                  <Suspense
                    fallback={<div className="p-4 text-sm text-slate-400">Loading table...</div>}
                  >
                    <PLTable />
                  </Suspense>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>

        {/* MODALS */}
        <Suspense fallback={null}>
          <GenieAssistant />
          <ImportWizard open={isImportOpen} onOpenChange={setIsImportOpen} />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
};
