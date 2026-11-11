import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { cleanup, mount } from '@/test/mount';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => null }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { publicMetadata: { payment_status: true } } }),
}));
// Charts need a real layout engine; the labels under test are plain text.
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: () => null,
}));

import Output from './Output';
import Report from './Report';

const RAW_LABELS = /paid_media|seo_content|pr_brand|email_crm|FLAT_FEE|REV_SHARE|FTD/;

afterEach(cleanup);

describe('plan pages use human labels', () => {
  it.each([
    ['Output', Output],
    ['Report', Report],
  ])('%s shows no internal channel labels or iGaming terms for an eCommerce plan', async (_name, Page) => {
    useMediaPlanStore.setState({ onboardingVertical: 'ecommerce' });
    const el = await mount(
      <MemoryRouter>
        <ThemeProvider>
          <CurrencyProvider>
            <Page />
          </CurrencyProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(el.textContent).toContain('Paid Media');
    expect(el.textContent).toContain('SEO & Content');
    expect(el.textContent).not.toMatch(RAW_LABELS);
  });
});
