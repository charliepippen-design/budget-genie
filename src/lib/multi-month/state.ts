import type {
  ChannelMonthConfig,
  GlobalPlanSettings,
  MonthData,
  OptimizationConstraints,
  OptimizationGoal,
  OptimizationResult,
  PlanScenario,
  ProgressionPattern,
  RiskLevel,
} from './types';

export interface MultiMonthState {
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
  /** True once the user edits a month by hand; plan changes then stop regenerating months. */
  monthsCustomized: boolean;

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
  updateMonthChannel: (
    monthId: string,
    channelId: string,
    updates: Partial<ChannelMonthConfig>
  ) => void;
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
