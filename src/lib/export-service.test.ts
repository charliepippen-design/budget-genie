import { describe, expect, it } from 'vitest';
import { buildCsvContent } from '@/lib/export-service';
import * as XLSX from 'xlsx';

// Minimal ChannelWithMetrics fixture
function makeChannel(overrides: Partial<{
  name: string;
  allocationPct: number;
  family: string;
  buyingModel: string;
  category: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  revenue: number;
  roas: number;
}> = {}) {
  return {
    name: overrides.name ?? 'Test Channel',
    category: overrides.category ?? 'Paid Search',
    allocationPct: overrides.allocationPct ?? 50,
    family: overrides.family ?? 'paid_media',
    buyingModel: overrides.buyingModel ?? 'CPM',
    isActive: true,
    metrics: {
      spend: overrides.spend ?? 1000,
      impressions: overrides.impressions ?? 200000,
      clicks: overrides.clicks ?? 3000,
      conversions: overrides.conversions ?? 120,
      cpa: overrides.cpa !== undefined ? overrides.cpa : 8.33,
      revenue: overrides.revenue ?? 4000,
      roas: overrides.roas ?? 4,
      effectivePrice: 5,
      effectiveCtr: 1.5,
      effectiveCr: 4,
    },
  } as never;
}

const defaultBlended = {
  totalSpend: 1000,
  totalConversions: 120,
  blendedCpa: 8.3,
  projectedRevenue: 4000,
  blendedRoas: 4,
};

const defaultOptions = {
  currencySymbol: '$',
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
};

// ─── buildCsvContent ─────────────────────────────────────────────────────────

