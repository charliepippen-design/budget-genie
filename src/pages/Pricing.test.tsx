import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, mount } from '@/test/mount';

const clerk = vi.hoisted(() => ({ signedIn: true, publicMetadata: {} as Record<string, unknown> }));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: clerk.signedIn }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: clerk.signedIn,
    user: clerk.signedIn
      ? { primaryEmailAddress: { emailAddress: 'customer@example.com' }, publicMetadata: clerk.publicMetadata }
      : null,
  }),
}));

import Pricing from './Pricing';

const renderPricing = () =>
  mount(
    <MemoryRouter initialEntries={['/pricing']}>
      <Routes>
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/app" element={<p>app page</p>} />
        <Route path="/sign-up" element={<p>sign-up page</p>} />
      </Routes>
    </MemoryRouter>
  );

const planButtons = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].map((b) => `${b.textContent}${b.disabled ? ' (disabled)' : ''}`);

afterEach(async () => {
  await cleanup();
  clerk.signedIn = true;
  clerk.publicMetadata = {};
});

describe('Pricing', () => {
  it('still sends signed-out visitors to sign-up', async () => {
    clerk.signedIn = false;
    const el = await renderPricing();
    expect(el.textContent).toBe('sign-up page');
  });

  it('shows the plans to a signed-in paying customer instead of redirecting to the app', async () => {
    clerk.publicMetadata = { payment_status: true, subscription_tier: 'enterprise' };
    const el = await renderPricing();
    expect(el.textContent).toContain('Choose Your Plan');
    expect(planButtons(el)).toEqual(['Included in your plan (disabled)', 'Current plan (disabled)']);
    expect(el.querySelector('a[href="/app"]')?.textContent).toBe('Back to my plan');
  });

  it('offers a Pro customer only Enterprise', async () => {
    clerk.publicMetadata = { payment_status: true, subscription_tier: 'pro' };
    const el = await renderPricing();
    expect(planButtons(el)).toEqual(['Current plan (disabled)', 'Get Enterprise']);
  });

  it('offers a signed-in free user both plans', async () => {
    const el = await renderPricing();
    expect(planButtons(el)).toEqual(['Get Pro', 'Get Enterprise']);
  });
});
