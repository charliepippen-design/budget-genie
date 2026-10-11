// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  churnEffectFor,
  computeSandboxChannel,
  resolveBaselineCpa,
} from '../components/dashboard/ltv-sandbox-calc';

const NO_ADJUSTMENT = { spendPct: 0, cpaPct: 0, roasPct: 0, churnPct: 0 };

describe('sandbox CPA baseline', () => {
  it('treats cpa 0 as missing and falls back to spend / conversions', () => {
    const metrics = { spend: 1000, cpa: 0, conversions: 50, roas: 2 };
    expect(resolveBaselineCpa(metrics)).toBe(20);
    const result = computeSandboxChannel(metrics, NO_ADJUSTMENT, 0);
    expect(result.adjustedConversions).toBeCloseTo(50, 6);
  });

  it('produces no conversions when cpa 0 and no conversions to derive it from', () => {
    const metrics = { spend: 1000, cpa: 0, conversions: 0, roas: 2 };
    const result = computeSandboxChannel(metrics, NO_ADJUSTMENT, 0);
    expect(result.adjustedConversions).toBe(0);
    expect(Number.isFinite(result.adjustedConversions)).toBe(true);
  });

  it('produces no conversions when cpa is null and conversions are 0', () => {
    const metrics = { spend: 1000, cpa: null, conversions: 0, roas: 2 };
    expect(computeSandboxChannel(metrics, NO_ADJUSTMENT, 0).adjustedConversions).toBe(0);
  });

  it('keeps a positive cpa untouched', () => {
    const metrics = { spend: 1000, cpa: 25, conversions: 40, roas: 2 };
    const result = computeSandboxChannel(metrics, { ...NO_ADJUSTMENT, spendPct: 100 }, 0);
    expect(result.baselineCpa).toBe(25);
    expect(result.adjustedConversions).toBeCloseTo(80, 6);
  });
});

describe('sandbox churn effect', () => {
  it('stays within 0.8..1.125 for every reachable (clamped) input', () => {
    for (let pct = -500; pct <= 500; pct += 5) {
      const effect = churnEffectFor(pct);
      expect(effect).toBeGreaterThanOrEqual(0.8);
      expect(effect).toBeLessThanOrEqual(1.125);
    }
  });

  it('pins current values', () => {
    expect(churnEffectFor(0)).toBe(1);
    expect(churnEffectFor(80)).toBeCloseTo(0.8, 10);
    expect(churnEffectFor(-50)).toBeCloseTo(1.125, 10);
    expect(churnEffectFor(1000)).toBeCloseTo(0.8, 10);
  });
});
