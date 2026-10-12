import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { SummaryCards } from './SummaryCards';
import { WIZARD_MIN_BUDGET } from '@/lib/wizard-budget';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SummaryCards', () => {
  it('labels the headline ROAS as lifetime so it is not read against the month-1 loss', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <CurrencyProvider>
          <SummaryCards
            totalBudget={5000}
            blendedCpa={24}
            totalConversions={208}
            projectedRevenue={35800}
            blendedRoas={7.16}
          />
        </CurrencyProvider>
      );
    });
    expect(container.textContent).toContain('7.2x lifetime ROAS (cohort)');
  });

  it('keeps the 5000 minimum wizard budget', () => {
    expect(WIZARD_MIN_BUDGET).toBe(5000);
  });
});
