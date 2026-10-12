import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useBlendedMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { usePlanEconomics } from '@/hooks/use-plan-economics';
import { computePlanHealth } from '@/lib/plan-health';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('usePlanEconomics vs plan health banner (same store)', () => {
  it('report net value equals the banner contribution with the same sign', () => {
    useMediaPlanStore.setState({ onboardingVertical: 'igaming' });
    let report = NaN;
    let banner = NaN;
    let losesMoney = false;
    function Probe() {
      const eco = usePlanEconomics();
      const blended = useBlendedMetrics();
      const s = useMediaPlanStore.getState();
      const h = computePlanHealth(blended, s.onboardingVertical, s.globalMultipliers);
      report = eco.netPnl;
      banner = h.monthlyContribution;
      losesMoney = h.losesMoney;
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    expect(Number.isFinite(report)).toBe(true);
    expect(report).toBe(banner);
    expect(losesMoney).toBe(report < 0);
  });
});

describe('usePlanEconomics payback value', () => {
  it('payback is measured against the 12-month LTV it reports, not the raw player value input', () => {
    const base = useMediaPlanStore.getState().globalMultipliers;
    useMediaPlanStore.setState({
      onboardingVertical: 'igaming',
      globalMultipliers: { ...base, playerValue: 250 },
    });
    let eco: ReturnType<typeof usePlanEconomics> | null = null;
    function Probe() {
      eco = usePlanEconomics();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    const e = eco!;
    expect(e.paybackLtvPerUser).toBeGreaterThan(0);
    // The curve terminal differs from the raw input the old "based on" label showed.
    expect(e.paybackLtvPerUser).not.toBe(250);
    // Payback month and the reported 12-month value come from the same curve.
    expect(e.ltvToCac12m).toBeCloseTo(e.paybackLtvPerUser / (e.blendedCpa ?? 1), 6);
    if (e.paybackMonths === null) expect(e.ltvToCac12m).toBeLessThan(1);
    else expect(e.ltvToCac12m).toBeGreaterThanOrEqual(1);
  });
});
