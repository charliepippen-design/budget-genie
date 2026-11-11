import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { isIgamingVertical, normalizeIgamingRevenueInputs } from '@/lib/igaming-revenue-model';
import { computePlanSnapshot, useMediaPlanStore } from './use-media-plan-store';
import type {
  ChannelMonthConfig,
  MonthData,
  OptimizationResult,
  PlanScenario,
  ProgressionPattern,
} from '@/lib/multi-month/types';
import type { MultiMonthState } from '@/lib/multi-month/state';
import { DEFAULT_CONSTRAINTS, DEFAULT_GLOBAL_SETTINGS } from '@/lib/multi-month/defaults';
import {
  calculateDistribution,
  calculatePlanMetrics,
  channelsFromPlanSnapshot,
  createMonth,
  toMonthValue,
} from '@/lib/multi-month/calc';
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
 * Month channels mirror the main plan: each channel's share and unit economics are read from
 * the engine snapshot, so month totals reproduce the dashboard's numbers at the same budget.
 */
function channelsFromPlan(): ChannelMonthConfig[] {
  return channelsFromPlanSnapshot(computePlanSnapshot(useMediaPlanStore.getState()).channels);
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

          const budgets = calculateDistribution(
            state.progressionPattern,
            newTotalBudget,
            totalMonths,
            { ...state.patternParams, growthRate: newSettings.growthRate }
          );

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

        const budgets = calculateDistribution(state.progressionPattern, targetBudget, totalMonths, {
          ...state.patternParams,
          growthRate: state.globalSettings.growthRate,
        });

        const planChannels = channelsFromPlan();
        const newMonths: MonthData[] = [];
        for (let i = 0; i < totalMonths; i++) {
          const isSoftLaunch = state.includeSoftLaunch && i === 0;
          newMonths.push(createMonth(i, startDate, isSoftLaunch, budgets[i], planChannels));
        }

        set({ months: newMonths, monthsCustomized: false });
      },

      applyPattern: () => {
        const state = get();
        // Calculate CURRENT Total Budget from existing months
        const currentTotalBudget = state.months.reduce((sum, m) => sum + m.budget, 0);

        if (currentTotalBudget === 0) return;

        const budgets = calculateDistribution(
          state.progressionPattern,
          currentTotalBudget,
          state.months.length,
          { ...state.patternParams, growthRate: state.globalSettings.growthRate }
        );

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
        set((state) => ({
          months: state.months.map((m) =>
            m.id === monthId
              ? {
                  ...m,
                  spendMultiplier: null,
                  cpmOverride: null,
                  ctrBump: null,
                  channels: channelsFromPlan(),
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

        // Simulate optimization with different patterns
        const state = get();
        const patterns: ProgressionPattern[] = [
          'linear',
          'exponential',
          'aggressive-launch',
          'flat',
          'step',
        ];
        const results: OptimizationResult[] = [];

        // We need a baseline total budget to optimize against?
        // Or assume use current base * months?
        const baseTotal = state.globalSettings.baseMonthlyBudget * state.months.length;

        for (const pattern of patterns) {
          const budgets = calculateDistribution(pattern, baseTotal, state.months.length, {
            growthRate: state.globalSettings.growthRate,
          });

          const testMonths = state.months.map((m, idx) => ({
            ...m,
            budget: budgets[idx],
          }));

          const metrics = calculatePlanMetrics(testMonths, state.globalSettings);

          let score = 0;
          switch (state.optimizationGoal) {
            case 'maximize-roas':
              score = metrics.totals.avgRoas * 100;
              break;
            case 'minimize-cac':
              score = metrics.totals.avgCpa ? 100 / metrics.totals.avgCpa : 0;
              break;
            case 'maximize-revenue':
              score = metrics.totals.totalRevenue / 10000;
              break;
            case 'maximize-profit':
              score = metrics.totals.netProfit / 1000;
              break;
            case 'breakeven-fastest':
              score =
                metrics.totals.breakEvenMonth !== null
                  ? (12 - metrics.totals.breakEvenMonth) * 10
                  : 0;
              break;
            default:
              score = metrics.totals.avgRoas * 20 + metrics.totals.netProfit / 5000;
          }

          results.push({
            scenario: { progressionPattern: pattern },
            score,
            metrics: {
              totalAllocatedBudget: metrics.totals.totalAllocatedBudget,
              totalSpend: metrics.totals.totalSpend,
              totalRevenue: metrics.totals.totalRevenue,
              netProfit: metrics.totals.netProfit,
              avgRoas: metrics.totals.avgRoas,
              avgCac: metrics.totals.avgCpa || 0,
              breakEvenMonth: metrics.totals.breakEvenMonth,
            },
            reasoning: `${pattern.replace('-', ' ')} pattern achieves ${metrics.totals.avgRoas.toFixed(2)}x ROAS`,
            confidence: Math.min(95, 60 + score / 10),
          });
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

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

export function useMultiMonthMetrics() {
  const { months, globalSettings } = useMultiMonthStore(
    useShallow((s) => ({ months: s.months, globalSettings: s.globalSettings }))
  );
  const vertical = useMediaPlanStore((state) => state.onboardingVertical);
  const multipliers = useMediaPlanStore((state) => state.globalMultipliers);

  return calculatePlanMetrics(
    months,
    globalSettings,
    isIgamingVertical(vertical)
      ? normalizeIgamingRevenueInputs(multipliers, multipliers.playerValue)
      : undefined
  );
}

export function useScenarioMetrics(scenarioId: string | null) {
  const { scenarios, globalSettings } = useMultiMonthStore(
    useShallow((s) => ({ scenarios: s.scenarios, globalSettings: s.globalSettings }))
  );
  const vertical = useMediaPlanStore((state) => state.onboardingVertical);
  const multipliers = useMediaPlanStore((state) => state.globalMultipliers);
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return null;
  return calculatePlanMetrics(
    scenario.months,
    scenario.globalSettings || globalSettings,
    isIgamingVertical(vertical)
      ? normalizeIgamingRevenueInputs(multipliers, multipliers.playerValue)
      : undefined
  );
}
