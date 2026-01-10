import { useState, useEffect } from 'react';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { SettingsConsole } from './SettingsConsole';
import { DashboardHeader } from './DashboardHeader';
import { BudgetHero } from './BudgetHero';
import { ChartSection } from './ChartSection';
import { ChannelTable } from './ChannelTable';
import { ScenarioSidebar } from './ScenarioSidebar';
import { MonthConfigPanel } from '../multi-month/MonthConfigPanel';
import { WizardLauncherCard } from './WizardLauncherCard';
import { ProjectManager } from './ProjectManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PLTable } from '../multi-month/PLTable';
import { BudgetWizard } from './BudgetWizard';
// import { MagicImportButton } from '@/components/MagicImportButton'; 
// import { ImportWizard } from '../multi-month/ImportWizard'; 
// import { GenieAssistant } from './GenieAssistant';
import { calculateBlendedMetrics, calculateChannelMetrics } from '@/lib/mediaplan-data';
// import { useBudgetEngine } from '@/hooks/use-budget-engine';

export const BudgetGenieAI = () => {
    // STATE
    const {
        channels,
        totalBudget,
        setTotalBudget,
        projectName,
        setProjectName,
        resetAll
    } = useMediaPlanStore();

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [preset, setPreset] = useState('custom');
    const [isBudgetWizardOpen, setIsBudgetWizardOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);

    // Derived Logic - SAFELY CALCULATED
    // We wrap this in safety checks to prevent crashes if data is missing
    const safeChannels = Array.isArray(channels) ? channels : [];

    // Manual metric calculation for the ChartSection (to ensure it matches Table logic)
    const channelsWithMetrics = safeChannels.map(channel => {
        try {
            const spend = (totalBudget * (channel.allocationPct || 0)) / 100;
            return calculateChannelMetrics(channel, spend);
        } catch (e) {
            console.error("Metric Calc Error", e);
            return {
                ...channel,
                metrics: { spend: 0, revenue: 0, roas: 0, cpa: 0, conversions: 0 }
            };
        }
    });

    // Calculate global metrics
    const currentAllocations = safeChannels.reduce((acc, ch) => ({ ...acc, [ch.id]: ch.allocationPct || 0 }), {});

    let blendedMetrics;
    try {
        blendedMetrics = calculateBlendedMetrics(safeChannels, currentAllocations, totalBudget);
    } catch (e) {
        blendedMetrics = { totalSpend: 0, totalRevenue: 0, blendedRoas: 0, blendedCpa: 0, totalConversions: 0 };
    }

    // Category Totals for Pie Chart
    const categoryTotals = channelsWithMetrics.reduce((acc: any, ch: any) => {
        if (!ch) return acc;
        try {
            if (!acc[ch.category]) {
                acc[ch.category] = { spend: 0, percentage: 0 };
            }
            if (ch.metrics) {
                acc[ch.category].spend += ch.metrics.spend;
                acc[ch.category].percentage += ch.allocationPct;
            }
        } catch (e) { }
        return acc;
    }, {} as Record<string, { spend: number; percentage: number }>);

    const handleLoadScenario = (scenario: any) => {
        setTotalBudget(scenario.totalBudget);
    };

    const normalizeAllocations = () => {
        // Placeholder
    };

    return (
        <div className="flex h-screen bg-[#020617] text-white overflow-hidden font-inter selection:bg-indigo-500/30">

            {/* WIZARD MODAL (Controlled) - DISABLED */}
            {/* <BudgetWizard
                isOpen={isBudgetWizardOpen}
                onClose={() => setIsBudgetWizardOpen(false)}
            /> */}

            {/* CELL 1: LEFT SIDEBAR (SETTINGS) - DISABLED */}
            <div
                className={`
                    fixed inset-y-0 left-0 z-50 w-80 bg-slate-950/95 backdrop-blur-xl border-r border-indigo-500/10 
                    transform transition-transform duration-300 ease-in-out shadow-2xl
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    lg:relative lg:translate-x-0
                `}
            >
                <div className="h-full p-6 flex items-center justify-center border-r border-dashed border-slate-800 text-slate-600">
                    Settings Console Disabled
                </div>
                {/* <div className="h-full overflow-y-auto custom-scrollbar">
                    <SettingsConsole />
                </div> */}
            </div>

            {/* CELL 2: MAIN CONTENT */}
            <div style={{
                gridColumn: '2 / 3',
                overflowY: 'auto',
                position: 'relative',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <DashboardHeader
                    budgetPreset={preset}
                    onPresetChange={setPreset}
                    onExport={() => { }}
                    onImport={() => setIsImportOpen(true)}
                    onReset={() => resetAll()}
                    toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    isOpen={isSidebarOpen}
                />

                <main className="flex-1 overflow-y-auto">
                    {/* BUDGET HERO - ENABLED */}
                    <BudgetHero />

                    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 p-6">

                        {/* TOP BAR: Project Manager - ENABLED */}
                        <ProjectManager />

                        {/* CHART SECTION - ENABLED */}
                        <ChartSection
                            blendedMetrics={blendedMetrics}
                            currentAllocations={currentAllocations}
                            totalBudget={totalBudget}
                            channels={channelsWithMetrics}
                            categoryTotals={categoryTotals}
                        />

                        {/* WIZARD BANNER - ENABLED */}
                        <WizardLauncherCard
                            variant="banner"
                            onLaunch={() => setIsBudgetWizardOpen(true)}
                        />

                    </div>
                </main>
            </div>

            {/* RIGHT: SCENARIOS & PRESETS - DISABLED */}
            {/* <div className="xl:col-span-1">
                <ScenarioSidebar
                    totalBudget={totalBudget}
                    channelAllocations={currentAllocations}
                    onLoadScenario={handleLoadScenario}
                    onReset={resetAll}
                    onNormalize={normalizeAllocations}
                />
            </div> */}

            {/* FLOATING GENIE & IMPORT - DISABLED FOR NOW */}
            {/* <GenieAssistant /> */}
            {/* <ImportWizard open={isImportOpen} onOpenChange={setIsImportOpen} /> */}

        </div>
    );
};
