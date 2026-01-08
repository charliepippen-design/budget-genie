import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChannelCategory } from '@/lib/mediaplan-data';
import { ChannelFamily, BuyingModel, ChannelTypeConfig } from '@/types/channel';
import { useMediaPlanStore } from './use-media-plan-store';

// ========== TYPES ==========

export type ProgressionPattern =
  | 'linear'
  | 'exponential'
  | 'u-shaped'
  | 'inverse-u'
  | 'seasonal'
  | 'step'
  | 'aggressive-launch'
  | 'flat'
  | 'custom';

export type OptimizationGoal =
  | 'maximize-roas'
  | 'minimize-cac'
  | 'maximize-revenue'
  | 'maximize-profit'
  | 'breakeven-fastest'
  | 'balanced';

export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

export interface ChannelMonthConfig {
  channelId: string;
  name: string;
  category: ChannelCategory;
  allocationPct: number;
  cpm: number;
  ctr: number;
  cr: number;
  roas: number;
  impressionMode: 'CPM' | 'FIXED';
  fixedImpressions: number;
  locked: boolean;
  // Polymorphic channel type fields
  family?: ChannelFamily;
  buyingModel?: BuyingModel;
  typeConfig?: ChannelTypeConfig;
}

export interface MonthData {
  id: string;
  label: string; // e.g., "March 2025"
  monthIndex: number; // 0 = soft launch, 1 = month 1, etc.
  isSoftLaunch: boolean;

  // Budget
  budget: number;
  budgetMultiplier: number;
  budgetLocked: boolean;

  // Scaling overrides (null = use global)
  spendMultiplier: number | null;
  cpmOverride: number | null;
  ctrBump: number | null;

  // Channel allocations
  channels: ChannelMonthConfig[];
  useGlobalChannels: boolean;

  // Calculated metrics (populated by selectors)
  totalSpend?: number;
  totalConversions?: number;
  revenue?: number;
  operatingCosts?: number;
  netProfit?: number;
  cumulativeProfit?: number;
}

export interface GlobalPlanSettings {
  baseMonthlyBudget: number;
  growthRate: number; // percentage per month
  growthType: 'linear' | 'exponential' | 'seasonal';
  spendMultiplier: number;
  defaultCpmOverride: number | null;
  ctrBump: number;
  cpaTarget: number | null;
  roasTarget: number | null;
}

export interface OptimizationConstraints {
  minTotalBudget: number;
  maxTotalBudget: number;
  minMonthlyBudget: number;
  maxMonthlyBudget: number;
  breakEvenByMonth: number | null;
  maxCacTolerance: number | null;
  minRoasTarget: number | null;
  channelConstraints: Record<string, { min: number; max: number }>;
}

export interface PlanScenario {
  id: string;
  name: string;
  createdAt: Date;
  includeSoftLaunch: boolean;
  planningMonths: number;
  startMonth: string; // ISO date string
  progressionPattern: ProgressionPattern;
  patternParams: Record<string, number>;
  globalSettings: GlobalPlanSettings;
  months: MonthData[];
}

export interface OptimizationResult {
  scenario: Partial<PlanScenario>;
  score: number;
  metrics: {
    totalAllocatedBudget: number;
    totalSpend: number;
    totalRevenue: number;
    netProfit: number;
    avgRoas: number;
    avgCac: number;
    breakEvenMonth: number | null;
  };
  reasoning: string;
  confidence: number;
}

// ========== DEFAULT DATA ==========

