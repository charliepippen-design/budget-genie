import { describe, expect, it } from 'vitest';
import { GROUP_LABELS } from '@/lib/planning-insights';
import {
  CHANNEL_GROUPS,
  SANDBOX_DEFAULT_ADJUSTMENT,
  SCENARIO_COLORS,
  SCENARIO_DOT_CLASS,
} from './constants';

describe('ltv-forecast constants', () => {
  it('keeps the default adjustment neutral', () => {
    expect(SANDBOX_DEFAULT_ADJUSTMENT).toEqual({ spendPct: 0, cpaPct: 0, roasPct: 0, churnPct: 0 });
  });

  it('lists every channel group in display order', () => {
    expect(CHANNEL_GROUPS).toEqual(['organic', 'paid', 'affiliate', 'influencer']);
    expect(CHANNEL_GROUPS.every((g) => g in GROUP_LABELS)).toBe(true);
  });

  it('defines colors and dot classes for each scenario', () => {
    expect(Object.keys(SCENARIO_COLORS)).toEqual(['Bear', 'Base', 'Bull']);
    expect(Object.keys(SCENARIO_DOT_CLASS)).toEqual(['Bear', 'Base', 'Bull']);
  });
});
