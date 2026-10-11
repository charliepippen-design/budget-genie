import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PAID_PLANS } from '@/lib/plans';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useUser: () => ({ user: null }),
}));
vi.mock('@/hooks/use-payment-status', () => ({ usePaymentStatus: () => ({ hasActivePayment: false }) }));

import Landing from './Landing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Landing', () => {
  it('renders the job-naming H1, three benefits and the free CTA', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      createRoot(container).render(
        <MemoryRouter>
          <Landing />
        </MemoryRouter>,
      );
    });
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('Plan your media budget across channels in minutes');
    // Responsive H1: small base size so it does not clip at 375px.
    expect(h1?.className).toMatch(/\btext-3xl\b/);
    expect(container.querySelectorAll('ul[aria-label="Benefits"] li')).toHaveLength(3);
    expect(container.textContent).toContain('Start free, no card required');
    // Brand heading stays available for the e2e heading selector.
    expect(container.querySelector('h2')?.textContent).toBe('MediaPlanner Pro');
  });
});

describe('prices', () => {
  it('Landing and Pricing never hardcode $29 or $79 and Pricing uses plans.ts', () => {
    const landing = readFileSync('src/pages/Landing.tsx', 'utf8');
    const pricing = readFileSync('src/pages/Pricing.tsx', 'utf8');
    for (const src of [landing, pricing]) {
      expect(src).not.toContain('$29');
      expect(src).not.toContain('$79');
    }
    expect(pricing).toContain('plan.priceLabel');
    expect(PAID_PLANS.map((p) => p.priceLabel)).toEqual(['$19', '$39']);
  });
});
