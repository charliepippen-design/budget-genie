import React from 'react';
import { useMediaPlanStore, useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import type { ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import { Button } from '@/components/ui/button';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import {
  Zap,
  TrendingUp,
  Users,
  Rocket,
  Eye,
  Shield,
  FlaskConical,
  Scale,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  calculateRoasBasedAllocation,
  calculateVisibilityAllocation,
  calculateConservativeAllocation,
  calculateExperimentalAllocation,
  calculateParetoAllocation,
  calculateLowCpaAllocation,
} from '@/lib/distribution-logic';
import { optimizeBudget } from '@/lib/optimization-logic';

import { RotateCcw, SlidersHorizontal } from 'lucide-react';

interface ScenarioSidebarProps {
  totalBudget: number;
  channelAllocations: Record<string, number>;
  onLoadScenario: (scenario: { totalBudget: number }) => void;
  onReset: () => void;
  onNormalize: () => void;
}

export const ScenarioSidebar: React.FC<ScenarioSidebarProps> = ({
  totalBudget,
  channelAllocations,
  onLoadScenario,
  onReset,
  onNormalize,
}) => {
  // Use the modern store hooks
  const {
    setAllocations,
    globalMultipliers,
    setGlobalMultipliers,
    rebalanceToTargets,
    channels,
    setChannels,
    savePreset,
  } = useMediaPlanStore();
  const channelsWithMetrics = useChannelsWithMetrics();

  const handlePresetClick = (
    strategyName: string,
    calculatorFn: (channels: ChannelWithMetrics[]) => Record<string, number>
  ) => {
    try {
      const newAllocations = calculatorFn(channelsWithMetrics);
      setAllocations(newAllocations);
      toast.success(`Applied Strategy: ${strategyName}`, {
        description: 'Channel allocations have been recalculated based on live metrics.',
      });
    } catch (error: unknown) {
      console.error('Failed to apply strategy', error);
      toast.error('Strategy Failed', {
        description: error instanceof Error ? error.message : 'Could not calculate allocations.',
      });
    }
  };

  const handleOptimizeScenario = () => {
    const result = optimizeBudget(channels, totalBudget, globalMultipliers);
    if (!result.changes.boosted.length && !result.changes.slashed.length) {
      toast.info('No optimization opportunities found', {
        description: 'Set CPA/ROAS targets to generate actionable reallocations.',
      });
      return;
    }

    setChannels(result.channels);
    const scenarioName = `Optimized ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    savePreset(scenarioName);
    toast.success('Optimized Scenario Generated', {
      description: `Boosted ${result.changes.boosted.length}, reduced ${result.changes.slashed.length}, and saved as ${scenarioName}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* QUICK STRATEGIES CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" /> Smart Strategies
        </h3>

        {/* TARGET CONSTRAINTS (NEW) */}
        <div className="bg-slate-950/50 rounded-lg p-4 mb-4 border border-slate-700/50">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Target Constraints
          </div>
          <div className="space-y-4">
            {/* CPA TARGET */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Target CPA</span>
                {globalMultipliers.cpaTarget ? (
                  <span className="text-emerald-400 font-mono text-xs border border-emerald-500/30 bg-emerald-500/10 px-1.5 rounded">
                    Active: €{globalMultipliers.cpaTarget}
                  </span>
                ) : (
                  <span className="text-slate-500 text-xs">No Limit</span>
                )}
              </div>
              <input
                type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="e.g. 50"
                value={globalMultipliers.cpaTarget || ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  setGlobalMultipliers({ cpaTarget: val });
                  if (val) rebalanceToTargets();
                }}
              />
            </div>

            {/* ROAS TARGET */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Target ROAS</span>
                {globalMultipliers.roasTarget ? (
                  <span className="text-purple-400 font-mono text-xs border border-purple-500/30 bg-purple-500/10 px-1.5 rounded">
                    Active: {globalMultipliers.roasTarget}x
                  </span>
                ) : (
                  <span className="text-slate-500 text-xs">No Limit</span>
                )}
              </div>
              <input
                type="number"
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="e.g. 4.0"
                value={globalMultipliers.roasTarget || ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  setGlobalMultipliers({ roasTarget: val });
                  if (val) rebalanceToTargets();
                }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-3 border-slate-700 hover:bg-blue-900/20 hover:text-blue-400 hover:border-blue-500/50 transition-all group"
            onClick={() => handlePresetClick('Maximize ROAS', calculateRoasBasedAllocation)}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 text-blue-400 mt-0.5">
                <Rocket className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-slate-200 group-hover:text-blue-400">
                  Maximize ROAS
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                  Prioritizes efficiency (&gt;1.0 ROAS)
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-3 border-slate-700 hover:bg-purple-900/20 hover:text-purple-400 hover:border-purple-500/50 transition-all group"
            onClick={() => handlePresetClick('Max Visibility', calculateVisibilityAllocation)}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 text-purple-400 mt-0.5">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-slate-200 group-hover:text-purple-400">
                  Max Visibility
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                  80% budget to lowest CPMs
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-3 border-slate-700 hover:bg-emerald-900/20 hover:text-emerald-400 hover:border-emerald-500/50 transition-all group"
            onClick={() => handlePresetClick('Conservative', calculateConservativeAllocation)}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 mt-0.5">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-slate-200 group-hover:text-emerald-400">
                  Secure / Safe
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                  Protects Retainers & Fixed Fees
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-3 border-slate-700 hover:bg-amber-900/20 hover:text-amber-400 hover:border-amber-500/50 transition-all group"
            onClick={() => handlePresetClick('Experimental', calculateExperimentalAllocation)}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-400 mt-0.5">
                <FlaskConical className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-slate-200 group-hover:text-amber-400">
                  Sandbox Mode
                  <span
                    className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-300"
                    role="note"
                    tabIndex={0}
                    aria-label="Explain Sandbox Mode"
                    data-tooltip-id="strategy-tooltip"
                    data-tooltip-content="Sandbox Mode safely tests bold allocation ideas without manually editing each channel."
                  >
                    ?
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                  Boosts zero-spend channels
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-3 border-slate-700 hover:bg-pink-900/20 hover:text-pink-400 hover:border-pink-500/50 transition-all group"
            onClick={() => handlePresetClick('Pareto (80/20)', calculateParetoAllocation)}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10 group-hover:bg-pink-500/20 text-pink-400 mt-0.5">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-slate-200 group-hover:text-pink-400">
                  Pareto (80/20)
                  <span
                    className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-300"
                    role="note"
                    tabIndex={0}
                    aria-label="Explain Pareto Strategy"
                    data-tooltip-id="strategy-tooltip"
                    data-tooltip-content="Pareto Strategy shifts most budget to the few channels driving most results."
                  >
                    ?
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                  Focus on top converters
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-3 border-slate-700 hover:bg-cyan-900/20 hover:text-cyan-400 hover:border-cyan-500/50 transition-all group"
            onClick={() => handlePresetClick('Low CPA Hunter', calculateLowCpaAllocation)}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 group-hover:bg-cyan-500/20 text-cyan-400 mt-0.5">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-slate-200 group-hover:text-cyan-400">
                  Low CPA Hunter
                </div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                  Aggressively targets efficiency
                </div>
              </div>
            </div>
          </Button>
        </div>
      </div>

      {/* SCENARIO ACTIONS (NEW) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-400" /> Actions
        </h3>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-3 border-slate-700 hover:bg-indigo-900/20 hover:text-indigo-300 hover:border-indigo-500/50 transition-all"
            onClick={handleOptimizeScenario}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Optimize Scenario
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start text-left bg-slate-950/50 border-slate-700 hover:bg-slate-800 hover:text-white"
            onClick={onNormalize}
          >
            Make 100% (Normalize)
          </Button>

          <Button
            variant="destructive"
            className="w-full justify-start text-left bg-red-950/20 border-red-900/50 text-red-400 hover:bg-red-900/40 hover:text-red-300"
            onClick={onReset}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset All
          </Button>
        </div>
      </div>

      <ReactTooltip
        id="strategy-tooltip"
        place="top"
        className="z-50 max-w-64 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
      />
    </div>
  );
};
