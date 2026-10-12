import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import { StrategicSummary } from './StrategicSummary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const props = {
  channels: [
    { name: 'Google Ads', spend: 6000 },
    { name: 'Meta', spend: 3000 },
    { name: 'Affiliates', spend: 1000 },
  ],
  totalBudget: 10000,
  blendedCpa: 50,
  blendedRoas: 2.5,
  projectedRevenue: 25000,
  geos: ['DE'],
  revenueMetric: 'Revenue',
  format: (n: number) => `$${n}`,
};

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  act(() => createRoot(container).render(el));
  return container;
}

describe('StrategicSummary (no AI narrative)', () => {
  it('renders deterministic text, not a skeleton', () => {
    const c = renderInto(<StrategicSummary {...props} />);
    expect(c.textContent).toContain('Google Ads (60%), Meta (30%), Affiliates (10%)');
    expect(c.textContent).toContain('blended cost per customer is $50');
    expect(c.textContent).toContain('The main market is DE');
    expect(c.textContent).toContain('Not AI-generated');
    expect(c.querySelector('.animate-pulse')).toBeNull();
  });

  it('handles an empty plan', () => {
    const c = renderInto(<StrategicSummary {...props} channels={[]} blendedCpa={null} geos={[]} />);
    expect(c.textContent).toContain('0 channels');
    expect(c.textContent).toContain('global reach');
  });
});
