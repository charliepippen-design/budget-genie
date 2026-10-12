import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, cleanup, mount } from '@/test/mount';

const signOut = vi.fn(async () => undefined);
vi.mock('@clerk/clerk-react', () => ({
  useClerk: () => ({ signOut, openUserProfile: vi.fn() }),
  useUser: () => ({
    user: {
      fullName: 'Ada Lovelace',
      firstName: 'Ada',
      primaryEmailAddress: { emailAddress: 'ada@example.com' },
      publicMetadata: {},
      reload: async () => undefined,
    },
  }),
}));
vi.mock('@/hooks/use-payment-status', () => ({
  usePaymentStatus: () => ({ hasActivePayment: false }),
}));

import { AccountMenu } from './AccountMenu';
import Settings from '@/pages/Settings';

beforeEach(() => signOut.mockClear());
afterEach(cleanup);

describe('AccountMenu', () => {
  it('shows the user and signs out to "/"', async () => {
    const el = await mount(<AccountMenu isDark />);
    const trigger = el.querySelector('button[aria-label="Open account menu"]') as HTMLElement;
    expect(trigger).toBeTruthy();
    // Radix opens on pointerdown or keyboard; Enter works under jsdom.
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(document.body.textContent).toContain('ada@example.com');
    expect(document.body.textContent).toContain('Ada Lovelace');
    const item = byText(document.body, '[role="menuitem"]', 'Sign out') as HTMLElement;
    expect(item).toBeTruthy();
    await act(async () => item.click());
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/' });
  });
});

describe('Settings', () => {
  it('has a Sign out button that signs out', async () => {
    const el = await mount(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    const btn = byText(el, 'button', 'Sign out') as HTMLElement;
    expect(btn).toBeTruthy();
    await act(async () => btn.click());
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/' });
  });
});
