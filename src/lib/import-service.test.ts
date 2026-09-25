import { describe, expect, it } from 'vitest';
import { convertToMonthData, detectStructure } from '@/lib/import-service';

const run = (rows: string[][]) => {
  const detected = detectStructure(rows, 'plan.csv');
  return { detected, result: convertToMonthData(detected.parsedMonths, detected.channelMappings) };
};

describe('import-service', () => {
  it('reads European number formats', () => {
    const { detected } = run([
      ['Month', 'Budget'],
      ['2026-01', '€20.000,00'],
      ['2026-02', '22.500'],
      ['2026-03', '1.234,5'],
    ]);
    expect(detected.parsedMonths.map((m) => m.budget)).toEqual([20000, 22500, 1234.5]);
  });

  it('keeps the file months instead of relabelling them to today', () => {
    const { result } = run([
      ['Month', 'Budget'],
      ['Jan 2026', '10000'],
      ['Feb 2026', '11000'],
      ['Mar 2026', '12000'],
    ]);
    expect(result.startMonth).toBe('2026-01');
  });

  it('"Monthly Budget" is the budget column, and Retargeting is a channel not a budget', () => {
    const { detected } = run([
      ['Month', 'Monthly Budget', 'Retargeting'],
      ['2026-01', '10000', '1000'],
      ['2026-02', '12000', '1500'],
    ]);
    expect(detected.parsedMonths.map((m) => m.budget)).toEqual([10000, 12000]);
  });

  it('recognises common platform names', () => {
    const { detected } = run([
      ['Month', 'Google Ads', 'Meta Ads', 'TikTok'],
      ['2026-01', '5000', '3000', '1000'],
    ]);
    const names = detected.channelMappings.map((m) => m.targetChannelName);
    expect(names).toEqual(expect.arrayContaining(['Google Search', 'Meta Ads', 'TikTok Ads']));
  });

  it('does not crash on an empty file', () => {
    expect(() => run([])).not.toThrow();
  });
});
