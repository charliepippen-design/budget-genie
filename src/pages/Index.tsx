import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutGrid, Calendar } from 'lucide-react';

// Quick View Components
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { BudgetSlider } from '@/components/dashboard/BudgetSlider';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { ChannelTable } from '@/components/dashboard/ChannelTable';
import { ChartSection } from '@/components/dashboard/ChartSection';
import { SettingsConsole } from '@/components/dashboard/SettingsConsole';
import { BudgetGenieAI } from '@/components/dashboard/BudgetGenieAI';
import { ProjectManager } from '@/components/dashboard/ProjectManager';

// Multi-Month Components
import { MonthConfigPanel } from '@/components/multi-month/MonthConfigPanel';
import { MultiMonthGlobalSettings } from '@/components/multi-month/MultiMonthGlobalSettings';
import { PLTable } from '@/components/multi-month/PLTable';
import { MultiMonthCharts } from '@/components/multi-month/MultiMonthCharts';
import { ScenarioComparison } from '@/components/multi-month/ScenarioComparison';
import { ImportWizard } from '@/components/multi-month/ImportWizard';
import { AutoOptimizer } from '@/components/multi-month/AutoOptimizer';

import {
  useMediaPlanStore,
  useChannelsWithMetrics,
  useBlendedMetrics,
  useCategoryTotals,
} from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { BudgetPresetKey, BUDGET_PRESETS } from '@/lib/mediaplan-data';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import { exportToPdf, exportToCsv } from '@/lib/export-service';