const DEFAULT_CHANNELS: ChannelMonthConfig[] = [
  { channelId: 'seo-tech', name: 'SEO - Tech Audit', category: 'SEO/Content', allocationPct: 2.33, cpm: 2.5, ctr: 0.8, cr: 2.5, roas: 3.2, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'seo-content', name: 'SEO - Content', category: 'SEO/Content', allocationPct: 6.98, cpm: 1.8, ctr: 1.2, cr: 2.5, roas: 4.5, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'seo-backlinks', name: 'SEO - Backlinks', category: 'SEO/Content', allocationPct: 4.65, cpm: 3.5, ctr: 0.5, cr: 2.5, roas: 2.8, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'paid-native', name: 'Paid - Native Ads', category: 'Display/Programmatic', allocationPct: 11.63, cpm: 4.2, ctr: 0.35, cr: 2.5, roas: 1.8, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'paid-push', name: 'Paid - Push', category: 'Display/Programmatic', allocationPct: 6.98, cpm: 1.2, ctr: 2.5, cr: 2.5, roas: 2.2, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'paid-programmatic', name: 'Paid - Display', category: 'Display/Programmatic', allocationPct: 4.65, cpm: 5.5, ctr: 0.15, cr: 2.5, roas: 1.5, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'paid-retargeting', name: 'Paid - Retargeting', category: 'Display/Programmatic', allocationPct: 2.33, cpm: 8.0, ctr: 1.8, cr: 2.5, roas: 4.2, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'affiliate-listing', name: 'Affiliate - Listing', category: 'Affiliate', allocationPct: 4.65, cpm: 15.0, ctr: 3.5, cr: 2.5, roas: 2.0, impressionMode: 'FIXED', fixedImpressions: 100000, locked: false },
  { channelId: 'affiliate-cpa', name: 'Affiliate - CPA', category: 'Affiliate', allocationPct: 39.53, cpm: 25.0, ctr: 4.2, cr: 2.5, roas: 3.5, impressionMode: 'CPM', fixedImpressions: 100000, locked: false },
  { channelId: 'influencer-retainers', name: 'Influencer - Retainers', category: 'Paid Social', allocationPct: 9.30, cpm: 12.0, ctr: 1.5, cr: 2.5, roas: 2.5, impressionMode: 'FIXED', fixedImpressions: 200000, locked: false },
  { channelId: 'influencer-funds', name: 'Influencer - Play Funds', category: 'Paid Social', allocationPct: 6.98, cpm: 10.0, ctr: 2.0, cr: 2.5, roas: 3.0, impressionMode: 'FIXED', fixedImpressions: 200000, locked: false },
];

const DEFAULT_GLOBAL_SETTINGS: GlobalPlanSettings = {
  baseMonthlyBudget: 50000,
  growthRate: 10,
  growthType: 'linear',
  spendMultiplier: 1.0,
  defaultCpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
};

const DEFAULT_CONSTRAINTS: OptimizationConstraints = {
  minTotalBudget: 50000,
  maxTotalBudget: 1000000,
  minMonthlyBudget: 10000,
  maxMonthlyBudget: 200000,
  breakEvenByMonth: null,
  maxCacTolerance: null,
  minRoasTarget: null,
  channelConstraints: {},
};

// ========== PROGRESSION FORMULAS ==========

export function calculateDistribution(
  pattern: ProgressionPattern,
  totalBudget: number,
  months: number,
  params: Record<string, number> = {}
): number[] {
  if (months <= 0) return [];
  if (months === 1) return [totalBudget];

  let weights: number[] = [];
  const growthRate = params.growthRate ?? 10; // Default 10% per step

  for (let i = 0; i < months; i++) {
    switch (pattern) {
      case 'linear':
        weights.push(1);
        break;
      case 'exponential':
        // Start low, grow by rate
        weights.push(Math.pow(1 + growthRate / 100, i));
        break;
      case 'u-shaped': {
        // y = a(x-h)^2 + k
        // High at ends, low in middle
        const mid = (months - 1) / 2;
        const x = (i - mid) / mid; // -1 to 1
        weights.push(Math.pow(x, 2) + 0.5); // +0.5 to keep center non-zero
        break;
      }
      case 'inverse-u': {
        // High in middle, low at ends
        const mid = (months - 1) / 2;
        const x = (i - mid) / mid; // -1 to 1
        weights.push(1 - Math.pow(x, 2) + 0.1);
        break;
      }
      case 'seasonal': {
        // Simple sine wave simulation + baseline
        // Peak at index 1 and 7? Just generic seasonality
        const x = (i / months) * Math.PI * 2; // 0 to 2PI
        weights.push(Math.sin(x) + 1.5); // Ensure positive
        break;
      }
      case 'step': {
        // Step up every 3 months
        const step = Math.floor(i / 3);
        weights.push(1 + step * 0.5);
        break;
      }
      case 'aggressive-launch': {
        // High start, then decay
        // 1 / (1 + i) decay
        weights.push(10 / (2 + i));
        break;
      }
      case 'flat':
      default:
        weights.push(1);
    }
  }

  // Normalize and distribute
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let distributedTotal = 0;

  const budgets = weights.map(w => {
    const amount = Math.floor((w / totalWeight) * totalBudget);
    distributedTotal += amount;
    return amount;
  });

  // Distribute remainder to avoid rounding errors
  let remainder = totalBudget - distributedTotal;
  let i = 0;
  while (remainder > 0) {
    budgets[i % months]++;
    remainder--;
    i++;
  }

  return budgets;
}

