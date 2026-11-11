import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiCommandBar } from '@/components/planner/AiCommandBar';
import { computePlanResult } from '@/engine';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { usePlannerPromptStore } from '@/store/usePlannerPromptStore';
import { CurrencyProvider, formatMoney } from '@/contexts/CurrencyContext';
import { buildAiSuggestions } from '@/lib/ai-suggestions';
import { generatePlan } from '@/lib/plan-generator';
import { cleanup, click, mount } from '@/test/mount';

const Bar = () => (
  <CurrencyProvider>
    <AiCommandBar />
  </CurrencyProvider>
);

const type = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
const submitForm = (el: HTMLElement) =>
  act(async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
const queue = () => usePlannerPromptStore.getState().queue;

beforeEach(() => {
  localStorage.clear();
  usePlannerPromptStore.setState({ queue: [] });
  useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry: 'ecommerce', monthlyBudget: 25000 }));
});

afterEach(cleanup);

describe('AiCommandBar', () => {
  it('submits the typed text to the planner, clears the input and says it was sent', async () => {
    const el = await mount(<Bar />);
    const input = el.querySelector('input')!;
    const send = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(input.placeholder).toBe('Ask the AI to change your plan…');
    expect(send.disabled).toBe(true);
    expect(el.querySelector('[role="status"]')!.textContent).toBe('');

    await type(input, '  Cut display by half  ');
    expect(send.disabled).toBe(false);
    await submitForm(el);

    expect(queue()).toEqual(['Cut display by half']);
    expect(input.value).toBe('');
    expect(el.querySelector('[role="status"]')!.textContent).toBe('Sent to the AI planner →');
  });

  it('does not submit an empty input', async () => {
    const el = await mount(<Bar />);
    await type(el.querySelector('input')!, '   ');
    await submitForm(el);
    expect(queue()).toEqual([]);
  });

  it('shows the chips computed from the live plan and sends the prompt of the one clicked', async () => {
    const el = await mount(<Bar />);
    const expected = buildAiSuggestions(
      computePlanResult(useMediaPlanStore.getState()),
      { conversionPlural: 'Orders', costPerConversion: 'Cost per Order' },
      (v) => formatMoney(v, 'EUR')
    );
    const chips = [...el.querySelectorAll<HTMLButtonElement>('button[data-suggestion]')];
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.map((c) => c.textContent)).toEqual(expected.map((s) => s.label));

    const explain = el.querySelector('button[data-suggestion="explain"]');
    await click(explain);
    expect(queue()).toEqual([expected.find((s) => s.id === 'explain')!.prompt]);
    expect(el.querySelector('[role="status"]')!.textContent).toBe('Sent to the AI planner →');
  });

  it('recomputes the chips when the plan changes', async () => {
    const el = await mount(<Bar />);
    const labels = () => [...el.querySelectorAll('button[data-suggestion]')].map((c) => c.textContent);
    expect(labels()).toContain('Lower my cost per order');
    await act(async () => {
      useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry: 'igaming', monthlyBudget: 60000 }));
    });
    expect(labels()).toContain('Lower my cost per FTD');
  });
});