const Index = () => {
  const { totalBudget, setTotalBudget, applyCategoryMultipliers } = useMediaPlanStore();
  const [currentPreset, setCurrentPreset] = useState<BudgetPresetKey>('custom');
  const [importOpen, setImportOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const channelsWithMetrics = useChannelsWithMetrics();
  const blendedMetrics = useBlendedMetrics();
  const categoryTotals = useCategoryTotals();
  const { generateMonths, months } = useMultiMonthStore();
  const { format: formatCurrency, symbol: currencySymbol } = useCurrency();

  const { toast } = useToast();

  // Generate months whenever budget changes or on first load
  useEffect(() => {
    generateMonths(totalBudget);
  }, [totalBudget, generateMonths]);

  // Export handlers
  const handleExport = useCallback(async (format: 'pdf' | 'csv' | 'png') => {
    const exportOptions = {
      currencySymbol,
      formatCurrency,
    };

    try {
      if (format === 'pdf') {
        exportToPdf(channelsWithMetrics, totalBudget, blendedMetrics, exportOptions);
        toast({ title: 'PDF Exported', description: 'Your media plan has been exported to PDF.' });
      } else if (format === 'csv') {
        exportToCsv(channelsWithMetrics, totalBudget, blendedMetrics, exportOptions);
        toast({ title: 'CSV Exported', description: 'Your media plan has been exported to CSV.' });
      } else if (format === 'png') {
        const html2canvas = (await import('html2canvas')).default;
        const element = document.querySelector('.main-content-area') as HTMLElement; // Target specific area
        if (!element) throw new Error('Preview area not found');

        toast({ title: 'Generating Image', description: 'Capturing high-res dashboard screenshot...' });

        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const image = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = image;
        link.download = `MediaPlan-Pro-${new Date().toISOString().split('T')[0]}.png`;
        link.click();

        toast({ title: 'Export Complete', description: 'PNG saved to downloads.' });
      }
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'An error occurred during export.',
        variant: 'destructive',
      });
    }
  }, [channelsWithMetrics, totalBudget, blendedMetrics, formatCurrency, currencySymbol, toast]);

  const handlePresetChange = (preset: BudgetPresetKey) => {
    setCurrentPreset(preset);
    if (preset === 'custom') return;

    const config = BUDGET_PRESETS[preset];
    if (config) {
      applyCategoryMultipliers(config.multipliers);
      toast({
        title: `${config.name} Preset Applied`,
        description: config.description,
      });
    }
  };

  const handleReset = useCallback(() => {
    if (confirm('BRUTAL RESET: This will wipe all data and reset the budget to $0. Are you sure?')) {
      useMediaPlanStore.getState().resetAll();
      useMultiMonthStore.getState().resetPlan();

      localStorage.removeItem('mediaplan-store-v2');
      localStorage.removeItem('multi-month-plan-store');

      toast({
        title: 'Project Reset',
        description: 'All data has been wiped and restored to defaults.',
      });
    }
  }, [toast]);

  return (
    <>
      <Helmet>
        <title>MediaPlanner Pro - Interactive Budget Scaler | iGaming Media Planning</title>
        <meta name="description" content="Professional media plan budget calibrator for iGaming and digital marketing. Scale budgets, analyze ROI, and optimize channel allocation in real-time." />
      </Helmet>

      {/* REPAIR: STRICT FLEXBOX ROW LAYOUT */}
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950">

        {/* COLUMN 1: SIDEBAR (Strict Fixed Width with Toggle) */}
        {/* MUST be 'relative', NOT 'absolute'. MUST be 'flex-shrink-0'. */}
        <div className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 transition-all duration-300 border-r border-slate-800 bg-slate-900 overflow-y-auto relative`}>
          {/* Inner wrapper to prevent content squishing during transition */}
          <div className="w-80 p-0 min-h-full">
            <SettingsConsole />
          </div>
        </div>

        {/* COLUMN 2: MAIN CONTENT (Takes remaining space) */}
        {/* MUST be 'flex-1'. This forces it to sit NEXT to the sidebar. */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <DashboardHeader
            budgetPreset={currentPreset}
            onPresetChange={handlePresetChange}
            onExport={handleExport}
            onImport={() => setImportOpen(true)}
            onReset={handleReset}
            isOpen={isSidebarOpen}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />

          <main className="flex-1 overflow-y-auto bg-slate-950 main-content-area">
            <div className="flex flex-col min-h-full">
              <Tabs defaultValue="quick" className="flex-1 flex flex-col">
                <div className="border-b border-border bg-card/50 sticky top-0 z-40 backdrop-blur-sm">
                  <div className="flex items-center px-6 py-2">
                    <TabsList className="h-9 bg-slate-800/50 gap-1 border border-slate-700/50">
                      <TabsTrigger value="quick" className="gap-2 text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <LayoutGrid className="h-3.5 w-3.5" />
                        Quick View
                      </TabsTrigger>
                      <TabsTrigger value="multi-month" className="gap-2 text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <Calendar className="h-3.5 w-3.5" />
                        Multi-Month Plan
                      </TabsTrigger>
                    </TabsList>
                  </div>
                </div>

                {/* Quick View Tab */}
                <TabsContent value="quick" className="flex-1 p-6 space-y-6 m-0 animate-in fade-in duration-300">
                  <div className="max-w-7xl mx-auto space-y-6 pb-20">
                    <BudgetSlider value={totalBudget} onChange={setTotalBudget} />
                    <SummaryCards
                      totalBudget={blendedMetrics.totalSpend}
                      blendedCpa={blendedMetrics.blendedCpa}
                      totalConversions={blendedMetrics.totalConversions}
                      projectedRevenue={blendedMetrics.projectedRevenue}
                      blendedRoas={blendedMetrics.blendedRoas}
                    />
                    <ChartSection channels={channelsWithMetrics} categoryTotals={categoryTotals} />
                    <div className="bg-card/50 border border-border rounded-xl shadow-sm overflow-hidden">
                      <ChannelTable />
                    </div>
                  </div>
                </TabsContent>

                {/* Multi-Month Tab */}
                <TabsContent value="multi-month" className="flex-1 p-6 m-0 animate-in fade-in duration-300">
                  <div className="flex flex-col lg:flex-row gap-6 max-w-full pb-20">
                    {/* Left Config Panel */}
                    <div className="w-full lg:w-80 flex-shrink-0 space-y-6">
                      <MultiMonthGlobalSettings />
                      <MonthConfigPanel />
                    </div>

                    {/* Right Content */}
                    <div className="flex-1 min-w-0 space-y-6">
                      <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="mb-4 bg-slate-800/50 border border-slate-700/50">
                          <TabsTrigger value="overview">Plan Overview</TabsTrigger>
                          <TabsTrigger value="comparison">Scenario Comparison</TabsTrigger>
                          <TabsTrigger value="optimizer">Auto-Optimizer</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-6">
                          <PLTable />
                          <MultiMonthCharts />
                        </TabsContent>

                        <TabsContent value="comparison">
                          <ScenarioComparison />
                        </TabsContent>

                        <TabsContent value="optimizer">
                          <AutoOptimizer />
                        </TabsContent>
                      </Tabs>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>

      <BudgetGenieAI />
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
};

export default Index;