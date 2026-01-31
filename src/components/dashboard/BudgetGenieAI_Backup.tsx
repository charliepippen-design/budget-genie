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
import { MagicImportButton } from '@/components/MagicImportButton'; // Legacy?
import { ImportWizard } from '../multi-month/ImportWizard'; // New Smart Wizard
import { GenieAssistant } from './GenieAssistant';
import { calculateBlendedMetrics } from '@/lib/mediaplan-data';
import { useBudgetEngine } from '@/hooks/use-budget-engine';

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

    // Derived Logic (moved from render to clean up)
    const channelsWithMetrics = useBudgetEngine(channels, totalBudget);

    // Calculate global metrics
    const currentAllocations = channels.reduce((acc, ch) => ({ ...acc, [ch.id]: ch.allocationPct }), {});
    const blendedMetrics = calculateBlendedMetrics(channels, currentAllocations, totalBudget);

    // Category Totals for Pie Chart
    const categoryTotals = channelsWithMetrics.reduce((acc, ch) => {
        if (!acc[ch.category]) {
            acc[ch.category] = { spend: 0, percentage: 0 };
        }
        acc[ch.category].spend += ch.metrics.spend;
        acc[ch.category].percentage += ch.allocationPct; // Approximation
        return acc;
    }, {} as Record<string, { spend: number; percentage: number }>);

    const handleLoadScenario = (scenario: any) => {
        setTotalBudget(scenario.totalBudget);
        // ... more load logic if needed
    };

    const normalizeAllocations = () => {
        const currentSum = channels.reduce((sum, ch) => sum + ch.allocationPct, 0);
        if (currentSum === 0) return;
        const factor = 100 / currentSum;
        // setChannels(channels.map(ch => ({ ...ch, allocationPct: ch.allocationPct * factor }))); // Needs store action
    };

    const handleExport = () => {
        const data = JSON.stringify({
            projectName,
            totalBudget,
            channels
        }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-budget.json`;
        a.click();
    };

    return (
        <div className="flex h-screen bg-[#020617] text-white overflow-hidden font-inter selection:bg-indigo-500/30">

            {/* WIZARD MODAL (Controlled) */}
            <BudgetWizard
                isOpen={isBudgetWizardOpen}
                onClose={() => setIsBudgetWizardOpen(false)}
            />

            {/* CELL 1: LEFT SIDEBAR (SETTINGS) */}
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
                    onImport={() => setIsImportOpen(true)} // Open Smart Wizard
                    onReset={() => resetAll()}
                    toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    isOpen={isSidebarOpen}
                />

                <main className="flex-1 overflow-y-auto">
                    {/* BUDGET HERO */}
                    <BudgetHero />

                    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 p-6">

                        {/* MONTHLY CONFIG PANEL (RESTORED) */}
                        <div className="mb-6">
                            <MonthConfigPanel />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-6">

                            {/* MAIN CONTENT (Takes 3 columns) */}
                            <div className="xl:col-span-3 space-y-6">

                                {/* TOP BAR: Project Manager */}
                                <ProjectManager />

                                {/* CHART SECTION (Takes 3 columns) */}
                                <ChartSection
                                    blendedMetrics={blendedMetrics}
                                    currentAllocations={currentAllocations}
                                    totalBudget={totalBudget}
                                    channels={channelsWithMetrics}
                                    categoryTotals={categoryTotals}
                                />

                                {/* WIZARD BANNER (New Layout) */}
                                <WizardLauncherCard
                                    variant="banner"
                                    onLaunch={() => setIsBudgetWizardOpen(true)}
                                />
                            </div>

                            {/* RIGHT: SCENARIOS & PRESETS (Takes 1 column) */}
                            <div className="xl:col-span-1">
                                <ScenarioSidebar
                                    totalBudget={totalBudget}
                                    channelAllocations={currentAllocations}
                                    onLoadScenario={handleLoadScenario}
                                    onReset={resetAll}
                                    onNormalize={normalizeAllocations}
                                />
                            </div>
                        </div>

                        {/* TABS SECTION */}
                        <Tabs defaultValue="single" className="w-full mt-6">

                            <TabsList className="bg-slate-900 border border-slate-800 mb-4 h-10 p-1">
                                <TabsTrigger value="single" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">
                                    Global View
                                </TabsTrigger>
                                <TabsTrigger value="multi" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">
                                    Multi-Month Detailed View
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="single" className="mt-0">
                                <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                                    <ChannelTable />
                                </div>
                            </TabsContent>

                            <TabsContent value="multi" className="mt-0">
                                <PLTable />
                            </TabsContent>
                        </Tabs>

                    </div>
                </main>
            </div>

            {/* FLOATING GENIE */}
            {/* <GenieAssistant /> */}

            {/* IMPORT WIZARD (SMART) - MOVED HERE & DISABLED FOR SAFETY FIRST */}
            {/* <ImportWizard
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
            /> */}

        </div>
    );
};
