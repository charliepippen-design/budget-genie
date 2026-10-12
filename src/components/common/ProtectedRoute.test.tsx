import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, cleanup, mount } from '@/test/mount';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ isLoaded: false, isSignedIn: false }) }));
vi.mock('@/hooks/use-payment-status', () => ({ usePaymentStatus: () => ({ hasActivePayment: false }) }));

import { ProtectedRoute } from './ProtectedRoute';

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe('ProtectedRoute while Clerk loads', () => {
  it('shows a branded loading state, then a recovery message after 10 s', async () => {
    const el = await mount(
      <MemoryRouter>
        <ProtectedRoute>
          <p>secret</p>
        </ProtectedRoute>
      </MemoryRouter>
    );
    expect(byText(el, 'p', 'MediaPlanner Pro')).toBeTruthy();
    expect(el.textContent).not.toContain('Still loading your account');

    await act(async () => {
      vi.advanceTimersByTime(9_900);
    });
    expect(el.textContent).not.toContain('Still loading your account');

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(byText(el, 'p', 'Still loading your account')).toBeTruthy();
    expect(byText(el, 'button', 'Reload')).toBeTruthy();
    expect(byText(el, 'p', /disable ad or privacy blockers/)).toBeTruthy();
    expect(el.textContent).not.toContain('secret');
  });
});
