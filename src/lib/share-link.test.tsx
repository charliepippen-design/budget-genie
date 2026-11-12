import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { registerAITokenGetter } from '@/lib/ai-client';
import { byText, cleanup, click, mount, tick } from '@/test/mount';
import { buildSharePayload, createShare, shareCurrentPlan } from './share-link';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => null }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { publicMetadata: { payment_status: true } } }),
}));
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: () => null,
}));

import Output from '@/pages/Output';

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const writeText = vi.fn(async (_text: string) => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  registerAITokenGetter(async () => 'session-token');
});
afterEach(async () => {
  await cleanup();
  registerAITokenGetter(undefined);
  vi.unstubAllGlobals();
});

describe('buildSharePayload', () => {
  it('keeps what the engine needs and the plan name, and nothing about the account', () => {
    const state = { ...useMediaPlanStore.getState(), projectName: '  Q1 launch  ' };
    const payload = buildSharePayload(state, 'USD');
    expect(payload.name).toBe('Q1 launch');
    expect(payload.currency).toBe('USD');
    expect(Object.keys(payload.mediaPlanState).sort()).toEqual([
      'activeGeos',
      'activeTiers',
      'channels',
      'geoOverrides',
      'globalMultipliers',
      'observedLtv',
      'onboardingVertical',
      'totalBudget',
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/subscriptionTier|userStatus|presets|"brief"/);
    expect(buildSharePayload({ ...state, projectName: ' ' }, 'USD').name).toBe('Media plan');
  });
});

describe('share link', () => {
  it('the Share link button creates a snapshot and copies its /p/ link', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json({ id: ID }));
    vi.stubGlobal('fetch', fetchMock);
    const el = await mount(
      <MemoryRouter>
        <ThemeProvider>
          <CurrencyProvider>
            <Output />
          </CurrencyProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    await click(byText(el, 'button', 'Share link'));
    await tick();

    const [url, init] = fetchMock.mock.calls.find(([u]) => u === '/api/share')!;
    expect(url).toBe('/api/share');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
    const sent = JSON.parse(String(init.body));
    expect(sent.mediaPlanState.totalBudget).toBe(useMediaPlanStore.getState().totalBudget);
    expect(sent.mediaPlanState.subscriptionTier).toBeUndefined();

    const link = `${window.location.origin}/p/${ID}`;
    expect(writeText).toHaveBeenCalledWith(link);
    expect(toast.success).toHaveBeenCalledWith(
      'Share link copied',
      expect.objectContaining({ description: expect.stringContaining(link) })
    );
    expect(toast.success.mock.calls[0][1].description).toContain('Anyone with the link can view this version');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says clearly when the link could not be created, and copies nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Share links are not configured.' }, 503)));
    expect(await shareCurrentPlan(useMediaPlanStore.getState(), 'EUR')).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Could not create the share link', {
      description: 'Share links are unavailable right now.',
    });

    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'This plan is too large to share (limit 512 KB).' }, 413)));
    await shareCurrentPlan(useMediaPlanStore.getState(), 'EUR');
    expect(toast.error).toHaveBeenLastCalledWith('Could not create the share link', {
      description: 'This plan is too large to share (limit 512 KB).',
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })));
    await shareCurrentPlan(useMediaPlanStore.getState(), 'EUR');
    expect(toast.error).toHaveBeenCalledTimes(3);
    expect(writeText).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('needs a signed-in session', async () => {
    registerAITokenGetter(async () => null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createShare(buildSharePayload(useMediaPlanStore.getState(), 'EUR'))).rejects.toThrow(
      'Sign in to share a plan.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still shows the link, with a Copy button, when the browser refuses clipboard access', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: ID })));
    writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
    const url = await shareCurrentPlan(useMediaPlanStore.getState(), 'EUR');
    expect(url).toBe(`${window.location.origin}/p/${ID}`);
    const [title, options] = toast.success.mock.calls[0];
    expect(title).toBe('Share link created');
    expect(options.description).toContain(url);
    options.action.onClick();
    expect(writeText).toHaveBeenLastCalledWith(url);
  });
});
