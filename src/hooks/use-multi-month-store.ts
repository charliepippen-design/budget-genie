import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { useMemo, useSyncExternalStore } from 'react';
import { getEngine, subscribeEngine } from '@/engine/registry';
import { selectEngineInput } from '@/engine/input';
import type { TimelineInput, TimelineResult } from '@/engine/timeline';
import { selectTimelineInput, type TimelineSource } from '@/engine/timeline-input';
import { useMediaPlanStore } from './use-media-plan-store';
import { useEngineInput } from './use-engine-input';
import type { MonthData, OptimizationResult, PlanScenario } from '@/lib/multi-month/types';
import type { MultiMonthState } from '@/lib/multi-month/state';
import { DEFAULT_CONSTRAINTS, DEFAULT_GLOBAL_SETTINGS } from '@/lib/multi-month/defaults';
import { createMonth, toMonthValue } from '@/lib/multi-month/calc';
import {
  MULTI_MONTH_STORE_KEY,
  MULTI_MONTH_STORE_VERSION,
  mergeMultiMonth,
  migrateMultiMonth,
  partializeMultiMonth,
} from '@/lib/multi-month/persistence';

export type {
  ProgressionPattern,
  OptimizationGoal,
  RiskLevel,
  ChannelMonthConfig,
  MonthData,
  GlobalPlanSettings,
  OptimizationConstraints,
  PlanScenario,
  OptimizationResult,
} from '@/lib/multi-month/types';
export type { MultiMonthState } from '@/lib/multi-month/state';
export {
  calculateDistribution,
  toMonthValue,
  calculateMonthMetrics,
  calculatePlanMetrics,
} from '@/lib/multi-month/calc';

/**
 * The timeline of the given store state, computed by the active engine against the live plan.
 * Store actions read month budgets (`patternBudgets`), the plan's channel mix (`baseChannels`)
 * and optimiser candidates from it instead of computing them.
 */
function timelineFor(state: TimelineSource, redistribute?: TimelineInput['redistribute']): TimelineResult {
  return getEngine().computeTimeline(selectEngineInput(useMediaPlanStore.getState()), {
    ...selectTimelineInput(state),
    redistribute,
  });
}

// ========== STORE ==========

