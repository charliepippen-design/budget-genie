import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Channel,
  CHANNELS,
  BUDGET_PRESETS,
  BudgetPresetKey,
  calculateChannelMetrics,
  calculateBlendedMetrics,
  CalculatedMetrics,
} from '@/lib/mediaplan-data';

export interface ChannelWithMetrics extends Channel {
  currentPercentage: number;
  metrics: CalculatedMetrics;
}

export interface UseBudgetCalculatorReturn {
  totalBudget: number;
  setTotalBudget: (value: number) => void;
  budgetPreset: BudgetPresetKey;
  setBudgetPreset: (preset: BudgetPresetKey) => void;
  channelAllocations: Record<string, number>;
  setChannelAllocation: (channelId: string, percentage: number) => void;
  resetAllocations: () => void;
  normalizeAllocations: () => void;
  channelsWithMetrics: ChannelWithMetrics[];
  blendedMetrics: ReturnType<typeof calculateBlendedMetrics>;
  categoryTotals: Record<string, { spend: number; percentage: number }>;
}

const DEFAULT_BUDGET = 50000;
const MIN_BUDGET = 10000;
const MAX_BUDGET = 500000;

export function useBudgetCalculator(): UseBudgetCalculatorReturn {
  const [totalBudget, setTotalBudgetState] = useState(DEFAULT_BUDGET);
  const [budgetPreset, setBudgetPresetState] = useState<BudgetPresetKey>('balanced');
  const [channelAllocations, setChannelAllocations] = useState<Record<string, number>>(() => {
    // Initialize with base percentages
    const allocations: Record<string, number> = {};
    CHANNELS.forEach((ch) => {
      allocations[ch.id] = ch.basePercentage;
    });
    return allocations;
  });

  // Set budget with validation
  const setTotalBudget = useCallback((value: number) => {
    setTotalBudgetState(Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, value)));
  }, []);

  // Apply preset multipliers when preset changes
  const setBudgetPreset = useCallback((preset: BudgetPresetKey) => {
    setBudgetPresetState(preset);
    
    if (preset === 'custom') return;

    const presetConfig = BUDGET_PRESETS[preset];
    const newAllocations: Record<string, number> = {};
    
    // Apply multipliers
    CHANNELS.forEach((ch) => {
      const multiplier = presetConfig.multipliers[ch.category];
      newAllocations[ch.id] = ch.basePercentage * multiplier;
    });

    // Normalize to 100%
    const total = Object.values(newAllocations).reduce((sum, v) => sum + v, 0);
    Object.keys(newAllocations).forEach((key) => {
      newAllocations[key] = (newAllocations[key] / total) * 100;
    });

    setChannelAllocations(newAllocations);
  }, []);

  // Set individual channel allocation
  const setChannelAllocation = useCallback((channelId: string, percentage: number) => {
    setChannelAllocations((prev) => ({
      ...prev,
      [channelId]: Math.max(0, Math.min(100, percentage)),
    }));
    // Switch to custom when manually adjusting
    setBudgetPresetState('custom');
  }, []);

  // Reset to base percentages
  const resetAllocations = useCallback(() => {
    const allocations: Record<string, number> = {};
    CHANNELS.forEach((ch) => {
      allocations[ch.id] = ch.basePercentage;
    });
    setChannelAllocations(allocations);
    setBudgetPresetState('balanced');
  }, []);

  // Normalize allocations to sum to 100%
  const normalizeAllocations = useCallback(() => {
    const total = Object.values(channelAllocations).reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      resetAllocations();
      return;
    }
    
    const normalized: Record<string, number> = {};
    Object.entries(channelAllocations).forEach(([key, value]) => {
      normalized[key] = (value / total) * 100;
    });
    setChannelAllocations(normalized);
  }, [channelAllocations, resetAllocations]);

  // Calculate metrics for each channel
  const channelsWithMetrics = useMemo((): ChannelWithMetrics[] => {
    return CHANNELS.map((channel) => {
      const currentPercentage = channelAllocations[channel.id] ?? channel.basePercentage;
      const spend = (currentPercentage / 100) * totalBudget;
      const metrics = calculateChannelMetrics(channel, spend);

      return {
        ...channel,
        currentPercentage,
        metrics,
      };
    });
  }, [channelAllocations, totalBudget]);

  // Calculate blended metrics
  const blendedMetrics = useMemo(() => {
    return calculateBlendedMetrics(CHANNELS, channelAllocations, totalBudget);
  }, [channelAllocations, totalBudget]);

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

  return {
    totalBudget,
    setTotalBudget,
    budgetPreset,
    setBudgetPreset,
    channelAllocations,
    setChannelAllocation,
    resetAllocations,
    normalizeAllocations,
    channelsWithMetrics,
    blendedMetrics,
    categoryTotals,
  };
}
