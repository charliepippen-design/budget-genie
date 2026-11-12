import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_STORAGE_KEY, placeholderEngine, setEngine, setEngineById } from '@/engine';
import { byText, cleanup, click, mount } from '@/test/mount';

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

describe('Settings planning engine switch', () => {
  const options = (el: HTMLElement) =>
    [...el.querySelectorAll('[data-testid="engine-switch"] [role="radio"]')].map(
      (b) => `${b.textContent}${b.getAttribute('aria-checked') === 'true' ? ' (selected)' : ''}`
    );

  it('is not rendered in a production build', async () => {
    vi.stubEnv('DEV', false);
    const el = await renderSettings();
    expect(el.querySelector('[data-testid="engine-switch"]')).toBeNull();
    expect(el.textContent).not.toMatch(/Planning engine|Response curves/i);
  });

  it('offers both engines on the dev server, with the active one selected', async () => {
    vi.stubEnv('DEV', true);
    const el = await renderSettings();
    expect(options(el)).toEqual(['Standard (selected)', 'Response curves (beta)']);
  });

  it('stores the choice and reloads; Standard removes the key', async () => {
    vi.stubEnv('DEV', true);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    try {
      const el = await renderSettings();
      await click(byText(el, '[role="radio"]', 'Response curves (beta)'));
      expect(localStorage.getItem(ENGINE_STORAGE_KEY)).toBe('response-curve');
      expect(reload).toHaveBeenCalledTimes(1);

      // After the reload the stored engine is the active one; choosing Standard clears the key.
      setEngineById('response-curve');
      await cleanup();
      const again = await renderSettings();
      expect(options(again)).toEqual(['Standard', 'Response curves (beta) (selected)']);
      await click(byText(again, '[role="radio"]', 'Standard'));
      expect(localStorage.getItem(ENGINE_STORAGE_KEY)).toBeNull();
      expect(reload).toHaveBeenCalledTimes(2);
    } finally {
      setEngine(placeholderEngine);
      localStorage.removeItem(ENGINE_STORAGE_KEY);
      vi.unstubAllGlobals();
    }
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
