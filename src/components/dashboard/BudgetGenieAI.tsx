import React, { useState, useEffect } from 'react';
import { DashboardHeader } from './DashboardHeader';
import { ChannelTable } from './ChannelTable';
import { ChartSection } from './ChartSection';
import { SettingsConsole } from './SettingsConsole';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useChannelsWithMetrics, useBlendedMetrics, useCategoryTotals } from '@/hooks/use-media-plan-store';
import { BUDGET_PRESETS, BudgetPresetKey, BudgetScenario } from '@/lib/mediaplan-data';

// RESTORED IMPORTS
import { ScenarioSidebar } from './ScenarioSidebar';
import { ProjectManager } from './ProjectManager';
import { GenieAssistant } from './GenieAssistant';

export const BudgetGenieAI: React.FC = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Data hooks needed for the content
    const {
        totalBudget,
        setTotalBudget,
        setAllocations,
        normalizeAllocations,
        resetAll,
        applyCategoryMultipliers
    } = useMediaPlanStore();

    const channelsWithMetrics = useChannelsWithMetrics();
    const blendedMetrics = useBlendedMetrics();
    const categoryTotals = useCategoryTotals();

    const [preset, setPreset] = useState<BudgetPresetKey>('custom');

    // Effect: Apply Preset Logic
    useEffect(() => {
        if (preset !== 'custom') {
            const presetData = BUDGET_PRESETS[preset];
            if (presetData && presetData.multipliers) {
                applyCategoryMultipliers(presetData.multipliers);
            }
        }
    }, [preset, applyCategoryMultipliers]);

    // Handle Load Scenario
    const handleLoadScenario = (scenario: BudgetScenario) => {
        setTotalBudget(scenario.totalBudget);
        setAllocations(scenario.channelAllocations);
    };

    // Derive allocations for sidebar
    const currentAllocations = channelsWithMetrics.reduce((acc, ch) => ({
        ...acc,
        [ch.id]: ch.allocationPct
    }), {} as Record<string, number>);

    return (
        // PARENT: CSS GRID (2 Columns)
        // Column 1: 320px (Sidebar)
        // Column 2: 1fr (Remaining Space)
        <div style={{
            display: 'grid',
            gridTemplateColumns: isSidebarOpen ? '320px 1fr' : '0px 1fr',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            backgroundColor: '#020617', // slate-950
            transition: 'grid-template-columns 0.3s ease'
        }}>

            {/* CELL 1: SIDEBAR */}
            <div style={{
                gridColumn: '1 / 2',
                backgroundColor: '#0f172a', // slate-900 
                borderRight: '1px solid #1e293b',
                overflowY: 'auto',
                position: 'relative',
                zIndex: 50
            }}>
                {/* Force width to prevent content squashing during transition */}
                <div style={{ width: '320px', height: '100%' }}>
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
                    onImport={() => { }}
                    onReset={() => resetAll()}
                    toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    isOpen={isSidebarOpen}
                />

                {/* RESTORED LAYOUT SECTION (3-COLUMN GRID) */}
                <main className="flex-1 p-6 overflow-y-auto">
                    <div className="max-w-[1600px] mx-auto space-y-6 pb-20">

                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                            {/* CENTER: Project Manager & Charts & Table (Takes 3 columns) */}
                            <div className="xl:col-span-3 space-y-6">
                                <ProjectManager />
                                <ChartSection channels={channelsWithMetrics} categoryTotals={categoryTotals} />
                                <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
                                    <ChannelTable />
                                </div>
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

                    </div>
                </main>
            </div>

            {/* FLOATING GENIE */}
            <GenieAssistant />

        </div>
    );
};