// ========== MONTH GENERATION ==========

function generateMonthLabel(startDate: Date, monthOffset: number, isSoftLaunch: boolean): string {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + monthOffset);
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
  return isSoftLaunch ? `${formatter.format(date)} (Soft Launch)` : formatter.format(date);
}

function createMonth(
  index: number,
  startDate: Date,
  isSoftLaunch: boolean,
  budget: number,
  baseChannels: ChannelMonthConfig[]
): MonthData {
  return {
    id: `month-${index}`,
    label: generateMonthLabel(startDate, index, isSoftLaunch),
    monthIndex: index,
    isSoftLaunch,
    budget,
    budgetMultiplier: 1.0,
    budgetLocked: false,
    spendMultiplier: null,
    cpmOverride: null,
    ctrBump: null,
    channels: JSON.parse(JSON.stringify(baseChannels)),
    useGlobalChannels: true,
  };
}

// ========== METRICS CALCULATION ==========

export function calculateMonthMetrics(month: MonthData, globalSettings: GlobalPlanSettings): {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  revenue: number;
  avgCpa: number | null;
  avgRoas: number;
} {
  const spendMultiplier = month.spendMultiplier ?? globalSettings.spendMultiplier;
  const actualBudget = month.budget * month.budgetMultiplier * spendMultiplier;

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalRevenue = 0;

  month.channels.forEach(ch => {
    const spend = (ch.allocationPct / 100) * actualBudget;
    const cpm = ch.cpm;
    const ctr = ch.ctr + (month.ctrBump ?? globalSettings.ctrBump);

    let impressions: number;
    if (ch.impressionMode === 'FIXED') {
      impressions = ch.fixedImpressions;
    } else {
      impressions = cpm > 0 ? (spend / cpm) * 1000 : 0;
    }

    const clicks = impressions * (Math.max(0.01, ctr) / 100);
    const conversions = clicks * (ch.cr / 100);
    const revenue = spend * ch.roas;

    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;
    totalRevenue += revenue;
  });

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    revenue: totalRevenue,
    avgCpa: totalConversions > 0 ? totalSpend / totalConversions : null,
    avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
  };
}

