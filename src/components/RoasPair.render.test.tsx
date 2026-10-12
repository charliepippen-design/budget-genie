import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { generatePlan } from '@/lib/plan-generator';
import { LIFETIME_ROAS_LABEL, MONTH1_ROAS_LABEL } from '@/lib/roas-pair';
import { ForecastCard } from '@/components/dashboard/ForecastCard';
import Report from '@/pages/Report';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: () => null };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
  useMediaPlanStore
    .getState()
    .applyGeneratedPlan(
      generatePlan({ industry: 'igaming', monthlyBudget: 40000, markets: ['DE'] })
    );
});

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MemoryRouter>
        <ThemeProvider>
          <CurrencyProvider>{el}</CurrencyProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  });
  return container;
}

describe('ROAS labels', () => {
  it('dashboard forecast card shows both Lifetime and Month-1 ROAS', () => {
    const text = render(<ForecastCard />).textContent ?? '';
    expect(text).toContain(LIFETIME_ROAS_LABEL);
    expect(text).toContain(MONTH1_ROAS_LABEL);
    expect(text).not.toContain('Blended ROAS');
  });

  it('report shows both labels and no bare "return on spend"', () => {
    const text = render(<Report />).textContent ?? '';
    expect(text).toContain(LIFETIME_ROAS_LABEL);
    expect(text).toContain(MONTH1_ROAS_LABEL);
    expect(text).not.toMatch(/\d+x return on spend/);
  });
});
