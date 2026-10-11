// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectNumberSources, findUnsourcedNumbers } from '../../api/_number-guard';

const un = (reply: string, sources: Array<number | string> = []) => findUnsourcedNumbers(reply, sources).unsourced;

describe('number guard: sourced numbers', () => {
  it.each([
    ['EN thousands with currency', 'Budget is €25,000 per month', [25000]],
    ['EN decimals', 'ROAS of 3.45 expected', [3.45]],
    ['IT thousands', 'Il budget è 25.000 al mese', [25000]],
    ['IT decimals', 'Un CPA di 12,5 euro', [12.5]],
    ['IT thousands and decimals', 'Spesa di 1.234,5', [1234.5]],
    ['EN thousands and decimals', 'Spend of 1,234.5', [1234.5]],
    ['percent matches plain number', 'Meta gets 12.5% of budget', [12.5]],
    ['percent matches share', 'Meta gets 25% of budget', [0.25]],
    ['share matches percent', 'Share is 0.4', [40]],
    ['k suffix', 'About 25k per month', [25000]],
    ['M suffix', 'Total of 1.2M', [1200000]],
    ['source written as k', 'Budget 25000', ['€25k']],
    ['rounding relative', 'Roughly 10,030 clicks', [10000]],
    ['rounding absolute', 'CPA of 48', [47.6]],
    ['dollar sign', 'Spend $5,000', ['$5,000']],
    ['pound sign', 'Spend £5,000', [5000]],
    ['trailing euro sign', 'Spesa di 1.500 €', [1500]],
    ['numbers in source text', 'Budget 80000', ['I have 80.000 euro to spend']],
    ['ambiguous 1.234 as thousand', 'Total 1.234', [1234]],
    ['ambiguous 1,234 as decimal', 'Rate 1,234', [1.234]],
  ])('%s', (_name, reply, sources) => {
    expect(un(reply, sources as Array<number | string>)).toEqual([]);
  });
});

describe('number guard: unsourced numbers', () => {
  it('flags a figure with no source', () => {
    expect(un('You will get 98765 leads', [25000])).toEqual(['98765']);
  });

  it('flags a currency figure', () => {
    expect(un('Expect €4,200 profit', [25000])).toEqual(['€4,200']);
  });

  it('flags a percent', () => {
    expect(un('CTR will be 7.3%', [12, 25])).toEqual(['7.3%']);
  });

  it('flags k figures', () => {
    expect(un('Revenue around 300k', [25000])).toEqual(['300k']);
  });

  it('flags beyond the relative tolerance', () => {
    expect(un('About 10,200 clicks', [10000])).toEqual(['10,200']);
  });

  it('flags small decimals that do not match', () => {
    expect(un('ROAS of 4.8', [3.2])).toEqual(['4.8']);
  });

  it('returns every unsourced token in order', () => {
    expect(un('Get 555 leads and 777 sales', [])).toEqual(['555', '777']);
  });

  it('flags the same number once per occurrence', () => {
    expect(un('Get 555 or 555', [])).toEqual(['555', '555']);
  });

  it('flags a percent with a small integer', () => {
    expect(un('Only 5% of users', [])).toEqual(['5%']);
  });
});

describe('number guard: ignored tokens', () => {
  it.each([
    ['small integers', 'We have 3 channels and 10 options'],
    ['years', 'Plan for 2026 and 1999 and 2100'],
    ['ordinals', 'The 1st, 2nd and 15th channel'],
    ['list markers', '1. Meta\n2. Google\n12. TikTok'],
    ['small multiplier', 'Roughly 3x better'],
    ['ids with letters', 'Use plan q3 or h12'],
    ['no numbers', 'Nothing to see here'],
    ['empty reply', ''],
  ])('%s', (_name, reply) => {
    expect(un(reply)).toEqual([]);
  });

  it('does not ignore integers above 10', () => {
    expect(un('We have 11 channels')).toEqual(['11']);
  });

  it('does not ignore 4-digit numbers outside the year range', () => {
    expect(un('Spend 2500 now')).toEqual(['2500']);
    expect(un('Spend 1989 now')).toEqual(['1989']);
  });
});

describe('collectNumberSources', () => {
  it('walks plan, brief, tool results and user messages only', () => {
    const sources = collectNumberSources(
      { plan: { channels: [{ budget: 12000, name: 'Meta 4500' }] }, brief: { monthlyBudget: 30000 }, catalog: [{ cpa: 777 }] },
      [
        { role: 'user', text: 'I have 80.000 euro' },
        { role: 'assistant', text: 'You will get 999 leads' },
        { role: 'tool', results: [{ response: { total: 41234, warnings: ['cap at 1,500'] } }] },
      ]
    );
    const reply = 'Meta 12000, total 30000, 80000, 41234, 1500';
    expect(un(reply, sources)).toEqual([]);
    expect(un('Catalog says 777 and 999', sources)).toEqual(['777', '999']);
  });

  it('handles missing context', () => {
    expect(collectNumberSources(undefined, [])).toEqual([]);
  });
});
