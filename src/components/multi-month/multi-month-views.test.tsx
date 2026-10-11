import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MultiMonthCharts } from '@/components/multi-month/MultiMonthCharts';
import { ScenarioComparison } from '@/components/multi-month/ScenarioComparison';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { CurrencyProvider } from '@/contexts/CurrencyContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let container: HTMLDivElement;
let root: Root;

const mount = (ui: ReactNode) =>
  act(() => root.render(<CurrencyProvider>{ui}</CurrencyProvider>));

beforeEach(() => {
  localStorage.clear();
  useMultiMonthStore.setState({ months: [], scenarios: [], comparisonScenarioId: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MultiMonthCharts', () => {
  it('shows an empty state when there are no months', () => {
    mount(<MultiMonthCharts />);
    expect(container.textContent).toContain('Generate months to see charts');
  });

  it('renders the chart cards for a single month without crashing', () => {
    act(() => {
      useMultiMonthStore.setState({ planningMonths: 1, includeSoftLaunch: false });
      useMultiMonthStore.getState().generateMonths();
    });
    expect(useMultiMonthStore.getState().months).toHaveLength(1);
    mount(<MultiMonthCharts />);
    expect(container.textContent).toContain('Budget vs Revenue Trend');
    expect(container.textContent).toContain('Cumulative Profit/Loss');
    expect(container.textContent).toContain('Channel Spend Evolution');
  });
});

describe('ScenarioComparison', () => {
  it('shows an empty state when no scenarios are saved', () => {
    mount(<ScenarioComparison />);
    expect(container.textContent).toContain('Save at least one scenario');
  });

  it('prompts for a selection when scenarios exist but none is chosen', () => {
    act(() => {
      useMultiMonthStore.getState().generateMonths();
      useMultiMonthStore.getState().saveScenario('Baseline');
    });
    expect(useMultiMonthStore.getState().scenarios).toHaveLength(1);
    mount(<ScenarioComparison />);
    expect(container.textContent).toContain('Pick a saved scenario');
  });

  it('renders the comparison metrics once a scenario is selected', () => {
    act(() => {
      useMultiMonthStore.getState().generateMonths();
      useMultiMonthStore.getState().saveScenario('Baseline');
      const id = useMultiMonthStore.getState().scenarios[0].id;
      useMultiMonthStore.getState().setComparisonScenario(id);
    });
    mount(<ScenarioComparison />);
    expect(container.textContent).toContain('Total Revenue');
    expect(container.textContent).toContain('Revenue Comparison');
  });
});
