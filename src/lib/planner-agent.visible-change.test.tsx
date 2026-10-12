import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { computePlanSnapshot, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { applyPlannerToolCall } from '@/lib/planner-agent';
import { generatePlan } from '@/lib/plan-generator';
import { marketsToGeoSelection } from '@/lib/geo-market-data';
import { PLAN_KEY, PRE_APPLY_BACKUP_KEY } from '@/lib/crash-recovery';
import { UndoAiChangeButton } from '@/components/planner/UndoAiChangeButton';
import { ToolCard } from '@/components/planner/PlannerChat';
import { CurrencyProvider } from '@/contexts/CurrencyContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const headline = () => computePlanSnapshot(useMediaPlanStore.getState()).blended;
const update = (args: Record<string, unknown>) => applyPlannerToolCall({ id: 'c', name: 'update_brief', args });

beforeEach(async () => {
  localStorage.clear();
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry: 'ecommerce', monthlyBudget: 40000, markets: ['DE'] }));
  localStorage.removeItem(PRE_APPLY_BACKUP_KEY);
  await tick();
});

const renderCard = (name: string, response: Record<string, unknown>) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() =>
    root.render(
      <CurrencyProvider>
        <ToolCard name={name} response={response} />
      </CurrencyProvider>
    )
  );
  return { container, unmount: () => act(() => root.unmount()) };
};

describe('(a) the AI market split reaches the engine fields', () => {
  it('weights the tier mix by the requested split', () => {
    const geo = marketsToGeoSelection(['US', 'FR', 'NG'], { US: 60, FR: 30, NG: 10 });
    expect(geo.activeGeos).toEqual([]);
    expect(geo.activeTiers).toEqual({ tier1: 60, tier2: 30, tier3: 10 });
  });

  it('update_brief with a split changes tiers and the headline; a different split changes them again', async () => {
    update({ markets: ['US', 'FR', 'NG'], marketSplit: { US: 80, FR: 10, NG: 10 } });
    await tick();
    expect(useMediaPlanStore.getState().activeTiers).toEqual({ tier1: 80, tier2: 10, tier3: 10 });
    const firstRevenue = headline().projectedRevenue;

    update({ marketSplit: { US: 10, FR: 10, NG: 80 } });
    expect(useMediaPlanStore.getState().activeTiers).toEqual({ tier1: 10, tier2: 10, tier3: 80 });
    expect(headline().projectedRevenue).not.toBeCloseTo(firstRevenue, 2);
  });

  it('drops the weights of markets that are no longer targeted', () => {
    update({ markets: ['US', 'FR'], marketSplit: { US: 70, FR: 30 } });
    update({ markets: ['US', 'NG'] });
    expect(useMediaPlanStore.getState().brief!.marketSplit).toEqual({ US: 70 });
  });

  it('reports changed=false and "No changes applied" when nothing effectively changed', () => {
    update({ monthlyBudget: 55000 });
    const res = update({ monthlyBudget: 55000 });
    expect(res.changed).toBe(false);

    const { container, unmount } = renderCard('update_brief', res);
    expect(container.textContent).toContain('No changes applied');
    expect(container.textContent).not.toContain('Plan rebuilt');
    unmount();
  });
});

describe('(b) the result card shows a before/after diff', () => {
  it('lists budget, revenue, ROAS and markets with before and after values', () => {
    const res = update({ monthlyBudget: 90000, markets: ['US', 'FR'] });
    expect(res.changed).toBe(true);
    const diff = res.diff as { before: { totalBudget: number; revenue: number }; after: { totalBudget: number; revenue: number } };
    expect(diff.before.totalBudget).toBe(40000);
    expect(diff.after.totalBudget).toBe(90000);
    expect(diff.after.revenue).not.toBe(diff.before.revenue);

    const { container, unmount } = renderCard('update_brief', res);
    const text = container.querySelector('[data-testid="plan-diff"]')!.textContent!;
    for (const label of ['Budget', 'Revenue', 'ROAS', 'Markets']) expect(text).toContain(label);
    expect(text).toContain('→');
    expect(text).toContain('US, FR');
    expect(container.textContent).toContain('Plan rebuilt');
    unmount();
  });
});

describe('(c) Undo AI change only for AI snapshots that differ from the plan', () => {
  const mount = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<UndoAiChangeButton />));
    return { container, root };
  };

  it('is hidden for a stale untagged backup and for a wizard apply', () => {
    localStorage.setItem(PRE_APPLY_BACKUP_KEY, JSON.stringify({ savedAt: 'old', plan: localStorage.getItem(PLAN_KEY) }));
    const { container, root } = mount();
    expect(container.textContent).toBe('');

    localStorage.removeItem(PRE_APPLY_BACKUP_KEY);
    act(() => useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry: 'ecommerce', monthlyBudget: 30000 })));
    expect(localStorage.getItem(PRE_APPLY_BACKUP_KEY)).toBeNull();
    expect(container.textContent).toBe('');
    act(() => root.unmount());
  });

  it('AI apply tags the snapshot with source and timestamp; undo restores different numbers', () => {
    const { container, root } = mount();
    const before = headline();
    const budgetBefore = useMediaPlanStore.getState().totalBudget;

    act(() => {
      update({ monthlyBudget: 120000, markets: ['US', 'NG'], marketSplit: { US: 50, NG: 50 } });
    });
    const backup = JSON.parse(localStorage.getItem(PRE_APPLY_BACKUP_KEY)!);
    expect(backup.source).toBe('ai');
    expect(Number.isNaN(Date.parse(backup.savedAt))).toBe(false);

    const changed = headline();
    expect(changed.projectedRevenue).not.toBeCloseTo(before.projectedRevenue, 2);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Undo AI change'))!;
    expect(button).toBeTruthy();

    act(() => button.click());
    const restored = headline();
    expect(useMediaPlanStore.getState().totalBudget).toBe(budgetBefore);
    expect(restored.projectedRevenue).toBeCloseTo(before.projectedRevenue, 2);
    expect(restored.projectedRevenue).not.toBeCloseTo(changed.projectedRevenue, 2);
    expect(container.textContent).toBe('');
    act(() => root.unmount());
  });

  it('a no-op AI call keeps the earlier undo snapshot', async () => {
    update({ monthlyBudget: 61000 });
    await tick();
    const first = localStorage.getItem(PRE_APPLY_BACKUP_KEY);
    update({ monthlyBudget: 61000 });
    await tick();
    expect(localStorage.getItem(PRE_APPLY_BACKUP_KEY)).toBe(first);
  });
});
