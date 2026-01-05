import { useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { BudgetSlider } from '@/components/dashboard/BudgetSlider';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { ChannelTable } from '@/components/dashboard/ChannelTable';
import { ChartSection } from '@/components/dashboard/ChartSection';
import { SettingsConsole } from '@/components/dashboard/SettingsConsole';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { formatCurrency, BudgetPresetKey } from '@/lib/mediaplan-data';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const {
    totalBudget,
    setTotalBudget,
    channels,
    channelAllocations,
    setChannelAllocation,
    normalizeAllocations,
    globalMultipliers,
    setGlobalMultipliers,
    resetGlobalMultipliers,
    channelsWithMetrics,
    blendedMetrics,
    categoryTotals,
    addChannel,
    updateChannel,
    deleteChannel,
    resetAll,
    savePreset,
    loadPreset,
    deletePreset,
    presets,
  } = useMediaPlanStore();

  const { toast } = useToast();
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Export handlers
  const handleExport = useCallback(async (format: 'pdf' | 'csv' | 'png') => {
    if (format === 'csv') {
      // Generate CSV
      const headers = ['Channel', 'Category', 'Allocation %', 'Spend', 'CPM', 'Impressions', 'CTR %', 'Conversions', 'CPA', 'ROAS'];
      const rows = channelsWithMetrics.map((ch) => [
        ch.name,
        ch.category,
        ch.currentPercentage.toFixed(2),
        ch.metrics.spend.toFixed(2),
        ch.effectiveCpm?.toFixed(2) || '',
        Math.round(ch.metrics.impressions),
        ch.effectiveCtr?.toFixed(2) || '',
        Math.round(ch.metrics.conversions),
        ch.metrics.cpa?.toFixed(2) || 'N/A',
        ch.metrics.roas.toFixed(2),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
        '',
        `Total Budget,${formatCurrency(totalBudget)}`,
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

      toast({
        title: 'CSV Exported',
        description: 'Your media plan has been exported to CSV.',
      });
    } else if (format === 'pdf' || format === 'png') {
      toast({
        title: `${format.toUpperCase()} Export`,
        description: 'Use your browser\'s print function (Ctrl/Cmd + P) to save as PDF, or take a screenshot for PNG.',
      });
    }
  }, [channelsWithMetrics, totalBudget, blendedMetrics, toast]);

  return (
    <>
      <Helmet>
        <title>MediaPlan Pro - Interactive Budget Scaler | iGaming Media Planning</title>
        <meta 
          name="description" 
          content="Professional media plan budget calibrator for iGaming and digital marketing. Scale budgets, analyze ROI, and optimize channel allocation in real-time." 
        />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <DashboardHeader
          budgetPreset={'custom' as BudgetPresetKey}
          onPresetChange={() => {}}
          onExport={handleExport}
        />

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Settings Console - Left Sidebar */}
          <SettingsConsole
            totalBudget={totalBudget}
            setTotalBudget={setTotalBudget}
            channels={channels}
            channelAllocations={channelAllocations}
            setChannelAllocation={setChannelAllocation}
            normalizeAllocations={normalizeAllocations}
            globalMultipliers={globalMultipliers}
            setGlobalMultipliers={setGlobalMultipliers}
            resetGlobalMultipliers={resetGlobalMultipliers}
            channelsWithMetrics={channelsWithMetrics}
            addChannel={addChannel}
            updateChannel={updateChannel}
            deleteChannel={deleteChannel}
            resetAll={resetAll}
            savePreset={savePreset}
            presets={presets}
            loadPreset={loadPreset}
            deletePreset={deletePreset}
          />

          {/* Dashboard Content */}
          <main className="flex-1 overflow-auto" ref={dashboardRef}>
            <div className="container mx-auto px-4 py-6 space-y-6">
              {/* Budget Slider */}
              <BudgetSlider
                value={totalBudget}
                onChange={setTotalBudget}
              />

              {/* Summary Cards */}
              <SummaryCards
                totalBudget={blendedMetrics.totalSpend}
                blendedCpa={blendedMetrics.blendedCpa}
                totalConversions={blendedMetrics.totalConversions}
                projectedRevenue={blendedMetrics.projectedRevenue}
                blendedRoas={blendedMetrics.blendedRoas}
              />

              {/* Charts */}
              <ChartSection
                channels={channelsWithMetrics}
                categoryTotals={categoryTotals}
              />

              {/* Channel Table */}
              <ChannelTable
                channels={channelsWithMetrics}
                onAllocationChange={setChannelAllocation}
                categoryTotals={categoryTotals}
              />
            </div>
          </main>
        </div>
      </div>
    </>
  );
};

export default Index;
