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
import { BudgetGenieAI } from '@/components/dashboard/BudgetGenieAI'; // <--- We added this

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
        const element = document.querySelector('.dashboard-container') as HTMLElement;
        if (!element) throw new Error('Dashboard container not found');

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

      toast({
        title: 'Resetting...',
        description: 'Wiping data and reloading...',
      });

      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, [toast]);

  return (
    <>
      <Helmet>
        <title>MediaPlanner Pro - Interactive Budget Scaler | iGaming Media Planning</title>
        <meta name="description" content="Professional media plan budget calibrator for iGaming and digital marketing. Scale budgets, analyze ROI, and optimize channel allocation in real-time." />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col dashboard-container">
        <DashboardHeader
          budgetPreset={currentPreset}
          onPresetChange={handlePresetChange}
          onExport={handleExport}
          onImport={() => setImportOpen(true)}
          onReset={handleReset}
        />

        <Tabs defaultValue="quick" className="flex-1 flex flex-col">
          <div className="border-b border-border bg-card/50">
            <div className="container mx-auto px-4">
              <TabsList className="h-12 bg-transparent gap-4">
                <TabsTrigger value="quick" className="gap-2 data-[state=active]:bg-primary/10">
                  <LayoutGrid className="h-4 w-4" />
                  Quick View
                </TabsTrigger>
                <TabsTrigger value="multi-month" className="gap-2 data-[state=active]:bg-primary/10">
                  <Calendar className="h-4 w-4" />
                  Multi-Month Plan
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Quick View Tab */}
          <TabsContent value="quick" className="flex-1 flex overflow-hidden m-0">
            <SettingsConsole />
            <main className="flex-1 overflow-auto">
              <div className="container mx-auto px-4 py-6 space-y-6">
                <BudgetSlider value={totalBudget} onChange={setTotalBudget} />
                <SummaryCards
                  totalBudget={blendedMetrics.totalSpend}
                  blendedCpa={blendedMetrics.blendedCpa}
                  totalConversions={blendedMetrics.totalConversions}
                  projectedRevenue={blendedMetrics.projectedRevenue}
                  blendedRoas={blendedMetrics.blendedRoas}
                />
                <ChartSection channels={channelsWithMetrics} categoryTotals={categoryTotals} />
                <ChannelTable />
              </div>
            </main>
          </TabsContent>

          {/* Multi-Month Tab */}
          <TabsContent value="multi-month" className="flex-1 flex overflow-hidden m-0">
            <MultiMonthGlobalSettings />
            <main className="flex-1 overflow-auto">
              <div className="container mx-auto px-4 py-6 space-y-6">
                <MonthConfigPanel />

                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="mb-4">
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
            </main>
          </TabsContent>
        </Tabs>
      </div>

      {/* The AI Button is right here! */}
      <BudgetGenieAI />

      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
};

export default Index;