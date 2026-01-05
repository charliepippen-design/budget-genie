import { useState, useCallback, useMemo } from 'react';
import { Channel, ChannelCategory, calculateChannelMetrics, calculateBlendedMetrics, CalculatedMetrics } from '@/lib/mediaplan-data';

// Default channels from the original data
const DEFAULT_CHANNELS: Channel[] = [
  // SEO & Content
  { id: 'seo-tech', name: 'SEO - Tech Audit & On-Page', category: 'seo', baseSpend: 500, basePercentage: 0, cpm: 2.5, ctr: 0.8, estimatedRoas: 3.2 },
  { id: 'seo-content', name: 'SEO - Content Production', category: 'seo', baseSpend: 1500, basePercentage: 0, cpm: 1.8, ctr: 1.2, estimatedRoas: 4.5 },
  { id: 'seo-backlinks', name: 'SEO - Backlinks / Guest Posts', category: 'seo', baseSpend: 1000, basePercentage: 0, cpm: 3.5, ctr: 0.5, estimatedRoas: 2.8 },
  // Paid Media
  { id: 'paid-native', name: 'Paid - Native Ads (Adult/Crypto)', category: 'paid', baseSpend: 2500, basePercentage: 0, cpm: 4.2, ctr: 0.35, estimatedRoas: 1.8 },
  { id: 'paid-push', name: 'Paid - Push Notifications', category: 'paid', baseSpend: 1500, basePercentage: 0, cpm: 1.2, ctr: 2.5, estimatedRoas: 2.2 },
  { id: 'paid-programmatic', name: 'Paid - Programmatic / Display', category: 'paid', baseSpend: 1000, basePercentage: 0, cpm: 5.5, ctr: 0.15, estimatedRoas: 1.5 },
  { id: 'paid-retargeting', name: 'Paid - Retargeting (Pixel)', category: 'paid', baseSpend: 500, basePercentage: 0, cpm: 8.0, ctr: 1.8, estimatedRoas: 4.2 },
  // Affiliates
  { id: 'affiliate-listing', name: 'Affiliate - Listing Fees (Fixed)', category: 'affiliate', baseSpend: 1000, basePercentage: 0, cpm: 15.0, ctr: 3.5, estimatedRoas: 2.0 },
  { id: 'affiliate-cpa', name: 'Affiliate - CPA Commissions', category: 'affiliate', baseSpend: 8500, basePercentage: 0, cpm: 25.0, ctr: 4.2, estimatedRoas: 3.5 },
  // Influencers
  { id: 'influencer-retainers', name: 'Influencer - Monthly Retainers', category: 'influencer', baseSpend: 2000, basePercentage: 0, cpm: 12.0, ctr: 1.5, estimatedRoas: 2.5 },
  { id: 'influencer-funds', name: 'Influencer - Play Funds (Bal)', category: 'influencer', baseSpend: 1500, basePercentage: 0, cpm: 10.0, ctr: 2.0, estimatedRoas: 3.0 },
];

// Calculate base percentages
function initializeChannels(channels: Channel[]): Channel[] {
  const totalBaseSpend = channels.reduce((sum, ch) => sum + ch.baseSpend, 0);
  return channels.map((ch) => ({
    ...ch,
    basePercentage: (ch.baseSpend / totalBaseSpend) * 100,
  }));
}

export interface GlobalMultipliers {
  spendMultiplier: number; // 0.8 - 2.0
  cpmOverride: number | null; // null means use individual CPMs
  ctrBump: number; // -2 to +2 (added to each channel's CTR)
  cpaTarget: number | null; // null means no target
  roasTarget: number | null; // null means no target
}

export interface ChannelWithMetrics extends Channel {
  currentPercentage: number;
  effectiveCpm: number;
  effectiveCtr: number;
  metrics: CalculatedMetrics;
  warnings: string[];
}

export interface UseMediaPlanStoreReturn {
  // Budget
  totalBudget: number;
  setTotalBudget: (value: number) => void;
  
  // Channels
  channels: Channel[];
  addChannel: (channel: Omit<Channel, 'id' | 'basePercentage'>) => void;
  updateChannel: (id: string, updates: Partial<Omit<Channel, 'id'>>) => void;
  deleteChannel: (id: string) => void;
  
  // Allocations
  channelAllocations: Record<string, number>;
  setChannelAllocation: (channelId: string, percentage: number) => void;
  normalizeAllocations: () => void;
  
  // Global Multipliers
  globalMultipliers: GlobalMultipliers;
  setGlobalMultipliers: (updates: Partial<GlobalMultipliers>) => void;
  resetGlobalMultipliers: () => void;
  
  // Computed
  channelsWithMetrics: ChannelWithMetrics[];
  blendedMetrics: ReturnType<typeof calculateBlendedMetrics>;
  categoryTotals: Record<string, { spend: number; percentage: number }>;
  
  // Reset
  resetAll: () => void;
  
  // Presets
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;
  presets: string[];
}

