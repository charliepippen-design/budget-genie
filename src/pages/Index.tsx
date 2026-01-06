import { useCallback, useEffect } from 'react';
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

// Multi-Month Components
import { MonthConfigPanel } from '@/components/multi-month/MonthConfigPanel';
import { MultiMonthGlobalSettings } from '@/components/multi-month/MultiMonthGlobalSettings';
import { PLTable } from '@/components/multi-month/PLTable';
import { MultiMonthCharts } from '@/components/multi-month/MultiMonthCharts';
import { ScenarioComparison } from '@/components/multi-month/ScenarioComparison';
import { AutoOptimizer } from '@/components/multi-month/AutoOptimizer';

import { 
  useMediaPlanStore, 
  useChannelsWithMetrics, 
  useBlendedMetrics,
  useCategoryTotals,
} from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { formatCurrency, BudgetPresetKey } from '@/lib/mediaplan-data';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const { totalBudget, setTotalBudget } = useMediaPlanStore();
  const channelsWithMetrics = useChannelsWithMetrics();
  const blendedMetrics = useBlendedMetrics();
  const categoryTotals = useCategoryTotals();
  const { generateMonths, months } = useMultiMonthStore();
  
  const { toast } = useToast();

  // Generate months on first load if empty
  useEffect(() => {
    if (months.length === 0) {
      generateMonths();
    }
  }, []);

  // Export handlers
  const handleExport = useCallback(async (format: 'pdf' | 'csv' | 'png') => {
    if (format === 'csv') {
      const headers = [
        'Channel', 'Category', 'Allocation %', 'Spend', 'CPM', 'Impressions',
        'CTR %', 'Conv. Rate %', 'Conversions', 'CPA', 'ROAS', 'Impression Mode',
      ];
      const rows = channelsWithMetrics.map((ch) => [
        ch.name, ch.category, ch.allocationPct.toFixed(2), ch.metrics.spend.toFixed(2),
        ch.metrics.effectiveCpm.toFixed(2), Math.round(ch.metrics.impressions),
        ch.metrics.effectiveCtr.toFixed(2), ch.metrics.effectiveCr.toFixed(2),
        Math.round(ch.metrics.conversions), ch.metrics.cpa?.toFixed(2) || 'N/A',
        ch.metrics.roas.toFixed(2), ch.impressionMode,
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
        '', `Total Budget,${formatCurrency(totalBudget)}`,
        `Blended CPA,${blendedMetrics.blendedCpa ? formatCurrency(blendedMetrics.blendedCpa) : 'N/A'}`,
        `Total Conversions,${Math.round(blendedMetrics.totalConversions)}`,
        `Projected Revenue,${formatCurrency(blendedMetrics.projectedRevenue)}`,
        `Blended ROAS,${blendedMetrics.blendedRoas.toFixed(2)}x`,
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mediaplan-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: 'CSV Exported', description: 'Your media plan has been exported to CSV.' });
    } else {
      toast({
        title: `${format.toUpperCase()} Export`,
        description: 'Use your browser\'s print function (Ctrl/Cmd + P) to save as PDF.',
      });
    }
  }, [channelsWithMetrics, totalBudget, blendedMetrics, toast]);

  return (
    <>
      <Helmet>
        <title>MediaPlan Pro - Interactive Budget Scaler | iGaming Media Planning</title>
        <meta name="description" content="Professional media plan budget calibrator for iGaming and digital marketing. Scale budgets, analyze ROI, and optimize channel allocation in real-time." />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <DashboardHeader
          budgetPreset={'custom' as BudgetPresetKey}
          onPresetChange={() => {}}
          onExport={handleExport}
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
    </>
  );
};

export default Index;
