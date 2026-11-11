import { create } from 'zustand';
import { type ChannelGroup } from '@/lib/planning-insights';

import type { ChannelSandboxAdjustment, SandboxExportSnapshot } from '@/lib/what-if/types';

// The sandbox types live with the what-if maths; re-exported so existing imports keep working.
export type {
  ChannelSandboxAdjustment,
  SandboxChannelComparison,
  SandboxExportSnapshot,
  SandboxMetricSummary,
  SandboxScenarioComparison,
} from '@/lib/what-if/types';

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
