import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CurrencyProvider, formatMoney } from '@/contexts/CurrencyContext';
import { IGAMING_SUBVERTICAL_PRESETS } from '@/lib/igaming-revenue-model';
import { useOnboardingDraftStore, type WizardDraft } from '@/store/useOnboardingDraftStore';
import { byText, cleanup, click, mount } from '@/test/mount';
import { OnboardWizard } from './OnboardWizard';

const draft = () => useOnboardingDraftStore.getState().draft;
const setDraft = (patch: Partial<WizardDraft>) =>
  useOnboardingDraftStore.getState().setDraft((d) => ({ ...d, ...patch }));

const render = () =>
  mount(
    <MemoryRouter>
      <CurrencyProvider>
        <OnboardWizard />
      </CurrencyProvider>
    </MemoryRouter>
  );

function typeInto(input: HTMLInputElement, value: string) {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const exactInput = (el: HTMLElement) =>
  el.querySelector<HTMLInputElement>('input[aria-label="Exact monthly budget"]')!;

describe('OnboardWizard', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingDraftStore.getState().reset();
  });
  afterEach(cleanup);

  it('market tiles stay selected after the first click', async () => {
    setDraft({ step: 5, budget: 20000, vertical: 'igaming', goal: 'maintain' });
    const el = await render();
    await click(byText(el, 'button', /Germany/));
    expect(draft().geos).toEqual(['DE']);
    expect(byText(el, 'button', /Germany/)?.getAttribute('aria-pressed')).toBe('true');
    await click(byText(el, 'button', /Canada/));
    expect(draft().geos).toEqual(['DE', 'CA']);
    await click(byText(el, 'button', /Germany/));
    expect(draft().geos).toEqual(['CA']);
  });

  it('picking a band prefills its lower bound in an editable exact field', async () => {
    const el = await render();
    await click(byText(el, '[role="button"]', /Growing/));
    expect(draft().budget).toBe(20000);
    expect(exactInput(el).value).toBe('20000');
    expect(el.textContent).toContain('Starting at the bottom of the Growing range');

    await typeInto(exactInput(el), '32500');
    expect(draft().budget).toBe(32500);
  });

  it('blocks Continue for an out-of-range exact budget', async () => {
    const el = await render();
    await click(byText(el, '[role="button"]', /Getting Started/));
    await typeInto(exactInput(el), '100');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(byText(el, 'button', /Continue/)?.hasAttribute('disabled')).toBe(true);
  });

  it('the last step confirms the exact budget in the plan currency', async () => {
    setDraft({ step: 6, budget: 32500, vertical: 'saas', goal: 'maintain' });
    const el = await render();
    expect(el.querySelector('[data-testid="wizard-budget-summary"]')?.textContent).toBe(
      `Monthly budget: ${formatMoney(32500, 'EUR')}`
    );
  });

  it('iGaming presets show player value in the plan currency, never a hardcoded $', async () => {
    setDraft({ step: 3, budget: 20000, vertical: 'igaming' });
    const el = await render();
    const casino = IGAMING_SUBVERTICAL_PRESETS.casino;
    expect(el.textContent).toContain(`Player Value: ${formatMoney(casino.playerValue, 'EUR')}`);
    expect(el.textContent).not.toContain('$');
  });
});
