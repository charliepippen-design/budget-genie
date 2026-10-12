import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { LossBannerView } from './LossBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(health: Parameters<typeof LossBannerView>[0]['health']) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <CurrencyProvider>
        <LossBannerView health={health} />
      </CurrencyProvider>
    );
  });
  return container;
}

describe('LossBannerView', () => {
  it('shows an alert for a losing plan', () => {
    const el = render({
      losesMoney: true,
      monthlyContribution: -14062,
      breakEvenCpa: 100,
      blendedCpa: 110,
    });
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('This plan loses money');
    expect(alert?.textContent).toContain('-€14,062');
    expect(alert?.textContent).toContain('Break-even cost per customer: €100 (current €110)');
  });

  it('renders nothing for a profitable or non-computable plan', () => {
    expect(
      render({ losesMoney: false, monthlyContribution: 5, breakEvenCpa: 100, blendedCpa: 90 })
        .innerHTML
    ).toBe('');
    expect(
      render({ losesMoney: false, monthlyContribution: 0, breakEvenCpa: null, blendedCpa: null })
        .innerHTML
    ).toBe('');
  });
});