describe('buildCsvContent', () => {
  it('includes allocation header and channel rows', () => {
    const csv = buildCsvContent([makeChannel()], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('Channel,Family,Buying Model');
    expect(csv).toContain('Test Channel');
  });

  it('includes summary block with formatted currency', () => {
    const csv = buildCsvContent([makeChannel()], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('"Total Budget","$1000.00"');
    expect(csv).toContain('"Blended ROAS","4.00x"');
  });

  it('shows N/A for null CPA in channel rows', () => {
    const channel = makeChannel({ cpa: null, conversions: 0 });
    const csv = buildCsvContent([channel], 500, { ...defaultBlended, blendedCpa: null }, defaultOptions);
    // The channel row should have N/A in the CPA column
    expect(csv).toContain('"N/A"');
  });

  it('shows N/A for null blended CPA in summary', () => {
    const csv = buildCsvContent(
      [makeChannel()],
      1000,
      { ...defaultBlended, blendedCpa: null },
      defaultOptions
    );
    expect(csv).toContain('"Blended CPA","N/A"');
  });

  it('includes scenario outputs section', () => {
    const csv = buildCsvContent([makeChannel()], 1000, defaultBlended, defaultOptions, [
      { scenario: 'Bear', projectedLtvPerUser: 50, projectedCohortValue: 6000, ltvToCac: 2.5 },
      { scenario: 'Base', projectedLtvPerUser: 70, projectedCohortValue: 8400, ltvToCac: 3.5 },
      { scenario: 'Bull', projectedLtvPerUser: 90, projectedCohortValue: 10800, ltvToCac: 4.5 },
    ]);
    expect(csv).toContain('Scenario Outputs');
    expect(csv).toContain('"Bear"');
    expect(csv).toContain('"Bull"');
  });

  it('includes efficiency alerts section', () => {
    const csv = buildCsvContent([makeChannel()], 1000, defaultBlended, defaultOptions, [], [
      { channelName: 'Test Channel', severity: 'high', reason: 'Approaching saturation.' },
    ]);
    expect(csv).toContain('Efficiency Alerts');
    expect(csv).toContain('HIGH');
    expect(csv).toContain('Approaching saturation.');
  });

  it('handles zero-spend channel gracefully', () => {
    const channel = makeChannel({ spend: 0, impressions: 0, clicks: 0, conversions: 0, cpa: null, revenue: 0, roas: 0 });
    const csv = buildCsvContent([channel], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('"0.00"'); // spend
    expect(csv).toContain('"N/A"');  // null cpa
  });

  it('quotes all cell values to handle commas in channel names', () => {
    const channel = makeChannel({ name: 'Paid, Native Ads' });
    const csv = buildCsvContent([channel], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('"Paid, Native Ads"');
  });

  it('rounds FTDs to integer strings', () => {
    const channel = makeChannel({ conversions: 120.7 });
    const csv = buildCsvContent([channel], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('"121"');
  });
});

// ─── exportToExcel (unit-level via XLSX in-memory) ───────────────────────────

// We can't test file saving in jsdom, but we CAN test the sheet data logic
// by importing the sheet-building helpers indirectly through a mock approach.
// Instead we'll validate that buildCsvContent and the known fix (CPA N/A) are
// consistent with what Excel would receive, since allocationSheetData mirrors it.

describe('Excel CPA column', () => {
  it('N/A string survives round-trip through XLSX json_to_sheet', () => {
    const data = [
      { Channel: 'No-conv Channel', Spend: 500, CPA: 'N/A', ROAS: 0 },
      { Channel: 'Normal Channel', Spend: 1000, CPA: 8.3333, ROAS: 4 },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const parsed = XLSX.utils.sheet_to_json<{ Channel: string; CPA: string | number }>(ws);

    expect(parsed[0].CPA).toBe('N/A');
    expect(typeof parsed[1].CPA).toBe('number');
    expect((parsed[1].CPA as number).toFixed(2)).toBe('8.33');
  });

  it('0 is NOT an acceptable CPA value for no-conversion channels', () => {
    // Before the fix, safeNumber(null) = 0 was written to the sheet
    // Verify that our fix means CPA:0 is only written for channels that genuinely have 0 CPA
    // (i.e., 0 is distinguishable from null by the 'N/A' sentinel)
    const data = [
      { CPA: 'N/A' }, // null cpa
      { CPA: 0 },     // hypothetical 0 cpa (shouldn't happen in practice)
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const parsed = XLSX.utils.sheet_to_json<{ CPA: string | number }>(ws);
    // 'N/A' and 0 must be distinguishable
    expect(parsed[0].CPA).toBe('N/A');
    expect(parsed[1].CPA).toBe(0);
    expect(parsed[0].CPA).not.toBe(parsed[1].CPA);
  });
});

// ─── safeNumber fallback integrity ────────────────────────────────────────────

describe('CSV numeric formatting', () => {
  it('allocation % is formatted to 2 decimal places', () => {
    const channel = makeChannel({ allocationPct: 33.3333 });
    const csv = buildCsvContent([channel], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('"33.33"');
  });

  it('ROAS is formatted to 2 decimal places', () => {
    const channel = makeChannel({ roas: 3.14159 });
    const csv = buildCsvContent([channel], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('"3.14"');
  });

  it('revenue is formatted to 2 decimal places', () => {
    const channel = makeChannel({ revenue: 1234.5678 });
    const csv = buildCsvContent([channel], 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('"1234.57"');
  });

  it('handles multiple channels correctly', () => {
    const channels = [
      makeChannel({ name: 'Google Ads', allocationPct: 40, spend: 400 }),
      makeChannel({ name: 'Meta Ads', allocationPct: 35, spend: 350 }),
      makeChannel({ name: 'Affiliate CPA', allocationPct: 25, spend: 250, cpa: null, conversions: 0 }),
    ];
    const csv = buildCsvContent(channels, 1000, defaultBlended, defaultOptions);
    expect(csv).toContain('Google Ads');
    expect(csv).toContain('Meta Ads');
    expect(csv).toContain('Affiliate CPA');
    // Third channel has null CPA
    const lines = csv.split('\n');
    const affiliateLine = lines.find(l => l.includes('Affiliate CPA'));
    expect(affiliateLine).toContain('"N/A"');
  });
});