export function calculatePlanMetrics(months: MonthData[], globalSettings: GlobalPlanSettings): {
  months: MonthData[];
  totals: {
    totalAllocatedBudget: number;
    totalSpend: number;
    totalConversions: number;
    totalRevenue: number;
    operatingCosts: number;
    netProfit: number;
    avgMonthlyBudget: number;
    avgCpa: number | null;
    avgRoas: number;
    breakEvenMonth: number | null;
    endingCumulativeProfit: number;
  };
} {
  let cumulativeProfit = 0;
  let breakEvenMonth: number | null = null;

  const enrichedMonths = months.map((month, idx) => {
    const metrics = calculateMonthMetrics(month, globalSettings);
    const operatingCosts = metrics.revenue * 0.15; // 15% operating costs
    const netProfit = metrics.revenue - metrics.totalSpend - operatingCosts;
    cumulativeProfit += netProfit;

    if (breakEvenMonth === null && cumulativeProfit >= 0) {
      breakEvenMonth = idx;
    }

    return {
      ...month,
      totalSpend: metrics.totalSpend,
      totalConversions: metrics.totalConversions,
      revenue: metrics.revenue,
      operatingCosts,
      netProfit,
      cumulativeProfit,
    };
  });

  const totalAllocatedBudget = enrichedMonths.reduce((sum, m) => sum + (m.budget || 0), 0);
  const totalSpend = enrichedMonths.reduce((sum, m) => sum + (m.totalSpend || 0), 0);
  const totalConversions = enrichedMonths.reduce((sum, m) => sum + (m.totalConversions || 0), 0);
  const totalRevenue = enrichedMonths.reduce((sum, m) => sum + (m.revenue || 0), 0);
  const totalOperatingCosts = enrichedMonths.reduce((sum, m) => sum + (m.operatingCosts || 0), 0);
  const endingCumulativeProfit = enrichedMonths.length > 0 ? enrichedMonths[enrichedMonths.length - 1].cumulativeProfit : 0;

  return {
    months: enrichedMonths,
    totals: {
      totalAllocatedBudget,
      totalSpend,
      totalConversions,
      totalRevenue,
      operatingCosts: totalOperatingCosts,
      netProfit: totalRevenue - totalSpend - totalOperatingCosts,
      avgMonthlyBudget: enrichedMonths.length > 0 ? totalAllocatedBudget / enrichedMonths.length : 0, // Keeping for backward compat if needed
      avgCpa: totalConversions > 0 ? totalSpend / totalConversions : null,
      avgRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      breakEvenMonth,
      endingCumulativeProfit,
    },
  };
}

// ========== STORE ==========

interface MultiMonthState {
  // Plan Configuration
  includeSoftLaunch: boolean;
  planningMonths: number;
  startMonth: string;
  progressionPattern: ProgressionPattern;
  patternParams: Record<string, number>;

  // Global Settings
  globalSettings: GlobalPlanSettings;

  // Months Data
  months: MonthData[];

  // Scenarios
  scenarios: PlanScenario[];
  activeScenarioId: string | null;
  comparisonScenarioId: string | null;

  // Optimization
  optimizationGoal: OptimizationGoal;
  riskLevel: RiskLevel;
  constraints: OptimizationConstraints;
  optimizationResults: OptimizationResult[];
  isOptimizing: boolean;

  // PDF Export options
  pdfSections: {
    executiveSummary: boolean;
    detailedTables: boolean;
    channelCharts: boolean;
    profitCurves: boolean;
    scenarioComparison: boolean;
    assumptions: boolean;
    financialProjections: boolean;
  };
  userNotes: string;

  // Actions - Configuration
  setIncludeSoftLaunch: (include: boolean) => void;
  setPlanningMonths: (months: number) => void;
  setStartMonth: (month: string) => void;
  setProgressionPattern: (pattern: ProgressionPattern) => void;
  setPatternParams: (params: Record<string, number>) => void;

  // Actions - Global Settings
  setGlobalSettings: (updates: Partial<GlobalPlanSettings>) => void;

  // Actions - Month Management
  generateMonths: (totalBudget?: number) => void;
  applyPattern: () => void; // Uses CURRENT total budget
  updateMonth: (monthId: string, updates: Partial<MonthData>) => void;
  updateMonthChannel: (monthId: string, channelId: string, updates: Partial<ChannelMonthConfig>) => void;
  copyFromPreviousMonth: (monthId: string) => void;
  resetMonthToGlobal: (monthId: string) => void;
  applyToRemainingMonths: (fromMonthId: string) => void;
  applyGlobalChannelsToAll: () => void;

  // Actions - Scenarios
  saveScenario: (name: string) => void;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  cloneScenario: (id: string, newName: string) => void;
  setActiveScenario: (id: string | null) => void;
  setComparisonScenario: (id: string | null) => void;

