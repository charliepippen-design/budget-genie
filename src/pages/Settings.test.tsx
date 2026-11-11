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
