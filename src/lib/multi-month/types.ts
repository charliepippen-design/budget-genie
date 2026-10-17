import type { ChannelCategory } from '@/lib/mediaplan-data';
import type { ChannelFamily, BuyingModel, ChannelTypeConfig } from '@/types/channel';

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
  registrations?: number;
  activePlayers?: number;
  ggr?: number;
  bonus?: number;
  ngr?: number;
  grossContribution?: number;
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
  monthsCustomized?: boolean;
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
