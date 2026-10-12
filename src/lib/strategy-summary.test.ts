import { describe, expect, it } from 'vitest';
import type { PlanHealth } from './plan-health';
import { buildStrategySummary, type StrategySummaryInput } from './strategy-summary';

const format = (n: number) => `€${Math.round(n).toLocaleString('en-US')}`;
const names = ['Meta', 'Google', 'TikTok', 'YouTube', 'X', 'Reddit'];

const base: StrategySummaryInput = {
  channels: names.map((name) => ({ name, spend: 20000 / 6 })),
  totalBudget: 20000,
  blendedCpa: 177.54,
  blendedRoas: 1.44,
  projectedRevenue: 28704,
  geos: ['Germany'],
  revenueMetric: 'Projected Player Value',
  format,
};

const losing: PlanHealth = {
  losesMoney: true,
  monthlyContribution: -18783,
  breakEvenCpa: 11,
  blendedCpa: 177.54,
};

describe('buildStrategySummary', () => {
  it('regression: opens with the month-1 loss and break-even, not a positive claim', () => {
    const text = buildStrategySummary({ ...base, health: losing });
    expect(text.startsWith('At these assumptions this plan loses about €18,783 per month.')).toBe(
      true
    );
    expect(text).toContain('Break-even cost per customer is €11 (current €178).');
    expect(text).toContain('that projected value does not cover the media cost');
    expect(text.indexOf('loses about')).toBeLessThan(text.indexOf('projecting €28,704'));
  });

  it('seed d2-007: summary of this plan for my boss leads with the loss', () => {
    const text = buildStrategySummary({ ...base, health: losing });
    expect(text.split('. ')[0]).toContain('loses about');
    expect(text).toContain('across 6 channels');
  });

  it('states monthly earnings when profitable', () => {
    const text = buildStrategySummary({
      ...base,
      health: {
        losesMoney: false,
        monthlyContribution: 5000,
        breakEvenCpa: 300,
        blendedCpa: 177.54,
      },
    });
    expect(text).toContain('projecting €28,704');
    expect(text).toContain('the plan earns about €5,000 per month.');
    expect(text).not.toContain('loses');
  });

  it('is unchanged legacy text without health', () => {
    const text = buildStrategySummary(base);
    expect(text.startsWith('This plan deploys €20,000 across 6 channels, projecting €28,704')).toBe(
      true
    );
    expect(text).not.toContain('per month');
  });

  it('never uses em or en dashes', () => {
    for (const health of [undefined, losing]) {
      expect(buildStrategySummary({ ...base, health })).not.toMatch(/[–—]/);
    }
  });
});
