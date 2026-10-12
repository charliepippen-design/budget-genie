import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { computePlanSnapshot, selectMarketSplit, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { applyPlannerToolCall } from '@/lib/planner-agent';
import { generatePlan } from '@/lib/plan-generator';
import { PLAN_KEY, PRE_APPLY_BACKUP_KEY } from '@/lib/crash-recovery';
import { UndoAiChangeButton } from '@/components/planner/UndoAiChangeButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const headline = () => computePlanSnapshot(useMediaPlanStore.getState()).blended;
const update = (args: Record<string, unknown>) => applyPlannerToolCall({ id: 'c', name: 'update_brief', args });

beforeEach(async () => {
  localStorage.clear();
  vi.clearAllMocks();
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry: 'ecommerce', monthlyBudget: 40000, markets: ['DE'] }));
  localStorage.removeItem(PRE_APPLY_BACKUP_KEY);
  await tick();
});

describe('AI tool changes reach the dashboard selectors', () => {
  it('headline budget, revenue, ROAS and markets follow the rebuilt plan', () => {
    // Leftovers from the previous plan that used to survive a rebuild.
    useMediaPlanStore.setState({
      geoOverrides: { Germany: { cpa: 1 } } as never,
      ghostProjectedRevenue: 999,
      isBudgetDragging: true,
      budgetDragBaselineRevenue: 5,
      budgetDragBaselineRoas: 5,
    });

    update({ monthlyBudget: 90000, markets: ['US', 'FR'] });

    const s = useMediaPlanStore.getState();
    const plan = generatePlan(s.brief!);
    const expected = computePlanSnapshot({
      totalBudget: plan.totalBudget,
      channels: plan.channels,
      globalMultipliers: { ...s.globalMultipliers, ...plan.multipliers },
      activeGeos: plan.geo.activeGeos,
      activeTiers: plan.geo.activeTiers,
      geoOverrides: {},
    }).blended;
    expect(s.totalBudget).toBeGreaterThan(40000);
    expect(headline().projectedRevenue).toBeCloseTo(expected.projectedRevenue, 2);
    expect(headline().blendedRoas).toBeCloseTo(expected.blendedRoas, 4);
    expect(s.geoOverrides).toEqual({});
    expect(s.ghostProjectedRevenue).toBeNull();
    expect(s.isBudgetDragging).toBe(false);
    expect(s.budgetDragBaselineRevenue).toBeNull();
    // US/FR are not in the iGaming geo list, so activeGeos is empty: the split must still name them.
    expect(selectMarketSplit(s).markets).toEqual(['US', 'FR']);
  });

  it('stale geo overrides no longer change the new plan numbers', () => {
    useMediaPlanStore.setState({ geoOverrides: { Germany: { cpa: 1 } } as never });
    update({ markets: ['DE', 'CA'] });
    const clean = computePlanSnapshot({ ...useMediaPlanStore.getState(), geoOverrides: {} }).blended;
    expect(headline().projectedRevenue).toBeCloseTo(clean.projectedRevenue, 6);
  });
});

describe('pre-apply snapshot for every AI change', () => {
  it('adjust_channel snapshots the plan first', () => {
    const before = localStorage.getItem(PLAN_KEY);
    const id = useMediaPlanStore.getState().channels.find((c) => c.tier !== 'fixed')!.id;
    applyPlannerToolCall({ id: 'c', name: 'adjust_channel', args: { channelId: id, action: 'set_share', sharePct: 50 } });
    expect(JSON.parse(localStorage.getItem(PRE_APPLY_BACKUP_KEY)!).plan).toBe(before);
  });

  it('several tool calls in one turn share one snapshot (undo reverts the whole turn)', async () => {
    const before = localStorage.getItem(PLAN_KEY);
    update({ monthlyBudget: 70000 });
    const id = useMediaPlanStore.getState().channels.find((c) => c.tier !== 'fixed')!.id;
    applyPlannerToolCall({ id: 'c2', name: 'adjust_channel', args: { channelId: id, action: 'lock' } });
    expect(JSON.parse(localStorage.getItem(PRE_APPLY_BACKUP_KEY)!).plan).toBe(before);
    await tick();
  });
});

describe('Undo AI change button', () => {
  it('is hidden without a snapshot, restores the previous plan exactly, toasts and hides', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<UndoAiChangeButton />));
    expect(container.textContent).toBe('');

    const prev = useMediaPlanStore.getState();
    const prevPlan = { totalBudget: prev.totalBudget, channels: prev.channels, activeGeos: prev.activeGeos, brief: prev.brief };
    const prevHeadline = headline();

    act(() => {
      update({ monthlyBudget: 120000, markets: ['US'] });
    });
    expect(useMediaPlanStore.getState().totalBudget).not.toBe(prev.totalBudget);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Undo AI change'))!;
    expect(button).toBeTruthy();

    act(() => button.click());

    const now = useMediaPlanStore.getState();
    expect({ totalBudget: now.totalBudget, channels: now.channels, activeGeos: now.activeGeos, brief: now.brief }).toEqual(prevPlan);
    expect(headline()).toEqual(prevHeadline);
    expect(toast.success).toHaveBeenCalledWith('AI change undone');
    expect(localStorage.getItem(PRE_APPLY_BACKUP_KEY)).toBeNull();
    expect(container.textContent).toBe('');
    act(() => root.unmount());
    container.remove();
  });
});
