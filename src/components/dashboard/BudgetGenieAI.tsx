import React, { useState } from 'react';
import { DashboardHeader } from './DashboardHeader';
import { ChannelTable } from './ChannelTable';
import { ChartSection } from './ChartSection';
import { ProjectManager } from './ProjectManager';
// import { ScenarioSidebar } from './ScenarioSidebar'; // Not found in recent file list, omitting to avoid build error
import { SettingsConsole } from './SettingsConsole'; // REPLACED ChannelEditor with correct Sidebar Component
import { useMediaPlanStore } from '@/hooks/use-media-plan-store'; // FIXED import

// Additional imports needed for the full dashboard experience that were in Index.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutGrid, Calendar } from 'lucide-react';
import { BudgetSlider } from '@/components/dashboard/BudgetSlider';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { useChannelsWithMetrics, useBlendedMetrics, useCategoryTotals } from '@/hooks/use-media-plan-store';
import { MultiMonthGlobalSettings } from '@/components/multi-month/MultiMonthGlobalSettings';
import { MonthConfigPanel } from '@/components/multi-month/MonthConfigPanel';
import { PLTable } from '@/components/multi-month/PLTable';
import { MultiMonthCharts } from '@/components/multi-month/MultiMonthCharts';
import { ScenarioComparison } from '@/components/multi-month/ScenarioComparison';
import { AutoOptimizer } from '@/components/multi-month/AutoOptimizer';

export const BudgetGenieAI: React.FC = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Data hooks needed for the content
    const { totalBudget, setTotalBudget } = useMediaPlanStore();
    const channelsWithMetrics = useChannelsWithMetrics();
    const blendedMetrics = useBlendedMetrics();
    const categoryTotals = useCategoryTotals();

    // Handlers from Index.tsx (simplified for this context)
    const [preset, setPreset] = useState<any>('custom');

    return (
        // MAIN CONTAINER: Strict Flex Row.
        <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">

            {/* LEFT COLUMN: SIDEBAR */}
            {/* relative positioning ensures it takes up physical space. flex-shrink-0 prevents squishing. */}
            {/* Inner wrapper div ensures content width is stable during transition */}
            <div
                className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 transition-all duration-300 border-r border-slate-800 bg-slate-900 overflow-y-auto relative z-20`}
            >
                <div className="w-80 min-h-full">
                    <SettingsConsole />
                </div>
            </div>

            {/* RIGHT COLUMN: MAIN CONTENT */}
            {/* flex-1 forces it to fill ONLY the remaining space. */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">

                <DashboardHeader
                    budgetPreset={preset}
                    onPresetChange={setPreset}
                    onExport={() => { }} // Placeholder
                    onImport={() => { }} // Placeholder
                    onReset={() => useMediaPlanStore.getState().resetAll()} // Placeholder
                    toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    isOpen={isSidebarOpen}
                />

                <main className="flex-1 overflow-y-auto bg-slate-950 p-0">
                    <div className="flex flex-col min-h-full">
                        <Tabs defaultValue="quick" className="flex-1 flex flex-col">
                            <div className="border-b border-border bg-card/50 sticky top-0 z-40 backdrop-blur-sm">
                                <div className="flex items-center px-6 py-2">
                                    <TabsList className="h-9 bg-slate-800/50 gap-1 border border-slate-700/50">
                                        <TabsTrigger value="quick" className="gap-2 text-xs">
                                            <LayoutGrid className="h-3.5 w-3.5" /> Quick View
                                        </TabsTrigger>
                                        <TabsTrigger value="multi-month" className="gap-2 text-xs">
                                            <Calendar className="h-3.5 w-3.5" /> Multi-Month Plan
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>

                            <TabsContent value="quick" className="flex-1 p-6 space-y-6 m-0">
                                <div className="max-w-7xl mx-auto space-y-6 pb-20">
                                    <BudgetSlider value={totalBudget} onChange={setTotalBudget} />
                                    <SummaryCards
                                        totalBudget={blendedMetrics.totalSpend}
                                        blendedCpa={blendedMetrics.blendedCpa}
                                        totalConversions={blendedMetrics.totalConversions}
                                        projectedRevenue={blendedMetrics.projectedRevenue}
                                        blendedRoas={blendedMetrics.blendedRoas}
                                    />
                                    <div className="grid grid-cols-1 gap-6">
                                        <ChartSection channels={channelsWithMetrics} categoryTotals={categoryTotals} />
                                    </div>
                                    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                                        <ChannelTable />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="multi-month" className="flex-1 p-6 m-0">
                                <div className="flex flex-col lg:flex-row gap-6 max-w-full pb-20">
                                    <div className="w-full lg:w-80 flex-shrink-0 space-y-6">
                                        <MultiMonthGlobalSettings />
                                        <MonthConfigPanel />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-6">
                                        <Tabs defaultValue="overview" className="w-full">
                                            <TabsList className="mb-4 bg-slate-800/50">
                                                <TabsTrigger value="overview">Overview</TabsTrigger>
                                                <TabsTrigger value="comparison">Scenario</TabsTrigger>
                                                <TabsTrigger value="optimizer">Auto-Optimizer</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="overview">
                                                <PLTable />
                                                <MultiMonthCharts />
                                            </TabsContent>
                                            <TabsContent value="comparison"><ScenarioComparison /></TabsContent>
                                            <TabsContent value="optimizer"><AutoOptimizer /></TabsContent>
                                        </Tabs>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                </main>
            </div>
        </div>
    );
};