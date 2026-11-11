import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { OverBudgetBannerView, type OverBudgetInfo } from './OverBudgetBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(info: OverBudgetInfo) {
  const container = document.createElement('div');
  act(() => {
    createRoot(container).render(
      <CurrencyProvider>
        <OverBudgetBannerView info={info} />
      </CurrencyProvider>
    );
  });
  return container;
}

// N-7: the header shows a visible warning when fixed fees exceed the budget.
describe('OverBudgetBannerView (N-7)', () => {
  it('warns with the fixed total and the overrun', () => {
    const el = render({ overBudget: true, overBudgetBy: 5000, fixedSpend: 15000, totalBudget: 10000 });
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Over budget');
    expect(alert?.textContent).toContain('€15,000');
    expect(alert?.textContent).toContain('€5,000');
    expect(alert?.textContent).toContain('€10,000');
  });

  it('renders nothing within budget', () => {
    expect(render({ overBudget: false, overBudgetBy: 0, fixedSpend: 2000, totalBudget: 10000 }).innerHTML).toBe('');
  });
});
