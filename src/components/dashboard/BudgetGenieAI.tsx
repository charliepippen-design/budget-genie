import { useState, Component, ErrorInfo, ReactNode } from 'react';
import { useBudgetGenieViewModel } from '@/hooks/use-budget-genie-view-model';
import { SettingsConsole } from './SettingsConsole';
import { DashboardHeader } from './DashboardHeader';
import { BudgetHero } from './BudgetHero';
import { ChartSection } from './ChartSection';
import { ChannelTable } from './ChannelTable';
import { ScenarioSidebar } from './ScenarioSidebar';
import { MonthConfigPanel } from '../multi-month/MonthConfigPanel';
import { WizardLauncherCard } from './WizardLauncherCard';
import { StrategicInsightsPanel } from './StrategicInsightsPanel';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { PLTable } from '../multi-month/PLTable';
import { ProgressionPatternSelector } from '../multi-month/ProgressionPatternSelector';
import { ProjectManager } from './ProjectManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BudgetWizard } from './BudgetWizard';
import { BudgetPresetKey } from '@/lib/mediaplan-data';
import { GenieAssistant } from './GenieAssistant';
import { ImportWizard } from '../multi-month/ImportWizard';

// --- DEBUG: ERROR BOUNDARY ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
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
    console.log("Rendering BudgetGenieAI..."); // Trace log


    // 1. VIEW MODEL (The Brain)
    // Connects to store, handles math, provides stable data
    const vm = useBudgetGenieViewModel();

    // 2. UI STATE (The Skin)
    // Purely presentational state
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [preset, setPreset] = useState<BudgetPresetKey>('custom');
    const [isBudgetWizardOpen, setIsBudgetWizardOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);

    return (
        <ErrorBoundary>
            <div className="flex h-screen bg-[#020617] text-white overflow-hidden font-inter selection:bg-indigo-500/30">

                {/* WIZARD MODAL */}
                <BudgetWizard
                    isOpen={isBudgetWizardOpen}
                    onClose={() => setIsBudgetWizardOpen(false)}
                />

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
                        onReset={() => vm.resetAll()}
                        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                        isOpen={isSidebarOpen}
                    />

                    <main className="flex-1 overflow-y-auto">
                        {/* BUDGET HERO (Big Number) */}
                        <BudgetHero />

                        <div className="max-w-[1600px] mx-auto space-y-6 pb-20 p-6">

                            {/* MONTHLY CONFIG (Seasonality) */}
                            <div className="mb-6">
                                <MonthConfigPanel />
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-6">

                                {/* CENTER COLUMN (Charts & Wizard) */}
                                <div className="xl:col-span-3 space-y-6">

                                    {/* PROJECT MANAGER (Top Bar) */}
                                    <ProjectManager />

                                    {/* CHARTS (The Visuals) */}
                                    {/* Data passed from ViewModel ensuring consistency */}
                                    <ChartSection
                                        blendedMetrics={vm.blendedMetrics}
                                        currentAllocations={vm.currentAllocations}
                                        totalBudget={vm.totalBudget}
                                        channels={vm.channels}
                                        categoryTotals={vm.categoryTotals}
                                    />

                                    {/* WIZARD LAUNCHER */}
                                    <WizardLauncherCard
                                        variant="banner"
                                        onLaunch={() => setIsBudgetWizardOpen(true)}
                                    />

                                    {/* STRATEGIC WAR ROOM */}
                                    <StrategicInsightsPanel />

                                    {/* PROGRESSION PATTERN (Moved) */}
                                    <ProgressionPatternSelector />

                                </div>

                                {/* RIGHT SIDEBAR (Scenarios) */}
                                <div className="xl:col-span-1">
                                    <ScenarioSidebar
                                        totalBudget={vm.totalBudget}
                                        channelAllocations={vm.currentAllocations}
                                        onLoadScenario={vm.handleLoadScenario}
                                        onReset={vm.resetAll}
                                        onNormalize={vm.normalizeAllocations}
                                    />
                                </div>
                            </div>

                            {/* DATA GRID (Tabs) */}
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

                {/* MODALS */}
                <GenieAssistant />
                <ImportWizard open={isImportOpen} onOpenChange={setIsImportOpen} />

            </div>
        </ErrorBoundary>
    );
};