  // Actions - Optimization
  setOptimizationGoal: (goal: OptimizationGoal) => void;
  setRiskLevel: (level: RiskLevel) => void;
  setConstraints: (updates: Partial<OptimizationConstraints>) => void;
  runOptimization: () => Promise<void>;
  loadOptimizationResult: (index: number) => void;

  // Actions - PDF
  setPdfSections: (sections: Partial<MultiMonthState['pdfSections']>) => void;
  setUserNotes: (notes: string) => void;

  // Actions - Reset
  resetPlan: () => void;
}

export const useMultiMonthStore = create<MultiMonthState>()(
  persist(
    (set, get) => ({
      // Initial State
      includeSoftLaunch: true,
      planningMonths: 6,
      startMonth: new Date().toISOString().slice(0, 7),
      progressionPattern: 'linear',
      patternParams: { growthRate: 10 },
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
      months: [],
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
        const budgetChanged = updates.baseMonthlyBudget !== undefined && updates.baseMonthlyBudget !== prevSettings.baseMonthlyBudget;
        const growthChanged = (updates.growthRate !== undefined && updates.growthRate !== prevSettings.growthRate) ||
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

          set(curr => ({
            months: curr.months.map((m, i) => ({
              ...m,
              budget: budgets[i] || m.budget,
            }))
          }));
        }
      },

      // Month Management
      generateMonths: (totalBudgetOverride?: number) => {
        const state = get();
        const totalMonths = state.planningMonths + (state.includeSoftLaunch ? 1 : 0);
        const startDate = new Date(state.startMonth + '-01');

        // Logic: Use passed budget, OR fetch from global store, OR fallback to base
        let targetBudget = totalBudgetOverride;

        if (targetBudget === undefined) {
          // Try to pull from global store if available
          try {
            targetBudget = useMediaPlanStore.getState().totalBudget;
          } catch (e) {
            console.warn('Could not access MediaPlanStore', e);
          }
        }

        // Fallback to internal settings if still 0 or undefined
        if (!targetBudget) {
          targetBudget = state.globalSettings.baseMonthlyBudget * totalMonths;
        }

        const budgets = calculateDistribution(
          state.progressionPattern,
          targetBudget,
          totalMonths,
          { ...state.patternParams, growthRate: state.globalSettings.growthRate }
        );

        const newMonths: MonthData[] = [];
        for (let i = 0; i < totalMonths; i++) {
          const isSoftLaunch = state.includeSoftLaunch && i === 0;
          newMonths.push(createMonth(i, startDate, isSoftLaunch, budgets[i], DEFAULT_CHANNELS));
        }

        set({ months: newMonths });
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
        set(state => ({
          months: state.months.map(m =>
            m.id === monthId ? { ...m, ...updates } : m
          ),
        }));
      },

      updateMonthChannel: (monthId, channelId, updates) => {
        set(state => ({
          months: state.months.map(m =>
            m.id === monthId
              ? {
                ...m,
                useGlobalChannels: false,
                channels: m.channels.map(ch =>
                  ch.channelId === channelId ? { ...ch, ...updates } : ch
                ),
              }
              : m
          ),
        }));
      },

      copyFromPreviousMonth: (monthId) => {
        const state = get();
        const monthIndex = state.months.findIndex(m => m.id === monthId);
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
        set(state => ({
          months: state.months.map(m =>
            m.id === monthId
              ? {
                ...m,
                spendMultiplier: null,
                cpmOverride: null,
                ctrBump: null,
                channels: JSON.parse(JSON.stringify(DEFAULT_CHANNELS)),
                useGlobalChannels: true,
              }
              : m
          ),
        }));
      },

      applyToRemainingMonths: (fromMonthId) => {
        const state = get();
        const fromIndex = state.months.findIndex(m => m.id === fromMonthId);
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
          })
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
        };

        set(s => ({
          scenarios: [...s.scenarios.filter(sc => sc.name !== name), scenario],
          activeScenarioId: scenario.id,
        }));
      },

      loadScenario: (id) => {
        const scenario = get().scenarios.find(s => s.id === id);
        if (!scenario) return;

        set({
          includeSoftLaunch: scenario.includeSoftLaunch,
          planningMonths: scenario.planningMonths,
          startMonth: scenario.startMonth,
          progressionPattern: scenario.progressionPattern,
          patternParams: { ...scenario.patternParams },
          globalSettings: { ...scenario.globalSettings },
          months: JSON.parse(JSON.stringify(scenario.months)),
          activeScenarioId: id,
        });
      },

      deleteScenario: (id) => {
        set(state => ({
          scenarios: state.scenarios.filter(s => s.id !== id),
          activeScenarioId: state.activeScenarioId === id ? null : state.activeScenarioId,
          comparisonScenarioId: state.comparisonScenarioId === id ? null : state.comparisonScenarioId,
        }));
      },

      cloneScenario: (id, newName) => {
        const scenario = get().scenarios.find(s => s.id === id);
        if (!scenario) return;

        const cloned: PlanScenario = {
          ...JSON.parse(JSON.stringify(scenario)),
          id: `scenario-${Date.now()}`,
          name: newName,
          createdAt: new Date(),
        };

        set(s => ({ scenarios: [...s.scenarios, cloned] }));
      },

      setActiveScenario: (id) => set({ activeScenarioId: id }),
      setComparisonScenario: (id) => set({ comparisonScenarioId: id }),

      // Optimization
      setOptimizationGoal: (goal) => set({ optimizationGoal: goal }),
      setRiskLevel: (level) => set({ riskLevel: level }),
      setConstraints: (updates) => set(s => ({
        constraints: { ...s.constraints, ...updates },
      })),

      runOptimization: async () => {
        set({ isOptimizing: true, optimizationResults: [] });

        // Simulate optimization with different patterns
        const state = get();
        const patterns: ProgressionPattern[] = ['linear', 'exponential', 'aggressive-launch', 'flat', 'step'];
        const results: OptimizationResult[] = [];

        // We need a baseline total budget to optimize against? 
        // Or assume use current base * months?
        const baseTotal = state.globalSettings.baseMonthlyBudget * state.months.length;

        for (const pattern of patterns) {
          const budgets = calculateDistribution(
            pattern,
            baseTotal,
            state.months.length,
            { growthRate: state.globalSettings.growthRate }
          );

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
              score = metrics.totals.breakEvenMonth !== null ? (12 - metrics.totals.breakEvenMonth) * 10 : 0;
              break;
            default:
              score = (metrics.totals.avgRoas * 20) + (metrics.totals.netProfit / 5000);
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
      setPdfSections: (sections) => set(s => ({
        pdfSections: { ...s.pdfSections, ...sections },
      })),
      setUserNotes: (notes) => set({ userNotes: notes }),

      // Reset
      resetPlan: () => {
        set({
          includeSoftLaunch: true,
          planningMonths: 6,
          startMonth: new Date().toISOString().slice(0, 7),
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
      name: 'multi-month-plan-store',
      partialize: (state) => ({
        includeSoftLaunch: state.includeSoftLaunch,
        planningMonths: state.planningMonths,
        startMonth: state.startMonth,
        progressionPattern: state.progressionPattern,
        patternParams: state.patternParams,
        globalSettings: state.globalSettings,
        months: state.months,
        scenarios: state.scenarios,
        pdfSections: state.pdfSections,
        userNotes: state.userNotes,
      }),
    }
  )
);

// ========== SELECTORS ==========

export function useMultiMonthMetrics() {
  const { months, globalSettings } = useMultiMonthStore();
  return calculatePlanMetrics(months, globalSettings);
}

export function useScenarioMetrics(scenarioId: string | null) {
  const { scenarios, globalSettings } = useMultiMonthStore();
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) return null;
  return calculatePlanMetrics(scenario.months, scenario.globalSettings);
}
