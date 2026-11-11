import { clamp } from '@/lib/ltv-model';

export interface SandboxChannelInput {
  spend: number;
  cpa: number | null;
  conversions: number;
  roas: number;
}

export interface SandboxAdjustmentInput {
  spendPct: number;
  cpaPct: number;
  roasPct: number;
  churnPct: number;
}

/**
 * Baseline CPA for a channel. A non-positive or non-finite CPA counts as missing
 * (a plain `??` would keep 0), then falls back to spend / conversions. Returns 0
 * when neither is usable, which means "no CPA available".
 */
export function resolveBaselineCpa(metrics: SandboxChannelInput): number {
  if (metrics.cpa !== null && Number.isFinite(metrics.cpa) && metrics.cpa > 0) {
    return metrics.cpa;
  }
  return metrics.conversions > 0 ? metrics.spend / metrics.conversions : 0;
}

/**
 * Churn effect multiplier applied to conversions and revenue.
 *
 * The churn adjustment is clamped to -50..80 %, and each point moves the multiplier
 * by 0.25 points, so the effect always lies in 0.8..1.125. The former 0.35 floor
 * could never trigger (it would need a churn adjustment of 260 %), so it was removed
 * as dead code. Output is identical for every reachable input.
 */
export function churnEffectFor(churnPct: number): number {
  return 1 - (clamp(churnPct, -50, 80) / 100) * 0.25;
}

export function computeSandboxChannel(
  metrics: SandboxChannelInput,
  adjustment: SandboxAdjustmentInput,
  groupDelta: number
) {
  const spendMultiplier = (1 + groupDelta / 100) * (1 + clamp(adjustment.spendPct, -80, 200) / 100);
  const adjustedSpend = Math.max(0, metrics.spend * spendMultiplier);

  const baselineCpa = resolveBaselineCpa(metrics);
  const adjustedCpa = Math.max(0.01, baselineCpa * (1 + clamp(adjustment.cpaPct, -70, 300) / 100));

  const baselineRoas = Math.max(0, metrics.roas);
  const adjustedRoas = Math.max(0, baselineRoas * (1 + clamp(adjustment.roasPct, -90, 300) / 100));

  const churnEffect = churnEffectFor(adjustment.churnPct);
  // Without a real baseline CPA the 0.01 floor is only a display value; never divide by it.
  const conversionsFromCpa = baselineCpa > 0 ? adjustedSpend / adjustedCpa : 0;
  const adjustedConversions = Math.max(0, conversionsFromCpa * churnEffect);
  const adjustedRevenue = adjustedSpend * adjustedRoas * churnEffect;

  return {
    adjustedSpend,
    baselineCpa,
    adjustedCpa,
    baselineRoas,
    adjustedRoas,
    adjustedConversions,
    adjustedRevenue,
  };
}
