import { toast } from 'sonner';
import type { ConfirmRequest } from '@/components/common/ConfirmDialog';
import { type ChannelData, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { marketsToGeoSelection, TIER_DEFAULTS } from '@/lib/geo-market-data';
import { IGAMING_SUBVERTICAL_PRESETS } from '@/lib/igaming-revenue-model';
import { getIndustryPack, industryToVertical } from '@/lib/industries';
import type { RefinedPlan } from '@/lib/onboarding-ai';
import type { GeneratedPlan } from '@/lib/plan-generator';
import { buildPlanReadyToast } from '@/lib/plan-ready-toast';
import { type IgamingSubvertical, type Vertical, VERTICAL_PRESETS } from '@/lib/vertical-presets';

export interface OnboardingPlanInput {
  vertical: Vertical;
  subvertical: IgamingSubvertical | null;
  budget: number;
  /** ISO country codes. */
  geos: string[];
  /** Plan from the deterministic generator; null for verticals without an industry pack. */
  generatedPlan: GeneratedPlan | null;
  /** AI-refined vertical preset, used only when there is no generated plan. */
  refinedPlan?: RefinedPlan | null;
  knownCpa?: number;
  knownLtv?: number;
}

/**
 * Writes a finished onboarding (quick start or guided wizard) to the media plan store:
 * channels, budget, markets, targets and the "onboarding done" flag.
 */
export function applyOnboardingPlan({
  vertical,
  subvertical,
  budget,
  geos,
  generatedPlan,
  refinedPlan = null,
  knownCpa,
  knownLtv,
}: OnboardingPlanInput): void {
  const store = useMediaPlanStore.getState();
  const preset = VERTICAL_PRESETS[vertical];

  store.setOnboardingVertical(vertical);
  store.setOnboardingSubvertical(subvertical);
  store.setHasCompletedOnboarding(true);
  store.setTotalBudget(budget);
  // A new onboarding plan supersedes any AI planner brief built on the old plan.
  useMediaPlanStore.setState({ brief: null, planRationale: [], planWarnings: [] });

  if (generatedPlan) {
    store.applyGeneratedPlan(generatedPlan);
  } else {
    const mappedChannels: ChannelData[] = preset.channels.map((channel) => {
      const allocationPct =
        refinedPlan?.channelAdjustments.find((adj) => adj.channelName === channel.name)?.allocationPct ??
        channel.allocationPct;
      const fixed = channel.buyingModel === 'RETAINER' || channel.buyingModel === 'FLAT_FEE';
      return {
        id: crypto.randomUUID(),
        name: channel.name,
        category: channel.category,
        family: channel.family,
        buyingModel: channel.buyingModel,
        allocationPct,
        typeConfig: {
          family: channel.family,
          buyingModel: channel.buyingModel,
          // FLAT_FEE and RETAINER channels are "fixed cost": their typeConfig.price IS
          // their monthly spend. Presets set price:0 as a placeholder; compute the actual
          // spend from the budget allocation so the pool-aware engine deducts them correctly.
          price: fixed ? Math.round((allocationPct / 100) * budget) : channel.typeConfig.price,
          secondaryPrice: channel.typeConfig.secondaryPrice ?? 0,
          baselineMetrics: {
            ctr: channel.typeConfig.baselineMetrics.ctr ?? 1,
            conversionRate: channel.typeConfig.baselineMetrics.conversionRate ?? 2.5,
            aov: channel.typeConfig.baselineMetrics.aov,
            trafficPerUnit: channel.typeConfig.baselineMetrics.trafficPerUnit,
            saturationCeiling: channel.typeConfig.baselineMetrics.saturationCeiling,
          },
        },
        tier: fixed ? 'fixed' : 'scalable',
        locked: false,
        isActive: true,
        maxSpendLimit: 0,
      };
    });
    store.setChannels(mappedChannels);
    store.normalizeAllocations();
  }

  const revenueModelDefaults =
    vertical === 'igaming' && subvertical ? IGAMING_SUBVERTICAL_PRESETS[subvertical] : null;
  // Forex and fintech have a pack but no dashboard vertical of their own: the generic
  // "other" CPA target would flag every channel, so use the pack benchmark instead.
  const industry = generatedPlan?.brief.industry;
  const defaultCpaTarget =
    industry && industryToVertical(industry) !== industry
      ? getIndustryPack(industry).benchmarks.cpa
      : preset.defaultCpaTarget;

  // Use || (not ??) so that a zero returned by the AI falls through to the preset
  // default. playerValue === 0 would make all revenue calculations return 0.
  store.setGlobalMultipliers({
    playerValue:
      knownLtv ||
      refinedPlan?.recommendedPlayerValue ||
      revenueModelDefaults?.playerValue ||
      generatedPlan?.multipliers.playerValue ||
      preset.defaultPlayerValue,
    cpaTarget: knownCpa || refinedPlan?.recommendedCpaTarget || defaultCpaTarget,
    roasTarget: refinedPlan?.recommendedRoasTarget || preset.defaultRoasTarget,
    retentionRate: revenueModelDefaults?.retentionRate,
    regToFtdCvr: revenueModelDefaults?.regToFtdCvr,
    turnoverRate: revenueModelDefaults?.turnoverRate,
    margin: revenueModelDefaults?.margin,
    bonusRate: revenueModelDefaults?.bonusRate,
    spendMultiplier: 1,
  });

  if (!generatedPlan) {
    store.clearActiveGeos();
    if (geos.length > 0) {
      const geo = marketsToGeoSelection(geos);
      useMediaPlanStore.setState({ activeGeos: geo.activeGeos, activeTiers: geo.activeTiers });
    } else {
      store.setTierAllocation('tier1', TIER_DEFAULTS.tier1);
      store.setTierAllocation('tier2', TIER_DEFAULTS.tier2);
    }
  }
}

/** The question asked before onboarding overwrites a plan the user already has. */
export function replacePlanConfirm(onConfirm: () => void): ConfirmRequest {
  return {
    title: 'Replace your current media plan?',
    description: 'Building a new plan replaces the channels and budget you have now.',
    confirmLabel: 'Replace plan',
    onConfirm,
  };
}

export function announcePlanReady(): void {
  const planReadyToast = buildPlanReadyToast();
  toast(planReadyToast.title, planReadyToast.options);
}