const DEFAULT_MULTIPLIERS: GlobalMultipliers = {
  spendMultiplier: 1.0,
  cpmOverride: null,
  ctrBump: 0,
  cpaTarget: null,
  roasTarget: null,
};

const DEFAULT_BUDGET = 50000;
const MIN_BUDGET = 10000;
const MAX_BUDGET = 1000000;

const PRESETS_KEY = 'mediaplan-presets';

interface SavedPreset {
  name: string;
  totalBudget: number;
  channels: Channel[];
  channelAllocations: Record<string, number>;
  globalMultipliers: GlobalMultipliers;
}

function loadPresets(): SavedPreset[] {
  try {
    const data = localStorage.getItem(PRESETS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function savePresets(presets: SavedPreset[]): void {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export function useMediaPlanStore(): UseMediaPlanStoreReturn {
  const [totalBudget, setTotalBudgetState] = useState(DEFAULT_BUDGET);
  const [channels, setChannels] = useState<Channel[]>(() => initializeChannels([...DEFAULT_CHANNELS]));
  const [channelAllocations, setChannelAllocations] = useState<Record<string, number>>(() => {
    const allocations: Record<string, number> = {};
    const initialized = initializeChannels([...DEFAULT_CHANNELS]);
    initialized.forEach((ch) => {
      allocations[ch.id] = ch.basePercentage;
    });
    return allocations;
  });
  const [globalMultipliers, setGlobalMultipliersState] = useState<GlobalMultipliers>(DEFAULT_MULTIPLIERS);
  const [presetsState, setPresetsState] = useState<string[]>(() => loadPresets().map(p => p.name));

  // Set budget with validation
  const setTotalBudget = useCallback((value: number) => {
    setTotalBudgetState(Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, value)));
  }, []);

  // Add channel
  const addChannel = useCallback((channel: Omit<Channel, 'id' | 'basePercentage'>) => {
    const id = `channel-${Date.now()}`;
    const newChannel: Channel = {
      ...channel,
      id,
      basePercentage: 0,
    };
    
    setChannels((prev) => {
      const updated = [...prev, newChannel];
      // Recalculate base percentages
      const total = updated.reduce((sum, ch) => sum + ch.baseSpend, 0);
      return updated.map((ch) => ({
        ...ch,
        basePercentage: (ch.baseSpend / total) * 100,
      }));
    });
    
    // Add allocation for new channel (default to 5%)
    setChannelAllocations((prev) => {
      const currentTotal = Object.values(prev).reduce((sum, v) => sum + v, 0);
      const newAllocation = 5;
      const scaleFactor = (currentTotal - newAllocation) / currentTotal;
      
      const normalized: Record<string, number> = {};
      Object.entries(prev).forEach(([key, value]) => {
        normalized[key] = value * scaleFactor;
      });
      normalized[id] = newAllocation;
      
      return normalized;
    });
  }, []);

  // Update channel
  const updateChannel = useCallback((id: string, updates: Partial<Omit<Channel, 'id'>>) => {
    setChannels((prev) => 
      prev.map((ch) => (ch.id === id ? { ...ch, ...updates } : ch))
    );
  }, []);

  // Delete channel
  const deleteChannel = useCallback((id: string) => {
    setChannels((prev) => {
      const filtered = prev.filter((ch) => ch.id !== id);
      // Recalculate base percentages
      const total = filtered.reduce((sum, ch) => sum + ch.baseSpend, 0);
      return filtered.map((ch) => ({
        ...ch,
        basePercentage: total > 0 ? (ch.baseSpend / total) * 100 : 0,
      }));
    });
    
    // Remove allocation and normalize
    setChannelAllocations((prev) => {
      const { [id]: removed, ...rest } = prev;
      const total = Object.values(rest).reduce((sum, v) => sum + v, 0);
      if (total === 0) return rest;
      
      const normalized: Record<string, number> = {};
      Object.entries(rest).forEach(([key, value]) => {
        normalized[key] = (value / total) * 100;
      });
      return normalized;
    });
  }, []);

  // Set channel allocation
  const setChannelAllocation = useCallback((channelId: string, percentage: number) => {
    setChannelAllocations((prev) => ({
      ...prev,
      [channelId]: Math.max(0, Math.min(100, percentage)),
    }));
  }, []);

  // Normalize allocations to 100%
  const normalizeAllocations = useCallback(() => {
    const total = Object.values(channelAllocations).reduce((sum, v) => sum + v, 0);
    if (total === 0) return;
    
    const normalized: Record<string, number> = {};
    Object.entries(channelAllocations).forEach(([key, value]) => {
      normalized[key] = (value / total) * 100;
    });
    setChannelAllocations(normalized);
  }, [channelAllocations]);

  // Set global multipliers
  const setGlobalMultipliers = useCallback((updates: Partial<GlobalMultipliers>) => {
    setGlobalMultipliersState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Reset global multipliers
  const resetGlobalMultipliers = useCallback(() => {
    setGlobalMultipliersState(DEFAULT_MULTIPLIERS);
  }, []);

  // Calculate metrics for each channel with multipliers applied
  const channelsWithMetrics = useMemo((): ChannelWithMetrics[] => {
    return channels.map((channel) => {
      const currentPercentage = channelAllocations[channel.id] ?? channel.basePercentage;
      const baseSpend = (currentPercentage / 100) * totalBudget;
      const spend = baseSpend * globalMultipliers.spendMultiplier;
      
      const effectiveCpm = globalMultipliers.cpmOverride ?? channel.cpm ?? 5;
      const effectiveCtr = Math.max(0, (channel.ctr ?? 1) + globalMultipliers.ctrBump);
      
      // Calculate metrics with effective values
      const impressions = (spend / effectiveCpm) * 1000;
      const clicks = impressions * (effectiveCtr / 100);
      const conversionRate = 0.025;
      const conversions = clicks * conversionRate;
      const cpa = conversions > 0 ? spend / conversions : null;
      const revenue = spend * (channel.estimatedRoas ?? 2);
      const roas = channel.estimatedRoas ?? 2;

      // Warnings
      const warnings: string[] = [];
      if (globalMultipliers.cpaTarget && cpa && cpa > globalMultipliers.cpaTarget) {
        warnings.push(`CPA €${cpa.toFixed(0)} exceeds target €${globalMultipliers.cpaTarget}`);
      }
      if (globalMultipliers.roasTarget && roas < globalMultipliers.roasTarget) {
        warnings.push(`ROAS ${roas.toFixed(1)}x below target ${globalMultipliers.roasTarget}x`);
      }

      return {
        ...channel,
        currentPercentage,
        effectiveCpm,
        effectiveCtr,
        metrics: {
          spend,
          impressions,
          clicks,
          conversions,
          cpa,
          revenue,
          roas,
        },
        warnings,
      };
    });
  }, [channels, channelAllocations, totalBudget, globalMultipliers]);

  // Calculate blended metrics
  const blendedMetrics = useMemo(() => {
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    channelsWithMetrics.forEach((ch) => {
      totalSpend += ch.metrics.spend;
      totalImpressions += ch.metrics.impressions;
      totalClicks += ch.metrics.clicks;
      totalConversions += ch.metrics.conversions;
      totalRevenue += ch.metrics.revenue;
    });

    const blendedCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
    const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    return {
      totalSpend,
      totalImpressions,
      totalClicks,
      totalConversions,
      blendedCpa,
      projectedRevenue: totalRevenue,
      blendedRoas,
    };
  }, [channelsWithMetrics]);

  // Calculate category totals
  const categoryTotals = useMemo(() => {
    const totals: Record<string, { spend: number; percentage: number }> = {};
    
    channelsWithMetrics.forEach((ch) => {
      if (!totals[ch.category]) {
        totals[ch.category] = { spend: 0, percentage: 0 };
      }
      totals[ch.category].spend += ch.metrics.spend;
      totals[ch.category].percentage += ch.currentPercentage;
    });

    return totals;
  }, [channelsWithMetrics]);

  // Reset all
  const resetAll = useCallback(() => {
    const initialized = initializeChannels([...DEFAULT_CHANNELS]);
    setChannels(initialized);
    setTotalBudgetState(DEFAULT_BUDGET);
    setGlobalMultipliersState(DEFAULT_MULTIPLIERS);
    
    const allocations: Record<string, number> = {};
    initialized.forEach((ch) => {
      allocations[ch.id] = ch.basePercentage;
    });
    setChannelAllocations(allocations);
  }, []);

  // Save preset
  const savePreset = useCallback((name: string) => {
    const presets = loadPresets();
    const newPreset: SavedPreset = {
      name,
      totalBudget,
      channels: [...channels],
      channelAllocations: { ...channelAllocations },
      globalMultipliers: { ...globalMultipliers },
    };
    
    const filtered = presets.filter(p => p.name !== name);
    savePresets([...filtered, newPreset]);
    setPresetsState(loadPresets().map(p => p.name));
  }, [totalBudget, channels, channelAllocations, globalMultipliers]);

  // Load preset
  const loadPreset = useCallback((name: string) => {
    const presets = loadPresets();
    const preset = presets.find(p => p.name === name);
    if (!preset) return;
    
    setTotalBudgetState(preset.totalBudget);
    setChannels(preset.channels);
    setChannelAllocations(preset.channelAllocations);
    setGlobalMultipliersState(preset.globalMultipliers);
  }, []);

  // Delete preset
  const deletePreset = useCallback((name: string) => {
    const presets = loadPresets();
    savePresets(presets.filter(p => p.name !== name));
    setPresetsState(loadPresets().map(p => p.name));
  }, []);

  return {
    totalBudget,
    setTotalBudget,
    channels,
    addChannel,
    updateChannel,
    deleteChannel,
    channelAllocations,
    setChannelAllocation,
    normalizeAllocations,
    globalMultipliers,
    setGlobalMultipliers,
    resetGlobalMultipliers,
    channelsWithMetrics,
    blendedMetrics,
    categoryTotals,
    resetAll,
    savePreset,
    loadPreset,
    deletePreset,
    presets: presetsState,
  };
}
