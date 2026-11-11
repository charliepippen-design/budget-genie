import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, mount } from '@/test/mount';

const clerk = vi.hoisted(() => ({ publicMetadata: {} as Record<string, unknown> }));

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      primaryEmailAddress: { emailAddress: 'customer@example.com' },
      publicMetadata: clerk.publicMetadata,
      reload: async () => undefined,
    },
  }),
  useClerk: () => ({ signOut: async () => undefined, openUserProfile: () => undefined }),
}));

import Settings from './Settings';

const renderSettings = () =>
  mount(
    <MemoryRouter initialEntries={['/settings']}>
      <Settings />
    </MemoryRouter>
  );

afterEach(async () => {
  await cleanup();
  vi.unstubAllEnvs();
  clerk.publicMetadata = {};
});

describe('Settings billing debug card', () => {
  it('is hidden from customers in a production build', async () => {
    vi.stubEnv('DEV', false);
    clerk.publicMetadata = { payment_status: true, subscription_tier: 'enterprise' };
    const el = await renderSettings();
    expect(el.textContent).toContain('Subscription Plan');
    expect(el.textContent).not.toMatch(/Billing Sync Status|Store Tier|Metadata Tier|Sync Signal|Clerk metadata/i);
  });

  it('stays available on the dev server', async () => {
    vi.stubEnv('DEV', true);
    const el = await renderSettings();
    expect(el.textContent).toContain('Billing Sync Status');
  });
});

describe('Settings plan section', () => {
  const buttons = (el: HTMLElement) =>
    [...el.querySelectorAll('article button')].map(
      (b) => `${b.textContent}${(b as HTMLButtonElement).disabled ? ' (disabled)' : ''}`
    );

  it('offers a top-plan customer no upgrade and no way to downgrade locally', async () => {
    clerk.publicMetadata = { payment_status: true, subscription_tier: 'enterprise' };
    const el = await renderSettings();
    expect(el.textContent).toContain('Current plan: Enterprise');
    expect(buttons(el)).toEqual([
      'Included in Enterprise (disabled)',
      'Included in Enterprise (disabled)',
      'Current plan (disabled)',
    ]);
    expect(el.textContent).not.toMatch(/Continue Free|Manage Plan|Upgrade to/);
  });

  it('offers a Pro customer only the Enterprise upgrade', async () => {
    clerk.publicMetadata = { payment_status: true, subscription_tier: 'pro' };
    const el = await renderSettings();
    expect(buttons(el)).toEqual(['Included in Pro (disabled)', 'Current plan (disabled)', 'Upgrade to Enterprise']);
  });

  it('shows a free user their plan and both upgrades', async () => {
    const el = await renderSettings();
    expect(el.textContent).toContain('Current plan: Free');
    expect(buttons(el)).toEqual(['Current plan (disabled)', 'Upgrade to Pro', 'Upgrade to Enterprise']);
  });
});