export const useMultiMonthStore = create<MultiMonthState>()(
  persist(
    (set, get) => ({
      // Initial State
      includeSoftLaunch: true,
      planningMonths: 6,
      startMonth: toMonthValue(new Date()),
      progressionPattern: 'linear',
      patternParams: { growthRate: 10 },
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
      months: [],
      monthsCustomized: false,
      scenarios: [],
      activeScenarioId: null,
      comparisonScenarioId: null,
      optimizationGoal: 'maximize-roas',
      riskLevel: 'moderate',
      constraints: { ...DEFAULT_CONSTRAINTS },
      optimizationResults: [],
      isOptimizing: false,
      pdfSections: {
        executiveSummary: true,
        detailedTables: true,
        channelCharts: true,
        profitCurves: true,
        scenarioComparison: false,
        assumptions: true,
        financialProjections: true,
      },
      userNotes: '',

      // Configuration Actions
      setIncludeSoftLaunch: (include) => {
        set({ includeSoftLaunch: include });
        get().generateMonths();
      },

      setPlanningMonths: (months) => {
        set({ planningMonths: Math.max(3, Math.min(12, months)) });
        get().generateMonths();
      },

      setStartMonth: (month) => {
        set({ startMonth: month });
        get().generateMonths();
      },

      setProgressionPattern: (pattern) => {
        set({ progressionPattern: pattern });
      },

      setPatternParams: (params) => {
        set({ patternParams: params });
      },

      // Global Settings
      setGlobalSettings: (updates) => {
        const state = get();
        const prevSettings = state.globalSettings;
        const newSettings = { ...prevSettings, ...updates };

        set({ globalSettings: newSettings });

        // React to changes
        const budgetChanged =
          updates.baseMonthlyBudget !== undefined &&
          updates.baseMonthlyBudget !== prevSettings.baseMonthlyBudget;
        const growthChanged =
          (updates.growthRate !== undefined && updates.growthRate !== prevSettings.growthRate) ||
          (updates.growthType !== undefined && updates.growthType !== prevSettings.growthType);

        // If Budget or Growth params change, we should re-distribute
        // BUT, we need to decide if we keep the "Distribution Shape" or "Total Budget".
        // If the user changes "Base Monthly Budget", they probably expect the new Base * Months to be the new Total.
        if (budgetChanged || growthChanged) {
          // Recalculate based on new params
          // We'll treat Base Budget as the "Source of Truth" when these sliders move
          const totalMonths = state.months.length || state.planningMonths;
          const newTotalBudget = newSettings.baseMonthlyBudget * totalMonths;

          const budgets = timelineFor(get(), {
            totalBudget: newTotalBudget,
            monthCount: totalMonths,
          }).patternBudgets;

          set((curr) => ({
            months: curr.months.map((m, i) => ({
              ...m,
              budget: budgets[i] || m.budget,
            })),
          }));
        }
      },

      // Month Management
      generateMonths: (totalBudgetOverride?: number) => {
        const state = get();
        const totalMonths = state.planningMonths + (state.includeSoftLaunch ? 1 : 0);

        // FIX: Start Date Off-By-One (Timezone Issue)
        // Parse "YYYY-MM" manually to ensure we stay in correct local period
        const [yearStr, monthStr] = state.startMonth.split('-');
        const startDate = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);

        // The plan budget is MONTHLY, so the period total is budget × months.
        let targetBudget = totalBudgetOverride;
        if (targetBudget === undefined) {
          targetBudget = useMediaPlanStore.getState().totalBudget * totalMonths;
        }

        // Fallback to internal settings if still 0 or undefined
        if (!targetBudget) {
          targetBudget = state.globalSettings.baseMonthlyBudget * totalMonths;
        }

        const { patternBudgets: budgets, baseChannels: planChannels } = timelineFor(state, {
          totalBudget: targetBudget,
          monthCount: totalMonths,
        });

        const newMonths: MonthData[] = [];
        for (let i = 0; i < totalMonths; i++) {
          const isSoftLaunch = state.includeSoftLaunch && i === 0;
          newMonths.push(createMonth(i, startDate, isSoftLaunch, budgets[i], planChannels));
        }

        set({ months: newMonths, monthsCustomized: false });
      },

      applyPattern: () => {
        const state = get();
        // Re-distributes the CURRENT total budget of the existing months
        const timeline = timelineFor(state);

        if (timeline.plan.totals.allocatedBudget === 0) return;

        const budgets = timeline.patternBudgets;

        set({
          months: state.months.map((month, idx) => ({
            ...month,
            budget: budgets[idx] || 0, // Safety fallback
            budgetMultiplier: 1.0,
          })),
        });
      },

      updateMonth: (monthId, updates) => {
        set((state) => ({
          monthsCustomized: true,
          months: state.months.map((m) => (m.id === monthId ? { ...m, ...updates } : m)),
        }));
      },

      updateMonthChannel: (monthId, channelId, updates) => {
        set((state) => ({
          monthsCustomized: true,
          months: state.months.map((m) =>
            m.id === monthId
              ? {
                  ...m,
                  useGlobalChannels: false,
                  channels: m.channels.map((ch) =>
                    ch.channelId === channelId ? { ...ch, ...updates } : ch
                  ),
                }
              : m
          ),
        }));
      },

      copyFromPreviousMonth: (monthId) => {
        const state = get();
        const monthIndex = state.months.findIndex((m) => m.id === monthId);
        if (monthIndex <= 0) return;

        const prevMonth = state.months[monthIndex - 1];
        set({
          months: state.months.map((m, idx) =>
            idx === monthIndex
              ? {
                  ...m,
                  spendMultiplier: prevMonth.spendMultiplier,
                  cpmOverride: prevMonth.cpmOverride,
                  ctrBump: prevMonth.ctrBump,
                  channels: JSON.parse(JSON.stringify(prevMonth.channels)),
                  useGlobalChannels: prevMonth.useGlobalChannels,
                }
              : m
          ),
        });
      },

      resetMonthToGlobal: (monthId) => {
        const planChannels = timelineFor(get()).baseChannels;
        set((state) => ({
          months: state.months.map((m) =>
            m.id === monthId
              ? {
                  ...m,
                  spendMultiplier: null,
                  cpmOverride: null,
                  ctrBump: null,
                  channels: planChannels,
                  useGlobalChannels: true,
                }
              : m
          ),
        }));
      },

      applyToRemainingMonths: (fromMonthId) => {
        const state = get();
        const fromIndex = state.months.findIndex((m) => m.id === fromMonthId);
        if (fromIndex < 0) return;

        const sourceMonth = state.months[fromIndex];
        set({
          months: state.months.map((m, idx) =>
            idx > fromIndex
              ? {
                  ...m,
                  spendMultiplier: sourceMonth.spendMultiplier,
                  cpmOverride: sourceMonth.cpmOverride,
                  ctrBump: sourceMonth.ctrBump,
                  channels: JSON.parse(JSON.stringify(sourceMonth.channels)),
                  useGlobalChannels: sourceMonth.useGlobalChannels,
                }
              : m
          ),
        });
      },

      applyGlobalChannelsToAll: () => {
        // Logic: Take the first "real" month (index 0 if no soft launch, index 1 if soft launch)
        // copy its channel config to all other months.
        const state = get();
        if (state.months.length === 0) return;

        const sourceIndex = state.includeSoftLaunch && state.months.length > 1 ? 1 : 0;
        const sourceMonth = state.months[sourceIndex];
        const sourceChannels = JSON.parse(JSON.stringify(sourceMonth.channels));

        set({
          months: state.months.map((m, idx) => {
            if (idx === sourceIndex) return m; // Skip source
            return {
              ...m,
              channels: JSON.parse(JSON.stringify(sourceChannels)),
              useGlobalChannels: true, // Reset override flag
            };
          }),
        });
      },

      // Scenarios
      saveScenario: (name) => {
        const state = get();
        const scenario: PlanScenario = {
          id: `scenario-${Date.now()}`,
          name,
          createdAt: new Date(),
          includeSoftLaunch: state.includeSoftLaunch,
          planningMonths: state.planningMonths,
          startMonth: state.startMonth,
          progressionPattern: state.progressionPattern,
          patternParams: { ...state.patternParams },
          globalSettings: { ...state.globalSettings },
          months: JSON.parse(JSON.stringify(state.months)),
          monthsCustomized: state.monthsCustomized,
        };

        set((s) => ({
          scenarios: [...s.scenarios.filter((sc) => sc.name !== name), scenario],
          activeScenarioId: scenario.id,
        }));
      },

      loadScenario: (id) => {
        const scenario = get().scenarios.find((s) => s.id === id);
        if (!scenario) return;

        set({
          includeSoftLaunch: scenario.includeSoftLaunch,
          planningMonths: scenario.planningMonths,
          startMonth: scenario.startMonth,
          progressionPattern: scenario.progressionPattern,
          patternParams: { ...scenario.patternParams },
          globalSettings: { ...scenario.globalSettings },
          months: JSON.parse(JSON.stringify(scenario.months)),
          // A loaded scenario is a saved state: stop the month panel regenerating over it.
          monthsCustomized: true,
          activeScenarioId: id,
        });
      },

      deleteScenario: (id) => {
        set((state) => ({
          scenarios: state.scenarios.filter((s) => s.id !== id),
          activeScenarioId: state.activeScenarioId === id ? null : state.activeScenarioId,
          comparisonScenarioId:
            state.comparisonScenarioId === id ? null : state.comparisonScenarioId,
        }));
      },

      cloneScenario: (id, newName) => {
        const scenario = get().scenarios.find((s) => s.id === id);
        if (!scenario) return;

        const cloned: PlanScenario = {
          ...JSON.parse(JSON.stringify(scenario)),
          id: `scenario-${Date.now()}`,
          name: newName,
          createdAt: new Date(),
        };

        set((s) => ({ scenarios: [...s.scenarios, cloned] }));
      },

      setActiveScenario: (id) => set({ activeScenarioId: id }),
      setComparisonScenario: (id) => set({ comparisonScenarioId: id }),

      // Optimization
      setOptimizationGoal: (goal) => set({ optimizationGoal: goal }),
      setRiskLevel: (level) => set({ riskLevel: level }),
      setConstraints: (updates) =>
        set((s) => ({
          constraints: { ...s.constraints, ...updates },
        })),

      runOptimization: async () => {
        set({ isOptimizing: true, optimizationResults: [] });

        // The engine scores the candidate patterns, best first
        const results: OptimizationResult[] = timelineFor(get()).optimisation.map((candidate) => ({
          scenario: { progressionPattern: candidate.pattern },
          score: candidate.score,
          metrics: {
            totalAllocatedBudget: candidate.totals.allocatedBudget,
            totalSpend: candidate.totals.spend,
            totalRevenue: candidate.totals.revenue,
            netProfit: candidate.totals.netProfit,
            avgRoas: candidate.totals.roas,
            avgCac: candidate.totals.cpa || 0,
            breakEvenMonth: candidate.totals.breakEvenMonth,
          },
          reasoning: `${candidate.pattern.replace('-', ' ')} pattern achieves ${candidate.totals.roas.toFixed(2)}x ROAS`,
          confidence: candidate.confidence,
        }));

        set({ optimizationResults: results.slice(0, 3), isOptimizing: false });
      },

      loadOptimizationResult: (index) => {
        const result = get().optimizationResults[index];
        if (!result?.scenario.progressionPattern) return;

        set({ progressionPattern: result.scenario.progressionPattern });

        get().applyPattern();
      },

      // PDF
      setPdfSections: (sections) =>
        set((s) => ({
          pdfSections: { ...s.pdfSections, ...sections },
        })),
      setUserNotes: (notes) => set({ userNotes: notes }),

      // Reset
      resetPlan: () => {
        set({
          includeSoftLaunch: true,
          planningMonths: 6,
          startMonth: toMonthValue(new Date()),
          progressionPattern: 'linear',
          patternParams: { growthRate: 10 },
          globalSettings: { ...DEFAULT_GLOBAL_SETTINGS, baseMonthlyBudget: 0 },
          months: [],
          activeScenarioId: null,
          optimizationResults: [],
        });
        get().generateMonths();
      },
    }),
    {
      name: MULTI_MONTH_STORE_KEY,
      version: MULTI_MONTH_STORE_VERSION,
      partialize: partializeMultiMonth,
      migrate: (persisted, version) => migrateMultiMonth(persisted, version) as MultiMonthState,
      // Only valid saved fields are restored; JSON's createdAt strings become Dates again.
      merge: (persisted, current) => mergeMultiMonth(persisted, current),
    }
  )
);

// ========== SELECTORS ==========

/**
 * The live timeline computed by the active engine (see src/engine/timeline.ts). Every number of
 * the multi-month view comes from here.
 */
export function useTimelineResult(): TimelineResult {
  const engine = useSyncExternalStore(subscribeEngine, getEngine, getEngine);
  const input = useEngineInput();
  const source = useMultiMonthStore(
    useShallow(
      (s): TimelineSource => ({
        includeSoftLaunch: s.includeSoftLaunch,
        planningMonths: s.planningMonths,
        startMonth: s.startMonth,
        progressionPattern: s.progressionPattern,
        patternParams: s.patternParams,
        globalSettings: s.globalSettings,
        months: s.months,
        scenarios: s.scenarios,
        comparisonScenarioId: s.comparisonScenarioId,
        optimizationGoal: s.optimizationGoal,
      })
    )
  );

  return useMemo(() => engine.computeTimeline(input, selectTimelineInput(source)), [engine, input, source]);
}
