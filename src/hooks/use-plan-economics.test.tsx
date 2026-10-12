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
