import { describe, expect, it } from 'vitest';
import { buildCsvContent } from '@/lib/export-service';

describe('buildCsvContent', () => {
  it('includes summary rows and channel rows', () => {
    const csv = buildCsvContent(
      [
        {
          name: 'Paid Search',
          category: 'Paid Search',
          allocationPct: 50,
          family: 'paid_media',
          buyingModel: 'CPM',
          metrics: {
            spend: 1000,
            impressions: 200000,
            clicks: 3000,
            conversions: 120,
            cpa: 8.3,
            revenue: 4000,
            roas: 4,
            effectivePrice: 5,
            effectiveCtr: 1.5,
            effectiveCr: 4,
          },
        },
      ] as never,
      1000,
      {
        totalSpend: 1000,
        totalConversions: 120,
        blendedCpa: 8.3,
        projectedRevenue: 4000,
        blendedRoas: 4,
      },
      {
        currencySymbol: '$',
        formatCurrency: (value) => `$${value}`,
      }
    );

    expect(csv).toContain('Channel,Family,Buying Model');
    expect(csv).toContain('Paid Search');
    expect(csv).toContain('"Total Budget","$1000"');
    expect(csv).toContain('"Blended ROAS","4.00x"');
  });
});
