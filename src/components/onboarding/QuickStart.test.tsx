import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { AIError, generateJSON } from '@/lib/ai-client';
import { GOAL_BRIEFS } from '@/lib/onboarding-ai';
import Onboard from '@/pages/Onboard';
import { useOnboardingDraftStore } from '@/store/useOnboardingDraftStore';
import { byText, cleanup, click, mount, tick } from '@/test/mount';

vi.mock('@/lib/ai-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-client')>();
  return { ...actual, generateJSON: vi.fn() };
});

const mockGenerateJSON = vi.mocked(generateJSON);

const render = (url = '/onboard') =>
  mount(
    <MemoryRouter initialEntries={[url]}>
      <CurrencyProvider>
        <Routes>
          <Route path="/onboard" element={<Onboard />} />
          <Route path="/app" element={<p>Dashboard page</p>} />
        </Routes>
      </CurrencyProvider>
    </MemoryRouter>
  );

function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  return act(async () => {
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const budgetInput = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
const buildButton = (el: HTMLElement) => byText(el, 'button', /Build my plan/) as HTMLButtonElement;
const pressed = (el: HTMLElement, text: string | RegExp) => byText(el, 'button', text)?.getAttribute('aria-pressed');
const preview = (el: HTMLElement) => el.querySelector('[data-testid="plan-preview"]')!.textContent ?? '';
const aiStatus = (el: HTMLElement) => el.querySelector('[data-testid="ai-status"]')!.textContent ?? '';

async function describeAndFill(el: HTMLElement, text: string) {
  await typeInto(el.querySelector('textarea')!, text);
  await click(byText(el, 'button', 'Fill with AI'));
  await tick();
}

describe('QuickStart', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGenerateJSON.mockReset();
    useOnboardingDraftStore.getState().reset();
    useMediaPlanStore.setState({ hasCompletedOnboarding: false, brief: null });
  });
  afterEach(cleanup);

  it('builds a plan from the picked industry, budget, goal and markets, then opens the dashboard', async () => {
    const el = await render();
    expect(buildButton(el).disabled).toBe(true);
    expect(el.textContent).toContain('To build: pick an industry and enter a monthly budget.');

    await click(byText(el, 'button', /E-commerce/));
    await typeInto(budgetInput(el), '40000');
    await click(byText(el, 'button', 'Test new channels'));
    await click(byText(el, 'button', 'Germany'));
    // Spain is not among the common chips: find it with the search box.
    expect(byText(el, 'button', 'Spain')).toBeNull();
    await typeInto(el.querySelector<HTMLInputElement>('input[type="search"]')!, 'spa');
    await click(byText(el, 'button', 'Spain'));

    expect(buildButton(el).disabled).toBe(false);
    expect(preview(el)).toMatch(/\d+ channels · .+ \d+%/);
    await click(buildButton(el));

    expect(el.textContent).toContain('Dashboard page');
    expect(mockGenerateJSON).not.toHaveBeenCalled();
    const state = useMediaPlanStore.getState();
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.onboardingVertical).toBe('ecommerce');
    expect(state.brief).toMatchObject({
      industry: 'ecommerce',
      monthlyBudget: 40000,
      markets: ['DE', 'ES'],
      ...GOAL_BRIEFS.test_channels,
    });
    expect(state.channels.length).toBeGreaterThan(0);
    expect(state.totalBudget).toBeLessThanOrEqual(40000);
  });

  it('the preview reacts to the choices and a quick amount sets the budget', async () => {
    const el = await render();
    expect(preview(el)).toContain('Your plan preview appears here');
    await click(byText(el, 'button', /Software sold to businesses/));
    await click(el.querySelector('button[aria-label="Set budget to €25,000"]'));
    expect(budgetInput(el).value).toBe('25,000');
    const saas = preview(el);
    expect(saas).toMatch(/\d+ channels/);

    await click(byText(el, 'button', /iGaming/));
    expect(preview(el)).not.toBe(saas);
    expect(preview(el)).toContain('(FTD)');
  });

  it('an out-of-range budget keeps Build disabled and says what to fix', async () => {
    const el = await render();
    await click(byText(el, 'button', /iGaming/));
    await typeInto(budgetInput(el), '100');
    expect(buildButton(el).disabled).toBe(true);
    expect(el.textContent).toContain('To build: set a budget from €5,000 to €1,000,000.');
  });

  it('Fill with AI prefills the form from brief fields only and marks what it filled', async () => {
    mockGenerateJSON.mockResolvedValue({
      industry: 'igaming',
      monthlyBudget: 60000,
      markets: ['de', 'CA', 'US'],
      goal: 'maximize_revenue',
      targetCpa: 120,
      channels: [{ name: 'Invented', allocationPct: 100 }],
    });
    const el = await render();
    await describeAndFill(el, 'Online casino, 60k a month, Germany and Canada');

    expect(mockGenerateJSON.mock.calls[0][0]).toContain('Online casino, 60k a month, Germany and Canada');
    expect(pressed(el, /iGaming/)).toBe('true');
    expect(budgetInput(el).value).toBe('60,000');
    expect(pressed(el, 'More revenue per customer')).toBe('true');
    expect(pressed(el, 'Germany')).toBe('true');
    expect(pressed(el, 'Canada')).toBe('true');
    expect(aiStatus(el)).toContain('AI filled industry, budget, goal, markets, target cost.');
    // The US is not an iGaming market in this product.
    expect(aiStatus(el)).toContain('Not in our market list: US.');
    expect(el.textContent?.match(/AI filled/g)?.length).toBe(6);
    // Nothing is applied until the user builds, and the AI channel list is ignored.
    expect(useMediaPlanStore.getState().hasCompletedOnboarding).toBe(false);

    // Changing a field by hand removes its "AI filled" mark.
    await click(byText(el, 'button', 'Test new channels'));
    expect(el.textContent?.match(/AI filled/g)?.length).toBe(5);

    await click(buildButton(el));
    const state = useMediaPlanStore.getState();
    expect(state.brief).toMatchObject({ industry: 'igaming', monthlyBudget: 60000, markets: ['DE', 'CA'], targetCpa: 120 });
    expect(state.channels.some((c) => c.name === 'Invented')).toBe(false);
    expect(state.globalMultipliers.cpaTarget).toBe(120);
  });

  it('keeps the valid fields when the AI answer is partly wrong', async () => {
    mockGenerateJSON.mockResolvedValue({ industry: 'crypto', monthlyBudget: '60k', markets: ['DE'], goal: null });
    const el = await render();
    await describeAndFill(el, 'Crypto exchange in Germany');
    expect(pressed(el, 'Germany')).toBe('true');
    expect(budgetInput(el).value).toBe('');
    expect(aiStatus(el)).toContain('AI filled markets.');
  });

  it('an AI failure shows an inline message and the form still builds a plan', async () => {
    mockGenerateJSON.mockRejectedValue(new AIError('boom', undefined, 503));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await render();
    await describeAndFill(el, 'Online casino in Germany');
    expect(aiStatus(el)).toContain('The AI is not available right now. Pick the basics below instead');
    expect(aiStatus(el)).not.toContain('boom');

    await click(byText(el, 'button', /Fintech/));
    await typeInto(budgetInput(el), '30000');
    await click(buildButton(el));
    expect(el.textContent).toContain('Dashboard page');
    expect(useMediaPlanStore.getState().brief?.industry).toBe('fintech');
    // Fintech has no dashboard vertical of its own: the target comes from its pack, not from "other".
    expect(useMediaPlanStore.getState().globalMultipliers.cpaTarget).toBe(60);
    errors.mockRestore();
  });

  it('says so when the free AI allowance is used up or the answer is not usable', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGenerateJSON.mockRejectedValueOnce(new AIError('Free AI limit reached for today.', 'FREE_TIER_LIMIT', 402));
    const el = await render();
    await describeAndFill(el, 'Online casino in Germany');
    expect(aiStatus(el)).toContain('Free AI limit reached for today.');

    mockGenerateJSON.mockResolvedValueOnce(null);
    await click(byText(el, 'button', 'Fill with AI'));
    await tick();
    expect(aiStatus(el)).toContain('The AI could not find plan details in that.');
    expect(buildButton(el)).not.toBeNull();
    errors.mockRestore();
  });

  it('asks before replacing an existing plan: Cancel keeps it, Replace builds', async () => {
    useMediaPlanStore.setState({ hasCompletedOnboarding: true, brief: null });
    const el = await render();
    expect(byText(el, 'a', '← Back to my plan')).not.toBeNull();
    await click(byText(el, 'button', /Forex/));
    await typeInto(budgetInput(el), '80000');
    await click(buildButton(el));

    let dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Replace your current media plan?');
    await click(byText(dialog, 'button', 'Cancel'));
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(useMediaPlanStore.getState().brief).toBeNull();
    expect(el.textContent).not.toContain('Dashboard page');

    await click(buildButton(el));
    dialog = document.querySelector('[role="alertdialog"]')!;
    await click(byText(dialog, 'button', 'Replace plan'));
    expect(useMediaPlanStore.getState().brief?.industry).toBe('forex');
    expect(el.textContent).toContain('Dashboard page');
  });

  it('example chips fill the description', async () => {
    const el = await render();
    await click(byText(el, 'button', /Online casino, €60k/));
    expect(el.querySelector('textarea')!.value).toBe(
      'Online casino, €60k/month, Germany and Canada, more first-time depositors'
    );
  });

  it('the guided 6-step wizard stays reachable and links back', async () => {
    let el = await render();
    const link = byText(el, 'a', 'Guided setup (6 steps)') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/onboard?mode=guided');
    await click(link);
    expect(el.textContent).toContain("What's your monthly marketing budget?");
    await cleanup();

    el = await render('/onboard?mode=guided');
    expect(el.textContent).toContain("What's your monthly marketing budget?");
    await click(byText(el, 'a', 'Quick start (one screen)'));
    expect(el.textContent).toContain('Your media plan in a few clicks');
  });
});
