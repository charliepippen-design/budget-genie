import { beforeEach, describe, expect, it } from 'vitest';
import { useMediaPlanStore, computePlanSnapshot } from '@/hooks/use-media-plan-store';
import { calculateMonthMetrics, toMonthValue, useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { generatePlan } from '@/lib/plan-generator';

describe('multi-month follows the main plan', () => {
  beforeEach(() => {
    useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry: 'ecommerce', monthlyBudget: 40000 }));
    useMultiMonthStore.setState({ planningMonths: 3, includeSoftLaunch: false, progressionPattern: 'flat' as never });
  });

  it('total budget is monthly budget × months, with the plan channels', () => {
    useMultiMonthStore.getState().generateMonths();
    const { months } = useMultiMonthStore.getState();
    expect(months).toHaveLength(3);
    const total = months.reduce((s, m) => s + m.budget, 0);
    expect(total).toBeCloseTo(useMediaPlanStore.getState().totalBudget * 3, -1);
    const planIds = useMediaPlanStore.getState().channels.map((c) => c.id).sort();
    expect(months[0].channels.map((c) => c.channelId).sort()).toEqual(planIds);
  });

  it('a month at the plan budget reproduces the dashboard conversions and revenue', () => {
    const plan = useMediaPlanStore.getState();
    useMultiMonthStore.getState().generateMonths(plan.totalBudget * 3);
    const month = { ...useMultiMonthStore.getState().months[0], budget: plan.totalBudget };
    const m = calculateMonthMetrics(month, useMultiMonthStore.getState().globalSettings);
    const snap = computePlanSnapshot(plan).blended;
    expect(m.totalConversions).toBeCloseTo(snap.totalConversions, -1);
    expect(m.revenue).toBeCloseTo(snap.projectedRevenue, -2);
  });

  it('month values use local time', () => {
    expect(toMonthValue(new Date(2027, 0, 1))).toBe('2027-01');
  });
});
