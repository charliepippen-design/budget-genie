import { create } from 'zustand';
import { type ChannelGroup } from '@/lib/planning-insights';

export interface ChannelSandboxAdjustment {
  spendPct: number;
  cpaPct: number;
  roasPct: number;
  churnPct: number;
}

export interface SandboxMetricSummary {
  totalSpend: number;
  totalConversions: number;
  blendedCpa: number | null;
  blendedRoas: number;
  projectedRevenue: number;
  roiPct: number;
}

export interface SandboxChannelComparison {
  channelId: string;
  channelName: string;
  group: ChannelGroup;
  baselineSpend: number;
  adjustedSpend: number;
  baselineCpa: number;
  adjustedCpa: number;
  baselineRoas: number;
  adjustedRoas: number;
  churnPct: number;
}

export interface SandboxScenarioComparison {
  scenario: 'Bear' | 'Base' | 'Bull';
  baselineProjectedCohortValue: number;
  adjustedProjectedCohortValue: number;
  baselineLtvToCac: number;
  adjustedLtvToCac: number;
  baselineRoiPct: number;
  adjustedRoiPct: number;
}

export interface SandboxExportSnapshot {
  enabled: boolean;
  summaryText: string;
  baselineMetrics: SandboxMetricSummary;
  adjustedMetrics: SandboxMetricSummary;
  channelComparisons: SandboxChannelComparison[];
  scenarioComparisons: SandboxScenarioComparison[];
}

interface SandboxStoreState {
  sandboxEnabled: boolean;
  selectedChannelIds: string[];
  channelAdjustments: Record<string, ChannelSandboxAdjustment>;
  groupAdjustments: Record<ChannelGroup, number>;
  channelFilter: string;
  collapsedGroups: Record<ChannelGroup, boolean>;
  exportSnapshot: SandboxExportSnapshot | null;
  setSandboxEnabled: (enabled: boolean) => void;
  toggleChannelSelection: (channelId: string) => void;
  setChannelAdjustment: (
    channelId: string,
    field: keyof ChannelSandboxAdjustment,
    value: number
  ) => void;
  setGroupAdjustment: (group: ChannelGroup, value: number) => void;
  setChannelFilter: (value: string) => void;
  toggleGroupCollapsed: (group: ChannelGroup) => void;
  resetSandbox: () => void;
  setExportSnapshot: (snapshot: SandboxExportSnapshot | null) => void;
}

const DEFAULT_GROUP_ADJUSTMENTS: Record<ChannelGroup, number> = {
  organic: 0,
  paid: 0,
  affiliate: 0,
  influencer: 0,
};

const DEFAULT_COLLAPSED_GROUPS: Record<ChannelGroup, boolean> = {
  organic: false,
  paid: false,
  affiliate: false,
  influencer: false,
};

const DEFAULT_ADJUSTMENT: ChannelSandboxAdjustment = {
  spendPct: 0,
  cpaPct: 0,
  roasPct: 0,
  churnPct: 0,
};

export const useSandboxStore = create<SandboxStoreState>((set) => ({
  sandboxEnabled: false,
  selectedChannelIds: [],
  channelAdjustments: {},
  groupAdjustments: DEFAULT_GROUP_ADJUSTMENTS,
  channelFilter: '',
  collapsedGroups: DEFAULT_COLLAPSED_GROUPS,
  exportSnapshot: null,
  setSandboxEnabled: (enabled) => set({ sandboxEnabled: enabled }),
  toggleChannelSelection: (channelId) =>
    set((state) => ({
      selectedChannelIds: state.selectedChannelIds.includes(channelId)
        ? state.selectedChannelIds.filter((id) => id !== channelId)
        : [...state.selectedChannelIds, channelId],
    })),
  setChannelAdjustment: (channelId, field, value) =>
    set((state) => ({
      channelAdjustments: {
        ...state.channelAdjustments,
        [channelId]: {
          ...(state.channelAdjustments[channelId] ?? DEFAULT_ADJUSTMENT),
          [field]: Number.isFinite(value) ? value : 0,
        },
      },
    })),
  setGroupAdjustment: (group, value) =>
    set((state) => ({
      groupAdjustments: {
        ...state.groupAdjustments,
        [group]: value,
      },
    })),
  setChannelFilter: (value) => set({ channelFilter: value }),
  toggleGroupCollapsed: (group) =>
    set((state) => ({
      collapsedGroups: {
        ...state.collapsedGroups,
        [group]: !state.collapsedGroups[group],
      },
    })),
  resetSandbox: () =>
    set({
      selectedChannelIds: [],
      channelAdjustments: {},
      groupAdjustments: DEFAULT_GROUP_ADJUSTMENTS,
      channelFilter: '',
      collapsedGroups: DEFAULT_COLLAPSED_GROUPS,
    }),
  setExportSnapshot: (snapshot) => set({ exportSnapshot: snapshot }),
}));
